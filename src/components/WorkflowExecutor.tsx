import { useState } from 'react'
import type { SkillWorkflowStep } from '../types'
import { createPanelForStep } from '../services/workflow-panel-service'

interface WorkflowExecutorProps {
  workspaceId: string
  workspaceName: string
  steps: SkillWorkflowStep[]
  onClose: () => void
}

interface StepResult {
  stepIndex: number
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
  message?: string
  duration?: number
}

export function WorkflowExecutor({
  workspaceId,
  workspaceName,
  steps,
  onClose
}: Readonly<WorkflowExecutorProps>) {
  console.log('[WorkflowExecutor] 渲染開始')
  console.log('[WorkflowExecutor] 步驟數:', steps.length)
  console.log('[WorkflowExecutor] 工作區:', workspaceName)
  console.log('[WorkflowExecutor] 步驟詳情:', JSON.stringify(steps, null, 2))
  
  const [currentStep, setCurrentStep] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [results, setResults] = useState<StepResult[]>(
    steps.map((_, i) => ({ stepIndex: i, status: 'pending' }))
  )

  // 檢查是否有步驟
  if (steps.length === 0) {
    console.warn('[WorkflowExecutor] 步驟數為 0，顯示錯誤提示')
    return (
      <div className="dialog-overlay" onClick={onClose}>
        <div
          className="workflow-executor-dialog"
          onClick={e => e.stopPropagation()}
          style={{
            backgroundColor: '#1f1d1a',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #3a3836',
            width: '500px',
            maxWidth: '90vw'
          }}
        >
          <h3 style={{ marginBottom: '16px', color: '#cb6077' }}>❌ 找不到工作流程</h3>
          <p style={{ color: '#888', marginBottom: '16px' }}>
            skill.md 中沒有定義 Workflow 步驟。
          </p>
          <p style={{ color: '#888', fontSize: '12px', marginBottom: '16px' }}>
            請在 skill.md 中添加 ## Workflow 區塊，例如：<br/><br/>
            ## Workflow<br/><br/>
            1. [TERMINAL] echo "Hello" - 測試命令<br/>
            2. [API] GET https://httpbin.org/get - 測試 API<br/>
          </p>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#7bbda4',
              color: '#1f1d1a',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            關閉
          </button>
        </div>
      </div>
    )
  }

  const updateStepResult = (index: number, update: Partial<StepResult>) => {
    setResults(prev => {
      const newResults = [...prev]
      newResults[index] = { ...newResults[index], ...update }
      return newResults
    })
  }

  const executeStep = async (step: SkillWorkflowStep, index: number): Promise<boolean> => {
    const startTime = Date.now()
    updateStepResult(index, { status: 'running' })
    
    try {
      // 對於需要面板的步驟類型，先創建面板
      if (['terminal', 'api', 'db', 'web', 'file'].includes(step.type)) {
        const panelId = await createPanelForStep(workspaceId, step, index)
        
        if (!panelId) {
          updateStepResult(index, {
            status: 'error',
            message: '無法創建面板',
            duration: Date.now() - startTime
          })
          return false
        }
        
        // 等待面板創建和初始化
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      switch (step.type) {
        case 'terminal':
          if (step.command) {
            // 命令已在面板創建時執行
            updateStepResult(index, {
              status: 'success',
              message: `✅ 已在終端面板執行: ${step.command}`,
              duration: Date.now() - startTime
            })
          }
          break
          
        case 'api':
          if (step.apiMethod && step.apiUrl) {
            // API 請求已在 API Tester 面板中執行
            updateStepResult(index, {
              status: 'success',
              message: `✅ 已在 API Tester 面板執行: ${step.apiMethod} ${step.apiUrl}`,
              duration: Date.now() - startTime
            })
          }
          break
          
        case 'db':
          if (step.dbQuery) {
            // 資料庫查詢已在 Oracle 面板中執行
            updateStepResult(index, {
              status: 'success',
              message: `✅ 已在 Oracle 面板執行查詢`,
              duration: Date.now() - startTime
            })
          }
          break
          
        case 'web':
          if (step.webUrl) {
            // 網頁已在 WebView 面板中開啟
            updateStepResult(index, {
              status: 'success',
              message: `✅ 已在 WebView 面板開啟: ${step.webUrl}`,
              duration: Date.now() - startTime
            })
          }
          break
          
        case 'file':
          if (step.fileAction && step.filePath) {
            // 檔案操作已在 File Explorer 面板中執行
            updateStepResult(index, {
              status: 'success',
              message: `✅ 已在 File Explorer 面板執行: ${step.fileAction} ${step.filePath}`,
              duration: Date.now() - startTime
            })
          }
          break
          
        case 'wait':
          if (step.waitCondition && step.waitTarget) {
            const result = await window.electronAPI.skill.waitForCondition({
              condition: step.waitCondition,
              target: step.waitTarget,
              timeout: step.waitTimeout || 300
            })
            
            if (result.success) {
              updateStepResult(index, {
                status: 'success',
                message: `等待條件已滿足: ${step.waitCondition}`,
                duration: Date.now() - startTime
              })
            } else {
              updateStepResult(index, {
                status: 'error',
                message: result.error || '等待超時',
                duration: Date.now() - startTime
              })
              return false
            }
          }
          break
      }
      
      return true
    } catch (error) {
      updateStepResult(index, {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      })
      return false
    }
  }

  const startWorkflow = async () => {
    setIsRunning(true)
    setIsPaused(false)
    
    for (let i = currentStep; i < steps.length; i++) {
      if (isPaused) {
        setCurrentStep(i)
        break
      }
      
      setCurrentStep(i)
      const success = await executeStep(steps[i], i)
      
      if (!success) {
        setIsRunning(false)
        return
      }
      
      // 步驟間短暫延遲，讓用戶看到進度
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    
    setIsRunning(false)
    setCurrentStep(steps.length)
  }

  const pauseWorkflow = () => {
    setIsPaused(true)
    setIsRunning(false)
  }

  const resumeWorkflow = () => {
    startWorkflow()
  }

  const stopWorkflow = () => {
    setIsPaused(true)
    setIsRunning(false)
    
    // 標記未執行的步驟為 skipped
    for (let i = currentStep; i < steps.length; i++) {
      if (results[i].status === 'pending') {
        updateStepResult(i, { status: 'skipped', message: '已取消' })
      }
    }
  }

  const getStatusIcon = (status: StepResult['status']) => {
    switch (status) {
      case 'pending': return '⏸️'
      case 'running': return '▶️'
      case 'success': return '✅'
      case 'error': return '❌'
      case 'skipped': return '⏭️'
    }
  }

  const getStatusColor = (status: StepResult['status']) => {
    switch (status) {
      case 'pending': return '#888'
      case 'running': return '#4a9eff'
      case 'success': return '#7bbda4'
      case 'error': return '#cb6077'
      case 'skipped': return '#666'
    }
  }

  const completedSteps = results.filter(r => r.status === 'success').length
  const progress = (completedSteps / steps.length) * 100

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="workflow-executor-dialog"
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#1f1d1a',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid #3a3836',
          width: '700px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* 標題 */}
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: 0, marginBottom: '4px' }}>▶️ 工作流程執行</h3>
          <div style={{ fontSize: '13px', color: '#888' }}>{workspaceName}</div>
        </div>

        {/* 進度條 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#888',
            marginBottom: '4px'
          }}>
            <span>進度</span>
            <span>{completedSteps} / {steps.length} 步驟</span>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: '#2a2826',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: '#7bbda4',
              transition: 'width 0.3s'
            }} />
          </div>
        </div>

        {/* 步驟列表 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '16px',
          border: '1px solid #3a3836',
          borderRadius: '4px',
          padding: '12px',
          backgroundColor: '#2a2826'
        }}>
          {steps.map((step, index) => {
            const result = results[index]
            const isCurrent = index === currentStep && isRunning
            
            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  marginBottom: '8px',
                  backgroundColor: isCurrent ? '#2d4a2d' : '#1f1d1a',
                  border: `1px solid ${isCurrent ? '#7bbda4' : '#3a3836'}`,
                  borderRadius: '4px'
                }}
              >
                {/* 步驟編號和狀態 */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '40px'
                }}>
                  <div style={{
                    fontSize: '20px',
                    lineHeight: '1'
                  }}>
                    {getStatusIcon(result.status)}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#666',
                    marginTop: '4px'
                  }}>
                    #{index + 1}
                  </div>
                </div>

                {/* 步驟內容 */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: 'bold',
                    fontSize: '13px',
                    marginBottom: '4px',
                    color: getStatusColor(result.status)
                  }}>
                    {step.label}
                  </div>
                  
                  <div style={{
                    fontSize: '11px',
                    color: '#888',
                    fontFamily: 'monospace',
                    marginBottom: '4px'
                  }}>
                    [{step.type.toUpperCase()}]{step.type === 'db' && step.dbConnection && <span style={{ color: '#7bbda4' }}> [{step.dbConnection}]</span>} {
                      step.type === 'terminal' ? step.command :
                      step.type === 'api' ? `${step.apiMethod} ${step.apiUrl}${step.apiBody ? ' ' + step.apiBody : ''}` :
                      step.type === 'db' ? step.dbQuery :
                      step.type === 'web' ? step.webUrl :
                      step.type === 'file' ? `${step.fileAction} ${step.filePath}` :
                      step.type === 'wait' ? `${step.waitCondition} "${step.waitTarget}"` :
                      ''
                    }
                  </div>
                  
                  {result.message && (
                    <div style={{
                      fontSize: '11px',
                      color: result.status === 'error' ? '#cb6077' : '#888',
                      marginTop: '4px'
                    }}>
                      {result.message}
                    </div>
                  )}
                  
                  {result.duration !== undefined && (
                    <div style={{
                      fontSize: '10px',
                      color: '#666',
                      marginTop: '4px'
                    }}>
                      耗時: {(result.duration / 1000).toFixed(2)}s
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* 控制按鈕 */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isRunning}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: '#888',
              border: '1px solid #3a3836',
              borderRadius: '4px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.5 : 1
            }}
          >
            關閉
          </button>
          
          {!isRunning && currentStep < steps.length && (
            <button
              onClick={isPaused ? resumeWorkflow : startWorkflow}
              style={{
                padding: '8px 16px',
                backgroundColor: '#7bbda4',
                color: '#1f1d1a',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {isPaused ? '▶️ 繼續' : '▶️ 開始執行'}
            </button>
          )}
          
          {isRunning && (
            <>
              <button
                onClick={pauseWorkflow}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f59e0b',
                  color: '#1f1d1a',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ⏸️ 暫停
              </button>
              <button
                onClick={stopWorkflow}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#cb6077',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ⏹️ 停止
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
