import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { workspaceStore } from '../stores/workspace-store'
import { settingsStore } from '../stores/settings-store'
import { AIAnalysisStepsView } from './AIAnalysisStepsView'
import type { AIAnalysisStep, KnowledgeSelectionMode } from '../types/ai-analysis'
import { buildKnowledgePromptForInput } from '../services/ai-analysis-pipeline'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  terminalId: string
  isActive?: boolean
  terminalType?: 'terminal' | 'claude-code' | 'copilot'
  oracleQueryResult?: string | null
}

interface ContextMenu {
  x: number
  y: number
  hasSelection: boolean
  selectedText?: string
}

export function TerminalPanel({ terminalId, isActive = true, terminalType: _terminalType = 'terminal', oracleQueryResult: _oracleQueryResult }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [aiInsight, setAiInsight] = useState<{ type: 'error' | 'warning' | 'info' | 'success' | 'running', message: string, suggestion?: string, startTime?: number } | null>(null)
  const [aiInsightHistory, setAiInsightHistory] = useState<Array<{ id: string, ts: number, type: 'error' | 'warning' | 'info' | 'success', message: string, suggestion?: string, command?: string }>>([])
  const [showAiInsightHistory, setShowAiInsightHistory] = useState(false)
  const [aiAnalyzing, setAiAnalyzing] = useState(false)  // AI 分析中
  const [aiAnalysisResult, setAiAnalysisResult] = useState<{ text: string, result: string, mode?: string, sources?: string[] } | null>(null)  // AI 分析结果
  const [aiAnalysisMinimized, setAiAnalysisMinimized] = useState(false)  // AI 分析结果是否缩小显示
  const [showQuickAIPrompt, setShowQuickAIPrompt] = useState(false)  // 顯示快速 AI 提示
  const [aiAnalysisSteps, setAiAnalysisSteps] = useState<AIAnalysisStep[]>([])
  const [showAiAnalysisSteps, setShowAiAnalysisSteps] = useState(false)
  const aiAnalysisTimerRef = useRef<NodeJS.Timeout | null>(null)
  const insightTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const commandStartTimeRef = useRef<number | null>(null)
  const currentCommandRef = useRef<string | null>(null)
  const commandBufferRef = useRef<string>('')  // 追踪用户输入的命令
  const isExecutingRef = useRef<boolean>(false)  // 是否正在执行命令
  const lastCommandOutputTimeRef = useRef<number | null>(null)
  const outputTailRef = useRef<string>('')
  const idleCompletionTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastSunkCommandStartRef = useRef<number | null>(null)
  const lastAutoAnalysisCommandStartRef = useRef<number | null>(null)

  const getCommandFromCurrentInputLine = () => {
    const terminal = terminalRef.current
    if (!terminal) return null

    try {
      const buffer = terminal.buffer.active
      // cursorY is relative to viewport; baseY is the scrollback offset.
      const lineIndex = buffer.baseY + buffer.cursorY
      const line = buffer.getLine(lineIndex)
      const raw = (line ? line.translateToString(true) : '').replace(/\r/g, '')
      const text = raw.trimEnd()
      if (!text.trim()) return null

      // Heuristic: split by the LAST prompt separator and take the tail as the command.
      // This captures shell-completed text (e.g. after Tab completion), unlike key-by-key buffering.
      const promptSepRe = /(?:^|\s)(PS\s+.+?>\s+)|([\$#%›»❯➜→>]\s+)/g
      let lastIdx = -1
      let lastLen = 0
      for (const m of text.matchAll(promptSepRe)) {
        lastIdx = m.index ?? -1
        lastLen = m[0].length
      }

      if (lastIdx >= 0) {
        const candidate = text.slice(lastIdx + lastLen).trim()
        return candidate || null
      }

      // Fallback: if we can't detect prompt boundaries, return the whole line.
      return text.trim() || null
    } catch {
      return null
    }
  }

  const stripAnsi = (text: string) => {
    // Remove ANSI escape sequences (colors, cursor moves, etc.)
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1B\][^\x07]*\x07/g, '')
  }

  const classifyCommand = (command: string | null): 'fast' | 'medium' | 'heavy' => {
    if (!command) return 'medium'
    const trimmed = command.trim()
    const lower = trimmed.toLowerCase()
    const firstToken = (lower.split(/\s+/)[0] || '').trim()

    const heavyPrefixes = [
      'npm ', 'yarn ', 'pnpm ',
      'docker ', 'kubectl ', 'terraform ',
      'make', 'cmake', 'mvn', 'gradle',
      'cargo ', 'go run',
      'pip ', 'pip3 ',
      'curl ', 'wget ',
      'brew install', 'apt ', 'apt-get ', 'yum ',
    ]
    for (const p of heavyPrefixes) {
      if (lower.startsWith(p)) return 'heavy'
    }

    const fastTokens = new Set([
      'cd', 'ls', 'pwd', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv', 'chmod', 'chown', 'find', 'grep',
      'git',
    ])
    if (fastTokens.has(firstToken)) {
      // Some git ops can take time, but most “status/log/diff” are fast.
      if (firstToken === 'git') {
        if (/(^|\s)(pull|push|clone|fetch)(\s|$)/.test(lower)) return 'heavy'
        return 'fast'
      }
      return 'fast'
    }

    return 'medium'
  }

  const getIdleCompletionMs = (command: string | null) => {
    const kind = classifyCommand(command)
    if (kind === 'fast') return 700
    if (kind === 'medium') return 3500
    return null
  }

  const sinkInsightToHistory = (insight: { type: 'error' | 'warning' | 'info' | 'success', message: string, suggestion?: string, command?: string }) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setAiInsightHistory(prev => {
      const next = [{ id, ts: Date.now(), ...insight }, ...prev]
      return next.slice(0, 50)
    })
  }

  const trimText = (value: string, maxLen: number) => {
    const t = String(value || '').trim()
    if (t.length <= maxLen) return t
    return t.slice(0, maxLen) + '…'
  }

  const extractLogPaths = (data: string): string[] => {
    const text = String(data || '').replace(/\r/g, '')
    const found: string[] = []

    // Common direct log paths
    const unixLogRe = /(^|\s)(\/[\w@.\-~+\/,:=\[\]{}()]+\.log)\b/gm
    const winLogRe = /(^|\s)([A-Za-z]:\\[^\s"']+\.log)\b/gm

    let m: RegExpExecArray | null
    while ((m = unixLogRe.exec(text))) found.push(m[2])
    while ((m = winLogRe.exec(text))) found.push(m[2])

    // npm / pnpm / yarn common hints
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      if (/a complete log of this run can be found in:/i.test(line)) {
        const next = (lines[i + 1] || '').trim()
        if (next) found.push(next)
      }
      if (/yarn-error\.log/i.test(line)) found.push('yarn-error.log')
      if (/npm-debug\.log/i.test(line)) found.push('npm-debug.log')
      if (/pnpm-debug\.log/i.test(line)) found.push('pnpm-debug.log')
    }

    const uniq = Array.from(new Set(found.map(s => s.trim()).filter(Boolean)))
    return uniq.slice(0, 3)
  }

  const buildFailureSuggestion = (output: string) => {
    const base = getSuggestion(output)
    const logs = extractLogPaths(output)
    if (logs.length === 0) return base
    return `${base}｜🔎 可能的 Log：${logs.join(' ; ')}`
  }

  const markCommandCompleted = (type: 'success' | 'error' | 'warning', message: string, suggestion?: string) => {
    // Completion/error should persist (do NOT auto-hide). We'll sink it to history once per command.
    if (idleCompletionTimerRef.current) {
      clearTimeout(idleCompletionTimerRef.current)
      idleCompletionTimerRef.current = null
    }

    const command = currentCommandRef.current || undefined
    const startedAt = commandStartTimeRef.current
    if (startedAt && lastSunkCommandStartRef.current !== startedAt) {
      lastSunkCommandStartRef.current = startedAt
      sinkInsightToHistory({ type, message, suggestion, command })
    }

    setAiInsight({
      type,
      message,
      suggestion
    })

    commandStartTimeRef.current = null
    currentCommandRef.current = null
    isExecutingRef.current = false
    lastCommandOutputTimeRef.current = null

    // keep visible until next command or manual close
  }

  const autoAnalyzeFailedCommand = (output: string, command: string | null, startedAt: number | null) => {
    if (!startedAt) return
    if (lastAutoAnalysisCommandStartRef.current === startedAt) return
    lastAutoAnalysisCommandStartRef.current = startedAt

    // Prefer the rolling tail so we capture context across chunks.
    const snippet = trimText(outputTailRef.current || output, 5000)
    const prompt = `分析這次指令執行失敗\n\n指令：${command || '(未知)'}\n\n錯誤輸出（截斷）：\n${snippet}`
    // Fire-and-forget; UI will show steps + sources + result.
    performAIAnalysis(prompt)
  }

  // 处理用户输入，追踪命令
  const handleUserInput = (data: string) => {
    // Ctrl+K - 快速 AI 分析（顯示提示）
    if (data === '\x0b') {  // Ctrl+K
      setShowQuickAIPrompt(true)
      setTimeout(() => setShowQuickAIPrompt(false), 3000)
      
      // 獲取最近的輸出進行 AI 分析
      const terminal = workspaceStore.getState().terminals.find(t => t.id === terminalId)
      if (terminal?.scrollbackBuffer && terminal.scrollbackBuffer.length > 0) {
        const recentOutput = terminal.scrollbackBuffer.slice(-50).join('\n')
        if (recentOutput.trim()) {
          performAIAnalysis(recentOutput)
        }
      }
      return
    }
    
    // Enter 键 - 用户按下回车执行命令
    if (data === '\r' || data === '\n') {
      const command = (getCommandFromCurrentInputLine() || commandBufferRef.current.trim()).trim()
      
      // 如果上一个命令还在执行：只有在“明显已经闲置一段时间”时，才作为兜底标记完成
      if (isExecutingRef.current && commandStartTimeRef.current) {
        const now = Date.now()
        const lastOut = lastCommandOutputTimeRef.current
        const idleForMs = lastOut ? (now - lastOut) : (now - commandStartTimeRef.current)
        if (idleForMs > 1500) {
          const duration = Math.round((now - commandStartTimeRef.current) / 1000 * 10) / 10
          const prevCommand = currentCommandRef.current
          markCommandCompleted(
            'success',
            `✅ 執行完成 (耗時 ${duration}s)`,
            prevCommand ? (prevCommand.length > 50 ? prevCommand.substring(0, 50) + '...' : prevCommand) : ''
          )
          // 短暂显示后清除，准备显示新命令
          setTimeout(() => {
            if (command) startNewCommand(command)
          }, 800)
        }
      } else if (command) {
        startNewCommand(command)
      }
      
      commandBufferRef.current = ''
    }
    // Backspace - 删除最后一个字符
    else if (data === '\x7f' || data === '\b') {
      commandBufferRef.current = commandBufferRef.current.slice(0, -1)
    }
    // Ctrl+C - 中断命令
    else if (data === '\x03') {
      if (isExecutingRef.current) {
        const duration = commandStartTimeRef.current 
          ? Math.round((Date.now() - commandStartTimeRef.current) / 1000 * 10) / 10
          : null
        
        if (insightTimeoutRef.current) {
          clearTimeout(insightTimeoutRef.current)
        }
        
        // Interrupt should also persist + sink to history (no auto-hide)
        const cmd = currentCommandRef.current
        markCommandCompleted(
          'warning',
          `命令被中斷${duration ? ` (耗時 ${duration}s)` : ''}`,
          cmd ? (cmd.length > 80 ? cmd.substring(0, 80) + '...' : cmd) : ''
        )
      }
      commandBufferRef.current = ''
    }
    // Ctrl+U - 清除行
    else if (data === '\x15') {
      commandBufferRef.current = ''
    }
    // 普通字符 - 添加到缓冲区
    else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      commandBufferRef.current += data
    }
    // 粘贴的文本
    else if (data.length > 1 && !data.includes('\x1b')) {
      commandBufferRef.current += data
    }
  }
  
  // 开始追踪新命令
  const startNewCommand = (command: string) => {
    // 检测是否是需要追踪的命令
    const trackablePatterns = [
      /^\.?\/?[\w-]+\.sh$/i,           // ./script.sh 或 script.sh
      /^(npm|yarn|pnpm)\s+(run|start|test|build|install)/i,  
      /^(node|python|python3|ruby|go\s+run|cargo\s+run)\s+/i,  
      /^(docker|kubectl|terraform)\s+/i,  
      /^(make|cmake|gradle|mvn)\s*/i,   
      /^(bash|sh|zsh)\s+/i,        
      /^(curl|wget)\s+/i,               
      /^(git)\s+(push|pull|clone|fetch|commit|status|log|diff)/i,
      /^(ls|cat|echo|mkdir|rm|cp|mv|chmod|chown|find|grep)\b/i,  // 常见命令
      /^(pwd)\b/i,  // pwd 命令
      /^(brew|apt|apt-get|yum|pip|pip3)\s+/i,  // 包管理
      /^(cd)\s+/i,  // cd 命令
    ]
    
    let shouldTrack = false
    for (const pattern of trackablePatterns) {
      if (pattern.test(command)) {
        shouldTrack = true
        break
      }
    }
    
    if (shouldTrack) {
      if (idleCompletionTimerRef.current) {
        clearTimeout(idleCompletionTimerRef.current)
        idleCompletionTimerRef.current = null
      }
      
      commandStartTimeRef.current = Date.now()
      lastCommandOutputTimeRef.current = commandStartTimeRef.current
      currentCommandRef.current = command
      isExecutingRef.current = true
      
      setAiInsight({
        type: 'running',
        message: `正在執行: ${command.substring(0, 80)}${command.length > 80 ? '...' : ''}`,
        suggestion: '請稍候...',
        startTime: commandStartTimeRef.current
      })

      const idleMs = getIdleCompletionMs(command)
      if (idleMs != null) {
        idleCompletionTimerRef.current = setTimeout(() => {
          if (!isExecutingRef.current || !commandStartTimeRef.current) return
          const now = Date.now()
          const duration = Math.round((now - commandStartTimeRef.current) / 1000 * 10) / 10
          const cmd = currentCommandRef.current
          markCommandCompleted(
            'success',
            `✅ 執行完成 (耗時 ${duration}s)`,
            cmd ? (cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd) : ''
          )
        }, idleMs)
      }
    }
  }

  // 智能分析输出内容，检测命令执行状态
  const analyzeOutputForInsights = (data: string) => {
    const cleaned = stripAnsi(data).replace(/\r/g, '')
    const lowerData = cleaned.toLowerCase()

    // Keep a small rolling tail for prompt detection across chunk boundaries
    outputTailRef.current = (outputTailRef.current + cleaned).slice(-8000)
    
    // 如果正在执行命令，检测完成状态
    if (isExecutingRef.current && commandStartTimeRef.current) {
      const duration = Math.round((Date.now() - commandStartTimeRef.current) / 1000 * 10) / 10

      lastCommandOutputTimeRef.current = Date.now()

      // Idle fallback: re-arm timer on every output chunk
      const idleMs = getIdleCompletionMs(currentCommandRef.current)
      if (idleMs != null) {
        if (idleCompletionTimerRef.current) {
          clearTimeout(idleCompletionTimerRef.current)
        }
        idleCompletionTimerRef.current = setTimeout(() => {
          if (!isExecutingRef.current || !commandStartTimeRef.current) return
          const now = Date.now()
          const dur = Math.round((now - commandStartTimeRef.current) / 1000 * 10) / 10
          const cmd = currentCommandRef.current
          markCommandCompleted(
            'success',
            `✅ 執行完成 (耗時 ${dur}s)`,
            cmd ? (cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd) : ''
          )
        }, idleMs)
      }
      
      // 检测错误
      if (lowerData.includes('error') || lowerData.includes('failed') || lowerData.includes('exception') || 
          lowerData.includes('command not found') || lowerData.includes('permission denied') ||
          lowerData.includes('no such file or directory') || lowerData.includes('not found') ||
          /exit(ed)?\s+(with\s+)?code\s+[1-9]/i.test(cleaned)) {
        
        const errorLine = cleaned.split('\n').find(line => 
          line.toLowerCase().includes('error') || 
          line.toLowerCase().includes('failed') ||
          line.toLowerCase().includes('command not found') ||
          line.toLowerCase().includes('permission denied') ||
          line.toLowerCase().includes('no such file or directory') ||
          line.toLowerCase().includes('not found')
        ) || cleaned.substring(0, 100)

        const cmd = currentCommandRef.current
        const startedAt = commandStartTimeRef.current
        const suggestion = buildFailureSuggestion(cleaned) + '｜已自動啟動 AI 分析'

        markCommandCompleted(
          'error',
          `${errorLine.trim().substring(0, 120)} (耗時 ${duration}s)`,
          suggestion
        )

        autoAnalyzeFailedCommand(cleaned, cmd, startedAt)
        return
      }
      
      // 检测 shell 提示符返回（表示命令结束）
      // 支持多种格式: zsh (%), PowerShell (>), bash ($/#)
      const shellPromptPatterns = [
        /\w+@[\w-]+\s+[\w~\/-]+\s*%\s*$/m,        // macOS zsh: user@host path %
        /^PS\s+[A-Za-z]:[\\\/\w-]+>\s*$/m,        // Windows PowerShell: PS C:\path>
        /\w+@[\w-]+:[\w~\/-]+[\$#]\s*$/m,         // Linux bash: user@host:path$
        /^\s*[\$#>%]\s*$/m,                       // 单独一行只有提示符
        /\d+\s+\d+\s+[\w\-:\.]+\s*$/m,           // 某些系统显示时间和命令号
        /(?:^|\n)[^\n]{0,200}(?:[\$#%›»❯➜→]\s*)$/m // 常见自定义 prompt 结尾符号
      ]
      
      for (const pattern of shellPromptPatterns) {
        if (pattern.test(outputTailRef.current)) {
          const command = currentCommandRef.current
          markCommandCompleted(
            'success',
            `✅ 執行完成 (耗時 ${duration}s)`,
            command ? (command.length > 50 ? command.substring(0, 50) + '...' : command) : ''
          )
          return
        }
      }
      
      // 更新执行时间（超过 0.5 秒才显示）
      if (duration > 0.5) {
        setAiInsight(prev => {
          if (prev && prev.type === 'running') {
            return {
              ...prev,
              suggestion: `已執行 ${duration}s...`
            }
          }
          return prev
        })
      }
    }
    
    // 不在执行状态时，检测错误输出
    if (!isExecutingRef.current) {
      if (lowerData.includes('error') || lowerData.includes('failed') || lowerData.includes('exception') || 
          lowerData.includes('command not found') || lowerData.includes('permission denied') ||
          lowerData.includes('no such file or directory')) {
        
        if (insightTimeoutRef.current) {
          clearTimeout(insightTimeoutRef.current)
        }
        
        const errorLine = cleaned.split('\n').find(line => 
          line.toLowerCase().includes('error') || 
          line.toLowerCase().includes('failed') ||
          line.toLowerCase().includes('command not found') ||
          line.toLowerCase().includes('permission denied') ||
          line.toLowerCase().includes('no such file or directory')
        ) || cleaned.substring(0, 100)
        
        setAiInsight({
          type: 'error',
          message: errorLine.trim().substring(0, 150),
          suggestion: getSuggestion(cleaned)
        })

        sinkInsightToHistory({
          type: 'error',
          message: errorLine.trim().substring(0, 150),
          suggestion: getSuggestion(cleaned)
        })
        return
      }
      
      // 检测警告
      if (lowerData.includes('warning') || lowerData.includes('warn') || lowerData.includes('deprecated')) {
        if (insightTimeoutRef.current) {
          clearTimeout(insightTimeoutRef.current)
        }
        
        const warningLine = cleaned.split('\n').find(line => 
          line.toLowerCase().includes('warning') || 
          line.toLowerCase().includes('warn') ||
          line.toLowerCase().includes('deprecated')
        ) || cleaned.substring(0, 100)
        
        setAiInsight({
          type: 'warning',
          message: warningLine.trim().substring(0, 150),
          suggestion: '建議檢查警告原因，可能影響後續操作'
        })

        sinkInsightToHistory({
          type: 'warning',
          message: warningLine.trim().substring(0, 150),
          suggestion: '建議檢查警告原因，可能影響後續操作'
        })
      }
    }
  }

  // 根据错误类型给出建议
  const getSuggestion = (data: string): string => {
    const lowerData = data.toLowerCase()
    
    // 命令未找到
    if (lowerData.includes('command not found')) {
      const cmdMatch = data.match(/([\w-]+):\s*command not found|'([\w-]+)'.*not found/i)
      const cmd = cmdMatch?.[1] || cmdMatch?.[2]
      return cmd ? `💡 命令 '${cmd}' 未找到。嘗試: which ${cmd} 或安裝相關套件` : '💡 命令未找到，檢查拼寫或安裝狀態'
    }
    
    // 權限錯誤
    if (lowerData.includes('permission denied')) {
      return '💡 權限不足。Windows: 以管理員身份運行，Linux/Mac: 使用 sudo'
    }
    
    // 文件不存在
    if (lowerData.includes('no such file or directory')) {
      return '💡 文件/目錄不存在。使用 ls 查看當前目錄內容'
    }
    
    // Node.js 相關錯誤
    if (lowerData.includes('enoent') || lowerData.includes('enotdir')) {
      return '💡 路徑錯誤。檢查文件是否存在: ls -la'
    }
    
    if (lowerData.includes('eacces')) {
      return '💡 存取被拒。檢查文件權限: ls -l [檔案]'
    }
    
    // 端口被占用
    if (lowerData.includes('eaddrinuse') || lowerData.includes('address already in use')) {
      const portMatch = data.match(/:([0-9]{2,5})/)
      const port = portMatch?.[1]
      return port ? `💡 端口 ${port} 被佔用。查找佔用: lsof -i :${port} 或更換端口` : '💡 端口被占用，更換端口或終止佔用程序'
    }
    
    // 模組未找到
    if (lowerData.includes('module not found') || lowerData.includes('cannot find module')) {
      const moduleMatch = data.match(/cannot find module ['"]([^'"]+)['"]/i) || data.match(/module not found.*['"]([^'"]+)['"]/i)
      const moduleName = moduleMatch?.[1]
      return moduleName ? `💡 缺少模組 '${moduleName}'。執行: npm install ${moduleName}` : '💡 缺少模組。執行: npm install 或 yarn install'
    }
    
    // 語法錯誤
    if (lowerData.includes('syntaxerror') || lowerData.includes('unexpected token')) {
      return '💡 語法錯誤。檢查程式碼語法，注意括號、引號配對'
    }
    
    // 連線錯誤
    if (lowerData.includes('connection refused') || lowerData.includes('econnrefused')) {
      return '💡 連線被拒。確認服務已啟動且端口正確'
    }
    
    if (lowerData.includes('timeout') || lowerData.includes('etimedout')) {
      return '💡 連線逾時。檢查網路連接或增加 timeout 設定'
    }
    
    // NPM 錯誤
    if (lowerData.includes('npm err!') || lowerData.includes('npm error')) {
      return '💡 NPM 執行失敗。嘗試: rm -rf node_modules && npm install'
    }
    
    // Git 錯誤
    if (lowerData.includes('git') && (lowerData.includes('error') || lowerData.includes('failed'))) {
      return '💡 Git 操作失敗。檢查倉庫狀態: git status'
    }
    
    return '💡 按 Ctrl+K 使用 AI 快速分析，或右鍵選取文字獲取詳細建議'
  }

  // Handle paste with text size checking
  const handlePasteText = (text: string) => {
    if (!text) return

    // For very long text (> 2000 chars), split into smaller chunks
    if (text.length > 2000) {
      const chunks = []
      for (let i = 0; i < text.length; i += 1000) {
        chunks.push(text.slice(i, i + 1000))
      }

      // Send chunks with small delays to prevent overwhelming the terminal
      chunks.forEach((chunk, index) => {
        setTimeout(() => {
          window.electronAPI.pty.write(terminalId, chunk)
        }, index * 50) // 50ms delay between chunks
      })
    } else {
      // Normal sized text, send directly
      window.electronAPI.pty.write(terminalId, text)
    }
  }

  // Handle context menu actions
  const handleCopy = () => {
    if (terminalRef.current) {
      const selection = terminalRef.current.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection)
      }
    }
    setContextMenu(null)
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        handlePasteText(text)
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err)
    }
    setContextMenu(null)
  }

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // AI 分析选中的文本
  const performAIAnalysis = async (text: string) => {
    if (!text.trim()) return
    
    setAiAnalyzing(true)
    setAiAnalysisResult(null)
    setAiAnalysisMinimized(false)
    setContextMenu(null)
    setShowAiAnalysisSteps(true)
    setAiAnalysisSteps([])
    
    // 清除之前的定时器
    if (aiAnalysisTimerRef.current) {
      clearTimeout(aiAnalysisTimerRef.current)
    }
    
    try {
      const copilotConfigFromStore = settingsStore.getCopilotConfig()
      const selectionMode = (copilotConfigFromStore?.knowledgeSelectionMode || 'ai') as KnowledgeSelectionMode
      const isDeepMode = selectionMode === 'ai-deep' || selectionMode === 'ai-ultra'
      const isUltraMode = selectionMode === 'ai-ultra'

      const steps: AIAnalysisStep[] = [
        { id: 'prepare', label: '🧩 判斷輸入與準備 [本地]', status: 'pending' },
        {
          id: 'select',
          label: isDeepMode
            ? '📚 深度挑選知識庫 [AI + 本地]'
            : (selectionMode === 'ai' ? '📚 AI 挑選知識庫 [AI]' : '📚 關鍵詞挑選知識庫 [本地]'),
          status: 'pending'
        },
        ...(isUltraMode
          ? [{ id: 'validate', label: '🔎 二次驗證與校準 [AI]', status: 'pending' as const }]
          : []),
        { id: 'analyze', label: '✨ 生成分析結果 [AI]', status: 'pending' }
      ]
      setAiAnalysisSteps(steps)

      const updateStep = (stepId: string, updates: Partial<AIAnalysisStep>) => {
        setAiAnalysisSteps(prev => prev.map(s =>
          s.id === stepId
            ? {
                ...s,
                ...updates,
                ...(updates.status === 'running' && !s.startTime ? { startTime: Date.now() } : {}),
                ...(updates.status === 'completed' || updates.status === 'error' ? { endTime: Date.now() } : {})
              }
            : s
        ))
      }

      const trimText = (value: string, maxLen: number) => {
        const t = String(value || '').trim()
        if (t.length <= maxLen) return t
        return t.slice(0, maxLen) + '…'
      }

      updateStep('prepare', { status: 'running', detail: `模式：${selectionMode}` })

      
      // 判断是文件名还是错误/命令
      const isFilePath = /^[.\w\/-]+\.(ts|tsx|js|jsx|json|md|sh|py|css|html|txt|yml|yaml|toml|env|gitignore)$/i.test(text.trim())
      const isExecutable = /\.(sh|py|js|ts|rb|pl)$/i.test(text.trim())  // 可执行文件
      const isError = /error|failed|exception|not found|permission denied/i.test(text)
      const isCommand = /^(npm|node|git|docker|python|pip|brew|curl|wget|make|cargo)\s+/i.test(text.trim())
      
      let promptContent: string
      
      // 只有在明确是文件路径时才尝试读取内容
      let fileContent: string | null = null
      if (isFilePath && !isError) {
        try {
          // 使用文件系统 API 直接读取文件
          console.log('[AI Analysis] Reading file:', text.trim())
          
          // 获取当前工作目录
          const cwd = await window.electronAPI.pty.getCwd(terminalId) || '.'
          console.log('[AI Analysis] Current working directory:', cwd)
          
          // 读取文件
          const result = await window.electronAPI.fs.readFile(text.trim(), cwd)
          
          if (result.success && result.content) {
            fileContent = result.content
            console.log('[AI Analysis] File read successfully, length:', fileContent.length)
            console.log('[AI Analysis] Content preview:', fileContent.substring(0, 200))
          } else {
            console.error('[AI Analysis] Failed to read file:', result.error)
          }
        } catch (e) {
          console.error('[AI Analysis] Failed to read file:', e)
          fileContent = null
        }
      }

      updateStep('prepare', {
        status: 'completed',
        detail: isFilePath
          ? (fileContent ? `已讀取檔案內容（${fileContent.length.toLocaleString()} 字元）` : '判定為檔案，但讀取失敗/略過')
          : (isError ? '判定為錯誤訊息' : (isCommand ? '判定為命令' : '一般文字/片段'))
      })
      
      if (isFilePath && isExecutable) {
        if (fileContent) {
          promptContent = `分析可執行文件「${text}」，內容如下：

\`\`\`
${fileContent.substring(0, 1500)}
\`\`\`

請說明：
1. 這個腳本做什麼
2. 怎麼執行（含參數）
3. 執行後會輸出什麼（根據代碼精確分析）
4. 有什麼注意事項`
        } else {
          // 根据文件扩展名推测
          const ext = text.trim().split('.').pop()?.toLowerCase()
          let scriptType = 'Shell 腳本'
          let runCmd = `./${text.trim()}`
          
          if (ext === 'py') {
            scriptType = 'Python 腳本'
            runCmd = `python3 ${text.trim()}`
          } else if (ext === 'js') {
            scriptType = 'Node.js 腳本'
            runCmd = `node ${text.trim()}`
          } else if (ext === 'ts') {
            scriptType = 'TypeScript 腳本'
            runCmd = `npx ts-node ${text.trim()}`
          } else if (ext === 'rb') {
            scriptType = 'Ruby 腳本'
            runCmd = `ruby ${text.trim()}`
          } else if (ext === 'pl') {
            scriptType = 'Perl 腳本'
            runCmd = `perl ${text.trim()}`
          }

          promptContent = `分析可執行文件「${text}」

這是 ${scriptType}。

請說明：
1. 這類文件通常做什麼
2. 執行方式：\`${runCmd}\`
3. 常見參數（如 --help, -v 等）
4. 執行前注意事項（權限、依賴）

提示：建議用 \`cat ${text.trim()}\` 查看內容後再分析。`
        }
      } else if (isFilePath) {
        promptContent = `分析文件「${text}」

請說明：
1. 這是什麼類型的文件
2. 它的用途是什麼
3. 如何查看或編輯`
      } else if (isError) {
        promptContent = `分析這個錯誤：「${text}」

請說明：
1. 錯誤含義
2. 可能原因
3. 如何解決`
      } else if (isCommand) {
        promptContent = `分析這個命令：「${text}」

請說明：
1. 這個命令做什麼
2. 參數含義
3. 注意事項`
      } else {
        promptContent = `分析：「${text}」

這是什麼？有什麼含義？`
      }
      
      // 建構知識庫 prompt（依目前設定的「知識庫選擇模式」挑選相關文檔）
      const copilotConfig = await window.electronAPI.copilot.getConfig()
      const model = copilotConfig?.model || 'gpt-4'

      const querySeed = [text, fileContent ? trimText(fileContent, 800) : ''].filter(Boolean).join('\n')
      const knowledge = await buildKnowledgePromptForInput({
        selectionMode,
        model,
        seedText: querySeed,
        chatTagPrefix: 'terminal',
        reporter: (stepId, updates) => updateStep(stepId, updates)
      })

      const usedSources = knowledge.sources
      const knowledgePrompt = knowledge.knowledgePrompt

      updateStep('analyze', { status: 'running', detail: `使用 ${model} 生成中...` })

      const response = await window.electronAPI.copilot.chat('terminal-analysis', {
        messages: [
          { 
            role: 'system', 
            content: `你是終端助手。用戶會給你一個文件名、命令或錯誤信息，請直接分析它。用繁體中文回答，簡潔明瞭。${knowledgePrompt ? '\n\n你可以參考以下知識庫內容來提供更準確的分析。' : ''}${knowledgePrompt}` 
          },
          { role: 'user', content: promptContent }
        ],
        model
      })
      
      if (response.error) {
        setAiAnalysisResult({
          text: text.length > 50 ? text.substring(0, 50) + '...' : text,
          result: `分析失敗：${response.error}`,
          mode: selectionMode,
          sources: usedSources
        })
        updateStep('analyze', { status: 'error', detail: '分析失敗' })
      } else {
        setAiAnalysisResult({
          text: text.length > 50 ? text.substring(0, 50) + '...' : text,
          result: response.content || '無法獲取分析結果',
          mode: selectionMode,
          sources: usedSources
        })
        updateStep('analyze', { status: 'completed', detail: '分析完成' })
        
        // 5秒后自动缩小
        aiAnalysisTimerRef.current = setTimeout(() => {
          setAiAnalysisMinimized(true)
        }, 5000)
      }
    } catch (error) {
      setAiAnalysisResult({
        text: text.length > 50 ? text.substring(0, 50) + '...' : text,
        result: '分析失敗：' + (error instanceof Error ? error.message : String(error))
      })
      setAiAnalysisSteps(prev => prev.map(s =>
        (s.status === 'pending' || s.status === 'running')
          ? { ...s, status: 'error', endTime: Date.now() }
          : s
      ))
    } finally {
      setAiAnalyzing(false)
    }
  }
  
  // 双击选中的文本进行 AI 分析
  const handleDoubleClick = () => {
    if (terminalRef.current) {
      const selection = terminalRef.current.getSelection()
      if (selection && selection.trim()) {
        // 双击分析时，不要触发错误检测
        const trimmed = selection.trim()
        // 只分析单个词或短语（避免误触发大段文本）
        if (trimmed.split('\n').length <= 3 && trimmed.length < 200) {
          performAIAnalysis(trimmed)
        }
      }
    }
  }

  // Handle terminal resize and focus when becoming active
  useEffect(() => {
    if (isActive && fitAddonRef.current && terminalRef.current) {
      const terminal = terminalRef.current
      const fitAddon = fitAddonRef.current

      const shouldAutoFocusTerminal = () => {
        const active = document.activeElement
        if (!active) return true
        if (active === document.body || active === document.documentElement) return true
        const container = containerRef.current
        return !!(container && container.contains(active))
      }

      // Use requestAnimationFrame to ensure DOM is fully rendered
      const rafId = requestAnimationFrame(() => {
        if (!fitAddon || !terminal) return

        fitAddon.fit()
        const { cols, rows } = terminal
        window.electronAPI.pty.resize(terminalId, cols, rows)

        // Force refresh terminal content to fix black screen after visibility change
        // Call refresh after another frame to ensure layout is complete
        requestAnimationFrame(() => {
          terminal.refresh(0, terminal.rows - 1)
          if (shouldAutoFocusTerminal()) {
            terminal.focus()
          }
        })
      })

      return () => cancelAnimationFrame(rafId)
    }
  }, [isActive, terminalId])

  // Add intersection observer to detect when terminal becomes visible
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current || !terminalRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && isActive && fitAddonRef.current && terminalRef.current) {
            // Terminal became visible, resize it
            setTimeout(() => {
              if (fitAddonRef.current && terminalRef.current) {
                fitAddonRef.current.fit()
                const { cols, rows } = terminalRef.current
                window.electronAPI.pty.resize(terminalId, cols, rows)
              }
            }, 50)
          }
        })
      },
      { threshold: 0.1 }
    )

    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [isActive, terminalId])

  useEffect(() => {
    if (!containerRef.current) return

    const settings = settingsStore.getSettings()
    const colors = settingsStore.getTerminalColors()

    // Create terminal instance with customizable colors
    const terminal = new Terminal({
      theme: {
        background: colors.background,
        foreground: colors.foreground,
        cursor: colors.cursor,
        cursorAccent: colors.background,
        selectionBackground: '#5c5142',
        black: '#3b3228',
        red: '#cb6077',
        green: '#beb55b',
        yellow: '#f4bc87',
        blue: '#8ab3b5',
        magenta: '#a89bb9',
        cyan: '#7bbda4',
        white: '#d0c8c6',
        brightBlack: '#554d46',
        brightRed: '#cb6077',
        brightGreen: '#beb55b',
        brightYellow: '#f4bc87',
        brightBlue: '#8ab3b5',
        brightMagenta: '#a89bb9',
        brightCyan: '#7bbda4',
        brightWhite: '#f5f1e6'
      },
      fontSize: settings.fontSize,
      fontFamily: settingsStore.getFontFamilyString(),
      cursorBlink: true,
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
      allowTransparency: true,
      // xterm.js does not support scrollOnOutput; keep defaults.
    })

    const fitAddon = new FitAddon()
    const unicode11Addon = new Unicode11Addon()
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      // Open URL in default browser
      window.electronAPI.shell.openExternal(uri)
    })
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.open(containerRef.current)

    // Load unicode11 addon after terminal is open
    terminal.loadAddon(unicode11Addon)
    terminal.unicode.activeVersion = '11'

    // Delay fit to ensure terminal is fully initialized
    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    // Fix IME textarea position - force it to bottom left
    const fixImePosition = () => {
      const textarea = containerRef.current?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement
      if (textarea) {
        textarea.style.position = 'fixed'
        textarea.style.bottom = '80px'
        textarea.style.left = '220px'
        textarea.style.top = 'auto'
        textarea.style.width = '1px'
        textarea.style.height = '20px'
        textarea.style.opacity = '0'
        textarea.style.zIndex = '10'
      }
    }

    // Use MutationObserver to keep fixing position when xterm.js changes it
    const observer = new MutationObserver(() => {
      fixImePosition()
    })

    const textarea = containerRef.current?.querySelector('.xterm-helper-textarea')
    if (textarea) {
      observer.observe(textarea, { attributes: true, attributeFilter: ['style'] })
      fixImePosition()
    }

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Handle terminal input
    terminal.onData((data) => {
      console.log('[TerminalPanel] User input:', { terminalId, data: data.charCodeAt(0), char: data })
      // 追踪用户输入的命令
      handleUserInput(data)
      window.electronAPI.pty.write(terminalId, data).catch((err: Error) => {
        console.error('[TerminalPanel] Failed to write to PTY:', err)
      })
    })

    // Handle copy and paste shortcuts
    terminal.attachCustomKeyEventHandler((event) => {
      // Only handle keydown events to prevent duplicate actions
      if (event.type !== 'keydown') return true

      // Shift+Enter for newline (multiline input)
      if (event.shiftKey && event.key === 'Enter') {
        event.preventDefault()
        // Send newline character to allow multiline input
        window.electronAPI.pty.write(terminalId, '\n')
        return false
      }
      // Ctrl+Shift+C for copy
      if (event.ctrlKey && event.shiftKey && event.key === 'C') {
        const selection = terminal.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection)
        }
        return false
      }
      // Ctrl+Shift+V for paste
      if (event.ctrlKey && event.shiftKey && event.key === 'V') {
        navigator.clipboard.readText().then((text) => {
          handlePasteText(text)
        })
        return false
      }
      // Ctrl+V for paste (standard shortcut)
      if (event.ctrlKey && !event.shiftKey && event.key === 'v') {
        event.preventDefault()
        // On Windows, check if clipboard contains an image and send Alt+V
        const isWindows = navigator.platform.toLowerCase().includes('win')
        if (isWindows) {
          navigator.clipboard.read().then(async (items) => {
            let hasImage = false
            for (const item of items) {
              if (item.types.some(type => type.startsWith('image/'))) {
                hasImage = true
                break
              }
            }
            if (hasImage) {
              // Send Alt+V (ESC + v) to terminal for image paste handling
              window.electronAPI.pty.write(terminalId, '\x1bv')
            } else {
              // Normal text paste
              const text = await navigator.clipboard.readText()
              handlePasteText(text)
            }
          }).catch(() => {
            // Fallback to text paste if clipboard.read() fails
            navigator.clipboard.readText().then((text) => {
              handlePasteText(text)
            })
          })
        } else {
          // On macOS/Linux, just paste text directly
          navigator.clipboard.readText().then((text) => {
            handlePasteText(text)
          })
        }
        return false
      }
      // Ctrl+C for copy when there's a selection
      if (event.ctrlKey && !event.shiftKey && event.key === 'c') {
        const selection = terminal.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection)
          return false
        }
        // If no selection, let Ctrl+C pass through for interrupt signal
        return true
      }
      return true
    })

    // Right-click context menu for copy/paste
    containerRef.current.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      const selection = terminal.getSelection()
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        hasSelection: !!selection,
        selectedText: selection || undefined
      })
    })
    
    // Double-click for AI analysis
    containerRef.current.addEventListener('dblclick', () => {
      handleDoubleClick()
    })

    // Handle terminal output
    const unsubscribeOutput = window.electronAPI.pty.onOutput((id, data) => {
      if (id === terminalId) {
        terminal.write(data)
        // Update activity time when there's output
        workspaceStore.updateTerminalActivity(terminalId)
        
        // 智能检测输出内容
        analyzeOutputForInsights(data)
      }
    })

    // Periodically save terminal buffer for persistence (every 3 seconds)
    const saveBufferInterval = setInterval(() => {
      try {
        // Get terminal buffer content (last 200 lines)
        const buffer = terminal.buffer.active
        const lines: string[] = []
        const lineCount = Math.min(buffer.length, 200)
        const startLine = Math.max(0, buffer.length - lineCount)
        
        for (let i = startLine; i < buffer.length; i++) {
          const line = buffer.getLine(i)
          if (line) {
            lines.push(line.translateToString(true) + '\r\n')
          }
        }
        
        // Replace the entire scrollback buffer with latest content
        workspaceStore.updateTerminalScrollback(terminalId, lines)
      } catch (e) {
        // Ignore errors during buffer read
      }
    }, 3000)

    // Handle terminal exit
    const unsubscribeExit = window.electronAPI.pty.onExit((id, exitCode) => {
      if (id === terminalId) {
        terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
      }
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      // Only resize if terminal is currently active
      if (isActive) {
        const buffer = terminal.buffer.active
        const wasAtBottom = Math.abs(buffer.baseY - buffer.viewportY) <= 1

        fitAddon.fit()
        const { cols, rows } = terminal
        window.electronAPI.pty.resize(terminalId, cols, rows)

        if (wasAtBottom) {
          terminal.scrollToBottom()
        }
      }
    })
    resizeObserver.observe(containerRef.current)

    // Restore scrollback buffer if exists
    const terminalInstance = workspaceStore.getState().terminals.find(t => t.id === terminalId)
    if (terminalInstance?.scrollbackBuffer && terminalInstance.scrollbackBuffer.length > 0) {
      // Write saved scrollback content to terminal
      const scrollbackContent = terminalInstance.scrollbackBuffer.join('')
      if (scrollbackContent) {
        terminal.write(scrollbackContent)
        // Add a visual separator to indicate restored content
        terminal.write('\x1b[2m--- Session restored ---\x1b[0m\r\n')
      }
    }

    // Initial resize
    setTimeout(() => {
      const buffer = terminal.buffer.active
      const wasAtBottom = Math.abs(buffer.baseY - buffer.viewportY) <= 1
      fitAddon.fit()
      const { cols, rows } = terminal
      window.electronAPI.pty.resize(terminalId, cols, rows)

      if (wasAtBottom) {
        terminal.scrollToBottom()
      }
    }, 100)

    // Subscribe to settings changes for font and color updates
    const unsubscribeSettings = settingsStore.subscribe(() => {
      const newSettings = settingsStore.getSettings()
      const newColors = settingsStore.getTerminalColors()
      terminal.options.fontSize = newSettings.fontSize
      terminal.options.fontFamily = settingsStore.getFontFamilyString()
      terminal.options.theme = {
        ...terminal.options.theme,
        background: newColors.background,
        foreground: newColors.foreground,
        cursor: newColors.cursor,
        cursorAccent: newColors.background
      }
      const buffer = terminal.buffer.active
      const wasAtBottom = Math.abs(buffer.baseY - buffer.viewportY) <= 1

      fitAddon.fit()
      const { cols, rows } = terminal
      window.electronAPI.pty.resize(terminalId, cols, rows)

      if (wasAtBottom) {
        terminal.scrollToBottom()
      }
    })

    return () => {
      clearInterval(saveBufferInterval)
      if (insightTimeoutRef.current) {
        clearTimeout(insightTimeoutRef.current)
      }
      if (idleCompletionTimerRef.current) {
        clearTimeout(idleCompletionTimerRef.current)
        idleCompletionTimerRef.current = null
      }
      if (aiAnalysisTimerRef.current) {
        clearTimeout(aiAnalysisTimerRef.current)
        aiAnalysisTimerRef.current = null
      }
      unsubscribeOutput()
      unsubscribeExit()
      unsubscribeSettings()
      resizeObserver.disconnect()
      observer.disconnect()
      terminal.dispose()
    }
  }, [terminalId])

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {/* AI 分析中的 loading */}
        {aiAnalyzing && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(30, 64, 95, 0.95)',
              border: '1px solid #3b82f6',
              borderRadius: '8px',
              padding: '12px 16px',
              maxWidth: '420px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(10px)',
              animation: 'slideIn 0.3s ease-out',
              zIndex: 100
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: aiAnalysisSteps.length > 0 ? '10px' : 0 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid #93c5fd',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}
              />
              <span style={{ color: '#93c5fd', fontSize: '12px' }}>AI 分析中...</span>
            </div>

            {/* Live steps (same behavior as Oracle tooltip) */}
            <AIAnalysisStepsView steps={aiAnalysisSteps} compact />
          </div>
        )}
        
        {/* 快速 AI 分析提示 (Ctrl+K) */}
        {showQuickAIPrompt && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.98), rgba(30, 64, 95, 0.98))',
          border: '2px solid #3b82f6',
          borderRadius: '16px',
          padding: '24px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.8), 0 0 80px rgba(59, 130, 246, 0.3)',
          backdropFilter: 'blur(20px)',
          animation: 'popIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
          zIndex: 150
        }}>
          <div style={{ 
            fontSize: '48px',
            animation: 'bounce 0.6s ease-in-out'
          }}>🤖</div>
          <div style={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#93c5fd',
            textAlign: 'center',
            letterSpacing: '0.5px'
          }}>
            AI 快速分析已啟動
          </div>
          <div style={{
            fontSize: '13px',
            color: '#cbd5e1',
            textAlign: 'center',
            lineHeight: '1.6'
          }}>
            正在分析最近的終端輸出...<br/>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>再次按 Ctrl+K 可重新分析</span>
          </div>
        </div>
        )}
        
        {/* AI 分析结果 */}
        {aiAnalysisResult && !aiAnalyzing && (
        <div 
          onMouseEnter={() => {
            setAiAnalysisMinimized(false)
            // 清除定时器，防止鼠标悬停时缩小
            if (aiAnalysisTimerRef.current) {
              clearTimeout(aiAnalysisTimerRef.current)
            }
          }}
          onMouseLeave={() => {
            // 鼠标离开后，3秒后再次缩小
            aiAnalysisTimerRef.current = setTimeout(() => {
              setAiAnalysisMinimized(true)
            }, 3000)
          }}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(30, 58, 95, 0.95)',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            padding: aiAnalysisMinimized ? '8px 12px' : '12px 16px',
            maxWidth: aiAnalysisMinimized ? '200px' : '450px',
            maxHeight: aiAnalysisMinimized ? '60px' : '400px',
            overflow: aiAnalysisMinimized ? 'hidden' : 'auto',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(10px)',
            animation: 'slideIn 0.3s ease-out',
            zIndex: 100,
            cursor: aiAnalysisMinimized ? 'pointer' : 'default',
            transition: 'all 0.3s ease-in-out'
          }}
        >
          {/* 关闭按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setAiAnalysisResult(null)
              if (aiAnalysisTimerRef.current) {
                clearTimeout(aiAnalysisTimerRef.current)
              }
            }}
            style={{
              position: 'absolute',
              top: '4px',
              right: '6px',
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '2px 6px',
              opacity: aiAnalysisMinimized ? 0.5 : 1
            }}
          >
            ✕
          </button>
          
          {/* 标题 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: aiAnalysisMinimized ? '0' : '8px',
            paddingRight: '20px'
          }}>
            <span style={{ fontSize: aiAnalysisMinimized ? '14px' : '16px' }}>🤖</span>
            <span style={{ 
              fontSize: aiAnalysisMinimized ? '11px' : '12px', 
              fontWeight: 'bold', 
              color: '#93c5fd',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {aiAnalysisMinimized ? `AI 分析：${aiAnalysisResult.text}` : 'AI 分析結果'}
            </span>
          </div>
          
          {!aiAnalysisMinimized && (
            <>
              {/* 分析的文本 */}
              <div style={{
                fontSize: '11px',
                color: '#a5b4fc',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                padding: '6px 8px',
                borderRadius: '4px',
                marginBottom: '8px',
                fontFamily: 'monospace',
                wordBreak: 'break-all'
              }}>
                {aiAnalysisResult.text}
              </div>

              {/* 模式/來源 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                marginBottom: '8px'
              }}>
                <div style={{
                  fontSize: '11px',
                  color: '#cbd5e1'
                }}>
                  模式：<span style={{ color: '#93c5fd', fontWeight: 700 }}>{aiAnalysisResult.mode || '（未知）'}</span>
                </div>
                {aiAnalysisSteps.length > 0 && (
                  <button
                    onClick={() => setShowAiAnalysisSteps(v => !v)}
                    style={{
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                      background: 'rgba(15, 23, 42, 0.6)',
                      color: '#cbd5e1',
                      cursor: 'pointer'
                    }}
                    title={showAiAnalysisSteps ? '隱藏處理步驟' : '顯示處理步驟'}
                  >
                    {showAiAnalysisSteps ? '隱藏步驟' : '顯示步驟'}
                  </button>
                )}
              </div>

              {aiAnalysisResult.sources && aiAnalysisResult.sources.length > 0 && (
                <div style={{
                  fontSize: '11px',
                  color: '#d1d5db',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  padding: '8px',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  lineHeight: '1.4'
                }}>
                  <div style={{ color: '#93c5fd', fontWeight: 700, marginBottom: '6px' }}>📚 使用的知識來源</div>
                  {aiAnalysisResult.sources.map((name, i) => (
                    <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      • {name}
                    </div>
                  ))}
                </div>
              )}

              {showAiAnalysisSteps && aiAnalysisSteps.length > 0 && (
                <AIAnalysisStepsView steps={aiAnalysisSteps} />
              )}
              
              {/* 分析结果 */}
              <div style={{
                fontSize: '12px',
                color: '#e2e8f0',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap'
              }}>
                {aiAnalysisResult.result}
              </div>
            </>
          )}
        </div>
        )}

        <div ref={containerRef} className="terminal-panel" style={{ flex: 1, minHeight: 0, width: '100%' }} />
      </div>

      {/* 歷史訊息抽屜（不影響 layout，避免終端高度跳動） */}
      {showAiInsightHistory && (
        <div
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: 52 + 8,
            maxHeight: 220,
            overflow: 'auto',
            zIndex: 250,
            background: 'rgba(2, 6, 23, 0.92)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            borderRadius: 10,
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(12px)'
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.12)'
          }}>
            <div style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 700 }}>指令訊息紀錄</div>
            <button
              onClick={() => setShowAiInsightHistory(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: 14,
                padding: '2px 6px'
              }}
              title="收合"
            >
              ✕
            </button>
          </div>

          <div style={{ padding: '8px 12px' }}>
            {aiInsightHistory.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 12, padding: '6px 0' }}>目前尚無紀錄</div>
            ) : (
              aiInsightHistory.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '8px 0',
                    borderTop: '1px solid rgba(148, 163, 184, 0.10)'
                  }}
                >
                  <div style={{
                    width: 4,
                    borderRadius: 999,
                    backgroundColor: item.type === 'error' ? '#ef4444' :
                                    item.type === 'warning' ? '#f59e0b' :
                                    item.type === 'success' ? '#22c55e' : '#3b82f6'
                  }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0
                    }}>
                      <span style={{ fontSize: 12 }}>
                        {item.type === 'error' ? '❌' : item.type === 'warning' ? '⚠️' : item.type === 'success' ? '✅' : '💡'}
                      </span>
                      <div style={{
                        color: '#e2e8f0',
                        fontSize: 11,
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {item.message}
                      </div>
                    </div>
                    {item.command && (
                      <div style={{
                        marginTop: 2,
                        color: '#93c5fd',
                        fontSize: 11,
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {item.command}
                      </div>
                    )}
                    {item.suggestion && (
                      <div style={{ marginTop: 2, color: '#94a3b8', fontSize: 11, lineHeight: 1.35 }}>
                        {item.suggestion}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 指令狀態/警示（固定高度，避免出現/消失造成輸入列跳動） */}
      <div
        style={{
          flex: '0 0 auto',
          height: '52px',
          padding: '6px 10px',
          borderTop: '1px solid rgba(148, 163, 184, 0.18)',
          background: 'rgba(2, 6, 23, 0.88)',
          backdropFilter: 'blur(10px)',
          opacity: aiInsight ? 1 : 0,
          pointerEvents: aiInsight ? 'auto' : 'none',
          transition: 'opacity 0.15s ease'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          minWidth: 0,
          height: '100%'
        }}>
          <div style={{
            width: '4px',
            alignSelf: 'stretch',
            borderRadius: '999px',
            backgroundColor: aiInsight?.type === 'error' ? '#ef4444' :
                            aiInsight?.type === 'warning' ? '#f59e0b' :
                            aiInsight?.type === 'success' ? '#22c55e' :
                            aiInsight?.type === 'running' ? '#3b82f6' : '#3b82f6'
          }} />

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: 0
            }}>
              <span style={{ fontSize: '12px' }}>
                {aiInsight?.type === 'error' ? '❌' :
                 aiInsight?.type === 'warning' ? '⚠️' :
                 aiInsight?.type === 'success' ? '✅' :
                 aiInsight?.type === 'running' ? '🔄' : '💡'}
              </span>

              <div style={{
                fontSize: '11px',
                color: '#e2e8f0',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: '1.35'
              }}>
                {aiInsight?.message || ''}
              </div>

              {aiInsight?.type === 'running' && (
                <span
                  aria-label="running"
                  style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    border: '2px solid #93c5fd',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    flex: '0 0 auto'
                  }}
                />
              )}
            </div>

            <div style={{
              marginTop: '2px',
              fontSize: '11px',
              color: '#94a3b8',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: '1.35'
            }}>
              {aiInsight?.suggestion || (aiInsight?.type === 'running' ? '請稍候…' : ' ')}
            </div>
          </div>

          <button
            onClick={() => setShowAiInsightHistory(v => !v)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(148, 163, 184, 0.22)',
              color: '#cbd5e1',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: 8,
              flex: '0 0 auto'
            }}
            title={showAiInsightHistory ? '隱藏紀錄' : '顯示紀錄'}
          >
            {showAiInsightHistory ? '收合' : '紀錄'}
          </button>

          <button
            onClick={() => {
              setAiInsight(null)
              setTimeout(() => terminalRef.current?.focus(), 0)
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '2px 6px',
              flex: '0 0 auto'
            }}
            title="關閉"
          >
            ✕
          </button>
        </div>
      </div>
      
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000
          }}
        >
          {contextMenu.hasSelection && (
            <>
              <button 
                onClick={() => {
                  if (contextMenu.selectedText) {
                    performAIAnalysis(contextMenu.selectedText)
                  }
                }} 
                className="context-menu-item"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>🤖</span> AI 分析
              </button>
              <button onClick={handleCopy} className="context-menu-item">
                複製
              </button>
            </>
          )}
          <button onClick={handlePaste} className="context-menu-item">
            貼上
          </button>
        </div>
      )}
    </div>
  )
}
