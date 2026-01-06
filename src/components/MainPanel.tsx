import { useState } from 'react'
import type { TerminalInstance } from '../types'
import { TerminalPanel } from './TerminalPanel'
import { OraclePanel } from './OraclePanel'
import { WebViewPanel } from './WebViewPanel'
import { FileExplorerPanel } from './FileExplorerPanel'
import { ApiTesterPanel } from './ApiTesterPanel'
import { ActivityIndicator } from './ActivityIndicator'
import { getAgentPreset } from '../types/agent-presets'
import { workspaceStore } from '../stores/workspace-store'

interface MainPanelProps {
  terminal: TerminalInstance
  onClose: (id: string) => void
  onRestart: (id: string) => void
  onAnalyzeFile?: (fileContent: string, fileName: string) => void
}

export function MainPanel({ terminal, onClose, onRestart, onAnalyzeFile }: Readonly<MainPanelProps>) {
  const isAgent = terminal.agentPreset && terminal.agentPreset !== 'none'
  const agentConfig = isAgent ? getAgentPreset(terminal.agentPreset!) : null
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(terminal.title)

  const handleDoubleClick = () => {
    setEditValue(terminal.title)
    setIsEditing(true)
  }

  const handleSave = () => {
    if (editValue.trim()) {
      workspaceStore.renameTerminal(terminal.id, editValue.trim())
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  return (
    <div className="main-panel">
      <div className="main-panel-header">
        <div
          className={`main-panel-title ${isAgent ? 'agent-terminal' : ''}`}
          style={agentConfig ? { '--agent-color': agentConfig.color } as React.CSSProperties : undefined}
          onDoubleClick={handleDoubleClick}
          title="Double-click to rename"
        >
          {isAgent && <span>{agentConfig?.icon}</span>}
          {isEditing ? (
            <input
              type="text"
              className="terminal-name-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          ) : (
            <span>{terminal.title}</span>
          )}
        </div>
        <div className="main-panel-actions">
          <ActivityIndicator
            terminalId={terminal.id}
            size="small"
          />
          {terminal.type === 'terminal' && (
            <button
              className="action-btn"
              onClick={() => onRestart(terminal.id)}
              title="Restart terminal"
            >
              ⟳
            </button>
          )}
          <button
            className="action-btn danger"
            onClick={() => onClose(terminal.id)}
            title="Close terminal"
          >
            ×
          </button>
        </div>
      </div>
      <div className="main-panel-content">
        {terminal.type === 'terminal' ? (
          <TerminalPanel terminalId={terminal.id} terminalType={terminal.type} />
        ) : terminal.type === 'oracle' ? (
          <OraclePanel
            isFloating={false}
            workspaceId={terminal.workspaceId}
            onQueryResult={(result) => {
              // Store oracle query result in terminal for AI reading
              workspaceStore.updateTerminal(terminal.id, { oracleQueryResult: result })
            }}
          />
        ) : terminal.type === 'webview' ? (
          <WebViewPanel
            height="100%"
            url={terminal.url || ''}
            isFloating={false}
            terminalId={terminal.id}
            onContentChange={(content) => {
              // Store webview content in terminal for AI reading
              workspaceStore.updateTerminal(terminal.id, { webviewContent: content })
            }}
          />
        ) : terminal.type === 'file' ? (
          <FileExplorerPanel
            isVisible={true}
            onClose={() => {}}
            workspaceId={terminal.workspaceId}
            isFloating={false}
            onAnalyzeFile={onAnalyzeFile}
          />
        ) : terminal.type === 'api' ? (
          <ApiTesterPanel
            isVisible={true}
            onClose={() => {}}
            isFloating={false}
            workspaceId={terminal.workspaceId}
          />
        ) : null}
      </div>
    </div>
  )
}
