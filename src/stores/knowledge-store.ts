/**
 * 知識庫管理 Store
 */
import type { KnowledgeEntry, KnowledgeCategory } from '../types/knowledge-base'
import { KNOWLEDGE_CATEGORIES, generateHash } from '../types/knowledge-base'

const STORAGE_KEY = 'knowledge-base-entries'
const CATEGORIES_KEY = 'knowledge-base-categories'

type Listener = () => void

class KnowledgeStore {
  private entries: KnowledgeEntry[] = []
  private categories: KnowledgeCategory[] = [...KNOWLEDGE_CATEGORIES]
  private listeners: Set<Listener> = new Set()

  constructor() {
    this.load()
    // 遷移：為舊的知識條目生成 suggestedSkills
    this.migrateOldEntries()
  }
  
  // 為沒有 suggestedSkills 的舊條目自動生成
  private async migrateOldEntries() {
    let needsSave = false
    const { suggestSkillsForKnowledge } = await import('../types/skill-selector')
    
    for (const entry of this.entries) {
      if (!entry.suggestedSkills) {
        entry.suggestedSkills = suggestSkillsForKnowledge(entry.name, entry.content, entry.category)
        needsSave = true
      }
    }
    
    if (needsSave) {
      console.log('[KnowledgeStore] Migrated old entries with suggested skills')
      this.save()
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach(listener => listener())
  }

  // 獲取所有知識條目
  getEntries(): KnowledgeEntry[] {
    return [...this.entries]
  }

  // 獲取啟用的類別
  getEnabledCategories(): KnowledgeCategory[] {
    return this.categories.filter(c => c.enabled)
  }

  // 獲取所有類別
  getCategories(): KnowledgeCategory[] {
    return [...this.categories]
  }

  // 切換類別啟用狀態
  toggleCategory(categoryId: string, enabled: boolean): void {
    const category = this.categories.find(c => c.id === categoryId)
    if (category) {
      category.enabled = enabled
      this.saveCategories()
      this.notify()
    }
  }

  // 獲取已學習且啟用的知識內容
  getActiveKnowledge(): KnowledgeEntry[] {
    const activeEntries = this.entries.filter(
      e => e.isLearned && e.enabled !== false
    )

    // 根據 useOriginalContent 標記返回對應的內容
    return activeEntries.map(entry => {
      if (entry.useOriginalContent && entry.originalContent) {
        // 使用原始內容（建立副本避免修改原始物件）
        return {
          ...entry,
          content: entry.originalContent,
          size: entry.originalSize || entry.size
        }
      }
      // 使用分析後的內容（預設行為）
      return { ...entry }
    })
  }

  // 切換單筆文件是否提供給 AI
  toggleEntryEnabled(id: string, enabled: boolean): void {
    const entry = this.entries.find(e => e.id === id)
    if (entry) {
      entry.enabled = enabled
      this.save()
      this.notify()
    }
  }

  // 切換使用原始內容或分析後內容
  toggleUseOriginalContent(id: string, useOriginal: boolean): void {
    const entry = this.entries.find(e => e.id === id)
    if (entry) {
      entry.useOriginalContent = useOriginal
      this.save()
      this.notify()
    }
  }

  // 添加知識條目
  async addEntry(
    name: string,
    content: string,
    category: KnowledgeEntry['category']
  ): Promise<KnowledgeEntry> {
    const hash = generateHash(content)
    
    // 檢查是否已存在相同內容
    const existing = this.entries.find(e => e.hash === hash)
    if (existing) {
      return existing
    }

    // 自動分析並建議相關 skills
    const { suggestSkillsForKnowledge } = await import('../types/skill-selector')
    const suggestedSkills = suggestSkillsForKnowledge(name, content, category)

    const entry: KnowledgeEntry = {
      id: `kb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      content,
      category,
      enabled: true,
      size: new Blob([content]).size,
      uploadedAt: Date.now(),
      lastModified: Date.now(),
      isLearned: false,
      learnedSize: undefined,
      learnedModel: undefined,
      hash,
      suggestedSkills, // 自動建議的 skills
      tags: '' // 初始標籤為空
    }

    this.entries.push(entry)
    this.save()
    this.notify()
    
    console.log('[KnowledgeStore] Added entry with suggested skills:', {
      name,
      category,
      suggestedSkills
    })
    
    return entry
  }

  // 匯入知識條目（以 hash 合併；hash 相同則更新內容與學習資訊）
  importEntries(importedEntries: KnowledgeEntry[]): { imported: number; updated: number } {
    let imported = 0
    let updated = 0

    for (const importedEntry of importedEntries) {
      if (!importedEntry || typeof importedEntry !== 'object') continue
      if (typeof importedEntry.name !== 'string' || typeof importedEntry.content !== 'string') continue

      const content = importedEntry.content
      const hash = importedEntry.hash && typeof importedEntry.hash === 'string'
        ? importedEntry.hash
        : generateHash(content)

      const existing = this.entries.find(e => e.hash === hash)
      if (existing) {
        // preserve original file metadata
        this.updateEntry(existing.id, {
          name: importedEntry.name,
          content: content,
          category: importedEntry.category,
          isLearned: importedEntry.isLearned,
          learnedAt: importedEntry.learnedAt,
          learnedSize: importedEntry.learnedSize,
          learnedModel: importedEntry.learnedModel
        })
        updated++
      } else {
        const newEntry: KnowledgeEntry = {
          id: `kb-import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: importedEntry.name,
          content: content,
          category: importedEntry.category,
          enabled: typeof (importedEntry as any).enabled === 'boolean' ? (importedEntry as any).enabled : true,
          size: typeof importedEntry.size === 'number' ? importedEntry.size : new Blob([content]).size,
          uploadedAt: typeof importedEntry.uploadedAt === 'number' ? importedEntry.uploadedAt : Date.now(),
          lastModified: typeof importedEntry.lastModified === 'number' ? importedEntry.lastModified : Date.now(),
          isLearned: typeof importedEntry.isLearned === 'boolean' ? importedEntry.isLearned : true,
          learnedAt: typeof importedEntry.learnedAt === 'number' ? importedEntry.learnedAt : undefined,
          learnedSize: typeof importedEntry.learnedSize === 'number'
            ? importedEntry.learnedSize
            : (importedEntry.isLearned ? new Blob([content]).size : undefined),
          learnedModel: typeof importedEntry.learnedModel === 'string' ? importedEntry.learnedModel : undefined,
          hash
        }

        this.entries.push(newEntry)
        imported++
      }
    }

    this.save()
    this.notify()
    return { imported, updated }
  }

  // 更新知識條目
  updateEntry(id: string, updates: Partial<KnowledgeEntry>): void {
    const entry = this.entries.find(e => e.id === id)
    if (entry) {
      // 保存原始的 isLearned 和 learnedAt 狀態
      const wasLearned = entry.isLearned
      const learnedAt = entry.learnedAt
      
      Object.assign(entry, updates)

      // 若 caller 明確給了 learnedSize，就尊重它
      if (updates.learnedSize !== undefined) {
        entry.learnedSize = updates.learnedSize
      }
      
      // 如果內容改變，重新計算 hash
      if (updates.content !== undefined) {
        entry.hash = generateHash(updates.content)
        entry.lastModified = Date.now()

        // 若為已學習內容，更新學習後大小（bytes）
        if (entry.isLearned) {
          if (updates.learnedSize === undefined) {
            entry.learnedSize = new Blob([entry.content]).size
          }
        }
        
        // 只有在不是「學習」過程中才重置學習狀態
        // 如果 updates 中明確指定了 isLearned，則使用指定的值
        if (updates.isLearned === undefined && !wasLearned) {
          entry.isLearned = false
          entry.learnedAt = undefined
        } else if (updates.isLearned === undefined) {
          // 如果是學習過程中的更新，保持原有學習狀態
          entry.isLearned = wasLearned
          entry.learnedAt = learnedAt
        }
      }
      
      this.save()
      this.notify()
    }
  }

  // 標記為已學習
  markAsLearned(id: string): void {
    const entry = this.entries.find(e => e.id === id)
    if (entry) {
      entry.isLearned = true
      entry.learnedAt = Date.now()
      this.save()
      this.notify()
    }
  }

  // 刪除知識條目
  deleteEntry(id: string): void {
    const index = this.entries.findIndex(e => e.id === id)
    if (index !== -1) {
      this.entries.splice(index, 1)
      this.save()
      this.notify()
    }
  }

  // 清空所有知識
  clear(): void {
    this.entries = []
    this.save()
    this.notify()
  }

  // 儲存到 localStorage
  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries))
    } catch (e) {
      console.error('Failed to save knowledge base:', e)
    }
  }

  private saveCategories(): void {
    try {
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(this.categories))
    } catch (e) {
      console.error('Failed to save categories:', e)
    }
  }

  // 從 localStorage 載入
  private load(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as KnowledgeEntry[]
        // Backfill/migration for older saved data
        this.entries = parsed.map(e => {
          const safeContent = typeof e.content === 'string' ? e.content : ''
          const originalSize = typeof e.size === 'number' ? e.size : new Blob([safeContent]).size
          const learnedSize = e.isLearned
            ? (typeof e.learnedSize === 'number' ? e.learnedSize : new Blob([safeContent]).size)
            : undefined

          const originalContent = typeof (e as any).originalContent === 'string' ? (e as any).originalContent : undefined
          const originalSizeField = typeof (e as any).originalSize === 'number' ? (e as any).originalSize : undefined

          return {
            ...e,
            content: safeContent,
            enabled: typeof (e as any).enabled === 'boolean' ? (e as any).enabled : true,
            originalContent,
            originalSize: originalSizeField ?? originalSize,
            size: originalSize,
            learnedSize,
            learnedModel: typeof e.learnedModel === 'string' ? e.learnedModel : undefined
          }
        })
      }

      const savedCategories = localStorage.getItem(CATEGORIES_KEY)
      if (savedCategories) {
        this.categories = JSON.parse(savedCategories)
      }
    } catch (e) {
      console.error('Failed to load knowledge base:', e)
    }
  }

  // 統計資訊
  getStats() {
    const total = this.entries.length
    const learned = this.entries.filter(e => e.isLearned).length
    const totalSize = this.entries.reduce((sum, e) => sum + e.size, 0)
    
    // 計算已學習內容的實際大小（學習後會變小）
    const learnedSize = this.entries
      .filter(e => e.isLearned)
      .reduce((sum, e) => sum + (typeof e.learnedSize === 'number' ? e.learnedSize : new Blob([e.content]).size), 0)
    
    // 計算啟用類別的已學習內容大小（考慮 useOriginalContent）
    const activeKnowledge = this.getActiveKnowledge()
    const activeSize = activeKnowledge.reduce((sum, e) => {
      // 如果使用原始內容且有 originalContent，使用 originalSize
      if (e.useOriginalContent && e.originalContent) {
        return sum + (e.originalSize || new Blob([e.originalContent]).size)
      }
      // 否則使用學習後的大小
      return sum + (typeof e.learnedSize === 'number' ? e.learnedSize : new Blob([e.content]).size)
    }, 0)
    
    return {
      total,
      learned,
      pending: total - learned,
      totalSize,
      learnedSize,
      activeSize
    }
  }
}

export const knowledgeStore = new KnowledgeStore()
