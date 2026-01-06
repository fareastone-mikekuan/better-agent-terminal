/**
 * 技能管理 Store
 */
import type { UnifiedSkill } from '../types/skill'
import { SKILL_TEMPLATES } from '../types/skill'

interface SkillState {
  skills: UnifiedSkill[]
}

class SkillStore {
  private state: SkillState = {
    skills: []
  }
  
  private listeners: Set<() => void> = new Set()
  private readonly STORAGE_KEY = 'better-terminal-skills'
  private loadPromise: Promise<void> | null = null

  constructor() {
    console.log('[SkillStore] 構造函數被調用，開始載入')
    this.loadPromise = this.load()
    this.loadPromise.then(() => {
      console.log('[SkillStore] 載入完成，當前技能數量:', this.state.skills.length)
    })
  }

  // 確保載入完成
  async ensureLoaded(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise
    }
  }

  // 訂閱狀態變更
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    console.log('[SkillStore] notify() 被調用，通知', this.listeners.size, '個訂閱者')
    this.listeners.forEach(listener => {
      console.log('[SkillStore] 正在通知一個訂閱者')
      listener()
    })
    console.log('[SkillStore] 所有訂閱者已通知')
  }

  // 獲取所有技能
  getSkills(): UnifiedSkill[] {
    console.log('[SkillStore] getSkills() 被調用，返回', this.state.skills.length, '個技能')
    // 返回新數組副本，確保 React 檢測到變化
    return [...this.state.skills]
  }

  // 根據 ID 獲取技能
  getSkill(id: string): UnifiedSkill | undefined {
    return this.state.skills.find(s => s.id === id)
  }

  // 根據類別獲取技能
  getSkillsByCategory(category: string): UnifiedSkill[] {
    return this.state.skills.filter(s => s.category === category)
  }

  // 搜尋技能
  searchSkills(query: string): UnifiedSkill[] {
    const q = query.toLowerCase()
    return this.state.skills.filter(s => 
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(tag => tag.toLowerCase().includes(q))
    )
  }

  // 新增技能
  addSkill(skill: Omit<UnifiedSkill, 'id' | 'createdAt' | 'updatedAt'>): UnifiedSkill {
    const newSkill: UnifiedSkill = {
      ...skill,
      id: `skill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    } as UnifiedSkill
    this.state.skills.push(newSkill)
    this.save()
    this.notify()
    return newSkill
  }

  // 從模板創建技能
  addSkillFromTemplate(templateId: string, customName?: string): UnifiedSkill | null {
    const template = SKILL_TEMPLATES.find(t => t.id === templateId)
    if (!template) return null

    const newSkill: UnifiedSkill = {
      ...template,
      id: `skill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: customName || template.name,
      createdAt: Date.now(),
      updatedAt: Date.now()
    } as UnifiedSkill
    this.state.skills.push(newSkill)
    this.save()
    this.notify()
    return newSkill
  }

  // 更新技能
  updateSkill(id: string, updates: Partial<Omit<UnifiedSkill, 'id' | 'createdAt'>>): boolean {
    const index = this.state.skills.findIndex(s => s.id === id)
    if (index === -1) return false

    this.state.skills[index] = {
      ...this.state.skills[index],
      ...updates,
      updatedAt: Date.now()
    }
    this.save()
    this.notify()
    return true
  }

  // 刪除技能
  deleteSkill(id: string): boolean {
    const index = this.state.skills.findIndex(s => s.id === id)
    if (index === -1) return false

    this.state.skills.splice(index, 1)
    this.save()
    this.notify()
    return true
  }

  // 複製技能
  duplicateSkill(id: string): UnifiedSkill | null {
    const skill = this.getSkill(id)
    if (!skill) return null

    const newSkill: UnifiedSkill = {
      ...skill,
      id: `skill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${skill.name} (副本)`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    } as UnifiedSkill
    this.state.skills.push(newSkill)
    this.save()
    this.notify()
    return newSkill
  }

  // 匯入技能
  importSkill(skillData: UnifiedSkill): UnifiedSkill {
    const newSkill: UnifiedSkill = {
      ...skillData,
      id: `skill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    } as UnifiedSkill
    console.log('[SkillStore] 匯入技能:', newSkill.name, '新 ID:', newSkill.id)
    this.state.skills.push(newSkill)
    this.save()
    this.notify()
    return newSkill
  }

  // 匯出技能
  exportSkill(id: string): UnifiedSkill | null {
    return this.getSkill(id) || null
  }

  // 匯出所有技能
  exportAllSkills(): UnifiedSkill[] {
    return this.state.skills
  }

  // 匯入多個技能
  importSkills(skills: UnifiedSkill[]): number {
    console.log('[SkillStore] 開始批量匯入', skills.length, '個技能')
    let imported = 0
    skills.forEach(skill => {
      try {
        // 不使用 importSkill 以避免多次 save/notify
        const newSkill: UnifiedSkill = {
          ...skill,
          id: `skill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          createdAt: Date.now(),
          updatedAt: Date.now()
        } as UnifiedSkill
        this.state.skills.push(newSkill)
        console.log('[SkillStore] 已添加技能:', newSkill.name, 'ID:', newSkill.id)
        imported++
      } catch (error) {
        console.error('[SkillStore] Failed to import skill:', skill.name, error)
      }
    })
    // 批量操作後統一 save 和 notify
    console.log('[SkillStore] 批量匯入完成，準備保存')
    this.save()
    this.notify()
    console.log('[SkillStore] 保存和通知完成')
    return imported
  }

  // 保存到文件系統（通過 Electron IPC）
  save() {
    try {
      console.log('[SkillStore] 保存技能到文件系統，共', this.state.skills.length, '個技能')
      const data = JSON.stringify(this.state)
      
      // 使用 Electron IPC 保存到文件
      if (window.electronAPI?.skills?.save) {
        window.electronAPI.skills.save(data)
          .then(() => {
            console.log('[SkillStore] 保存成功，數據大小:', data.length, 'bytes')
          })
          .catch((error: Error) => {
            console.error('[SkillStore] 保存失敗:', error)
          })
      } else {
        // Fallback to localStorage for development
        console.warn('[SkillStore] Electron API 不可用，使用 localStorage')
        localStorage.setItem(this.STORAGE_KEY, data)
        console.log('[SkillStore] localStorage 保存成功')
      }
    } catch (error) {
      console.error('[SkillStore] Failed to save skills:', error)
    }
  }

  // 從文件系統載入（通過 Electron IPC）
  async load() {
    try {
      console.log('[SkillStore] 嘗試從文件系統載入技能')
      
      // 使用 Electron IPC 從文件載入
      if (window.electronAPI?.skills?.load) {
        const data = await window.electronAPI.skills.load()
        if (data) {
          console.log('[SkillStore] 文件中找到數據，大小:', data.length, 'bytes')
          const parsed = JSON.parse(data)
          console.log('[SkillStore] 解析成功，技能數量:', parsed.skills?.length || 0)
          this.state = parsed
          console.log('[SkillStore] 從文件載入', this.state.skills.length, '個技能')
          console.log('[SkillStore] 技能列表:', this.state.skills.map(s => s.name))
          return
        }
      }
      
      // Fallback to localStorage
      console.warn('[SkillStore] Electron API 不可用或文件不存在，嘗試 localStorage')
      const saved = localStorage.getItem(this.STORAGE_KEY)
      if (saved) {
        console.log('[SkillStore] localStorage 中找到數據')
        const parsed = JSON.parse(saved)
        this.state = parsed
        console.log('[SkillStore] 從 localStorage 載入', this.state.skills.length, '個技能')
      } else {
        console.log('[SkillStore] 沒有找到保存的技能')
      }
    } catch (error) {
      console.error('[SkillStore] Failed to load skills:', error)
    }
  }

  // 重置（僅用於開發）
  reset() {
    this.state = { skills: [] }
    this.save()
    this.notify()
  }
}

export const skillStore = new SkillStore()
