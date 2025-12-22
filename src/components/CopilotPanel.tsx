import { useEffect, useRef, useState, useCallback } from 'react'
import { settingsStore } from '../stores/settings-store'
import type { CopilotChatOptions, CopilotMessage } from '../types'

interface CopilotPanelProps {
  terminalId: string
  isActive?: boolean
}

export function CopilotPanel({ terminalId, isActive = true }: CopilotPanelProps) {
  const [isEnabled, setIsEnabled] = useState(false)
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Extract bash commands from message content
  const extractCommands = (content: string): string[] => {
    const codeBlockRegex = /```(?:bash|sh|shell)?\n([\s\S]*?)```/g
    const commands: string[] = []
    let match
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const cmd = match[1].trim()
      if (cmd) commands.push(cmd)
    }
    return commands
  }

  // Execute command in terminal
  const executeCommand = async (command: string) => {
    try {
      // Write command to terminal
      await window.electronAPI.pty.write(terminalId, command + '\r')
      
      // Add execution notice to chat
      const executionMessage: CopilotMessage = {
        role: 'user',
        content: `[Agent 已執行命令] ${command}`
      }
      setMessages(prev => [...prev, executionMessage])
      
      // Prompt to analyze results
      const promptMessage: CopilotMessage = {
        role: 'assistant',
        content: `✅ 命令已發送到終端。\n\n如果執行後有錯誤或需要分析結果，請：\n1. 複製終端輸出\n2. 貼上並告訴我遇到什麼問題`
      }
      setMessages(prev => [...prev, promptMessage])
      
    } catch (error) {
      setError(`執行命令失敗: ${error}`)
    }
  }

  // Check if Copilot is enabled
  useEffect(() => {
    const checkCopilot = async () => {
      try {
        const enabled = await window.electronAPI.copilot.isEnabled()
        setIsEnabled(enabled)
      } catch (err) {
        console.error('Failed to check Copilot status:', err)
        setIsEnabled(false)
      }
    }
    checkCopilot()
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle sending a message
  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isLoading || !isEnabled) return

    const userMessage: CopilotMessage = {
      role: 'user',
      content: input
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setError(null)

    try {
      // Add system prompt for agent capabilities
      const systemPrompt: CopilotMessage = {
        role: 'assistant',
        content: 'You are an AI coding assistant with command execution capabilities. When users ask for help:\n\n1. Analyze their problem\n2. Suggest shell commands in ```bash blocks\n3. Users can click the execute button to run commands\n4. Users will paste terminal output for you to analyze\n5. Continue helping based on the results\n\nBe concise and helpful. Explain commands clearly and warn about risks. Remember: you CANNOT see terminal output directly - users must paste it to you.'
      }
      
      const options: CopilotChatOptions = {
        messages: [systemPrompt, ...messages, userMessage]
      }

      const response = await window.electronAPI.copilot.chat(terminalId, options)

      if (response.error) {
        setError(response.error)
      } else {
        const assistantMessage: CopilotMessage = {
          role: 'assistant',
          content: response.content
        }
        setMessages(prev => [...prev, assistantMessage])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, isEnabled, messages, terminalId])

  // Handle keyboard shortcut (Enter to send, Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  if (!isEnabled) {
    return (
      <div className="copilot-panel disabled" ref={containerRef}>
        <div className="copilot-message info">
          <p>GitHub Copilot is not configured.</p>
          <p>Please add your GitHub API key in Settings to enable GitHub Copilot integration.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="copilot-panel" ref={containerRef}>
      <div className="copilot-header">
        <h3>⚡ GitHub Copilot Chat</h3>
      </div>

      <div className="copilot-messages">
        {messages.length === 0 && (
          <div className="copilot-message info">
            <p>👋 你好！我是 GitHub Copilot Agent。</p>
            <p>💡 使用方式：</p>
            <ol style={{ marginLeft: '20px', marginTop: '8px' }}>
              <li>🗣️ 告訴我你的問題或需求</li>
              <li>⚡ 我會建議解決方案和命令</li>
              <li>🖱️ 點擊綠色按鈕執行命令</li>
              <li>📋 複製終端輸出貼給我分析</li>
              <li>🔄 根據結果繼續改進</li>
            </ol>
            <p style={{ marginTop: '12px', fontSize: '13px', opacity: 0.7 }}>
              ⚠️ 注意：我看不到終端輸出，需要你複製貼上給我
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const commands = msg.role === 'assistant' ? extractCommands(msg.content) : []
          
          return (
            <div
              key={idx}
              className={`copilot-message ${msg.role}`}
            >
              <div className="message-role">
                {msg.role === 'user' ? '👤 You' : '⚡ Copilot'}
              </div>
              <div className="message-content">
                <pre style={{ 
                  whiteSpace: 'pre-wrap', 
                  wordWrap: 'break-word',
                  fontFamily: 'inherit',
                  margin: 0
                }}>
                  {msg.content}
                </pre>
                {commands.length > 0 && (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {commands.map((cmd, cmdIdx) => (
                      <button
                        key={cmdIdx}
                        onClick={() => executeCommand(cmd)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontFamily: 'monospace',
                          textAlign: 'left'
                        }}
                        title="點擊執行此命令"
                      >
                        ▶ {cmd.length > 60 ? cmd.substring(0, 60) + '...' : cmd}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {isLoading && (
          <div className="copilot-message assistant loading">
            <div className="message-role">⚡ Copilot</div>
            <div className="message-content">
              <span className="loading-spinner">⏳</span> Thinking...
            </div>
          </div>
        )}

        {error && (
          <div className="copilot-message error">
            <div className="message-role">❌ Error</div>
            <div className="message-content">{error}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="copilot-input-area">
        <textarea
          className="copilot-input"
          placeholder="Ask GitHub Copilot... (Press Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={3}
        />
        <button
          className="copilot-send-btn"
          onClick={handleSendMessage}
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
