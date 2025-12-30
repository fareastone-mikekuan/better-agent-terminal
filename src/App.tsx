import { useEffect, useState, useCallback, useRef } from 'react'
import { workspaceStore } from './stores/workspace-store'
import { settingsStore } from './stores/settings-store'
import { Sidebar } from './components/Sidebar'
import { WorkspaceView } from './components/WorkspaceView'
import { SettingsPanel } from './components/SettingsPanel'
import { AboutPanel } from './components/AboutPanel'
import { SnippetSidebar } from './components/SnippetPanel'
import { WorkspaceEnvDialog } from './components/WorkspaceEnvDialog'
import { ResizeHandle } from './components/ResizeHandle'
import { WebViewPanel } from './components/WebViewPanel'
import { OraclePanel } from './components/OraclePanel'
import { ApiTesterPanel } from './components/ApiTesterPanel'
import { CopilotChatPanel } from './components/CopilotChatPanel'
import { FileExplorerPanel } from './components/FileExplorerPanel'
import type { AppState, EnvVariable } from './types'

// Panel settings interface
interface PanelSettings {
  sidebar: {
    width: number
  }
  snippetSidebar: {
    width: number
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
        snippetSidebar: parsed.snippetSidebar || { width: DEFAULT_SNIPPET_WIDTH, collapsed: false }
      }
    }
  } catch (e) {
    console.error('Failed to load panel settings:', e)
  }
  return {
    sidebar: { width: DEFAULT_SIDEBAR_WIDTH },
    snippetSidebar: { width: DEFAULT_SNIPPET_WIDTH, collapsed: false }
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
  const [settings, setSettings] = useState(settingsStore.getSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [envDialogWorkspaceId, setEnvDialogWorkspaceId] = useState<string | null>(null)
  const webViewRef = useRef<{ fetchContent: () => Promise<string | null> }>(null)
  // Panel visibility and floating states
  const [showSnippetSidebar, setShowSnippetSidebar] = useState(true)
  const [isSnippetFloating, setIsSnippetFloating] = useState(false)
  const [showWebView, setShowWebView] = useState(true)
  const [isWebViewFloating, setIsWebViewFloating] = useState(false)
  const [showOracle, setShowOracle] = useState(true)
  const [isOracleFloating, setIsOracleFloating] = useState(false)
  const [oracleQueryResult, setOracleQueryResult] = useState<string | null>(null)
  const [webPageContent, setWebPageContent] = useState<string | null>(null)
  const [showApiTester, setShowApiTester] = useState(false)
  const [apiTesterHeight, setApiTesterHeight] = useState(() => {
    const saved = localStorage.getItem('api-tester-height')
    return saved ? parseInt(saved) : 300
  })
  const [showCopilot, setShowCopilot] = useState(false)
  const [copilotWidth, setCopilotWidth] = useState(() => {
    const saved = localStorage.getItem('copilot-width')
    return saved ? parseInt(saved) : 400
  })
  const [showFileExplorer, setShowFileExplorer] = useState(false)
  const [isFileExplorerFloating, setIsFileExplorerFloating] = useState(false)
  const [fileExplorerWidth, setFileExplorerWidth] = useState(() => {
    const saved = localStorage.getItem('file-explorer-width')
    return saved ? parseInt(saved) : 400
  })
  const [fileContentForAI, setFileContentForAI] = useState<{ fileName: string; content: string } | null>(null)
  // Panel settings for resizable panels
  const [panelSettings, setPanelSettings] = useState<PanelSettings>(loadPanelSettings)
  const [rightPanelHeights, setRightPanelHeights] = useState({
    snippet: 33,
    oracle: 33,
    webview: 34
  })

  // Debug: log state on mount
  useEffect(() => {
    console.log('[App] Initial state:', state)
    console.log('[App] Panel settings:', panelSettings)
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

  // Reset snippet sidebar to default width
  const handleSnippetResetWidth = useCallback(() => {
    setPanelSettings(prev => {
      const updated = { ...prev, snippetSidebar: { ...prev.snippetSidebar, width: DEFAULT_SNIPPET_WIDTH } }
      savePanelSettings(updated)
      return updated
    })
  }, [])

  // Request webpage content from WebView
  const handleRequestWebPageContent = useCallback(async () => {
    if (webViewRef.current?.fetchContent) {
      const content = await webViewRef.current.fetchContent()
      if (content) {
        setWebPageContent(content)
      }
    }
  }, [])


  // Handle snippet height resize (vertical)
  const handleSnippetHeightResize = useCallback((delta: number) => {
    setRightPanelHeights(prev => {
      const container = document.querySelector('.right-panel-container')
      if (!container) return prev
      const containerHeight = container.clientHeight
      const deltaPercent = (delta / containerHeight) * 100
      const newSnippetHeight = Math.min(80, Math.max(10, prev.snippet + deltaPercent))
      const newOracleHeight = Math.max(10, prev.oracle - deltaPercent)
      return {
        ...prev,
        snippet: newSnippetHeight,
        oracle: newOracleHeight
      }
    })
  }, [])

  // Handle API tester height resize
  const handleApiTesterResize = useCallback((delta: number) => {
    setApiTesterHeight(prev => {
      const newHeight = Math.min(600, Math.max(200, prev + delta))
      localStorage.setItem('api-tester-height', newHeight.toString())
      return newHeight
    })
  }, [])

  // Handle oracle height resize (vertical)
  const handleOracleHeightResize = useCallback((delta: number) => {
    setRightPanelHeights(prev => {
      const container = document.querySelector('.right-panel-container')
      if (!container) return prev
      const containerHeight = container.clientHeight
      const deltaPercent = (delta / containerHeight) * 100
      const newOracleHeight = Math.min(80, Math.max(10, prev.oracle + deltaPercent))
      const newWebviewHeight = Math.max(10, prev.webview - deltaPercent)
      return {
        ...prev,
        oracle: newOracleHeight,
        webview: newWebviewHeight
      }
    })
  }, [])

  useEffect(() => {
    const unsubscribe = workspaceStore.subscribe(() => {
      setState(workspaceStore.getState())
    })

    const unsubscribeSettings = settingsStore.subscribe(() => {
      setSettings(settingsStore.getSettings())
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
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
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
      unsubscribeSettings()
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

  const handleAddCopilotChat = useCallback((workspaceId: string) => {
    const terminal = workspaceStore.addCopilotChat(workspaceId)
    // Copilot chat doesn't need PTY creation
    workspaceStore.setFocusedTerminal(terminal.id)
  }, [])

  // Get the workspace for env dialog
  const envDialogWorkspace = envDialogWorkspaceId
    ? state.workspaces.find(w => w.id === envDialogWorkspaceId)
    : null

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
        onOpenSettings={() => setShowSettings(true)}
        onOpenAbout={() => setShowAbout(true)}
        showCopilot={showCopilot}
        onToggleCopilot={() => setShowCopilot(!showCopilot)}
        showApiTester={showApiTester}
        onToggleApiTester={() => setShowApiTester(!showApiTester)}
        showSnippets={showSnippetSidebar}
        onToggleSnippets={() => setShowSnippetSidebar(!showSnippetSidebar)}
        showOracle={showOracle}
        onToggleOracle={() => setShowOracle(!showOracle)}
        showWebView={showWebView}
        onToggleWebView={() => setShowWebView(!showWebView)}
        hasWebViewUrl={!!settings.webViewUrl}
        showFileExplorer={showFileExplorer}
        onToggleFileExplorer={() => setShowFileExplorer(!showFileExplorer)}
      />
      <ResizeHandle
        direction="horizontal"
        onResize={handleSidebarResize}
        onDoubleClick={handleSidebarResetWidth}
      />
      {/* File Explorer Panel - between sidebar and main content */}
      {showFileExplorer && !isFileExplorerFloating && (
        <>
          <FileExplorerPanel 
            isVisible={showFileExplorer}
            onClose={() => setShowFileExplorer(false)}
            width={fileExplorerWidth}
            isFloating={false}
            onToggleFloat={() => setIsFileExplorerFloating(true)}
            onAnalyzeFile={(fileName, content) => {
              setFileContentForAI({ fileName, content })
              setShowCopilot(true)
            }}
            workspaceId={state.activeWorkspaceId}
          />
          <ResizeHandle
            direction="horizontal"
            onResize={(delta) => {
              setFileExplorerWidth(prev => {
                const newWidth = Math.min(700, Math.max(300, prev + delta))
                localStorage.setItem('file-explorer-width', newWidth.toString())
                return newWidth
              })
            }}
            onDoubleClick={() => {
              setFileExplorerWidth(400)
              localStorage.setItem('file-explorer-width', '400')
            }}
          />
        </>
      )}

      {/* File Explorer Panel - floating mode */}
      {showFileExplorer && isFileExplorerFloating && (
        <FileExplorerPanel 
          isVisible={true}
          onClose={() => setShowFileExplorer(false)}
          width={450}
          isFloating={true}
          onToggleFloat={() => setIsFileExplorerFloating(false)}
          onAnalyzeFile={(fileName, content) => {
            setFileContentForAI({ fileName, content })
            setShowCopilot(true)
          }}
          workspaceId={state.activeWorkspaceId}
        />
      )}
      {/* API Tester Panel - between file explorer and main content */}
      {showApiTester && (
        <>
          <ApiTesterPanel 
            isVisible={showApiTester}
            onClose={() => setShowApiTester(false)}
            height={apiTesterHeight}
            onResize={handleApiTesterResize}
          />
          <ResizeHandle
            direction="horizontal"
            onResize={(delta) => {
              setApiTesterHeight(prev => {
                const newHeight = Math.min(600, Math.max(200, prev + delta))
                localStorage.setItem('api-tester-height', newHeight.toString())
                return newHeight
              })
            }}
            onDoubleClick={() => {
              setApiTesterHeight(300)
              localStorage.setItem('api-tester-height', '300')
            }}
          />
        </>
      )}
      {/* Copilot Chat Panel - between api and main content */}
      {showCopilot && (
        <>
          <CopilotChatPanel 
            isVisible={showCopilot}
            onClose={() => setShowCopilot(false)}
            width={copilotWidth}
            oracleQueryResult={oracleQueryResult}
            webPageContent={webPageContent}
            fileContent={fileContentForAI}
            onRequestWebPageContent={handleRequestWebPageContent}
            onOpenWebView={() => setShowWebView(true)}
            isWebViewOpen={showWebView}
            workspaceId={state.activeWorkspaceId}
          />
          <ResizeHandle
            direction="horizontal"
            onResize={(delta) => {
              setCopilotWidth(prev => {
                const newWidth = Math.min(700, Math.max(300, prev + delta))
                localStorage.setItem('copilot-width', newWidth.toString())
                return newWidth
              })
            }}
            onDoubleClick={() => {
              setCopilotWidth(400)
              localStorage.setItem('copilot-width', '400')
            }}
          />
        </>
      )}
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
                oracleQueryResult={oracleQueryResult}
              />
            </div>
          ))
        ) : (
          <div className="empty-state">
            <h2>Welcome to Better Agent Terminal</h2>
            <p>Click "+ Add Workspace" to get started</p>
          </div>
        )}
      </main>
      {/* Resize handle for snippet sidebar */}
      {showSnippetSidebar && !isSnippetFloating && !panelSettings.snippetSidebar.collapsed && (
        <ResizeHandle
          direction="horizontal"
          onResize={handleSnippetResize}
          onDoubleClick={handleSnippetResetWidth}
        />
      )}
      {/* Right panel container - only show if at least one panel is visible and docked */}
      {((showSnippetSidebar && !isSnippetFloating) || (showOracle && !isOracleFloating) || (showWebView && !isWebViewFloating && settings.webViewUrl)) && (
        <div className="right-panel-container" style={{ 
          width: panelSettings.snippetSidebar.width, 
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Snippets Panel */}
          {showSnippetSidebar && !isSnippetFloating && (
            <>
              <SnippetSidebar
                isVisible={showSnippetSidebar}
                width={panelSettings.snippetSidebar.width}
                collapsed={panelSettings.snippetSidebar.collapsed}
                onCollapse={handleSnippetCollapse}
                onPasteToTerminal={handlePasteToTerminal}
                style={{ 
                  height: ((!isOracleFloating && showOracle) || (!isWebViewFloating && showWebView && settings.webViewUrl)) 
                    ? `${rightPanelHeights.snippet}%` 
                    : '100%',
                  minHeight: '100px',
                  flex: ((!isOracleFloating && showOracle) || (!isWebViewFloating && showWebView && settings.webViewUrl)) 
                    ? undefined 
                    : 1
                }}
              />
              {((!isOracleFloating && showOracle) || (!isWebViewFloating && showWebView && settings.webViewUrl)) && (
                <ResizeHandle direction="vertical" onResize={handleSnippetHeightResize} />
              )}
            </>
          )}
          
          {/* Oracle Panel */}
          {showOracle && !isOracleFloating && (
            <>
              <div style={{ height: `${rightPanelHeights.oracle}%`, minHeight: '100px', overflow: 'auto' }}>
                <OraclePanel
                  onQueryResult={setOracleQueryResult}
                  isFloating={false}
                  onToggleFloat={() => setIsOracleFloating(true)}
                  onClose={() => setShowOracle(false)}
                />
              </div>
              {(!isWebViewFloating && showWebView && settings.webViewUrl) && (
                <ResizeHandle direction="vertical" onResize={handleOracleHeightResize} />
              )}
            </>
          )}
          
          {/* WebView Panel */}
          {showWebView && !isWebViewFloating && settings.webViewUrl && (
            <div style={{ height: `${rightPanelHeights.webview}%`, minHeight: '100px' }}>
              <WebViewPanel 
                ref={webViewRef}
                height="100%" 
                url={settings.webViewUrl}
                isFloating={false}
                onToggleFloat={() => setIsWebViewFloating(true)}
                onClose={() => setShowWebView(false)}
                onContentChange={setWebPageContent}
              />
            </div>
          )}
        </div>
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
                  background: 'none',
                  border: '1px solid #3a3836',
                  color: '#dfdbc3',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontSize: '12px',
                  borderRadius: '4px'
                }}
                title="关闭"
              >
                ✕
              </button>
            </div>
          </div>
          <SnippetSidebar
            isVisible={true}
            width={350}
            collapsed={false}
            onCollapse={() => {}}
            onPasteToTerminal={handlePasteToTerminal}
            style={{ height: 'auto' }}
          />
        </div>
      )}
      
      {showOracle && isOracleFloating && (
        <OraclePanel
          onQueryResult={setOracleQueryResult}
          isFloating={true}
          onToggleFloat={() => setIsOracleFloating(false)}
          onClose={() => setShowOracle(false)}
        />
      )}
      
      {showWebView && isWebViewFloating && settings.webViewUrl && (
        <WebViewPanel 
          ref={webViewRef}
          height="100%" 
          url={settings.webViewUrl}
          isFloating={true}
          onToggleFloat={() => setIsWebViewFloating(false)}
          onClose={() => setShowWebView(false)}
          onContentChange={setWebPageContent}
        />
      )}
      

      
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
      {showAbout && (
        <AboutPanel onClose={() => setShowAbout(false)} />
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
    </div>
  )
}
