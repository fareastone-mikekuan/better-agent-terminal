/**
 * 新版技能執行器 - 執行技能中定義的步驟
 */
import { useState } from 'react'
import type { Skill, SkillStep } from '../types/skill'
import { createPanelForStep } from '../services/workflow-panel-service'

interface NewSkillExecutorProps {
  workspaceId: string
  workspaceName: string
  skill: Skill
  onClose: () => void
}

interface StepResult {
  stepIndex: number
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
  message?: string
  duration?: number
}

export function NewSkillExecutor({
  workspaceId,
  workspaceName,
  skill,
  onClose
}: Readonly<NewSkillExecutorProps>) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [results, setResults] = useState<StepResult[]>(
    skill.steps.map((_, i) => ({ stepIndex: i, status: 'pending' }))
  )

  const updateStepResult = (index: number, update: Partial<StepResult>) => {
    setResults(prev => {
      const newResults = [...prev]
      newResults[index] = { ...newResults[index], ...update }
      return newResults
    })
  }

  const executeStep = async (step: SkillStep, index: number): Promise<boolean> => {
    const startTime = Date.now()
    updateStepResult(index, { status: 'running' })
    
    try {
      // 轉換技能步驟配置為面板服務所需的格式
      const config: any = {}
      
      if (step.type === 'terminal') {
        config.command = step.config.command
      } else if (step.type === 'api') {
        config.method = step.config.method
        config.url = step.config.url
        config.headers = step.config.headers
        config.body = step.config.body
      } else if (step.type === 'db') {
        config.query = step.config.query
        config.connection = step.config.connection
      } else if (step.type === 'web') {
        config.url = step.config.webUrl
      } else if (step.type === 'file') {
        config.action = step.config.action
        config.path = step.config.path
        config.content = step.config.content
      }
      
      const panelId = await createPanelForStep(workspaceId, step as any, index)
      
      if (!panelId) {
        throw new Error(`無法創建 ${step.type} 面板`)
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

  const handleStart = async () => {
    setIsRunning(true)
    setIsPaused(false)
    
    for (let i = currentStep; i < skill.steps.length; i++) {
      if (isPaused) break
      
      setCurrentStep(i)
      const success = await executeStep(skill.steps[i], i)
      
      if (!success) {
        const continueOnError = confirm('步驟執行失敗，是否繼續執行下一步？')
        if (!continueOnError) {
          break
        }
      }
      
      // 等待一小段時間
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    
    setIsRunning(false)
    if (currentStep >= skill.steps.length - 1) {
      alert(`技能「${skill.name}」執行完成！`)
    }
  }

  const handlePause = () => {
    setIsPaused(true)
    setIsRunning(false)
  }

  const handleReset = () => {
    setCurrentStep(0)
    setIsRunning(false)
    setIsPaused(false)
    setResults(skill.steps.map((_, i) => ({ stepIndex: i, status: 'pending' })))
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 1002,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '700px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          backgroundColor: 'var(--bg-primary)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 標題 */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)'
          }}
        >
          <h3 style={{ margin: 0, marginBottom: '4px' }}>
            {skill.icon} {skill.name}
          </h3>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            工作區: {workspaceName}
          </div>
        </div>

        {/* 進度 */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-tertiary)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px' }}>
              進度: {results.filter(r => r.status === 'success').length} / {skill.steps.length}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {isRunning ? '執行中...' : isPaused ? '已暫停' : currentStep >= skill.steps.length ? '已完成' : '待執行'}
            </span>
          </div>
          <div
            style={{
              height: '8px',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(results.filter(r => r.status === 'success').length / skill.steps.length) * 100}%`,
                backgroundColor: '#7bbda4',
                transition: 'width 0.3s'
              }}
            />
          </div>
        </div>

        {/* 步驟列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {skill.steps.map((step, index) => {
            const result = results[index]
            const statusColors = {
              pending: 'var(--text-secondary)',
              running: '#3b82f6',
              success: '#10b981',
              error: '#ef4444',
              skipped: '#6b7280'
            }
            const statusIcons = {
              pending: '○',
              running: '⏳',
              success: '✓',
              error: '✗',
              skipped: '−'
            }
            
            return (
              <div
                key={step.id}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  backgroundColor: result.status === 'running' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                  border: `1px solid ${result.status === 'running' ? '#3b82f6' : 'var(--border-color)'}`,
                  borderRadius: '6px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    style={{
                      fontSize: '20px',
                      color: statusColors[result.status]
                    }}
                  >
                    {statusIcons[result.status]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>
                        {index + 1}. {step.name}
                      </div>
                      <div style={{ fontSize: '11px', color: statusColors[result.status] }}>
                        {result.status === 'pending' && '待執行'}
                        {result.status === 'running' && '執行中'}
                        {result.status === 'success' && '成功'}
                        {result.status === 'error' && '失敗'}
                        {result.status === 'skipped' && '已跳過'}
                      </div>
                    </div>
                    {step.description && (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        {step.description}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      類型: {getStepTypeLabel(step.type)}
                    </div>
                    {result.message && (
                      <div
                        style={{
                          fontSize: '11px',
                          marginTop: '8px',
                          padding: '6px 8px',
                          backgroundColor: 'var(--bg-primary)',
                          borderRadius: '3px',
                          color: result.status === 'error' ? '#ef4444' : 'var(--text-secondary)'
                        }}
                      >
                        {result.message}
                      </div>
                    )}
                    {result.duration && (
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        耗時: {result.duration}ms
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 控制按鈕 */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            gap: '8px',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            {!isRunning && currentStep < skill.steps.length && (
              <button
                onClick={handleStart}
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
                {currentStep === 0 ? '▶ 開始執行' : '▶ 繼續執行'}
              </button>
            )}
            {isRunning && (
              <button
                onClick={handlePause}
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
                ⏸ 暫停
              </button>
            )}
            {(currentStep > 0 || results.some(r => r.status !== 'pending')) && (
              <button
                onClick={handleReset}
                disabled={isRunning}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  opacity: isRunning ? 0.5 : 1
                }}
              >
                🔄 重置
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            關閉
          </button>
        </div>
      </div>
    </div>
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
