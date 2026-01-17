import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import katex from 'katex'
import { settingsStore } from '../stores/settings-store'
import { workspaceStore } from '../stores/workspace-store'
import { knowledgeStore } from '../stores/knowledge-store'
import { buildSystemPromptFromSkills } from '../types/copilot-skills'
import { smartSelect } from '../types/skill-selector'
import type { CopilotChatOptions, CopilotMessage, TerminalInstance } from '../types'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'

// Configure marked with syntax highlighting
const renderer = new marked.Renderer()
renderer.code = function(token) {
  // Handle both old (string) and new (token object) API
  const codeString = typeof token === 'string' ? token : (token.text || '')
  const language = typeof token === 'string' ? arguments[1] : (token.lang || '')
  const validLanguage = language && hljs.getLanguage(language) ? language : 'plaintext'
  
  // Language display name
  const languageLabel = language ? language.toUpperCase() : 'CODE'
  
  try {
    const highlighted = hljs.highlight(codeString, { language: validLanguage }).value
    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-block-language">${languageLabel}</span>
      </div>
      <pre><code class="hljs language-${validLanguage}">${highlighted}</code></pre>
    </div>`
  } catch (err) {
    console.error('Highlight error:', err)
    // Fallback to plain text with HTML escaping
    const escaped = codeString.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-block-language">${languageLabel}</span>
      </div>
      <pre><code class="language-${validLanguage}">${escaped}</code></pre>
    </div>`
  }
}

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer: renderer
})

// 自定義渲染數學公式的函數
function renderMathInHtml(html: string): string {
  // 處理塊級公式 $$...$$
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, tex) => {
    try {
      return katex.renderToString(tex, { displayMode: true, throwOnError: false })
    } catch (e) {
      return match
    }
  })
  
  // 處理行內公式 $...$
  html = html.replace(/\$([^\$\n]+?)\$/g, (match, tex) => {
    try {
      return katex.renderToString(tex, { displayMode: false, throwOnError: false })
    } catch (e) {
      return match
    }
  })
  
  return html
}

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

// 處理步驟定義
interface ProcessingStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'error'
  detail?: string
  startTime?: number
  endTime?: number
}

export function CopilotChatPanel({ isVisible, onClose, width = 400, workspaceId, collapsed = false, onCollapse, focusedTerminalId }: Readonly<CopilotChatPanelProps>) {
  // 根據設定決定使用共用或獨立的 localStorage 鍵
  const [settings, setSettings] = useState(() => settingsStore.getSettings())
  const [availableCopilotModels, setAvailableCopilotModels] = useState<string[]>([])
  const [, setCopilotModelsLoading] = useState(false)
  const [currentCopilotConfig, setCurrentCopilotConfig] = useState(() => settingsStore.getCopilotConfig())
  const isShared = settings.sharedPanels?.copilot !== false
  const storageKey = isShared ? 'copilot-messages' : `copilot-messages-${workspaceId || 'default'}`
  
  // 處理步驟狀態
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([])
  const [showSteps, setShowSteps] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // 訂閱設定變更
  useEffect(() => {
    const unsubscribe = settingsStore.subscribe(() => {
      setSettings(settingsStore.getSettings())
      setCurrentCopilotConfig(settingsStore.getCopilotConfig())
    })
    return unsubscribe
  }, [])

  // Load Copilot models
  useEffect(() => {
    if (!isVisible) return

    const copilotConfig = settingsStore.getCopilotConfig()
    const shouldLoad = copilotConfig?.enabled && copilotConfig?.provider === 'github' && !!copilotConfig?.apiKey

    if (!shouldLoad) {
      setAvailableCopilotModels([])
      return
    }

    let cancelled = false

    const loadModels = async () => {
      try {
        setCopilotModelsLoading(true)
        const result = await window.electronAPI.copilot.listModels()
        if (cancelled) return

        if (result?.error) {
          setAvailableCopilotModels([])
          return
        }

        const ids = Array.isArray(result?.ids) ? result.ids : []
        setAvailableCopilotModels(ids)
      } catch (e: any) {
        if (cancelled) return
        setAvailableCopilotModels([])
      } finally {
        if (!cancelled) setCopilotModelsLoading(false)
      }
    }

    loadModels()

    return () => {
      cancelled = true
    }
  }, [isVisible])
  
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
  
  const [size] = useState(() => {
    const saved = localStorage.getItem('copilot-size')
    return saved ? JSON.parse(saved) : { width: 500, height: 700 }
  })

  const [zIndex, setZIndex] = useState(1000)

  const [isEnabled, setIsEnabled] = useState(false)
  const [messages, setMessages] = useState<CopilotMessage[]>([])  // 初始化為空陣列，在 useEffect 中載入
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setEffectiveModel] = useState<string>('')
  const [targetTerminalId, setTargetTerminalId] = useState<string>('')
  const [availableTerminals, setAvailableTerminals] = useState<TerminalInstance[]>([])
  const [isComposing, setIsComposing] = useState(false)  // Track IME composition state
  
  // Multi-instance support for Oracle and WebView
  const [selectedOracleId, setSelectedOracleId] = useState<string>('')
  const [selectedWebViewId, setSelectedWebViewId] = useState<string>('')
  const [oracleInstances, setOracleInstances] = useState<TerminalInstance[]>([])
  const [webViewInstances, setWebViewInstances] = useState<TerminalInstance[]>([])
  
  const [loadedOracleData, setLoadedOracleData] = useState(false)
  const [loadedWebPageData, setLoadedWebPageData] = useState(false)
  const [loadedSelection, setLoadedSelection] = useState<{
    text: string
    url?: string
    sourceTitle?: string
    sourceType?: string
    mode: 'analyze' | 'draft'
  } | null>(null)
  const [loadedFile, setLoadedFile] = useState<{ content: string; fileName: string } | null>(null)
  const [fileChunks, setFileChunks] = useState<{ chunks: string[]; fileName: string; currentIndex: number } | null>(null)
  const [userInfo, setUserInfo] = useState<{ username: string; hostname: string }>({ username: '', hostname: '' })
  
  // 样式控制状态
  const [fontSize] = useState(() => {
    const saved = localStorage.getItem('copilot-font-size')
    return saved ? parseInt(saved) : 12
  })
  
  const terminalOutputBuffer = useRef<Map<string, string>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const isLoadingMessages = useRef(false)
  const hasMoreChunks = useRef(false)  // 追蹤是否有後續分段需要處理
  const shouldFocusInput = useRef(false)

  // Get system user info
  useEffect(() => {
    const getSystemInfo = async () => {
      try {
        const info = await window.electronAPI.system.getInfo()
        setUserInfo(info)
      } catch (err) {
        console.error('Failed to get system info:', err)
        setUserInfo({ username: 'user', hostname: 'localhost' })
      }
    }
    getSystemInfo()
  }, [])

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
      const time = new Date(msg.timestamp || Date.now()).toLocaleString()
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

  // 查看所有工作區的對話功能已移除
  // (可在開發者工具 localStorage 中查看 'copilot-messages-*' 鍵)

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

  // Focus input when requested (e.g., after clearing messages)
  useEffect(() => {
    if (shouldFocusInput.current) {
      shouldFocusInput.current = false
      inputRef.current?.focus()
    }
  }, [messages])

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
      
      // 檢測文件大小，決定是否需要分段
      const CHUNK_SIZE = 8000 // 每段約 8000 字元
      const needsChunking = fileContent.length > CHUNK_SIZE
      
      if (needsChunking) {
        // 將文件分段
        const chunks: string[] = []
        let offset = 0
        while (offset < fileContent.length) {
          const chunk = fileContent.slice(offset, offset + CHUNK_SIZE)
          chunks.push(chunk)
          offset += CHUNK_SIZE
        }
        
        console.log(`[Copilot] File "${fileName}" (${fileContent.length} chars) split into ${chunks.length} chunks`)
        setFileChunks({ chunks, fileName, currentIndex: 0 })
        setLoadedFile(null)
      } else {
        // 文件不大，直接加載
        setLoadedFile({ content: fileContent, fileName })
        setFileChunks(null)
      }
      
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

  // Listen for selection analysis/draft requests from WebView/Teams/Outlook panels
  useEffect(() => {
    const handleSelectionRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{
        text: string
        url?: string
        sourceTitle?: string
        sourceType?: string
        mode: 'analyze' | 'draft'
      }>

      const text = (customEvent.detail?.text || '').toString().trim()
      if (!text) return

      setLoadedSelection({
        text: text.substring(0, 20000),
        url: customEvent.detail?.url,
        sourceTitle: customEvent.detail?.sourceTitle,
        sourceType: customEvent.detail?.sourceType,
        mode: customEvent.detail?.mode || 'analyze'
      })

      // Clear other loaded data to avoid ambiguity
      setLoadedFile(null)
      setFileChunks(null)
      setLoadedOracleData(false)
      setLoadedWebPageData(false)

      // Prefill a sensible prompt
      if ((customEvent.detail?.mode || 'analyze') === 'draft') {
        setInput('請根據我框選的內容，草擬一段適合回覆的文字（可提供 2-3 個版本：正式/簡短/友善）。')
      } else {
        setInput('請分析我框選的內容，整理重點、意圖、待辦，並給出建議回覆方向。')
      }

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        inputRef.current?.focus()
      }, 100)
    }

    window.addEventListener('selection-analysis-request', handleSelectionRequest)
    return () => {
      window.removeEventListener('selection-analysis-request', handleSelectionRequest)
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

  // Extract fetch URLs from message content
  const extractFetchUrls = (content: string): string[] => {
    const fetchRegex = /```fetch\n([\s\S]*?)```/g
    const urls: string[] = []
    let match
    
    while ((match = fetchRegex.exec(content)) !== null) {
      const urlText = match[1].trim()
      // Extract valid URLs
      const lines = urlText.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
          urls.push(trimmed)
        }
      }
    }
    
    return urls
  }

  // Extract bash commands from message content
  const extractCommands = (content: string): string[] => {
    // Extract code blocks - prefer those marked as terminal/shell
    const specificCommandRegex = /```(?:bash|sh|shell|powershell|pwsh|cmd|ps1|terminal)\n([\s\S]*?)```/g
    const genericCodeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g
    const commands: string[] = []
    
    // First, try to get specifically marked terminal commands
    let match
    while ((match = specificCommandRegex.exec(content)) !== null) {
      const block = match[1].trim()
      // Extract actual commands (skip comments and empty lines)
      const blockCommands = extractCommandsFromBlock(block)
      commands.push(...blockCommands)
    }
    
    // If no specifically marked commands found, check generic blocks (but with strict filtering)
    if (commands.length === 0) {
      while ((match = genericCodeBlockRegex.exec(content)) !== null) {
        const block = match[1].trim()
        // Only accept if it looks like a real terminal command (not code)
        if (block && !isCodeSnippet(block)) {
          const blockCommands = extractCommandsFromBlock(block)
          commands.push(...blockCommands)
        }
      }
    }
    
    return commands
  }

  // Extract actual executable commands from a code block
  const extractCommandsFromBlock = (block: string): string[] => {
    const commands: string[] = []
    const lines = block.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      // Skip empty lines and pure comment lines
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        continue
      }
      
      // Check for inline comments and extract only the command part
      const commentIndex = trimmed.indexOf(' #')
      const actualCommand = commentIndex > 0 ? trimmed.substring(0, commentIndex).trim() : trimmed
      
      // Skip if it's code-like patterns
      if (isCodeSnippet(actualCommand)) {
        continue
      }
      
      // Check if it's a valid command
      if (actualCommand && looksLikeCommand(actualCommand)) {
        commands.push(actualCommand)
      }
    }
    
    return commands
  }

  // Check if text looks like a terminal command
  const looksLikeCommand = (text: string): boolean => {
    if (!text) return false
    
    // Must not be a comment or code pattern
    if (text.startsWith('#') || text.startsWith('//') || text.startsWith('/*')) return false
    if (text.startsWith('{') || text.startsWith('[')) return false
    
    // Check if starts with common command
    const commonCommands = /^(cd|ls|dir|pwd|echo|cat|grep|find|npm|git|node|python|pip|cargo|go|docker|kubectl|terraform|az|aws|yarn|pnpm|curl|wget|cp|mv|rm|mkdir|touch|chmod|ps|kill|tail|head|sed|awk|which|whereis|type|Get-|Set-|New-|Remove-|Invoke-|Select-|Where-Object|ForEach-Object)\b/i
    return commonCommands.test(text.trim())
  }

  // Check if content looks like code snippet rather than terminal command
  const isCodeSnippet = (text: string): boolean => {
    // Check for common programming patterns
    const codePatterns = [
      /SELECT\s+.*\s+FROM/i,  // SQL
      /INSERT\s+INTO/i,  // SQL
      /UPDATE\s+.*\s+SET/i,  // SQL
      /DELETE\s+FROM/i,  // SQL
      /public\s+class\s+/i,  // Java
      /public\s+static\s+void\s+main/i,  // Java main
      /function\s+\w+\s*\(/i,  // JavaScript/TypeScript
      /const\s+\w+\s*=\s*\(/i,  // Arrow functions
      /def\s+\w+\s*\(/i,  // Python
      /class\s+\w+/i,  // Class definition
      /^\s*{[\s\S]*".*"[\s\S]*}/,  // JSON object
      /^\s*\[[\s\S]*{[\s\S]*}[\s\S]*\]/,  // JSON array
      /import\s+.*\s+from/i,  // ES6 imports
      /#include\s*</i,  // C/C++
      /package\s+\w+/i,  // Java/Go package
      /\/\/.*JSON/i,  // Comments mentioning JSON/SQL/etc
      /\/\/.*SQL/i,
      /\/\/.*Java/i,
    ]
    return codePatterns.some(pattern => pattern.test(text))
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
  const executeFetch = async (url: string) => {
    try {
      setIsLoading(true)
      setError(null)
      
      // 使用 Electron IPC 抓取網頁內容（繞過 CORS）
      const html = await window.electronAPI.webpage.fetch(url)
      
      // 簡單提取文本內容（移除 HTML 標籤）
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const textContent = doc.body.textContent || ''
      
      // 限制內容長度
      const maxLength = 50000
      const content = textContent.length > maxLength 
        ? textContent.substring(0, maxLength) + '\n\n(內容過長，已截斷...)'
        : textContent
      
      // 直接構建 API 消息，不顯示中間過程
      const copilotConfig = settingsStore.getCopilotConfig()
      
      if (!copilotConfig?.apiKey || !copilotConfig?.model) {
        throw new Error('請先在設定中配置 Copilot API Key 和模型')
      }
      
      // 構建完整的上下文消息（包含網頁內容）
      const contextMessage = {
        role: 'user',
        content: `請分析以下網頁內容：\n\n【來源】${url}\n\n【內容】\n${content}`
      }
      
      const systemPrompt = `你是一個智能助手。用戶剛剛抓取了一個網頁的內容，請分析這個網頁並回答用戶的問題。`
      
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10).map(m => ({
          role: m.role,
          content: m.content
        })),
        contextMessage
      ]
      
      const result = await window.electronAPI.copilot.chat('copilot-chat', {
        messages: apiMessages,
        model: copilotConfig.model || 'gpt-4o'
      })
      
      // 只顯示 AI 的分析結果
      const assistantMessage: CopilotMessage = {
        role: 'assistant',
        content: result.content
      }
      
      const finalMessages = [...messages, assistantMessage]
      setMessages(finalMessages)
      
      // 保存到 localStorage
      if (!isLoadingMessages.current) {
        localStorage.setItem(storageKey, JSON.stringify(finalMessages))
      }
      
    } catch (error: any) {
      console.error('Failed to fetch URL:', error)
      setError(`抓取網頁失敗: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const executeCommand = async (command: string) => {
    try {
      if (!targetTerminalId) {
        setError('請先選擇一個終端')
        return { success: false, error: '未選擇終端' }
      }

      // Terminal reference removed - not needed
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

    // 如果當前工作區是技能，讀取 skill.md
    const state = workspaceStore.getState()
    const currentWorkspace = state.workspaces.find(w => w.id === workspaceId)
    let skillContext = ''
    
    if (currentWorkspace?.skillConfig?.isSkill) {
      try {
        const skillMdPath = `${currentWorkspace.folderPath}/skill.md`
        const result = await window.electronAPI.fs.readFile(skillMdPath, currentWorkspace.folderPath)
        if (result.success && result.content) {
          skillContext = `\n\n[技能上下文]\n當前工作區是一個技能：${currentWorkspace.alias || currentWorkspace.name}\n技能說明：\n${result.content}\n[/技能上下文]\n\n`
        }
      } catch (e) {
        console.log('[Copilot] skill.md not found or error reading:', e)
      }
    }

    // 如果有框選文字，優先附加到消息中
    if (loadedSelection) {
      const src = loadedSelection.sourceTitle || loadedSelection.sourceType || '網頁'
      const urlHint = loadedSelection.url ? `\n來源：${loadedSelection.url}` : ''
      if (loadedSelection.mode === 'draft') {
        messageContent = `請根據以下我在「${src}」框選的內容草擬回覆：\n\n---\n${loadedSelection.text}\n---${urlHint}\n\n需求/語氣/限制：${messageContent}${skillContext}`
      } else {
        messageContent = `請分析以下我在「${src}」框選的內容：\n\n---\n${loadedSelection.text}\n---${urlHint}\n\n我的問題：${messageContent}${skillContext}`
      }
      setLoadedSelection(null)
      hasMoreChunks.current = false
    }
    // 如果有已讀取的文件，附加到消息中
    else if (loadedFile) {
      messageContent = `請分析以下文件內容（${loadedFile.fileName}）：\n\n${loadedFile.content}\n\n我的問題：${messageContent}${skillContext}`
      setLoadedFile(null)  // 清除已加載的文件
      hasMoreChunks.current = false
    }
    // 如果有分段文件，處理當前分段
    else if (fileChunks && fileChunks.currentIndex < fileChunks.chunks.length) {
      const currentChunk = fileChunks.chunks[fileChunks.currentIndex]
      const progressInfo = `第 ${fileChunks.currentIndex + 1}/${fileChunks.chunks.length} 部分`
      
      if (fileChunks.currentIndex === 0) {
        // 第一段：包含用戶問題
        messageContent = `請分析以下文件內容（${fileChunks.fileName}，${progressInfo}）：\n\n${currentChunk}\n\n我的問題：${messageContent}${skillContext}\n\n⚠️ 注意：這是大文件的第一部分，後續還有 ${fileChunks.chunks.length - 1} 個部分，請先分析這部分內容。`
      } else {
        // 後續段落：繼續分析
        messageContent = `繼續分析文件（${fileChunks.fileName}，${progressInfo}）：\n\n${currentChunk}\n\n請基於之前的分析繼續處理這部分內容。${fileChunks.currentIndex === fileChunks.chunks.length - 1 ? '\n\n✅ 這是最後一部分，請提供完整的分析結論。' : ''}`
      }
      
      // 移動到下一個分段（如果還有的話）
      if (fileChunks.currentIndex < fileChunks.chunks.length - 1) {
        setFileChunks({
          ...fileChunks,
          currentIndex: fileChunks.currentIndex + 1
        })
        hasMoreChunks.current = true  // 標記還有後續分段
      } else {
        // 所有分段處理完畢
        setFileChunks(null)
        hasMoreChunks.current = false
      }
    }
    // 如果有已讀取的分析數據，附加到消息中
    else if (loadedOracleData) {
      const selectedOracle = oracleInstances.find(o => o.id === selectedOracleId)
      if (selectedOracle?.oracleQueryResult) {
        messageContent = `請分析以下 Oracle 查詢結果（${selectedOracle.title}）：\n\n${selectedOracle.oracleQueryResult}\n\n我的問題：${messageContent}${skillContext}`
      }
      setLoadedOracleData(false)
    } else if (loadedWebPageData) {
      const selectedWebView = webViewInstances.find(w => w.id === selectedWebViewId)
      if (selectedWebView?.webviewContent) {
        messageContent = `請分析以下網頁內容（${selectedWebView.title}）：\n\n${selectedWebView.webviewContent}\n\n我的問題：${messageContent}${skillContext}`
      }
      setLoadedWebPageData(false)
    } else if (skillContext) {
      // 如果有技能上下文但沒有其他加載內容，也加上
      messageContent = messageContent + skillContext
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
    const selectionMode = copilotConfig?.knowledgeSelectionMode || 'ai'
    const isDeepMode = selectionMode === 'ai-deep' || selectionMode === 'ai-ultra'

    // 初始化處理步驟（依模式動態顯示）
    const steps: ProcessingStep[] = isDeepMode
      ? [
          { id: 'skills', label: '🎯 分析技能需求 [本地算法]', status: 'pending' },
          { id: 'expand', label: '🧠 問題拆解與查詢擴寫 [AI 第 1 次]', status: 'pending' },
          { id: 'index', label: '🔍 AI 重排挑選文檔 [AI 第 2 次]', status: 'pending' },
          { id: 'knowledge', label: '📚 載入知識庫內容 [本地讀取]', status: 'pending' },
          { id: 'generate', label: '✨ 生成完整回應 [AI 第 3 次]', status: 'pending' }
        ]
      : [
          { id: 'skills', label: '🎯 分析技能需求 [本地算法]', status: 'pending' },
          { id: 'index', label: selectionMode === 'ai' ? '🔍 AI 智能選擇文檔 [AI 第 1 次]' : '🔍 關鍵詞匹配知識庫 [本地算法]', status: 'pending' },
          { id: 'knowledge', label: '📚 載入知識庫內容 [本地讀取]', status: 'pending' },
          { id: 'generate', label: selectionMode === 'ai' ? '✨ 生成完整回應 [AI 第 2 次]' : '✨ 生成完整回應 [AI 第 1 次]', status: 'pending' }
        ]
    setProcessingSteps(steps)
    setShowSteps(true)
    
    // 創建 AbortController
    abortControllerRef.current = new AbortController()
    
    // 更新步驟狀態的輔助函數（帶錯誤保護）
    const updateStep = (stepId: string, updates: Partial<ProcessingStep>) => {
      try {
        // 這裡用 flushSync 讓步驟狀態先渲染，避免出現「回應已完成但仍顯示載入中」的錯覺
        flushSync(() => {
          setProcessingSteps(prev => prev.map(step => 
            step.id === stepId 
              ? { 
                  ...step, 
                  ...updates, 
                  ...(updates.status === 'running' && !step.startTime ? { startTime: Date.now() } : {}), 
                  ...(updates.status === 'completed' || updates.status === 'error' ? { endTime: Date.now() } : {}) 
                }
              : step
          ))
        })
      } catch (err) {
        console.error('[CopilotChat] Failed to update step:', stepId, err)
      }
    }

    try {
      if (!copilotConfig?.apiKey || !copilotConfig?.model) {
        throw new Error('請先在設定中配置 Copilot API Key 和模型')
      }

      // 獲取當前終端的 shell 類型
      const currentTerminal = availableTerminals.find(t => t.id === targetTerminalId)
      const shellType = (currentTerminal as any)?.shell || 'powershell'
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

      // 使用智能選擇器分析用戶問題，自動選擇相關的 skills 和 knowledge
      updateStep('skills', { status: 'running', detail: '分析問題並選擇相關技能...' })
      
      const userQuestion = userMessage.content
      const allSkills = settingsStore.getCopilotSkills()
      const allKnowledge = knowledgeStore.getActiveKnowledge()

      let selectedSkills: any[] = []
      let selectedKnowledge: any[] = []
      let analysis: any = null

      // UI 需要更明確的提示：超深度是否啟用「保底候選」、是否加入「索引補充」
      let usedFallbackCandidates = false
      let fallbackCandidatesCount = 0
      let indexSupplementCount = 0

      const safeJsonParse = <T,>(text: string): T | null => {
        try {
          return JSON.parse(text) as T
        } catch {
          return null
        }
      }

      const escapeForPrompt = (value: unknown) => {
        const str = typeof value === 'string' ? value : JSON.stringify(value ?? '')
        return String(str).replace(/[\u0000-\u001F]/g, ' ').trim()
      }

      const trimText = (text: string, maxLen: number) => {
        const t = (text || '').trim()
        if (t.length <= maxLen) return t
        return t.slice(0, maxLen) + '…'
      }

      const trimArray = (arr: unknown, maxItems: number) => {
        if (!Array.isArray(arr)) return [] as string[]
        return arr
          .filter(x => typeof x === 'string')
          .map(x => x.trim())
          .filter(Boolean)
          .slice(0, maxItems)
      }

      const extractKeywords = (question: string) => {
        // 提取問題中的關鍵詞（去除常見詞）
        const stopWords = ['如何', '怎麼', '什麼', '為什麼', '是', '的', '嗎', '呢', '吧', '啊', '了', '我', '你', '他', '要', '能', '會', '有', '在', '到']
        return question
          .split(/[\s,，、。！？;；]+/)
          .map(w => w.trim())
          .filter(word => word.length >= 2 && !stopWords.includes(word))
      }

      const buildKnowledgeDescriptor = (k: any, idx: number) => {
        const index = k.index
        const isIndexed = !!index
        const summary = isIndexed ? trimText(String(index.summary || ''), 220) : ''
        const keywords = isIndexed ? trimArray(index.keywords, 12) : []
        const topics = isIndexed ? trimArray(index.topics, 8) : []
        const businessProcesses = isIndexed ? trimArray(index.businessProcesses, 8) : []
        const technicalAreas = isIndexed ? trimArray(index.technicalAreas, 8) : []
        return {
          displayNo: idx + 1,
          name: String(k.name || ''),
          category: String(k.category || ''),
          tags: typeof k.tags === 'string' ? k.tags : '',
          isIndexed,
          summary,
          keywords,
          topics,
          businessProcesses,
          technicalAreas
        }
      }

      const scoreKnowledgeEntry = (k: any, terms: string[]) => {
        const name = String(k.name || '').toLowerCase()
        const tags = (typeof k.tags === 'string' ? k.tags : '').toLowerCase()
        const index = k.index
        const indexedBonus = index ? 6 : 0
        const indexKeywords = (index?.keywords || []).map((x: string) => String(x).toLowerCase())
        const indexTopics = (index?.topics || []).map((x: string) => String(x).toLowerCase())
        const indexSummary = String(index?.summary || '').toLowerCase()
        const indexBiz = (index?.businessProcesses || []).map((x: string) => String(x).toLowerCase())
        const indexTech = (index?.technicalAreas || []).map((x: string) => String(x).toLowerCase())
        const haystack = [name, tags, indexSummary, ...indexKeywords, ...indexTopics, ...indexBiz, ...indexTech].join(' | ')

        let score = indexedBonus
        for (const rawTerm of terms) {
          const term = rawTerm.trim().toLowerCase()
          if (term.length < 2) continue
          if (name.includes(term)) score += 14
          if (tags && tags.includes(term)) score += 10
          if (indexKeywords.includes(term)) score += 12
          if (indexTopics.includes(term)) score += 8
          if (indexBiz.some((x: string) => x.includes(term))) score += 8
          if (indexTech.some((x: string) => x.includes(term))) score += 8
          if (haystack.includes(term)) score += 2
        }
        return score
      }
      
      // 檢查是否被取消
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('用戶已取消操作')
      }
      
      if ((selectionMode === 'ai' || isDeepMode) && allKnowledge.length > 0) {
        console.log('[CopilotChat] Using AI-driven knowledge selection, mode:', selectionMode, 'available knowledge:', allKnowledge.length)

        if (isDeepMode) {
          updateStep('expand', { status: 'running', detail: '拆解問題並擴寫檢索查詢...' })

          type DeepQueryPlan = {
            intent?: string
            queries: string[]
            keywords?: string[]
            entities?: string[]
            mustHave?: string[]
            niceToHave?: string[]
            exclude?: string[]
          }

          const expandSystemPrompt = `你是「知識庫檢索查詢擴寫」助手。你的任務是：把用戶問題拆解成可用於文件檢索的多組查詢語句與關鍵詞（中英文都可以）。

要求：
- 只輸出 JSON（不要 markdown，不要解釋）。
- JSON schema：
{
  "intent": "一句話描述用戶要做什麼",
  "queries": ["3-8 條查詢語句"],
  "keywords": ["8-20 個關鍵詞/同義詞/縮寫"],
  "entities": ["相關系統名/表名/流程名/產品名（如有）"],
  "mustHave": ["必須命中的概念"],
  "niceToHave": ["加分概念"],
  "exclude": ["應排除/避免的概念" ]
}

注意：
- queries 要偏向『文件標題/索引』語氣，不要像聊天。
- 若資訊不足，也要給出可能的候選關鍵詞。`

          // 檢查是否被取消
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error('用戶已取消操作')
          }

          let queryPlan: DeepQueryPlan | null = null
          try {
            const expandResult = await window.electronAPI.copilot.chat('knowledge-expand', {
              messages: [
                { role: 'system', content: expandSystemPrompt },
                { role: 'user', content: `用戶問題：${userQuestion}` }
              ],
              model: copilotConfig.model || 'gpt-4o'
            })

            const raw = String(expandResult?.content || '').trim()
            const parsed = safeJsonParse<DeepQueryPlan>(raw)
            if (parsed && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
              queryPlan = parsed
            }
          } catch (err) {
            console.warn('[CopilotChat] Deep expand failed, will fall back to local keywords:', err)
          }

          const localKeywords = extractKeywords(userQuestion)
          const combinedTerms = Array.from(
            new Set(
              [
                ...(queryPlan?.queries || []),
                ...(queryPlan?.keywords || []),
                ...(queryPlan?.entities || []),
                ...(queryPlan?.mustHave || []),
                ...(queryPlan?.niceToHave || []),
                ...localKeywords
              ]
                .map(s => String(s).trim())
                .filter(Boolean)
                .slice(0, 60)
            )
          )

          updateStep('expand', {
            status: 'completed',
            detail: `產生 ${queryPlan?.queries?.length || 0} 條查詢 / ${combinedTerms.length} 個檢索詞`
          })

          if (queryPlan?.queries?.length) {
            const previewQueries = queryPlan.queries.slice(0, 6).map((q, i) => `${i + 1}. ${q}`).join('\n')
            setMessages(prev => [...prev, { role: 'info', content: `🧠 **深度檢索：查詢擴寫**\n\n${previewQueries}` }])
          }

          updateStep('index', { status: 'running', detail: `本地初選候選文件（共 ${allKnowledge.length}）...` })

          // 本地先用 index/tags/name 做候選縮小，降低後續 prompt 大小並提升穩定性
          const scored = allKnowledge
            .map((k: any, idx: number) => ({ k, idx, score: scoreKnowledgeEntry(k, combinedTerms) }))
            .sort((a, b) => b.score - a.score)

          const MAX_CANDIDATES = selectionMode === 'ai-ultra'
            ? Math.min(60, Math.max(20, Math.floor(allKnowledge.length * 0.35)))
            : Math.min(30, Math.max(12, Math.floor(allKnowledge.length * 0.15)))
          const candidates = scored
            .filter(x => x.score > 0 || x.k.index) // 允許已索引的文件即使 0 分也進入候選
            .slice(0, MAX_CANDIDATES)

          console.log('[CopilotChat] Deep rerank - local scoring:', {
            totalKnowledge: allKnowledge.length,
            combinedTermsCount: combinedTerms.length,
            scoredCount: scored.length,
            candidatesAfterFilter: candidates.length,
            topScores: scored.slice(0, 5).map(s => ({ name: s.k.name, score: s.score }))
          })

          // 若候選為空，直接回退到關鍵詞匹配
          if (candidates.length === 0) {
            console.log('[CopilotChat] No candidates found in deep rerank, falling back to keyword matching')
            const fallback = smartSelect(userQuestion, allSkills, allKnowledge)
            analysis = fallback.analysis
            selectedSkills = fallback.selectedSkills
            selectedKnowledge = fallback.selectedKnowledge
            updateStep('index', { status: 'completed', detail: `無候選文件，改用關鍵詞：${selectedKnowledge.length} 個` })
          } else {
            const candidateDescriptors = candidates.map(x => buildKnowledgeDescriptor(x.k, x.idx))
            const indexedCount = allKnowledge.filter((k: any) => k.index).length

            console.log('[CopilotChat] Candidate descriptors:', {
              count: candidateDescriptors.length,
              names: candidateDescriptors.slice(0, 5).map(d => d.name),
              fullDescriptors: candidateDescriptors.map(d => ({
                name: d.name,
                category: d.category,
                isIndexed: d.isIndexed,
                summary: d.summary,
                keywords: d.keywords,
                topics: d.topics
              }))
            })

            // 候選清單編號必須是「候選列表中的序號」(1..N)，不能用 allKnowledge 的 index
            const candidateListPrompt = candidateDescriptors
            .map((d, i) => {
              const idxFlag = d.isIndexed ? '[已索引]' : '[未索引]'
              const tags = d.tags ? `\n   標籤: ${d.tags}` : ''
              const indexBlock = d.isIndexed
                ? `\n   摘要: ${escapeForPrompt(d.summary)}\n   keywords: ${d.keywords.join(', ')}\n   topics: ${d.topics.join(', ')}\n   business: ${d.businessProcesses.join(', ')}\n   tech: ${d.technicalAreas.join(', ')}`
                : ''
              return `${i + 1}. **${d.name}** [${d.category}] ${idxFlag}${tags}${indexBlock}`
            })
            .join('\n\n---\n\n')

          const rerankSystemPrompt = `你是知識庫選擇助手（深度檢索/重排模式）。

你會拿到：
- 用戶問題
- 一組擴寫查詢（用於判斷語義）
- 一份「本地初選」的候選文件清單（包含索引摘要/keywords/topics 等）

你的目標：從候選清單中選出最相關的文件（1-${selectionMode === 'ai-ultra' ? 8 : 5} 個），寧缺毋濫。

輸出要求：只輸出 JSON（不要 markdown，不要解釋）：
{
  "selected": [ { "no": 3, "confidence": 0.0, "reason": "..." } ],
  "overallConfidence": 0.0,
  "needMore": false
}

注意：
- no 是候選清單的編號（不是 fileId）。
- confidence 與 overallConfidence 範圍 0.0~1.0。
- 若完全不相關，selected 置空，overallConfidence 低，needMore 依情況設 true/false。`

          // 檢查是否被取消
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error('用戶已取消操作')
          }

          try {
            const rerankResult = await window.electronAPI.copilot.chat('knowledge-rerank', {
              messages: [
                { role: 'system', content: rerankSystemPrompt },
                {
                  role: 'user',
                  content: `用戶問題：${userQuestion}\n\n擴寫查詢：\n${(queryPlan?.queries || localKeywords).slice(0, 8).map(q => `- ${q}`).join('\n')}\n\n候選文件（共 ${candidateDescriptors.length} / 知識庫共 ${allKnowledge.length}，已索引 ${indexedCount}）：\n\n${candidateListPrompt}`
                }
              ],
              model: copilotConfig.model || 'gpt-4o'
            })

            const raw = String(rerankResult?.content || '').trim()
            console.log('[CopilotChat] AI rerank raw response:', raw.substring(0, 500))
            
            type RerankOut = { selected?: Array<{ no: number; confidence?: number }>; overallConfidence?: number; needMore?: boolean }
            const parsed = safeJsonParse<RerankOut>(raw)
            console.log('[CopilotChat] AI rerank parsed:', parsed)

            // 只在 parsed 存在且 selected 有內容時處理；並依 confidence 由高到低排序
            const selectedNos: number[] = []
            if (parsed?.selected && Array.isArray(parsed.selected) && parsed.selected.length > 0) {
              const ranked = parsed.selected
                .map(s => ({
                  no: Number((s as any).no),
                  confidence: Number((s as any).confidence)
                }))
                .filter(x => Number.isFinite(x.no))
                .sort((a, b) => {
                  const ac = Number.isFinite(a.confidence) ? a.confidence : -1
                  const bc = Number.isFinite(b.confidence) ? b.confidence : -1
                  return bc - ac
                })
              for (const r of ranked) selectedNos.push(r.no)
            }

            // 注意：no 是「候選清單」的編號，不是 allKnowledge 的索引
            const selectedCandidateIndices = Array.from(new Set(selectedNos))
              .map(n => n - 1)
              .filter(idx => idx >= 0 && idx < candidates.length)

            console.log('[CopilotChat] AI rerank selection:', {
              selectedNos,
              selectedCandidateIndices,
              candidatesLength: candidates.length
            })

            selectedKnowledge = selectedCandidateIndices.map(idx => candidates[idx].k)
            console.log('[CopilotChat] Selected knowledge:', selectedKnowledge.map(k => k.name))

            // 若深度重排沒有選到任何知識：採用本地最佳候選（ai-ultra 取 2 份以提高命中率）
            if (selectedKnowledge.length === 0 && candidates.length > 0) {
              const fallbackCount = Math.min(selectionMode === 'ai-ultra' ? 2 : 1, candidates.length)
              selectedKnowledge = candidates.slice(0, fallbackCount).map(x => x.k)
              usedFallbackCandidates = true
              fallbackCandidatesCount = fallbackCount
              console.log('[CopilotChat] Deep rerank empty selection; using top candidates instead:', selectedKnowledge.map(k => k.name))
              updateStep('index', {
                status: 'completed',
                detail: selectionMode === 'ai-ultra'
                  ? `重排無結果，啟用保底候選：${selectedKnowledge.length} 個`
                  : `重排無結果，採用最佳候選：${selectedKnowledge.length} 個`
              })
            } else {
              updateStep('index', { status: 'completed', detail: `選出 ${selectedKnowledge.length} 個相關文檔` })
            }

            if (selectedKnowledge.length > 0) {
              const knowledgeListMsg: CopilotMessage = {
                role: 'info',
                content: `🧠 **AI 深度檢索：重排選擇**\n\n📚 已選擇 ${selectedKnowledge.length} 個相關知識庫：\n${selectedKnowledge.map((k: any, i: number) => `${i + 1}. ${k.name}`).join('\n')}`
              }
              setMessages(prev => [...prev, knowledgeListMsg])
            }
          } catch (error) {
            console.error('[CopilotChat] Deep rerank failed, falling back to keyword matching:', error)
            updateStep('index', { status: 'error', detail: '深度檢索失敗，使用關鍵詞匹配' })
            const result = smartSelect(userQuestion, allSkills, allKnowledge)
            analysis = result.analysis
            selectedSkills = result.selectedSkills
            selectedKnowledge = result.selectedKnowledge
            updateStep('index', { status: 'completed', detail: `關鍵詞匹配：${selectedKnowledge.length} 個` })
          }

          // Skills 仍使用關鍵詞匹配選擇（避免額外成本）
          const skillResult = smartSelect(userQuestion, allSkills, [])
          selectedSkills = skillResult.selectedSkills
          analysis = skillResult.analysis
          }

          // Skills 仍使用關鍵詞匹配選擇（避免額外成本）
          const skillResult = smartSelect(userQuestion, allSkills, [])
          selectedSkills = skillResult.selectedSkills
          analysis = skillResult.analysis
        } else {
          updateStep('index', { status: 'running', detail: `掃描 ${allKnowledge.length} 個知識索引...` })

          // AI 單次選擇：盡量使用 index 資訊而非全文預覽（更精準且 prompt 更小）
          const keywords = extractKeywords(userQuestion)
          console.log('[CopilotChat] Extracted keywords for index-aware selection:', keywords)

          const knowledgeListPrompt = allKnowledge.map((k: any, idx: number) => {
            const d = buildKnowledgeDescriptor(k, idx)
            const idxFlag = d.isIndexed ? '[已索引]' : '[未索引]'
            const tags = d.tags ? `\n   標籤: ${d.tags}` : ''
            const indexBlock = d.isIndexed
              ? `\n   摘要: ${escapeForPrompt(d.summary)}\n   keywords: ${d.keywords.join(', ')}\n   topics: ${d.topics.join(', ')}\n   business: ${d.businessProcesses.join(', ')}\n   tech: ${d.technicalAreas.join(', ')}`
              : ''
            return `${idx + 1}. **${d.name}** [${d.category}] ${idxFlag}${tags}${indexBlock}`
          }).join('\n\n---\n\n')

          const indexedCount = allKnowledge.filter((k: any) => k.index).length
          const selectionSystemPrompt = `你是知識庫選擇助手（智能索引模式）。用戶會問一個問題，你需要從知識庫列表中選出最相關的條目。

## 🔍 兩階段查詢原理
第一階段（現在）：根據**索引**快速匹配相關文件
第二階段（之後）：讀取選中文件的**完整內容**進行精準回答

## 📚 可用知識庫（共 ${allKnowledge.length} 個，已索引 ${indexedCount} 個）：

${knowledgeListPrompt}

## 🎯 選擇策略（按優先級）：
1. **索引優先** ✨ [已索引] 標記的文件
   - 查看摘要、業務流程、技術領域是否匹配用戶問題
   - 關鍵詞命中度高的優先
   - 索引信息比內容預覽更可靠

2. **語義匹配**
   - 業務流程匹配：用戶問「立帳」→ 選擇包含「立帳」業務流程的文件
   - 技術領域匹配：用戶問「PL/SQL」→ 選擇技術領域包含「PL/SQL」的文件
   - 關鍵詞匹配：用戶問「開發票」→ 選擇關鍵詞包含「invoice, 發票」的文件

3. **質量優於數量**
   - 找到精準答案：選 1-2 個即可
   - 需要交叉參考：選 2-3 個
   - 主題廣泛探索：最多 4-5 個
   - 寧缺毋濫：不確定就不要選

4. **降級處理** ⚠️ [未索引] 標記的文件
   - 只在沒有索引文件時才考慮
   - 使用內容預覽進行匹配（較慢且不精準）

## 📤 輸出格式：
只回答知識庫的編號，用逗號分隔，例如：3,7,11
如果完全無相關知識庫，回答：無

## ⚠️ 注意：
- 選擇後會讀取完整文件內容（可能很大），所以要精準
- 索引信息是 AI 分析生成的，準確度很高
- 沒有索引的文件匹配準確度較低，謹慎選擇`

          try {
            const selectionResult = await window.electronAPI.copilot.chat('knowledge-selection', {
            messages: [
              { role: 'system', content: selectionSystemPrompt },
              { role: 'user', content: `用戶問題：「${userQuestion}」\n\n請選擇相關的知識庫編號：` }
            ],
            model: copilotConfig.model || 'gpt-4o'
          })
          
          console.log('[CopilotChat] AI selection raw result:', selectionResult.content)
          
          // 解析 AI 返回的編號
          const selectedIndices: number[] = []
          const content = selectionResult.content || ''
          if (content && !content.includes('無') && !content.includes('没有')) {
            const matches = content.match(/\d+/g)
            if (matches) {
              selectedIndices.push(...matches.map((n: string) => parseInt(n) - 1))
            }
          }
          
          selectedKnowledge = selectedIndices
            .filter(idx => idx >= 0 && idx < allKnowledge.length)
            .map(idx => allKnowledge[idx])
          
          console.log('[CopilotChat] AI selected knowledge indices:', selectedIndices)
          console.log('[CopilotChat] AI selected knowledge names:', selectedKnowledge.map(k => k.name))
          
          updateStep('index', { status: 'completed', detail: `找到 ${selectedKnowledge.length} 個相關索引` })
          
          // 顯示 AI 選擇結果
          if (selectedKnowledge.length > 0) {
            const knowledgeListMsg: CopilotMessage = {
              role: 'info',
              content: `🤖 **AI 智能選擇**\n\n📚 已選擇 ${selectedKnowledge.length} 個相關知識庫：\n${selectedKnowledge.map((k, i) => `${i + 1}. ${k.name}`).join('\n')}`
            }
            setMessages(prev => [...prev, knowledgeListMsg])
          }
          
          } catch (error) {
            console.error('[CopilotChat] AI selection failed, falling back to keyword matching:', error)
            updateStep('index', { status: 'error', detail: 'AI 選擇失敗，使用關鍵詞匹配' })
            // 失敗時回退到關鍵詞匹配
            const result = smartSelect(userQuestion, allSkills, allKnowledge)
            analysis = result.analysis
            selectedSkills = result.selectedSkills
            selectedKnowledge = result.selectedKnowledge
            updateStep('index', { status: 'completed', detail: `關鍵詞匹配：${selectedKnowledge.length} 個` })
          }
          
          // Skills 仍使用關鍵詞匹配選擇
          const skillResult = smartSelect(userQuestion, allSkills, [])
          selectedSkills = skillResult.selectedSkills
          analysis = skillResult.analysis
        }
      } else {
        // 關鍵詞匹配模式
        console.log('[CopilotChat] Using keyword-based selection')
        const result = smartSelect(userQuestion, allSkills, allKnowledge)
        analysis = result.analysis
        selectedSkills = result.selectedSkills
        selectedKnowledge = result.selectedKnowledge
      }
      
      console.log('[CopilotChat] Smart selection result:', {
        userQuestion: userQuestion.substring(0, 100),
        mode: selectionMode,
        intent: analysis?.intent,
        confidence: analysis?.confidence,
        skillsSelected: selectedSkills.length,
        knowledgeSelected: selectedKnowledge.length
      })
      
      updateStep('skills', { status: 'completed', detail: `${selectedSkills.length} 個技能已啟用` })
      
      // 如果是關鍵詞模式且置信度足夠，顯示選擇的 skills
      if (selectionMode === 'keyword' && analysis && analysis.confidence > 0.5 && selectedSkills.length > 0) {
        const skillsList = selectedSkills.map(s => `${s.icon} **${s.name}**`).join(', ')
        const knowledgeInfo = selectedKnowledge.length > 0 ? `\n📚 相關知識：${selectedKnowledge.length} 個文檔` : ''
        
        const selectionInfo: CopilotMessage = {
          role: 'info',
          content: `🔍 **關鍵詞匹配** (置信度: ${(analysis.confidence * 100).toFixed(0)}%)\n\n已啟用能力：${skillsList}${knowledgeInfo}`
        }
        setMessages(prev => [...prev, selectionInfo])
      } else if (selectionMode === 'ai' && selectedSkills.length > 0) {
        const skillsList = selectedSkills.map(s => `${s.icon} **${s.name}**`).join(', ')
        const selectionInfo: CopilotMessage = {
          role: 'info',
          content: `🎯 已啟用能力：${skillsList}`
        }
        setMessages(prev => [...prev, selectionInfo])
      }
      
      // 構建 skills prompt（不顯示載入知識庫步驟，因為還沒開始）
      const skillsPrompt = buildSystemPromptFromSkills(selectedSkills)
      
      // 根據當前模型獲取知識庫限制
      const { getModelKnowledgeLimit } = await import('../types/knowledge-base')
      const modelLimits = getModelKnowledgeLimit(copilotConfig.model)
      
      // 開始載入知識庫內容
      updateStep('knowledge', { status: 'running', detail: '載入知識庫內容...' })
      
      // 使用智能選擇的知識（已經過濾過相關的）
      let knowledgePrompt = ''
      const includedKnowledge: Array<{ name: string; content: string; truncated: boolean }> = []
      
      const totalKnowledgeSize = selectedKnowledge.reduce((sum, k) => sum + k.content.length, 0)
      
      console.log('[CopilotChat] Building knowledge prompt (smart selected):', {
        model: copilotConfig.model,
        limits: modelLimits,
        selectedKnowledgeCount: selectedKnowledge.length,
        totalKnowledgeSize: totalKnowledgeSize,
        totalKnowledgeSizeKB: (totalKnowledgeSize / 1024).toFixed(1)
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
      
      if (selectedKnowledge.length > 0) {
        const MAX_KNOWLEDGE_LENGTH = modelLimits.maxTotal
        const MAX_SINGLE_ENTRY = modelLimits.maxSingle
        const MIN_ENTRIES = selectionMode === 'ai-ultra' ? 3 : 2  // 至少保證 N 個知識庫
        const TARGET_ENTRIES = selectionMode === 'ai-ultra' ? 5 : 4  // ai-deep 預設 4，避免 4 選 3 擠掉最相關
        let totalLength = 0
        
        // 階段 1：優先保證前 MIN_ENTRIES 個完整載入
        console.log('[CopilotChat] Phase 1: Ensuring minimum entries')
        for (let i = 0; i < Math.min(MIN_ENTRIES, selectedKnowledge.length); i++) {
          const k = selectedKnowledge[i]
          let entryContent = k.content
          let truncated = false
          
          // 對於前 MIN_ENTRIES 個，即使超過單個限制也盡量多包含
          if (entryContent.length > MAX_SINGLE_ENTRY) {
            entryContent = entryContent.substring(0, MAX_SINGLE_ENTRY)
            truncated = true
            console.log('[CopilotChat] Priority entry truncated:', {
              name: k.name,
              priority: i + 1,
              original: k.content.length,
              truncated: entryContent.length
            })
          }
          
          includedKnowledge.push({ name: k.name, content: entryContent, truncated })
          totalLength += entryContent.length
          
          console.log('[CopilotChat] Priority entry included:', {
            name: k.name,
            index: i + 1,
            entryLength: entryContent.length,
            totalLength: totalLength
          })
        }
        
        // 階段 2：嘗試添加更多知識庫（最多到 TARGET_ENTRIES 或總限制）
        console.log('[CopilotChat] Phase 2: Adding additional entries if space allows')
        for (let i = MIN_ENTRIES; i < selectedKnowledge.length; i++) {
          const k = selectedKnowledge[i]
          let entryContent = k.content
          let truncated = false
          
          // 檢查是否已達目標數量
          if (includedKnowledge.length >= TARGET_ENTRIES) {
            console.log('[CopilotChat] Reached target entries, stopping:', TARGET_ENTRIES)
            break
          }
          
          // 如果單個文件太大，智能截斷
          if (entryContent.length > MAX_SINGLE_ENTRY) {
            entryContent = entryContent.substring(0, MAX_SINGLE_ENTRY)
            truncated = true
          }
          
          const entryText = `【${k.name}】\n${entryContent}`
          
          console.log('[CopilotChat] Evaluating additional entry:', {
            name: k.name,
            entryLength: entryText.length,
            currentTotal: totalLength,
            wouldExceed: totalLength + entryText.length > MAX_KNOWLEDGE_LENGTH
          })
          
          // 檢查是否會超過總限制
          if (totalLength + entryText.length < MAX_KNOWLEDGE_LENGTH) {
            includedKnowledge.push({ name: k.name, content: entryContent, truncated })
            totalLength += entryText.length
            console.log('[CopilotChat] Additional entry included:', {
              name: k.name,
              totalEntries: includedKnowledge.length
            })
          } else {
            console.log('[CopilotChat] Would exceed total limit, stopping')
            break
          }
        }
        
        console.log('[CopilotChat] Included knowledge:', {
          count: includedKnowledge.length,
          totalLength: totalLength
        })
        
        if (includedKnowledge.length > 0) {
          updateStep('knowledge', { status: 'completed', detail: `載入 ${includedKnowledge.length} 個文檔` })
        } else {
          updateStep('knowledge', { status: 'completed', detail: '無相關知識庫' })
        }
        
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
          
          if (includedKnowledge.length < selectedKnowledge.length) {
            const dropped = selectedKnowledge
              .filter(k => !includedKnowledge.some(x => x.name === k.name))
              .map(k => k.name)

            // 記錄「索引補充」狀態，並回寫到步驟 UI（讓超深度更透明）
            indexSupplementCount = dropped.length
            knowledgePrompt += `\n(註：因內容/長度限制，完整載入 ${includedKnowledge.length}/${selectedKnowledge.length} 個；未完整載入：${dropped.join('、')})\n`

            // 額外補一段「索引摘要」給被擠掉的文件，讓回答至少能看到關鍵線索（成本低於全文）
            const droppedIndexSummaries = selectedKnowledge
              .filter(k => !includedKnowledge.some(x => x.name === k.name))
              .map((k: any) => {
                const idx = k.index
                if (!idx) return `- ${k.name}（未索引）`
                const kw = Array.isArray(idx.keywords) ? idx.keywords.slice(0, 10).join(', ') : ''
                const tp = Array.isArray(idx.topics) ? idx.topics.slice(0, 8).join(', ') : ''
                const sm = String(idx.summary || '').slice(0, 260)
                return `- ${k.name}\n  摘要: ${sm}${sm.length >= 260 ? '…' : ''}${kw ? `\n  keywords: ${kw}` : ''}${tp ? `\n  topics: ${tp}` : ''}`
              })
              .join('\n')
            knowledgePrompt += `\n\n===== 索引補充（未完整載入的文件）=====\n${droppedIndexSummaries}\n===== 索引補充結束 =====\n`

            // 讓步驟 UI 明確顯示「索引補充已加入」
            updateStep('knowledge', {
              status: 'completed',
              detail: `載入 ${includedKnowledge.length} 個文檔（索引補充已加入：${indexSupplementCount} 份）`
            })
          } else if (selectionMode === 'ai-ultra' && usedFallbackCandidates) {
            // 超深度：若啟用保底候選但沒有發生索引補充，也提示在載入結果上
            updateStep('knowledge', {
              status: 'completed',
              detail: `載入 ${includedKnowledge.length} 個文檔（已使用保底候選：${fallbackCandidatesCount} 個）`
            })
          }
          
          // 顯示智能選擇的統計信息
          if (analysis.confidence > 0.5) {
            knowledgePrompt += `\n(智能選擇：根據問題"${analysis.intent}"自動篩選了相關知識)\n`
          }
        }
      } else {
        // 沒有任何知識庫可載入時，立刻結束此步驟避免 UI 一直顯示「載入中」
        updateStep('knowledge', { status: 'completed', detail: '無相關知識庫' })
      }
      
      const systemPrompt = `${basePrompt}

---

${skillsPrompt}${knowledgePrompt}

---

範例：
- 用戶："列出檔案"
  ${isWindows ? 'PowerShell: \`\`\`bash\nGet-ChildItem\n\`\`\`' : 'Bash: \`\`\`bash\nls -la\n\`\`\`'}
- 看到輸出後，你："目錄中有 X 個檔案，包括..."`

      // 限制對話歷史長度，避免 context 過大
      // 只保留最近的真實對話（user + assistant），過濾掉 info 消息
      const conversationMessages = newMessages.filter(m => m.role === 'user' || m.role === 'assistant')
      const MAX_HISTORY_MESSAGES = 6
      const recentMessages = conversationMessages.length > MAX_HISTORY_MESSAGES 
        ? conversationMessages.slice(-MAX_HISTORY_MESSAGES) 
        : conversationMessages
      
      console.log('[CopilotChat] Message history management:', {
        totalMessages: newMessages.length,
        conversationOnly: conversationMessages.length,
        infoMessages: newMessages.length - conversationMessages.length,
        keepingRecent: recentMessages.length,
        droppedOldest: conversationMessages.length - recentMessages.length
      })

      const options: CopilotChatOptions = {
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages
        ]
      }

      console.log('[CopilotChat] Sending chat request:', {
        chatId: `chat-${Date.now()}`,
        model: copilotConfig.model,
        modelLimits: modelLimits,
        messageCount: options.messages.length,
        systemPromptLength: systemPrompt.length,
        userMessagesLength: recentMessages.reduce((sum, m) => sum + m.content.length, 0),
        totalEstimatedLength: systemPrompt.length + recentMessages.reduce((sum, m) => sum + m.content.length, 0),
        hasKnowledge: selectedKnowledge.length > 0,
        knowledgeCount: selectedKnowledge.length,
        includedKnowledgeCount: includedKnowledge.length,
        knowledgePromptLength: knowledgePrompt.length,
        knowledgeEntries: selectedKnowledge.map(k => ({ name: k.name, size: k.content.length }))
      })
      
      // 確保「載入知識庫」步驟已完成，避免與「生成回應」步驟時序混亂
      await new Promise(resolve => setTimeout(resolve, 50))
      
      updateStep('generate', { status: 'running', detail: `使用 ${copilotConfig.model} 生成中...` })
      
      // 檢查是否被取消
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('用戶已取消操作')
      }
      
      // 檢查總長度是否超過限制（根據模型動態調整）
      const totalLength = systemPrompt.length + recentMessages.reduce((sum, m) => sum + m.content.length, 0)
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
        error: response?.error,
        isTruncated: response?.content && response.content.length > 0 && !response.content.trim().endsWith('。') && !response.content.trim().endsWith('.') && !response.content.trim().endsWith('！') && !response.content.trim().endsWith('!')
      })

      if (!response || !response.content) {
        const errorMsg = response?.error || '未收到回應'
        throw new Error(errorMsg)
      }
      
      // 檢查回應是否被截斷
      const contentEnding = response.content.trim().slice(-50)
      console.log('[CopilotChat] Response ending:', contentEnding)
      if (response.content.length > 100 && !contentEnding.match(/[。.！!？?」』】\)）]$/)) {
        console.warn('[CopilotChat] Response may be truncated, ending:', contentEnding)
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

      updateStep('generate', { status: 'completed', detail: '回應生成完成' })

      // 如果使用了知識庫，添加知識來源信息（AI 深度/關鍵詞模式也需顯示）
      const sourceKnowledge = includedKnowledge.length > 0 ? includedKnowledge : selectedKnowledge

      setMessages(prev => {
        const nextMessages = [...prev, assistantMessage]

        if (sourceKnowledge.length > 0) {
          const knowledgeNames = sourceKnowledge.map(k => `📄 **${k.name}**`).join('\n')
          const skillNames = selectedSkills.map(s => `${s.icon} ${s.name}`).join(', ')
          const skillLine = skillNames ? `\n\n🎯 **啟用能力**：${skillNames}` : ''

          const sourceInfo: CopilotMessage = {
            role: 'info',
            content: `📚 **使用的知識來源** (${sourceKnowledge.length} 個文檔)\n\n${knowledgeNames}${skillLine}`
          }
          nextMessages.push(sourceInfo)
        }

        return nextMessages
      })
      
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
      // 標記所有步驟為錯誤
      updateStep('skills', { status: 'error', detail: '處理失敗' })
      updateStep('expand', { status: 'error', detail: '處理失敗' })
      updateStep('index', { status: 'error', detail: '處理失敗' })
      updateStep('knowledge', { status: 'error', detail: '處理失敗' })
      updateStep('generate', { status: 'error', detail: '處理失敗' })
    } finally {
      setIsLoading(false)
      // 延遲隱藏步驟，讓用戶看到完整的結果
      setTimeout(() => {
        setShowSteps(false)
      }, 3000)
      abortControllerRef.current = null
      
      // 如果還有更多文件分段需要處理，自動繼續
      if (hasMoreChunks.current) {
        console.log(`[Copilot] Auto-continuing to next chunk`)
        hasMoreChunks.current = false  // 重置標記
        setTimeout(() => {
          // 自動發送繼續分析的請求
          handleSendMessage()
        }, 1500)
      }
    }
  }
  
  // 停止當前操作
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsLoading(false)
      setShowSteps(false)
      const cancelMsg: CopilotMessage = {
        role: 'info',
        content: '⏹️ 用戶已取消操作'
      }
      setMessages(prev => [...prev, cancelMsg])
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
                  isLoadingMessages.current = true
                  localStorage.removeItem(storageKey)
                  // Use flushSync to force immediate UI update
                  flushSync(() => {
                    setError(null)
                    setInput('')
                    setMessages([])
                  })
                  // Mark that we should focus input after state updates
                  shouldFocusInput.current = true
                  // Focus immediately after state is flushed
                  inputRef.current?.focus()
                  // Reset loading flag after a brief delay to allow save effect to skip
                  setTimeout(() => {
                    isLoadingMessages.current = false
                  }, 50)
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
          <div
            className="copilot-chat-messages"
            style={{
              ['--copilot-font-size' as any]: `${fontSize}px`
            } as any}
          >
            {messages.length === 0 && (
              <div className="copilot-chat-empty">
                <p>👋 嗨！我是 AI 助手</p>
                <p>有什麼可以幫助你的嗎？</p>
              </div>
            )}
            
            {messages.map((msg, idx) => {
              const commands = msg.role === 'assistant' ? extractCommands(msg.content) : []
              const fetchUrls = msg.role === 'assistant' ? extractFetchUrls(msg.content) : []
              return (
                <div key={idx} className={`copilot-message ${msg.role}`}>
                  {msg.role === 'user' && userInfo.username && (
                    <div style={{
                      fontSize: '11px',
                      color: '#58a6ff',
                      marginBottom: '4px',
                      fontWeight: '600',
                      fontFamily: 'Consolas, Monaco, monospace'
                    }}>
                      {userInfo.username}@{userInfo.hostname}
                    </div>
                  )}
                  <div 
                    className="copilot-message-content markdown-body"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(renderMathInHtml(marked.parse(msg.content) as string))
                    }}
                  />
                  {fetchUrls.length > 0 && (
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
                        偵測到 {fetchUrls.length} 個網頁
                      </div>
                      {fetchUrls.map((url, urlIdx) => (
                        <div key={urlIdx} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px',
                          fontSize: '11px'
                        }}>
                          <code style={{ 
                            flex: 1, 
                            padding: '6px 8px', 
                            backgroundColor: '#2d2d2d',
                            color: '#58a6ff',
                            borderRadius: '4px',
                            fontFamily: 'Consolas, Monaco, monospace',
                            fontSize: '11px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {url}
                          </code>
                          <button
                            onClick={() => executeFetch(url)}
                            disabled={isLoading}
                            style={{
                              padding: '5px 10px',
                              backgroundColor: isLoading ? '#404040' : '#16a34a',
                              color: isLoading ? '#8c8c8c' : '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: isLoading ? 'not-allowed' : 'pointer',
                              fontSize: '11px',
                              fontWeight: '500',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.15s ease'
                            }}
                            title={isLoading ? '處理中...' : '抓取網頁內容'}
                            onMouseOver={(e) => {
                              if (!isLoading) {
                                e.currentTarget.style.backgroundColor = '#15803d'
                              }
                            }}
                            onMouseOut={(e) => {
                              if (!isLoading) {
                                e.currentTarget.style.backgroundColor = '#16a34a'
                              }
                            }}
                          >
                            🌐 抓取
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
                <div className="copilot-message-content copilot-loading">
                  <span className="loading-spinner"></span>
                  <span>思考中...</span>
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
            {(availableTerminals.length > 0 || oracleInstances.length > 0 || webViewInstances.length > 0) ? (
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 8px',
                backgroundColor: '#1e1e1e', 
                borderRadius: '4px',
                border: '1px solid #2d2d2d',
                width: '100%',
                boxSizing: 'border-box',
                flexWrap: 'wrap',
                minHeight: '32px'
              }}>
                {/* 終端選擇 */}
                {availableTerminals.length > 0 && (
                  <>
                    <div style={{ 
                      fontSize: '14px',
                      flexShrink: 0
                    }}>
                      💻
                    </div>
                    <select
                      value={targetTerminalId}
                      onChange={(e) => setTargetTerminalId(e.target.value)}
                      style={{
                        minWidth: '100px',
                        padding: '4px 6px',
                        fontSize: '11px',
                        backgroundColor: '#2d2d2d',
                        color: '#e0e0e0',
                        border: '1px solid #444',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        height: '24px'
                      }}
                    >
                      {availableTerminals.map(terminal => (
                        <option key={terminal.id} value={terminal.id}>
                          {terminal.title}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                {/* 分隔線 */}
                {availableTerminals.length > 0 && (oracleInstances.length > 0 || webViewInstances.length > 0) && (
                  <div style={{
                    width: '1px',
                    height: '20px',
                    backgroundColor: '#444',
                    flexShrink: 0
                  }} />
                )}

                {/* 資料庫選擇 */}
                {oracleInstances.length > 0 && (
                  <>
                    <div style={{ 
                      fontSize: '14px',
                      flexShrink: 0
                    }}>
                      🗄️
                    </div>
                    <select
                      value={selectedOracleId}
                      onChange={(e) => {
                        setSelectedOracleId(e.target.value)
                        setLoadedOracleData(false)
                      }}
                      style={{
                        minWidth: '100px',
                        padding: '4px 6px',
                        fontSize: '11px',
                        backgroundColor: '#2d2d2d',
                        color: '#e0e0e0',
                        border: '1px solid #444',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        height: '24px'
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
                        padding: '4px 8px',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: '600',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        transition: 'background-color 0.15s',
                        height: '24px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#e53e3e'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#dc2626'
                      }}
                    >
                      分析
                    </button>
                  </>
                )}

                {/* 分隔線 */}
                {oracleInstances.length > 0 && webViewInstances.length > 0 && (
                  <div style={{
                    width: '1px',
                    height: '20px',
                    backgroundColor: '#444',
                    flexShrink: 0
                  }} />
                )}

                {/* 網頁選擇 */}
                {webViewInstances.length > 0 && (
                  <>
                    <div style={{ 
                      fontSize: '14px',
                      flexShrink: 0
                    }}>
                      🌐
                    </div>
                    <select
                      value={selectedWebViewId}
                      onChange={(e) => {
                        setSelectedWebViewId(e.target.value)
                        setLoadedWebPageData(false)
                      }}
                      style={{
                        minWidth: '100px',
                        padding: '4px 6px',
                        fontSize: '11px',
                        backgroundColor: '#2d2d2d',
                        color: '#e0e0e0',
                        border: '1px solid #444',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        height: '24px'
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
                        padding: '4px 8px',
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: '600',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        transition: 'background-color 0.15s',
                        height: '24px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#22c55e'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#16a34a'
                      }}
                    >
                      分析
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ 
                padding: '12px',
                backgroundColor: '#1e1e1e', 
                borderRadius: '6px',
                border: '1px solid #2d2d2d',
                width: '100%',
                boxSizing: 'border-box',
                textAlign: 'center', 
                color: '#666',
                fontSize: '12px'
              }}>
                暫無可用的終端或實例
              </div>
            )}
          </div>

          <div className="copilot-chat-input-area">
            {/* 處理步驟展示 - 固定在輸入框上方 */}
            {showSteps && (
              <div style={{
                marginBottom: '12px',
                padding: '12px',
                backgroundColor: '#1a1a1a',
                borderRadius: '6px',
                border: '1px solid #2d2d2d',
                fontFamily: 'Consolas, Monaco, monospace'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid #2d2d2d'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#58a6ff' }}>
                    ⚙️ 處理中
                  </div>
                  <div style={{ fontSize: '11px', color: '#888' }}>
                    {processingSteps.filter(s => s.status === 'completed').length} / {processingSteps.length}
                  </div>
                </div>
                
                {processingSteps.map((step) => {
                  const isRunning = step.status === 'running'
                  const isCompleted = step.status === 'completed'
                  const isError = step.status === 'error'
                  const isPending = step.status === 'pending'
                  
                  let icon = '⏺️'
                  let statusText = '等待中'
                  let color = '#888'
                  
                  if (isRunning) {
                    icon = '🔄'
                    statusText = '進行中'
                    color = '#58a6ff'
                  } else if (isCompleted) {
                    icon = '✅'
                    statusText = '完成'
                    color = '#3fb950'
                  } else if (isError) {
                    icon = '❌'
                    statusText = '錯誤'
                    color = '#f85149'
                  }
                  
                  const duration = step.startTime && step.endTime 
                    ? `${((step.endTime - step.startTime) / 1000).toFixed(1)}s`
                    : step.startTime && isRunning
                    ? `${((Date.now() - step.startTime) / 1000).toFixed(1)}s`
                    : null
                  
                  return (
                    <div 
                      key={step.id} 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '6px 0',
                        opacity: isPending ? 0.6 : 1,
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <div style={{
                        fontSize: '14px',
                        lineHeight: '14px',
                        animation: isRunning ? 'spin 1s linear infinite' : 'none'
                      }}>
                        {icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: color
                        }}>
                          {step.label}
                          <span style={{ 
                            marginLeft: '8px',
                            fontSize: '11px',
                            color: '#666',
                            fontWeight: 'normal'
                          }}>
                            ({statusText})
                          </span>
                        </div>
                        {!!step.detail && !isPending && (
                          <div style={{
                            marginTop: '2px',
                            fontSize: '10px',
                            color: isError ? '#f85149' : '#888',
                            lineHeight: '1.35',
                            wordBreak: 'break-word'
                          }}>
                            {step.detail}
                          </div>
                        )}
                      </div>
                      {duration && (
                        <div style={{
                          fontSize: '10px',
                          color: '#666',
                          fontFamily: 'monospace'
                        }}>
                          {duration}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            
            {(loadedSelection || loadedFile || fileChunks || loadedOracleData || loadedWebPageData) && (
              <div className="copilot-data-loaded-hint">
                ✅ 已讀取
                {loadedSelection
                  ? `框選文字（${loadedSelection.sourceTitle || loadedSelection.sourceType || '網頁'}）`
                  : loadedFile
                    ? `文件（${loadedFile.fileName}）`
                    : fileChunks
                      ? `文件（${fileChunks.fileName}）- 第 ${fileChunks.currentIndex + 1}/${fileChunks.chunks.length} 部分`
                      : loadedOracleData 
                        ? `Oracle 查詢結果（${oracleInstances.find(o => o.id === selectedOracleId)?.title}）`
                        : `網頁內容（${webViewInstances.find(w => w.id === selectedWebViewId)?.title}）`
                }，請輸入您的問題
                <button
                  onClick={() => {
                    setLoadedSelection(null)
                    setLoadedFile(null)
                    setFileChunks(null)
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
            <div style={{ position: 'relative' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={(e) => {
                  // Prevent sending message during IME composition (e.g., Chinese input)
                  if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                    e.preventDefault()
                    if (!isLoading) {
                      handleSendMessage()
                    }
                  }
                }}
                placeholder={isLoading ? "正在處理中..." : "輸入訊息... (Enter 發送, Shift+Enter 換行)"}
                className="copilot-chat-input"
                rows={3}
                style={{ width: '100%', paddingRight: '50px' }}
                disabled={isLoading}
              />
              {isLoading ? (
                <button
                  onClick={handleStopGeneration}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    bottom: '8px',
                    width: '32px',
                    height: '32px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    padding: 0
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#b91c1c'
                    e.currentTarget.style.transform = 'scale(1.1)'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#dc2626'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                  title="停止生成"
                >
                  ⏹
                </button>
              ) : (
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim()}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    bottom: '8px',
                    width: '32px',
                    height: '32px',
                    backgroundColor: input.trim() ? '#0066cc' : '#444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: input.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    padding: 0
                  }}
                  onMouseOver={(e) => {
                    if (input.trim()) {
                      e.currentTarget.style.backgroundColor = '#0052a3'
                      e.currentTarget.style.transform = 'scale(1.1)'
                    }
                  }}
                  onMouseOut={(e) => {
                    if (input.trim()) {
                      e.currentTarget.style.backgroundColor = '#0066cc'
                      e.currentTarget.style.transform = 'scale(1)'
                    }
                  }}
                  title="發送訊息"
                >
                  ▲
                </button>
              )}
            </div>

            <div style={{
              marginTop: '6px',
              fontSize: '11px',
              color: '#888',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}>模型：</label>
                <select
                  value={currentCopilotConfig?.model || 'gpt-4o'}
                  onChange={async e => {
                    const newConfig = { ...currentCopilotConfig, model: e.target.value }
                    settingsStore.setCopilotConfig(newConfig)
                    await window.electronAPI.copilot.setConfig(newConfig)
                    // 訂閱會自動更新 currentCopilotConfig state
                  }}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    backgroundColor: '#2a2826',
                    color: '#dfdbc3',
                    border: '1px solid #3a3836',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  {(() => {
                    const selected = currentCopilotConfig?.model || 'gpt-4o'
                    const list = Array.isArray(availableCopilotModels) && availableCopilotModels.length > 0 
                      ? availableCopilotModels 
                      : ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'o1-preview', 'o1-mini', 'claude-sonnet-4.5']
                    const merged = list.includes(selected) ? list : [selected, ...list]
                    const unique = Array.from(new Set(merged.filter(Boolean)))
                    return unique.map(id => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))
                  })()}
                </select>
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
