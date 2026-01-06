/**
 * 技能市場 Store
 */

import { SkillMarketplacePackage, SkillMarketplaceSource, AIAgentSkill } from '../types/skill'
import { skillStore } from './skill-store'

interface SkillMarketplaceState {
  packages: SkillMarketplacePackage[]
  sources: SkillMarketplaceSource[]
  isLoading: boolean
  searchQuery: string
  selectedCategory?: string
}

class SkillMarketplaceStore {
  private state: SkillMarketplaceState = {
    packages: [],
    sources: [
      {
        id: 'official',
        name: '官方市場',
        type: 'official',
        url: 'https://your-company.com/skills-api',
        enabled: false
      },
      {
        id: 'telecom-billing',
        name: '電信計費專業技能庫',
        type: 'github',
        url: 'https://raw.githubusercontent.com/your-org/telecom-billing-skills/main/marketplace.json',
        enabled: false
      }
    ],
    isLoading: false,
    searchQuery: ''
  }

  private listeners: Array<() => void> = []

  constructor() {
    this.loadSources()
  }

  // 订阅状态变化
  subscribe(listener: () => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notify() {
    this.listeners.forEach(listener => listener())
  }

  // 获取所有包
  getPackages(): SkillMarketplacePackage[] {
    let packages = this.state.packages

    // 搜索过滤
    if (this.state.searchQuery) {
      const query = this.state.searchQuery.toLowerCase()
      packages = packages.filter(pkg =>
        pkg.skill.name.toLowerCase().includes(query) ||
        pkg.skill.description.toLowerCase().includes(query) ||
        pkg.skill.tags.some(tag => tag.toLowerCase().includes(query))
      )
    }

    // 分类过滤
    if (this.state.selectedCategory) {
      packages = packages.filter(pkg =>
        pkg.skill.category === this.state.selectedCategory
      )
    }

    return packages
  }

  // 搜索
  setSearchQuery(query: string) {
    this.state.searchQuery = query
    this.notify()
  }

  // 设置分类过滤
  setSelectedCategory(category?: string) {
    this.state.selectedCategory = category
    this.notify()
  }

  // 从市场安装技能
  async installPackage(packageId: string): Promise<AIAgentSkill> {
    const pkg = this.state.packages.find(p => p.id === packageId)
    if (!pkg) {
      throw new Error('技能包不存在')
    }

    // 检查是否已安装
    const existingSkill = skillStore.getSkills().find(s => s.name === pkg.skill.name)
    if (existingSkill) {
      throw new Error('技能已安裝，請先刪除舊版本')
    }

    // 检查依赖
    if (pkg.dependencies && pkg.dependencies.length > 0) {
      const missingDeps = pkg.dependencies.filter(depId =>
        !skillStore.getSkills().find(s => s.id === depId)
      )

      if (missingDeps.length > 0) {
        throw new Error(`缺少依賴技能: ${missingDeps.join(', ')}`)
      }
    }

    // 导入技能
    const importedSkill = skillStore.importSkill(pkg.skill) as AIAgentSkill

    // 更新下载次数
    pkg.metadata.downloads++

    this.notify()
    return importedSkill
  }

  /**
   * 同步所有源的包
   * Sync packages from marketplace sources (not Gist - Gist is for shared notes)
   * Sources: GitHub raw URLs, custom APIs, local files
   */
  async syncPackages(): Promise<void> {
    this.state.isLoading = true
    this.notify()

    try {
      const allPackages: SkillMarketplacePackage[] = []

      for (const source of this.state.sources) {
        if (!source.enabled) continue

        try {
          const packages = await this.fetchPackagesFromSource(source)
          allPackages.push(...packages)
          source.lastSync = Date.now()
        } catch (error) {
          console.error(`[SkillMarketplace] 同步源失敗: ${source.name}`, error)
        }
      }

      this.state.packages = allPackages
      await this.saveSources()
    } finally {
      this.state.isLoading = false
      this.notify()
    }
  }

  // 从源获取包
  private async fetchPackagesFromSource(source: SkillMarketplaceSource): Promise<SkillMarketplacePackage[]> {
    if (source.type === 'github') {
      // 从 GitHub Raw URL 获取
      const response = await fetch(source.url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      return Array.isArray(data.packages) ? data.packages : []
    } else if (source.type === 'official' || source.type === 'custom') {
      // 从 API 获取
      const response = await fetch(`${source.url}/packages`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await response.json()
    }

    return []
  }

  // 添加自定义源
  async addSource(source: Omit<SkillMarketplaceSource, 'id' | 'lastSync'>): Promise<void> {
    const newSource: SkillMarketplaceSource = {
      ...source,
      id: `custom-${Date.now()}`,
      lastSync: undefined
    }

    this.state.sources.push(newSource)
    await this.saveSources()
    this.notify()

    // 立即同步新源
    if (newSource.enabled) {
      await this.syncPackages()
    }
  }

  // 移除源
  async removeSource(sourceId: string): Promise<void> {
    this.state.sources = this.state.sources.filter(s => s.id !== sourceId)
    await this.saveSources()
    this.notify()
  }

  // 切换源状态
  async toggleSource(sourceId: string): Promise<void> {
    const source = this.state.sources.find(s => s.id === sourceId)
    if (source) {
      source.enabled = !source.enabled
      await this.saveSources()
      this.notify()

      if (source.enabled) {
        await this.syncPackages()
      }
    }
  }

  // 获取所有源
  getSources(): SkillMarketplaceSource[] {
    return this.state.sources
  }

  // 保存源配置
  private async saveSources(): Promise<void> {
    try {
      if (window.electronAPI?.skills?.saveSources) {
        await window.electronAPI.skills.saveSources(this.state.sources)
        console.log('[SkillMarketplace] 保存源配置成功')
      }
    } catch (error) {
      console.error('[SkillMarketplace] 保存源配置失敗:', error)
    }
  }

  // 加载源配置
  private async loadSources(): Promise<void> {
    try {
      if (window.electronAPI?.skills?.loadSources) {
        const sources = await window.electronAPI.skills.loadSources()
        if (sources && sources.length > 0) {
          this.state.sources = sources
          this.notify()
        }
      }
    } catch (error) {
      console.error('[SkillMarketplace] 加載源配置失敗:', error)
    }
  }

  getState() {
    return { ...this.state }
  }
}

export const skillMarketplaceStore = new SkillMarketplaceStore()
