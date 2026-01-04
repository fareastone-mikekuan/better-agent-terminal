/**
 * 知識庫管理面板
 */
import { useState, useEffect, useRef } from 'react'
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
  const [entries, setEntries] = useState(knowledgeStore.getEntries())
  const [isLearning, setIsLearning] = useState(false)
  const [learningStatus, setLearningStatus] = useState<string>('')
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<'uploadedAt' | 'name' | 'size' | 'learnedAt' | 'learnedSize'>('uploadedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

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
    
    return unsubscribe
  }, [])

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
      const chunks: string[] = []
      let offset = 0
      while (offset < contentForLearning.length) {
        const remaining = contentForLearning.slice(offset)
        // Keep each chunk comfortably sized; final prompt will be clamped again below.
        const chunk = sliceToTokenBudget(remaining, 22000)
        if (!chunk) break
        chunks.push(chunk)
        offset += chunk.length
      }
      
      setLearningStatus(`正在分析「${entry.name}」...\n分成 ${chunks.length} 個部分進行提取`)
      
      const summaries: string[] = []
      let lastResponseModel: string | undefined
      
      // Balanced compression: keep enough detail to be useful.
      const MAX_EXTRACT_CHARS_PER_PART = 12000

      for (let i = 0; i < chunks.length; i++) {
        setLearningStatus(`正在分析「${entry.name}」...\n處理第 ${i + 1}/${chunks.length} 部分`)
        
        const promptPrefix = `請分析以下文檔內容並「精簡但保留足夠細節」提取關鍵信息：
      - 只移除冗詞/重複，避免把關鍵細節濃縮掉
      - 請以條列/小節輸出（不要長篇敘述），保留專有名詞、代碼、欄位名、錯誤碼
      - 每一部分輸出總長度不超過 ${MAX_EXTRACT_CHARS_PER_PART} 個字元
      - 盡量包含：規則/限制、例外情況、常見錯誤、最小可用範例（若有）

如果是 API 文檔：列出 API 名稱、用途、關鍵參數/回傳、注意事項與範例（若有）
如果是數據表：列出表/欄位結構、主鍵/索引、關鍵規則與例子（若有）
如果是說明文檔：列出規則、流程、限制、常見錯誤與例子（若有）

文檔名稱：${entry.name}
部分：${i + 1}/${chunks.length}

內容：
`

  const promptSuffix = `

請以結構化格式輸出關鍵信息：`

  // Final safety clamp against model prompt limits.
  const MODEL_PROMPT_TOKEN_LIMIT = 64000
  const HEADROOM_TOKENS = 2500
  const targetTotalTokens = MODEL_PROMPT_TOKEN_LIMIT - HEADROOM_TOKENS
  const baseTokens = estimateTokens(promptPrefix + promptSuffix)
  const chunkBudget = Math.max(2000, targetTotalTokens - baseTokens)
  const safeChunk = sliceToTokenBudget(chunks[i], Math.min(22000, chunkBudget))
  const extractPrompt = `${promptPrefix}${safeChunk}${promptSuffix}`

        const response = await window.electronAPI.copilot.chat(`extract-${entry.id}-${i}`, {
          messages: [
            { role: 'user', content: extractPrompt }
          ]
        })

        if (response.error) {
          throw new Error(response.error)
        }

        if (response.model) {
          lastResponseModel = String(response.model)
        }

        summaries.push(`=== 第 ${i + 1} 部分 ===\n${response.content}`)
      }
      
      // 合併所有總結（先合併，再做一次整體壓縮）
      const mergedSummaries = summaries.join('\n\n')
      let extractedContent = `# ${entry.name}\n原始大小：${contentSizeKB} KB\n提取時間：${new Date().toLocaleString('zh-TW')}\n\n${mergedSummaries}`

      // 若合併後仍偏大，做第二次「整體壓縮」
      // Only do the second pass when the merged result is clearly too large.
      const SHOULD_COMPRESS = chunks.length > 2 || extractedContent.length > 60000
      if (SHOULD_COMPRESS) {
        setLearningStatus(`正在壓縮「${entry.name}」...\n整合所有部分並生成更精簡版本`)

        const MAX_FINAL_CHARS = 35000
        const compressPrompt = `你將收到一份已分段提取的重點，請再「整體整理與適度精簡」成一份更好用的知識卡：
- 僅保留關鍵規則/介面/欄位/流程/限制/注意事項
- 盡量用條列與小節
- 最終輸出總長度不超過 ${MAX_FINAL_CHARS} 個字元
- 不要加入與原文無關的推測

文檔名稱：${entry.name}

分段重點：
${mergedSummaries}

請輸出最終壓縮版：`

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
        extractedContent = compressed.length < 5000
          ? `# ${entry.name}\n原始大小：${contentSizeKB} KB\n提取時間：${new Date().toLocaleString('zh-TW')}\n\n${mergedSummaries}`
          : `# ${entry.name}\n原始大小：${contentSizeKB} KB\n提取時間：${new Date().toLocaleString('zh-TW')}\n\n${compressed}`
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
      await knowledgeStore.updateEntry(entry.id, { 
        originalContent: shouldStoreOriginalContent
          ? (typeof entry.originalContent === 'string' ? entry.originalContent : contentForLearning)
          : undefined,
        originalSize: typeof entry.originalSize === 'number' ? entry.originalSize : originalBytes,
        content: extractedContent,
        isLearned: true,
        enabled: true,
        learnedAt: Date.now(),
        learnedSize: learnedBytes,
        learnedModel
      })
      
      const newSizeKB = (learnedBytes / 1024).toFixed(1)
      const ratio = originalBytes > 0 ? ((1 - learnedBytes / originalBytes) * 100).toFixed(1) : '0.0'

      const note = shouldStoreOriginalContent
        ? ''
        : '\n\n⚠️ 原始內容過大，為避免儲存空間不足，僅保存學習後內容（可重新匯入原檔再學習）。'
      setLearningStatus(`✅ 已成功學習「${entry.name}」\n\n原始大小：${contentSizeKB} KB\n提取後：${newSizeKB} KB\n壓縮率：${ratio}%\n\n內容已結構化，可在對話中高效使用！${note}`)
      
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
          
          // 將所有工作表轉換為文本（限制行數避免過大）
          const sheets: string[] = []
          const MAX_ROWS_PER_SHEET = 500 // 每個工作表最多讀取 500 行
          
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
        knowledgeStore.updateEntry(entry.id, { originalSize: originalBytes, size: originalBytes })

        // 自動學習（使用 sourceContent，避免先把超大原文寫入 storage）
        await learnKnowledge(entry, content, contentBytes)
        
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
  const copilotConfig = settingsStore.getCopilotConfig()
  const modelLimits = getModelKnowledgeLimit(copilotConfig?.model)
  const MAX_KNOWLEDGE_SIZE = modelLimits.maxTotal
  
  const usagePercent = Math.min(100, (stats.activeSize / MAX_KNOWLEDGE_SIZE * 100)).toFixed(1)
  const usageColor = stats.activeSize > MAX_KNOWLEDGE_SIZE ? '#ef4444' : stats.activeSize > MAX_KNOWLEDGE_SIZE * 0.8 ? '#f59e0b' : '#7bbda4'

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '1100px', width: '92%' }}>
        <div className="settings-header">
          <h2>📚 知識庫管理</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
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

            <label
              style={{
                marginLeft: 'auto',
                flex: 1,
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#2a2826',
                borderRadius: '4px',
                color: '#dfdbc3',
                fontSize: '13px'
              }}
              title="變更列表排序方式"
            >
              ⇅
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                style={{
                  backgroundColor: '#2a2826',
                  color: '#dfdbc3',
                  border: '1px solid #2a2836',
                  borderRadius: '4px',
                  padding: '4px 8px'
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
                  padding: '4px 10px',
                  backgroundColor: '#2a2826',
                  color: '#dfdbc3',
                  border: '1px solid #2a2836',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                title={sortDir === 'asc' ? '目前：由小到大（點擊切換）' : '目前：由大到小（點擊切換）'}
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </label>
          </div>

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
                        <div style={{ display: 'flex', gap: '8px' }}>
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
                              onChange={(e) => knowledgeStore.toggleEntryEnabled(entry.id, e.target.checked)}
                            />
                            提供給 AI
                          </label>
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
                          {entry.content}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
