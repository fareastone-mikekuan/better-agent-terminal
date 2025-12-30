import { useEffect, useCallback, useState } from 'react'
import type { Workspace, TerminalInstance, EnvVariable } from '../types'
import { workspaceStore } from '../stores/workspace-store'
import { settingsStore } from '../stores/settings-store'
import { ThumbnailBar } from './ThumbnailBar'
import { CloseConfirmDialog } from './CloseConfirmDialog'
import { MainPanel } from './MainPanel'
import { ResizeHandle } from './ResizeHandle'
import { AgentPresetId, getAgentPreset } from '../types/agent-presets'

// ThumbnailBar panel settings
const THUMBNAIL_SETTINGS_KEY = 'better-terminal-thumbnail-settings'
const DEFAULT_THUMBNAIL_HEIGHT = 180
const MIN_THUMBNAIL_HEIGHT = 80
const MAX_THUMBNAIL_HEIGHT = 400

interface ThumbnailSettings {
  height: number
  collapsed: boolean
}

function loadThumbnailSettings(): ThumbnailSettings {
  try {
    const saved = localStorage.getItem(THUMBNAIL_SETTINGS_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (e) {
    console.error('Failed to load thumbnail settings:', e)
  }
  return { height: DEFAULT_THUMBNAIL_HEIGHT, collapsed: false }
}

function saveThumbnailSettings(settings: ThumbnailSettings): void {
  try {
    localStorage.setItem(THUMBNAIL_SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save thumbnail settings:', e)
  }
}

interface WorkspaceViewProps {
  workspace: Workspace
  terminals: TerminalInstance[]
  focusedTerminalId: string | null
  isActive: boolean
  onAnalyzeFile?: (fileContent: string, fileName: string) => void
}

// Helper to get shell path from settings
async function getShellFromSettings(): Promise<string | undefined> {
  const settings = settingsStore.getSettings()
  if (settings.shell === 'custom' && settings.customShellPath) {
    return settings.customShellPath
  }
  return window.electronAPI.settings.getShellPath(settings.shell)
}

// Helper to merge environment variables
function mergeEnvVars(global: EnvVariable[] = [], workspace: EnvVariable[] = []): Record<string, string> {
  const result: Record<string, string> = {}
  // Add global vars first
  for (const env of global) {
    if (env.enabled && env.key) {
      result[env.key] = env.value
    }
  }
  // Workspace vars override global
  for (const env of workspace) {
    if (env.enabled && env.key) {
      result[env.key] = env.value
    }
  }
  return result
}

// Track which workspaces have been initialized (outside component to persist across renders)
const initializedWorkspaces = new Set<string>()

export function WorkspaceView({ workspace, terminals, focusedTerminalId, isActive, onAnalyzeFile }: Readonly<WorkspaceViewProps>) {
  const [showCloseConfirm, setShowCloseConfirm] = useState<string | null>(null)
  const [thumbnailSettings, setThumbnailSettings] = useState<ThumbnailSettings>(loadThumbnailSettings)

  // Handle thumbnail bar resize
  const handleThumbnailResize = useCallback((delta: number) => {
    setThumbnailSettings(prev => {
      // Note: delta is negative when dragging up (making bar taller)
      const newHeight = Math.min(MAX_THUMBNAIL_HEIGHT, Math.max(MIN_THUMBNAIL_HEIGHT, prev.height - delta))
      const updated = { ...prev, height: newHeight }
      saveThumbnailSettings(updated)
      return updated
    })
  }, [])

  // Toggle thumbnail bar collapse
  const handleThumbnailCollapse = useCallback(() => {
    setThumbnailSettings(prev => {
      const updated = { ...prev, collapsed: !prev.collapsed }
      saveThumbnailSettings(updated)
      return updated
    })
  }, [])

  // Reset thumbnail bar to default height
  const handleThumbnailResetHeight = useCallback(() => {
    setThumbnailSettings(prev => {
      const updated = { ...prev, height: DEFAULT_THUMBNAIL_HEIGHT }
      saveThumbnailSettings(updated)
      return updated
    })
  }, [])

  // Categorize terminals
  const agentTerminal = terminals.find(t => t.agentPreset && t.agentPreset !== 'none')
  const regularTerminals = terminals.filter(t => !t.agentPreset || t.agentPreset === 'none')
  const focusedTerminal = terminals.find(t => t.id === focusedTerminalId)
  const isAgentFocused = focusedTerminal?.agentPreset && focusedTerminal.agentPreset !== 'none'

  // Initialize terminals when workspace becomes active (if no terminals exist)
  useEffect(() => {
    if (isActive && terminals.length === 0 && !initializedWorkspaces.has(workspace.id)) {
      initializedWorkspaces.add(workspace.id)
      const createInitialTerminals = async () => {
        const settings = settingsStore.getSettings()
        const terminalCount = settings.defaultTerminalCount || 1
        const createAgentTerminal = settings.createDefaultAgentTerminal === true
        // Use 'claude' as default agent when createDefaultAgentTerminal is enabled
        const defaultAgent = createAgentTerminal
          ? (workspace.defaultAgent || settings.defaultAgent || 'claude')
          : 'none'
        const shell = await getShellFromSettings()
        const customEnv = mergeEnvVars(settings.globalEnvVars, workspace.envVars)

        // Create agent terminal first (if enabled)
        if (createAgentTerminal) {
          const agentTerminal = workspaceStore.addTerminal(workspace.id, defaultAgent as AgentPresetId)
          window.electronAPI.pty.create({
            id: agentTerminal.id,
            cwd: workspace.folderPath,
            type: 'terminal',
            agentPreset: defaultAgent as AgentPresetId,
            shell,
            customEnv
          })

          // Auto-run agent command if enabled
          if (settings.agentAutoCommand) {
            const agentPreset = getAgentPreset(defaultAgent)
            if (agentPreset?.command) {
              // Small delay to ensure terminal is ready
              setTimeout(() => {
                window.electronAPI.pty.write(agentTerminal.id, agentPreset.command + '\r')
              }, 500)
            }
          }
        }

        // Create regular terminals based on settings
        for (let i = 0; i < terminalCount; i++) {
          const terminal = workspaceStore.addTerminal(workspace.id)
          window.electronAPI.pty.create({
            id: terminal.id,
            cwd: workspace.folderPath,
            type: 'terminal',
            shell,
            customEnv
          })
        }
      }
      createInitialTerminals()
    }
  }, [isActive, workspace.id, terminals.length, workspace.defaultAgent, workspace.folderPath, workspace.envVars])

  // Restore PTY processes for loaded terminals (from saved state)
  useEffect(() => {
    if (isActive) {
      console.log('[WorkspaceView] restoreTerminals useEffect triggered, terminals:', terminals.length)
      const restoreTerminals = async () => {
        const shell = await getShellFromSettings()
        const settings = settingsStore.getSettings()
        const customEnv = mergeEnvVars(settings.globalEnvVars, workspace.envVars)

        for (const terminal of terminals) {
          console.log('[WorkspaceView] Processing terminal:', { id: terminal.id, type: terminal.type })
          // Skip non-terminal types (they don't need PTY)
          if (terminal.type !== 'terminal') continue

          // Check if PTY already exists
          let ptyExists = false
          try {
            const cwd = await window.electronAPI.pty.getCwd(terminal.id)
            console.log('[WorkspaceView] getCwd result:', terminal.id, 'cwd:', cwd)
            if (cwd) {
              ptyExists = true
              console.log('[WorkspaceView] PTY already exists for:', terminal.id)
            }
          } catch (err) {
            console.log('[WorkspaceView] getCwd threw error:', err)
          }

          if (!ptyExists) {
            // PTY doesn't exist, create it
            console.log('[WorkspaceView] Creating PTY for restored terminal:', terminal.id)
            try {
              await window.electronAPI.pty.create({
                id: terminal.id,
                cwd: terminal.cwd,
                type: terminal.type,
                agentPreset: terminal.agentPreset,
                shell,
                customEnv
              })
              console.log('[WorkspaceView] PTY created successfully:', terminal.id)
            } catch (err) {
              console.error('[WorkspaceView] Failed to create PTY:', terminal.id, err)
              continue
            }

            // Give terminal more time to start properly, then send commands to activate it
            setTimeout(() => {
              // Send a space and backspace to "wake up" the terminal without visible effect
              window.electronAPI.pty.write(terminal.id, ' \b')
            }, 500)
            
            // Then send a newline to show the prompt
            setTimeout(() => {
              window.electronAPI.pty.write(terminal.id, '\r')
            }, 800)

            // Auto-run agent command if it's an agent terminal
            if (terminal.agentPreset && terminal.agentPreset !== 'none' && settings.agentAutoCommand) {
              const agentPreset = getAgentPreset(terminal.agentPreset)
              if (agentPreset?.command) {
                setTimeout(() => {
                  window.electronAPI.pty.write(terminal.id, agentPreset.command + '\r')
                }, 1000)
              }
            }
          }
        }
      }
      restoreTerminals()
    }
  }, [isActive, terminals, workspace.envVars])

  // Set default focus - only for active workspace
  useEffect(() => {
    if (isActive && !focusedTerminalId && terminals.length > 0) {
      // Focus the first terminal (agent or regular)
      const firstTerminal = agentTerminal || terminals[0]
      if (firstTerminal) {
        workspaceStore.setFocusedTerminal(firstTerminal.id)
      }
    }
  }, [isActive, focusedTerminalId, terminals, agentTerminal])

  // Periodically update terminal cwds for persistence
  useEffect(() => {
    if (!isActive) return

    const updateCwds = async () => {
      for (const terminal of terminals) {
        if (terminal.type === 'terminal') {
          try {
            const cwd = await window.electronAPI.pty.getCwd(terminal.id)
            if (cwd && cwd !== terminal.cwd) {
              workspaceStore.updateTerminalCwd(terminal.id, cwd)
            }
          } catch (e) {
            // Terminal might not be ready or closed
          }
        }
      }
      // Save after updating all cwds
      workspaceStore.save()
    }

    // Update cwds every 5 seconds
    const interval = setInterval(updateCwds, 5000)
    // Also update immediately
    updateCwds()

    return () => clearInterval(interval)
  }, [isActive, terminals])

  const handleAddTerminal = useCallback(async () => {
    const terminal = workspaceStore.addTerminal(workspace.id)
    const shell = await getShellFromSettings()
    const settings = settingsStore.getSettings()
    const customEnv = mergeEnvVars(settings.globalEnvVars, workspace.envVars)
    window.electronAPI.pty.create({
      id: terminal.id,
      cwd: workspace.folderPath,
      type: 'terminal',
      shell,
      customEnv
    })
    // Focus the new terminal
    workspaceStore.setFocusedTerminal(terminal.id)
  }, [workspace.id, workspace.folderPath, workspace.envVars])

  const handleAddOracle = useCallback(() => {
    const terminal = workspaceStore.addOracle(workspace.id)
    workspaceStore.setFocusedTerminal(terminal.id)
  }, [workspace.id])

  const handleAddWebView = useCallback(() => {
    // For now, use a default URL or prompt user
    const settings = settingsStore.getSettings()
    const url = settings.webViewUrl || 'https://www.google.com'
    const terminal = workspaceStore.addWebView(workspace.id, url)
    workspaceStore.setFocusedTerminal(terminal.id)
  }, [workspace.id])

  const handleAddFile = useCallback(() => {
    const terminal = workspaceStore.addFile(workspace.id)
    workspaceStore.setFocusedTerminal(terminal.id)
  }, [workspace.id])

  const handleAddApiTester = useCallback(() => {
    const terminal = workspaceStore.addApiTester(workspace.id)
    workspaceStore.setFocusedTerminal(terminal.id)
  }, [workspace.id])

  const handleCloseTerminal = useCallback((id: string) => {
    const terminal = terminals.find(t => t.id === id)
    // Show confirm for agent terminals
    if (terminal?.agentPreset && terminal.agentPreset !== 'none') {
      setShowCloseConfirm(id)
    } else {
      window.electronAPI.pty.kill(id)
      workspaceStore.removeTerminal(id)
    }
  }, [terminals])

  const handleConfirmClose = useCallback(() => {
    if (showCloseConfirm) {
      window.electronAPI.pty.kill(showCloseConfirm)
      workspaceStore.removeTerminal(showCloseConfirm)
      setShowCloseConfirm(null)
    }
  }, [showCloseConfirm])

  const handleRestart = useCallback(async (id: string) => {
    const terminal = terminals.find(t => t.id === id)
    if (terminal) {
      const cwd = await window.electronAPI.pty.getCwd(id) || terminal.cwd
      const shell = await getShellFromSettings()
      await window.electronAPI.pty.restart(id, cwd, shell)
      workspaceStore.updateTerminalCwd(id, cwd)
    }
  }, [terminals])

  const handleFocus = useCallback((id: string) => {
    workspaceStore.setFocusedTerminal(id)
  }, [])

  // Determine what to show
  // mainTerminal: the currently focused or first available terminal
  const mainTerminal = focusedTerminal || agentTerminal || terminals[0]

  // Show all terminals in thumbnail bar (including the currently focused one)
  const thumbnailTerminals = terminals

  return (
    <div className="workspace-view">
      {/* Render ALL terminals, show/hide with CSS - keeps processes running */}
      <div className="terminals-container">
        {terminals.map(terminal => (
          <div
            key={terminal.id}
            className={`terminal-wrapper ${terminal.id === mainTerminal?.id ? 'active' : 'hidden'}`}
          >
            <MainPanel
              terminal={terminal}
              onClose={handleCloseTerminal}
              onRestart={handleRestart}
              onAnalyzeFile={onAnalyzeFile}
            />
          </div>
        ))}
      </div>

      {/* Resize handle for thumbnail bar */}
      {!thumbnailSettings.collapsed && (
        <ResizeHandle
          direction="vertical"
          onResize={handleThumbnailResize}
          onDoubleClick={handleThumbnailResetHeight}
        />
      )}

      <ThumbnailBar
        terminals={thumbnailTerminals}
        focusedTerminalId={focusedTerminalId}
        onFocus={handleFocus}
        onAddTerminal={handleAddTerminal}
        onAddOracle={handleAddOracle}
        onAddWebView={handleAddWebView}
        onAddFile={handleAddFile}
        onAddApiTester={handleAddApiTester}
        showAddButton={true}
        height={thumbnailSettings.height}
        collapsed={thumbnailSettings.collapsed}
        onCollapse={handleThumbnailCollapse}
      />

      {
        showCloseConfirm && (
          <CloseConfirmDialog
            onConfirm={handleConfirmClose}
            onCancel={() => setShowCloseConfirm(null)}
          />
        )
      }
    </div >
  )
}
