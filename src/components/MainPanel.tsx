import { useRef, useState } from 'react'
import type { TerminalInstance } from '../types'
import { TerminalPanel } from './TerminalPanel'
import { OraclePanel } from './OraclePanel'
import { WebViewPanel, type WebViewPanelRef } from './WebViewPanel'
import { FileExplorerPanel } from './FileExplorerPanel'
import { ApiTesterPanel } from './ApiTesterPanel'
import { GitPanel } from './GitPanel'
import { ActivityIndicator } from './ActivityIndicator'
import { getAgentPreset } from '../types/agent-presets'
import { workspaceStore } from '../stores/workspace-store'
import type { SelectionAIRequest } from './SelectionAIPopup'

interface MainPanelProps {
  terminal: TerminalInstance
  onClose: (id: string) => void
  onRestart: (id: string) => void
  onAnalyzeFile?: (fileContent: string, fileName: string) => void
  onOpenSelectionAI?: (req: SelectionAIRequest) => void
}

export function MainPanel({ terminal, onClose, onRestart, onAnalyzeFile, onOpenSelectionAI }: Readonly<MainPanelProps>) {
  const isAgent = terminal.agentPreset && terminal.agentPreset !== 'none'
  const agentConfig = isAgent ? getAgentPreset(terminal.agentPreset!) : null
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(terminal.title)
  const webViewRef = useRef<WebViewPanelRef>(null)

  const isWebLike = terminal.type === 'webview' || terminal.type === 'teams' || terminal.type === 'outlook' || terminal.type === 'copilotweb'

  const handleSelectionToCopilot = async (mode: 'analyze' | 'draft') => {
    try {
      const selection = await webViewRef.current?.fetchSelection()
      if (!selection?.text) {
        window.alert('請先用滑鼠反白框選文字，再按「分析選取 / 草擬回覆」。')
        return
      }

      onOpenSelectionAI?.({
        requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text: selection.text,
        url: selection.url,
        sourceTitle: terminal.title,
        sourceType: terminal.type,
        mode
      })
    } catch (e) {
      console.warn('[MainPanel] Failed to capture selection:', e)
    }
  }

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
          {isWebLike && (
            <>
              <button
                className="action-btn"
                onClick={() => handleSelectionToCopilot('analyze')}
                title="將目前框選文字交給 AI 分析"
              >
                分析選取
              </button>
              <button
                className="action-btn"
                onClick={() => handleSelectionToCopilot('draft')}
                title="將目前框選文字交給 AI 草擬回覆"
              >
                草擬回覆
              </button>
            </>
          )}
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
            ref={webViewRef}
            height="100%"
            url={terminal.url || ''}
            isFloating={false}
            terminalId={terminal.id}
            onContentChange={(content) => {
              // Store webview content in terminal for AI reading
              workspaceStore.updateTerminal(terminal.id, { webviewContent: content })
            }}
          />
        ) : terminal.type === 'teams' ? (
          <WebViewPanel
            ref={webViewRef}
            height="100%"
            url={terminal.url || 'https://teams.microsoft.com/v2/'}
            showToolbar={false}
            defaultZoom={100}
            partition="persist:m365"
            allowPopups={true}
            webPreferences="nativeWindowOpen=yes"
            isFloating={false}
            terminalId={terminal.id}
          />
        ) : terminal.type === 'outlook' ? (
          <WebViewPanel
            ref={webViewRef}
            height="100%"
            url={terminal.url || 'https://outlook.office.com/mail/'}
            showToolbar={false}
            defaultZoom={100}
            partition="persist:m365-outlook"
            allowPopups={true}
            webPreferences="nativeWindowOpen=yes"
            isFloating={false}
            terminalId={terminal.id}
          />
        ) : terminal.type === 'copilotweb' ? (
          <WebViewPanel
            ref={webViewRef}
            height="100%"
            url={terminal.url || 'https://m365.cloud.microsoft/chat/'}
            showToolbar={false}
            defaultZoom={100}
            partition="persist:m365"
            allowPopups={false}
            isFloating={false}
            terminalId={terminal.id}
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
        ) : terminal.type === 'git' ? (
          <GitPanel
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
