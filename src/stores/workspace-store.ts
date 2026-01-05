import { v4 as uuidv4 } from 'uuid'
import type { Workspace, TerminalInstance, AppState } from '../types'
import { AgentPresetId, getAgentPreset } from '../types/agent-presets'

type Listener = () => void

class WorkspaceStore {
  private state: AppState = {
    workspaces: [],
    activeWorkspaceId: null,
    terminals: [],
    activeTerminalId: null,
    focusedTerminalId: null
  }

  private listeners: Set<Listener> = new Set()

  getState(): AppState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach(listener => listener())
  }

  // Workspace actions
  addWorkspace(name: string, folderPath: string): Workspace {
    const workspace: Workspace = {
      id: uuidv4(),
      name,
      folderPath,
      createdAt: Date.now()
    }

    this.state = {
      ...this.state,
      workspaces: [...this.state.workspaces, workspace],
      activeWorkspaceId: workspace.id
    }

    this.notify()
    return workspace
  }

  addWorkspaceObject(workspace: Workspace): void {
    this.state = {
      ...this.state,
      workspaces: [...this.state.workspaces, workspace],
      activeWorkspaceId: workspace.id
    }

    this.notify()
  }

  updateWorkspace(id: string, updates: Partial<Workspace>): void {
    console.log('[WorkspaceStore] updateWorkspace 被調用')
    console.log('[WorkspaceStore] id:', id)
    console.log('[WorkspaceStore] updates:', updates)
    
    const workspaces = this.state.workspaces.map(ws =>
      ws.id === id ? { ...ws, ...updates } : ws
    )
    
    const updatedWorkspace = workspaces.find(ws => ws.id === id)
    console.log('[WorkspaceStore] 更新後的工作區:', {
      id: updatedWorkspace?.id,
      name: updatedWorkspace?.name,
      isSkill: updatedWorkspace?.skillConfig?.isSkill,
      skillConfig: updatedWorkspace?.skillConfig
    })

    this.state = {
      ...this.state,
      workspaces
    }

    this.notify()
    this.save()
  }

  removeWorkspace(id: string): void {
    const terminals = this.state.terminals.filter(t => t.workspaceId !== id)
    const workspaces = this.state.workspaces.filter(w => w.id !== id)

    this.state = {
      ...this.state,
      workspaces,
      terminals,
      activeWorkspaceId: this.state.activeWorkspaceId === id
        ? (workspaces[0]?.id ?? null)
        : this.state.activeWorkspaceId
    }

    this.notify()
  }

  setActiveWorkspace(id: string): void {
    if (this.state.activeWorkspaceId === id) return

    this.state = {
      ...this.state,
      activeWorkspaceId: id,
      focusedTerminalId: null
    }

    this.notify()
  }

  renameWorkspace(id: string, alias: string): void {
    this.state = {
      ...this.state,
      workspaces: this.state.workspaces.map(w =>
        w.id === id ? { ...w, alias: alias.trim() || undefined } : w
      )
    }

    this.notify()
  }

  setWorkspaceRole(id: string, role: string): void {
    this.state = {
      ...this.state,
      workspaces: this.state.workspaces.map(w =>
        w.id === id ? { ...w, role: role.trim() || undefined } : w
      )
    }

    this.notify()
    this.save()
  }

  reorderWorkspaces(workspaceIds: string[]): void {
    const workspaceMap = new Map(this.state.workspaces.map(w => [w.id, w]))
    const reordered = workspaceIds
      .map(id => workspaceMap.get(id))
      .filter((w): w is Workspace => w !== undefined)

    this.state = {
      ...this.state,
      workspaces: reordered
    }

    this.notify()
    this.save()
  }

  // Workspace environment variables
  setWorkspaceEnvVars(id: string, envVars: import('../types').EnvVariable[]): void {
    this.state = {
      ...this.state,
      workspaces: this.state.workspaces.map(w =>
        w.id === id ? { ...w, envVars } : w
      )
    }
    this.notify()
    this.save()
  }

  addWorkspaceEnvVar(id: string, envVar: import('../types').EnvVariable): void {
    const workspace = this.state.workspaces.find(w => w.id === id)
    if (!workspace) return
    const envVars = [...(workspace.envVars || []), envVar]
    this.setWorkspaceEnvVars(id, envVars)
  }

  removeWorkspaceEnvVar(id: string, key: string): void {
    const workspace = this.state.workspaces.find(w => w.id === id)
    if (!workspace) return
    const envVars = (workspace.envVars || []).filter(e => e.key !== key)
    this.setWorkspaceEnvVars(id, envVars)
  }

  updateWorkspaceEnvVar(id: string, key: string, updates: Partial<import('../types').EnvVariable>): void {
    const workspace = this.state.workspaces.find(w => w.id === id)
    if (!workspace) return
    const envVars = (workspace.envVars || []).map(e =>
      e.key === key ? { ...e, ...updates } : e
    )
    this.setWorkspaceEnvVars(id, envVars)
  }

  // Terminal actions
  addTerminal(workspaceId: string, agentPreset?: AgentPresetId): TerminalInstance {
    const workspace = this.state.workspaces.find(w => w.id === workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    const existingTerminals = this.state.terminals.filter(
      t => t.workspaceId === workspaceId && !t.agentPreset
    )

    // Get agent preset info for title
    const preset = agentPreset ? getAgentPreset(agentPreset) : null
    let title: string
    if (preset && preset.id !== 'none') {
      title = preset.name
    } else {
      // Count existing regular terminals in this workspace to get next number
      const regularTerminals = this.state.terminals.filter(
        t => t.workspaceId === workspaceId && t.type === 'terminal' && !t.agentPreset
      )
      const terminalNumber = regularTerminals.length + 1
      title = `Terminal #${terminalNumber}`
    }

    const terminal: TerminalInstance = {
      id: uuidv4(),
      workspaceId,
      type: 'terminal',
      agentPreset,
      title,
      cwd: workspace.folderPath,
      scrollbackBuffer: [],
      lastActivityTime: Date.now()
    }

    // Auto-focus if it's an agent terminal or no current focus
    const shouldFocus = (agentPreset && agentPreset !== 'none') || !this.state.focusedTerminalId

    this.state = {
      ...this.state,
      terminals: [...this.state.terminals, terminal],
      focusedTerminalId: shouldFocus ? terminal.id : this.state.focusedTerminalId
    }

    this.notify()
    this.save()
    return terminal
  }

  addOracle(workspaceId: string): TerminalInstance {
    const workspace = this.state.workspaces.find(w => w.id === workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    // Count existing oracles in this workspace to get next number
    const existingOracles = this.state.terminals.filter(
      t => t.workspaceId === workspaceId && t.type === 'oracle'
    )
    const oracleNumber = existingOracles.length + 1

    const terminal: TerminalInstance = {
      id: uuidv4(),
      workspaceId,
      type: 'oracle',
      title: `🗄️ 資料庫 #${oracleNumber}`,
      cwd: workspace.folderPath,
      scrollbackBuffer: [],
      lastActivityTime: Date.now()
    }

    this.state = {
      ...this.state,
      terminals: [...this.state.terminals, terminal],
      focusedTerminalId: terminal.id
    }

    this.notify()
    this.save()
    return terminal
  }

  addWebView(workspaceId: string, url: string = 'https://www.google.com'): TerminalInstance {
    const workspace = this.state.workspaces.find(w => w.id === workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    // Count existing webviews in this workspace to get next number
    const existingWebViews = this.state.terminals.filter(
      t => t.workspaceId === workspaceId && t.type === 'webview'
    )
    const webViewNumber = existingWebViews.length + 1

    const terminal: TerminalInstance = {
      id: uuidv4(),
      workspaceId,
      type: 'webview',
      title: `🌐 網頁 #${webViewNumber}`,
      url,
      cwd: workspace.folderPath,
      scrollbackBuffer: [],
      lastActivityTime: Date.now()
    }

    this.state = {
      ...this.state,
      terminals: [...this.state.terminals, terminal],
      focusedTerminalId: terminal.id
    }

    this.notify()
    this.save()
    return terminal
  }

  addFile(workspaceId: string): TerminalInstance {
    const workspace = this.state.workspaces.find(w => w.id === workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    // Count existing files in this workspace to get next number
    const existingFiles = this.state.terminals.filter(
      t => t.workspaceId === workspaceId && t.type === 'file'
    )
    const fileNumber = existingFiles.length + 1

    const terminal: TerminalInstance = {
      id: uuidv4(),
      workspaceId,
      type: 'file',
      title: `📁 FILE #${fileNumber}`,
      cwd: workspace.folderPath,
      scrollbackBuffer: [],
      lastActivityTime: Date.now()
    }

    this.state = {
      ...this.state,
      terminals: [...this.state.terminals, terminal],
      focusedTerminalId: terminal.id
    }

    this.notify()
    this.save()
    return terminal
  }

  addApiTester(workspaceId: string): TerminalInstance {
    const workspace = this.state.workspaces.find(w => w.id === workspaceId)
    if (!workspace) throw new Error('Workspace not found')

    // Count existing API testers in this workspace to get next number
    const existingApis = this.state.terminals.filter(
      t => t.workspaceId === workspaceId && t.type === 'api'
    )
    const apiNumber = existingApis.length + 1

    const terminal: TerminalInstance = {
      id: uuidv4(),
      workspaceId,
      type: 'api',
      title: `🔌 API #${apiNumber}`,
      cwd: workspace.folderPath,
      scrollbackBuffer: [],
      lastActivityTime: Date.now()
    }

    this.state = {
      ...this.state,
      terminals: [...this.state.terminals, terminal],
      focusedTerminalId: terminal.id
    }

    this.notify()
    this.save()
    return terminal
  }

  removeTerminal(id: string): void {
    const terminals = this.state.terminals.filter(t => t.id !== id)

    this.state = {
      ...this.state,
      terminals,
      focusedTerminalId: this.state.focusedTerminalId === id
        ? (terminals[0]?.id ?? null)
        : this.state.focusedTerminalId
    }

    this.notify()
    this.save()
  }

  renameTerminal(id: string, title: string): void {
    this.state = {
      ...this.state,
      terminals: this.state.terminals.map(t =>
        t.id === id ? { ...t, title } : t
      )
    }

    this.notify()
  }

  setFocusedTerminal(id: string | null): void {
    if (this.state.focusedTerminalId === id) return

    this.state = {
      ...this.state,
      focusedTerminalId: id
    }

    this.notify()
  }

  updateTerminalCwd(id: string, cwd: string): void {
    this.state = {
      ...this.state,
      terminals: this.state.terminals.map(t =>
        t.id === id ? { ...t, cwd } : t
      )
    }

    this.notify()
  }

  updateTerminal(id: string, updates: Partial<TerminalInstance>): void {
    this.state = {
      ...this.state,
      terminals: this.state.terminals.map(t =>
        t.id === id ? { ...t, ...updates } : t
      )
    }

    this.notify()
    this.save()
  }

  appendScrollback(id: string, data: string): void {
    this.state = {
      ...this.state,
      terminals: this.state.terminals.map(t =>
        t.id === id ? { ...t, scrollbackBuffer: [...t.scrollbackBuffer, data] } : t
      )
    }
    // Don't notify for scrollback updates to avoid re-renders
  }

  updateTerminalScrollback(id: string, lines: string[]): void {
    this.state = {
      ...this.state,
      terminals: this.state.terminals.map(t =>
        t.id === id ? { ...t, scrollbackBuffer: lines } : t
      )
    }
    // Don't notify for scrollback updates to avoid re-renders
  }

  updateChatMessages(id: string, messages: any[]): void {
    this.state = {
      ...this.state,
      terminals: this.state.terminals.map(t =>
        t.id === id && t.type === 'copilot' ? { ...t, chatMessages: messages } : t
      )
    }
    // Auto-save when chat messages are updated
    this.save()
  }

  clearScrollback(id: string): void {
    this.state = {
      ...this.state,
      terminals: this.state.terminals.map(t =>
        t.id === id ? { ...t, scrollbackBuffer: [] } : t
      )
    }

    this.notify()
  }

  // Get terminals for current workspace
  getWorkspaceTerminals(workspaceId: string): TerminalInstance[] {
    const terminals = this.state.terminals.filter(t => t.workspaceId === workspaceId)
    console.log('[WorkspaceStore] getWorkspaceTerminals for', workspaceId, ':', terminals.length, 'terminals')
    return terminals
  }

  // Get agent terminal for workspace (first agent terminal, regardless of type)
  getAgentTerminal(workspaceId: string): TerminalInstance | undefined {
    return this.state.terminals.find(
      t => t.workspaceId === workspaceId && t.agentPreset && t.agentPreset !== 'none'
    )
  }

  // Legacy compatibility - alias for getAgentTerminal
  getClaudeCodeTerminal(workspaceId: string): TerminalInstance | undefined {
    return this.getAgentTerminal(workspaceId)
  }

  getRegularTerminals(workspaceId: string): TerminalInstance[] {
    return this.state.terminals.filter(
      t => t.workspaceId === workspaceId && (!t.agentPreset || t.agentPreset === 'none')
    )
  }

  // Activity tracking
  private lastActivityNotify: number = 0

  updateTerminalActivity(id: string): void {
    const now = Date.now()
    this.state = {
      ...this.state,
      terminals: this.state.terminals.map(t =>
        t.id === id ? { ...t, lastActivityTime: now } : t
      )
    }
    // Throttle notifications to avoid excessive re-renders (max once per 500ms)
    if (now - this.lastActivityNotify > 500) {
      this.lastActivityNotify = now
      this.notify()
    }
  }

  getWorkspaceLastActivity(workspaceId: string): number | null {
    const terminals = this.getWorkspaceTerminals(workspaceId)
    const lastActivities = terminals
      .map(t => t.lastActivityTime)
      .filter((time): time is number => time !== undefined)

    return lastActivities.length > 0 ? Math.max(...lastActivities) : null
  }

  // Persistence
  async save(): Promise<void> {
    console.log('[WorkspaceStore] 開始保存到 localStorage')
    console.log('[WorkspaceStore] workspaces 數量:', this.state.workspaces.length)
    
    // 記錄技能工作區
    const skillWorkspaces = this.state.workspaces.filter(ws => ws.skillConfig?.isSkill)
    console.log('[WorkspaceStore] 技能工作區數量:', skillWorkspaces.length)
    if (skillWorkspaces.length > 0) {
      console.log('[WorkspaceStore] 技能工作區列表:', skillWorkspaces.map(ws => ({
        name: ws.name,
        isSkill: ws.skillConfig?.isSkill,
        description: ws.skillConfig?.description
      })))
    }
    
    const data = JSON.stringify({
      workspaces: this.state.workspaces,
      activeWorkspaceId: this.state.activeWorkspaceId,
      terminals: this.state.terminals,
      focusedTerminalId: this.state.focusedTerminalId
    })
    await window.electronAPI.workspace.save(data)
  }

  async load(): Promise<void> {
    const data = await window.electronAPI.workspace.load()
    if (data) {
      try {
        const parsed = JSON.parse(data)
        console.log('Loading workspace data...')
        console.log('Workspaces:', parsed.workspaces?.length || 0)
        console.log('Terminals:', parsed.terminals?.length || 0)
        this.state = {
          ...this.state,
          workspaces: parsed.workspaces || [],
          activeWorkspaceId: parsed.activeWorkspaceId || null,
          terminals: parsed.terminals || [],
          focusedTerminalId: parsed.focusedTerminalId || null
        }
        console.log('Workspace state updated:', this.state)
        this.notify()
      } catch (e) {
        console.error('Failed to parse workspace data:', e)
      }
    } else {
      console.log('No workspace data found')
    }
  }
}

export const workspaceStore = new WorkspaceStore()
