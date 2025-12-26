import { useEffect, useRef, useState } from 'react'
import { settingsStore } from '../stores/settings-store'
import { workspaceStore } from '../stores/workspace-store'
import type { CopilotChatOptions, CopilotMessage, TerminalInstance } from '../types'

interface CopilotChatPanelProps {
  isVisible: boolean
  onClose: () => void
  width?: number
  onResize?: (delta: number) => void
  oracleQueryResult?: string | null
  webPageContent?: string | null
  onRequestWebPageContent?: () => Promise<void>
  onOpenWebView?: () => void
  isWebViewOpen?: boolean
}

export function CopilotChatPanel({ isVisible, onClose, width = 400, oracleQueryResult, webPageContent: webPageContentProp, onRequestWebPageContent, onOpenWebView, isWebViewOpen }: Readonly<CopilotChatPanelProps>) {
  const [isFloating, setIsFloating] = useState(() => {
    const saved = localStorage.getItem('copilot-floating')
    return saved ? JSON.parse(saved) : false
  })
  
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('copilot-position')
    return saved ? JSON.parse(saved) : { x: 100, y: 100 }
  })
  
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('copilot-size')
    return saved ? JSON.parse(saved) : { width: 500, height: 700 }
  })

  const [zIndex, setZIndex] = useState(1000)

  const [isEnabled, setIsEnabled] = useState(false)
  const [messages, setMessages] = useState<CopilotMessage[]>(() => {
    const saved = localStorage.getItem('copilot-messages')
    return saved ? JSON.parse(saved) : []
  })
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [targetTerminalId, setTargetTerminalId] = useState<string>('')
  const [availableTerminals, setAvailableTerminals] = useState<TerminalInstance[]>([])
  const [webPageContent, setWebPageContent] = useState<string | null>(webPageContentProp || null)
  const [oracleContent, setOracleContent] = useState<string | null>(oracleQueryResult || null)
  const [loadedOracleData, setLoadedOracleData] = useState(false)
  const [loadedWebPageData, setLoadedWebPageData] = useState(false)
  const terminalOutputBuffer = useRef<Map<string, string>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent) => {
    if (!isFloating) return
    setZIndex(1001) // 置顶
    isDragging.current = true
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
  }

  // Handle drag move
  useEffect(() => {
    const handleDragMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      })
    }

    const handleDragEnd = () => {
      isDragging.current = false
    }

    if (isFloating) {
      document.addEventListener('mousemove', handleDragMove)
      document.addEventListener('mouseup', handleDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleDragMove)
        document.removeEventListener('mouseup', handleDragEnd)
      }
    }
  }, [isFloating])

  // Update content when props change
  useEffect(() => {
    setOracleContent(oracleQueryResult || null)
  }, [oracleQueryResult])

  useEffect(() => {
    setWebPageContent(webPageContentProp || null)
  }, [webPageContentProp])

  useEffect(() => {
    localStorage.setItem('copilot-floating', JSON.stringify(isFloating))
  }, [isFloating])

  useEffect(() => {
    localStorage.setItem('copilot-position', JSON.stringify(position))
  }, [position])

  useEffect(() => {
    localStorage.setItem('copilot-size', JSON.stringify(size))
  }, [size])

  useEffect(() => {
    localStorage.setItem('copilot-messages', JSON.stringify(messages))
  }, [messages])

  // Check if Copilot is configured and subscribe to settings changes
  useEffect(() => {
    const updateEnabled = () => {
      const copilotConfig = settingsStore.getCopilotConfig()
      setIsEnabled(!!copilotConfig?.apiKey && !!copilotConfig?.model)
    }
    
    updateEnabled()
    const unsubscribe = settingsStore.subscribe(updateEnabled)
    return unsubscribe
  }, [])

  // Load available terminals
  useEffect(() => {
    const updateTerminals = () => {
      const state = workspaceStore.getState()
      const terminals = state.terminals.filter(t => t.type === 'terminal')
      setAvailableTerminals(terminals)
      if (!targetTerminalId && terminals.length > 0) {
        setTargetTerminalId(terminals[0].id)
      }
    }
    updateTerminals()
    const unsubscribe = workspaceStore.subscribe(updateTerminals)
    return unsubscribe
  }, [targetTerminalId])

  // Listen to terminal output
  useEffect(() => {
    const handleOutput = (id: string, data: string) => {
      const current = terminalOutputBuffer.current.get(id) || ''
      // Keep last 5000 characters
      terminalOutputBuffer.current.set(id, (current + data).slice(-5000))
    }

    const cleanup = window.electronAPI.pty.onOutput(handleOutput)
    return cleanup
  }, [])

  // Update oracle content when it changes
  useEffect(() => {
    if (oracleQueryResult) {
      setOracleContent(oracleQueryResult)
    }
  }, [oracleQueryResult])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Extract bash commands from message content
  const extractCommands = (content: string): string[] => {
    const codeBlockRegex = /```(?:bash|sh|shell|powershell|pwsh|cmd|ps1)?\n([\s\S]*?)```/g
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
      if (!targetTerminalId) {
        setError('請先選擇一個終端')
        return { success: false, error: '未選擇終端' }
      }

      const targetTerminal = availableTerminals.find(t => t.id === targetTerminalId)
      const terminalName = targetTerminal?.title || 'Unknown'
      
      // Clear output buffer before executing
      terminalOutputBuffer.current.set(targetTerminalId, '')

      // Send command
      await window.electronAPI.pty.write(targetTerminalId, command + '\n')
      
      // Wait for output
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Get output from buffer
      const output = terminalOutputBuffer.current.get(targetTerminalId) || '(無輸出)'
      
      // Clean up ANSI codes for display
      const cleanOutput = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim()

      const executionMessage: CopilotMessage = {
        role: 'assistant',
        content: `✅ 已在終端 "${terminalName}" 執行命令：\`${command}\`\n\n**輸出：**\n\`\`\`\n${cleanOutput.substring(0, 2000) || '(無輸出)'}\n\`\`\``
      }

      setMessages(prev => [...prev, executionMessage])
      return { success: true, output: cleanOutput }
    } catch (error) {
      console.error('Execute command error:', error)
      const errorMsg: CopilotMessage = {
        role: 'assistant',
        content: `❌ 執行命令失敗：${(error as Error).message}`
      }
      setMessages(prev => [...prev, errorMsg])
      return { success: false, error: (error as Error).message }
    }
  }

  // Auto-analyze command output
  const analyzeOutput = async (output: string) => {
    try {
      const copilotConfig = settingsStore.getCopilotConfig()
      if (!copilotConfig?.apiKey || !copilotConfig?.model) {
        return
      }

      setIsLoading(true)

      // Build message history with output included in context
      const analysisMessages = [
        ...messages,
        {
          role: 'user' as const,
          content: `根據上面的命令執行輸出，請分析這些檔案或目錄的用途：\n${output.substring(0, 3000)}`
        }
      ]

      const options: CopilotChatOptions = {
        messages: analysisMessages
      }

      const chatId = `analysis-${Date.now()}`
      const response = await window.electronAPI.copilot.chat(chatId, options)

      if (response && response.content) {
        const analysisMessage: CopilotMessage = {
          role: 'assistant',
          content: response.content
        }
        setMessages(prev => [...prev, analysisMessage])
      }
    } catch (error) {
      console.error('Analysis error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    let messageContent = input.trim()
    const needsAnalysis = /分析|分析檔案|分析目錄|分析结果|analyze/i.test(messageContent)
    
    // 如果有已读取的分析数据，附加到消息中
    if (loadedOracleData && oracleContent) {
      messageContent = `請分析以下Oracle查詢結果：\n\n${oracleContent}\n\n我的問題：${messageContent}`
    } else if (loadedWebPageData && webPageContent) {
      messageContent = `請分析以下網頁內容：\n\n${webPageContent}\n\n我的問題：${messageContent}`
    }

    const userMessage: CopilotMessage = {
      role: 'user',
      content: messageContent
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)
    setError(null)

    try {
      const copilotConfig = settingsStore.getCopilotConfig()

      if (!copilotConfig?.apiKey || !copilotConfig?.model) {
        throw new Error('請先在設定中配置 Copilot API Key 和模型')
      }

      const systemPrompt = `你是一個AI助手，專門幫助用戶操作終端和執行命令。

重要規則：
1. 當用戶要求執行命令時，簡潔回應（如："正在執行 ls 命令..."），然後立即提供代碼塊
2. 命令格式：\`\`\`bash\nls -la\n\`\`\`
3. 命令執行後，輸出會自動顯示在下一則訊息中
4. 如果用戶要求"執行並分析"，只需提供命令即可，不要在執行前分析
5. 看到執行結果後，用戶可以繼續提問

${oracleContent ? `\n資料庫查詢結果：\n${oracleContent}` : ''}
${webPageContent ? `\n網頁內容：\n${webPageContent}` : ''}`

      const options: CopilotChatOptions = {
        messages: [
          { role: 'system', content: systemPrompt },
          ...newMessages
        ]
      }

      const chatId = `chat-${Date.now()}`
      const response = await window.electronAPI.copilot.chat(chatId, options)

      if (!response || !response.content) {
        throw new Error('未收到回應')
      }

      const assistantMessage: CopilotMessage = {
        role: 'assistant',
        content: response.content
      }

      const updatedMessages = [...newMessages, assistantMessage]
      setMessages(updatedMessages)
      
      // 清除已读取的数据标记
      setLoadedOracleData(false)
      setLoadedWebPageData(false)

      // Auto-execute commands if enabled
      const commands = extractCommands(response.content)
      console.log('Extracted commands:', commands)
      console.log('Target terminal ID:', targetTerminalId)
      console.log('Available terminals:', availableTerminals.length)
      
      if (commands.length > 0) {
        if (!targetTerminalId) {
          setError('已提取到命令，但未選擇終端。請在下方選擇一個終端。')
        } else {
          // Execute all commands
          let allOutputs = ''
          for (const cmd of commands) {
            const result = await executeCommand(cmd)
            if (result.success && result.output) {
              allOutputs += `\n命令: ${cmd}\n輸出:\n${result.output}\n`
            }
          }
          
          // If user asked for analysis, automatically analyze the output
          if (needsAnalysis && allOutputs.trim()) {
            await analyzeOutput(allOutputs)
          }
        }
      }
    } catch (error) {
      console.error('Send message error:', error)
      setError((error as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isVisible) return null

  const panelClass = isFloating ? 'copilot-chat-panel floating' : 'copilot-chat-panel docked'
  const panelStyle = isFloating 
    ? { left: position.x, top: position.y, width: size.width, height: size.height, zIndex }
    : { width }

  return (
    <aside className={panelClass} style={panelStyle}>
      <div className="copilot-chat-header" onMouseDown={handleDragStart}>
        <h3>⚡ Copilot Chat</h3>
        <div className="copilot-chat-controls">
          {messages.length > 0 && (
            <button
              className="copilot-toggle-btn"
              onClick={() => {
                if (confirm('確定要清除所有聊天記錄嗎？')) {
                  setMessages([])
                  localStorage.removeItem('copilot-messages')
                }
              }}
              title="清除聊天記錄"
            >
              🗑️
            </button>
          )}
          <button
            className="copilot-toggle-btn"
            onClick={() => setIsFloating(!isFloating)}
            title={isFloating ? '固定面板' : '浮動面板'}
          >
            {isFloating ? '📌' : '🔓'}
          </button>
          <button className="copilot-close-btn" onClick={onClose}>×</button>
        </div>
      </div>

      {!isEnabled ? (
        <div className="copilot-chat-disabled">
          <p>❌ Copilot 未配置</p>
          <p>請在設定中配置 API Key 和模型</p>
        </div>
      ) : (
        <>
          <div className="copilot-chat-messages">
            {messages.length === 0 && (
              <div className="copilot-chat-empty">
                <p>👋 嗨！我是 Copilot</p>
                <p>有什麼可以幫助你的嗎？</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`copilot-message ${msg.role}`}>
                <div className="copilot-message-content">
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="copilot-message assistant">
                <div className="copilot-message-content">
                  ⏳ 思考中...
                </div>
              </div>
            )}
            {error && (
              <div className="copilot-message error">
                <div className="copilot-message-content">
                  ❌ {error}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="copilot-chat-actions">
            <button
              onClick={() => {
                if (oracleContent) {
                  setLoadedOracleData(true)
                  setLoadedWebPageData(false)
                } else {
                  setError('請先執行Oracle查詢')
                }
              }}
              className={`copilot-action-btn ${loadedOracleData ? 'active' : ''} ${!oracleContent ? 'hint-needed' : ''}`}
              title={oracleContent ? "分析Oracle查詢結果" : "請先執行Oracle查詢"}
            >
              🔍 分析Oracle
            </button>
            <button
              onClick={async () => {
                // 先检查WebView是否打开
                if (!isWebViewOpen) {
                  if (onOpenWebView) {
                    onOpenWebView()
                    setError('已開啟WebView面板，請稍後再試')
                  } else {
                    setError('請先點擊左側「網頁」按鈕開啟WebView面板')
                  }
                  return
                }
                
                // 如果没有内容，先抓取
                if (!webPageContent && onRequestWebPageContent) {
                  try {
                    await onRequestWebPageContent()
                    // 等待一下让状态更新
                    await new Promise(resolve => setTimeout(resolve, 500))
                  } catch (e) {
                    console.error('Failed to fetch web content:', e)
                    setError('無法抓取網頁內容')
                    return
                  }
                }
                
                // 现在应该有内容了
                if (webPageContent) {
                  setLoadedWebPageData(true)
                  setLoadedOracleData(false)
                } else {
                  setError('網頁內容為空，請確認網頁已加載')
                }
              }}
              className={`copilot-action-btn ${loadedWebPageData ? 'active' : ''}`}
              title="分析網頁內容"
            >
              🌐 分析網頁
            </button>
          </div>

          <div className="copilot-chat-input-area">
            {(loadedOracleData || loadedWebPageData) && (
              <div className="copilot-data-loaded-hint">
                ✅ 已讀取{loadedOracleData ? 'Oracle查詢結果' : '網頁內容'}，請輸入您的問題
                <button
                  onClick={() => {
                    setLoadedOracleData(false)
                    setLoadedWebPageData(false)
                  }}
                  className="copilot-clear-data-btn"
                  title="清除已讀取的資料"
                >
                  ✕
                </button>
              </div>
            )}
            {availableTerminals.length > 0 && (
              <select
                value={targetTerminalId}
                onChange={(e) => setTargetTerminalId(e.target.value)}
                className="copilot-terminal-select"
              >
                {availableTerminals.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder="輸入訊息... (Enter 發送, Shift+Enter 換行)"
              className="copilot-chat-input"
              rows={3}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !input.trim()}
              className="copilot-send-btn"
            >
              {isLoading ? '⏳' : '發送'}
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
