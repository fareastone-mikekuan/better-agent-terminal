import type { AIAnalysisStep } from '../types/ai-analysis'

const trimInline = (value: string, maxLen: number) => {
  const t = String(value || '').trim()
  if (t.length <= maxLen) return t
  return t.slice(0, maxLen) + '…'
}

const formatStatsLine = (s: AIAnalysisStep) => {
  const st = s.stats
  if (!st) return ''

  // Prefer validate-style summary when beforeSelectedCount exists
  if (typeof st.beforeSelectedCount === 'number' && typeof st.selectedCount === 'number') {
    const cand = typeof st.candidateCount === 'number' ? ` / 候選 ${st.candidateCount}` : ''
    return `📌 驗證：${st.beforeSelectedCount} → ${st.selectedCount}${cand}`
  }

  const parts: string[] = []
  if (typeof st.activeKnowledgeCount === 'number') parts.push(`知識庫 ${st.activeKnowledgeCount}`)
  if (typeof st.candidateCount === 'number') parts.push(`候選 ${st.candidateCount}`)
  if (typeof st.selectedCount === 'number') parts.push(`選中 ${st.selectedCount}`)
  if (parts.length === 0) return ''
  return `📌 ${parts.join(' / ')}`
}

const formatDiffLine = (s: AIAnalysisStep) => {
  const d = s.diff
  if (!d) return ''
  const added = Array.isArray(d.addedSources) ? d.addedSources.filter(Boolean) : []
  const removed = Array.isArray(d.removedSources) ? d.removedSources.filter(Boolean) : []
  if (added.length === 0 && removed.length === 0) return ''

  const parts: string[] = []
  if (added.length > 0) parts.push(`新增：${added.join('、')}`)
  if (removed.length > 0) parts.push(`移除：${removed.join('、')}`)
  return trimInline(`🔁 ${parts.join('；')}`, 140)
}

export function AIAnalysisStepsView({
  steps,
  title = '🧭 處理步驟',
  compact = false
}: {
  steps: AIAnalysisStep[]
  title?: string
  compact?: boolean
}) {
  if (!steps || steps.length === 0) return null

  return (
    <div
      style={{
        fontSize: '11px',
        color: '#e2e8f0',
        backgroundColor: compact ? 'rgba(15, 23, 42, 0.55)' : 'rgba(0, 0, 0, 0.25)',
        padding: compact ? '8px' : '8px',
        borderRadius: '6px',
        marginBottom: compact ? '10px' : '8px',
        border: compact ? '1px solid rgba(51, 65, 85, 0.8)' : undefined
      }}
    >
      <div style={{ color: '#93c5fd', fontWeight: 700, marginBottom: '6px' }}>{title}</div>
      {steps.map((s) => {
        const durationMs = s.startTime && s.endTime ? (s.endTime - s.startTime) : 0
        const duration = durationMs > 0 ? `${(durationMs / 1000).toFixed(1)}s` : ''
        const icon = s.status === 'completed' ? '✅' : s.status === 'running' ? '⏳' : s.status === 'error' ? '❌' : '▫️'
        const statsLine = formatStatsLine(s)
        const diffLine = formatDiffLine(s)
        return (
          <div
            key={s.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              padding: '6px 0',
              borderTop: '1px solid rgba(148, 163, 184, 0.12)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span>{icon}</span>
                <span
                  style={{
                    color: '#e2e8f0',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {s.label}
                </span>
              </div>
              {duration && <span style={{ color: '#94a3b8' }}>{duration}</span>}
            </div>
            {statsLine && <div style={{ color: '#94a3b8' }}>{statsLine}</div>}
            {diffLine && <div style={{ color: '#94a3b8' }}>{diffLine}</div>}
            {s.detail && <div style={{ color: '#94a3b8' }}>{s.detail}</div>}
          </div>
        )
      })}
    </div>
  )
}
