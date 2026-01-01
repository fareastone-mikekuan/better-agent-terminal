import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { workspaceStore } from '../stores/workspace-store'
import { settingsStore } from '../stores/settings-store'
import { CopilotPanel } from './CopilotPanel'
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
}

export function TerminalPanel({ terminalId, isActive = true, terminalType = 'terminal', oracleQueryResult }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [aiInsight, setAiInsight] = useState<{ type: 'error' | 'warning' | 'info' | 'success' | 'running', message: string, suggestion?: string, startTime?: number } | null>(null)
  const insightTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const commandStartTimeRef = useRef<number | null>(null)
  const currentCommandRef = useRef<string | null>(null)
  const commandBufferRef = useRef<string>('')  // 追踪用户输入的命令
  const isExecutingRef = useRef<boolean>(false)  // 是否正在执行命令

  // 处理用户输入，追踪命令
  const handleUserInput = (data: string) => {
    // Enter 键 - 用户按下回车执行命令
    if (data === '\r' || data === '\n') {
      const command = commandBufferRef.current.trim()
      
      // 如果上一个命令还在执行，先标记为完成
      if (isExecutingRef.current && commandStartTimeRef.current) {
        const duration = Math.round((Date.now() - commandStartTimeRef.current) / 1000 * 10) / 10
        const prevCommand = currentCommandRef.current
        
        if (insightTimeoutRef.current) {
          clearTimeout(insightTimeoutRef.current)
        }
        
        setAiInsight({
          type: 'success',
          message: `✅ 執行完成 (耗時 ${duration}s)`,
          suggestion: prevCommand ? (prevCommand.length > 50 ? prevCommand.substring(0, 50) + '...' : prevCommand) : ''
        })
        
        // 短暂显示后清除，准备显示新命令
        setTimeout(() => {
          if (command) startNewCommand(command)
        }, 800)
        
        commandStartTimeRef.current = null
        currentCommandRef.current = null
        isExecutingRef.current = false
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
        
        setAiInsight({
          type: 'warning',
          message: `命令被中斷${duration ? ` (耗時 ${duration}s)` : ''}`,
          suggestion: currentCommandRef.current || ''
        })
        
        commandStartTimeRef.current = null
        currentCommandRef.current = null
        isExecutingRef.current = false
        
        insightTimeoutRef.current = setTimeout(() => {
          setAiInsight(null)
        }, 5000)
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
      if (insightTimeoutRef.current) {
        clearTimeout(insightTimeoutRef.current)
      }
      
      commandStartTimeRef.current = Date.now()
      currentCommandRef.current = command
      isExecutingRef.current = true
      
      setAiInsight({
        type: 'running',
        message: `正在執行: ${command.substring(0, 80)}${command.length > 80 ? '...' : ''}`,
        suggestion: '請稍候...',
        startTime: commandStartTimeRef.current
      })
    }
  }

  // 智能分析输出内容，检测命令执行状态
  const analyzeOutputForInsights = (data: string) => {
    const lowerData = data.toLowerCase()
    
    // 如果正在执行命令，检测完成状态
    if (isExecutingRef.current && commandStartTimeRef.current) {
      const duration = Math.round((Date.now() - commandStartTimeRef.current) / 1000 * 10) / 10
      
      // 检测错误
      if (lowerData.includes('error') || lowerData.includes('failed') || lowerData.includes('exception') || 
          lowerData.includes('command not found') || lowerData.includes('permission denied') ||
          lowerData.includes('no such file or directory') || lowerData.includes('not found') ||
          /exit(ed)?\s+(with\s+)?code\s+[1-9]/i.test(data)) {
        
        if (insightTimeoutRef.current) {
          clearTimeout(insightTimeoutRef.current)
        }
        
        const errorLine = data.split('\n').find(line => 
          line.toLowerCase().includes('error') || 
          line.toLowerCase().includes('failed') ||
          line.toLowerCase().includes('command not found') ||
          line.toLowerCase().includes('permission denied') ||
          line.toLowerCase().includes('no such file or directory') ||
          line.toLowerCase().includes('not found')
        ) || data.substring(0, 100)
        
        setAiInsight({
          type: 'error',
          message: `${errorLine.trim().substring(0, 120)} (耗時 ${duration}s)`,
          suggestion: getSuggestion(data)
        })
        
        commandStartTimeRef.current = null
        currentCommandRef.current = null
        isExecutingRef.current = false
        
        insightTimeoutRef.current = setTimeout(() => {
          setAiInsight(null)
        }, 15000)
        return
      }
      
      // 检测 shell 提示符返回（表示命令结束）
      // 你的提示符格式: kuanchiacheng@MacBook-Air-M1 better-agent-terminal %
      const shellPromptPatterns = [
        /\w+@[\w-]+\s+[\w~\/-]+\s*%/,        // macOS zsh: user@host path %
        /\w+@[\w-]+:[\w~\/-]+[\$#]/,         // Linux bash: user@host:path$
        /^\s*[\$#%>]\s*$/m,                  // 单独一行只有提示符
      ]
      
      for (const pattern of shellPromptPatterns) {
        if (pattern.test(data)) {
          if (insightTimeoutRef.current) {
            clearTimeout(insightTimeoutRef.current)
          }
          
          const command = currentCommandRef.current
          
          setAiInsight({
            type: 'success',
            message: `✅ 執行完成 (耗時 ${duration}s)`,
            suggestion: command ? (command.length > 50 ? command.substring(0, 50) + '...' : command) : ''
          })
          
          commandStartTimeRef.current = null
          currentCommandRef.current = null
          isExecutingRef.current = false
          
          insightTimeoutRef.current = setTimeout(() => {
            setAiInsight(null)
          }, 5000)
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
        
        const errorLine = data.split('\n').find(line => 
          line.toLowerCase().includes('error') || 
          line.toLowerCase().includes('failed') ||
          line.toLowerCase().includes('command not found') ||
          line.toLowerCase().includes('permission denied') ||
          line.toLowerCase().includes('no such file or directory')
        ) || data.substring(0, 100)
        
        setAiInsight({
          type: 'error',
          message: errorLine.trim().substring(0, 150),
          suggestion: getSuggestion(data)
        })
        
        insightTimeoutRef.current = setTimeout(() => {
          setAiInsight(null)
        }, 10000)
        return
      }
      
      // 检测警告
      if (lowerData.includes('warning') || lowerData.includes('warn') || lowerData.includes('deprecated')) {
        if (insightTimeoutRef.current) {
          clearTimeout(insightTimeoutRef.current)
        }
        
        const warningLine = data.split('\n').find(line => 
          line.toLowerCase().includes('warning') || 
          line.toLowerCase().includes('warn') ||
          line.toLowerCase().includes('deprecated')
        ) || data.substring(0, 100)
        
        setAiInsight({
          type: 'warning',
          message: warningLine.trim().substring(0, 150),
          suggestion: '建議檢查警告原因，可能影響後續操作'
        })
        
        insightTimeoutRef.current = setTimeout(() => {
          setAiInsight(null)
        }, 8000)
      }
    }
  }

  // 根据错误类型给出建议
  const getSuggestion = (data: string): string => {
    const lowerData = data.toLowerCase()
    
    if (lowerData.includes('command not found')) {
      return '命令不存在，請確認是否已安裝或檢查拼寫'
    }
    if (lowerData.includes('permission denied')) {
      return '權限不足，嘗試使用 sudo 或檢查檔案權限'
    }
    if (lowerData.includes('enoent') || lowerData.includes('no such file')) {
      return '檔案或目錄不存在，請確認路徑是否正確'
    }
    if (lowerData.includes('eacces')) {
      return '存取被拒絕，檢查檔案權限或使用 sudo'
    }
    if (lowerData.includes('npm err') || lowerData.includes('npm error')) {
      return '嘗試刪除 node_modules 並重新執行 npm install'
    }
    if (lowerData.includes('git')) {
      return '檢查 Git 倉庫狀態和遠端連接'
    }
    if (lowerData.includes('connection refused') || lowerData.includes('timeout')) {
      return '網路連接問題，檢查服務是否運行或網路設定'
    }
    if (lowerData.includes('port') && lowerData.includes('in use')) {
      return '端口已被占用，嘗試更換端口或關閉占用該端口的程式'
    }
    if (lowerData.includes('module not found') || lowerData.includes('cannot find module')) {
      return '模組未安裝，執行 npm install 安裝相依套件'
    }
    if (lowerData.includes('syntax error')) {
      return '語法錯誤，請檢查程式碼語法'
    }
    
    return '請檢查錯誤訊息並嘗試相應的修復方案'
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

  // Handle terminal resize and focus when becoming active
  useEffect(() => {
    if (isActive && fitAddonRef.current && terminalRef.current) {
      const terminal = terminalRef.current
      const fitAddon = fitAddonRef.current

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
          terminal.focus()
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
      scrollOnOutput: true
    })

    const fitAddon = new FitAddon()
    const unicode11Addon = new Unicode11Addon()
    const webLinksAddon = new WebLinksAddon((event, uri) => {
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
        hasSelection: !!selection
      })
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
        fitAddon.fit()
        const { cols, rows } = terminal
        window.electronAPI.pty.resize(terminalId, cols, rows)
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
      fitAddon.fit()
      const { cols, rows } = terminal
      window.electronAPI.pty.resize(terminalId, cols, rows)
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
      fitAddon.fit()
      const { cols, rows } = terminal
      window.electronAPI.pty.resize(terminalId, cols, rows)
    })

    return () => {
      clearInterval(saveBufferInterval)
      unsubscribeOutput()
      unsubscribeExit()
      unsubscribeSettings()
      resizeObserver.disconnect()
      observer.disconnect()
      terminal.dispose()
    }
  }, [terminalId])

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {/* AI智能提示 - 自动检测错误/警告时显示 */}
      {aiInsight && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            zIndex: 200,
            backgroundColor: aiInsight.type === 'error' ? 'rgba(127, 29, 29, 0.95)' : 
                            aiInsight.type === 'warning' ? 'rgba(120, 53, 15, 0.95)' : 
                            aiInsight.type === 'success' ? 'rgba(20, 83, 45, 0.95)' :
                            aiInsight.type === 'running' ? 'rgba(30, 64, 95, 0.95)' :
                            'rgba(30, 58, 95, 0.95)',
            border: `1px solid ${aiInsight.type === 'error' ? '#dc2626' : 
                                 aiInsight.type === 'warning' ? '#f59e0b' : 
                                 aiInsight.type === 'success' ? '#22c55e' :
                                 aiInsight.type === 'running' ? '#3b82f6' : '#3b82f6'}`,
            borderRadius: '8px',
            padding: '12px 16px',
            maxWidth: '400px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(10px)',
            animation: 'slideIn 0.3s ease-out'
          }}
        >
          {/* 关闭按钮 */}
          <button
            onClick={() => {
              setAiInsight(null)
              if (insightTimeoutRef.current) {
                clearTimeout(insightTimeoutRef.current)
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
              padding: '2px 6px'
            }}
          >
            ✕
          </button>
          
          {/* 标题 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
            paddingRight: '20px'
          }}>
            <span style={{ fontSize: '16px' }}>
              {aiInsight.type === 'error' ? '❌' : 
               aiInsight.type === 'warning' ? '⚠️' : 
               aiInsight.type === 'success' ? '✅' :
               aiInsight.type === 'running' ? '🔄' : '💡'}
            </span>
            <span style={{
              fontSize: '12px',
              fontWeight: 'bold',
              color: aiInsight.type === 'error' ? '#fca5a5' : 
                     aiInsight.type === 'warning' ? '#fcd34d' : 
                     aiInsight.type === 'success' ? '#86efac' :
                     aiInsight.type === 'running' ? '#93c5fd' : '#93c5fd',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {aiInsight.type === 'error' ? 'AI 偵測到錯誤' : 
               aiInsight.type === 'warning' ? 'AI 偵測到警告' : 
               aiInsight.type === 'success' ? '執行完成' :
               aiInsight.type === 'running' ? '正在執行' : 'AI 提示'}
              {aiInsight.type === 'running' && (
                <span style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  border: '2px solid #93c5fd',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              )}
            </span>
          </div>
          
          {/* 错误信息 */}
          <div style={{
            fontSize: '11px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            padding: '8px',
            borderRadius: '4px',
            marginBottom: '8px',
            lineHeight: '1.4',
            wordBreak: 'break-word'
          }}>
            {aiInsight.message}
          </div>
          
          {/* AI建议 */}
          {aiInsight.suggestion && (
            <div style={{
              fontSize: '11px',
              color: '#d1d5db',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              lineHeight: '1.4'
            }}>
              <span style={{ color: aiInsight.type === 'success' ? '#22c55e' : 
                                    aiInsight.type === 'running' ? '#60a5fa' : '#fbbf24' }}>
                {aiInsight.type === 'success' ? '📋' : 
                 aiInsight.type === 'running' ? '⏱️' : '💡'}
              </span>
              <span>{aiInsight.suggestion}</span>
            </div>
          )}
        </div>
      )}

      <div ref={containerRef} className="terminal-panel" style={{ height: '100%', width: '100%' }} />
      
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
            <button onClick={handleCopy} className="context-menu-item">
              複製
            </button>
          )}
          <button onClick={handlePaste} className="context-menu-item">
            貼上
          </button>
        </div>
      )}
    </div>
  )
}
