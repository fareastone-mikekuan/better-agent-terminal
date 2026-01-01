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
    return this.entries
  }

  // 獲取啟用的類別
  getEnabledCategories(): KnowledgeCategory[] {
    return this.categories.filter(c => c.enabled)
  }

  // 獲取所有類別
  getCategories(): KnowledgeCategory[] {
    return this.categories
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
    const enabledCategoryIds = this.getEnabledCategories().map(c => c.id)
    const activeEntries = this.entries.filter(
      e => e.isLearned && enabledCategoryIds.includes(e.category)
    )

    return activeEntries
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

    const entry: KnowledgeEntry = {
      id: `kb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      content,
      category,
      size: new Blob([content]).size,
      uploadedAt: Date.now(),
      lastModified: Date.now(),
      isLearned: false,
      hash
    }

    this.entries.push(entry)
    this.save()
    this.notify()
    return entry
  }

  // 更新知識條目
  updateEntry(id: string, updates: Partial<KnowledgeEntry>): void {
    const entry = this.entries.find(e => e.id === id)
    if (entry) {
      // 保存原始的 isLearned 和 learnedAt 狀態
      const wasLearned = entry.isLearned
      const learnedAt = entry.learnedAt
      
      Object.assign(entry, updates)
      
      // 如果內容改變，重新計算 hash
      if (updates.content !== undefined) {
        entry.hash = generateHash(updates.content)
        entry.lastModified = Date.now()
        
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
        this.entries = JSON.parse(saved)
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
      .reduce((sum, e) => sum + e.content.length, 0)
    
    // 計算啟用類別的已學習內容大小
    const activeKnowledge = this.getActiveKnowledge()
    const activeSize = activeKnowledge.reduce((sum, e) => sum + e.content.length, 0)
    
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
