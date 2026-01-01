import { useState, useEffect, useRef } from 'react'

interface TerminalAIPanelProps {
  terminalId: string
  terminalOutput: string
  onClose?: () => void
}

interface OutputInsight {
  type: 'error' | 'warning' | 'success' | 'performance' | 'command'
  message: string
  suggestion?: string
  severity: 'high' | 'medium' | 'low'
}

export function TerminalAIPanel({ terminalId, terminalOutput, onClose }: TerminalAIPanelProps) {
  const [insights, setInsights] = useState<OutputInsight[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null)
  const [commandAnalysis, setCommandAnalysis] = useState<string>('')
  const [isCommandAnalyzing, setIsCommandAnalyzing] = useState(false)
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 自动分析终端输出
  useEffect(() => {
    if (!terminalOutput) return

    // 清除之前的timeout
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current)
    }

    // 延迟分析，避免频繁触发
    analysisTimeoutRef.current = setTimeout(() => {
      analyzeOutput(terminalOutput)
    }, 1000)

    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current)
      }
    }
  }, [terminalOutput])

  // 规则基础的输出分析
  const analyzeOutput = (output: string) => {
    const newInsights: OutputInsight[] = []
    const lines = output.split('\n').slice(-50) // 只分析最后50行

    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase()

      // 错误检测
      if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception')) {
        newInsights.push({
          type: 'error',
          message: `发现错误: ${line.substring(0, 100)}`,
          suggestion: '检查错误信息并尝试相应的修复方案',
          severity: 'high'
        })
      }

      // 警告检测
      if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
        newInsights.push({
          type: 'warning',
          message: `警告: ${line.substring(0, 100)}`,
          suggestion: '建议检查警告原因，可能影响后续操作',
          severity: 'medium'
        })
      }

      // 成功检测
      if (lowerLine.includes('success') || lowerLine.includes('completed') || lowerLine.includes('done')) {
        newInsights.push({
          type: 'success',
          message: `操作成功: ${line.substring(0, 100)}`,
          severity: 'low'
        })
      }

      // 性能问题检测
      if (lowerLine.match(/\d+ms/) || lowerLine.match(/\d+s/) || lowerLine.includes('slow') || lowerLine.includes('timeout')) {
        const timeMatch = line.match(/(\d+)(ms|s)/)
        if (timeMatch) {
          const time = parseInt(timeMatch[1])
          const unit = timeMatch[2]
          const timeInMs = unit === 's' ? time * 1000 : time
          
          if (timeInMs > 5000) {
            newInsights.push({
              type: 'performance',
              message: `性能提醒: 操作耗时 ${timeMatch[0]}`,
              suggestion: '考虑优化执行效率或检查资源瓶颈',
              severity: 'medium'
            })
          }
        }
      }

      // 命令检测
      if (line.startsWith('$') || line.startsWith('>') || line.match(/^[a-zA-Z]+:/)) {
        const command = line.replace(/^[$>]\s*/, '').trim()
        if (command.length > 0 && command.length < 200) {
          newInsights.push({
            type: 'command',
            message: `命令: ${command}`,
            suggestion: '点击可用AI分析此命令',
            severity: 'low'
          })
        }
      }
    })

    // 限制insights数量
    setInsights(newInsights.slice(-10))
  }

  // AI分析命令
  const analyzeCommandWithAI = async (command: string) => {
    setIsCommandAnalyzing(true)
    setSelectedCommand(command)

    try {
      const copilotEnabled = await window.electronAPI.copilot.isEnabled()

      if (copilotEnabled) {
        const systemPrompt = {
          role: 'system' as const,
          content: '你是一個終端命令專家。分析用戶的命令並提供簡潔、實用的說明。使用繁體中文回答。'
        }

        const userPrompt = {
          role: 'user' as const,
          content: `請分析這個終端命令：

\`\`\`bash
${command}
\`\`\`

請提供：
1. 🎯 命令的主要功能
2. 📝 各參數的作用
3. ⚠️ 需要注意的事項
4. 💡 使用建議或替代方案

保持簡潔，使用表情符號增加可讀性。`
        }

        const copilotConfig = await window.electronAPI.copilot.getConfig()
        const response = await window.electronAPI.copilot.chat(terminalId, {
          messages: [systemPrompt, userPrompt],
          model: copilotConfig?.model || 'gpt-4'
        })

        if (response.error) {
          setCommandAnalysis(`❌ Copilot 分析失敗: ${response.error}`)
        } else {
          setCommandAnalysis(response.content)
        }
      } else {
        // 使用规则基础的分析
        setCommandAnalysis(getRuleBasedCommandAnalysis(command))
      }
    } catch (err) {
      console.error('Command analysis error:', err)
      setCommandAnalysis(getRuleBasedCommandAnalysis(command))
    } finally {
      setIsCommandAnalyzing(false)
    }
  }

  // 规则基础的命令分析
  const getRuleBasedCommandAnalysis = (command: string): string => {
    const cmd = command.trim().split(' ')[0].toLowerCase()

    const knownCommands: Record<string, string> = {
      'ls': '📁 列出目錄內容\n• 常用參數: -l (詳細)、-a (包含隱藏檔)、-h (可讀大小)\n💡 建議: 使用 ls -lah 查看完整資訊',
      'cd': '📂 切換目錄\n• cd .. 回上層\n• cd ~ 回主目錄\n• cd - 回上次目錄',
      'npm': '📦 Node.js 套件管理器\n• install: 安裝套件\n• run: 執行腳本\n• test: 執行測試\n⚠️ 建議使用 npm ci 在 CI/CD 環境中',
      'git': '🔄 版本控制系統\n• add: 加入暫存\n• commit: 提交變更\n• push: 推送到遠端\n• pull: 拉取更新',
      'docker': '🐳 容器管理工具\n• run: 執行容器\n• ps: 查看容器狀態\n• build: 建立映像\n⚠️ 注意資源使用',
      'python': '🐍 Python 解釋器\n• -m: 執行模組\n• -c: 執行程式碼\n💡 建議使用虛擬環境',
      'curl': '🌐 HTTP 請求工具\n• -X: 指定方法\n• -H: 設定標頭\n• -d: 傳送資料',
      'grep': '🔍 文字搜尋工具\n• -r: 遞迴搜尋\n• -i: 忽略大小寫\n• -n: 顯示行號',
      'find': '🔎 檔案搜尋工具\n• -name: 依名稱搜尋\n• -type: 依類型搜尋\n• -mtime: 依修改時間'
    }

    return knownCommands[cmd] || `🖥️ 命令: ${cmd}\n\n這是一個終端命令。\n💡 建議: 使用 man ${cmd} 或 ${cmd} --help 查看詳細說明`
  }

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'error': return '❌'
      case 'warning': return '⚠️'
      case 'success': return '✅'
      case 'performance': return '⏱️'
      case 'command': return '💻'
      default: return '📌'
    }
  }

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'error': return '#dc2626'
      case 'warning': return '#f59e0b'
      case 'success': return '#10b981'
      case 'performance': return '#3b82f6'
      case 'command': return '#8b5cf6'
      default: return '#6b7280'
    }
  }

  if (insights.length === 0 && !selectedCommand) {
    return null
  }

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      width: '300px',
      maxHeight: '100%',
      backgroundColor: 'rgba(17, 24, 39, 0.95)',
      border: '1px solid #374151',
      borderRadius: '8px',
      padding: '12px',
      zIndex: 100,
      overflowY: 'auto',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '1px solid #374151'
      }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#f3f4f6' }}>
          🤖 AI 終端分析
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '0 4px'
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Command Analysis */}
      {selectedCommand && (
        <div style={{
          marginBottom: '12px',
          padding: '12px',
          backgroundColor: '#1f2937',
          borderRadius: '6px',
          border: '1px solid #374151'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#60a5fa' }}>
              💻 命令分析
            </div>
            <button
              onClick={() => {
                setSelectedCommand(null)
                setCommandAnalysis('')
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✕
            </button>
          </div>
          <div style={{
            fontSize: '11px',
            color: '#d1d5db',
            fontFamily: 'monospace',
            marginBottom: '8px',
            padding: '6px',
            backgroundColor: '#111827',
            borderRadius: '4px'
          }}>
            {selectedCommand}
          </div>
          {isCommandAnalyzing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9ca3af', fontSize: '12px' }}>
              <div className="loading-spinner" style={{
                width: '12px',
                height: '12px',
                border: '2px solid #3b82f6',
                borderTopColor: 'transparent',
                borderRadius: '50%'
              }} />
              <span>分析中...</span>
            </div>
          ) : commandAnalysis ? (
            <div style={{
              fontSize: '12px',
              color: '#d1d5db',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap'
            }}>
              {commandAnalysis}
            </div>
          ) : null}
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div style={{ fontSize: '12px' }}>
          <div style={{
            fontSize: '11px',
            color: '#9ca3af',
            marginBottom: '8px',
            fontWeight: 'bold'
          }}>
            📊 即時分析 ({insights.length})
          </div>
          {insights.map((insight, index) => (
            <div
              key={index}
              onClick={() => {
                if (insight.type === 'command') {
                  const command = insight.message.replace('命令: ', '')
                  analyzeCommandWithAI(command)
                }
              }}
              style={{
                marginBottom: '8px',
                padding: '8px',
                backgroundColor: '#1f2937',
                borderLeft: `3px solid ${getInsightColor(insight.type)}`,
                borderRadius: '4px',
                cursor: insight.type === 'command' ? 'pointer' : 'default',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                if (insight.type === 'command') {
                  e.currentTarget.style.backgroundColor = '#374151'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#1f2937'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                marginBottom: '4px'
              }}>
                <span style={{ fontSize: '14px' }}>{getInsightIcon(insight.type)}</span>
                <span style={{
                  color: '#f3f4f6',
                  fontSize: '11px',
                  flex: 1,
                  lineHeight: '1.4'
                }}>
                  {insight.message}
                </span>
              </div>
              {insight.suggestion && (
                <div style={{
                  fontSize: '10px',
                  color: '#9ca3af',
                  marginLeft: '20px',
                  marginTop: '4px'
                }}>
                  💡 {insight.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
