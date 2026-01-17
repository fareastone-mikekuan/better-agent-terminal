import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AIAnalysisMeta, AIAnalysisStep, KnowledgeSelectionMode } from '../types/ai-analysis'
import { AIAnalysisStepsView } from './AIAnalysisStepsView'
import { buildKnowledgePromptForInput } from '../services/ai-analysis-pipeline'
import { settingsStore } from '../stores/settings-store'

export type SelectionAIMode = 'analyze' | 'draft'

export type SelectionAIRequest = {
  requestId: string
  mode: SelectionAIMode
  text: string
  url?: string
  sourceTitle?: string
  sourceType?: string
}

const trimText = (value: string, maxLen: number) => {
  const t = String(value || '').trim()
  if (t.length <= maxLen) return t
  return t.slice(0, maxLen) + '…'
}

export function SelectionAIPopup({
  request,
  onClose
}: {
  request: SelectionAIRequest | null
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const runIdRef = useRef(0)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [aiAnalysisMeta, setAiAnalysisMeta] = useState<AIAnalysisMeta | null>(null)
  const [aiAnalysisSteps, setAiAnalysisSteps] = useState<AIAnalysisStep[]>([])
  const [showAiAnalysisSteps, setShowAiAnalysisSteps] = useState(true)
  const [copyHint, setCopyHint] = useState<string | null>(null)

  const seedText = useMemo(() => {
    if (!request) return ''
    const header = [
      request.sourceTitle ? `來源：${request.sourceTitle}` : '',
      request.url ? `URL：${request.url}` : ''
    ]
      .filter(Boolean)
      .join('\n')
    return [header, request.text].filter(Boolean).join('\n\n')
  }, [request])

  const close = () => {
    setIsAnalyzing(false)
    setAiAnalysis('')
    setAiAnalysisMeta(null)
    setAiAnalysisSteps([])
    setCopyHint(null)
    onClose()
  }

  useEffect(() => {
    if (!request) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  const updateStep = (stepId: string, updates: Partial<AIAnalysisStep>) => {
    setAiAnalysisSteps(prev =>
      prev.map(s =>
        s.id === stepId
          ? {
              ...s,
              ...updates,
              ...(updates.status === 'running' && !s.startTime ? { startTime: Date.now() } : {}),
              ...(updates.status === 'completed' || updates.status === 'error' ? { endTime: Date.now() } : {})
            }
          : s
      )
    )
  }

  const run = async () => {
    if (!request) return

    const myRunId = ++runIdRef.current
    setIsAnalyzing(true)
    setAiAnalysis('')
    setAiAnalysisMeta(null)
    setCopyHint(null)

    try {
      const copilotEnabled = await window.electronAPI.copilot.isEnabled()
      if (!copilotEnabled) {
        setAiAnalysis('❌ Copilot 未啟用，無法進行 AI 分析/草擬。')
        setAiAnalysisSteps([])
        return
      }

      const copilotConfigFromStore = settingsStore.getCopilotConfig()
      const selectionMode = (copilotConfigFromStore?.knowledgeSelectionMode || 'ai') as KnowledgeSelectionMode
      const isDeepMode = selectionMode === 'ai-deep' || selectionMode === 'ai-ultra'
      const isUltraMode = selectionMode === 'ai-ultra'

      const steps: AIAnalysisStep[] = [
        { id: 'prepare', label: '🧩 準備框選內容 [本地]', status: 'pending' },
        {
          id: 'select',
          label: isDeepMode
            ? '📚 深度挑選知識庫 [AI + 本地]'
            : selectionMode === 'ai'
              ? '📚 AI 挑選知識庫 [AI]'
              : '📚 關鍵詞挑選知識庫 [本地]',
          status: 'pending'
        },
        ...(isUltraMode
          ? [{ id: 'validate', label: '🔎 二次驗證與校準 [AI]', status: 'pending' as const }]
          : []),
        {
          id: 'analyze',
          label: request.mode === 'draft' ? '✍️ 生成回覆草稿 [AI]' : '✨ 生成分析結果 [AI]',
          status: 'pending'
        }
      ]

      setAiAnalysisSteps(steps)
      setShowAiAnalysisSteps(true)

      updateStep('prepare', { status: 'running', detail: '整理框選文字與來源資訊' })

      const copilotConfig = await window.electronAPI.copilot.getConfig()
      const model = copilotConfig?.model || 'gpt-4'
      const seed = trimText(seedText, 6000)

      updateStep('prepare', { status: 'completed', detail: '完成' })

      const knowledge = await buildKnowledgePromptForInput({
        selectionMode,
        model,
        seedText: seed,
        chatTagPrefix: 'web-selection',
        reporter: (stepId, updates) => updateStep(stepId, updates)
      })

      if (myRunId !== runIdRef.current) return

      setAiAnalysisMeta({ mode: selectionMode, sources: knowledge.sources })
      const knowledgePrompt = knowledge.knowledgePrompt

      updateStep('analyze', { status: 'running', detail: `使用 ${model} 生成中...` })

      const systemPrompt = {
        role: 'system' as const,
        content: request.mode === 'draft'
          ? `You are an assistant helping draft a reply message based on selected text from Microsoft Teams (or a web page). Keep it concise, professional, and actionable. Answer in Traditional Chinese.${knowledgePrompt ? '\n\nYou may reference the following knowledge base content for more accurate drafting.' : ''}${knowledgePrompt}`
          : `You are an assistant analyzing selected text from Microsoft Teams (or a web page). Provide concise, practical insights and suggested next actions. Answer in Traditional Chinese.${knowledgePrompt ? '\n\nYou may reference the following knowledge base content for more accurate analysis.' : ''}${knowledgePrompt}`
      }

      const sourceBlock = [
        request.sourceTitle ? `來源：${request.sourceTitle}` : null,
        request.sourceType ? `類型：${request.sourceType}` : null,
        request.url ? `URL：${request.url}` : null
      ]
        .filter(Boolean)
        .join('\n')

      const userPrompt = {
        role: 'user' as const,
        content: request.mode === 'draft'
          ? `## 框選內容（請根據此內容草擬回覆）\n\n${sourceBlock ? sourceBlock + '\n\n' : ''}${trimText(request.text, 20000)}\n\n請輸出：\n1) 建議回覆（1-2 版，偏簡潔）\n2) 需要我補充的資訊（如果有）\n3) 可能的下一步（待辦）\n\n避免冗長。`
          : `## 框選內容（請分析）\n\n${sourceBlock ? sourceBlock + '\n\n' : ''}${trimText(request.text, 20000)}\n\n請輸出：\n1) 重點摘要（3-6 點）\n2) 可能的背景/脈絡（若能推測）\n3) 風險/注意事項\n4) 建議下一步（具體可執行）\n\n保持簡潔，可用條列提升可讀性。`
      }

      const response = await window.electronAPI.copilot.chat('web-selection-analysis', {
        messages: [systemPrompt, userPrompt],
        model
      })

      if (myRunId !== runIdRef.current) return

      if (response.error) {
        setAiAnalysis(`❌ Copilot 失敗: ${response.error}`)
        updateStep('analyze', { status: 'error', detail: '生成失敗' })
      } else {
        setAiAnalysis(String(response.content || ''))
        updateStep('analyze', { status: 'completed', detail: '完成' })
      }
    } catch (err) {
      console.error('[SelectionAIPopup] analysis error:', err)
      setAiAnalysis('❌ 發生錯誤，請稍後重試。')
      updateStep('analyze', { status: 'error', detail: '例外' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  useEffect(() => {
    if (!request) return
    // start a new run each time request changes
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.requestId])

  const handleCopy = async () => {
    const text = String(aiAnalysis || '').trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyHint('已複製')
      window.setTimeout(() => setCopyHint(null), 1200)
    } catch {
      setCopyHint('複製失敗')
      window.setTimeout(() => setCopyHint(null), 1200)
    }
  }

  if (!request) return null

  return createPortal(
    <div className="dialog-overlay" style={{ zIndex: 2000 }} onClick={close}>
      <div
        ref={dialogRef}
        className="selection-ai-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="dialog-header">
          <h2>{request.mode === 'draft' ? '✍️ AI 草擬回覆（框選文字）' : '🤖 AI 分析（框選文字）'}</h2>
          <span className="dialog-subtitle">
            {request.sourceTitle ? trimText(request.sourceTitle, 42) : (request.url ? trimText(request.url, 42) : '')}
          </span>
          <button className="dialog-close-btn" onClick={close} title="關閉 (Esc)" aria-label="Close">×</button>
        </div>

        <div className="dialog-content selection-ai-dialog-content">
          <div className="selection-ai-toolbar">
            <button
              className="selection-ai-btn"
              onClick={() => run()}
              disabled={isAnalyzing}
              title="重新生成"
            >
              重新生成
            </button>
            <button
              className="selection-ai-btn"
              onClick={() => setShowAiAnalysisSteps(v => !v)}
              disabled={aiAnalysisSteps.length === 0}
              title={showAiAnalysisSteps ? '隱藏處理步驟' : '顯示處理步驟'}
            >
              {showAiAnalysisSteps ? '隱藏步驟' : '顯示步驟'}
            </button>
            <button
              className="selection-ai-btn"
              onClick={handleCopy}
              disabled={!aiAnalysis.trim()}
              title="複製結果"
            >
              {copyHint ? copyHint : '複製'}
            </button>
          </div>

          <div className="selection-ai-source">
            <div className="selection-ai-source-row">
              <span className="selection-ai-label">框選內容</span>
              <span className="selection-ai-mono">{trimText(request.text, 280)}</span>
            </div>
            {request.url && (
              <div className="selection-ai-source-row">
                <span className="selection-ai-label">URL</span>
                <span className="selection-ai-mono">{trimText(request.url, 260)}</span>
              </div>
            )}
          </div>

          {isAnalyzing && (
            <div className="selection-ai-running">
              <div className="loading-spinner" />
              <span>AI 處理中...</span>
            </div>
          )}

          {showAiAnalysisSteps && <AIAnalysisStepsView steps={aiAnalysisSteps} compact />}

          {aiAnalysisMeta && (aiAnalysisMeta.mode || (aiAnalysisMeta.sources && aiAnalysisMeta.sources.length > 0)) && (
            <div className="selection-ai-meta">
              {aiAnalysisMeta.mode && (
                <div>
                  模式：<span className="selection-ai-mono">{String(aiAnalysisMeta.mode)}</span>
                </div>
              )}
              {aiAnalysisMeta.sources && aiAnalysisMeta.sources.length > 0 && (
                <div>來源：{aiAnalysisMeta.sources.join('、')}</div>
              )}
            </div>
          )}

          <div className="selection-ai-result">{aiAnalysis || '（尚無結果）'}</div>
        </div>
      </div>
    </div>,
    document.body
  )
}
