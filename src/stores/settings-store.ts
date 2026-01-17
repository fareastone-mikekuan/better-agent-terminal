import type { AppSettings, ShellType, FontType, ColorPresetId, EnvVariable, AgentCommandType } from '../types'
import type { AgentPresetId } from '../types/agent-presets'
import type { CopilotSkill } from '../types/copilot-skills'
import { FONT_OPTIONS, COLOR_PRESETS, AGENT_COMMAND_OPTIONS } from '../types'
import { BUILTIN_SKILLS } from '../types/copilot-skills'

type Listener = () => void

const defaultSettings: AppSettings = {
  shell: 'auto',
  customShellPath: '',
  fontSize: 14,
  fontFamily: 'sf-mono',
  customFontFamily: '',
  theme: 'dark',
  colorPreset: 'novel',
  customBackgroundColor: '#1f1d1a',
  customForegroundColor: '#dfdbc3',
  customCursorColor: '#dfdbc3',
  globalEnvVars: [],
  defaultAgent: 'claude-code' as AgentPresetId,
  agentAutoCommand: true,
  agentCommandType: 'claude',
  agentCustomCommand: '',
  defaultTerminalCount: 1,
  createDefaultAgentTerminal: false,
  webViewUrl: 'http://10.68.52.50:8080/vdsview/view?show=CCBS_Billing_Diagram.asp',
  sharedPanels: {
    copilot: true,
    fileExplorer: true,
    apiTester: true,
    oracle: true,
    webView: true,
    snippets: true
  },
  m365DriveSync: {
    tenant: 'organizations',
    clientId: '',
    shareUrl: '',
    autoLearn: true
  }
}

class SettingsStore {
  private settings: AppSettings = { ...defaultSettings }
  private copilotConfig: CopilotConfig | null = null
  private copilotSkills: CopilotSkill[] = [...BUILTIN_SKILLS]
  private listeners: Set<Listener> = new Set()

  getSettings(): AppSettings {
    return this.settings
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach(listener => listener())
  }

  setShell(shell: ShellType): void {
    this.settings = { ...this.settings, shell }
    this.notify()
    this.save()
  }

  setCustomShellPath(path: string): void {
    this.settings = { ...this.settings, customShellPath: path }
    this.notify()
    this.save()
  }

  setFontSize(size: number): void {
    this.settings = { ...this.settings, fontSize: size }
    this.notify()
    this.save()
  }

  setTheme(theme: 'dark' | 'light'): void {
    this.settings = { ...this.settings, theme }
    this.notify()
    this.save()
  }

  setFontFamily(fontFamily: FontType): void {
    this.settings = { ...this.settings, fontFamily }
    this.notify()
    this.save()
  }

  setCustomFontFamily(customFontFamily: string): void {
    this.settings = { ...this.settings, customFontFamily }
    this.notify()
    this.save()
  }

  setColorPreset(colorPreset: ColorPresetId): void {
    this.settings = { ...this.settings, colorPreset }
    this.notify()
    this.save()
  }

  setCustomBackgroundColor(customBackgroundColor: string): void {
    this.settings = { ...this.settings, customBackgroundColor }
    this.notify()
    this.save()
  }

  setCustomForegroundColor(customForegroundColor: string): void {
    this.settings = { ...this.settings, customForegroundColor }
    this.notify()
    this.save()
  }

  setCustomCursorColor(customCursorColor: string): void {
    this.settings = { ...this.settings, customCursorColor }
    this.notify()
    this.save()
  }

  // Environment Variables
  setGlobalEnvVars(envVars: EnvVariable[]): void {
    this.settings = { ...this.settings, globalEnvVars: envVars }
    this.notify()
    this.save()
  }

  addGlobalEnvVar(envVar: EnvVariable): void {
    const current = this.settings.globalEnvVars || []
    this.settings = { ...this.settings, globalEnvVars: [...current, envVar] }
    this.notify()
    this.save()
  }

  removeGlobalEnvVar(key: string): void {
    const current = this.settings.globalEnvVars || []
    this.settings = { ...this.settings, globalEnvVars: current.filter(e => e.key !== key) }
    this.notify()
    this.save()
  }

  updateGlobalEnvVar(key: string, updates: Partial<EnvVariable>): void {
    const current = this.settings.globalEnvVars || []
    this.settings = {
      ...this.settings,
      globalEnvVars: current.map(e => e.key === key ? { ...e, ...updates } : e)
    }
    this.notify()
    this.save()
  }

  // Agent Auto Command
  setAgentAutoCommand(agentAutoCommand: boolean): void {
    this.settings = { ...this.settings, agentAutoCommand }
    this.notify()
    this.save()
  }

  setAgentCommandType(agentCommandType: AgentCommandType): void {
    this.settings = { ...this.settings, agentCommandType }
    this.notify()
    this.save()
  }

  setAgentCustomCommand(agentCustomCommand: string): void {
    this.settings = { ...this.settings, agentCustomCommand }
    this.notify()
    this.save()
  }

  setDefaultTerminalCount(count: number): void {
    this.settings = { ...this.settings, defaultTerminalCount: Math.max(1, Math.min(5, count)) }
    this.notify()
    this.save()
  }

  setCreateDefaultAgentTerminal(create: boolean): void {
    this.settings = { ...this.settings, createDefaultAgentTerminal: create }
    this.notify()
    this.save()
  }

  setWebViewUrl(webViewUrl: string): void {
    this.settings = { ...this.settings, webViewUrl }
    this.notify()
    this.save()
  }

  setDefaultAgent(agent: AgentPresetId): void {
    this.settings = { ...this.settings, defaultAgent: agent }
    this.notify()
    this.save()
  }

  // General settings setter
  setSettings(settings: AppSettings): void {
    this.settings = { ...settings }
    this.notify()
    this.save()
  }

  // Microsoft 365 Drive Sync settings
  setM365DriveSyncConfig(updates: Partial<NonNullable<AppSettings['m365DriveSync']>>): void {
    const current = this.settings.m365DriveSync || defaultSettings.m365DriveSync || {}
    this.settings = {
      ...this.settings,
      m365DriveSync: {
        ...current,
        ...updates
      }
    }
    this.notify()
    this.save()
  }

  // Get the agent command to execute
  getAgentCommand(): string | null {
    if (!this.settings.agentAutoCommand) return null
    if (this.settings.agentCommandType === 'custom') {
      return this.settings.agentCustomCommand || null
    }
    const option = AGENT_COMMAND_OPTIONS.find(o => o.id === this.settings.agentCommandType)
    return option?.command || null
  }

  // Get terminal colors based on preset or custom settings
  getTerminalColors(): { background: string; foreground: string; cursor: string } {
    if (this.settings.colorPreset === 'custom') {
      return {
        background: this.settings.customBackgroundColor,
        foreground: this.settings.customForegroundColor,
        cursor: this.settings.customCursorColor
      }
    }
    const preset = COLOR_PRESETS.find(p => p.id === this.settings.colorPreset)
    return preset || COLOR_PRESETS[0]
  }

  // Get the actual CSS font-family string based on settings
  getFontFamilyString(): string {
    if (this.settings.fontFamily === 'custom' && this.settings.customFontFamily) {
      return `"${this.settings.customFontFamily}", monospace`
    }
    const fontOption = FONT_OPTIONS.find(f => f.id === this.settings.fontFamily)
    return fontOption?.fontFamily || 'monospace'
  }

  async save(): Promise<void> {
    const data = JSON.stringify(this.settings)
    await window.electronAPI.settings.save(data)
  }

  async load(): Promise<void> {
    const data = await window.electronAPI.settings.load()
    if (data) {
      try {
        const parsed = JSON.parse(data)
        this.settings = { ...defaultSettings, ...parsed }

        // Migrate legacy localStorage M365 Drive Sync config (from KB Index tab)
        try {
          const legacyTenant = localStorage.getItem('m365-tenant') || ''
          const legacyClientId = localStorage.getItem('m365-client-id') || ''
          const legacyShareUrl = localStorage.getItem('m365-share-url') || ''
          const legacyAutoLearn = localStorage.getItem('m365-auto-learn')

          const hasLegacy = !!(legacyTenant || legacyClientId || legacyShareUrl || legacyAutoLearn)
          const currentSync = this.settings.m365DriveSync
          const isEmptyCurrent = !currentSync || (!currentSync.clientId && !currentSync.shareUrl)

          if (hasLegacy && isEmptyCurrent) {
            this.settings.m365DriveSync = {
              tenant: legacyTenant || this.settings.m365DriveSync?.tenant || 'organizations',
              clientId: legacyClientId || '',
              shareUrl: legacyShareUrl || '',
              autoLearn: legacyAutoLearn ? legacyAutoLearn === 'true' : (this.settings.m365DriveSync?.autoLearn ?? true)
            }
            this.save()
          }
        } catch {
          // ignore migration issues
        }
        
        // Migrate old bundled PowerShell path to 'auto' (use system PowerShell)
        if (this.settings.shell === 'custom' && 
            this.settings.customShellPath &&
            this.settings.customShellPath.includes('packages/PowerShell')) {
          console.log('Migrating from bundled PowerShell to auto detection')
          this.settings.shell = 'auto'
          this.settings.customShellPath = ''
          this.save()
        }
        
        // 確保 webViewUrl 有預設值
        if (!this.settings.webViewUrl) {
          this.settings.webViewUrl = defaultSettings.webViewUrl
        }
        this.notify()
      } catch (e) {
        console.error('Failed to parse settings:', e)
      }
    }

    // Load Copilot config from main process
    try {
      this.copilotConfig = await window.electronAPI.copilot.getConfig()
      // Notify subscribers after loading Copilot config
      this.notify()
    } catch (e) {
      console.warn('Failed to load Copilot config:', e)
    }

    // Load skills from localStorage
    this.loadSkillsFromLocalStorage()
  }

  // GitHub Copilot methods
  async setCopilotConfig(config: CopilotConfig): Promise<void> {
    this.copilotConfig = config
    await window.electronAPI.copilot.setConfig(config)
    this.notify()
  }

  getCopilotConfig(): CopilotConfig | null {
    return this.copilotConfig
  }

  async isCopilotEnabled(): Promise<boolean> {
    return await window.electronAPI.copilot.isEnabled()
  }

  // Copilot Skills methods
  getCopilotSkills(): CopilotSkill[] {
    // 返回新陣列副本，確保 React 能檢測到變化
    return [...this.copilotSkills]
  }

  getEnabledSkills(): CopilotSkill[] {
    return this.copilotSkills.filter(skill => skill.enabled)
  }

  toggleSkill(skillId: string, enabled: boolean): void {
    const skill = this.copilotSkills.find(s => s.id === skillId)
    if (skill) {
      skill.enabled = enabled
      this.notify()
      // Persist to localStorage
      this.saveSkillsToLocalStorage()
    }
  }

  resetSkills(): void {
    this.copilotSkills = [...BUILTIN_SKILLS]
    this.notify()
    this.saveSkillsToLocalStorage()
  }

  private saveSkillsToLocalStorage(): void {
    try {
      const skillStates = this.copilotSkills.map(s => ({ id: s.id, enabled: s.enabled }))
      localStorage.setItem('copilot-skills', JSON.stringify(skillStates))
    } catch (e) {
      console.error('Failed to save skills to localStorage:', e)
    }
  }

  private loadSkillsFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem('copilot-skills')
      if (saved) {
        const skillStates = JSON.parse(saved) as Array<{ id: string; enabled: boolean }>
        skillStates.forEach(state => {
          const skill = this.copilotSkills.find(s => s.id === state.id)
          if (skill) {
            skill.enabled = state.enabled
          }
        })
      }
    } catch (e) {
      console.error('Failed to load skills from localStorage:', e)
    }
  }

  // Export all data (settings + workspaces + localStorage)
  async exportAllData(): Promise<boolean> {
    try {
      // Get file path from dialog
      const filePath = await window.electronAPI.data.export()
      if (!filePath) return false

      // Collect all data
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        settings: await window.electronAPI.settings.load(),
        workspaces: await window.electronAPI.workspace.load(),
        localStorage: {} as Record<string, string>
      }

      // Export all localStorage data
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) {
          exportData.localStorage[key] = localStorage.getItem(key) || ''
        }
      }

      // Log export summary
      console.log('=== Export Summary ===')
      console.log('Export Date:', exportData.exportDate)
      
      // Parse and log workspace data
      if (exportData.workspaces) {
        try {
          const wsData = JSON.parse(exportData.workspaces)
          console.log('Workspaces:', wsData.workspaces?.length || 0)
          console.log('Terminals:', wsData.terminals?.length || 0)
          if (wsData.terminals) {
            console.log('Terminal types:', wsData.terminals.map((t: any) => ({ type: t.type, id: t.id })))
          }
        } catch (e) {
          console.warn('Could not parse workspace data')
        }
      }
      
      console.log('LocalStorage keys:', Object.keys(exportData.localStorage).length)
      console.log('Key list:', Object.keys(exportData.localStorage))

      // Save to file
      const success = await window.electronAPI.data.saveToFile(
        filePath,
        JSON.stringify(exportData, null, 2)
      )

      console.log('Export result:', success ? 'SUCCESS' : 'FAILED')
      return success
    } catch (error) {
      console.error('Failed to export data:', error)
      return false
    }
  }

  // Import all data
  async importAllData(): Promise<boolean> {
    try {
      // Get file content from dialog
      const data = await window.electronAPI.data.import()
      if (!data) return false

      const importData = JSON.parse(data)

      // Validate data structure
      if (!importData.version || !importData.exportDate) {
        throw new Error('Invalid backup file format')
      }

      console.log('Importing data from:', importData.exportDate)
      console.log('Data includes:', Object.keys(importData))

      // Restore settings
      if (importData.settings) {
        console.log('Restoring settings...')
        await window.electronAPI.settings.save(importData.settings)
        await this.load()
      }

      // Restore workspaces
      if (importData.workspaces) {
        console.log('Restoring workspaces...')
        await window.electronAPI.workspace.save(importData.workspaces)
        // Parse and log workspace info
        try {
          const workspaceData = JSON.parse(importData.workspaces)
          console.log('Workspace count:', workspaceData.workspaces?.length || 0)
          console.log('Terminal count:', workspaceData.terminals?.length || 0)
        } catch (e) {
          console.warn('Could not parse workspace data for logging')
        }
        // ✅ 重新載入 workspace store 以套用新數據
        const { workspaceStore } = await import('./workspace-store')
        await workspaceStore.load()
        console.log('[Import] Workspace store reloaded')
      }

      // Restore localStorage
      if (importData.localStorage) {
        console.log('Restoring localStorage items:', Object.keys(importData.localStorage).length)
        for (const [key, value] of Object.entries(importData.localStorage)) {
          if (typeof value === 'string') {
            localStorage.setItem(key, value)
          }
        }
      }

      console.log('Import completed successfully')
      return true
    } catch (error) {
      console.error('Failed to import data:', error)
      return false
    }
  }
}

export const settingsStore = new SettingsStore()
