import { useState, useRef, useEffect } from 'react'
import type { TerminalInstance } from '../types'
import { TerminalThumbnail } from './TerminalThumbnail'
import { getAgentPreset } from '../types/agent-presets'

type TabType = 'terminal' | 'oracle' | 'webview' | 'file' | 'api'

interface ThumbnailBarProps {
  terminals: TerminalInstance[]
  focusedTerminalId: string | null
  onFocus: (id: string) => void
  onAddTerminal?: () => void
  onAddOracle?: () => void
  onAddWebView?: () => void
  onAddFile?: () => void
  onAddApiTester?: () => void
  showAddButton: boolean
  height?: number
  collapsed?: boolean
  onCollapse?: () => void
}

export function ThumbnailBar({
  terminals,
  focusedTerminalId,
  onFocus,
  onAddTerminal,
  onAddOracle,
  onAddWebView,
  onAddFile,
  onAddApiTester,
  showAddButton,
  height,
  collapsed = false,
  onCollapse
}: ThumbnailBarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('terminal')
  const menuRef = useRef<HTMLDivElement>(null)

  // Filter terminals by active tab
  const filteredTerminals = terminals.filter(t => {
    if (activeTab === 'terminal') {
      return t.type === 'terminal'
    }
    return t.type === activeTab
  })

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
      case 'file':
        return '檔案'
      case 'api':
        return 'API'
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
      case 'file':
        onAddFile?.()
        break
      case 'api':
        onAddApiTester?.()
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
