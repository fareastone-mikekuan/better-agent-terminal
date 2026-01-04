/**
 * 智能技能和知識選擇器
 * 根據用戶問題自動選擇相關的 skills 和 knowledge
 */

import type { CopilotSkill } from './copilot-skills'
import type { KnowledgeEntry } from './knowledge-base'

/**
 * 問題分類結果
 */
export interface QuestionAnalysis {
  intent: string // 主要意圖：terminal, database, web, file, code, system, knowledge
  keywords: string[] // 提取的關鍵詞
  suggestedSkills: string[] // 建議的 skill IDs
  suggestedKnowledge: string[] // 建議的 knowledge categories
  confidence: number // 置信度 0-1
}

/**
 * 關鍵詞映射表
 */
const INTENT_KEYWORDS = {
  terminal: [
    // 中文
    '命令', '執行', '運行', '終端', 'shell', 'bash', 'powershell', 'cmd',
    '列出', '查看', '檢查', '進程', '服務', '系統信息',
    // 英文
    'run', 'execute', 'command', 'terminal', 'ls', 'cd', 'pwd', 'grep',
    'ps', 'kill', 'service', 'process'
  ],
  database: [
    // 中文
    '資料庫', '查詢', 'sql', 'oracle', 'mysql', 'postgres', '表', '欄位',
    '插入', '更新', '刪除', '查找', '統計', '彙總',
    // 英文
    'database', 'query', 'select', 'insert', 'update', 'delete',
    'table', 'column', 'join', 'where', 'group by'
  ],
  web: [
    // 中文
    '網頁', '網站', 'url', 'http', 'https', '抓取', '爬蟲', 'api',
    '請求', '響應', '下載', '訪問',
    // 英文
    'web', 'website', 'page', 'crawl', 'scrape', 'fetch', 'request',
    'response', 'api', 'endpoint'
  ],
  file: [
    // 中文
    '文件', '檔案', '讀取', '寫入', '分析', '解析', '搜索', '查找',
    '目錄', '路徑', '內容', '代碼',
    // 英文
    'file', 'read', 'write', 'parse', 'analyze', 'search', 'find',
    'directory', 'folder', 'path', 'content'
  ],
  code: [
    // 中文
    '代碼', '程式', '函數', '類', '方法', '變量', '錯誤', 'bug',
    '調試', '測試', '重構', '優化',
    // 英文
    'code', 'function', 'class', 'method', 'variable', 'error', 'bug',
    'debug', 'test', 'refactor', 'optimize', 'programming'
  ],
  system: [
    // 中文
    '系統', '配置', '設置', '環境', '安裝', '部署', '監控', '性能',
    '日誌', '錯誤', '警告',
    // 英文
    'system', 'config', 'configuration', 'environment', 'install', 'deploy',
    'monitor', 'performance', 'log', 'warning'
  ]
}

/**
 * Skill 和 Intent 的映射關係
 */
const INTENT_TO_SKILLS: Record<string, string[]> = {
  terminal: ['terminal-commands', 'system-analysis'],
  database: ['database-query'],
  web: ['web-content', 'api-interaction'],
  file: ['file-operations', 'code-analysis'],
  code: ['code-analysis', 'debugging-support', 'file-operations'],
  system: ['system-analysis', 'terminal-commands']
}

/**
 * 分析用戶問題，提取意圖和關鍵詞
 */
export function analyzeQuestion(question: string): QuestionAnalysis {
  const lowerQuestion = question.toLowerCase()
  const words = question.split(/\s+/)
  
  // 計算每個意圖的匹配分數
  const intentScores: Record<string, number> = {}
  const matchedKeywords: Set<string> = new Set()
  
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0
    for (const keyword of keywords) {
      if (lowerQuestion.includes(keyword.toLowerCase())) {
        score += 1
        matchedKeywords.add(keyword)
      }
    }
    if (score > 0) {
      intentScores[intent] = score
    }
  }
  
  // 找出最高分的意圖
  const sortedIntents = Object.entries(intentScores)
    .sort(([, a], [, b]) => b - a)
  
  const primaryIntent = sortedIntents.length > 0 ? sortedIntents[0][0] : 'terminal'
  const confidence = sortedIntents.length > 0 
    ? Math.min(sortedIntents[0][1] / 5, 1) // 最多 5 個關鍵詞匹配視為 100% 置信
    : 0.3 // 沒有匹配時給予低置信度
  
  // 獲取建議的 skills
  const suggestedSkills: Set<string> = new Set()
  
  // 添加主要意圖的 skills
  if (INTENT_TO_SKILLS[primaryIntent]) {
    INTENT_TO_SKILLS[primaryIntent].forEach(skill => suggestedSkills.add(skill))
  }
  
  // 如果有多個高分意圖，也添加它們的 skills
  sortedIntents.slice(0, 2).forEach(([intent, score]) => {
    if (score >= 2 && INTENT_TO_SKILLS[intent]) {
      INTENT_TO_SKILLS[intent].forEach(skill => suggestedSkills.add(skill))
    }
  })
  
  // 提取知識庫類別建議（基於關鍵詞）
  const suggestedKnowledge = extractKnowledgeCategories(question, matchedKeywords)
  
  return {
    intent: primaryIntent,
    keywords: Array.from(matchedKeywords),
    suggestedSkills: Array.from(suggestedSkills),
    suggestedKnowledge,
    confidence
  }
}

/**
 * 從問題中提取建議的知識類別
 */
function extractKnowledgeCategories(question: string, keywords: Set<string>): string[] {
  const lowerQuestion = question.toLowerCase()
  const categories: Set<string> = new Set()
  
  // 檢查常見的業務/技術領域關鍵詞
  const categoryKeywords: Record<string, string[]> = {
    'api': ['api', 'endpoint', 'rest', 'graphql', '接口', '端點'],
    'database': ['資料庫', 'database', 'sql', 'oracle', 'mysql', '表', 'table'],
    'accounting': ['會計', '帳務', '發票', '報表', 'accounting', 'invoice', 'billing'],
    'system': ['系統', '架構', 'system', 'architecture', '配置', 'config'],
    'code': ['代碼', '函數', 'code', 'function', '類', 'class'],
    'document': ['文檔', '說明', 'document', 'documentation', '手冊', 'manual']
  }
  
  for (const [category, kwList] of Object.entries(categoryKeywords)) {
    if (kwList.some(kw => lowerQuestion.includes(kw.toLowerCase()))) {
      categories.add(category)
    }
  }
  
  // 如果沒有匹配到特定類別，返回所有（讓後續邏輯根據知識條目的標籤進一步過濾）
  return categories.size > 0 ? Array.from(categories) : []
}

/**
 * 根據分析結果選擇相關的 skills
 */
export function selectRelevantSkills(
  analysis: QuestionAnalysis,
  availableSkills: CopilotSkill[]
): CopilotSkill[] {
  // 低置信度時，使用所有已啟用的 skills
  if (analysis.confidence < 0.4) {
    return availableSkills.filter(skill => skill.enabled)
  }
  
  // 高置信度時，只選擇建議的 skills
  const selectedSkills = availableSkills.filter(skill => 
    skill.enabled && analysis.suggestedSkills.includes(skill.id)
  )
  
  // 如果沒有選中任何 skill，至少返回 terminal-commands（基礎能力）
  if (selectedSkills.length === 0) {
    const terminalSkill = availableSkills.find(s => s.id === 'terminal-commands' && s.enabled)
    if (terminalSkill) {
      return [terminalSkill]
    }
  }
  
  return selectedSkills
}

/**
 * 根據分析結果選擇相關的知識條目
 */
export function selectRelevantKnowledge(
  analysis: QuestionAnalysis,
  availableKnowledge: KnowledgeEntry[]
): KnowledgeEntry[] {
  // 如果沒有啟用的知識，直接返回空
  if (availableKnowledge.length === 0) {
    return []
  }
  
  // 極低置信度時，不返回任何知識（讓 AI 用模型知識回答）
  if (analysis.confidence < 0.2) {
    console.log('[SmartSelect] Confidence too low, using model knowledge only')
    return []
  }
  
  // 如果沒有推薦類別但有關鍵詞，仍然嘗試基於關鍵詞匹配
  if (analysis.suggestedKnowledge.length === 0 && analysis.keywords.length === 0) {
    console.log('[SmartSelect] No suggested categories or keywords, using model knowledge only')
    return []
  }
  
  // 高置信度時，過濾相關的知識
  const lowerKeywords = analysis.keywords.map(k => k.toLowerCase())
  
  const scoredKnowledge = availableKnowledge.map(entry => {
    let score = 0
    
    // 類別匹配 (+10 分)
    if (analysis.suggestedKnowledge.includes(entry.category)) {
      score += 10
    }
    
    // 標籤匹配 (+5 分)
    if (entry.tags) {
      const tags = entry.tags.toLowerCase().split(',').map(t => t.trim())
      const matchingTags = tags.filter(tag => 
        lowerKeywords.some(kw => tag.includes(kw) || kw.includes(tag))
      )
      score += matchingTags.length * 5
    }
    
    // 名稱匹配 (+3 分)
    const lowerName = entry.name.toLowerCase()
    const nameMatches = lowerKeywords.filter(kw => 
      lowerName.includes(kw) || kw.includes(lowerName.split(' ')[0])
    )
    score += nameMatches.length * 3
    
    // 內容匹配 (+1 分，但最多 +5)
    const lowerContent = entry.content.toLowerCase()
    let contentMatches = 0
    for (const kw of lowerKeywords) {
      if (lowerContent.includes(kw)) {
        contentMatches++
      }
    }
    score += Math.min(contentMatches, 5)
    
    return { entry, score }
  })
  
  // 按分數排序，只返回有明確匹配的條目（至少 5 分：類別匹配或標籤匹配）
  const relevant = scoredKnowledge
    .filter(({ score }) => score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3) // 最多返回前 3 個最相關的
    .map(({ entry }) => entry)
  
  // 如果過濾後沒有結果，不返回任何知識（讓 AI 使用模型本身的知識）
  return relevant
}

/**
 * 一鍵分析並選擇相關 skills 和 knowledge
 */
export function smartSelect(
  question: string,
  availableSkills: CopilotSkill[],
  availableKnowledge: KnowledgeEntry[]
): {
  analysis: QuestionAnalysis
  selectedSkills: CopilotSkill[]
  selectedKnowledge: KnowledgeEntry[]
} {
  const analysis = analyzeQuestion(question)
  const selectedSkills = selectRelevantSkills(analysis, availableSkills)
  const selectedKnowledge = selectRelevantKnowledge(analysis, availableKnowledge)
  
  console.log('[SmartSelect] Analysis result:', {
    question: question.substring(0, 100),
    intent: analysis.intent,
    confidence: analysis.confidence.toFixed(2),
    keywords: analysis.keywords,
    selectedSkillsCount: selectedSkills.length,
    selectedSkillIds: selectedSkills.map(s => s.id),
    selectedKnowledgeCount: selectedKnowledge.length,
    selectedKnowledgeNames: selectedKnowledge.map(k => k.name)
  })
  
  return {
    analysis,
    selectedSkills,
    selectedKnowledge
  }
}

/**
 * 根據知識內容推薦相關的 skills
 * 用於在導入知識時自動建議 skills
 */
export function suggestSkillsForKnowledge(
  knowledgeName: string,
  knowledgeContent: string,
  knowledgeCategory: string
): string[] {
  // 分析內容
  const combinedText = `${knowledgeName} ${knowledgeContent.substring(0, 5000)}` // 只分析前 5000 字
  const analysis = analyzeQuestion(combinedText)
  
  // 根據知識類別也添加建議
  const categorySkills: Record<string, string[]> = {
    'billing': ['database-query', 'file-operations'],
    'business': ['file-operations', 'web-content'],
    'technical': ['code-analysis', 'terminal-commands', 'debugging-support'],
    'custom': []
  }
  
  const suggestedSkills = new Set(analysis.suggestedSkills)
  
  // 添加類別相關的 skills
  if (categorySkills[knowledgeCategory]) {
    categorySkills[knowledgeCategory].forEach(skill => suggestedSkills.add(skill))
  }
  
  return Array.from(suggestedSkills)
}
