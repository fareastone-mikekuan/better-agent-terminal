import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface OraclePanelProps {
  onQueryResult?: (result: string) => void
  isFloating?: boolean
  onToggleFloat?: () => void
  onClose?: () => void
  onCollapse?: () => void
}

interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: string
  service: string
  username: string
  password: string
}

interface DBTab {
  id: string
  config: ConnectionConfig
  isConnected: boolean
  query: string
  result: string
  error: string
}

export function OraclePanel({ onQueryResult, isFloating = false, onToggleFloat, onClose, onCollapse }: OraclePanelProps) {
  // Multi-tab state
  const [tabs, setTabs] = useState<DBTab[]>(() => {
    const saved = localStorage.getItem('oracle-tabs')
    if (saved) {
      try {
        const loadedTabs = JSON.parse(saved)
        // Reset connection state on load - connections don't persist across app restarts
        return loadedTabs.map((tab: DBTab) => ({
          ...tab,
          isConnected: false,
          error: '',
          result: ''
        }))
      } catch (e) {
        console.error('Failed to load Oracle tabs:', e)
      }
    }
    return []
  })
  
  // AI Analysis state
  const [hoveredData, setHoveredData] = useState<{ text: string; x: number; y: number } | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<string>('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    const saved = localStorage.getItem('oracle-active-tab')
    return saved || (tabs.length > 0 ? tabs[0].id : null)
  })
  
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [showNewTabDialog, setShowNewTabDialog] = useState(false)
  const [newTabName, setNewTabName] = useState('')
  const [showActivityMonitor, setShowActivityMonitor] = useState(false)
  const [activeSessions, setActiveSessions] = useState<any[]>([])
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)

  // Dragging and resizing state
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('oracle-position')
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 520, y: 80 }
  })
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('oracle-size')
    return saved ? JSON.parse(saved) : { width: 500, height: 600 }
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Save tabs to localStorage
  useEffect(() => {
    if (tabs.length > 0) {
      localStorage.setItem('oracle-tabs', JSON.stringify(tabs))
    }
  }, [tabs])

  // Save active tab
  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem('oracle-active-tab', activeTabId)
    }
  }, [activeTabId])

  useEffect(() => {
    if (isFloating) {
      localStorage.setItem('oracle-position', JSON.stringify(position))
    }
  }, [position, isFloating])

  useEffect(() => {
    if (isFloating) {
      localStorage.setItem('oracle-size', JSON.stringify(size))
    }
  }, [size, isFloating])

  // Handle dragging
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x
      const deltaY = e.clientY - dragStart.y
      
      setPosition((prev: { x: number; y: number }) => ({
        x: Math.max(0, Math.min(window.innerWidth - size.width, prev.x + deltaX)),
        y: Math.max(0, Math.min(window.innerHeight - 100, prev.y + deltaY))
      }))
      
      setDragStart({ x: e.clientX, y: e.clientY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStart, size.width])

  // Handle resizing
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = Math.max(400, e.clientX - rect.left)
      const newHeight = Math.max(300, e.clientY - rect.top)
      
      setSize({
        width: Math.min(newWidth, window.innerWidth - position.x),
        height: Math.min(newHeight, window.innerHeight - position.y)
      })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, position])

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea')) return
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
  }

  const activeTab = tabs.find(t => t.id === activeTabId)

  const createNewTab = () => {
    const id = `tab-${Date.now()}`
    const newTab: DBTab = {
      id,
      config: {
        id,
        name: newTabName || `連線 ${tabs.length + 1}`,
        host: 'localhost',
        port: '1521',
        service: 'ORCL',
        username: '',
        password: ''
      },
      isConnected: false,
      query: 'SELECT * FROM dual',
      result: '',
      error: ''
    }
    setTabs([...tabs, newTab])
    setActiveTabId(id)
    setNewTabName('')
    setShowNewTabDialog(false)
  }

  const deleteTab = (id: string) => {
    const newTabs = tabs.filter(t => t.id !== id)
    setTabs(newTabs)
    if (activeTabId === id) {
      setActiveTabId(newTabs[0]?.id || null)
    }
  }

  // 查询正在运行的SQL和JOB
  const fetchActiveSessions = async () => {
    if (!activeTab || !activeTab.isConnected) {
      updateTab(activeTab!.id, { error: '请先连接数据库' })
      return
    }

    setIsLoadingActivity(true)
    
    try {
      // TODO: 实现真实的Oracle查询
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // 模拟数据 - 查询 V$SESSION 和 V$SQL
      const mockSessions = [
        {
          sid: 145,
          serial: 23891,
          username: 'BILLING_USER',
          program: 'JDBC Thin Client',
          status: 'ACTIVE',
          sql_text: 'SELECT * FROM BILLING_TRANSACTIONS WHERE PROCESS_DATE = TRUNC(SYSDATE) AND STATUS = \'PROCESSING\' ORDER BY CREATE_TIME',
          elapsed_time: 127.5,
          cpu_time: 89.2,
          module: 'BillingJob',
          action: 'ProcessMonthlyBilling'
        },
        {
          sid: 238,
          serial: 45123,
          username: 'ETL_USER',
          program: 'SQL*Plus',
          status: 'ACTIVE',
          sql_text: 'INSERT INTO FACT_SALES SELECT /*+ PARALLEL(4) */ * FROM STG_SALES WHERE BATCH_ID = :1',
          elapsed_time: 45.8,
          cpu_time: 32.1,
          module: 'DataWarehouse',
          action: 'LoadFactTable'
        },
        {
          sid: 412,
          serial: 67890,
          username: 'REPORT_USER',
          program: 'OracleBI',
          status: 'ACTIVE',
          sql_text: 'SELECT SUM(AMOUNT), CUSTOMER_ID FROM TRANSACTIONS GROUP BY CUSTOMER_ID HAVING SUM(AMOUNT) > 10000',
          elapsed_time: 23.4,
          cpu_time: 18.9,
          module: 'ReportEngine',
          action: 'GenerateReport'
        }
      ]
      
      setActiveSessions(mockSessions)
      setShowActivityMonitor(true)
    } catch (error) {
      console.error('Failed to fetch active sessions:', error)
      updateTab(activeTab!.id, { error: `查询活动会话失败: ${(error as Error).message}` })
    } finally {
      setIsLoadingActivity(false)
    }
  }

  const updateTab = (id: string, updates: Partial<DBTab>) => {
    setTabs(tabs.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  const updateTabConfig = (id: string, configUpdates: Partial<ConnectionConfig>) => {
    setTabs(tabs.map(t => 
      t.id === id ? { ...t, config: { ...t.config, ...configUpdates } } : t
    ))
  }

  const handleConnect = async () => {
    if (!activeTab) return
    
    setIsLoading(true)
    updateTab(activeTab.id, { error: '' })
    
    try {
      // TODO: Implement actual Oracle connection via Electron IPC
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      console.log('Oracle connection attempt:', {
        host: activeTab.config.host,
        port: activeTab.config.port,
        service: activeTab.config.service,
        username: activeTab.config.username
      })
      
      updateTab(activeTab.id, { isConnected: true, error: '' })
    } catch (err) {
      updateTab(activeTab.id, { 
        error: err instanceof Error ? err.message : 'Connection failed',
        isConnected: false
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisconnect = () => {
    if (!activeTab) return
    updateTab(activeTab.id, { isConnected: false, result: '' })
  }

  const handleExecuteQuery = async () => {
    if (!activeTab || !activeTab.isConnected) {
      if (activeTab) {
        updateTab(activeTab.id, { error: '請先連接資料庫' })
      }
      return
    }

    setIsLoading(true)
    updateTab(activeTab.id, { error: '' })
    
    try {
      // TODO: Implement actual Oracle query via Electron IPC
      await new Promise(resolve => setTimeout(resolve, 800))
      
      let mockResult = ''
      const queryLower = activeTab.query.toLowerCase()
      
      if (queryLower.includes('dual')) {
        mockResult = `查詢結果 (模擬資料):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DUMMY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
X

1 行已選取。
執行時間: 0.02 秒`
      } else if (queryLower.includes('user_tables') || queryLower.includes('all_tables')) {
        mockResult = `查詢結果 (模擬資料):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TABLE_NAME              TABLESPACE_NAME    NUM_ROWS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMPLOYEES               USERS              107
DEPARTMENTS             USERS              27
LOCATIONS               USERS              23
COUNTRIES               USERS              25
REGIONS                 USERS              4
JOBS                    USERS              19

6 行已選取。
執行時間: 0.15 秒`
      } else if (queryLower.includes('employees') || queryLower.includes('emp')) {
        mockResult = `查詢結果 (模擬資料):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMPLOYEE_ID  FIRST_NAME    LAST_NAME     EMAIL           HIRE_DATE    SALARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
100          Steven        King          SKING           17-JUN-03    24000
101          Neena         Kochhar       NKOCHHAR        21-SEP-05    17000
102          Lex           De Haan       LDEHAAN         13-JAN-01    17000
103          Alexander     Hunold        AHUNOLD         03-JAN-06    9000
104          Bruce         Ernst         BERNST          21-MAY-07    6000
105          David         Austin        DAUSTIN         25-JUN-05    4800

6 行已選取。
執行時間: 0.08 秒`
      } else if (queryLower.includes('count')) {
        mockResult = `查詢結果 (模擬資料):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COUNT(*)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
107

1 行已選取。
執行時間: 0.03 秒`
      } else if (queryLower.includes('sysdate') || queryLower.includes('current')) {
        mockResult = `查詢結果 (模擬資料):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SYSDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
25-DEC-25

1 行已選取。
執行時間: 0.01 秒`
      } else {
        mockResult = `查詢結果 (模擬資料):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
查詢: ${activeTab.query.substring(0, 50)}${activeTab.query.length > 50 ? '...' : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COL1         COL2         COL3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Value1       Value2       Value3
Value4       Value5       Value6
Value7       Value8       Value9

3 行已選取。
執行時間: 0.12 秒

💡 提示：這是模擬數據。請配置真實的 Oracle 連接以獲取實際結果。`
      }
      
      updateTab(activeTab.id, { result: mockResult })
      
      if (onQueryResult) {
        onQueryResult(mockResult)
      }
    } catch (err) {
      updateTab(activeTab.id, { 
        error: err instanceof Error ? err.message : 'Query execution failed'
      })
    } finally {
      setIsLoading(false)
    }
  }

  // AI Analysis functions
  const handleDataHover = (text: string, event: React.MouseEvent) => {
    // Clear previous timeout
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current)
    }

    // Set hovered data position
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setHoveredData({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top
    })

    // Delay AI analysis to avoid too many requests
    analysisTimeoutRef.current = setTimeout(() => {
      performAIAnalysis(text)
    }, 500)
  }

  const handleDataLeave = () => {
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current)
    }
    setHoveredData(null)
    setAiAnalysis('')
    setIsAnalyzing(false)
  }

  const performAIAnalysis = async (data: string) => {
    setIsAnalyzing(true)
    
    try {
      // Simulate AI analysis - in real implementation, this would call Copilot or LLM API
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // Generate contextual analysis based on data type
      let analysis = ''
      
      // Detect data type and generate appropriate analysis
      if (!isNaN(Number(data))) {
        const num = Number(data)
        analysis = `📊 數值分析:
• 數值: ${num.toLocaleString()}
• 類型: ${Number.isInteger(num) ? '整數' : '浮點數'}
${num > 1000 ? `• 格式化: ${(num / 1000).toFixed(2)}K` : ''}
${num > 1000000 ? `• 百萬: ${(num / 1000000).toFixed(2)}M` : ''}
💡 建議: ${num > 10000 ? '此為較大數值，建議檢查數據合理性' : '數值在正常範圍內'}`
      } else if (data.match(/^\d{2}-[A-Z]{3}-\d{2}$/)) {
        // Date format
        analysis = `📅 日期分析:
• 日期: ${data}
• 格式: Oracle DD-MON-YY
💡 建議: 考慮使用完整年份格式以避免歧義`
      } else if (data.includes('@')) {
        // Email
        analysis = `📧 Email 分析:
• 類型: 電子郵件地址
• 格式: ${data.toLowerCase() === data ? '小寫' : '混合大小寫'}
💡 建議: 確保郵件格式符合RFC標準`
      } else if (data.length > 20) {
        // Long text
        analysis = `📝 文本分析:
• 長度: ${data.length} 字元
• 類型: 長文本
💡 建議: 考慮建立索引以優化查詢性能`
      } else {
        // General text
        analysis = `🔤 數據分析:
• 內容: ${data}
• 長度: ${data.length} 字元
• 類型: ${/^[A-Z_]+$/.test(data) ? '常量/代碼' : '一般文本'}
💡 可能的用途: ${/^[A-Z_]+$/.test(data) ? '資料表名稱、欄位名稱或狀態代碼' : '使用者輸入的數據'}`
      }
      
      setAiAnalysis(analysis)
    } catch (err) {
      setAiAnalysis('❌ 分析失敗')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Parse result to make data interactive
  const renderInteractiveResult = (result: string) => {
    if (!result) return null
    
    // Split result into lines
    const lines = result.split('\n')
    
    return (
      <div>
        {lines.map((line, lineIndex) => {
          // Check if this is a data line (not header, separator, or summary)
          const isDataLine = !line.includes('━') && 
                            !line.includes('查詢結果') &&
                            !line.includes('行已選取') &&
                            !line.includes('執行時間') &&
                            line.trim().length > 0
          
          if (isDataLine) {
            // Split line by whitespace to get individual data values
            const values = line.trim().split(/\s{2,}/)
            
            return (
              <div key={lineIndex} style={{ display: 'flex', gap: '8px' }}>
                {values.map((value, valueIndex) => (
                  <span
                    key={valueIndex}
                    onMouseEnter={(e) => handleDataHover(value.trim(), e)}
                    onMouseLeave={handleDataLeave}
                    style={{
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: '2px',
                      transition: 'background-color 0.2s',
                      backgroundColor: hoveredData?.text === value.trim() ? '#1e40af' : 'transparent'
                    }}
                  >
                    {value}
                  </span>
                ))}
              </div>
            )
          }
          
          return <div key={lineIndex}>{line}</div>
        })}
      </div>
    )
  }

  const containerStyle: React.CSSProperties = isFloating ? {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${size.width}px`,
    height: `${size.height}px`,
    backgroundColor: '#1e1e1e',
    border: '1px solid #3a3836',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
    zIndex: 1100,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    cursor: isDragging ? 'move' : 'default'
  } : {
    width: '100%',
    backgroundColor: '#1e1e1e',
    borderBottom: '1px solid #3a3836',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  }

  return (
    <>
      <div ref={containerRef} style={containerStyle}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: '#2a2826',
          borderBottom: isExpanded ? '1px solid #3a3836' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: isFloating ? 'move' : 'pointer',
          userSelect: 'none'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseDown={isFloating ? handleDragStart : undefined}
      >
        <span style={{ fontSize: '14px' }}>{isExpanded ? '▼' : '▶'}</span>
        <span style={{ color: '#dfdbc3', fontSize: '13px', fontWeight: 500, flex: 1 }}>
          🗄️ 資料庫 {activeTab?.isConnected && <span style={{ color: '#4ade80' }}>● 已連接</span>}
        </span>
        <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
          {onToggleFloat && (
            <button
              onClick={onToggleFloat}
              style={{
                background: 'none',
                border: '1px solid #3a3836',
                color: '#dfdbc3',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '12px',
                borderRadius: '4px'
              }}
              title={isFloating ? '固定' : '浮動'}
            >
              {isFloating ? '📌' : '🔗'}
            </button>
          )}
          {onCollapse && !isFloating && (
            <button
              onClick={onCollapse}
              style={{
                background: 'none',
                border: '1px solid #3a3836',
                color: '#dfdbc3',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '12px',
                borderRadius: '4px'
              }}
              title="收合面板"
            >
              ▼
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: '1px solid #3a3836',
                color: '#dfdbc3',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '12px',
                borderRadius: '4px'
              }}
              title="關閉"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {isExpanded && tabs.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '2px',
            padding: '4px 8px',
            backgroundColor: '#1f1d1a',
            borderBottom: '1px solid #3a3836',
            overflowX: 'auto',
            alignItems: 'center'
          }}
        >
          {tabs.map(tab => (
            <div
              key={tab.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                backgroundColor: activeTabId === tab.id ? '#2a2826' : '#0f0f0f',
                border: `1px solid ${activeTabId === tab.id ? '#3a3836' : '#1a1a1a'}`,
                borderRadius: '3px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontSize: '12px',
                color: '#dfdbc3'
              }}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span>{tab.config.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteTab(tab.id)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '0'
                }}
                title="刪除"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => setShowNewTabDialog(true)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#0a7d0a',
              border: '1px solid #1a5f1a',
              color: '#dfdbc3',
              cursor: 'pointer',
              fontSize: '12px',
              borderRadius: '3px',
              marginLeft: 'auto'
            }}
            title="新增連線"
          >
            + 新增
          </button>
        </div>
      )}

      {/* New Tab Dialog */}
      {showNewTabDialog && (
        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '8px',
            backgroundColor: '#1f1d1a',
            borderBottom: '1px solid #3a3836'
          }}
        >
          <input
            type="text"
            placeholder="連線名稱 (可選)"
            value={newTabName}
            onChange={(e) => setNewTabName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && createNewTab()}
            style={{
              flex: 1,
              padding: '4px 6px',
              backgroundColor: '#2a2a2a',
              border: '1px solid #444',
              color: '#e0e0e0',
              borderRadius: '3px',
              fontSize: '12px'
            }}
            autoFocus
          />
          <button
            onClick={createNewTab}
            style={{
              padding: '4px 8px',
              backgroundColor: '#2a7d2e',
              border: 'none',
              color: '#dfdbc3',
              cursor: 'pointer',
              fontSize: '12px',
              borderRadius: '3px'
            }}
          >
            建立
          </button>
          <button
            onClick={() => setShowNewTabDialog(false)}
            style={{
              padding: '4px 8px',
              backgroundColor: '#3a3836',
              border: 'none',
              color: '#dfdbc3',
              cursor: 'pointer',
              fontSize: '12px',
              borderRadius: '3px'
            }}
          >
            取消
          </button>
        </div>
      )}

      {/* Content */}
      {isExpanded && activeTab && (
        <div style={{ 
          padding: '12px', 
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Connection Config */}
          {!activeTab.isConnected && (
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="連線名稱"
                value={activeTab.config.name}
                onChange={(e) => updateTabConfig(activeTab.id, { name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  color: '#e0e0e0',
                  borderRadius: '4px',
                  fontSize: '12px',
                  marginBottom: '8px'
                }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="Host"
                  value={activeTab.config.host}
                  onChange={(e) => updateTabConfig(activeTab.id, { host: e.target.value })}
                  style={{
                    padding: '6px 8px',
                    backgroundColor: '#2a2a2a',
                    border: '1px solid #444',
                    color: '#e0e0e0',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
                <input
                  type="text"
                  placeholder="Port"
                  value={activeTab.config.port}
                  onChange={(e) => updateTabConfig(activeTab.id, { port: e.target.value })}
                  style={{
                    padding: '6px 8px',
                    backgroundColor: '#2a2a2a',
                    border: '1px solid #444',
                    color: '#e0e0e0',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
              </div>
              <input
                type="text"
                placeholder="Service Name"
                value={activeTab.config.service}
                onChange={(e) => updateTabConfig(activeTab.id, { service: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  color: '#e0e0e0',
                  borderRadius: '4px',
                  fontSize: '12px',
                  marginBottom: '8px'
                }}
              />
              <input
                type="text"
                placeholder="Username"
                value={activeTab.config.username}
                onChange={(e) => updateTabConfig(activeTab.id, { username: e.target.value })}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  color: '#e0e0e0',
                  borderRadius: '4px',
                  fontSize: '12px',
                  marginBottom: '8px'
                }}
              />
              <div style={{ position: 'relative', marginBottom: '8px' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={activeTab.config.password}
                  onChange={(e) => updateTabConfig(activeTab.id, { password: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    paddingRight: '40px',
                    backgroundColor: '#2a2a2a',
                    border: '1px solid #444',
                    color: '#e0e0e0',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '6px',
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              <button
                onClick={handleConnect}
                disabled={isLoading || !activeTab.config.username || !activeTab.config.password}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: isLoading ? '#555' : '#2a7d2e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold'
                }}
              >
                {isLoading ? '連接中...' : '連接'}
              </button>
            </div>
          )}

          {/* Query Interface */}
          {activeTab.isConnected && (
            <div>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>快速測試查詢：</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  <button
                    onClick={() => updateTab(activeTab.id, { query: 'SELECT * FROM dual' })}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#374151',
                      color: '#9ca3af',
                      border: '1px solid #4b5563',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    DUAL
                  </button>
                  <button
                    onClick={() => updateTab(activeTab.id, { query: 'SELECT SYSDATE FROM dual' })}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#374151',
                      color: '#9ca3af',
                      border: '1px solid #4b5563',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    SYSDATE
                  </button>
                  <button
                    onClick={() => updateTab(activeTab.id, { query: 'SELECT table_name FROM user_tables' })}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#374151',
                      color: '#9ca3af',
                      border: '1px solid #4b5563',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    Tables
                  </button>
                  <button
                    onClick={() => updateTab(activeTab.id, { query: 'SELECT * FROM employees WHERE ROWNUM <= 10' })}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#374151',
                      color: '#9ca3af',
                      border: '1px solid #4b5563',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    Employees
                  </button>
                  <button
                    onClick={() => updateTab(activeTab.id, { query: 'SELECT COUNT(*) FROM employees' })}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#374151',
                      color: '#9ca3af',
                      border: '1px solid #4b5563',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    COUNT
                  </button>
                </div>
              </div>
              
              <textarea
                placeholder="輸入 SQL 查詢..."
                value={activeTab.query}
                onChange={(e) => updateTab(activeTab.id, { query: e.target.value })}
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '8px',
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  color: '#e0e0e0',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  marginBottom: '8px',
                  resize: 'vertical'
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  onClick={handleExecuteQuery}
                  disabled={isLoading || !activeTab.query.trim()}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: isLoading ? '#555' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  {isLoading ? '執行中...' : '▶ 執行查詢'}
                </button>
                <button
                  onClick={fetchActiveSessions}
                  disabled={isLoadingActivity}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: isLoadingActivity ? '#555' : '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLoadingActivity ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                  title="查看正在运行的SQL和JOB"
                >
                  {isLoadingActivity ? '查詢中...' : '📊 活動監控'}
                </button>
                <button
                  onClick={handleDisconnect}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  中斷連接
                </button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {activeTab.error && (
            <div
              style={{
                padding: '8px',
                backgroundColor: '#7f1d1d',
                border: '1px solid #991b1b',
                borderRadius: '4px',
                color: '#fca5a5',
                fontSize: '12px',
                marginBottom: '8px'
              }}
            >
              ❌ {activeTab.error}
            </div>
          )}

          {/* Result Display */}
          {activeTab.result && (
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  padding: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '4px',
                  color: '#94a3b8',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  overflowY: 'auto',
                  overflowX: 'auto',
                  flex: 1,
                  minHeight: isFloating ? '300px' : '200px',
                  maxHeight: isFloating ? 'none' : '400px'
                }}
              >
                {renderInteractiveResult(activeTab.result)}
              </div>
              
              {/* AI Analysis Tooltip */}
              {hoveredData && createPortal(
                <div
                  style={{
                    position: 'fixed',
                    left: `${hoveredData.x}px`,
                    top: `${hoveredData.y - 10}px`,
                    transform: 'translate(-50%, -100%)',
                    backgroundColor: '#1e293b',
                    border: '2px solid #3b82f6',
                    borderRadius: '6px',
                    padding: '12px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                    zIndex: 10000,
                    maxWidth: '300px',
                    minWidth: '200px',
                    color: '#e2e8f0',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {isAnalyzing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="loading-spinner" style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid #3b82f6',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      <span>AI 分析中...</span>
                    </div>
                  ) : aiAnalysis ? (
                    <>
                      <div style={{ 
                        fontSize: '11px', 
                        color: '#64748b', 
                        marginBottom: '8px',
                        borderBottom: '1px solid #334155',
                        paddingBottom: '4px'
                      }}>
                        🤖 AI 智能分析
                      </div>
                      {aiAnalysis}
                    </>
                  ) : null}
                </div>,
                document.body
              )}
            </div>
          )}

          {/* Helper Text */}
          {!activeTab.isConnected && !activeTab.error && (
            <div style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
              💡 提示：連接後，Copilot Chat 可以讀取查詢結果
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {isExpanded && tabs.length === 0 && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontSize: '12px' }}>
          <p>📭 還沒有資料庫連線</p>
          <button
            onClick={() => setShowNewTabDialog(true)}
            style={{
              marginTop: '10px',
              padding: '6px 12px',
              backgroundColor: '#0a7d0a',
              border: '1px solid #1a5f1a',
              color: '#dfdbc3',
              cursor: 'pointer',
              fontSize: '12px',
              borderRadius: '3px'
            }}
          >
            + 新增連線
          </button>
        </div>
      )}
      
      {/* Resize Handle (only show when floating) */}
      {isFloating && isExpanded && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '20px',
            height: '20px',
            cursor: 'nwse-resize',
            background: 'linear-gradient(135deg, transparent 50%, #3a3836 50%)',
            borderBottomRightRadius: '6px'
          }}
          title="拖動調整大小"
        />
      )}
      </div>

      {/* 活动监控弹窗 - 使用 Portal 渲染到 body 层级 */}
    {showActivityMonitor && createPortal(
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}
        onClick={() => setShowActivityMonitor(false)}
      >
        <div
          style={{
            backgroundColor: '#1f1d1a',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '90%',
            maxHeight: '80%',
            overflow: 'auto',
            border: '1px solid #3a3836',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ color: '#dfdbc3', margin: 0, fontSize: '18px' }}>
              📊 正在運行的SQL和JOB ({activeSessions.length})
            </h3>
            <button
              onClick={() => setShowActivityMonitor(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#999',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '0 8px'
              }}
            >
              ×
            </button>
          </div>

          {activeSessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              暫無正在運行的會話
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {activeSessions.map((session, index) => (
                <div
                  key={index}
                  style={{
                    backgroundColor: '#2a2826',
                    border: '1px solid #3a3836',
                    borderRadius: '8px',
                    padding: '16px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#4caf50', fontWeight: 'bold' }}>
                        SID: {session.sid}
                      </span>
                      <span style={{ color: '#2196f3' }}>
                        👤 {session.username}
                      </span>
                      <span style={{ color: '#ff9800' }}>
                        💻 {session.program}
                      </span>
                      {session.module && (
                        <span style={{ color: '#9c27b0' }}>
                          📦 {session.module}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        padding: '4px 12px',
                        backgroundColor: session.status === 'ACTIVE' ? '#4caf50' : '#999',
                        color: 'white',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}
                    >
                      {session.status}
                    </span>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: '#999', fontSize: '11px', marginBottom: '4px' }}>SQL 語句:</div>
                    <pre
                      style={{
                        backgroundColor: '#1a1816',
                        padding: '12px',
                        borderRadius: '6px',
                        color: '#dfdbc3',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        overflow: 'auto',
                        maxHeight: '120px',
                        margin: 0,
                        border: '1px solid #3a3836'
                      }}
                    >
                      {session.sql_text}
                    </pre>
                  </div>

                  <div style={{ display: 'flex', gap: '24px', fontSize: '12px' }}>
                    <span style={{ color: '#999' }}>
                      ⏱ 運行時間: <strong style={{ color: '#dfdbc3' }}>{session.elapsed_time.toFixed(1)}s</strong>
                    </span>
                    <span style={{ color: '#999' }}>
                      💻 CPU: <strong style={{ color: '#dfdbc3' }}>{session.cpu_time.toFixed(1)}s</strong>
                    </span>
                    {session.action && (
                      <span style={{ color: '#999' }}>
                        🎯 動作: <strong style={{ color: '#dfdbc3' }}>{session.action}</strong>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button
              onClick={fetchActiveSessions}
              disabled={isLoadingActivity}
              style={{
                padding: '8px 24px',
                backgroundColor: '#0078d4',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isLoadingActivity ? 'wait' : 'pointer',
                fontSize: '13px',
                fontWeight: 'bold'
              }}
            >
              {isLoadingActivity ? '刷新中...' : '🔄 刷新'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  )
}
