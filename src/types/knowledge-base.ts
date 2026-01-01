/**
 * 知識庫類型定義
 */

export interface KnowledgeEntry {
  id: string
  name: string
  content: string
  category: 'billing' | 'business' | 'technical' | 'custom'
  size: number
  uploadedAt: number
  lastModified: number
  isLearned: boolean
  learnedAt?: number
  hash: string  // 用於檢測文件是否有變更
}

export interface KnowledgeCategory {
  id: string
  name: string
  icon: string
  color: string
  description: string
  enabled: boolean
}

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  {
    id: 'billing',
    name: '帳務知識',
    icon: '💰',
    color: '#f59e0b',
    description: '帳單系統、費率計算、優惠方案等',
    enabled: true
  },
  {
    id: 'business',
    name: '業務規則',
    icon: '💼',
    color: '#3b82f6',
    description: '審核流程、權限管理、業務邏輯',
    enabled: true
  },
  {
    id: 'technical',
    name: '技術規範',
    icon: '🔧',
    color: '#8b5cf6',
    description: 'API 文檔、系統架構、技術標準',
    enabled: true
  },
  {
    id: 'custom',
    name: '自訂知識',
    icon: '📝',
    color: '#10b981',
    description: '其他自定義知識內容',
    enabled: true
  }
]

export function generateHash(content: string): string {
  // 簡單的字串 hash 函數
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
