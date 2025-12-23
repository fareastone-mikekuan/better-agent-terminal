import { useEffect, useRef, useState, useCallback } from 'react'
import { settingsStore } from '../stores/settings-store'
import { workspaceStore } from '../stores/workspace-store'
import type { CopilotChatOptions, CopilotMessage, TerminalInstance } from '../types'

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
  const [targetTerminalId, setTargetTerminalId] = useState<string>(terminalId)
  const [availableTerminals, setAvailableTerminals] = useState<TerminalInstance[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Extract bash commands from message content
  const extractCommands = (content: string): string[] => {
    // Match code blocks with various shell types: bash, sh, shell, powershell, pwsh, cmd, or no language specified
    const codeBlockRegex = /```(?:bash|sh|shell|powershell|pwsh|cmd|ps1)?\n([\s\S]*?)```/g
    const commands: string[] = []
    let match
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const cmd = match[1].trim()
      if (cmd) commands.push(cmd)
    }
    return commands
  }

  // Execute command in terminal and capture output
  const executeCommand = async (command: string) => {
    try {
      const targetTerminal = availableTerminals.find(t => t.id === targetTerminalId)
      const terminalName = targetTerminal?.title || 'Unknown'
      
      // Build execution message (but don't add yet)
      const executionMessage: CopilotMessage = {
        role: 'user',
        content: `[Agent 已執行命令到 "${terminalName}"] ${command}`
      }
      
      // Start capturing output BEFORE writing command
      await window.electronAPI.pty.startCapture(targetTerminalId)
      
      // Small delay to ensure capture is ready
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Write command to target terminal
      await window.electronAPI.pty.write(targetTerminalId, command + '\r')
      
      // Wait for command to execute (longer timeout for grep/find commands)
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Stop capturing and get output
      const output = await window.electronAPI.pty.stopCapture(targetTerminalId)
      
      console.log('[CopilotPanel] Raw output length:', output.length)
      console.log('[CopilotPanel] Raw output:', output)
      
      // Clean ANSI codes for better readability
      const cleanOutput = output
        .replace(/\x1b\[[0-9;]*m/g, '') // Remove color codes
        .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '') // Remove cursor control
        .replace(/\x1b\][^\x07]*\x07/g, '') // Remove OSC sequences
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\r/g, '\n') // Convert remaining \r to \n
        .split('\n')
        .filter(line => !line.includes(command)) // Remove echo of command itself
        .join('\n')
        .trim()
      
      console.log('[CopilotPanel] Clean output length:', cleanOutput.length)
      console.log('[CopilotPanel] Clean output:', cleanOutput)
      
      if (cleanOutput && cleanOutput.length > 0) {
        // Add output to chat automatically
        const outputMessage: CopilotMessage = {
          role: 'user',
          content: `[終端輸出 - ${cleanOutput.split('\n').length} 行]\n\`\`\`\n${cleanOutput}\n\`\`\``
        }
        
        // Build the messages array with the new output
        const updatedMessages = [...messages, executionMessage, outputMessage]
        setMessages(updatedMessages)
        
        // Auto-trigger analysis with updated messages
        setTimeout(() => {
          analyzeOutput(updatedMessages)
        }, 500)
      } else {
        // No output captured
        const noOutputMessage: CopilotMessage = {
          role: 'assistant',
          content: `✅ 命令已發送到終端 "${terminalName}"。\n\n如果有輸出但未捕獲，或需要更多時間執行，請手動複製輸出給我分析。`
        }
        setMessages(prev => [...prev, noOutputMessage])
      }
      
    } catch (error) {
      setError(`執行命令失敗: ${error}`)
    }
  }

  // Analyze captured output - accepts messages array directly to avoid closure issues
  const analyzeOutput = async (messagesWithOutput: CopilotMessage[]) => {
    if (isLoading || !isEnabled) return

    // Add analyzing message
    const analyzingMessage: CopilotMessage = {
      role: 'assistant',
      content: '✅ 命令已執行，輸出已捕獲。正在分析結果...'
    }
    setMessages(prev => [...prev, analyzingMessage])

    setIsLoading(true)
    setError(null)

    try {
      const systemPrompt: CopilotMessage = {
        role: 'system',
        content: 'You are an AI coding assistant analyzing command output. The user has executed a command and captured its output. Provide concise insights, identify issues, and suggest next steps. Answer in Traditional Chinese.'
      }
      
      const analysisPrompt: CopilotMessage = {
        role: 'user',
        content: '請分析上面的命令輸出結果。這個輸出告訴我們什麼？有沒有問題或需要注意的地方？'
      }
      
      const options: CopilotChatOptions = {
        messages: [systemPrompt, ...messagesWithOutput, analysisPrompt]
      }

      console.log('[CopilotPanel] Sending to Copilot, message count:', options.messages.length)

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
  }

  // Analyze captured output (callback version for manual trigger)
  const handleAnalyzeOutput = useCallback(async () => {
    analyzeOutput(messages)
  }, [messages, isLoading, isEnabled])

  // Check if Copilot is enabled - runs on mount and when settings change
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
    
    // Initial check
    checkCopilot()
    
    // Subscribe to settings changes to re-check when Copilot config updates
    const unsubscribe = settingsStore.subscribe(() => {
      checkCopilot()
    })
    
    return unsubscribe
  }, [])

  // Get available terminals and subscribe to changes
  useEffect(() => {
    const updateTerminals = () => {
      const state = workspaceStore.getState()
      // Get current workspace's terminals (exclude copilot terminal itself)
      const currentTerminal = state.terminals.find(t => t.id === terminalId)
      if (currentTerminal) {
        const workspaceTerminals = state.terminals.filter(
          t => t.workspaceId === currentTerminal.workspaceId && t.type === 'terminal'
        )
        setAvailableTerminals(workspaceTerminals)
        
        // If target terminal is not in the list, reset to first available
        if (workspaceTerminals.length > 0 && !workspaceTerminals.find(t => t.id === targetTerminalId)) {
          setTargetTerminalId(workspaceTerminals[0].id)
        }
      }
    }
    
    updateTerminals()
    const unsubscribe = workspaceStore.subscribe(updateTerminals)
    return unsubscribe
  }, [terminalId, targetTerminalId])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <span style={{ opacity: 0.7 }}>目標終端:</span>
          <select
            value={targetTerminalId}
            onChange={(e) => setTargetTerminalId(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #444',
              backgroundColor: '#2a2a2a',
              color: '#e0e0e0',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            {availableTerminals.map(terminal => (
              <option key={terminal.id} value={terminal.id}>
                {terminal.title}
              </option>
            ))}
          </select>
        </div>
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
