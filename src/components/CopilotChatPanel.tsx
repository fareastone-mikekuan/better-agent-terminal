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
  fileContent?: { fileName: string; content: string } | null
  onRequestWebPageContent?: () => Promise<void>
  onOpenWebView?: () => void
  isWebViewOpen?: boolean
  workspaceId?: string | null  // 用於工作區獨立模式
}

export function CopilotChatPanel({ isVisible, onClose, width = 400, oracleQueryResult, webPageContent: webPageContentProp, fileContent: fileContentProp, onRequestWebPageContent, onOpenWebView, isWebViewOpen, workspaceId }: Readonly<CopilotChatPanelProps>) {
  // 根據設定決定使用共用或獨立的 localStorage 鍵
  const [settings, setSettings] = useState(() => settingsStore.getSettings())
  const isShared = settings.sharedPanels?.copilot !== false
  const storageKey = isShared ? 'copilot-messages' : `copilot-messages-${workspaceId || 'default'}`
  
  // 訂閱設定變更
  useEffect(() => {
    const unsubscribe = settingsStore.subscribe(() => {
      setSettings(settingsStore.getSettings())
    })
    return unsubscribe
  }, [])
  
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
  const [messages, setMessages] = useState<CopilotMessage[]>([])  // 初始化為空陣列，在 useEffect 中載入
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [targetTerminalId, setTargetTerminalId] = useState<string>('')
  const [availableTerminals, setAvailableTerminals] = useState<TerminalInstance[]>([])
  const [webPageContent, setWebPageContent] = useState<string | null>(webPageContentProp || null)
  const [fileContent, setFileContent] = useState<{ fileName: string; content: string } | null>(fileContentProp || null)
  const [oracleContent, setOracleContent] = useState<string | null>(oracleQueryResult || null)
  const [loadedOracleData, setLoadedOracleData] = useState(false)
  const [loadedWebPageData, setLoadedWebPageData] = useState(false)
  const [loadedFileData, setLoadedFileData] = useState(false)
  const terminalOutputBuffer = useRef<Map<string, string>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const isLoadingMessages = useRef(false)

  // 匯出對話為 JSON 檔案
  const exportMessages = () => {
    const dataStr = JSON.stringify({
      storageKey,
      workspaceId,
      workspaceName: workspaceStore.getState().workspaces.find(w => w.id === workspaceId)?.name || 'unknown',
      exportTime: new Date().toISOString(),
      messages
    }, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `copilot-chat-${workspaceId || 'shared'}-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  // 匯出為 Markdown 檔案
  const exportAsMarkdown = () => {
    const workspaceName = workspaceStore.getState().workspaces.find(w => w.id === workspaceId)?.name || 'unknown'
    let markdown = `# Copilot Chat History\n\n`
    markdown += `**Workspace**: ${workspaceName}\n`
    markdown += `**Storage Key**: ${storageKey}\n`
    markdown += `**Export Time**: ${new Date().toLocaleString()}\n`
    markdown += `**Messages**: ${messages.length}\n\n---\n\n`
    
    messages.forEach((msg, idx) => {
      const time = new Date(msg.timestamp).toLocaleString()
      markdown += `## Message ${idx + 1} - ${msg.role}\n\n`
      markdown += `*${time}*\n\n`
      markdown += `${msg.content}\n\n---\n\n`
    })
    
    const dataBlob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `copilot-chat-${workspaceId || 'shared'}-${Date.now()}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  // 匯入對話
  const importMessages = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string)
          if (data.messages && Array.isArray(data.messages)) {
            if (confirm(`確定要匯入 ${data.messages.length} 筆訊息嗎？\n\n來源: ${data.workspaceName || 'unknown'}\n時間: ${data.exportTime || 'unknown'}\n\n當前訊息將被取代！`)) {
              setMessages(data.messages)
            }
          } else {
            alert('無效的檔案格式！')
          }
        } catch (error) {
          alert('讀取檔案失敗！')
          console.error('Import error:', error)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // 查看所有工作區的對話
  const viewAllMessages = () => {
    const allKeys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('copilot-messages')) {
        allKeys.push(key)
      }
    }
    
    let info = `📊 所有 Copilot 對話記錄\n\n`
    info += `當前使用: ${storageKey}\n`
    info += `當前訊息數: ${messages.length}\n\n`
    info += `──────────\n\n`
    
    allKeys.forEach(key => {
      const data = localStorage.getItem(key)
      if (data) {
        try {
          const msgs = JSON.parse(data)
          const isCurrent = key === storageKey
          info += `${isCurrent ? '➡️ ' : '▫️ '} ${key}\n`
          info += `   訊息數: ${msgs.length}\n\n`
        } catch (e) {
          // ignore
        }
      }
    })
    
    alert(info)
  }

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
    setFileContent(fileContentProp || null)
    if (fileContentProp) {
      setLoadedFileData(true)
      // 添加系統訊息提示
      const systemMessage: CopilotMessage = {
        role: 'system',
        content: `📁 已載入檔案：${fileContentProp.fileName}\n檔案大小：${(fileContentProp.content.length / 1024).toFixed(2)} KB\n\n請在下方輸入您的問題，AI 會根據檔案內容回答。`,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, systemMessage])
      // 預填輸入提示
      setInput('請分析這個檔案')
    }
  }, [fileContentProp])

  useEffect(() => {
    localStorage.setItem('copilot-floating', JSON.stringify(isFloating))
  }, [isFloating])

  useEffect(() => {
    localStorage.setItem('copilot-position', JSON.stringify(position))
  }, [position])

  useEffect(() => {
    localStorage.setItem('copilot-size', JSON.stringify(size))
  }, [size])

  // Reload messages when workspace or storage key changes (must be BEFORE save effect)
  useEffect(() => {
    console.log('[Copilot] Loading messages for storageKey:', storageKey, 'workspaceId:', workspaceId)
    isLoadingMessages.current = true
    const saved = localStorage.getItem(storageKey)
    const loadedMessages = saved ? JSON.parse(saved) : []
    console.log('[Copilot] Loaded', loadedMessages.length, 'messages')
    setMessages(loadedMessages)
    // Use setTimeout to ensure the state update is processed before we allow saving again
    setTimeout(() => {
      isLoadingMessages.current = false
    }, 0)
  }, [storageKey, workspaceId])

  // Save messages to localStorage (but not when loading)
  useEffect(() => {
    if (!isLoadingMessages.current) {
      console.log('[Copilot] Saving', messages.length, 'messages to storageKey:', storageKey)
      localStorage.setItem(storageKey, JSON.stringify(messages))
    }
  }, [messages, storageKey])

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
      const currentSettings = settingsStore.getSettings()
      const isShared = currentSettings.sharedPanels?.copilot !== false
      
      // If shared, show all terminals; if not shared, only show current workspace's terminals
      let terminals = state.terminals.filter(t => t.type === 'terminal')
      
      if (!isShared && workspaceId) {
        terminals = terminals.filter(t => t.workspaceId === workspaceId)
        console.log('[Copilot] Filtered terminals for workspace:', workspaceId, 'count:', terminals.length)
      } else {
        console.log('[Copilot] Showing all terminals, count:', terminals.length)
      }
      
      setAvailableTerminals(terminals)
      
      // Reset target terminal if current one is not in the filtered list
      if (targetTerminalId && !terminals.find(t => t.id === targetTerminalId)) {
        setTargetTerminalId(terminals.length > 0 ? terminals[0].id : '')
      } else if (!targetTerminalId && terminals.length > 0) {
        setTargetTerminalId(terminals[0].id)
      }
    }
    updateTerminals()
    const unsubscribe = workspaceStore.subscribe(updateTerminals)
    return unsubscribe
  }, [targetTerminalId, workspaceId])

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

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    let messageContent = input.trim()

    
    // 如果有已读取的分析数据，附加到消息中
    if (loadedFileData && fileContent) {
      messageContent = `請分析以下檔案內容：\n\n檔案名稱：${fileContent.fileName}\n\n內容：\n${fileContent.content}\n\n我的問題：${messageContent}`
      setLoadedFileData(false)
      setFileContent(null)
    } else if (loadedOracleData && oracleContent) {
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

      // Check if response contains commands (for user awareness)
      const commands = extractCommands(response.content)
      
      if (commands.length > 0) {
        // Just show a warning message, don't auto-execute
        const commandListMsg: CopilotMessage = {
          role: 'system',
          content: `ℹ️ **偵測到 ${commands.length} 個命令**\n\n如需執行這些命令，請手動複製到終端執行，或使用下方的執行按鈕。\n\n⚠️ **安全提示**：執行前請仔細檢查命令內容，確保安全。`
        }
        setMessages(prev => [...prev, commandListMsg])
      }
    } catch (error) {
      console.error('Send message error:', error)
      setError((error as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isVisible) return null

  // Get workspace name for display
  const state = workspaceStore.getState()
  const currentWorkspace = state.workspaces.find(w => w.id === workspaceId)
  const workspaceName = currentWorkspace?.alias || currentWorkspace?.name || '未知工作區'
  const modeLabel = isShared ? '🌐 共用' : `🔒 ${workspaceName}`

  const panelClass = isFloating ? 'copilot-chat-panel floating' : 'copilot-chat-panel docked'
  const panelStyle = isFloating 
    ? { left: position.x, top: position.y, width: size.width, height: size.height, zIndex }
    : { width }

  return (
    <aside className={panelClass} style={panelStyle}>
      <div className="copilot-chat-header" onMouseDown={handleDragStart}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3>⚡ AI</h3>
          <span style={{ 
            fontSize: '11px', 
            color: isShared ? '#7bbda4' : '#f59e0b',
            backgroundColor: isShared ? '#2d4a2d' : '#3d2f1f',
            padding: '2px 8px',
            borderRadius: '10px',
            fontWeight: 'bold'
          }}>
            {modeLabel}
          </span>
        </div>
        <div className="copilot-chat-controls">
          {messages.length > 0 && (
            <>
              <button
                className="copilot-toggle-btn"
                onClick={exportAsMarkdown}
                title="匯出為 Markdown"
              >
                📝
              </button>
              <button
                className="copilot-toggle-btn"
                onClick={exportMessages}
                title="匯出對話 (JSON)"
              >
                💾
              </button>
            </>
          )}
          <button
            className="copilot-toggle-btn"
            onClick={importMessages}
            title="匯入對話"
          >
            📂
          </button>
          <button
            className="copilot-toggle-btn"
            onClick={viewAllMessages}
            title="查看所有對話"
          >
            📊
          </button>
          {messages.length > 0 && (
            <button
              className="copilot-toggle-btn"
              onClick={() => {
                if (confirm('確定要清除所有聊天記錄嗎？\n\n建議先匯出保存！')) {
                  setMessages([])
                  localStorage.removeItem(storageKey)
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
            {isFloating ? '📌' : '🔗'}
          </button>
          <button className="copilot-close-btn" onClick={onClose}>×</button>
        </div>
      </div>

      {!isEnabled ? (
        <div className="copilot-chat-disabled">
          <p>❌ AI 未配置</p>
          <p>請在設定中配置 API Key 和模型</p>
        </div>
      ) : (
        <>
          <div className="copilot-chat-messages">
            {messages.length === 0 && (
              <div className="copilot-chat-empty">
                <p>👋 嗨！我是 AI 助手</p>
                <p>有什麼可以幫助你的嗎？</p>
              </div>
            )}
            {messages.map((msg, idx) => {
              const commands = msg.role === 'assistant' ? extractCommands(msg.content) : []
              return (
                <div key={idx} className={`copilot-message ${msg.role}`}>
                  <div className="copilot-message-content">
                    {msg.content}
                  </div>
                  {commands.length > 0 && (
                    <div style={{ 
                      marginTop: '8px', 
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: '6px',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      borderRadius: '4px',
                      border: '1px solid #3a3836'
                    }}>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#dfdbc3', 
                        fontWeight: 'bold',
                        marginBottom: '4px'
                      }}>
                        🔧 偵測到 {commands.length} 個命令：
                      </div>
                      {commands.map((cmd, cmdIdx) => (
                        <div key={cmdIdx} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px',
                          fontSize: '11px'
                        }}>
                          <code style={{ 
                            flex: 1, 
                            padding: '4px 8px', 
                            backgroundColor: '#1f1d1a',
                            borderRadius: '3px',
                            color: '#7bbda4',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {cmd}
                          </code>
                          <button
                            onClick={() => executeCommand(cmd)}
                            disabled={!targetTerminalId}
                            style={{
                              padding: '4px 12px',
                              backgroundColor: targetTerminalId ? '#7bbda4' : '#555',
                              color: targetTerminalId ? '#1f1d1a' : '#999',
                              border: 'none',
                              borderRadius: '3px',
                              cursor: targetTerminalId ? 'pointer' : 'not-allowed',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              whiteSpace: 'nowrap'
                            }}
                            title={targetTerminalId ? '執行命令' : '請先選擇終端'}
                          >
                            ▶ 執行
                          </button>
                        </div>
                      ))}
                      {!targetTerminalId && (
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#f59e0b',
                          marginTop: '4px'
                        }}>
                          ⚠️ 請在下方選擇目標終端
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
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
                  setLoadedFileData(false)
                } else {
                  setError('網頁內容為空，請確認網頁已加載')
                }
              }}
              className={`copilot-action-btn ${loadedWebPageData ? 'active' : ''}`}
              title="分析網頁內容"
            >
              🌐 分析網頁
            </button>
            {fileContent && (
              <button
                onClick={() => {
                  setLoadedFileData(true)
                  setLoadedOracleData(false)
                  setLoadedWebPageData(false)
                }}
                className={`copilot-action-btn ${loadedFileData ? 'active' : ''}`}
                title="分析檔案內容"
              >
                📁 分析檔案
              </button>
            )}
          </div>

          <div className="copilot-chat-input-area">
            {(loadedOracleData || loadedWebPageData || loadedFileData) && (
              <div className="copilot-data-loaded-hint">
                ✅ 已讀取{loadedOracleData ? 'Oracle查詢結果' : loadedFileData ? `檔案：${fileContent?.fileName}` : '網頁內容'}，請輸入您的問題
                <button
                  onClick={() => {
                    setLoadedOracleData(false)
                    setLoadedWebPageData(false)
                    setLoadedFileData(false)
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
