import type { AIStepReporter, KnowledgeSelectionMode } from '../types/ai-analysis'

type KnowledgeEntry = {
  name?: string
  category?: string
  tags?: string
  content?: string
  index?: {
    summary?: string
    keywords?: unknown[]
    topics?: unknown[]
    businessProcesses?: unknown[]
    technicalAreas?: unknown[]
  }
}

export interface BuildKnowledgePromptOptions {
  selectionMode: KnowledgeSelectionMode
  model: string
  seedText: string
  chatTagPrefix: string
  reporter?: AIStepReporter
}

export interface BuildKnowledgePromptResult {
  mode: KnowledgeSelectionMode
  sources: string[]
  knowledgePrompt: string
  activeKnowledgeCount: number
  candidateCount: number
  selectedCount: number
}

const safeJsonParse = <T,>(value: string): T | null => {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const trimText = (value: string, maxLen: number) => {
  const t = String(value || '').trim()
  if (t.length <= maxLen) return t
  return t.slice(0, maxLen) + '…'
}

const extractKeywords = (question: string) => {
  const stopWords = ['如何', '怎麼', '什麼', '為什麼', '是', '的', '嗎', '呢', '吧', '啊', '了', '我', '你', '他', '要', '能', '會', '有', '在', '到']
  return question
    .split(/[\s,，、。！？;；:：()\[\]{}<>\n\r\t]+/)
    .map(w => w.trim())
    .filter(word => word.length >= 2 && !stopWords.includes(word))
    .slice(0, 40)
}

const scoreKnowledgeEntry = (k: KnowledgeEntry, terms: string[]) => {
  const name = String(k?.name || '').toLowerCase()
  const tags = (typeof k?.tags === 'string' ? k.tags : '').toLowerCase()
  const idx = k?.index
  const indexedBonus = idx ? 6 : 0
  const idxSummary = String(idx?.summary || '').toLowerCase()
  const idxKeywords = Array.isArray(idx?.keywords) ? idx.keywords.map((x: any) => String(x).toLowerCase()) : []
  const idxTopics = Array.isArray(idx?.topics) ? idx.topics.map((x: any) => String(x).toLowerCase()) : []
  const idxBiz = Array.isArray(idx?.businessProcesses) ? idx.businessProcesses.map((x: any) => String(x).toLowerCase()) : []
  const idxTech = Array.isArray(idx?.technicalAreas) ? idx.technicalAreas.map((x: any) => String(x).toLowerCase()) : []

  const haystack = [name, tags, idxSummary, ...idxKeywords, ...idxTopics, ...idxBiz, ...idxTech].join(' | ')
  let score = indexedBonus
  for (const rawTerm of terms) {
    const term = String(rawTerm || '').trim().toLowerCase()
    if (term.length < 2) continue
    if (name.includes(term)) score += 14
    if (tags && tags.includes(term)) score += 10
    if (idxKeywords.includes(term)) score += 12
    if (idxTopics.includes(term)) score += 8
    if (idxBiz.some((x: string) => x.includes(term))) score += 8
    if (idxTech.some((x: string) => x.includes(term))) score += 8
    if (haystack.includes(term)) score += 2
  }
  return score
}

const buildKnowledgeDescriptor = (k: KnowledgeEntry) => {
  const idx = k?.index
  const isIndexed = !!idx
  const summary = isIndexed ? trimText(String(idx?.summary || ''), 220) : ''
  const keywords = isIndexed && Array.isArray(idx?.keywords) ? idx.keywords.slice(0, 12).map((x: any) => String(x)) : []
  const topics = isIndexed && Array.isArray(idx?.topics) ? idx.topics.slice(0, 8).map((x: any) => String(x)) : []
  const businessProcesses = isIndexed && Array.isArray(idx?.businessProcesses) ? idx.businessProcesses.slice(0, 8).map((x: any) => String(x)) : []
  const technicalAreas = isIndexed && Array.isArray(idx?.technicalAreas) ? idx.technicalAreas.slice(0, 8).map((x: any) => String(x)) : []
  return {
    name: String(k?.name || ''),
    category: String(k?.category || ''),
    tags: typeof k?.tags === 'string' ? k.tags : '',
    isIndexed,
    summary,
    keywords,
    topics,
    businessProcesses,
    technicalAreas
  }
}

const buildCandidateListPrompt = (descriptors: ReturnType<typeof buildKnowledgeDescriptor>[]) => {
  return descriptors
    .map((d, i) => {
      const idxFlag = d.isIndexed ? '[已索引]' : '[未索引]'
      const tags = d.tags ? `\n   標籤: ${d.tags}` : ''
      const indexBlock = d.isIndexed
        ? `\n   摘要: ${d.summary}\n   keywords: ${d.keywords.join(', ')}\n   topics: ${d.topics.join(', ')}\n   business: ${d.businessProcesses.join(', ')}\n   tech: ${d.technicalAreas.join(', ')}`
        : ''
      return `${i + 1}. **${d.name}** [${d.category}] ${idxFlag}${tags}${indexBlock}`
    })
    .join('\n\n---\n\n')
}

const parseSelectedCandidateIndexes = (content: string) => {
  const text = String(content || '')
  if (!text) return []
  if (text.includes('無') || text.includes('没有')) return []
  const matches = text.match(/\d+/g)
  if (!matches) return []
  return matches.map(n => parseInt(n, 10) - 1).filter(n => Number.isFinite(n))
}

const diffSources = (before: string[], after: string[]) => {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  const added = after.filter(x => x && !beforeSet.has(x))
  const removed = before.filter(x => x && !afterSet.has(x))
  return { added, removed }
}

export async function buildKnowledgePromptForInput(options: BuildKnowledgePromptOptions): Promise<BuildKnowledgePromptResult> {
  const { selectionMode, model, seedText, chatTagPrefix, reporter } = options
  const isDeepMode = selectionMode === 'ai-deep' || selectionMode === 'ai-ultra'
  const isUltra = selectionMode === 'ai-ultra'

  const { knowledgeStore } = await import('../stores/knowledge-store')
  const activeKnowledge = knowledgeStore.getActiveKnowledge() as unknown as KnowledgeEntry[]

  reporter?.('select', {
    status: 'running',
    detail: activeKnowledge.length > 0 ? `知識庫共 ${activeKnowledge.length} 個，挑選中...` : '未啟用知識庫',
    stats: { activeKnowledgeCount: activeKnowledge.length }
  })

  let selectedKnowledge: KnowledgeEntry[] = []
  let candidateCount = 0

  if (activeKnowledge.length === 0) {
    reporter?.('select', { status: 'completed', detail: '未啟用知識庫' })
  } else if (selectionMode === 'keyword') {
    const { smartSelect } = await import('../types/skill-selector')
    const result = smartSelect(seedText, [], activeKnowledge as any)
    selectedKnowledge = (result.selectedKnowledge || []).slice(0, 5)
    reporter?.('select', { status: 'completed', detail: `關鍵詞挑選：${selectedKnowledge.length} 個` })
  } else {
    let combinedTerms = extractKeywords(seedText)

    if (isDeepMode) {
      try {
        const expandRes = await window.electronAPI.copilot.chat(`${chatTagPrefix}-knowledge-expand`, {
          messages: [
            {
              role: 'system',
              content: '你是查詢擴寫助手。請把輸入的內容擴寫成多條可用於檢索的查詢。只輸出 JSON：{"queries":["..."],"keywords":["..."]}，不要 markdown。'
            },
            { role: 'user', content: `內容：\n${trimText(seedText, 1200)}` }
          ],
          model
        })

        const raw = String(expandRes?.content || '').trim()
        const parsed = safeJsonParse<{ queries?: string[]; keywords?: string[] }>(raw)
        const extra = [
          ...(Array.isArray(parsed?.queries) ? parsed!.queries : []),
          ...(Array.isArray(parsed?.keywords) ? parsed!.keywords : [])
        ]
          .map(s => String(s).trim())
          .filter(Boolean)
          .slice(0, 40)

        combinedTerms = Array.from(new Set([...combinedTerms, ...extra]))
      } catch {
        // ignore
      }
    }

    const scored = (activeKnowledge as KnowledgeEntry[])
      .map((k: KnowledgeEntry) => ({ k, score: scoreKnowledgeEntry(k, combinedTerms) }))
      .sort((a, b) => b.score - a.score)

    const MAX_CANDIDATES = selectionMode === 'ai-ultra'
      ? Math.min(40, Math.max(14, Math.floor(activeKnowledge.length * 0.25)))
      : selectionMode === 'ai-deep'
        ? Math.min(24, Math.max(10, Math.floor(activeKnowledge.length * 0.15)))
        : Math.min(18, Math.max(8, Math.floor(activeKnowledge.length * 0.12)))

    const candidates = scored
      .filter(x => x.score > 0 || (x.k as any)?.index)
      .slice(0, MAX_CANDIDATES)

    candidateCount = candidates.length

    reporter?.('select', {
      status: 'running',
      detail: `候選計算完成：${candidateCount} 個`,
      stats: {
        activeKnowledgeCount: activeKnowledge.length,
        candidateCount
      }
    })

    if (candidates.length === 0) {
      reporter?.('select', { status: 'completed', detail: '無候選知識庫（跳過）' })
    } else {
      const descriptors = candidates.map(c => buildKnowledgeDescriptor(c.k))
      const candidateListPrompt = buildCandidateListPrompt(descriptors)

      const pickMax = selectionMode === 'ai-ultra' ? 8 : (selectionMode === 'ai-deep' ? 5 : 4)
      const selectionSystemPrompt = `你是知識庫選擇助手。\n\n請從候選清單中選出最相關的文件（1-${pickMax} 個），寧缺毋濫。\n\n輸出格式：只回答候選清單的編號，用逗號分隔，例如：3,7,11。若完全無相關，回答：無。`

      let pickedIndexes: number[] = []
      try {
        const selRes = await window.electronAPI.copilot.chat(`${chatTagPrefix}-knowledge-select`, {
          messages: [
            { role: 'system', content: selectionSystemPrompt },
            {
              role: 'user',
              content: `內容：\n${trimText(seedText, 1200)}\n\n候選清單（共 ${descriptors.length}）：\n\n${candidateListPrompt}`
            }
          ],
          model
        })

        pickedIndexes = parseSelectedCandidateIndexes(String(selRes?.content || ''))
      } catch {
        pickedIndexes = []
      }

      const picked = pickedIndexes
        .filter(i => i >= 0 && i < candidates.length)
        .map(i => candidates[i].k)

      if (picked.length > 0) {
        selectedKnowledge = picked
        reporter?.('select', { status: 'completed', detail: `候選 ${candidates.length} → 選中 ${selectedKnowledge.length} 個` })
      } else {
        const fallbackCount = Math.min(selectionMode === 'ai-ultra' ? 2 : 1, candidates.length)
        selectedKnowledge = candidates.slice(0, fallbackCount).map(x => x.k)
        reporter?.('select', { status: 'completed', detail: `無結果，保底 ${selectedKnowledge.length} 個` })
      }

      reporter?.('select', {
        status: 'completed',
        stats: {
          activeKnowledgeCount: activeKnowledge.length,
          candidateCount,
          selectedCount: selectedKnowledge.length
        }
      })

      if (isUltra && candidates.length > 0) {
        reporter?.('validate', { status: 'running', detail: '二次驗證（重新檢查相關性）' })

        try {
          const validateSystemPrompt = `你是嚴格的知識庫驗證助手。\n\n你會拿到：使用者內容、候選清單、以及「第一次選出的文件」。\n請你重新檢查第一次選擇是否真的能支援回答；若不夠相關或缺漏，請改選更合適的文件。\n\n輸出格式：只回答候選清單編號（逗號分隔），或回答：無。不要解釋。`

          const firstPickNames = selectedKnowledge.map(k => String(k?.name || '')).filter(Boolean).join('、')
          const beforeSources = selectedKnowledge.map(k => String(k?.name || '')).filter(Boolean)

          const valRes = await window.electronAPI.copilot.chat(`${chatTagPrefix}-knowledge-validate`, {
            messages: [
              { role: 'system', content: validateSystemPrompt },
              {
                role: 'user',
                content: `內容：\n${trimText(seedText, 1200)}\n\n第一次選擇：${firstPickNames || '（無）'}\n\n候選清單（共 ${descriptors.length}）：\n\n${candidateListPrompt}`
              }
            ],
            model
          })

          const rePickedIdx = parseSelectedCandidateIndexes(String(valRes?.content || ''))
          const rePicked = rePickedIdx
            .filter(i => i >= 0 && i < candidates.length)
            .map(i => candidates[i].k)

          if (rePicked.length > 0) {
            const afterSources = rePicked.map(k => String(k?.name || '')).filter(Boolean)
            const { added, removed } = diffSources(beforeSources, afterSources)
            selectedKnowledge = rePicked
            reporter?.('validate', {
              status: 'completed',
              detail: (added.length > 0 || removed.length > 0)
                ? `驗證完成：${beforeSources.length} → ${afterSources.length}（+${added.length}/-${removed.length}）`
                : `驗證完成：維持 ${afterSources.length} 個`,
              stats: {
                candidateCount,
                beforeSelectedCount: beforeSources.length,
                selectedCount: afterSources.length
              },
              diff: {
                addedSources: added.slice(0, 6),
                removedSources: removed.slice(0, 6)
              }
            })
          } else {
            reporter?.('validate', {
              status: 'completed',
              detail: `驗證完成：維持 ${beforeSources.length} 個`,
              stats: {
                candidateCount,
                beforeSelectedCount: beforeSources.length,
                selectedCount: beforeSources.length
              }
            })
          }
        } catch {
          reporter?.('validate', { status: 'error', detail: '驗證失敗（維持第一次選擇）' })
        }
      }
    }
  }

  const sources = selectedKnowledge.map(k => String(k?.name || '')).filter(Boolean)

  let knowledgePrompt = ''
  if (selectedKnowledge.length > 0) {
    const { getModelKnowledgeLimit } = await import('../types/knowledge-base')
    const modelLimits = getModelKnowledgeLimit(model)
    const MAX_KNOWLEDGE_LENGTH = Math.min(modelLimits.maxTotal, 40000)
    const MAX_SINGLE_ENTRY = modelLimits.maxSingle
    let totalLength = 0
    const includedKnowledge: Array<{ name: string; content: string; truncated: boolean }> = []

    for (const k of selectedKnowledge) {
      let entryContent = String(k?.content || '')
      let truncated = false
      if (entryContent.length > MAX_SINGLE_ENTRY) {
        entryContent = entryContent.substring(0, MAX_SINGLE_ENTRY)
        truncated = true
      }
      const entryText = `【${k.name}】\n${entryContent}`
      if (totalLength + entryText.length < MAX_KNOWLEDGE_LENGTH) {
        includedKnowledge.push({ name: String(k.name), content: entryContent, truncated })
        totalLength += entryText.length
      } else {
        break
      }
    }

    if (includedKnowledge.length > 0) {
      knowledgePrompt = `\n\n## 📚 參考知識庫（${includedKnowledge.length} 個）\n\n` +
        includedKnowledge
          .map(item => {
            const truncNote = item.truncated ? `\n(註：內容過長，已截取前 ${item.content.length.toLocaleString()} 字元)\n` : ''
            return `### 【${item.name}】${truncNote}\n${item.content}`
          })
          .join('\n\n---\n\n')
    }
  }

  return {
    mode: selectionMode,
    sources,
    knowledgePrompt,
    activeKnowledgeCount: activeKnowledge.length,
    candidateCount,
    selectedCount: sources.length
  }
}
