import { useEffect, useRef, useState } from 'react'
import { settingsStore } from '../stores/settings-store'
import { workspaceStore } from '../stores/workspace-store'
import { knowledgeStore } from '../stores/knowledge-store'
import { buildSystemPromptFromSkills } from '../types/copilot-skills'
import type { CopilotChatOptions, CopilotMessage, TerminalInstance } from '../types'

interface CopilotChatPanelProps {
  isVisible: boolean
  onClose: () => void
  width?: number
  onResize?: (delta: number) => void
  workspaceId?: string | null  // 用於工作區獨立模式
  collapsed?: boolean
  onCollapse?: () => void
  focusedTerminalId?: string | null  // 當前 focused 的 terminal ID
}

export function CopilotChatPanel({ isVisible, onClose, width = 400, workspaceId, collapsed = false, onCollapse, focusedTerminalId }: Readonly<CopilotChatPanelProps>) {
  // 根據設定決定使用共用或獨立的 localStorage 鍵
  const [settings, setSettings] = useState(() => settingsStore.getSettings())
  const currentCopilotConfig = settingsStore.getCopilotConfig()
  const isShared = settings.sharedPanels?.copilot !== false
  const storageKey = isShared ? 'copilot-messages' : `copilot-messages-${workspaceId || 'default'}`
  
  // 訂閱設定變更
  useEffect(() => {
    const unsubscribe = settingsStore.subscribe(() => {
      setSettings(settingsStore.getSettings())
    })
    return unsubscribe
  }, [])
  
  // 調試：輸出知識庫狀態
  useEffect(() => {
    if (isVisible) {
      const activeKnowledge = knowledgeStore.getActiveKnowledge()
      console.log('[CopilotChat] Panel opened, knowledge base status:', {
        totalEntries: knowledgeStore.getEntries().length,
        activeCount: activeKnowledge.length,
        entries: activeKnowledge.map(k => ({ 
          name: k.name, 
          category: k.category,
          isLearned: k.isLearned,
          contentSize: k.content.length 
        }))
      })
    }
  }, [isVisible])
  
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
  const [effectiveModel, setEffectiveModel] = useState<string>('')
  const [targetTerminalId, setTargetTerminalId] = useState<string>('')
  const [availableTerminals, setAvailableTerminals] = useState<TerminalInstance[]>([])
  
  // Multi-instance support for Oracle and WebView
  const [selectedOracleId, setSelectedOracleId] = useState<string>('')
  const [selectedWebViewId, setSelectedWebViewId] = useState<string>('')
  const [oracleInstances, setOracleInstances] = useState<TerminalInstance[]>([])
  const [webViewInstances, setWebViewInstances] = useState<TerminalInstance[]>([])
  
  const [loadedOracleData, setLoadedOracleData] = useState(false)
  const [loadedWebPageData, setLoadedWebPageData] = useState(false)
  const [loadedFile, setLoadedFile] = useState<{ content: string; fileName: string } | null>(null)
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

  // Query available Oracle and WebView instances from workspace
  useEffect(() => {
    if (!workspaceId) return

    const updateInstances = () => {
      const allTerminals = workspaceStore.getWorkspaceTerminals(workspaceId)
      const oracles = allTerminals.filter(t => t.type === 'oracle')
      const webviews = allTerminals.filter(t => t.type === 'webview')
      
      setOracleInstances(oracles)
      setWebViewInstances(webviews)

      // Auto-select first instance if not already selected
      if (oracles.length > 0 && !selectedOracleId) {
        setSelectedOracleId(oracles[0].id)
      }
      if (webviews.length > 0 && !selectedWebViewId) {
        setSelectedWebViewId(webviews[0].id)
      }
    }

    // Initial load
    updateInstances()

    // Subscribe to workspace store changes
    const unsubscribe = workspaceStore.subscribe(() => {
      updateInstances()
    })

    return unsubscribe
  }, [workspaceId, selectedOracleId, selectedWebViewId])

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

  // Listen for file analysis requests from FILE panel
  useEffect(() => {
    const handleFileAnalysisRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ fileContent: string; fileName: string }>
      const { fileContent, fileName } = customEvent.detail
      
      // 保存已加載的文件，不直接填充輸入框
      setLoadedFile({ content: fileContent, fileName })
      
      // 自動滾動到底部
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }

    window.addEventListener('file-analysis-request', handleFileAnalysisRequest)
    return () => {
      window.removeEventListener('file-analysis-request', handleFileAnalysisRequest)
    }
  }, [])

  // Update available terminals when workspace changes
  useEffect(() => {
    const updateTerminals = () => {
      let terminals = workspaceStore.getState().terminals.filter(t => t.type === 'terminal')
      console.log('[Copilot] All terminals:', terminals.length)
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
  }, [targetTerminalId, workspaceId, isShared])

  // Auto-switch target terminal when focusedTerminalId changes
  useEffect(() => {
    if (focusedTerminalId && availableTerminals.some(t => t.id === focusedTerminalId)) {
      setTargetTerminalId(focusedTerminalId)
    }
  }, [focusedTerminalId, availableTerminals])

  // Auto-switch oracle/webview instance when focused terminal changes
  useEffect(() => {
    if (!focusedTerminalId) return
    
    // Find the focused terminal in all terminals
    const allTerminals = workspaceStore.getState().terminals
    const focusedTerminal = allTerminals.find(t => t.id === focusedTerminalId)
    
    if (focusedTerminal) {
      if (focusedTerminal.type === 'oracle' && oracleInstances.some(o => o.id === focusedTerminalId)) {
        setSelectedOracleId(focusedTerminalId)
      } else if (focusedTerminal.type === 'webview' && webViewInstances.some(w => w.id === focusedTerminalId)) {
        setSelectedWebViewId(focusedTerminalId)
      }
    }
  }, [focusedTerminalId, oracleInstances, webViewInstances])

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

  // Auto-analyze command output
  const analyzeCommandOutput = async (command: string, output: string) => {
    setIsLoading(true)
    try {
      const copilotConfig = settingsStore.getCopilotConfig()
      if (!copilotConfig?.apiKey || !copilotConfig?.model) {
        return
      }

      const systemPrompt = `你是終端 AI Agent。用戶剛執行了命令，現在需要你分析輸出。
      
回應要求：
1. 直接說明輸出內容的關鍵信息
2. 如果發現問題或異常，指出來
3. 建議下一步操作（如果適用）
4. 保持簡潔專業，不要廢話`

      // 將命令和輸出合併為一條用戶訊息
      const analysisMessage: CopilotMessage = {
        role: 'user',
        content: `命令：\`${command}\`\n\n輸出：\n\`\`\`\n${output}\n\`\`\``
      }

      const currentMessages = [...messages, analysisMessage]

      const options: CopilotChatOptions = {
        messages: [
          { role: 'system', content: systemPrompt },
          ...currentMessages
        ]
      }

      const chatId = `chat-${Date.now()}`
      const response = await window.electronAPI.copilot.chat(chatId, options)

      if (response?.content) {
        const assistantMessage: CopilotMessage = {
          role: 'assistant',
          content: response.content
        }
        // 同時更新 messages，包含分析請求和回應
        setMessages(prev => [...prev, analysisMessage, assistantMessage])
      }
    } catch (error) {
      console.error('Analysis error:', error)
    } finally {
      setIsLoading(false)
    }
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

      // Send command (use \r for proper command execution in all shells)
      await window.electronAPI.pty.write(targetTerminalId, command + '\r')
      
      // Wait for output
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Get output from buffer
      const output = terminalOutputBuffer.current.get(targetTerminalId) || '(無輸出)'
      
      // Clean up ANSI codes for display
      const cleanOutput = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim()

      // Add execution result as user message (command output)
      const executionMessage: CopilotMessage = {
        role: 'user',
        content: `[終端輸出]\n\`\`\`\n${cleanOutput.substring(0, 2000) || '(無輸出)'}\n\`\`\``
      }

      setMessages(prev => [...prev, executionMessage])
      
      // Trigger AI to analyze the output
      setTimeout(() => {
        analyzeCommandOutput(command, cleanOutput)
      }, 500)
      
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

    // 如果有已讀取的文件，附加到消息中
    if (loadedFile) {
      messageContent = `請分析以下文件內容（${loadedFile.fileName}）：\n\n${loadedFile.content}\n\n我的問題：${messageContent}`
      setLoadedFile(null)  // 清除已加載的文件
    }
    // 如果有已讀取的分析數據，附加到消息中
    else if (loadedOracleData) {
      const selectedOracle = oracleInstances.find(o => o.id === selectedOracleId)
      if (selectedOracle?.oracleQueryResult) {
        messageContent = `請分析以下 Oracle 查詢結果（${selectedOracle.title}）：\n\n${selectedOracle.oracleQueryResult}\n\n我的問題：${messageContent}`
      }
      setLoadedOracleData(false)
    } else if (loadedWebPageData) {
      const selectedWebView = webViewInstances.find(w => w.id === selectedWebViewId)
      if (selectedWebView?.webviewContent) {
        messageContent = `請分析以下網頁內容（${selectedWebView.title}）：\n\n${selectedWebView.webviewContent}\n\n我的問題：${messageContent}`
      }
      setLoadedWebPageData(false)
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

    // 獲取 config 放在 try 外面，這樣 catch 也能訪問
    const copilotConfig = settingsStore.getCopilotConfig()

    try {
      if (!copilotConfig?.apiKey || !copilotConfig?.model) {
        throw new Error('請先在設定中配置 Copilot API Key 和模型')
      }

      // 獲取當前終端的 shell 類型
      const currentTerminal = availableTerminals.find(t => t.id === targetTerminalId)
      const shellType = currentTerminal?.shell || 'powershell'
      const isWindows = shellType.toLowerCase().includes('powershell') || 
                        shellType.toLowerCase().includes('pwsh') || 
                        shellType.toLowerCase().includes('cmd') ||
                        shellType.toLowerCase().includes('windows')
      
      const shellInfo = isWindows 
        ? 'PowerShell (使用 `Get-ChildItem` 或 `dir` 而非 `ls -la`，`Remove-Item` 而非 `rm`，等等)'
        : 'Bash/Zsh (可使用標準 Unix 命令如 `ls -la`, `rm`, `grep` 等)'

      // 構建基礎 system prompt
      const basePrompt = `你是一個智能終端 AI Agent，能夠理解用戶意圖並主動執行相關命令。

**當前環境**：${shellInfo}

核心行為：
1. **使用正確的命令語法**：根據當前 shell 類型選擇合適的命令
2. **直接執行，不廢話**：用戶要求時，立即提供命令代碼塊，無需額外說明
3. **命令格式**：\`\`\`bash\n命令內容\n\`\`\`
4. **分析結果**：命令執行後會自動返回輸出，你需要分析輸出並給出有用的見解
5. **主動建議**：根據情境主動建議下一步操作
6. **保持簡潔**：回應要專業、準確、直接`

      // 獲取啟用的技能並構建完整 system prompt
      const enabledSkills = settingsStore.getEnabledSkills()
      const skillsPrompt = buildSystemPromptFromSkills(enabledSkills)
      
      // 根據當前模型獲取知識庫限制
      const { getModelKnowledgeLimit } = await import('../types/knowledge-base')
      const modelLimits = getModelKnowledgeLimit(copilotConfig.model)
      
      // 獲取啟用的知識庫內容（限制大小以避免 token 超限）
      const activeKnowledge = knowledgeStore.getActiveKnowledge()
      let knowledgePrompt = ''
      const includedKnowledge: Array<{ name: string; content: string; truncated: boolean }> = []
      
      const totalKnowledgeSize = activeKnowledge.reduce((sum, k) => sum + k.content.length, 0)
      
      console.log('[CopilotChat] Building knowledge prompt:', {
        model: copilotConfig.model,
        limits: modelLimits,
        activeKnowledgeCount: activeKnowledge.length,
        totalKnowledgeSize: totalKnowledgeSize,
        totalKnowledgeSizeKB: (totalKnowledgeSize / 1024).toFixed(1),
        entries: activeKnowledge.map(k => ({
          name: k.name,
          contentLength: k.content.length,
          contentLengthKB: (k.content.length / 1024).toFixed(1),
          contentPreview: k.content.substring(0, 200)
        }))
      })
      
      // 如果知識庫太大，提前警告
      if (totalKnowledgeSize > modelLimits.maxTotal * 1.2) {
        console.warn('[CopilotChat] 知識庫內容過大:', {
          size: totalKnowledgeSize,
          sizeKB: (totalKnowledgeSize / 1024).toFixed(1),
          limit: modelLimits.maxTotal,
          model: copilotConfig.model
        })
      }
      
      if (activeKnowledge.length > 0) {
        const MAX_KNOWLEDGE_LENGTH = modelLimits.maxTotal
        const MAX_SINGLE_ENTRY = modelLimits.maxSingle
        let totalLength = 0
        
        for (const k of activeKnowledge) {
          let entryContent = k.content
          let truncated = false
          
          // 如果單個文件太大，截斷它
          if (entryContent.length > MAX_SINGLE_ENTRY) {
            entryContent = entryContent.substring(0, MAX_SINGLE_ENTRY)
            truncated = true
            console.log('[CopilotChat] Entry too large, truncating:', {
              name: k.name,
              original: k.content.length,
              truncated: entryContent.length
            })
          }
          
          const entryText = `【${k.name}】\n${entryContent}`
          
          console.log('[CopilotChat] Processing knowledge entry:', {
            name: k.name,
            entryLength: entryText.length,
            currentTotal: totalLength,
            willInclude: totalLength + entryText.length < MAX_KNOWLEDGE_LENGTH,
            wasTruncated: truncated
          })
          
          if (totalLength + entryText.length < MAX_KNOWLEDGE_LENGTH) {
            includedKnowledge.push({ name: k.name, content: entryContent, truncated })
            totalLength += entryText.length
          } else {
            console.log('[CopilotChat] Would exceed limit, skipping remaining entries')
            break
          }
        }
        
        console.log('[CopilotChat] Included knowledge:', {
          count: includedKnowledge.length,
          totalLength: totalLength
        })
        
        if (includedKnowledge.length > 0) {
          const knowledgeList = includedKnowledge
            .map(item => {
              const truncationNote = item.truncated 
                ? `\n(註：此文件內容過長，已截取前 ${item.content.length.toLocaleString()} 字元)\n` 
                : ''
              return `### 【${item.name}】${truncationNote}\n${item.content}`
            })
            .join('\n\n---\n\n')
          
          knowledgePrompt = `

===== 專業知識庫 (Knowledge Base) =====
以下是用戶上傳的專業知識文檔，你必須優先參考這些內容來回答問題。
這些知識包含了用戶的業務數據、API 文檔、會計資料等重要信息。
當用戶提問時，請先搜索知識庫中的相關內容，然後基於這些內容回答。

${knowledgeList}

===== 知識庫結束 =====
`
          
          console.log('[CopilotChat] Knowledge prompt built:', {
            promptLength: knowledgePrompt.length,
            preview: knowledgePrompt.substring(0, 500)
          })
          
          if (includedKnowledge.length < activeKnowledge.length) {
            knowledgePrompt += `\n(註：因內容過長，僅載入 ${includedKnowledge.length}/${activeKnowledge.length} 個知識條目)\n`
          }
        }
      }
      
      const systemPrompt = `${basePrompt}

---

${skillsPrompt}${knowledgePrompt}

---

範例：
- 用戶："列出檔案"
  ${isWindows ? 'PowerShell: \`\`\`bash\nGet-ChildItem\n\`\`\`' : 'Bash: \`\`\`bash\nls -la\n\`\`\`'}
- 看到輸出後，你："目錄中有 X 個檔案，包括..."`

      const options: CopilotChatOptions = {
        messages: [
          { role: 'system', content: systemPrompt },
          ...newMessages
        ]
      }

      console.log('[CopilotChat] Sending chat request:', {
        chatId: `chat-${Date.now()}`,
        model: copilotConfig.model,
        modelLimits: modelLimits,
        messageCount: options.messages.length,
        systemPromptLength: systemPrompt.length,
        userMessagesLength: newMessages.reduce((sum, m) => sum + m.content.length, 0),
        totalEstimatedLength: systemPrompt.length + newMessages.reduce((sum, m) => sum + m.content.length, 0),
        hasKnowledge: activeKnowledge.length > 0,
        knowledgeCount: activeKnowledge.length,
        includedKnowledgeCount: includedKnowledge.length,
        knowledgePromptLength: knowledgePrompt.length,
        knowledgeEntries: activeKnowledge.map(k => ({ name: k.name, size: k.content.length }))
      })
      
      // 檢查總長度是否超過限制（根據模型動態調整）
      const totalLength = systemPrompt.length + newMessages.reduce((sum, m) => sum + m.content.length, 0)
      const maxTotalLength = modelLimits.tokenLimit * 3 // 1 token ≈ 3-4 字元，保守估計用 3
      
      if (totalLength > maxTotalLength) {
        console.warn(
          '[CopilotChat] Request length exceeds local estimate; sending anyway:',
          {
            model: copilotConfig.model,
            totalLength,
            maxTotalLength
          }
        )
      }
      
      // 輸出 system prompt 的前 1000 字符以便調試
      console.log('[CopilotChat] System prompt preview:', systemPrompt.substring(0, 1000))

      const chatId = `chat-${Date.now()}`
      const response = await window.electronAPI.copilot.chat(chatId, options)

      console.log('[CopilotChat] Received response:', {
        hasResponse: !!response,
        hasContent: !!response?.content,
        contentLength: response?.content?.length || 0,
        error: response?.error
      })

      if (!response || !response.content) {
        const errorMsg = response?.error || '未收到回應'
        throw new Error(errorMsg)
      }

      // Record the actual model used (Copilot may resolve to a versioned model id)
      if (response?.model) {
        setEffectiveModel(String(response.model))
      } else if (copilotConfig.model) {
        setEffectiveModel(String(copilotConfig.model))
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

      // Commands will be shown with execute buttons inline, no need for extra messages
    } catch (error) {
      console.error('Send message error:', error)
      const errorMsg = (error as Error).message
      
      // 如果是 400 錯誤，提供更詳細的說明
      if (errorMsg.includes('400')) {
        const activeKnowledgeForError = knowledgeStore.getActiveKnowledge()
        setError(`❌ API 請求格式錯誤 (400)。可能原因：
• 模型名稱不正確（當前：${copilotConfig?.model || 'unknown'}）
• 知識庫內容過多（當前 ${activeKnowledgeForError.length} 個文件）
• 對話歷史過長（${messages.length} 條訊息）
建議：嘗試切換模型為 gpt-4o，或暫時停用部分知識庫類別`)
      } else {
        setError(errorMsg)
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (!isVisible) return null

  // Collapsed state - show icon bar
  if (collapsed && onCollapse) {
    return (
      <div
        className="collapsed-bar collapsed-bar-right"
        onClick={onCollapse}
        title="展開 CHAT"
      >
        <div className="collapsed-bar-icon">💬</div>
      </div>
    )
  }

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
      <div className="copilot-chat-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
        {/* Title Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isFloating ? 'move' : 'default', flex: 1, minWidth: 0 }}
            onMouseDown={handleDragStart}
          >
            <h3>CHAT</h3>
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
            {(() => {
              const activeKnowledge = knowledgeStore.getActiveKnowledge()
              if (activeKnowledge.length > 0) {
                return (
                  <span style={{ 
                    fontSize: '11px', 
                    color: '#7bbda4',
                    backgroundColor: '#2a3826',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    📚 {activeKnowledge.length}
                  </span>
                )
              }
              return null
            })()}
          </div>
          {onCollapse && !isFloating && (
            <button
              className="copilot-toggle-btn"
              onClick={onCollapse}
              onMouseDown={(e) => e.stopPropagation()}
              title="收合面板"
              style={{ padding: '6px 12px' }}
            >
              »
            </button>
          )}
          <button 
            className="copilot-close-btn" 
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
          >
            ×
          </button>
        </div>
        
        {/* Buttons Row */}
        <div className="copilot-chat-controls" style={{ justifyContent: 'flex-start' }}>
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
                  {msg.role === 'user' && (
                    <div style={{ 
                      fontSize: '11px', 
                      color: '#8c8c8c',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      justifyContent: 'flex-end'
                    }}>
                      <span>你</span>
                    </div>
                  )}
                  {msg.role === 'assistant' && (
                    <div style={{ 
                      fontSize: '11px', 
                      color: '#8c8c8c',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span style={{ 
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        color: 'white'
                      }}>
                        AI
                      </span>
                      <span>GitHub Copilot</span>
                    </div>
                  )}
                  <div className="copilot-message-content">
                    {msg.content}
                  </div>
                  {commands.length > 0 && (
                    <div style={{ 
                      marginTop: '6px', 
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '8px',
                      backgroundColor: '#1e1e1e',
                      borderRadius: '6px',
                      border: '1px solid #2d2d2d',
                      maxWidth: '90%'
                    }}>
                      <div style={{ 
                        fontSize: '11px', 
                        color: '#8c8c8c', 
                        fontWeight: '500',
                        marginBottom: '2px'
                      }}>
                        偵測到 {commands.length} 個命令
                      </div>
                      {commands.map((cmd, cmdIdx) => (
                        <div key={cmdIdx} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px',
                          fontSize: '11px'
                        }}>
                          <code style={{ 
                            flex: 1, 
                            padding: '6px 8px', 
                            backgroundColor: '#2d2d2d',
                            borderRadius: '4px',
                            color: '#7bbda4',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '11px',
                            fontFamily: 'Consolas, Monaco, Courier New, monospace'
                          }}>
                            {cmd}
                          </code>
                          <button
                            onClick={() => executeCommand(cmd)}
                            disabled={!targetTerminalId}
                            style={{
                              padding: '5px 10px',
                              backgroundColor: targetTerminalId ? '#0078d4' : '#404040',
                              color: targetTerminalId ? '#ffffff' : '#8c8c8c',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: targetTerminalId ? 'pointer' : 'not-allowed',
                              fontSize: '11px',
                              fontWeight: '500',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.15s ease'
                            }}
                            title={targetTerminalId ? '執行命令' : '請先選擇終端'}
                            onMouseOver={(e) => {
                              if (targetTerminalId) {
                                e.currentTarget.style.backgroundColor = '#1084d8'
                              }
                            }}
                            onMouseOut={(e) => {
                              if (targetTerminalId) {
                                e.currentTarget.style.backgroundColor = '#0078d4'
                              }
                            }}
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
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#1e1e1e', 
              borderRadius: '6px',
              border: '1px solid #2d2d2d',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {/* 終端選擇 */}
              {availableTerminals.length > 0 && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  marginBottom: '8px'
                }}>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#8c8c8c',
                    fontWeight: '600',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}>
                    💻 終端
                  </div>
                  <select
                    value={targetTerminalId}
                    onChange={(e) => setTargetTerminalId(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: '80px',
                      maxWidth: '100%',
                      padding: '6px 8px',
                      fontSize: '12px',
                      backgroundColor: '#2d2d2d',
                      color: '#e0e0e0',
                      border: '1px solid #444',
                      borderRadius: '4px',
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
              )}

              {/* 資料庫選擇 */}
              {oracleInstances.length > 0 && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  marginBottom: '8px'
                }}>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#8c8c8c',
                    fontWeight: '600',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}>
                    🗄️ 資料庫
                  </div>
                  <select
                    value={selectedOracleId}
                    onChange={(e) => {
                      setSelectedOracleId(e.target.value)
                      setLoadedOracleData(false) // 切換時清除已讀取狀態
                    }}
                    style={{
                      flex: 1,
                      minWidth: '60px',
                      maxWidth: '100%',
                      padding: '6px 8px',
                      fontSize: '12px',
                      backgroundColor: '#2d2d2d',
                      color: '#e0e0e0',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {oracleInstances.map(oracle => (
                      <option key={oracle.id} value={oracle.id}>
                        {oracle.title}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const selectedOracle = oracleInstances.find(o => o.id === selectedOracleId)
                      if (selectedOracle?.oracleQueryResult) {
                        setLoadedOracleData(true)
                        setLoadedWebPageData(false)
                      } else {
                        setError('請先執行 Oracle 查詢')
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'background-color 0.15s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#e53e3e'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#dc2626'
                    }}
                  >
                    🔍 分析
                  </button>
                </div>
              )}

              {/* 網頁選擇 */}
              {webViewInstances.length > 0 && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px'
                }}>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#8c8c8c',
                    fontWeight: '600',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                  }}>
                    🌐 網頁
                  </div>
                  <select
                    value={selectedWebViewId}
                    onChange={(e) => {
                      setSelectedWebViewId(e.target.value)
                      setLoadedWebPageData(false) // 切換時清除已讀取狀態
                    }}
                    style={{
                      flex: 1,
                      minWidth: '60px',
                      maxWidth: '100%',
                      padding: '6px 8px',
                      fontSize: '12px',
                      backgroundColor: '#2d2d2d',
                      color: '#e0e0e0',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {webViewInstances.map(webview => (
                      <option key={webview.id} value={webview.id}>
                        {webview.title}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const selectedWebView = webViewInstances.find(w => w.id === selectedWebViewId)
                      if (selectedWebView?.webviewContent) {
                        setLoadedWebPageData(true)
                        setLoadedOracleData(false)
                      } else {
                        setError('網頁內容為空，請確認網頁已加載')
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'background-color 0.15s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#22c55e'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#16a34a'
                    }}
                  >
                    🌐 分析
                  </button>
                </div>
              )}

              {availableTerminals.length === 0 && oracleInstances.length === 0 && webViewInstances.length === 0 && (
                <div style={{ 
                  padding: '20px', 
                  textAlign: 'center', 
                  color: '#666',
                  fontSize: '12px'
                }}>
                  暫無可用的終端或實例
                </div>
              )}
            </div>
          </div>

          <div className="copilot-chat-input-area">
            {(loadedFile || loadedOracleData || loadedWebPageData) && (
              <div className="copilot-data-loaded-hint">
                ✅ 已讀取
                {loadedFile
                  ? `文件（${loadedFile.fileName}）`
                  : loadedOracleData 
                    ? `Oracle 查詢結果（${oracleInstances.find(o => o.id === selectedOracleId)?.title}）`
                    : `網頁內容（${webViewInstances.find(w => w.id === selectedWebViewId)?.title}）`
                }，請輸入您的問題
                <button
                  onClick={() => {
                    setLoadedFile(null)
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

            <div style={{
              marginTop: '6px',
              fontSize: '11px',
              color: '#888',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '8px'
            }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                使用模型：{effectiveModel || currentCopilotConfig?.model || '未選擇'}
              </div>
              <div style={{ flexShrink: 0 }}>
                {currentCopilotConfig?.model && effectiveModel && effectiveModel !== currentCopilotConfig.model
                  ? `（選擇：${currentCopilotConfig.model}）`
                  : ''}
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
