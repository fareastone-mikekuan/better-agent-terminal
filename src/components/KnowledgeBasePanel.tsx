/**
 * 知識庫管理面板
 */
import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { knowledgeStore } from '../stores/knowledge-store'
import { settingsStore } from '../stores/settings-store'
import type { KnowledgeEntry } from '../types/knowledge-base'
import { formatFileSize, getModelKnowledgeLimit } from '../types/knowledge-base'
import * as XLSX from 'xlsx'
import { unzipSync, strFromU8 } from 'fflate'

interface KnowledgeBasePanelProps {
  onClose: () => void
}

export function KnowledgeBasePanel({ onClose }: KnowledgeBasePanelProps) {
  const [activeTab, setActiveTab] = useState<'skills' | 'knowledge' | 'index'>('knowledge')
  const [entries, setEntries] = useState(knowledgeStore.getEntries())
  const [isLearning, setIsLearning] = useState(false)
  const [learningStatus, setLearningStatus] = useState<string>('')
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<'uploadedAt' | 'name' | 'size' | 'learnedAt' | 'learnedSize'>('uploadedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [availableCopilotModels, setAvailableCopilotModels] = useState<string[]>([])
  const [copilotModelsLoading, setCopilotModelsLoading] = useState(false)
  const [copilotModelsError, setCopilotModelsError] = useState<string>('')
  const [copilotConfig, setCopilotConfig] = useState(() => settingsStore.getCopilotConfig())
  const [copilotSkills, setCopilotSkills] = useState(() => settingsStore.getCopilotSkills())

  const extractVsdxToText = (arrayBuffer: ArrayBuffer, fileName: string): string => {
    const now = new Date().toLocaleString('zh-TW')

    const parseXml = (xml: string): Document | null => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const parseError = doc.getElementsByTagName('parsererror')?.[0]
      return parseError ? null : doc
    }

    const normalizePath = (p: string) => p.replace(/\\/g, '/')

    const decodeXml = (u8: Uint8Array): string => {
      // VSDX is UTF-8 XML inside a ZIP
      return strFromU8(u8)
    }

    let zipFiles: Record<string, Uint8Array>
    try {
      zipFiles = unzipSync(new Uint8Array(arrayBuffer))
    } catch {
      return `# ${fileName}\n檔案類型：Visio (.vsdx)\n提取時間：${now}\n\n⚠️ 無法解壓縮此 VSDX（可能是檔案損壞或不是標準 VSDX 格式）。`
    }

    const files: Record<string, Uint8Array> = {}
    for (const [rawPath, data] of Object.entries(zipFiles)) {
      files[normalizePath(rawPath)] = data
    }

    // Try build page name mapping: pages.xml + rels
    const pageNameByTarget = new Map<string, string>()
    const pagesXml = files['visio/pages/pages.xml']
    const pagesRelsXml = files['visio/pages/_rels/pages.xml.rels']

    if (pagesXml && pagesRelsXml) {
      const pagesDoc = parseXml(decodeXml(pagesXml))
      const relsDoc = parseXml(decodeXml(pagesRelsXml))

      if (pagesDoc && relsDoc) {
        const relTargetById = new Map<string, string>()
        const relEls = Array.from(relsDoc.getElementsByTagName('*')).filter(el => (el as Element).localName === 'Relationship') as Element[]
        for (const rel of relEls) {
          const id = rel.getAttribute('Id')
          const target = rel.getAttribute('Target')
          if (id && target) {
            // Typical target: "page1.xml" or "../pages/page1.xml" (normalize to file name)
            const base = normalizePath(target).split('/').pop() || target
            relTargetById.set(id, base)
          }
        }

        const pageEls = Array.from(pagesDoc.getElementsByTagName('*')).filter(el => (el as Element).localName === 'Page') as Element[]
        for (const page of pageEls) {
          const name = page.getAttribute('Name') || page.getAttribute('NameU') || ''
          const relId = page.getAttribute('Rel') || page.getAttribute('r:id') || page.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ''
          const targetBase = relId ? relTargetById.get(relId) : undefined
          if (name && targetBase) {
            pageNameByTarget.set(targetBase, name)
          }
        }
      }
    }

    const pagePaths = Object.keys(files)
      .filter(p => p.startsWith('visio/pages/page') && p.endsWith('.xml') && !p.includes('/_rels/'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    const extractTextLinesFromPage = (doc: Document): string[] => {
      const lines: string[] = []

      // Prefer per-shape text, so we don't lose structure
      const shapeEls = Array.from(doc.getElementsByTagName('*')).filter(el => (el as Element).localName === 'Shape') as Element[]
      if (shapeEls.length > 0) {
        for (const shape of shapeEls) {
          const textEls = Array.from(shape.getElementsByTagName('*')).filter(el => (el as Element).localName === 'Text') as Element[]
          for (const t of textEls) {
            const raw = (t.textContent || '').replace(/\s+/g, ' ').trim()
            if (raw) lines.push(raw)
          }
        }
      }

      // Fallback: any Text nodes
      if (lines.length === 0) {
        const textEls = Array.from(doc.getElementsByTagName('*')).filter(el => (el as Element).localName === 'Text') as Element[]
        for (const t of textEls) {
          const raw = (t.textContent || '').replace(/\s+/g, ' ').trim()
          if (raw) lines.push(raw)
        }
      }

      // Dedupe while preserving order
      const seen = new Set<string>()
      return lines.filter(x => {
        if (seen.has(x)) return false
        seen.add(x)
        return true
      })
    }

    const parts: string[] = []
    let totalLines = 0

    for (const pagePath of pagePaths) {
      const xml = decodeXml(files[pagePath])
      const doc = parseXml(xml)
      if (!doc) continue

      const fileBase = pagePath.split('/').pop() || pagePath
      const pageName = pageNameByTarget.get(fileBase) || fileBase
      const lines = extractTextLinesFromPage(doc)
      totalLines += lines.length

      parts.push(`## ${pageName}\n${lines.length ? lines.map(l => `- ${l}`).join('\n') : '(此頁未偵測到可讀文字)'}\n`)
    }

    if (parts.length === 0) {
      return `# ${fileName}\n檔案類型：Visio (.vsdx)\n提取時間：${now}\n\n⚠️ 這個 VSDX 內找不到可解析的頁面 XML（或格式非標準 Visio VSDX）。`
    }

    return `# ${fileName}\n檔案類型：Visio (.vsdx)\n提取時間：${now}\n\n提取頁數：${parts.length}\n提取文字條數：${totalLines}\n\n${parts.join('\n')}`
  }

  const extractDocxToText = (arrayBuffer: ArrayBuffer, fileName: string): string => {
    const now = new Date().toLocaleString('zh-TW')

    const parseXml = (xml: string): Document | null => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const parseError = doc.getElementsByTagName('parsererror')?.[0]
      return parseError ? null : doc
    }

    const normalizeWhitespace = (s: string) => s.replace(/\s+/g, ' ').trim()

    let zipFiles: Record<string, Uint8Array>
    try {
      zipFiles = unzipSync(new Uint8Array(arrayBuffer))
    } catch {
      return `# ${fileName}\n檔案類型：Word (.docx)\n提取時間：${now}\n\n⚠️ 無法解壓縮此 DOCX（可能是檔案損壞或不是標準 DOCX 格式）。`
    }

    const docXml = zipFiles['word/document.xml']
    if (!docXml) {
      return `# ${fileName}\n檔案類型：Word (.docx)\n提取時間：${now}\n\n⚠️ DOCX 內找不到 word/document.xml（格式非標準或被保護）。`
    }

    const xml = strFromU8(docXml)
    const doc = parseXml(xml)
    if (!doc) {
      return `# ${fileName}\n檔案類型：Word (.docx)\n提取時間：${now}\n\n⚠️ 無法解析 document.xml。`
    }

    // Extract text by paragraph (w:p) and run text (w:t)
    const paragraphs: string[] = []
    const pEls = Array.from(doc.getElementsByTagName('*')).filter(el => (el as Element).localName === 'p') as Element[]
    for (const p of pEls) {
      const tEls = Array.from(p.getElementsByTagName('*')).filter(el => (el as Element).localName === 't') as Element[]
      const text = normalizeWhitespace(tEls.map(t => t.textContent || '').join(''))
      if (text) paragraphs.push(text)
    }

    if (paragraphs.length === 0) {
      const tEls = Array.from(doc.getElementsByTagName('*')).filter(el => (el as Element).localName === 't') as Element[]
      const all = normalizeWhitespace(tEls.map(t => t.textContent || '').join(' '))
      if (all) paragraphs.push(all)
    }

    const MAX_PARAGRAPHS = 20000
    const limited = paragraphs.slice(0, MAX_PARAGRAPHS)
    const truncatedNote = paragraphs.length > MAX_PARAGRAPHS
      ? `\n\n⚠️ 段落過多，僅保留前 ${MAX_PARAGRAPHS} 段（避免瀏覽器/模型負擔過大）。`
      : ''

    return `# ${fileName}\n檔案類型：Word (.docx)\n提取時間：${now}\n\n提取段落數：${paragraphs.length}\n\n${limited.map(p => `- ${p}`).join('\n')}${truncatedNote}`
  }

  const estimateTokens = (text: string): number => {
    // Conservative heuristic to avoid model prompt overflow.
    // tokens ~= utf8Bytes / 3.2
    const bytes = new TextEncoder().encode(text).length
    return Math.ceil(bytes / 3.2)
  }

  const sliceToTokenBudget = (text: string, maxTokens: number): string => {
    if (!text) return ''
    if (estimateTokens(text) <= maxTokens) return text

    // Proportional first cut
    let end = Math.min(text.length, Math.max(1, Math.floor(maxTokens * 4)))
    let slice = text.slice(0, end)

    // Back off until under budget
    while (end > 1 && estimateTokens(slice) > maxTokens) {
      end = Math.floor(end * 0.8)
      slice = text.slice(0, end)
    }

    // Fine tune upward (light binary search)
    let low = end
    let high = Math.min(text.length, Math.floor(end * 1.5))
    while (low + 100 < high) {
      const mid = Math.floor((low + high) / 2)
      const midSlice = text.slice(0, mid)
      if (estimateTokens(midSlice) <= maxTokens) {
        low = mid
      } else {
        high = mid
      }
    }

    let finalSlice = text.slice(0, low)
    finalSlice = finalSlice.replace(/[\uD800-\uDBFF]$/, '')
    return finalSlice
  }

  const downloadJson = (fileName: string, data: unknown) => {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportLearnedDocuments = () => {
    const learnedEntries = knowledgeStore.getEntries().filter(e => e.isLearned)
    downloadJson(`knowledge-learned-${new Date().toISOString().slice(0, 10)}.json`, {
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'knowledge-learned',
      entries: learnedEntries
    })
  }

  const exportSingleDocument = (entry: KnowledgeEntry) => {
    downloadJson(`knowledge-${entry.name.replace(/[\\/:*?"<>|]/g, '_')}.json`, {
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'knowledge-entry',
      entry
    })
  }

  const isValidCategory = (category: unknown): category is KnowledgeEntry['category'] =>
    category === 'billing' || category === 'business' || category === 'technical' || category === 'custom'

  const sanitizeImportedEntry = (raw: any): KnowledgeEntry | null => {
    if (!raw || typeof raw !== 'object') return null
    if (typeof raw.name !== 'string' || typeof raw.content !== 'string') return null

    const category: KnowledgeEntry['category'] = isValidCategory(raw.category) ? raw.category : 'custom'
    const content = raw.content
    const originalContent = typeof raw.originalContent === 'string' ? raw.originalContent : undefined
    const originalSize = typeof raw.originalSize === 'number' ? raw.originalSize : undefined

    return {
      id: typeof raw.id === 'string' ? raw.id : `kb-import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: raw.name,
      content,
      category,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      originalContent,
      originalSize,
      size: typeof raw.size === 'number' ? raw.size : new Blob([content]).size,
      uploadedAt: typeof raw.uploadedAt === 'number' ? raw.uploadedAt : Date.now(),
      lastModified: typeof raw.lastModified === 'number' ? raw.lastModified : Date.now(),
      isLearned: typeof raw.isLearned === 'boolean' ? raw.isLearned : true,
      learnedAt: typeof raw.learnedAt === 'number' ? raw.learnedAt : (typeof raw.isLearned === 'boolean' && !raw.isLearned ? undefined : Date.now()),
      learnedSize: typeof raw.learnedSize === 'number' ? raw.learnedSize : (typeof raw.isLearned === 'boolean' && !raw.isLearned ? undefined : new Blob([content]).size),
      learnedModel: typeof raw.learnedModel === 'string' ? raw.learnedModel : undefined,
      hash: typeof raw.hash === 'string' ? raw.hash : ''
    }
  }

  const importLearnedDocuments = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)

      const rawEntries: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.entries)
          ? parsed.entries
          : parsed?.entry
            ? [parsed.entry]
            : []

      if (rawEntries.length === 0) {
        throw new Error('匯入檔案格式不正確（找不到 entries/entry）')
      }

      let imported = 0
      let updated = 0

      const sanitized: KnowledgeEntry[] = rawEntries
        .map(raw => sanitizeImportedEntry(raw))
        .filter((e): e is KnowledgeEntry => !!e)

      const result = knowledgeStore.importEntries(sanitized)
      imported = result.imported
      updated = result.updated

      setLearningStatus(`✅ 匯入完成：新增 ${imported}、更新 ${updated}`)
      setTimeout(() => setLearningStatus(''), 5000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLearningStatus(`❌ 匯入失敗：${msg}`)
      setTimeout(() => setLearningStatus(''), 5000)
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  useEffect(() => {
    const unsubscribe = knowledgeStore.subscribe(() => {
      setEntries(knowledgeStore.getEntries())
    })
    
    // 訂閱設定變更以更新 Copilot 配置和技能狀態
    const unsubscribeSettings = settingsStore.subscribe(() => {
      setCopilotConfig(settingsStore.getCopilotConfig())
      setCopilotSkills(settingsStore.getCopilotSkills())
    })
    
    // 調試：檢查知識庫狀態
    console.log('[KnowledgeBase] Current state:', {
      totalEntries: knowledgeStore.getEntries().length,
      learnedEntries: knowledgeStore.getEntries().filter(e => e.isLearned).length,
      activeKnowledge: knowledgeStore.getActiveKnowledge().length,
      entries: knowledgeStore.getEntries().map(e => ({
        name: e.name,
        isLearned: e.isLearned,
        enabled: e.enabled,
        size: e.content.length
      }))
    })
    
    return () => {
      unsubscribe()
      unsubscribeSettings()
    }
  }, [])

  // Load Copilot models
  useEffect(() => {
    const config = settingsStore.getCopilotConfig()
    const shouldLoad = config?.enabled && config?.provider === 'github' && !!config?.apiKey

    if (!shouldLoad) {
      setAvailableCopilotModels([])
      setCopilotModelsError('')
      return
    }

    let cancelled = false

    const loadModels = async () => {
      try {
        setCopilotModelsLoading(true)
        setCopilotModelsError('')

        const result = await window.electronAPI.copilot.listModels()
        if (cancelled) return

        if (result?.error) {
          setAvailableCopilotModels([])
          setCopilotModelsError(result.error)
          return
        }

        const ids = Array.isArray(result?.ids) ? result.ids : []
        setAvailableCopilotModels(ids)
      } catch (e: any) {
        if (cancelled) return
        setAvailableCopilotModels([])
        setCopilotModelsError(e?.message || String(e))
      } finally {
        if (!cancelled) setCopilotModelsLoading(false)
      }
    }

    loadModels()

    return () => {
      cancelled = true
    }
  }, [])

  // 生成智能索引
  const generateIndex = async (entry: KnowledgeEntry): Promise<void> => {
    try {
      // 取前 10,000 字元用於生成索引
      const preview = entry.content.slice(0, 10000)
      
      const prompt = `請為以下文件生成詳細索引，用於後續精準查詢：

文件名：${entry.name}
分類：${entry.category}
大小：${(entry.size / 1024).toFixed(1)} KB

內容預覽：
${preview}

請提供 JSON 格式（不要包含任何其他文字）：
{
  "summary": "100-200字內的摘要，說明這個文件的核心內容和用途",
  "keywords": ["關鍵詞1", "關鍵詞2", ...],
  "topics": ["主題1", "主題2", ...],
  "businessProcesses": ["業務流程1", "業務流程2", ...],
  "technicalAreas": ["技術領域1", "技術領域2", ...]
}

要求：
- keywords: 10-20個關鍵詞，包含專有名詞、功能名稱、表名、API名、程序名
- topics: 5-10個主題標籤，高層次分類
- businessProcesses: 相關業務流程，例如：立帳、開發票、折扣計算、退費、帳單生成
- technicalAreas: 技術領域，例如：PL/SQL、資料庫設計、API設計、批次處理`

      const response = await window.electronAPI.copilot.chat(`index-${entry.id}`, {
        messages: [{ role: 'user', content: prompt }]
      })

      if (response.error) {
        throw new Error(response.error)
      }

      // 解析 JSON
      const content = String(response.content).trim()
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('無法解析索引 JSON')
      }

      const indexData = JSON.parse(jsonMatch[0])
      
      const index: import('../types/knowledge-base').KnowledgeIndex = {
        fileId: entry.id,
        fileName: entry.name,
        category: entry.category,
        summary: indexData.summary || '',
        keywords: Array.isArray(indexData.keywords) ? indexData.keywords : [],
        topics: Array.isArray(indexData.topics) ? indexData.topics : [],
        businessProcesses: Array.isArray(indexData.businessProcesses) ? indexData.businessProcesses : [],
        technicalAreas: Array.isArray(indexData.technicalAreas) ? indexData.technicalAreas : [],
        relatedFiles: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      // 更新到 entry
      await knowledgeStore.updateEntry(entry.id, { index })
      
    } catch (error) {
      console.error('[KnowledgeBase] 生成索引失敗:', error)
      // 索引生成失敗不影響主流程，靜默處理
    }
  }

  // 學習知識（使用 Copilot API 驗證）
  // sourceContent: optional override so we can learn large files without persisting the raw content into localStorage.
  const learnKnowledge = async (
    entry: KnowledgeEntry,
    sourceContent?: string,
    sourceContentBytes?: number
  ) => {
    setIsLearning(true)
    setLearningStatus(`正在學習「${entry.name}」...`)

    try {
      // 檢查 Copilot 是否已啟用
      const isEnabled = await settingsStore.isCopilotEnabled()
      if (!isEnabled) {
        throw new Error('請先在設定中配置 GitHub Copilot')
      }

      // 智能提取：讓 AI 總結和提取關鍵信息（偏向壓縮版）
      const contentForLearning = typeof sourceContent === 'string' ? sourceContent : entry.content
      const learningBytes = typeof sourceContentBytes === 'number'
        ? sourceContentBytes
        : new Blob([contentForLearning]).size

      const originalBytes = typeof entry.originalSize === 'number'
        ? entry.originalSize
        : (typeof entry.size === 'number' ? entry.size : learningBytes)
      const contentSizeKB = (originalBytes / 1024).toFixed(1)
      setLearningStatus(`正在分析「${entry.name}」(${contentSizeKB} KB)...\n使用 AI 提取關鍵信息中...`)
      
      // 對於大文件，分批提取（以 token 預算切分，避免 400 prompt token count exceeds limit）
      // 使用 5000 tokens（約 16KB）確保每段都能完整輸出，避免截斷
      const chunks: string[] = []
      let offset = 0
      while (offset < contentForLearning.length) {
        const remaining = contentForLearning.slice(offset)
        const chunk = sliceToTokenBudget(remaining, 5000)
        if (!chunk) break
        chunks.push(chunk)
        offset += chunk.length
      }
      
      setLearningStatus(`正在分析「${entry.name}」...\n分成 ${chunks.length} 個部分進行提取`)
      
      const summaries: string[] = []
      let lastResponseModel: string | undefined
      let failedChunks = 0
      
      // 深度學習模式：保留最大限度的細節（大幅提升輸出限制避免壓縮）
      const MAX_EXTRACT_CHARS_PER_PART = 60000

      for (let i = 0; i < chunks.length; i++) {
        setLearningStatus(`正在深度學習「${entry.name}」...\n處理第 ${i + 1}/${chunks.length} 部分 (已完成 ${summaries.length}/${chunks.length})`)
        
        const promptPrefix = `請以【深度學習】模式處理以下文檔內容：

🎯 核心要求：保留原始內容的 100%，絕對不要總結或濃縮

深度學習規則：
✓ 保留所有表格的完整資料（包括每一行）
✓ 保留所有代碼、SQL 語句、配置的完整內容
✓ 保留所有欄位名稱、數值、參數
✓ 保留所有規則說明、注意事項、範例
✓ 只做格式整理（如：將 CSV 轉為 Markdown 表格）

❌ 嚴格禁止以下行為：
✗ 不要省略任何資料行
✗ 不要用「...等」、「其他類似」、「後續省略」代替實際內容
✗ 不要只列出前幾筆資料
✗ 不要總結或濃縮
✗ 不要寫「*(文檔內容完整，後續部分省略格式化示範，請參考以上結構)*」這類文字
✗ 不要因為內容長就省略後半部分

⚠️ 特別注意：
- 如果內容很長，也要全部輸出，不可省略
- 每個章節、每個表格、每行資料都要完整保留
- 即使重複，也要保留所有內容
- 這是第 ${i + 1}/${chunks.length} 部分，請完整處理這部分的所有內容

輸出格式：
- 使用 Markdown 表格格式（對於表格資料）
- 使用代碼塊（對於代碼/SQL）
- 保持原始結構和完整性
- 不限制輸出長度，務必完整

文檔名稱：${entry.name}
部分：${i + 1}/${chunks.length}

原始內容：
`

  const promptSuffix = `

⚠️ 再次提醒：請保持原始內容的完整性，輸出這部分的所有內容，不要省略任何後續部分！`

  // 直接使用已分段好的 chunk（在第 530 行已經按 15000 tokens 分段）
  // 不再進行二次截斷，確保所有內容都被完整學習
  const extractPrompt = `${promptPrefix}${chunks[i]}${promptSuffix}`

        try {
          const response = await window.electronAPI.copilot.chat(`extract-${entry.id}-${i}`, {
            messages: [
              { role: 'user', content: extractPrompt }
            ],
            maxTokens: 16384  // 知識庫深度學習：提升輸出限制避免截斷
          })

          if (response.error) {
            console.error(`[KnowledgeBase] Chunk ${i + 1} failed:`, response.error)
            failedChunks++
            summaries.push(`=== 第 ${i + 1} 部分 (處理失敗) ===\n⚠️ 此部分處理失敗: ${response.error}`)
            continue
          }

          if (response.model) {
            lastResponseModel = String(response.model)
          }

          summaries.push(`=== 第 ${i + 1} 部分 ===\n${response.content}`)
        } catch (error) {
          console.error(`[KnowledgeBase] Chunk ${i + 1} exception:`, error)
          failedChunks++
          summaries.push(`=== 第 ${i + 1} 部分 (處理失敗) ===\n⚠️ 此部分處理時發生錯誤: ${(error as Error).message}`)
        }
      }
      
      if (failedChunks > 0) {
        setLearningStatus(`學習完成，但有 ${failedChunks}/${chunks.length} 個部分失敗\n已完成 ${summaries.length - failedChunks}/${chunks.length} 部分`)
      }
      
      // 合併所有總結（先合併，再做一次整體壓縮）
      const mergedSummaries = summaries.join('\n\n')
      let extractedContent = `# ${entry.name}\n原始大小：${contentSizeKB} KB\n提取時間：${new Date().toLocaleString('zh-TW')}\n學習模式：💎 深度學習\n\n${mergedSummaries}`

      // 深度學習模式：只在內容過大時做適度整合，不進行激進壓縮
      const SHOULD_COMPRESS = chunks.length > 3 && extractedContent.length > 100000
      if (SHOULD_COMPRESS) {
        setLearningStatus(`正在整合「${entry.name}」...\n合併所有部分並保持完整性`)

        const compressPrompt = `你將收到一份已分段的深度學習內容，請進行合併整合（重點：保留完整資料，不要濃縮）：

整合規則：
✓ 保留所有分段的完整內容
✓ 合併重複的標題/章節
✓ 統一格式（如：統一表格格式）

❌ 嚴格禁止：
✗ 不要刪減資料行數
✗ 不要省略任何欄位
✗ 不要用摘要代替實際內容
✗ 不要寫「後續省略」、「參考以上結構」等文字
✗ 不要因為內容長就省略

⚠️ 重要：這是合併多個分段，每個分段都要完整保留，不限制輸出長度

文檔名稱：${entry.name}

分段內容：
${mergedSummaries}

請輸出整合後的完整內容（保持所有資料，不要省略）：`

        const compressResponse = await window.electronAPI.copilot.chat(`compress-${entry.id}`, {
          messages: [{ role: 'user', content: compressPrompt }]
        })

        if (compressResponse.error) {
          throw new Error(compressResponse.error)
        }

        if (compressResponse.model) {
          lastResponseModel = String(compressResponse.model)
        }

        const compressed = String(compressResponse.content || '').trim()
        // Safety: if compress becomes too short (often loses useful detail), keep merged summaries.
        extractedContent = compressed.length < 10000
          ? `# ${entry.name}\n原始大小：${contentSizeKB} KB\n提取時間：${new Date().toLocaleString('zh-TW')}\n學習模式：💎 深度學習\n\n${mergedSummaries}`
          : `# ${entry.name}\n原始大小：${contentSizeKB} KB\n提取時間：${new Date().toLocaleString('zh-TW')}\n學習模式：💎 深度學習\n\n${compressed}`
      } else {
        extractedContent = `# ${entry.name}\n原始大小：${contentSizeKB} KB\n提取時間：${new Date().toLocaleString('zh-TW')}\n學習模式：💎 深度學習\n\n${mergedSummaries}`
      }

      const learnedBytes = new Blob([extractedContent]).size
      const requestedModel = settingsStore.getCopilotConfig()?.model
      const learnedModel = lastResponseModel || requestedModel

      // Avoid persisting huge originalContent into localStorage (quota risk).
      // We still keep originalSize so UI can show the real file size.
      const MAX_ORIGINAL_CONTENT_BYTES_TO_STORE = 200 * 1024
      const shouldStoreOriginalContent = (
        typeof entry.originalContent === 'string'
          ? true
          : learningBytes <= MAX_ORIGINAL_CONTENT_BYTES_TO_STORE
      )
      
      // 更新條目為提取後的內容，並同時標記為已學習
      // ⭐ 重要：默認使用原始內容，AI 學習內容作為備選
      await knowledgeStore.updateEntry(entry.id, { 
        originalContent: shouldStoreOriginalContent
          ? (typeof entry.originalContent === 'string' ? entry.originalContent : contentForLearning)
          : undefined,
        originalSize: typeof entry.originalSize === 'number' ? entry.originalSize : originalBytes,
        content: extractedContent,
        isLearned: true,
        enabled: true,
        useOriginalContent: shouldStoreOriginalContent,  // 默認使用原始內容
        learnedAt: Date.now(),
        learnedSize: learnedBytes,
        learnedModel
      })
      
      const newSizeKB = (learnedBytes / 1024).toFixed(1)
      const ratio = originalBytes > 0 ? ((1 - learnedBytes / originalBytes) * 100).toFixed(1) : '0.0'

      // 深度學習模式：檢查壓縮率是否合理
      const compressionRatio = parseFloat(ratio)
      let statusMessage = `✅ 已成功學習「${entry.name}」\n\n原始大小：${contentSizeKB} KB\n提取後：${newSizeKB} KB\n壓縮率：${ratio}%`
      
      if (compressionRatio > 80) {
        statusMessage += `\n\n⚠️ 注意：壓縮率過高（${ratio}%），可能遺漏了大量內容。\n建議：檢查文件內容是否完整讀取。`
      } else if (compressionRatio > 50) {
        statusMessage += `\n\n⚠️ 壓縮率較高（${ratio}%），深度學習建議保留 50% 以上內容。`
      } else {
        statusMessage += `\n\n✓ 深度學習模式：已保留 ${(100 - compressionRatio).toFixed(1)}% 內容\n內容已結構化，可在對話中使用！`
      }

      const note = shouldStoreOriginalContent
        ? '\n\n📄 已自動設定為「使用原始檔案」，保證內容完整。\n💡 若需使用 AI 結構化內容，可點擊檔案切換。'
        : '\n\n⚠️ 原始內容過大，為避免儲存空間不足，僅保存學習後內容（可重新匯入原檔再學習）。'
      setLearningStatus(statusMessage + note)
      
      // 學習完成後自動生成索引（背景執行）
      const updatedEntry = knowledgeStore.getEntries().find(e => e.id === entry.id)
      if (updatedEntry && updatedEntry.isLearned) {
        setLearningStatus(statusMessage + note + '\n\n🔍 正在生成智能索引...')
        generateIndex(updatedEntry).then(() => {
          setEntries(knowledgeStore.getEntries())
        })
      }
      
      // 5秒後清除狀態
      setTimeout(() => {
        setLearningStatus('')
      }, 5000)

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setLearningStatus(`❌ 學習失敗：${errorMsg}`)
      setTimeout(() => {
        setLearningStatus('')
      }, 5000)
    } finally {
      setIsLearning(false)
    }
  }

  // 處理文件上傳
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      try {
        let content = ''
        const fileName = file.name
        const fileExt = fileName.toLowerCase().split('.').pop()
        const originalBytes = file.size

        // Legacy Visio .vsd is a binary format; we can't reliably extract text in-browser.
        if (fileExt === 'vsd') {
          setLearningStatus(`⚠️ Visio .vsd 為舊版二進位格式，無法直接提取流程圖文字。\n\n建議：用 Visio 另存為 .vsdx 後再上傳學習。`)
          continue
        }

        // Legacy Word .doc is a binary format; convert to .docx first.
        if (fileExt === 'doc') {
          setLearningStatus(`⚠️ Word .doc 為舊版二進位格式，無法直接提取可讀文字。\n\n建議：用 Word 另存為 .docx 後再上傳學習。`)
          continue
        }

        // 處理 Excel 文件
        if (fileExt === 'xlsx' || fileExt === 'xls') {
          const arrayBuffer = await file.arrayBuffer()
          const workbook = XLSX.read(arrayBuffer, { type: 'array' })
          
          // 將所有工作表轉換為文本（深度學習模式：讀取更多行）
          const sheets: string[] = []
          const MAX_ROWS_PER_SHEET = 5000 // 深度學習：每個工作表最多讀取 5000 行
          
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName]
            
            // 獲取工作表範圍
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
            const totalRows = range.e.r + 1
            
            // 如果超過限制，只讀取前 N 行
            if (totalRows > MAX_ROWS_PER_SHEET) {
              const limitedRange = XLSX.utils.encode_range({
                s: { r: 0, c: range.s.c },
                e: { r: MAX_ROWS_PER_SHEET - 1, c: range.e.c }
              })
              worksheet['!ref'] = limitedRange
              sheets.push(
                `【工作表: ${sheetName}】 (僅讀取前 ${MAX_ROWS_PER_SHEET}/${totalRows} 行)\n${XLSX.utils.sheet_to_csv(worksheet)}`
              )
            } else {
              sheets.push(
                `【工作表: ${sheetName}】 (共 ${totalRows} 行)\n${XLSX.utils.sheet_to_csv(worksheet)}`
              )
            }
          })
          
          content = sheets.join('\n\n')
          
          if (!content.trim()) {
            setLearningStatus(`⚠️ Excel 文件「${fileName}」內容為空`)
            continue
          }
        } else if (fileExt === 'vsdx') {
          // Visio VSDX is a ZIP (OOXML). We must extract readable text from its XML parts.
          const arrayBuffer = await file.arrayBuffer()
          content = extractVsdxToText(arrayBuffer, fileName)
        } else if (fileExt === 'docx') {
          // Word DOCX is a ZIP (OOXML). Extract readable text from XML.
          const arrayBuffer = await file.arrayBuffer()
          content = extractDocxToText(arrayBuffer, fileName)
        } else {
          // 處理文本文件
          content = await file.text()
        }
        
        // 檢查內容大小（不再硬性限制；只提示）
        const contentBytes = new Blob([content]).size
        const contentSizeKB = contentBytes / 1024
        if (contentSizeKB > 500) {
          const originalKB = (originalBytes / 1024).toFixed(1)
          setLearningStatus(`⚠️ 文件「${fileName}」提取後內容較大 (${contentSizeKB.toFixed(1)} KB；原檔 ${originalKB} KB)。\n\n仍可學習：系統會分段提取並在學習後生成精簡內容；學習後也可隨時取消「提供給 AI」。`)
        }
        
        const category: KnowledgeEntry['category'] = 'custom'

        // Avoid persisting huge raw content before learning (localStorage quota risk).
        // We'll create a small placeholder entry and learn using sourceContent override.
        const LARGE_CONTENT_BYTES = 200 * 1024
        const placeholder = `# ${fileName}\n原始大小：${(originalBytes / 1024).toFixed(1)} KB\n提取時間：${new Date().toLocaleString('zh-TW')}\n\n(內容提取中，完成學習後將以精簡內容取代...)\n\n_id=${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

        const initialContent = contentBytes > LARGE_CONTENT_BYTES ? placeholder : content
        const entry = await knowledgeStore.addEntry(fileName, initialContent, category)

        // Ensure "原始大小" 使用檔案 bytes，而非字元估算
        // 同時保存原始內容到 originalContent（用於切換模式）
        knowledgeStore.updateEntry(entry.id, { 
          originalSize: originalBytes, 
          size: originalBytes,
          originalContent: content  // 保存完整的原始內容
        })

        // 深度學習模式：對於表格/結構化數據，直接保存轉換後格式，不經過 AI 處理
        const isStructuredData = fileExt === 'xlsx' || fileExt === 'xls' || fileExt === 'csv'
        
        if (isStructuredData) {
          // 表格數據：直接保存 Markdown 格式，不經過 AI
          const learnedContent = `# ${fileName}\n原始大小：${(originalBytes / 1024).toFixed(1)} KB\n提取時間：${new Date().toLocaleString('zh-TW')}\n學習模式：💎 深度學習（表格完整保留）\n\n${content}`
          const learnedBytes = new Blob([learnedContent]).size
          const learnedModel = settingsStore.getCopilotConfig()?.model || 'direct-conversion'
          
          await knowledgeStore.updateEntry(entry.id, { 
            content: learnedContent,
            isLearned: true,
            enabled: true,
            learnedAt: Date.now(),
            learnedSize: learnedBytes,
            learnedModel
          })
          
          const learnedKB = (learnedBytes / 1024).toFixed(1)
          const ratio = originalBytes > 0 ? ((1 - learnedBytes / originalBytes) * 100).toFixed(1) : '0.0'
          
          setLearningStatus(`✅ 已完成深度學習「${fileName}」\n\n原始大小：${(originalBytes / 1024).toFixed(1)} KB\n學習後：${learnedKB} KB\n壓縮率：${ratio}%\n\n💎 表格數據已完整保留（未經 AI 壓縮）\n所有工作表和資料行都已轉換為 Markdown 格式！`)
        } else {
          // 其他文件：使用 AI 深度學習
          await learnKnowledge(entry, content, contentBytes)
        }
        
      } catch (error) {
        console.error('Failed to upload file:', error)
        setLearningStatus(`❌ 上傳失敗：${file.name} - ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // 清空 input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 驗證已學習
  const verifyLearned = async (entry: KnowledgeEntry) => {
    if (!entry.isLearned) {
      setLearningStatus('⚠️ 此知識尚未學習')
      return
    }

    setIsLearning(true)
    setLearningStatus('正在驗證...')

    try {
      // 構建包含知識庫內容的 system prompt
      const systemPrompt = `你是一個專業助手。以下是用戶提供的知識文檔：

===== 【${entry.name}】 =====
${entry.content.substring(0, 10000)}${entry.content.length > 10000 ? '\n...(內容過長，已截斷)' : ''}
===== 文檔結束 =====

請基於以上文檔內容回答用戶的問題。`

      const response = await window.electronAPI.copilot.chat(`verify-${entry.id}`, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `根據上述文檔，列出其中的主要內容或關鍵信息（20-50字）。` }
        ]
      })

      if (response.error) {
        throw new Error(response.error)
      }

      setLearningStatus(`✅ 驗證成功！AI 已能訪問知識庫內容：\n${response.content}`)
      setTimeout(() => setLearningStatus(''), 5000)

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setLearningStatus(`❌ 驗證失敗：${errorMsg}`)
      setTimeout(() => setLearningStatus(''), 5000)
    } finally {
      setIsLearning(false)
    }
  }

  const filteredEntries = [...entries].sort((a, b) => {
    const direction = sortDir === 'asc' ? 1 : -1

    const getNumeric = (e: KnowledgeEntry): number => {
      switch (sortKey) {
        case 'uploadedAt':
          return e.uploadedAt
        case 'size':
          return e.size
        case 'learnedAt':
          return e.learnedAt ?? 0
        case 'learnedSize':
          return e.learnedSize ?? (e.isLearned ? new Blob([e.content]).size : 0)
        default:
          return 0
      }
    }

    if (sortKey === 'name') {
      return direction * a.name.localeCompare(b.name, 'zh-TW', { numeric: true, sensitivity: 'base' })
    }

    return direction * (getNumeric(a) - getNumeric(b))
  })

  const stats = knowledgeStore.getStats()
  
  // 獲取當前模型的知識庫限制
  const currentConfig = settingsStore.getCopilotConfig()
  const modelLimits = getModelKnowledgeLimit(currentConfig?.model)
  const MAX_KNOWLEDGE_SIZE = modelLimits.maxTotal
  
  const usagePercent = Math.min(100, (stats.activeSize / MAX_KNOWLEDGE_SIZE * 100)).toFixed(1)
  const usageColor = stats.activeSize > MAX_KNOWLEDGE_SIZE ? '#ef4444' : stats.activeSize > MAX_KNOWLEDGE_SIZE * 0.8 ? '#f59e0b' : '#7bbda4'

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '1100px', width: '92%' }}>
        <div className="settings-header">
          <h2>📚 AI 能力管理</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          padding: '12px 20px 0', 
          borderBottom: '1px solid #3a3836',
          marginBottom: '16px'
        }}>
          <button
            onClick={() => setActiveTab('skills')}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === 'skills' ? '#2a3826' : 'transparent',
              color: activeTab === 'skills' ? '#7bbda4' : '#888',
              border: 'none',
              borderBottom: activeTab === 'skills' ? '2px solid #7bbda4' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === 'skills' ? 'bold' : 'normal'
            }}
          >
            🎯 技能設定
          </button>
          <button
            onClick={() => setActiveTab('knowledge')}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === 'knowledge' ? '#2a3826' : 'transparent',
              color: activeTab === 'knowledge' ? '#7bbda4' : '#888',
              border: 'none',
              borderBottom: activeTab === 'knowledge' ? '2px solid #7bbda4' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === 'knowledge' ? 'bold' : 'normal'
            }}
          >
            📚 知識文檔
          </button>
          <button
            onClick={() => setActiveTab('index')}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === 'index' ? '#2a3826' : 'transparent',
              color: activeTab === 'index' ? '#7bbda4' : '#888',
              border: 'none',
              borderBottom: activeTab === 'index' ? '2px solid #7bbda4' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === 'index' ? 'bold' : 'normal'
            }}
          >
            🔍 索引管理
          </button>
        </div>

        <div className="settings-content">
          {/* Skills Tab */}
          {activeTab === 'skills' && (
            <div>
              <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>
                選擇 AI 助手可以使用的技能。智能選擇會根據問題自動啟用相關技能。
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
                {copilotSkills.map(skill => (
                  <label
                    key={skill.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '12px',
                      backgroundColor: skill.enabled ? '#2a3826' : '#2a2826',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      border: `1px solid ${skill.enabled ? '#4a5836' : '#3a3836'}`,
                      transition: 'all 0.2s'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={skill.enabled}
                      onChange={e => {
                        settingsStore.toggleSkill(skill.id, e.target.checked)
                        // Force immediate UI update
                        flushSync(() => {
                          setCopilotSkills(settingsStore.getCopilotSkills())
                        })
                      }}
                      style={{ marginTop: '2px' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '18px' }}>{skill.icon}</span>
                        <span style={{ color: '#dfdbc3', fontWeight: 'bold', fontSize: '14px' }}>{skill.name}</span>
                      </div>
                      <div style={{ color: '#888', fontSize: '12px' }}>{skill.description}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
                <button
                  onClick={() => {
                    copilotSkills.forEach(skill => {
                      settingsStore.toggleSkill(skill.id, true)
                    })
                    // Force immediate UI update
                    flushSync(() => {
                      setCopilotSkills(settingsStore.getCopilotSkills())
                    })
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#2a5826',
                    color: '#7bbda4',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  全部啟用
                </button>
                <button
                  onClick={() => {
                    copilotSkills.forEach(skill => {
                      settingsStore.toggleSkill(skill.id, false)
                    })
                    // Force immediate UI update
                    flushSync(() => {
                      setCopilotSkills(settingsStore.getCopilotSkills())
                    })
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3a3836',
                    color: '#888',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  全部停用
                </button>
                <button
                  onClick={() => {
                    settingsStore.resetSkills()
                    // Force immediate UI update
                    flushSync(() => {
                      setCopilotSkills(settingsStore.getCopilotSkills())
                    })
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3a3836',
                    color: '#dfdbc3',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  恢復預設
                </button>
              </div>
            </div>
          )}

          {/* Knowledge Documents Tab */}
          {activeTab === 'knowledge' && (
            <>
          {/* 統計資訊 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '10px',
            marginBottom: '20px'
          }}>
            <div style={{
              padding: '12px',
              backgroundColor: '#2a2826',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dfdbc3' }}>{stats.total}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>總知識條目</div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: '#2a3826',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7bbda4' }}>{stats.learned}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>已學習</div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: '#3a2826',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.pending}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>待學習</div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: '#2a2836',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dfdbc3' }}>
                {formatFileSize(stats.totalSize)}
              </div>
              <div style={{ fontSize: '12px', color: '#888' }}>學習前</div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: '#2a2836',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dfdbc3' }}>
                {formatFileSize(stats.learnedSize)}
              </div>
              <div style={{ fontSize: '12px', color: '#888' }}>學習後</div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: stats.activeSize > MAX_KNOWLEDGE_SIZE ? '#3a2826' : '#2a2836',
              borderRadius: '6px',
              textAlign: 'center',
              border: stats.activeSize > MAX_KNOWLEDGE_SIZE ? '1px solid #ef4444' : 'none'
            }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: usageColor }}>
                {usagePercent}%
              </div>
              <div style={{ fontSize: '12px', color: '#888' }}>使用率</div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                {formatFileSize(stats.activeSize)} / {formatFileSize(MAX_KNOWLEDGE_SIZE)}
              </div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                基於模型：{copilotConfig?.model || '未選擇'}
              </div>
            </div>
          </div>

          {/* 學習狀態顯示 */}
          {learningStatus && (
            <div style={{
              padding: '12px',
              backgroundColor: learningStatus.startsWith('✅') ? '#2a3826' : learningStatus.startsWith('❌') ? '#3a2826' : '#2a2836',
              borderRadius: '6px',
              marginBottom: '15px',
              whiteSpace: 'pre-wrap',
              fontSize: '13px',
              color: learningStatus.startsWith('✅') ? '#7bbda4' : learningStatus.startsWith('❌') ? '#f87171' : '#dfdbc3'
            }}>
              {learningStatus}
            </div>
          )}

          {/* 操作按鈕 */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.json,.csv,.log,.xlsx,.xls"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLearning}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2a5826',
                color: '#7bbda4',
                border: 'none',
                borderRadius: '4px',
                cursor: isLearning ? 'not-allowed' : 'pointer',
                opacity: isLearning ? 0.5 : 1,
                fontSize: '13px'
              }}
            >
              📤 上傳學習文件
            </button>
            <button
              onClick={async () => {
                const unlearned = entries.filter(e => !e.isLearned)
                for (const entry of unlearned) {
                  await learnKnowledge(entry)
                }
              }}
              disabled={isLearning || entries.filter(e => !e.isLearned).length === 0}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3a2836',
                color: '#dfdbc3',
                border: 'none',
                borderRadius: '4px',
                cursor: isLearning ? 'not-allowed' : 'pointer',
                opacity: isLearning ? 0.5 : 1,
                fontSize: '13px'
              }}
              title="將所有待學習文檔進行學習"
            >
              🎓 學習全部文件
            </button>

            <button
              onClick={() => {
                const learnedEntries = entries.filter(e => e.isLearned)
                if (learnedEntries.length === 0) return

                if (confirm(`確定要全部忘記嗎？\n\n將會把 ${learnedEntries.length} 筆文檔變回「待學習」，並且不再提供給 AI。`)) {
                  for (const entry of learnedEntries) {
                    const restoredContent = typeof entry.originalContent === 'string' ? entry.originalContent : entry.content
                    const restoredSize = typeof entry.originalSize === 'number' ? entry.originalSize : entry.size
                    knowledgeStore.updateEntry(entry.id, {
                      content: restoredContent,
                      size: restoredSize,
                      isLearned: false,
                      learnedAt: undefined,
                      learnedSize: undefined,
                      learnedModel: undefined,
                      enabled: false,
                      originalContent: undefined,
                      originalSize: undefined
                    })
                  }
                  setLearningStatus(`✅ 已全部忘記：${learnedEntries.length} 筆`)
                  setTimeout(() => setLearningStatus(''), 5000)
                }
              }}
              disabled={isLearning || entries.filter(e => e.isLearned).length === 0}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2a2836',
                color: '#dfdbc3',
                border: 'none',
                borderRadius: '4px',
                cursor: isLearning ? 'not-allowed' : 'pointer',
                opacity: isLearning ? 0.5 : 1,
                fontSize: '13px'
              }}
              title="全部忘記：全部回到待學習並取消提供給 AI"
            >
              ❌ 忘記全部文件
            </button>
            <button
              onClick={() => {
                const active = knowledgeStore.getActiveKnowledge()
                const msg = active.length > 0
                  ? `✅ 知識庫狀態正常\n\n可用知識: ${active.length} 個\n${active.map(k => `• ${k.name} (${(k.content.length / 1024).toFixed(1)} KB)`).join('\n')}`
                  : `⚠️ 知識庫為空\n\n請確認：\n1. 文件已上傳並標記為「已學習」\n2. 文件已勾選「提供給 AI」`

                setLearningStatus(msg)
                setTimeout(() => setLearningStatus(''), 8000)
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2a3836',
                color: '#7bbda4',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
              title="檢查目前可提供給 AI 的知識"
            >
              🔍 檢查文件狀態
            </button>

            <button
              onClick={exportLearnedDocuments}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2a2836',
                color: '#dfdbc3',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
              title="匯出所有已學習的文檔（JSON）"
            >
              💾 全部匯出知識
            </button>

            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={importLearnedDocuments}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2a2836',
                color: '#dfdbc3',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
              title="匯入先前匯出的 JSON（會以 hash 合併）"
            >
              📥 匯入知識
            </button>
          </div>

          {/* Model Selector and Sort Controls - Above file list */}
          <div style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '16px',
            marginTop: '16px'
          }}>
            <div style={{
              flex: 1,
              padding: '12px',
              backgroundColor: '#2a2826',
              borderRadius: '6px',
              border: '1px solid #3a3836'
            }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#dfdbc3', fontWeight: 'bold' }}>
                🤖 選擇模型
              </label>
              <select
                value={copilotConfig?.model || 'gpt-4o'}
                onChange={async e => {
                  const newConfig = { ...copilotConfig, model: e.target.value }
                  settingsStore.setCopilotConfig(newConfig)
                  await window.electronAPI.copilot.setConfig(newConfig)
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#1f1d1a',
                  color: '#dfdbc3',
                  border: '1px solid #3a3836',
                  borderRadius: '4px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {(() => {
                  const selected = copilotConfig?.model || 'gpt-4o'
                  const list = Array.isArray(availableCopilotModels) && availableCopilotModels.length > 0 
                    ? availableCopilotModels 
                    : ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'o1-preview', 'o1-mini', 'claude-sonnet-4.5']
                  const merged = list.includes(selected) ? list : [selected, ...list]
                  const unique = Array.from(new Set(merged.filter(Boolean)))
                  return unique.map(id => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))
                })()}
              </select>
            </div>

            <div style={{
              padding: '12px',
              backgroundColor: '#2a2826',
              borderRadius: '6px',
              border: '1px solid #3a3836',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '8px'
            }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#dfdbc3', fontWeight: 'bold' }}>
                  ⇅ 排序
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                    style={{
                      backgroundColor: '#1f1d1a',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      padding: '8px',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="uploadedAt">上傳時間</option>
                    <option value="name">檔名</option>
                    <option value="size">原始大小</option>
                    <option value="learnedAt">學習時間</option>
                    <option value="learnedSize">學習後大小</option>
                  </select>
                  <button
                    onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#1f1d1a',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                    title={sortDir === 'asc' ? '由小到大' : '由大到小'}
                  >
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 進度顯示區域 */}
          {learningStatus && (
            <div style={{
              marginBottom: '15px',
              padding: '12px 15px',
              backgroundColor: '#2a3826',
              border: '1px solid #3a5836',
              borderRadius: '6px',
              color: '#7bbda4',
              fontSize: '13px',
              lineHeight: '1.6',
              whiteSpace: 'pre-line',
              fontFamily: 'monospace'
            }}>
              {learningStatus}
            </div>
          )}

          {/* 知識列表 */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {filteredEntries.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: '#888',
                fontSize: '14px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>📭</div>
                <div>尚無知識條目</div>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>點擊「上傳文檔」開始添加知識</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredEntries.map(entry => {
                  return (
                    <div
                      key={entry.id}
                      style={{
                        padding: '12px',
                        backgroundColor: selectedEntry === entry.id ? '#3a3836' : '#2a2826',
                        borderRadius: '6px',
                        border: `1px solid ${entry.isLearned ? '#4a5836' : '#3a3836'}`,
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedEntry(selectedEntry === entry.id ? null : entry.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', color: '#dfdbc3', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span>{entry.name}</span>
                            {entry.isLearned && entry.learnedAt && (
                              <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#7bbda4' }}>
                                ✅ {new Date(entry.learnedAt).toLocaleString('zh-TW')} 已學習
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: '#888', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <span>學習前：{formatFileSize(entry.size)}</span>
                            {entry.isLearned && (
                              <>
                                <span>•</span>
                                <span>學習後：{formatFileSize(entry.learnedSize ?? new Blob([entry.content]).size)}</span>
                              </>
                            )}
                            {entry.isLearned && entry.originalContent && (
                              <>
                                <span>•</span>
                                <span style={{ color: entry.useOriginalContent ? '#b89bdb' : '#7bbda4' }}>
                                  {entry.useOriginalContent ? '使用原始檔' : '使用分析後'}
                                </span>
                              </>
                            )}
                            {entry.isLearned && (
                              <>
                                <span>•</span>
                                <span>模型：{entry.learnedModel || '未知'}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>{new Date(entry.uploadedAt).toLocaleString('zh-TW')}</span>
                          </div>
                          {entry.suggestedSkills && entry.suggestedSkills.length > 0 && (
                            <div style={{ fontSize: '10px', color: '#58a6ff', marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {entry.suggestedSkills.map((skillId) => {
                                const skill = settingsStore.getCopilotSkills().find(s => s.id === skillId)
                                return skill ? (
                                  <span key={skillId} style={{ backgroundColor: 'rgba(88, 166, 255, 0.1)', padding: '2px 6px', borderRadius: '3px' }}>
                                    {skill.icon} {skill.name}
                                  </span>
                                ) : null
                              })}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <label
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              backgroundColor: entry.enabled !== false ? '#2a3826' : '#2a2826',
                              color: entry.enabled !== false ? '#7bbda4' : '#888',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                            title="是否提供此文件給 AI（只影響使用中大小與對話拼接）"
                          >
                            <input
                              type="checkbox"
                              checked={entry.enabled !== false}
                              onChange={(e) => {
                                knowledgeStore.toggleEntryEnabled(entry.id, e.target.checked)
                                // Force immediate UI update
                                flushSync(() => {
                                  setEntries(knowledgeStore.getEntries())
                                })
                              }}
                            />
                            提供給 AI
                          </label>
                          {entry.originalContent && entry.isLearned && (
                            <label
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 10px',
                                backgroundColor: entry.useOriginalContent ? '#3a2a58' : '#2a2a38',
                                color: entry.useOriginalContent ? '#b89bdb' : '#888',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                              title={entry.useOriginalContent 
                                ? "正在使用原始檔案內容（未經分析）" 
                                : "正在使用分析後的內容（已學習精簡）"}
                            >
                              <input
                                type="checkbox"
                                checked={entry.useOriginalContent || false}
                                onChange={(e) => {
                                  knowledgeStore.toggleUseOriginalContent(entry.id, e.target.checked)
                                  // Force immediate UI update
                                  flushSync(() => {
                                    setEntries(knowledgeStore.getEntries())
                                  })
                                }}
                              />
                              {entry.useOriginalContent ? '📄 原始檔案' : '🎓 分析後'}
                            </label>
                          )}
                          {!entry.isLearned ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                learnKnowledge(entry)
                              }}
                              disabled={isLearning}
                              style={{
                                padding: '4px 12px',
                                backgroundColor: '#2a5826',
                                color: '#7bbda4',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isLearning ? 'not-allowed' : 'pointer',
                                fontSize: '12px'
                              }}
                              title="學習此文檔（提取重點以便對話使用）"
                            >
                              🎓 學習
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                verifyLearned(entry)
                              }}
                              disabled={isLearning}
                              style={{
                                padding: '4px 12px',
                                backgroundColor: '#2a3836',
                                color: '#7bbda4',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isLearning ? 'not-allowed' : 'pointer',
                                fontSize: '12px'
                              }}
                              title="驗證 AI 是否能正確使用此文檔內容"
                            >
                              ✓ 驗證
                            </button>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!entry.isLearned) return
                              if (confirm(`確定要忘記「${entry.name}」嗎？\n\n忘記後會變成待學習，且不再提供給 AI。`)) {
                                const restoredContent = typeof entry.originalContent === 'string' ? entry.originalContent : entry.content
                                const restoredSize = typeof entry.originalSize === 'number' ? entry.originalSize : entry.size
                                knowledgeStore.updateEntry(entry.id, {
                                  content: restoredContent,
                                  size: restoredSize,
                                  isLearned: false,
                                  learnedAt: undefined,
                                  learnedSize: undefined,
                                  learnedModel: undefined,
                                  enabled: false,
                                  originalContent: undefined,
                                  originalSize: undefined
                                })
                              }
                            }}
                            disabled={!entry.isLearned}
                            style={{
                              padding: '4px 12px',
                              backgroundColor: '#2a2836',
                              color: entry.isLearned ? '#dfdbc3' : '#666',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: entry.isLearned ? 'pointer' : 'not-allowed',
                              fontSize: '12px',
                              opacity: entry.isLearned ? 1 : 0.6
                            }}
                            title="忘記：標記為待學習（不再提供給 AI）"
                          >
                            忘記
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!entry.isLearned) return
                              exportSingleDocument(entry)
                            }}
                            disabled={!entry.isLearned}
                            style={{
                              padding: '4px 12px',
                              backgroundColor: '#2a2836',
                              color: entry.isLearned ? '#dfdbc3' : '#666',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: entry.isLearned ? 'pointer' : 'not-allowed',
                              fontSize: '12px',
                              opacity: entry.isLearned ? 1 : 0.6
                            }}
                            title={entry.isLearned ? '匯出此文檔（JSON）' : '尚未學習，無法匯出'}
                          >
                            💾
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm(`確定要刪除「${entry.name}」嗎？`)) {
                                knowledgeStore.deleteEntry(entry.id)
                                // 如果刪除的是當前展開的條目，關閉展開
                                if (selectedEntry === entry.id) {
                                  setSelectedEntry(null)
                                }
                              }
                            }}
                            style={{
                              padding: '4px 12px',
                              backgroundColor: '#3a2826',
                              color: '#f87171',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                            title="刪除此文檔"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* 展開顯示內容預覽 */}
                      {selectedEntry === entry.id && (
                        <div style={{
                          marginTop: '10px',
                          padding: '10px',
                          backgroundColor: '#1f1d1a',
                          borderRadius: '4px',
                          fontSize: '12px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'monospace',
                          color: '#dfdbc3'
                        }}>
                          {entry.useOriginalContent && entry.originalContent 
                            ? entry.originalContent 
                            : entry.content}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          </>
          )}

          {/* Index Management Tab */}
          {activeTab === 'index' && (
            <div>
              {/* 進度顯示區域 */}
              {learningStatus && (
                <div style={{
                  marginBottom: '15px',
                  padding: '12px 15px',
                  backgroundColor: '#2a3826',
                  border: '1px solid #3a5836',
                  borderRadius: '6px',
                  color: '#7bbda4',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-line',
                  fontFamily: 'monospace'
                }}>
                  {learningStatus}
                </div>
              )}

              {/* 智能索引說明 */}
              <div style={{ 
                marginBottom: '20px',
                padding: '15px',
                backgroundColor: '#2a2826',
                borderRadius: '6px',
                border: '1px solid #3a3836'
              }}>
                <h3 style={{ color: '#dfdbc3', marginBottom: '10px', fontSize: '14px' }}>
                  🔍 智能索引系統
                </h3>
                <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>
                  自動分析並建立知識庫索引，提升 AI 查詢準確度。上傳新文件時會自動學習並生成索引。
                </p>
                <p style={{ color: '#7bbda4', fontSize: '11px', marginBottom: '12px' }}>
                  🤖 使用模型：<strong>gpt-4o</strong> | 📊 分析內容：前 10,000 字元 | ⚡ 每個文件約 5 秒
                </p>
                <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: '#7bbda4', marginBottom: '12px' }}>
                  <span>📊 總檔案：{entries.length}</span>
                  <span>•</span>
                  <span>✅ 已索引：{entries.filter(e => e.index).length}</span>
                  <span>•</span>
                  <span>⏳ 待索引：{entries.filter(e => !e.index && e.isLearned).length}</span>
                </div>
                <button
                  onClick={async () => {
                    const unindexed = entries.filter(e => e.isLearned && !e.index)
                    if (unindexed.length === 0) {
                      alert('✅ 所有已學習的文件都已建立索引！')
                      return
                    }
                    if (!confirm(`🔍 批量生成索引\n\n📊 待處理文件：${unindexed.length} 個\n🤖 使用模型：${copilotConfig?.model || 'gpt-4o'}\n⏱️ 預計時間：${unindexed.length * 5} 秒\n\n確定要繼續嗎？`)) return
                    
                    setIsLearning(true)
                    let successCount = 0
                    let failCount = 0
                    
                    for (let i = 0; i < unindexed.length; i++) {
                      const currentFile = unindexed[i]
                      const progress = `${i + 1}/${unindexed.length}`
                      setLearningStatus(`🔍 正在分析並生成索引...（${progress}）\n📄 ${currentFile.name}\n⏱️ 使用 ${copilotConfig?.model || 'gpt-4o'} 分析中...`)
                      
                      const beforeCount = knowledgeStore.getEntries().filter(e => e.index).length
                      await generateIndex(currentFile)
                      const afterCount = knowledgeStore.getEntries().filter(e => e.index).length
                      
                      if (afterCount > beforeCount) {
                        successCount++
                      } else {
                        failCount++
                      }
                      
                      // 每處理一個文件就刷新一次列表，讓使用者看到即時更新
                      setEntries(knowledgeStore.getEntries())
                    }
                    
                    setIsLearning(false)
                    const resultMsg = `✅ 批量索引生成完成！\n\n成功：${successCount} 個\n失敗：${failCount} 個\n總計：${unindexed.length} 個`
                    setLearningStatus(resultMsg)
                    alert(resultMsg)
                    setTimeout(() => setLearningStatus(''), 5000)
                  }}
                  disabled={isLearning || entries.filter(e => e.isLearned && !e.index).length === 0}
                  style={{
                    marginTop: '12px',
                    padding: '8px 16px',
                    backgroundColor: '#2a3826',
                    color: '#7bbda4',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLearning ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    opacity: isLearning || entries.filter(e => e.isLearned && !e.index).length === 0 ? 0.5 : 1,
                    fontWeight: 'bold'
                  }}
                >
                  {isLearning ? '⏳ 生成中...' : '🔄 批量生成索引'}
                </button>
              </div>

              {/* 操作按鈕區 */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.md,.json,.csv,.log,.xlsx,.xls"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                onChange={importLearnedDocuments}
                style={{ display: 'none' }}
              />
              
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLearning}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#2a5826',
                    color: '#7bbda4',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLearning ? 'not-allowed' : 'pointer',
                    opacity: isLearning ? 0.5 : 1,
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  📤 上傳學習文件
                </button>
                <button
                  onClick={async () => {
                    const unlearned = entries.filter(e => !e.isLearned)
                    if (unlearned.length === 0) {
                      alert('✅ 所有文件都已學習完畢！')
                      return
                    }
                    if (!confirm(`🎓 學習全部文件\n\n📊 待學習文件：${unlearned.length} 個\n⏱️ 預計時間：${unlearned.length * 10} 秒\n\n確定要繼續嗎？`)) return
                    for (const entry of unlearned) {
                      await learnKnowledge(entry)
                    }
                  }}
                  disabled={isLearning || entries.filter(e => !e.isLearned).length === 0}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3a2836',
                    color: '#dfdbc3',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLearning || entries.filter(e => !e.isLearned).length === 0 ? 'not-allowed' : 'pointer',
                    opacity: isLearning || entries.filter(e => !e.isLearned).length === 0 ? 0.5 : 1,
                    fontSize: '13px'
                  }}
                >
                  🎓 學習全部文件
                </button>
                <button
                  onClick={() => {
                    const learnedEntries = entries.filter(e => e.isLearned)
                    if (learnedEntries.length === 0) {
                      alert('⚠️ 沒有已學習的文件')
                      return
                    }
                    if (confirm(`❌ 忘記全部文件\n\n📊 將影響：${learnedEntries.length} 個文件\n⚠️ 文件將變回「待學習」狀態\n\n確定要繼續嗎？`)) {
                      for (const entry of learnedEntries) {
                        const restoredContent = typeof entry.originalContent === 'string' ? entry.originalContent : entry.content
                        const restoredSize = typeof entry.originalSize === 'number' ? entry.originalSize : entry.size
                        knowledgeStore.updateEntry(entry.id, {
                          content: restoredContent,
                          size: restoredSize,
                          isLearned: false,
                          learnedAt: undefined,
                          learnedSize: undefined,
                          learnedModel: undefined,
                          enabled: false,
                          originalContent: undefined,
                          originalSize: undefined
                        })
                      }
                      setLearningStatus(`✅ 已忘記全部：${learnedEntries.length} 個文件`)
                      setTimeout(() => setLearningStatus(''), 5000)
                    }
                  }}
                  disabled={isLearning || entries.filter(e => e.isLearned).length === 0}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#2a2836',
                    color: '#dfdbc3',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isLearning || entries.filter(e => e.isLearned).length === 0 ? 'not-allowed' : 'pointer',
                    opacity: isLearning || entries.filter(e => e.isLearned).length === 0 ? 0.5 : 1,
                    fontSize: '13px'
                  }}
                >
                  ❌ 忘記全部文件
                </button>
                <button
                  onClick={() => {
                    const active = knowledgeStore.getActiveKnowledge()
                    const msg = active.length > 0
                      ? `✅ 知識庫狀態正常\n\n可用知識: ${active.length} 個\n${active.map(k => `• ${k.name} (${(k.content.length / 1024).toFixed(1)} KB)`).join('\n')}`
                      : `⚠️ 知識庫為空\n\n請確認：\n1. 文件已上傳並學習\n2. 文件已勾選「提供給 AI」`
                    alert(msg)
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#2a3836',
                    color: '#7bbda4',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  🔍 檢查文件狀態
                </button>
                <button
                  onClick={exportLearnedDocuments}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#2a2836',
                    color: '#dfdbc3',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  💾 全部匯出知識
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#2a2836',
                    color: '#dfdbc3',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  📥 匯入知識
                </button>
              </div>

              {/* 模型選擇和排序 */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div style={{ flex: 1, padding: '12px', backgroundColor: '#2a2826', borderRadius: '6px', border: '1px solid #3a3836' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#888', fontWeight: '500' }}>
                    🤖 選擇模型
                  </label>
                  <select
                    value={copilotConfig?.model || 'gpt-4o'}
                    onChange={async (e) => {
                      const newConfig = { ...copilotConfig, model: e.target.value }
                      settingsStore.setCopilotConfig(newConfig)
                      await window.electronAPI.copilot.setConfig(newConfig)
                      setCopilotConfig(newConfig)
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#1f1d1a',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    {(availableCopilotModels.length > 0 ? availableCopilotModels : ['gpt-4o', 'gpt-4o-2024-11-20', 'gpt-4', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini', 'claude-sonnet-4.5']).map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#2a2826', borderRadius: '6px', border: '1px solid #3a3836' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#888', fontWeight: '500' }}>
                    ⇅ 排序
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as any)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#1f1d1a',
                        color: '#dfdbc3',
                        border: '1px solid #3a3836',
                        borderRadius: '4px',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="uploadedAt">上傳時間</option>
                      <option value="name">名稱</option>
                      <option value="size">大小</option>
                      <option value="learnedAt">學習時間</option>
                      <option value="learnedSize">學習大小</option>
                    </select>
                    <button
                      onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#1f1d1a',
                        color: '#dfdbc3',
                        border: '1px solid #3a3836',
                        borderRadius: '4px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        minWidth: '40px'
                      }}
                    >
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 已索引文件列表 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {(() => {
                  const indexedEntries = entries.filter(e => e.index)
                  
                  // 排序已索引的文件
                  const sortedIndexed = [...indexedEntries].sort((a, b) => {
                    let aVal: any, bVal: any
                    
                    switch (sortKey) {
                      case 'name':
                        aVal = a.name.toLowerCase()
                        bVal = b.name.toLowerCase()
                        break
                      case 'size':
                        aVal = a.size || 0
                        bVal = b.size || 0
                        break
                      case 'uploadedAt':
                        aVal = a.uploadedAt || 0
                        bVal = b.uploadedAt || 0
                        break
                      case 'learnedAt':
                        aVal = a.learnedAt || 0
                        bVal = b.learnedAt || 0
                        break
                      case 'learnedSize':
                        aVal = a.learnedSize || 0
                        bVal = b.learnedSize || 0
                        break
                      default:
                        aVal = a.uploadedAt || 0
                        bVal = b.uploadedAt || 0
                    }
                    
                    if (sortDir === 'asc') {
                      return aVal > bVal ? 1 : -1
                    } else {
                      return aVal < bVal ? 1 : -1
                    }
                  })
                  
                  return sortedIndexed.map(entry => (
                  <div
                    key={entry.id}
                    style={{
                      padding: '12px',
                      backgroundColor: '#2a2826',
                      borderRadius: '6px',
                      border: '1px solid #3a3836'
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      marginBottom: '8px'
                    }}>
                      <div style={{ fontWeight: 'bold', color: '#dfdbc3', fontSize: '13px' }}>
                        📄 {entry.name}
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={async () => {
                            if (!confirm(`🔄 重建索引\n\n📄 文件：${entry.name}\n🤖 模型：${copilotConfig?.model || 'gpt-4o'}\n⏱️ 預計：5 秒\n\n確定要重建嗎？`)) return
                            setIsLearning(true)
                            setLearningStatus(`🔍 正在使用 ${copilotConfig?.model || 'gpt-4o'} 重建索引...\n📄 ${entry.name}`)
                            
                            const beforeIndex = entry.index ? JSON.stringify(entry.index) : null
                            await generateIndex(entry)
                            const updatedEntry = knowledgeStore.getEntries().find(e => e.id === entry.id)
                            const afterIndex = updatedEntry?.index ? JSON.stringify(updatedEntry.index) : null
                            
                            setEntries(knowledgeStore.getEntries())
                            setIsLearning(false)
                            
                            if (afterIndex && afterIndex !== beforeIndex) {
                              setLearningStatus(`✅ 已完成「${entry.name}」索引重建！`)
                            } else {
                              setLearningStatus(`⚠️ 索引重建可能失敗，請檢查 Console`)
                            }
                            setTimeout(() => setLearningStatus(''), 3000)
                          }}
                          disabled={isLearning}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#2a3826',
                            color: '#7bbda4',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLearning ? 'not-allowed' : 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          🔄 重建
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`🗑️ 刪除索引\n\n📄 文件：${entry.name}\n\n⚠️ 僅刪除索引，文件內容保留\n確定要刪除嗎？`)) return
                            
                            await knowledgeStore.updateEntry(entry.id, { index: undefined })
                            setEntries(knowledgeStore.getEntries())
                            setLearningStatus(`✅ 已刪除「${entry.name}」的索引`)
                            setTimeout(() => setLearningStatus(''), 3000)
                          }}
                          disabled={isLearning}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#3a2826',
                            color: '#f87171',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLearning ? 'not-allowed' : 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          🗑️ 刪除
                        </button>
                      </div>
                    </div>
                    
                    {entry.index && (
                      <>
                        <div style={{ 
                          color: '#888', 
                          fontSize: '12px', 
                          marginBottom: '8px',
                          lineHeight: '1.6'
                        }}>
                          💎 {entry.index.summary}
                        </div>
                        
                        <div style={{ 
                          display: 'flex', 
                          flexWrap: 'wrap', 
                          gap: '4px',
                          marginBottom: '6px'
                        }}>
                          {entry.index.keywords.slice(0, 10).map((kw, i) => (
                            <span
                              key={i}
                              style={{
                                padding: '2px 6px',
                                backgroundColor: '#3a3836',
                                color: '#7bbda4',
                                borderRadius: '3px',
                                fontSize: '10px'
                              }}
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                        
                        {entry.index.businessProcesses.length > 0 && (
                          <div style={{ fontSize: '11px', color: '#58a6ff', marginTop: '6px' }}>
                            📋 業務流程：{entry.index.businessProcesses.join('、')}
                          </div>
                        )}
                        
                        {entry.index.technicalAreas.length > 0 && (
                          <div style={{ fontSize: '11px', color: '#b89bdb', marginTop: '4px' }}>
                            🔧 技術領域：{entry.index.technicalAreas.join('、')}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  ))
                })()}
                
                {entries.filter(e => e.index).length === 0 && (
                  <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#888',
                    fontSize: '13px'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '10px' }}>🔍</div>
                    <div>尚無索引資料</div>
                    <div style={{ fontSize: '11px', marginTop: '5px' }}>
                      上傳並學習文件後會自動生成索引
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
