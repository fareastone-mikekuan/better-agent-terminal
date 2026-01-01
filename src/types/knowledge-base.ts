/**
 * 知識庫類型定義
 */

/**
 * 根據模型獲取知識庫大小限制
 * 不同模型有不同的 context window 限制
 */
export function getModelKnowledgeLimit(model?: string): { maxTotal: number; maxSingle: number; tokenLimit: number } {
  const modelName = model?.toLowerCase() || 'gpt-4o'
  
  // 注意：不同帳號/方案/灰度會影響可用模型與實際限制。
  // 這裡的 tokenLimit/maxTotal 是「本地估算與知識庫拼接」用的保守配置，
  // 真正上限仍以 Copilot API 回應為準。

  // GPT-5 family (gpt-5, gpt-5.1, gpt-5.2, gpt-5-mini, gpt-5.1-codex, ...)
  if (modelName.startsWith('gpt-5')) {
    return {
      maxTotal: 200000,      // 200KB
      maxSingle: 160000,     // 160KB
      tokenLimit: 128000     // estimate
    }
  }

  // GPT-4o / GPT-4.1 / preview variants
  if (modelName.includes('gpt-4o') || modelName.includes('gpt-4.1') || modelName.includes('gpt-4-o-preview')) {
    return {
      maxTotal: 150000,      // 150KB
      maxSingle: 120000,     // 120KB
      tokenLimit: 128000     // 128K tokens (estimate)
    }
  }

  // Claude models (e.g., claude-sonnet-4.5, claude-opus-4.5, ...)
  if (modelName.startsWith('claude-')) {
    return {
      maxTotal: 150000,
      maxSingle: 120000,
      tokenLimit: 128000
    }
  }

  // Gemini models (e.g., gemini-2.5-pro)
  if (modelName.startsWith('gemini-')) {
    return {
      maxTotal: 120000,
      maxSingle: 100000,
      tokenLimit: 128000
    }
  }

  // Grok fast code model
  if (modelName.startsWith('grok-')) {
    return {
      maxTotal: 100000,
      maxSingle: 80000,
      tokenLimit: 128000
    }
  }
  
  if (modelName.includes('gpt-4-turbo') || modelName.includes('gpt-4-1106')) {
    // GPT-4 Turbo: 128K context window  
    return {
      maxTotal: 100000,      // 100KB
      maxSingle: 80000,      // 80KB
      tokenLimit: 128000     // 128K tokens
    }
  }
  
  if (modelName.includes('gpt-4-32k')) {
    // GPT-4 32K: 32K context window
    return {
      maxTotal: 80000,       // 80KB
      maxSingle: 60000,      // 60KB
      tokenLimit: 32000      // 32K tokens
    }
  }
  
  if (modelName === 'gpt-4' || modelName.includes('gpt-4-0613') || modelName.includes('gpt-4-0314')) {
    // GPT-4 standard: smaller context window
    return {
      maxTotal: 60000,       // 60KB
      maxSingle: 45000,      // 45KB
      tokenLimit: 8000       // 8K tokens
    }
  }
  
  if (modelName.includes('gpt-3.5-turbo-16k')) {
    // GPT-3.5 16K
    return {
      maxTotal: 30000,       // 30KB
      maxSingle: 25000,      // 25KB
      tokenLimit: 16000      // 16K tokens
    }
  }

  if (modelName.includes('gpt-3.5-turbo')) {
    // GPT-3.5 (default)
    return {
      maxTotal: 20000,       // 20KB
      maxSingle: 15000,      // 15KB
      tokenLimit: 8000       // estimate
    }
  }
  
  if (modelName.includes('o1-')) {
    // O1 models: 128K context window
    return {
      maxTotal: 100000,      // 100KB
      maxSingle: 80000,      // 80KB
      tokenLimit: 128000     // 128K tokens
    }
  }
  
  // 預設：GPT-3.5 or unknown (4K context)
  return {
    maxTotal: 10000,         // 10KB
    maxSingle: 8000,         // 8KB
    tokenLimit: 4000         // 4K tokens
  }
}

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
