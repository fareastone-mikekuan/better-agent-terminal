import { useState, useRef, useEffect } from 'react'
import type { TerminalInstance } from '../types'
import { TerminalThumbnail } from './TerminalThumbnail'
import { getAgentPreset } from '../types/agent-presets'

type TabType = 'terminal' | 'oracle' | 'webview' | 'teams' | 'outlook' | 'copilotweb' | 'file' | 'api' | 'git'

interface ThumbnailBarProps {
  terminals: TerminalInstance[]
  focusedTerminalId: string | null
  onFocus: (id: string) => void
  onAddTerminal?: () => void
  onAddOracle?: () => void
  onAddWebView?: () => void
  onAddTeams?: () => void
  onAddOutlook?: () => void
  onAddCopilotWeb?: () => void
  onAddFile?: () => void
  onAddApiTester?: () => void
  onAddGit?: () => void
  showAddButton: boolean
  height?: number
  collapsed?: boolean
  onCollapse?: () => void
  activeTab?: TabType
  onActiveTabChange?: (tab: TabType) => void
}

export function ThumbnailBar({
  terminals,
  focusedTerminalId,
  onFocus,
  onAddTerminal,
  onAddOracle,
  onAddWebView,
  onAddTeams,
  onAddOutlook,
  onAddCopilotWeb,
  onAddFile,
  onAddApiTester,
  onAddGit,
  showAddButton,
  height,
  collapsed = false,
  onCollapse,
  activeTab: externalActiveTab,
  onActiveTabChange
}: ThumbnailBarProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<TabType>('terminal')
  const activeTab = externalActiveTab !== undefined ? externalActiveTab : internalActiveTab
  const setActiveTab = onActiveTabChange || setInternalActiveTab
  const menuRef = useRef<HTMLDivElement>(null)
  // Remember last focused terminal for each tab type
  const lastFocusedRef = useRef<Record<TabType, string | null>>({
    terminal: null,
    oracle: null,
    webview: null,
    teams: null,
    outlook: null,
    copilotweb: null,
    file: null,
    api: null,
    git: null
  })

  // Update last focused terminal when focus changes
  useEffect(() => {
    if (focusedTerminalId) {
      const focusedTerminal = terminals.find(t => t.id === focusedTerminalId)
      if (focusedTerminal) {
        const tabType = focusedTerminal.type === 'terminal' ? 'terminal' : focusedTerminal.type as TabType
        lastFocusedRef.current[tabType] = focusedTerminalId
      }
    }
  }, [focusedTerminalId, terminals])

  // Filter terminals by active tab
  const filteredTerminals = terminals.filter(t => {
    if (activeTab === 'terminal') {
      return t.type === 'terminal'
    }
    return t.type === activeTab
  })

  // Auto-focus appropriate terminal when switching tabs
  useEffect(() => {
    const filtered = terminals.filter(t => {
      if (activeTab === 'terminal') {
        return t.type === 'terminal'
      }
      return t.type === activeTab
    })
    
    if (filtered.length > 0) {
      // Check if current focused terminal is of the active tab type
      const focusedTerminal = terminals.find(t => t.id === focusedTerminalId)
      const isFocusedCorrectType = focusedTerminal && (
        (activeTab === 'terminal' && focusedTerminal.type === 'terminal') ||
        (activeTab !== 'terminal' && focusedTerminal.type === activeTab)
      )
      
      if (!isFocusedCorrectType) {
        // Try to restore last focused terminal of this type
        const lastFocused = lastFocusedRef.current[activeTab]
        const lastTerminal = lastFocused ? filtered.find(t => t.id === lastFocused) : null
        
        if (lastTerminal) {
          // Restore to last focused terminal
          onFocus(lastTerminal.id)
        } else {
          // Fall back to first terminal of this type
          onFocus(filtered[0].id)
        }
      }
    }
    // No terminals of this type - just show empty state, don't auto-create
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Check if these are agent terminals or regular terminals
  const firstTerminal = filteredTerminals[0]
  const isAgentList = firstTerminal?.agentPreset && firstTerminal.agentPreset !== 'none'
  
  // Get label based on active tab
  const getTabLabel = () => {
    switch (activeTab) {
      case 'terminal':
        return isAgentList ? (getAgentPreset(firstTerminal.agentPreset!)?.name || 'Agent') : 'Terminal'
      case 'oracle':
        return '資料庫'
      case 'webview':
        return '網頁'
      case 'teams':
        return 'Teams'
      case 'outlook':
        return 'Outlook'
      case 'copilotweb':
        return 'Copilot'
      case 'file':
        return '檔案'
      case 'api':
        return 'API'
      case 'git':
        return 'Git'
    }
  }
  const label = getTabLabel()

  // Collapsed state - show icon bar
  if (collapsed) {
    return (
      <div
        className="collapsed-bar collapsed-bar-bottom"
        onClick={onCollapse}
        title="Expand Thumbnails"
      >
        <div className="collapsed-bar-icon">🖼️</div>
        <span className="collapsed-bar-label">{label}</span>
      </div>
    )
  }

  const style = height ? { height: `${height}px`, flex: 'none' } : undefined

  const handleAddClick = () => {
    switch (activeTab) {
      case 'terminal':
        onAddTerminal?.()
        break
      case 'oracle':
        onAddOracle?.()
        break
      case 'webview':
        onAddWebView?.()
        break
      case 'teams':
        onAddTeams?.()
        break
      case 'outlook':
        onAddOutlook?.()
        break
      case 'copilotweb':
        onAddCopilotWeb?.()
        break
      case 'file':
        onAddFile?.()
        break
      case 'api':
        onAddApiTester?.()
        break
      case 'git':
        onAddGit?.()
        break
    }
  }

  return (
    <div className="thumbnail-bar" style={style}>
      <div className="thumbnail-bar-header">
        {/* Tab Navigation */}
        <div className="thumbnail-tabs">
          <button
            className={`thumbnail-tab ${activeTab === 'terminal' ? 'active' : ''}`}
            onClick={() => setActiveTab('terminal')}
          >
            💻 Terminal
          </button>
          <button
            className={`thumbnail-tab ${activeTab === 'oracle' ? 'active' : ''}`}
            onClick={() => setActiveTab('oracle')}
          >
            🗄️ 資料庫
          </button>
          <button
            className={`thumbnail-tab ${activeTab === 'webview' ? 'active' : ''}`}
            onClick={() => setActiveTab('webview')}
          >
            🌐 網頁
          </button>
          <button
            className={`thumbnail-tab ${activeTab === 'teams' ? 'active' : ''}`}
            onClick={() => setActiveTab('teams')}
          >
            💬 Teams
          </button>
          <button
            className={`thumbnail-tab ${activeTab === 'outlook' ? 'active' : ''}`}
            onClick={() => setActiveTab('outlook')}
          >
            📧 Outlook
          </button>
          <button
            className={`thumbnail-tab ${activeTab === 'copilotweb' ? 'active' : ''}`}
            onClick={() => setActiveTab('copilotweb')}
          >
            🤖 Copilot
          </button>
          <button
            className={`thumbnail-tab ${activeTab === 'file' ? 'active' : ''}`}
            onClick={() => setActiveTab('file')}
          >
            📁 FILE
          </button>
          <button
            className={`thumbnail-tab ${activeTab === 'api' ? 'active' : ''}`}
            onClick={() => setActiveTab('api')}
          >
            🔌 API
          </button>
          <button
            className={`thumbnail-tab ${activeTab === 'git' ? 'active' : ''}`}
            onClick={() => setActiveTab('git')}
          >
            🔀 Git
          </button>
        </div>
        <div className="thumbnail-bar-actions">
          {/* Add button based on active tab */}
          <button 
            className="thumbnail-add-btn" 
            onClick={handleAddClick} 
            title={`新增${label}`}
          >
            +
          </button>
          {onCollapse && (
            <button className="thumbnail-collapse-btn" onClick={onCollapse} title="Collapse Panel">
              ▼
            </button>
          )}
        </div>
      </div>
      <div className="thumbnail-list">
        {filteredTerminals.length > 0 ? (
          filteredTerminals.map(terminal => (
            <TerminalThumbnail
              key={terminal.id}
              terminal={terminal}
              isActive={terminal.id === focusedTerminalId}
              onClick={() => onFocus(terminal.id)}
            />
          ))
        ) : (
          <div style={{ 
            padding: '20px', 
            textAlign: 'center', 
            color: '#888', 
            fontSize: '12px' 
          }}>
            尚無{label}，點擊上方 + 新增
          </div>
        )}
      </div>
    </div>
  )
}
