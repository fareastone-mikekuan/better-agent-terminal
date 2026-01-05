import { useEffect, useState, useCallback } from 'react'
import { workspaceStore } from './stores/workspace-store'
import { settingsStore } from './stores/settings-store'
import { Sidebar } from './components/Sidebar'
import { WorkspaceView } from './components/WorkspaceView'
import { SettingsPanel } from './components/SettingsPanel'
import { AboutPanel } from './components/AboutPanel'
import { SnippetSidebar } from './components/SnippetPanel'
import { WorkspaceEnvDialog } from './components/WorkspaceEnvDialog'
import { WorkspaceConfigDialog } from './components/WorkspaceConfigDialog'
import { SkillLibraryPanel } from './components/SkillLibraryPanel'
import { WorkflowExecutor } from './components/WorkflowExecutor'
import { parseWorkflowFromMarkdown } from './utils/workflow-parser'
import { ResizeHandle } from './components/ResizeHandle'
import { CopilotChatPanel } from './components/CopilotChatPanel'
import { KnowledgeBasePanel } from './components/KnowledgeBasePanel'
import { registerPanelCallback } from './services/workflow-panel-service'
import type { AppState, EnvVariable, Workspace } from './types'

// Panel settings interface
interface PanelSettings {
  sidebar: {
    width: number
  }
  snippetSidebar: {
    width: number
    collapsed: boolean
  }
  copilot: {
    collapsed: boolean
  }
}

const PANEL_SETTINGS_KEY = 'better-terminal-panel-settings'
const DEFAULT_SIDEBAR_WIDTH = 220
const MIN_SIDEBAR_WIDTH = 160
const MAX_SIDEBAR_WIDTH = 400
const DEFAULT_SNIPPET_WIDTH = 280
const MIN_SNIPPET_WIDTH = 180
const MAX_SNIPPET_WIDTH = 500

function loadPanelSettings(): PanelSettings {
  try {
    const saved = localStorage.getItem(PANEL_SETTINGS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Ensure sidebar settings exist (migration from old format)
      return {
        sidebar: parsed.sidebar || { width: DEFAULT_SIDEBAR_WIDTH },
        snippetSidebar: parsed.snippetSidebar || { width: DEFAULT_SNIPPET_WIDTH, collapsed: false },
        copilot: parsed.copilot || { collapsed: false }
      }
    }
  } catch (e) {
    console.error('Failed to load panel settings:', e)
  }
  return {
    sidebar: { width: DEFAULT_SIDEBAR_WIDTH },
    snippetSidebar: { width: DEFAULT_SNIPPET_WIDTH, collapsed: false },
    copilot: { collapsed: false }
  }
}

function savePanelSettings(settings: PanelSettings): void {
  try {
    localStorage.setItem(PANEL_SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save panel settings:', e)
  }
}

export default function App() {
  const [state, setState] = useState<AppState>(workspaceStore.getState())
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false)
  const [envDialogWorkspaceId, setEnvDialogWorkspaceId] = useState<string | null>(null)
  const [showConfigDialog, setShowConfigDialog] = useState<string | null>(null)
  const [showSkillLibrary, setShowSkillLibrary] = useState(false)
  const [executingWorkflow, setExecutingWorkflow] = useState<{ workspace: Workspace; content: string } | null>(null)
  // Panel visibility and floating states
  const [showSnippetSidebar, setShowSnippetSidebar] = useState(false)
  const [isSnippetFloating, setIsSnippetFloating] = useState(false)
  const [showCopilot, setShowCopilot] = useState(false)
  const [copilotWidth, setCopilotWidth] = useState(() => {
    const saved = localStorage.getItem('copilot-width')
    return saved ? parseInt(saved) : 400
  })
  // Panel settings for resizable panels
  const [panelSettings, setPanelSettings] = useState<PanelSettings>(loadPanelSettings)

  // Apply theme to body element
  useEffect(() => {
    const applyTheme = () => {
      const theme = settingsStore.getSettings().theme
      document.body.setAttribute('data-theme', theme)
    }
    
    applyTheme()
    const unsubscribe = settingsStore.subscribe(applyTheme)
    return unsubscribe
  }, [])

  // Debug: log state on mount
  useEffect(() => {
    console.log('[App] Initial state:', state)
    console.log('[App] Panel settings:', panelSettings)
  }, [])

  // Register workflow panel creation callback
  useEffect(() => {
    registerPanelCallback(async (workspaceId, type, config) => {
      const workspace = workspaceStore.getState().workspaces.find(w => w.id === workspaceId)
      if (!workspace) return null

      const settings = settingsStore.getSettings()
      
      switch (type) {
        case 'terminal': {
          const terminal = workspaceStore.addTerminal(workspaceId)
          const shell = await window.electronAPI.settings.getShell()
          const customEnv = {
            ...settings.globalEnvVars,
            ...workspace.envVars
          }
          
          await window.electronAPI.pty.create({
            id: terminal.id,
            cwd: workspace.folderPath,
            type: 'terminal',
            shell,
            customEnv
          })
          
          // Execute command if provided
          if (config?.command) {
            setTimeout(() => {
              window.electronAPI.pty.write(terminal.id, config.command + '\n')
            }, 500)
          }
          
          workspaceStore.setFocusedTerminal(terminal.id)
          return terminal.id
        }
        
        case 'api': {
          const terminal = workspaceStore.addApiTester(workspaceId)
          workspaceStore.setFocusedTerminal(terminal.id)
          
          // Auto-fill API request if config provided
          if (config?.method && config?.url) {
            setTimeout(() => {
              const event = new CustomEvent('api-auto-fill', {
                detail: {
                  terminalId: terminal.id,
                  method: config.method,
                  url: config.url,
                  headers: config.headers,
                  body: config.body
                }
              })
              window.dispatchEvent(event)
            }, 300)
          }
          
          return terminal.id
        }
        
        case 'db': {
          const terminal = workspaceStore.addOracle(workspaceId)
          workspaceStore.setFocusedTerminal(terminal.id)
          
          // Auto-fill query if provided
          if (config?.query) {
            setTimeout(() => {
              const event = new CustomEvent('db-auto-fill', {
                detail: {
                  terminalId: terminal.id,
                  query: config.query,
                  connection: config.connection
                }
              })
              window.dispatchEvent(event)
            }, 300)
          }
          
          return terminal.id
        }
        
        case 'web': {
          const url = config?.url || 'https://www.google.com'
          const terminal = workspaceStore.addWebView(workspaceId, url)
          workspaceStore.setFocusedTerminal(terminal.id)
          return terminal.id
        }
        
        case 'file': {
          const terminal = workspaceStore.addFile(workspaceId)
          workspaceStore.setFocusedTerminal(terminal.id)
          
          // Auto-perform action if provided
          if (config?.action && config?.path) {
            setTimeout(() => {
              const event = new CustomEvent('file-auto-action', {
                detail: {
                  terminalId: terminal.id,
                  action: config.action,
                  path: config.path
                }
              })
              window.dispatchEvent(event)
            }, 300)
          }
          
          return terminal.id
        }
        
        default:
          return null
      }
    })
  }, [])

  // Handle sidebar resize
  const handleSidebarResize = useCallback((delta: number) => {
    setPanelSettings(prev => {
      // Note: delta is positive when dragging right (making sidebar wider)
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, prev.sidebar.width + delta))
      const updated = { ...prev, sidebar: { ...prev.sidebar, width: newWidth } }
      savePanelSettings(updated)
      return updated
    })
  }, [])

  // Reset sidebar to default width
  const handleSidebarResetWidth = useCallback(() => {
    setPanelSettings(prev => {
      const updated = { ...prev, sidebar: { ...prev.sidebar, width: DEFAULT_SIDEBAR_WIDTH } }
      savePanelSettings(updated)
      return updated
    })
  }, [])

  // Handle file analysis request from FILE panel
  const handleFileAnalysis = useCallback((fileContent: string, fileName: string) => {
    // 打开 CHAT 面板
    setShowCopilot(true)
    
    // 通过自定义事件通知 CHAT 面板
    const event = new CustomEvent('file-analysis-request', {
      detail: {
        fileContent,
        fileName
      }
    })
    window.dispatchEvent(event)
  }, [])

  // Handle snippet sidebar resize
  const handleSnippetResize = useCallback((delta: number) => {
    setPanelSettings(prev => {
      // Note: delta is negative when dragging left (making sidebar wider)
      const newWidth = Math.min(MAX_SNIPPET_WIDTH, Math.max(MIN_SNIPPET_WIDTH, prev.snippetSidebar.width - delta))
      const updated = { ...prev, snippetSidebar: { ...prev.snippetSidebar, width: newWidth } }
      savePanelSettings(updated)
      return updated
    })
  }, [])

  // Toggle snippet sidebar collapse
  const handleSnippetCollapse = useCallback(() => {
    setPanelSettings(prev => {
      const updated = { ...prev, snippetSidebar: { ...prev.snippetSidebar, collapsed: !prev.snippetSidebar.collapsed } }
      savePanelSettings(updated)
      return updated
    })
  }, [])

  // Toggle copilot collapse
  const handleCopilotCollapse = useCallback(() => {
    setPanelSettings(prev => {
      const updated = { ...prev, copilot: { collapsed: !prev.copilot.collapsed } }
      savePanelSettings(updated)
      return updated
    })
  }, [])

  // Reset snippet sidebar to default width
  const handleSnippetResetWidth = useCallback(() => {
    setPanelSettings(prev => {
      const updated = { ...prev, snippetSidebar: { ...prev.snippetSidebar, width: DEFAULT_SNIPPET_WIDTH } }
      savePanelSettings(updated)
      return updated
    })
  }, [])

  useEffect(() => {
    const unsubscribe = workspaceStore.subscribe(() => {
      setState(workspaceStore.getState())
    })

    // Global listener for all terminal output - updates activity for ALL terminals
    // This is needed because WorkspaceView only renders terminals for the active workspace
    const unsubscribeOutput = window.electronAPI.pty.onOutput((id) => {
      workspaceStore.updateTerminalActivity(id)
    })

    // Load saved workspaces and settings on startup
    workspaceStore.load()
    settingsStore.load()

    // Save terminal cwds before app closes
    const handleBeforeUnload = () => {
      // Trigger async save, but don't wait for it
      // The periodic save in WorkspaceView should have already saved most recent state
      const state = workspaceStore.getState()
      
      // Quick synchronous save attempt
      Promise.all(
        state.terminals
          .filter(t => t.type === 'terminal')
          .map(async (terminal) => {
            try {
              const cwd = await window.electronAPI.pty.getCwd(terminal.id)
              if (cwd) {
                workspaceStore.updateTerminalCwd(terminal.id, cwd)
              }
            } catch (err) {
              // Ignore errors during shutdown
            }
          })
      ).then(() => {
        workspaceStore.save()
      })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      unsubscribe()
      unsubscribeOutput()
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  const handleAddWorkspace = useCallback(async () => {
    const folderPath = await window.electronAPI.dialog.selectFolder()
    if (folderPath) {
      const name = folderPath.split(/[/\\]/).pop() || 'Workspace'
      workspaceStore.addWorkspace(name, folderPath)
      workspaceStore.save()
    }
  }, [])

  // Paste content to focused terminal
  const handlePasteToTerminal = useCallback((content: string) => {
    const currentState = workspaceStore.getState()
    // Try focused terminal first, then fall back to active terminal or first terminal in active workspace
    let terminalId = currentState.focusedTerminalId

    if (!terminalId && currentState.activeWorkspaceId) {
      const workspaceTerminals = workspaceStore.getWorkspaceTerminals(currentState.activeWorkspaceId)
      if (workspaceTerminals.length > 0) {
        terminalId = workspaceTerminals[0].id
      }
    }

    if (terminalId) {
      window.electronAPI.pty.write(terminalId, content)
    } else {
      console.warn('No terminal available to paste to')
    }
  }, [])

  // Get the workspace for env dialog
  const envDialogWorkspace = envDialogWorkspaceId
    ? state.workspaces.find(w => w.id === envDialogWorkspaceId)
    : null

  // Workspace config handlers
  const handleUpdateWorkspaceConfig = useCallback((workspaceId: string, updates: Partial<Workspace>) => {
    workspaceStore.updateWorkspace(workspaceId, updates)
  }, [])

  const handleDuplicateSkill = useCallback(async (workspaceId: string) => {
    const workspace = state.workspaces.find(ws => ws.id === workspaceId)
    if (!workspace) return
    
    const folderPath = await window.electronAPI.dialog.selectFolder()
    if (!folderPath) return
    
    const newWorkspace: Workspace = {
      ...workspace,
      id: Date.now().toString(),
      folderPath,
      createdAt: Date.now(),
      name: folderPath.split(/[/\\]/).pop() || workspace.name
    }
    
    workspaceStore.addWorkspaceObject(newWorkspace)
    workspaceStore.save()
  }, [state.workspaces])

  return (
    <div className="app">
      <Sidebar
        width={panelSettings.sidebar.width}
        workspaces={state.workspaces}
        activeWorkspaceId={state.activeWorkspaceId}
        onSelectWorkspace={(id) => workspaceStore.setActiveWorkspace(id)}
        onAddWorkspace={handleAddWorkspace}
        onRemoveWorkspace={(id) => {
          workspaceStore.removeWorkspace(id)
          workspaceStore.save()
        }}
        onRenameWorkspace={(id, alias) => {
          workspaceStore.renameWorkspace(id, alias)
          workspaceStore.save()
        }}
        onSetWorkspaceRole={(id, role) => {
          workspaceStore.setWorkspaceRole(id, role)
        }}
        onReorderWorkspaces={(workspaceIds) => {
          workspaceStore.reorderWorkspaces(workspaceIds)
        }}
        onOpenEnvVars={(workspaceId) => setEnvDialogWorkspaceId(workspaceId)}
        onOpenConfig={(workspaceId) => setShowConfigDialog(workspaceId)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAbout={() => setShowAbout(true)}
        onOpenKnowledgeBase={() => setShowKnowledgeBase(true)}
        onShowSkillLibrary={() => setShowSkillLibrary(true)}
        showCopilot={showCopilot}
        onToggleCopilot={() => setShowCopilot(!showCopilot)}
        showSnippets={showSnippetSidebar}
        onToggleSnippets={() => setShowSnippetSidebar(!showSnippetSidebar)}
      />
      <ResizeHandle
        direction="horizontal"
        onResize={handleSidebarResize}
        onDoubleClick={handleSidebarResetWidth}
      />
      <main className="main-content">
        {state.workspaces.length > 0 ? (
          // Render ALL workspaces, hide inactive ones with CSS to preserve terminal state
          state.workspaces.map(workspace => (
            <div
              key={workspace.id}
              className={`workspace-container ${workspace.id === state.activeWorkspaceId ? 'active' : 'hidden'}`}
            >
              <WorkspaceView
                workspace={workspace}
                terminals={workspaceStore.getWorkspaceTerminals(workspace.id)}
                focusedTerminalId={workspace.id === state.activeWorkspaceId ? state.focusedTerminalId : null}
                isActive={workspace.id === state.activeWorkspaceId}
                onAnalyzeFile={handleFileAnalysis}
              />
            </div>
          ))
        ) : (
          <div className="empty-state">
            <h2>歡迎使用此系統</h2>
            <p>點擊「+ 新增工作區」開始使用</p>
          </div>
        )}
      </main>

      {/* CHAT Panel - always in flex flow */}
      {showCopilot && (
        <>
          {!panelSettings.copilot.collapsed && (
            <ResizeHandle
              direction="horizontal"
              onResize={(delta) => {
                setCopilotWidth(prev => {
                  const newWidth = Math.min(700, Math.max(300, prev - delta))
                  localStorage.setItem('copilot-width', newWidth.toString())
                  return newWidth
                })
              }}
              onDoubleClick={() => {
                setCopilotWidth(400)
                localStorage.setItem('copilot-width', '400')
              }}
            />
          )}
          <CopilotChatPanel 
            isVisible={showCopilot}
            onClose={() => setShowCopilot(false)}
            width={panelSettings.copilot.collapsed ? 32 : copilotWidth}
            workspaceId={state.activeWorkspaceId}
            collapsed={panelSettings.copilot.collapsed}
            onCollapse={handleCopilotCollapse}
            focusedTerminalId={state.focusedTerminalId}
          />
        </>
      )}

      {/* Snippet Panel - always in flex flow */}
      {showSnippetSidebar && !isSnippetFloating && (
        <>
          {!panelSettings.snippetSidebar.collapsed && (
            <ResizeHandle
              direction="horizontal"
              onResize={handleSnippetResize}
              onDoubleClick={handleSnippetResetWidth}
            />
          )}
          <SnippetSidebar
            isVisible={showSnippetSidebar}
            width={panelSettings.snippetSidebar.collapsed ? 32 : panelSettings.snippetSidebar.width}
            collapsed={panelSettings.snippetSidebar.collapsed}
            onCollapse={handleSnippetCollapse}
            onClose={() => setShowSnippetSidebar(false)}
            onPasteToTerminal={handlePasteToTerminal}
            style={{ height: '100%' }}
          />
        </>
      )}
      
      {/* Floating Panels */}
      {showSnippetSidebar && isSnippetFloating && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          width: '350px',
          maxHeight: '60vh',
          backgroundColor: '#1e1e1e',
          border: '1px solid #3a3836',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          zIndex: 1001,
          overflow: 'auto'
        }}>
          <div style={{ 
            padding: '8px 12px',
            backgroundColor: '#2a2826',
            borderBottom: '1px solid #3a3836',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 1
          }}>
            <span style={{ color: '#dfdbc3', fontSize: '13px', fontWeight: 500 }}>📋 Snippets</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setIsSnippetFloating(false)}
                style={{
                  background: 'none',
                  border: '1px solid #3a3836',
                  color: '#dfdbc3',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontSize: '12px',
                  borderRadius: '4px'
                }}
                title="固定"
              >
                📌
              </button>
              <button
                onClick={() => setShowSnippetSidebar(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #666',
                  color: '#dfdbc3',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  fontSize: '16px',
                  borderRadius: '4px',
                  lineHeight: 1,
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#444'
                  e.currentTarget.style.borderColor = '#888'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.borderColor = '#666'
                }}
                title="关闭"
              >
                ×
              </button>
            </div>
          </div>
          <SnippetSidebar
            isVisible={true}
            width={350}
            collapsed={false}
            onCollapse={() => {}}
            onClose={() => setShowSnippetSidebar(false)}
            onPasteToTerminal={handlePasteToTerminal}
            style={{ height: 'auto' }}
          />
        </div>
      )}
      

      
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
      {showAbout && (
        <AboutPanel onClose={() => setShowAbout(false)} />
      )}
      {showKnowledgeBase && (
        <KnowledgeBasePanel onClose={() => setShowKnowledgeBase(false)} />
      )}
      {showSkillLibrary && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '800px',
            maxWidth: '90vw',
            height: '80vh',
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>📚 技能庫</h2>
              <button
                onClick={() => setShowSkillLibrary(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ×
              </button>
            </div>
            <SkillLibraryPanel
              workspaces={state.workspaces}
              activeWorkspaceId={state.activeWorkspaceId}
              onOpenSkill={(id) => {
                workspaceStore.setActiveWorkspace(id)
                setShowSkillLibrary(false)
              }}
              onEditSkill={(id) => {
                setShowConfigDialog(id)
                setShowSkillLibrary(false)
              }}
              onDuplicateSkill={handleDuplicateSkill}
              onDeleteSkill={(id) => {
                if (confirm('確定要刪除這個技能工作區嗎？')) {
                  workspaceStore.removeWorkspace(id)
                  workspaceStore.save()
                }
              }}
              onExecuteWorkflow={(workspace, content) => {
                console.log('[App] 收到執行工作流程事件')
                setExecutingWorkflow({ workspace, content })
              }}
            />
          </div>
        </div>
      )}
      
      {/* 工作流程執行器 - 渲染在頂層 */}
      {executingWorkflow && (
        <WorkflowExecutor
          workspaceId={executingWorkflow.workspace.id}
          workspaceName={executingWorkflow.workspace.alias || executingWorkflow.workspace.name}
          steps={parseWorkflowFromMarkdown(executingWorkflow.content)}
          onClose={() => {
            console.log('[App] 關閉 WorkflowExecutor')
            setExecutingWorkflow(null)
          }}
        />
      )}
      
      {envDialogWorkspace && (
        <WorkspaceEnvDialog
          workspace={envDialogWorkspace}
          onAdd={(envVar: EnvVariable) => workspaceStore.addWorkspaceEnvVar(envDialogWorkspaceId!, envVar)}
          onRemove={(key: string) => workspaceStore.removeWorkspaceEnvVar(envDialogWorkspaceId!, key)}
          onUpdate={(key: string, updates: Partial<EnvVariable>) => workspaceStore.updateWorkspaceEnvVar(envDialogWorkspaceId!, key, updates)}
          onClose={() => setEnvDialogWorkspaceId(null)}
        />
      )}
      {showConfigDialog && state.workspaces.find(ws => ws.id === showConfigDialog) && (
        <WorkspaceConfigDialog
          workspace={state.workspaces.find(ws => ws.id === showConfigDialog)!}
          onSave={(updates) => {
            handleUpdateWorkspaceConfig(showConfigDialog, updates)
            setShowConfigDialog(null)
          }}
          onClose={() => setShowConfigDialog(null)}
        />
      )}
    </div>
  )
}
