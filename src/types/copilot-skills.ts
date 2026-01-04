/**
 * Copilot Skills 定義
 * 為 AI 提供特定上下文和工具調用能力
 * 
 * 設計理念：
 * - Skills 不是「能力聲明」（GPT 本身就會寫代碼、分析數據等）
 * - Skills 是「上下文提供者」和「工具調用器」
 * - 只有需要實際工具/API 調用的才算真正的 Skill
 */

export interface CopilotSkill {
  id: string
  name: string
  description: string
  category: 'context' | 'tool-call'  // context: 提供上下文, tool-call: 需要工具調用
  icon: string
  enabled: boolean
  systemPromptAddition: string
  examples?: string[]
  requiresToolCall?: boolean  // 是否需要實際的工具調用
}

export const BUILTIN_SKILLS: CopilotSkill[] = [
  {
    id: 'terminal-commands',
    name: '終端命令執行',
    description: '執行實際的 Shell 命令',
    category: 'tool-call',
    icon: '💻',
    enabled: true,
    requiresToolCall: true,
    systemPromptAddition: `
**終端命令執行能力已啟用**

你可以執行實際的終端命令：
1. 提供命令代碼塊（\`\`\`bash 或 \`\`\`powershell）
2. 用戶點擊執行按鈕後，命令會在真實終端中執行
3. 你會收到實際的輸出結果
4. 根據輸出提供分析和下一步建議

**這不是模擬，是真實的命令執行。**
`,
    examples: ['ls -la', 'git status', 'npm install']
  },
  {
    id: 'database-query',
    name: '資料庫查詢',
    description: '連接並查詢真實的 Oracle 資料庫',
    category: 'tool-call',
    icon: '🗄️',
    enabled: true,
    requiresToolCall: true,
    systemPromptAddition: `
**資料庫查詢能力已啟用**

你可以執行真實的資料庫查詢：
1. 提供 SQL 查詢語句
2. 連接實際的 Oracle Database
3. 獲取真實的查詢結果
4. 分析並解釋結果

**這不是模擬，是真實的資料庫連接。**
`,
    examples: ['SELECT * FROM users LIMIT 10', 'DESCRIBE table_name']
  },
  {
    id: 'file-operations',
    name: '文件讀取',
    description: '讀取用戶本地的實際文件',
    category: 'tool-call',
    icon: '📁',
    enabled: true,
    requiresToolCall: true,
    systemPromptAddition: `
**文件讀取能力已啟用**

你可以讀取用戶本地的實際文件：
1. 用戶可以在文件面板右鍵選擇「AI 分析」
2. 你會收到真實的文件內容
3. 提供基於實際內容的分析

**這不是模擬，是真實的文件內容。**
`,
    examples: ['cat package.json', 'type README.md']
  },
  {
    id: 'web-content',
    name: '網頁內容讀取',
    description: '讀取實際的網頁內容',
    category: 'tool-call',
    icon: '🌐',
    enabled: true,
    requiresToolCall: true,
    systemPromptAddition: `
**⚠️ 網頁內容抓取能力已啟用 - 必須使用以下格式**

當用戶要求查詢、搜尋、抓取、獲取任何網頁內容時，**必須**使用以下格式：

\`\`\`fetch
網址URL
\`\`\`

範例：
用戶：「查詢 Amy Macdonald 的維基百科」
你必須回應：

\`\`\`fetch
https://en.wikipedia.org/wiki/Amy_Macdonald
\`\`\`

用戶會看到 🌐 抓取按鈕，點擊後系統會：
1. 自動抓取網頁內容
2. 將內容傳給你
3. 你再分析並回答

**不要只說「我會幫你查」，必須提供 \`\`\`fetch 代碼塊！**
`,
    examples: ['查詢維基百科上的最新資訊']
  },
  {
    id: 'api-testing',
    name: 'API 測試執行',
    description: '執行真實的 HTTP API 請求',
    category: 'tool-call',
    icon: '🔌',
    enabled: true,
    requiresToolCall: true,
    systemPromptAddition: `
**API 測試能力已啟用**

你可以執行真實的 HTTP 請求：
1. 構建 API 請求（GET、POST 等）
2. 實際發送到目標服務器
3. 獲取真實的響應
4. 分析響應結果

**這不是模擬，是真實的 API 調用。**
`,
    examples: ['如何測試這個 REST API']
  },
  {
    id: 'workspace-context',
    name: '工作區上下文',
    description: '提供當前工作區的環境信息',
    category: 'context',
    icon: '📂',
    enabled: true,
    requiresToolCall: false,
    systemPromptAddition: `
**工作區上下文已加載**

你知道以下信息：
- 當前工作目錄路徑
- 環境變數設定
- Shell 類型（bash/zsh/PowerShell）
- 作業系統類型

根據這些上下文提供更準確的建議。
`,
    examples: ['當前工作目錄是什麼']
  }
]

// 移除的技能（這些是 GPT 的固有能力，不需要"啟用"）：
// - 代碼分析：GPT 本身就會
// - 調試支援：GPT 本身就會
// - 環境配置：只是建議，不需要工具調用
// - Git 操作：只是建議 Git 命令，可以併入終端命令執行
// - 套件管理：只是建議套件命令，可以併入終端命令執行
// - 系統分析：GPT 本身就會

/**
 * 從啟用的 skills 構建 system prompt
 */
export function buildSystemPromptFromSkills(skills: CopilotSkill[]): string {
  if (skills.length === 0) {
    return '你是一個通用 AI 助手。'
  }

  const toolCallSkills = skills.filter(s => s.requiresToolCall)
  const contextSkills = skills.filter(s => !s.requiresToolCall)

  let prompt = '你是一個 AI 助手，具備以下能力：\n\n'
  
  if (toolCallSkills.length > 0) {
    prompt += '## 工具調用能力（真實操作）\n\n'
    toolCallSkills.forEach(skill => {
      prompt += skill.systemPromptAddition + '\n'
    })
  }
  
  if (contextSkills.length > 0) {
    prompt += '\n## 上下文信息\n\n'
    contextSkills.forEach(skill => {
      prompt += skill.systemPromptAddition + '\n'
    })
  }

  prompt += `\n---\n\n重要提醒：
- 只有上述列出的能力需要實際的工具/API 調用
- 其他一般任務（寫代碼、分析數據、創作文字等）你本身就具備
- 不要因為某個技能未啟用就拒絕回答，評估是否真的需要工具調用`

  return prompt
}

export function getEnabledSkills(skills: CopilotSkill[]): CopilotSkill[] {
  return skills.filter(skill => skill.enabled)
}

export function getSkillById(id: string): CopilotSkill | undefined {
  return BUILTIN_SKILLS.find(skill => skill.id === id)
}
