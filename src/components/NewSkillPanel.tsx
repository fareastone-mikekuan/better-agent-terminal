/**
 * 新版技能面板 - 顯示和執行當前工作區關聯的技能
 * 支持自動化技能和 AI Agent 技能
 */
import { useState, useEffect, useRef } from 'react'
import { skillStore } from '../stores/skill-store'
import type { UnifiedSkill, SkillStep, AIAgentSkill, AgentExecutionState } from '../types/skill'
import { isAIAgentSkill } from '../types/skill'
import { workspaceStore } from '../stores/workspace-store'
import { settingsStore } from '../stores/settings-store'
import { DEFAULT_CATEGORIES } from '../types/skill'
import { createPanelForStep } from '../services/workflow-panel-service'
import { AIAgentExecutor, type AgentContext } from '../services/ai-agent-executor'

interface NewSkillPanelProps {
  isVisible: boolean
  onClose: () => void
  width?: number
  workspaceId?: string | null
  collapsed?: boolean
  onCollapse?: () => void
}

interface StepResult {
  stepIndex: number
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
  message?: string
  duration?: number
}

export function NewSkillPanel({
  isVisible,
  onClose,
  width = 320,
  workspaceId,
  collapsed = false,
  onCollapse = () => {}
}: Readonly<NewSkillPanelProps>) {
  const [allSkills, setAllSkills] = useState<UnifiedSkill[]>([])
  const [linkedSkillIds, setLinkedSkillIds] = useState<string[]>([])
  const [selectedSkill, setSelectedSkill] = useState<UnifiedSkill | null>(null)
  const [showSkillSelector, setShowSkillSelector] = useState(false)
  
  // 取得共用/獨立狀態（即時計算）
  const settings = settingsStore.getSettings()
  const isShared = settings.sharedPanels?.skills !== false
  const state = workspaceStore.getState()
  const currentWorkspace = state.workspaces.find(w => w.id === workspaceId)
  const workspaceName = currentWorkspace?.alias || currentWorkspace?.name || '未知工作區'
  const modeLabel = isShared ? '🌐 共用' : `🔒 ${workspaceName}`
  
  // 執行狀態（自動化技能）
  const [executingSkill, setExecutingSkill] = useState<UnifiedSkill | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [results, setResults] = useState<StepResult[]>([])
  const [executingTerminalId, setExecutingTerminalId] = useState<string | null>(null)
  const [isExecutionCompleted, setIsExecutionCompleted] = useState(false)

  // AI Agent 執行狀態
  const [agentExecutor, setAgentExecutor] = useState<AIAgentExecutor | null>(null)
  const [agentState, setAgentState] = useState<AgentExecutionState | null>(null)
  const [showTaskInput, setShowTaskInput] = useState(false)
  const [pendingAgentSkill, setPendingAgentSkill] = useState<AIAgentSkill | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const agentThoughtsRef = useRef<HTMLDivElement>(null)

  // 自動滾動到最新的 AI 回覆
  useEffect(() => {
    if (agentState?.thoughts && agentThoughtsRef.current) {
      // 延遲一點確保 DOM 已更新
      setTimeout(() => {
        agentThoughtsRef.current?.scrollTo({
          top: agentThoughtsRef.current.scrollHeight,
          behavior: 'smooth'
        })
      }, 100)
    }
  }, [agentState?.thoughts?.length])

  useEffect(() => {
    loadSkills()
    loadLinkedSkills()
    const unsubscribeSkills = skillStore.subscribe(loadSkills)
    const unsubscribeWorkspace = workspaceStore.subscribe(loadLinkedSkills)
    return () => {
      unsubscribeSkills()
      unsubscribeWorkspace()
    }
  }, [workspaceId])

  const loadSkills = () => {
    setAllSkills(skillStore.getSkills())
  }

  const loadLinkedSkills = () => {
    if (!workspaceId) {
      setLinkedSkillIds([])
      return
    }
    const workspace = workspaceStore.getState().workspaces.find(w => w.id === workspaceId)
    setLinkedSkillIds(workspace?.linkedSkills || [])
  }

  const linkedSkills = allSkills.filter(s => linkedSkillIds.includes(s.id))

  const updateStepResult = (index: number, update: Partial<StepResult>) => {
    setResults(prev => {
      const newResults = [...prev]
      newResults[index] = { ...newResults[index], ...update }
      return newResults
    })
  }

  const executeStep = async (step: SkillStep, index: number): Promise<boolean> => {
    if (!workspaceId) return false
    
    const startTime = Date.now()
    updateStepResult(index, { status: 'running' })
    
    try {
      // 如果是 terminal 步驟，且已經有執行中的 terminal，則復用
      if (step.type === 'terminal' && executingTerminalId) {
        // 在同一個 terminal 中執行命令
        const command = step.config.command || ''
        if (command) {
          // 等待一下讓上一個命令執行完成
          await new Promise(resolve => setTimeout(resolve, 500))
          await window.electronAPI.pty.write(executingTerminalId, command + '\r')
        }
        
        const duration = Date.now() - startTime
        updateStepResult(index, {
          status: 'success',
          message: '已執行命令',
          duration
        })
        
        return true
      }
      
      // 其他情況：第一個 terminal 步驟或非 terminal 類型
      // 將新格式的 SkillStep 轉換為舊格式的 SkillWorkflowStep
      const workflowStep: any = {
        type: step.type,
        label: step.name,
        // Terminal
        command: step.config.command,
        // API
        apiMethod: step.config.method,
        apiUrl: step.config.url,
        apiHeaders: step.config.headers,
        apiBody: step.config.body,
        // DB
        dbQuery: step.config.query,
        dbConnection: step.config.connection,
        // Web
        webUrl: step.config.webUrl,
        // File
        fileAction: step.config.action,
        filePath: step.config.path,
        fileContent: step.config.content
      }
      
      const panelId = await createPanelForStep(workspaceId, workflowStep, index)
      
      if (!panelId) {
        throw new Error(`無法創建 ${step.type} 面板`)
      }
      
      // 如果是 terminal 類型，記錄這個 terminal ID
      if (step.type === 'terminal' && !executingTerminalId) {
        setExecutingTerminalId(panelId)
      }
      
      const duration = Date.now() - startTime
      updateStepResult(index, {
        status: 'success',
        message: '已創建面板',
        duration
      })
      
      return true
    } catch (error) {
      const duration = Date.now() - startTime
      updateStepResult(index, {
        status: 'error',
        message: error instanceof Error ? error.message : '執行失敗',
        duration
      })
      return false
    }
  }

  const handleExecute = async (skill: UnifiedSkill) => {
    // 檢查是否為 AI Agent 技能
    if (isAIAgentSkill(skill)) {
      await handleExecuteAIAgent(skill)
      return
    }
    
    // 自動化技能執行邏輯
    setExecutingSkill(skill)
    setCurrentStep(0)
    setIsRunning(true)
    setIsPaused(false)
    setResults(skill.steps.map((_, i) => ({ stepIndex: i, status: 'pending' })))
    setExecutingTerminalId(null) // 重置 terminal ID
    
    for (let i = 0; i < skill.steps.length; i++) {
      if (isPaused) break
      
      setCurrentStep(i)
      const success = await executeStep(skill.steps[i], i)
      
      if (!success) {
        const continueOnError = confirm('步驟執行失敗，是否繼續執行下一步？')
        if (!continueOnError) {
          break
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    
    setIsRunning(false)
  }

  /**
   * 執行 AI Agent 技能
   */
  const handleExecuteAIAgent = async (skill: AIAgentSkill) => {
    // 顯示任務輸入對話框
    setPendingAgentSkill(skill)
    setShowTaskInput(true)
  }

  /**
   * 確認執行 AI Agent（帶任務描述）
   */
  const handleConfirmExecuteAgent = async () => {
    if (!pendingAgentSkill) return
    
    let userTask = taskInput.trim()
    // 如果用戶沒有輸入，使用技能的預設指示
    if (!userTask && pendingAgentSkill.prompt?.instructions) {
      userTask = pendingAgentSkill.prompt.instructions
    }
    if (!userTask) {
      alert('請提供具體的任務描述')
      return
    }
    
    // 關閉對話框
    setShowTaskInput(false)
    const skill = pendingAgentSkill
    setPendingAgentSkill(null)
    setTaskInput('')
    
    try {
      setExecutingSkill(skill)
      setIsRunning(true)
      
      // 獲取當前工作區資訊
      const workspace = workspaceStore.getState().workspaces.find(w => w.id === workspaceId)
      if (!workspace) {
        alert('找不到工作區')
        return
      }
      
      // 獲取當前工作區的所有 terminals
      const state = workspaceStore.getState()
      console.log('[AI Agent] 所有 terminals:', state.terminals.length)
      console.log('[AI Agent] 當前工作區 ID:', workspaceId)
      console.log('[AI Agent] activeTerminalId:', state.activeTerminalId)
      
      const workspaceTerminals = state.terminals
        .filter(t => t.workspaceId === workspaceId && t.type === 'terminal')
        .map((t, index) => {
          // 從 scrollbackBuffer 提取最後的命令和退出碼
          const buffer = t.scrollbackBuffer || []
          console.log(`[AI Agent] Terminal ${index + 1} buffer 長度:`, buffer.length)
          
          const lastLines = buffer.slice(-20).join('\n') // 最後 20 行
          console.log(`[AI Agent] Terminal ${index + 1} 最後內容:`, lastLines.slice(0, 500))
          
          // 嘗試從最後幾行找到命令和退出碼
          let lastCommand: string | undefined
          let exitCode: number | undefined
          
          // 多種模式匹配
          // 1. PowerShell 提示符: PS C:\path>
          // 2. Bash 提示符: $ command
          // 3. 或者直接找最後一個非空行
          const commandPatterns = [
            /PS\s+[^\>]+>\s*(.+?)[\r\n]/m,  // PowerShell
            /\$\s*(.+?)[\r\n]/m,             // Bash
            />\s*(.+?)[\r\n]/m               // Generic
          ]
          
          for (const pattern of commandPatterns) {
            const match = lastLines.match(pattern)
            if (match) {
              lastCommand = match[1].trim()
              break
            }
          }
          
          // 查找 "Exit Code: X" 模式
          const exitCodeMatch = lastLines.match(/Exit Code:\s*(\d+)/i)
          if (exitCodeMatch) {
            exitCode = parseInt(exitCodeMatch[1])
          }
          
          return {
            id: t.id,
            name: t.title || t.alias || `Terminal ${t.id.slice(0, 8)}`,
            lastCommand,
            exitCode
          }
        })
      
      console.log('[AI Agent] 提取的 workspaceTerminals:', workspaceTerminals)
      if (workspaceTerminals.length > 0) {
        workspaceTerminals.forEach((t, idx) => {
          console.log(`  Terminal ${idx + 1}:`, {
            id: t.id,
            name: t.name,
            lastCommand: t.lastCommand,
            exitCode: t.exitCode
          })
        })
      }
      
      // 如果沒有 activeTerminalId 但有 terminals，使用第一個作為活躍的
      let effectiveActiveTerminalId = state.activeTerminalId
      if (!effectiveActiveTerminalId && workspaceTerminals.length > 0) {
        effectiveActiveTerminalId = workspaceTerminals[0].id
        console.log('[AI Agent] 沒有 activeTerminalId，使用第一個 terminal:', effectiveActiveTerminalId)
      }
      
      // 建立 terminalBuffers Map
      const terminalBuffers = new Map<string, string[]>()
      state.terminals
        .filter(t => t.workspaceId === workspaceId && t.type === 'terminal')
        .forEach(t => {
          terminalBuffers.set(t.id, t.scrollbackBuffer || [])
        })
      
      // 建構 Agent 上下文
      const context: AgentContext = {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        currentPath: workspace.folderPath,
        envVars: workspace.envVars || [],
        terminals: workspaceTerminals,
        activeTerminalId: effectiveActiveTerminalId,
        terminalBuffers: terminalBuffers,
        trigger: {
          type: 'manual',
          data: { 
            message: '用戶手動觸發',
            task: userTask
          }
        },
        knowledgeBase: [] // TODO: 從 knowledgeStore 載入知識
      }
      
      // 創建 Agent 執行器
      const executor = new AIAgentExecutor(skill, context)
      setAgentExecutor(executor)
      
      // 啟動執行並監聽狀態更新
      const updateInterval = setInterval(() => {
        const currentState = executor.getState()
        console.log('[UI] 更新 Agent 狀態:', {
          status: currentState.status,
          hasPendingAction: !!currentState.pendingAction,
          actionType: currentState.pendingAction?.type
        })
        setAgentState({ ...currentState })
      }, 500)
      
      try {
        // 執行 Agent
        const result = await executor.execute()
        
        clearInterval(updateInterval)
        const finalState = executor.getState()
        setAgentState(finalState)
        
        // 只有在真正完成或錯誤時才清空 executor
        // 如果是等待批准，保留 executor 讓用戶可以批准/拒絕
        if (finalState.status !== 'waiting-approval') {
          setAgentExecutor(null)
          setIsRunning(false)
          
          if (result.success) {
            alert(`AI Agent 執行完成\n\n${result.message}`)
          } else {
            alert(`AI Agent 執行失敗\n\n${result.message}`)
          }
        } else {
          // 等待批准狀態，保持 isRunning 為 true
          console.log('[AI Agent] 進入等待批准狀態，保留 executor')
        }
      } catch (error) {
        console.error('AI Agent 執行錯誤:', error)
        clearInterval(updateInterval)
        setAgentExecutor(null)
        setIsRunning(false)
        alert(`執行錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`)
      }
      
    } catch (error) {
      console.error('AI Agent 初始化錯誤:', error)
      alert(`初始化錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`)
      setIsRunning(false)
    }
  }

  /**
   * 批准 AI Agent 的待處理動作
   */
  const handleApproveAction = async () => {
    console.log('[Approval] Button clicked')
    console.log('[Approval] agentExecutor:', agentExecutor)
    console.log('[Approval] pendingAction:', agentState?.pendingAction)
    
    if (!agentExecutor || !agentState?.pendingAction) {
      console.error('[Approval] Missing required state')
      alert('無法批准：缺少必要的狀態資訊')
      return
    }
    
    try {
      console.log('[Approval] Calling approveAction()')
      await agentExecutor.approveAction()
      const newState = agentExecutor.getState()
      console.log('[Approval] New state after approval:', newState)
      setAgentState({ ...newState })
      
      // 批准後繼續執行 Agent
      console.log('[Approval] Continuing Agent execution...')
      const updateInterval = setInterval(() => {
        setAgentState({ ...agentExecutor.getState() })
      }, 500)
      
      try {
        const result = await agentExecutor.execute()
        clearInterval(updateInterval)
        const finalState = agentExecutor.getState()
        setAgentState(finalState)
        
        // 檢查是否又需要批准
        if (finalState.status !== 'waiting-approval') {
          setAgentExecutor(null)
          setIsRunning(false)
          
          if (result.success) {
            alert(`AI Agent 執行完成\n\n${result.message}`)
          } else {
            alert(`AI Agent 執行失敗\n\n${result.message}`)
          }
        }
      } catch (error) {
        clearInterval(updateInterval)
        console.error('[Approval] Execution error:', error)
        setAgentExecutor(null)
        setIsRunning(false)
        alert(`執行錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`)
      }
    } catch (error) {
      console.error('[Approval] Error:', error)
      alert(`批准動作失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  /**
   * 拒絕 AI Agent 的待處理動作
   */
  const handleRejectAction = () => {
    console.log('[Approval] Reject clicked')
    if (!agentExecutor || !agentState?.pendingAction) {
      console.error('[Approval] Missing required state for rejection')
      return
    }
    
    const reason = prompt('拒絕原因（可選）:')
    agentExecutor.rejectAction(reason || undefined)
    setAgentState({ ...agentExecutor.getState() })
    
    // 拒絕後清理並結束
    setAgentExecutor(null)
    setIsRunning(false)
    alert('已拒絕動作，Agent 執行已終止')
  }

  const handlePause = () => {
    setIsPaused(true)
    setIsRunning(false)
  }

  const handleContinue = async () => {
    if (!executingSkill || isAIAgentSkill(executingSkill)) return
    
    setIsRunning(true)
    setIsPaused(false)
    
    for (let i = currentStep + 1; i < executingSkill.steps.length; i++) {
      if (isPaused) break
      
      setCurrentStep(i)
      const success = await executeStep(executingSkill.steps[i], i)
      
      if (!success) {
        const continueOnError = confirm('步驟執行失敗，是否繼續執行下一步？')
        if (!continueOnError) {
          break
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    
    setIsRunning(false)
    setIsExecutionCompleted(true)  // 標記執行完成
  }

  const handleReset = () => {
    setExecutingSkill(null)
    setCurrentStep(0)
    setIsRunning(false)
    setIsPaused(false)
    setResults([])
    setExecutingTerminalId(null) // 清除 terminal ID
    setIsExecutionCompleted(false)  // 重置完成狀態
  }

  const handleManageSkills = () => {
    if (allSkills.length === 0) {
      alert('沒有可用的技能，請先到技能庫創建技能')
      return
    }
    setShowSkillSelector(true)
  }

  const handleToggleSkillLink = (skillId: string) => {
    if (!workspaceId) return
    
    const workspace = workspaceStore.getState().workspaces.find(w => w.id === workspaceId)
    if (!workspace) return
    
    const currentLinked = workspace.linkedSkills || []
    const isLinked = currentLinked.includes(skillId)
    
    const newLinked = isLinked
      ? currentLinked.filter(id => id !== skillId)
      : [...currentLinked, skillId]
    
    console.log('[NewSkillPanel] 更新 linkedSkills:', { workspaceId, newLinked })
    
    // 使用 updateWorkspace 更新工作區的 linkedSkills
    workspaceStore.updateWorkspace(workspaceId, { linkedSkills: newLinked })
    loadLinkedSkills()
  }

  if (!isVisible) return null

  const getStepStatusIcon = (status: StepResult['status']) => {
    switch (status) {
      case 'pending': return '○'
      case 'running': return '◐' // 使用半圓圖示配合動畫
      case 'success': return '✓'
      case 'error': return '✗'
      case 'skipped': return '⊗'
      default: return '○'
    }
  }

  const getStepStatusColor = (status: StepResult['status']) => {
    switch (status) {
      case 'running': return '#7bbda4'
      case 'success': return '#8bc34a'
      case 'error': return '#f44336'
      case 'skipped': return '#999'
      default: return 'var(--text-secondary)'
    }
  }

  return (
    <>
      {/* 添加旋轉動畫的 CSS */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <div
        style={{
          width: collapsed ? 40 : width,
          height: '100%',
          backgroundColor: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.2s ease'
        }}
      >
        {collapsed ? (
          // 收合狀態
          <div
            style={{
              display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            padding: '16px 8px'
          }}
        >
          <button
            onClick={onCollapse}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px',
              transform: 'rotate(180deg)'
            }}
            title="展開技能面板"
          >
            ◀
          </button>
          <div
            style={{
              writingMode: 'vertical-rl',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              userSelect: 'none'
            }}
          >
            🎯 技能
          </div>
        </div>
      ) : (
        // 展開狀態
        <>
          {/* 標題列 */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--bg-primary)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🎯</span>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>
                {executingSkill ? '執行技能' : '技能'}
              </span>
              {/* 共用/獨立標籤 */}
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
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={onCollapse}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '6px 12px'
                }}
                title="收合面板"
              >
                »
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '4px 8px'
                }}
                title="關閉"
              >
                ×
              </button>
            </div>
          </div>

          {/* 當前工作區提示 */}
          {workspaceId && !executingSkill && (
            <div
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border-color)',
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}
            >
              工作區: {workspaceStore.getState().workspaces.find(w => w.id === workspaceId)?.alias || 
                       workspaceStore.getState().workspaces.find(w => w.id === workspaceId)?.name || '未知'}
            </div>
          )}

          {/* 執行中的技能顯示 */}
          {executingSkill ? (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column',
              overflow: 'hidden'  // 防止子元素溢出
            }}>
              {isAIAgentSkill(executingSkill) ? (
                /* AI Agent 執行視圖 */
                <>
                  {/* Agent 資訊 */}
                  <div
                    style={{
                      padding: '16px',
                      borderBottom: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-tertiary)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '24px' }}>
                        {executingSkill.icon || '🤖'}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{executingSkill.name}</div>
                        {executingSkill.description && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {executingSkill.description}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Agent 狀態與 TODO 進度 */}
                    {agentState && (
                      <>
                        {/* TODO 進度顯示（緊湊型） */}
                        <div style={{
                          marginTop: '12px',
                          padding: '12px 16px',
                          backgroundColor: 'var(--bg-primary)',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)'
                        }}>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px',
                            paddingBottom: '8px',
                            borderBottom: '1px solid var(--border-color)'
                          }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: agentState.status === 'completed' ? '#3fb950' : '#58a6ff' }}>
                              {agentState.status === 'completed' ? '✅ 執行完成' : 
                               agentState.status === 'error' ? '❌ 執行錯誤' :
                               agentState.status === 'waiting-approval' ? '⏸️ 等待批准' :
                               '⚙️ AI 思考中'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#888' }}>
                              迭代 {agentState.currentIteration} / {executingSkill.config?.maxIterations || 10}
                            </div>
                          </div>

                          {/* 根據 expectedSteps 或 thoughts 生成 TODO 步驟 */}
                          {(() => {
                            const expectedSteps = executingSkill.config?.expectedSteps
                            
                            // 如果有預定義步驟，顯示預定義步驟（類似 CHAT 的固定步驟）
                            if (expectedSteps && Array.isArray(expectedSteps)) {
                              const totalSteps = expectedSteps.length
                              const maxIter = executingSkill.config?.maxIterations || 10
                              const currentIter = agentState.currentIteration
                              
                              // 根據迭代進度計算已完成的步驟數
                              const stepsPerIteration = totalSteps / maxIter
                              const completedSteps = Math.floor((currentIter - 1) * stepsPerIteration)
                              const currentStepIndex = Math.floor(currentIter * stepsPerIteration) - 1
                              
                              return expectedSteps.map((step, index) => {
                                const isCompleted = index < completedSteps
                                const isCurrent = index === currentStepIndex && agentState.status === 'thinking'
                                const isPending = index > currentStepIndex
                                
                                let icon = '⏺️'
                                let statusText = '等待中'
                                let color = '#888'
                                
                                if (isCurrent) {
                                  icon = '🔄'
                                  statusText = '進行中'
                                  color = '#58a6ff'
                                } else if (isCompleted || (agentState.status === 'completed' && index <= currentStepIndex)) {
                                  icon = '✓'
                                  statusText = '完成'
                                  color = '#3fb950'
                                }
                                
                                return (
                                  <div key={step.id} style={{ marginBottom: '4px' }}>
                                    {/* 外層：預定義業務步驟 */}
                                    <div 
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '6px 0',
                                        opacity: isPending ? 0.4 : 1,
                                        transition: 'all 0.3s ease'
                                      }}
                                    >
                                      <div style={{
                                        fontSize: '14px',
                                        lineHeight: '14px',
                                        animation: isCurrent ? 'spin 1s linear infinite' : 'none'
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
                                      </div>
                                    </div>
                                    
                                    {/* 內層：當前步驟的 AI 思考過程（嵌套顯示） */}
                                    {isCurrent && agentState.thoughts.length > 0 && (
                                      <div style={{
                                        marginLeft: '34px',
                                        paddingLeft: '12px',
                                        borderLeft: '2px solid #30363d',
                                        marginTop: '4px'
                                      }}>
                                        {agentState.thoughts.slice(-3).map((thought, tIndex) => {
                                          // thought 可能是字符串或對象 {type, content, timestamp}
                                          const thoughtText = typeof thought === 'string' ? thought : thought.content
                                          const displayText = thoughtText.length > 100 ? thoughtText.substring(0, 100) + '...' : thoughtText
                                          
                                          return (
                                            <div 
                                              key={`thought-${currentIter}-${tIndex}`}
                                              style={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: '8px',
                                                padding: '4px 0',
                                                fontSize: '11px',
                                                color: '#8b949e',
                                                opacity: 0.8
                                              }}
                                            >
                                              <div style={{ 
                                                fontSize: '10px',
                                                marginTop: '2px',
                                                color: '#58a6ff'
                                              }}>
                                                ↳
                                              </div>
                                              <div style={{ flex: 1, lineHeight: '1.4' }}>
                                                {displayText}
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )
                              })
                            }
                            
                            // 否則顯示 thoughts（原有邏輯，用於沒有預定義步驟的 AI Agent）
                            return agentState.thoughts.slice(-5).map((thought, index) => {
                              const isLatest = index === agentState.thoughts.slice(-5).length - 1
                              const isCompleted = !isLatest
                              
                              let icon = '⏺️'
                              let statusText = '等待中'
                              let color = '#888'
                              
                              if (isLatest && agentState.status === 'thinking') {
                                icon = '🔄'
                                statusText = '進行中'
                                color = '#58a6ff'
                              } else if (isCompleted) {
                                icon = thought.type === 'result' ? '✅' : '✓'
                                statusText = '完成'
                                color = '#3fb950'
                              }
                              
                              const typeLabel = 
                                thought.type === 'analysis' ? '🧠 分析任務' :
                                thought.type === 'knowledge' ? '📚 查詢知識' :
                                thought.type === 'decision' ? '💡 制定計畫' :
                                thought.type === 'action' ? '⚡ 執行動作' :
                                thought.type === 'result' ? '✅ 生成結果' : '🔍 處理中'
                              
                              return (
                                <div 
                                  key={index}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '6px 0',
                                    opacity: isCompleted ? 1 : 0.6,
                                    transition: 'all 0.3s ease'
                                  }}
                                >
                                  <div style={{
                                    fontSize: '14px',
                                    lineHeight: '14px',
                                    animation: (isLatest && agentState.status === 'thinking') ? 'spin 1s linear infinite' : 'none'
                                  }}>
                                    {icon}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{
                                      fontSize: '12px',
                                      fontWeight: 500,
                                      color: color
                                    }}>
                                      {typeLabel}
                                      <span style={{ 
                                        marginLeft: '8px',
                                        fontSize: '11px',
                                        color: '#666',
                                        fontWeight: 'normal'
                                      }}>
                                        ({statusText})
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })
                          })()}
                        </div>

                        {/* 原有的狀態指示器（保留作為備用） */}
                        <div style={{ marginTop: '12px', display: 'none' }}>
                          <div
                          style={{
                            padding: '8px 12px',
                            backgroundColor: 'var(--bg-secondary)',
                            borderRadius: '4px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor:
                                agentState.status === 'completed' ? '#8bc34a' :
                                agentState.status === 'error' ? '#f44336' :
                                agentState.status === 'waiting-approval' ? '#ff9800' :
                                '#7bbda4',
                              animation: ['thinking', 'executing'].includes(agentState.status) ? 'pulse 1.5s ease-in-out infinite' : 'none'
                            }}
                          />
                          <span>
                            {agentState.status === 'idle' && '待命中'}
                            {agentState.status === 'thinking' && '思考中...'}
                            {agentState.status === 'waiting-approval' && '等待批准'}
                            {agentState.status === 'executing' && '執行中...'}
                            {agentState.status === 'completed' && '已完成'}
                            {agentState.status === 'error' && '錯誤'}
                          </span>
                        </div>
                      </div>
                    </>
                    )}

                    {/* 控制按鈕 */}
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handleReset}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          fontSize: '13px',
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        ✕ 關閉
                      </button>
                    </div>
                  </div>

                  {/* Agent 思考過程 */}
                  <div 
                    ref={agentThoughtsRef}
                    style={{ 
                      flex: 1, 
                      overflowY: 'auto', 
                      padding: '8px',
                      minHeight: 0  // 確保 flex 子元素能正確滾動
                    }}>
                    {agentState?.thoughts.map((thought, index) => (
                      <div
                        key={index}
                        style={{
                          marginBottom: '12px',
                          padding: '12px',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '16px' }}>
                            {thought.type === 'analysis' && '🧠'}
                            {thought.type === 'knowledge' && '📚'}
                            {thought.type === 'decision' && '💡'}
                            {thought.type === 'action' && '⚡'}
                            {thought.type === 'result' && '✓'}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {thought.type === 'analysis' && '分析'}
                            {thought.type === 'knowledge' && '知識查詢'}
                            {thought.type === 'decision' && '決策'}
                            {thought.type === 'action' && '執行動作'}
                            {thought.type === 'result' && '結果'}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                            {new Date(thought.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            lineHeight: '1.5',
                            whiteSpace: 'pre-wrap'
                          }}
                        >
                          {thought.content}
                        </div>
                      </div>
                    ))}

                    {/* 待批准的動作 */}
                    {agentState?.pendingAction && (
                      <div
                        style={{
                          marginBottom: '12px',
                          padding: '16px',
                          backgroundColor: '#fff3cd',
                          border: '2px solid #ff9800',
                          borderRadius: '6px',
                          color: '#856404',
                          position: 'relative',
                          zIndex: 1000,
                          pointerEvents: 'auto'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>
                          ⚠️ 需要批准
                        </div>
                        <div style={{ marginBottom: '4px', fontSize: '13px' }}>
                          動作類型: <strong>{agentState.pendingAction.type}</strong>
                        </div>
                        <div style={{ marginBottom: '12px', fontSize: '12px', opacity: 0.8 }}>
                          參數: {JSON.stringify(agentState.pendingAction.params, null, 2)}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={handleApproveAction}
                            onMouseDown={(e) => {
                              console.log('[Approval] Mouse down on approve button')
                              e.stopPropagation()
                            }}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              fontSize: '13px',
                              backgroundColor: '#8bc34a',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              pointerEvents: 'auto',
                              position: 'relative',
                              zIndex: 1001
                            }}
                          >
                            ✓ 批准
                          </button>
                          <button
                            onClick={handleRejectAction}
                            onMouseDown={(e) => {
                              console.log('[Approval] Mouse down on reject button')
                              e.stopPropagation()
                            }}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              fontSize: '13px',
                              backgroundColor: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              pointerEvents: 'auto',
                              position: 'relative',
                              zIndex: 1001
                            }}
                          >
                            ✗ 拒絕
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 最終結果 */}
                    {agentState?.status === 'completed' && agentState.result && (
                      <div
                        style={{
                          padding: '16px',
                          backgroundColor: '#d4edda',
                          border: '2px solid #8bc34a',
                          borderRadius: '6px',
                          color: '#155724'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>
                          ✓ 執行完成
                        </div>
                        <div style={{ fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                          {agentState.result.summary}
                        </div>
                        {agentState.result.findings.length > 0 && (
                          <div style={{ marginTop: '12px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '12px' }}>發現：</div>
                            <ul style={{ marginLeft: '20px', fontSize: '12px' }}>
                              {agentState.result.findings.map((f, i) => <li key={i}>{f}</li>)}
                            </ul>
                          </div>
                        )}
                        {agentState.result.recommendations.length > 0 && (
                          <div style={{ marginTop: '12px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '12px' }}>建議：</div>
                            <ul style={{ marginLeft: '20px', fontSize: '12px' }}>
                              {agentState.result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {agentState?.status === 'error' && (
                      <div
                        style={{
                          padding: '16px',
                          backgroundColor: '#f8d7da',
                          border: '2px solid #f44336',
                          borderRadius: '6px',
                          color: '#721c24'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>
                          ✗ 執行失敗
                        </div>
                        <div style={{ fontSize: '13px' }}>
                          {agentState.result?.summary || '發生未知錯誤'}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* 自動化技能執行視圖 */
                <>
              {/* 技能資訊 */}
              <div
                style={{
                  padding: '16px',
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-tertiary)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '24px' }}>
                    {executingSkill.icon || DEFAULT_CATEGORIES.find(c => c.id === executingSkill.category)?.icon || '📦'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{executingSkill.name}</div>
                    {executingSkill.description && (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {executingSkill.description}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* 進度條 */}
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>進度</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {results.filter(r => r.status === 'success' || r.status === 'error').length} / {executingSkill.steps.length}
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${((results.filter(r => r.status === 'success' || r.status === 'error').length) / executingSkill.steps.length) * 100}%`,
                        height: '100%',
                        backgroundColor: '#7bbda4',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                </div>

                {/* 控制按鈕 */}
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  {isRunning ? (
                    <button
                      onClick={handlePause}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '13px',
                        backgroundColor: '#ff9800',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      ⏸ 暫停
                    </button>
                  ) : (
                    <button
                      onClick={isPaused ? handleContinue : () => handleExecute(executingSkill)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '13px',
                        backgroundColor: '#7bbda4',
                        color: '#1f1d1a',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      ▶ {isPaused ? '繼續' : '開始'}
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    style={{
                      padding: '8px 12px',
                      fontSize: '13px',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕ 關閉
                  </button>
                </div>
              </div>

              {/* 步驟列表 - 緊湊顯示 */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '12px 16px',
                backgroundColor: 'var(--bg-primary)',
                maxHeight: isExecutionCompleted ? '200px' : 'none',
                transition: 'max-height 0.3s ease'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: isExecutionCompleted ? '#3fb950' : '#58a6ff' }}>
                    {isExecutionCompleted ? '✅ 執行完成' : '⚙️ 執行中'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#888' }}>
                    {results.filter(r => r.status === 'success').length} / {executingSkill.steps.length}
                  </div>
                </div>

                {executingSkill.steps.map((step, index) => {
                  const result = results[index] || { status: 'pending' }
                  const isRunning = result.status === 'running'
                  const isCompleted = result.status === 'success'
                  const isError = result.status === 'error'
                  const isPending = result.status === 'pending'
                  
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
                  
                  const duration = result.duration
                    ? `${(result.duration / 1000).toFixed(1)}s`
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
                          {step.label || step.name}
                          <span style={{ 
                            marginLeft: '8px',
                            fontSize: '11px',
                            color: '#666',
                            fontWeight: 'normal'
                          }}>
                            ({statusText})
                          </span>
                        </div>
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
                </>
              )}
            </div>
          ) : (
            // 技能列表顯示
            <>
              {/* 管理按鈕 */}
              {workspaceId && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                  <button
                    onClick={handleManageSkills}
                    style={{
                      width: '100%',
                      padding: '8px',
                      fontSize: '13px',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    ⚙️ 管理工作區技能
                  </button>
                </div>
              )}

              {/* 技能列表 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {!workspaceId ? (
                  <div
                    style={{
                      padding: '32px 16px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '13px'
                    }}
                  >
                    請先選擇一個工作區
                  </div>
                ) : linkedSkills.length === 0 ? (
                  <div
                    style={{
                      padding: '32px 16px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '13px'
                    }}
                  >
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎯</div>
                    <p>此工作區尚未關聯技能</p>
                    <button
                      onClick={handleManageSkills}
                      style={{
                        marginTop: '12px',
                        padding: '8px 16px',
                        fontSize: '13px',
                        backgroundColor: '#7bbda4',
                        color: '#1f1d1a',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      添加技能
                    </button>
                  </div>
                ) : (
                  linkedSkills.map(skill => {
                    const category = DEFAULT_CATEGORIES.find(c => c.id === skill.category)
                    const isSelected = selectedSkill?.id === skill.id
                    
                    return (
                      <div
                        key={skill.id}
                        style={{
                          marginBottom: '8px',
                          padding: '12px',
                          backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                          border: `1px solid ${isSelected ? '#7bbda4' : 'var(--border-color)'}`,
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedSkill(isSelected ? null : skill)}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            marginBottom: '8px'
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                marginBottom: '4px'
                              }}
                            >
                              <span style={{ fontSize: '20px' }}>{skill.icon || category?.icon || '📦'}</span>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: '13px',
                                  color: 'var(--text-primary)'
                                }}
                              >
                                {skill.name}
                              </div>
                            </div>
                            {skill.description && (
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: 'var(--text-secondary)',
                                  lineHeight: '1.4',
                                  marginBottom: '8px'
                                }}
                              >
                                {skill.description}
                              </div>
                            )}
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-secondary)'
                              }}
                            >
                              {isAIAgentSkill(skill) ? 'AI Agent' : `${skill.steps.length} 個步驟`}
                            </div>
                          </div>
                        </div>

                        {/* 標籤 */}
                        {skill.tags && skill.tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                            {skill.tags.map(tag => (
                              <span
                                key={tag}
                                style={{
                                  padding: '2px 6px',
                                  fontSize: '10px',
                                  backgroundColor: 'var(--bg-tertiary)',
                                  color: 'var(--text-secondary)',
                                  borderRadius: '8px'
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* 展開顯示步驟或 Agent 配置 */}
                        {isSelected && (
                          <div
                            style={{
                              marginTop: '12px',
                              padding: '8px',
                              backgroundColor: 'var(--bg-secondary)',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)'
                            }}
                          >
                            {isAIAgentSkill(skill) ? (
                              // AI Agent 配置預覽
                              <>
                                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                                  Agent 配置：
                                </div>
                                <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>角色：</span>
                                  <span style={{ color: 'var(--text-primary)' }}>{skill.prompt.role}</span>
                                </div>
                                {skill.prompt.expertise && skill.prompt.expertise.length > 0 && (
                                  <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>專業：</span>
                                    <span style={{ color: 'var(--text-primary)' }}>{skill.prompt.expertise.join(', ')}</span>
                                  </div>
                                )}
                                <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>可用工具：</span>
                                  <span style={{ color: 'var(--text-primary)' }}>
                                    {[
                                      skill.allowedTools.terminal && '終端',
                                      skill.allowedTools.fileSystem && '文件系統',
                                      skill.allowedTools.database && '資料庫',
                                      skill.allowedTools.api && 'API',
                                      skill.allowedTools.knowledgeBase && '知識庫'
                                    ].filter(Boolean).join(', ')}
                                  </span>
                                </div>
                              </>
                            ) : (
                              // 自動化技能步驟列表
                              <>
                                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                                  執行流程：
                                </div>
                                {skill.steps.map((step, index) => (
                                  <div
                                    key={step.id}
                                    style={{
                                      fontSize: '11px',
                                      padding: '4px 8px',
                                      marginBottom: '4px',
                                      backgroundColor: 'var(--bg-primary)',
                                      borderRadius: '3px',
                                      display: 'flex',
                                      gap: '8px'
                                    }}
                                  >
                                    <span style={{ color: 'var(--text-secondary)' }}>{index + 1}.</span>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{step.name}</div>
                                      {step.description && (
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>{step.description}</div>
                                      )}
                                      <div style={{ color: 'var(--text-secondary)', fontSize: '10px', marginTop: '2px' }}>
                                        類型: {getStepTypeLabel(step.type)}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        )}

                        {/* 執行按鈕 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleExecute(skill)
                          }}
                          style={{
                            width: '100%',
                            marginTop: '8px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            backgroundColor: '#7bbda4',
                            color: '#1f1d1a',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          ▶ 執行技能
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>

    {/* 技能選擇器對話框 */}
    {showSkillSelector && (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => setShowSkillSelector(false)}
      >
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 標題 */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
              選擇技能
            </h3>
            <button
              onClick={() => setShowSkillSelector(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '24px',
                padding: '0',
                lineHeight: 1
              }}
            >
              ×
            </button>
          </div>

          {/* 技能列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {allSkills.length === 0 ? (
              <div
                style={{
                  padding: '32px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)'
                }}
              >
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📚</div>
                <p>沒有可用的技能</p>
                <p style={{ fontSize: '12px' }}>請先到技能庫創建技能</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {allSkills.map(skill => {
                  const category = DEFAULT_CATEGORIES.find(c => c.id === skill.category)
                  const isLinked = linkedSkillIds.includes(skill.id)
                  
                  return (
                    <div
                      key={skill.id}
                      style={{
                        padding: '12px',
                        backgroundColor: isLinked ? 'rgba(123, 189, 164, 0.1)' : 'var(--bg-secondary)',
                        border: `1px solid ${isLinked ? '#7bbda4' : 'var(--border-color)'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => handleToggleSkillLink(skill.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            border: `2px solid ${isLinked ? '#7bbda4' : 'var(--border-color)'}`,
                            backgroundColor: isLinked ? '#7bbda4' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          {isLinked && (
                            <span style={{ color: '#1f1d1a', fontSize: '14px', fontWeight: 'bold' }}>✓</span>
                          )}
                        </div>
                        <span style={{ fontSize: '20px', flexShrink: 0 }}>
                          {skill.icon || category?.icon || '📦'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                            {skill.name}
                          </div>
                          {skill.description && (
                            <div
                              style={{
                                fontSize: '12px',
                                color: 'var(--text-secondary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {skill.description}
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            {isAIAgentSkill(skill) ? 'AI Agent' : `${skill.steps.length} 個步驟`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 底部按鈕 */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px'
            }}
          >
            <button
              onClick={() => setShowSkillSelector(false)}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                backgroundColor: '#7bbda4',
                color: '#1f1d1a',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              完成
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Task Input Dialog for AI Agent */}
    {showTaskInput && pendingAgentSkill && (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}
        onClick={() => {
          setShowTaskInput(false)
          setPendingAgentSkill(null)
          setTaskInput('')
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            padding: '24px',
            borderRadius: '8px',
            width: '500px',
            maxWidth: '90%',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>
            🤖 {pendingAgentSkill.name}
          </h3>
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            請描述您想讓 AI Agent 執行的任務（留空將使用預設任務）：
          </p>
          <textarea
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder={pendingAgentSkill?.prompt?.instructions || '例如：\n- 檢查系統狀態\n- 分析最近的錯誤日誌\n- 診斷為什麼應用無法啟動'}
            style={{
              width: '100%',
              height: '120px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '13px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setShowTaskInput(false)
                setPendingAgentSkill(null)
                setTaskInput('')
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              取消
            </button>
            <button
              onClick={handleConfirmExecuteAgent}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--accent-color)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              執行
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function getStepTypeLabel(type: SkillStep['type']): string {
  const labels = {
    terminal: '終端機',
    api: 'API',
    db: '資料庫',
    web: '網頁',
    file: '檔案'
  }
  return labels[type] || type
}
