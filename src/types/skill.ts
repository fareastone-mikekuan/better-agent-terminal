/**
 * 技能系統類型定義
 */

// 基礎工作流程步驟（自動化腳本使用）
export interface SkillStep {
  id: string
  type: 'terminal' | 'api' | 'db' | 'web' | 'file'
  name: string
  description?: string
  config: {
    // Terminal 配置
    command?: string
    
    // API 配置
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    url?: string
    headers?: Record<string, string>
    body?: string
    
    // DB 配置
    query?: string
    connection?: string
    
    // Web 配置
    webUrl?: string
    
    // File 配置
    action?: 'read' | 'write' | 'delete'
    path?: string
    content?: string
  }
}

export interface Skill {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  icon?: string
  steps: SkillStep[]
  createdAt: number
  updatedAt: number
}

// ============ AI Agent 技能類型 ============

export interface AIAgentPrompt {
  role: string              // 角色定義（例如：DevOps Engineer）
  expertise: string[]       // 專業領域
  instructions: string      // 行為指令
  constraints: string[]     // 限制條件
}

export interface AIAgentTools {
  terminal: boolean         // 可執行命令
  fileSystem: boolean       // 可讀寫檔案
  database: boolean         // 可查詢資料庫
  api: boolean             // 可調用 API
  knowledgeBase: boolean   // 可查詢知識庫
}

export interface AIAgentTriggers {
  manual: boolean           // 手動觸發
  errorPatterns?: string[]  // 錯誤模式（正則）
  logPatterns?: string[]    // LOG 模式
  events?: string[]         // 系統事件
}

export interface AIAgentConfig {
  maxIterations: number     // 最大思考輪次
  timeout: number           // 超時時間（毫秒）
  requireApproval: boolean  // 是否需要批准操作
}

export interface AIAgentSkill {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  icon?: string
  type: 'ai-agent'          // 區分 AI Agent 技能
  
  prompt: AIAgentPrompt     // Agent 定義
  knowledgeBaseIds: string[] // 關聯的知識庫 ID
  allowedTools: AIAgentTools // 工具權限
  triggers: AIAgentTriggers  // 觸發條件
  config: AIAgentConfig      // 執行配置
  
  createdAt: number
  updatedAt: number
}

// Agent 思考記錄
export interface AgentThought {
  timestamp: number
  type: 'analysis' | 'knowledge' | 'decision' | 'action' | 'result'
  content: string
  metadata?: Record<string, any>
}

// Agent 行動
export interface AgentAction {
  id: string
  type: 'readLog' | 'queryDatabase' | 'runCommand' | 'queryKnowledge' | 'readFile' | 'callAPI'
  description: string
  requiresApproval: boolean
  params: Record<string, any>
}

// Agent 執行狀態
export interface AgentExecutionState {
  skillId: string
  status: 'idle' | 'thinking' | 'waiting-approval' | 'executing' | 'completed' | 'error'
  currentIteration: number
  thoughts: AgentThought[]
  pendingAction?: AgentAction
  conversationHistory: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
    timestamp: number
  }>
  result?: {
    summary: string
    findings: string[]
    recommendations: string[]
  }
}

// 統一的技能類型（可以是自動化或 AI Agent）
export type UnifiedSkill = Skill | AIAgentSkill

export function isAIAgentSkill(skill: UnifiedSkill): skill is AIAgentSkill {
  return 'type' in skill && skill.type === 'ai-agent'
}

export interface SkillCategory {
  id: string
  name: string
  icon: string
  color: string
}

// 預設類別
export const DEFAULT_CATEGORIES: SkillCategory[] = [
  { id: 'development', name: '開發', icon: '💻', color: '#3b82f6' },
  { id: 'testing', name: '測試', icon: '🧪', color: '#10b981' },
  { id: 'deployment', name: '部署', icon: '🚀', color: '#8b5cf6' },
  { id: 'database', name: '資料庫', icon: '🗄️', color: '#f59e0b' },
  { id: 'api', name: 'API', icon: '🔌', color: '#06b6d4' },
  { id: 'automation', name: '自動化', icon: '⚙️', color: '#6366f1' },
  { id: 'ai-agent', name: 'AI Agent', icon: '🤖', color: '#ec4899' },
  { id: 'other', name: '其他', icon: '📦', color: '#78716c' }
]

// 技能模板
export const SKILL_TEMPLATES: Skill[] = [
  {
    id: 'template-npm-dev',
    name: 'NPM 開發伺服器',
    description: '啟動 Node.js 開發伺服器',
    category: 'development',
    tags: ['npm', 'nodejs', 'dev'],
    icon: '📦',
    steps: [
      {
        id: 'step-1',
        type: 'terminal',
        name: '安裝依賴',
        description: '執行 npm install',
        config: {
          command: 'npm install'
        }
      },
      {
        id: 'step-2',
        type: 'terminal',
        name: '啟動開發伺服器',
        description: '執行 npm run dev',
        config: {
          command: 'npm run dev'
        }
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'template-git-push',
    name: 'Git 提交推送',
    description: '提交並推送程式碼到遠端倉庫',
    category: 'development',
    tags: ['git', 'version-control'],
    icon: '🔀',
    steps: [
      {
        id: 'step-1',
        type: 'terminal',
        name: '查看狀態',
        description: '檢查檔案變更',
        config: {
          command: 'git status'
        }
      },
      {
        id: 'step-2',
        type: 'terminal',
        name: '添加變更',
        description: '將變更加入暫存',
        config: {
          command: 'git add .'
        }
      },
      {
        id: 'step-3',
        type: 'terminal',
        name: '提交變更',
        description: '提交變更並輸入訊息',
        config: {
          command: 'git commit -m "Update"'
        }
      },
      {
        id: 'step-4',
        type: 'terminal',
        name: '推送到遠端',
        description: '推送到 origin',
        config: {
          command: 'git push'
        }
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'template-api-test',
    name: 'API 測試',
    description: '測試 REST API 端點',
    category: 'testing',
    tags: ['api', 'test', 'http'],
    icon: '🔌',
    steps: [
      {
        id: 'step-1',
        type: 'api',
        name: '測試 GET 請求',
        description: '獲取資料',
        config: {
          method: 'GET',
          url: 'https://jsonplaceholder.typicode.com/posts/1',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      },
      {
        id: 'step-2',
        type: 'api',
        name: '測試 POST 請求',
        description: '創建資料',
        config: {
          method: 'POST',
          url: 'https://jsonplaceholder.typicode.com/posts',
          headers: {
            'Content-Type': 'application/json'
          },
          body: '{\n  "title": "Test",\n  "body": "Test content",\n  "userId": 1\n}'
        }
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
]
