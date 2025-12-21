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
      const options: CopilotChatOptions = {
        messages: [...messages, userMessage]
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
            <p>👋 Hello! I'm GitHub Copilot. Ask me anything about coding, debugging, or development.</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`copilot-message ${msg.role}`}
          >
            <div className="message-role">
              {msg.role === 'user' ? '👤 You' : '⚡ Copilot'}
            </div>
            <div className="message-content">
              {msg.content}
            </div>
          </div>
        ))}

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
