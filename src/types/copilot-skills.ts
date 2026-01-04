/**
 * Copilot Skills 定義
 * 為 AI 賦予不同的能力
 */

export interface CopilotSkill {
  id: string
  name: string
  description: string
  category: 'terminal' | 'database' | 'web' | 'file' | 'code' | 'system'
  icon: string
  enabled: boolean
  systemPromptAddition: string
  examples?: string[]
}

export const BUILTIN_SKILLS: CopilotSkill[] = [
  {
    id: 'terminal-commands',
    name: '終端命令執行',
    description: '執行 Shell 命令並分析輸出',
    category: 'terminal',
    icon: '💻',
    enabled: true,
    systemPromptAddition: `
你可以執行終端命令：
- 提供命令代碼塊（\`\`\`bash 或 \`\`\`powershell）
- 用戶點擊執行按鈕後，命令會在終端中執行
- 自動獲取輸出並分析結果
- 根據輸出提供下一步建議

範例：
- 檢查文件：\`ls\`, \`dir\`, \`Get-ChildItem\`
- 搜索內容：\`grep\`, \`Select-String\`
- Git 操作：\`git status\`, \`git log\`
`,
    examples: [
      'ls -la',
      'git status',
      'npm install'
    ]
  },
  {
    id: 'file-operations',
    name: '文件操作',
    description: '讀取、分析文件內容',
    category: 'file',
    icon: '📁',
    enabled: true,
    systemPromptAddition: `
你可以操作文件：
- 讀取文件內容並分析
- 搜索文件中的特定內容
- 提供文件結構建議
- 分析代碼文件

用戶可以：
- 在文件面板右鍵點擊文件選擇「AI 分析」
- 直接在聊天中請求分析特定文件
`,
    examples: [
      'cat package.json',
      'type README.md',
      'Get-Content config.ts'
    ]
  },
  {
    id: 'database-query',
    name: '資料庫查詢',
    description: 'Oracle 資料庫查詢與分析',
    category: 'database',
    icon: '🗄️',
    enabled: true,
    systemPromptAddition: `
你可以執行資料庫操作：
- 提供 SQL 查詢語句
- 分析查詢結果
- 優化 SQL 性能
- 解釋資料結構

支援的資料庫：
- Oracle Database

範例查詢：
- SELECT * FROM users WHERE status = 'active'
- EXPLAIN PLAN FOR SELECT ...
`,
    examples: [
      'SELECT * FROM users LIMIT 10',
      'DESCRIBE table_name',
      'SHOW TABLES'
    ]
  },
  {
    id: 'web-content',
    name: '網頁內容分析',
    description: '讀取並分析網頁內容',
    category: 'web',
    icon: '🌐',
    enabled: true,
    systemPromptAddition: `
你可以分析網頁內容：
- 用戶可以導入網頁內容供你分析
- 提供網頁摘要與關鍵信息提取
- 分析網頁結構與技術
- 提供相關建議

用戶操作：
- 在網頁面板中點擊「讀取網頁內容」
- 網頁內容會自動發送給你分析
`,
    examples: [
      '分析這個網頁的主要內容',
      '提取網頁中的技術資訊',
      '總結網頁重點'
    ]
  },
  {
    id: 'code-analysis',
    name: '代碼分析',
    description: '分析代碼、提供重構建議',
    category: 'code',
    icon: '🔍',
    enabled: true,
    systemPromptAddition: `
你可以分析代碼：
- 理解代碼邏輯與架構
- 發現潛在問題與 bugs
- 提供重構建議
- 優化性能
- 解釋複雜代碼段

支援語言：
- TypeScript/JavaScript
- Python
- Java
- C/C++
- Shell Script
- SQL
`,
    examples: [
      '分析這段代碼的性能問題',
      '重構這個函數',
      '解釋這段代碼在做什麼'
    ]
  },
  {
    id: 'api-testing',
    name: 'API 測試',
    description: '構建和測試 HTTP API 請求',
    category: 'system',
    icon: '🔌',
    enabled: true,
    systemPromptAddition: `
你可以幫助 API 測試：
- 構建 HTTP 請求（GET、POST、PUT、DELETE）
- 分析 API 響應
- 提供 API 使用建議
- 幫助調試 API 問題

用戶可以在 API 測試面板中：
- 設定 URL、方法、Headers、Body
- 執行請求並查看結果
`,
    examples: [
      '如何測試這個 REST API',
      '這個 API 響應有什麼問題',
      '構建一個 POST 請求'
    ]
  },
  {
    id: 'environment-config',
    name: '環境配置管理',
    description: '管理環境變數和配置',
    category: 'system',
    icon: '⚙️',
    enabled: true,
    systemPromptAddition: `
你可以幫助管理環境配置：
- 建議環境變數設定
- 解釋配置文件
- 提供最佳實踐
- 幫助調試環境問題

系統支援：
- 全域環境變數
- 工作區專屬環境變數
- Shell 路徑配置
`,
    examples: [
      '如何設定 NODE_ENV',
      'PATH 環境變數配置',
      '.env 文件最佳實踐'
    ]
  },
  {
    id: 'git-operations',
    name: 'Git 操作',
    description: 'Git 版本控制協助',
    category: 'terminal',
    icon: '📦',
    enabled: true,
    systemPromptAddition: `
你可以協助 Git 操作：
- 提供 Git 命令建議
- 解決合併衝突
- 分析 Git 歷史
- Commit 訊息建議
- 分支管理策略

常用命令：
- git status, git log
- git add, git commit
- git branch, git merge
- git push, git pull
`,
    examples: [
      'git log --oneline -10',
      'git diff HEAD~1',
      'git branch -a'
    ]
  },
  {
    id: 'package-management',
    name: '套件管理',
    description: 'npm/pip/等套件管理協助',
    category: 'terminal',
    icon: '📦',
    enabled: true,
    systemPromptAddition: `
你可以協助套件管理：
- npm/yarn/pnpm 操作
- pip/poetry (Python)
- 套件版本管理
- 依賴問題解決
- package.json 優化

常用命令：
- npm install/update/uninstall
- npm run scripts
- package.json 配置
`,
    examples: [
      'npm install express',
      'npm outdated',
      'npm run build'
    ]
  }
]

export function getEnabledSkills(skills: CopilotSkill[]): CopilotSkill[] {
  return skills.filter(skill => skill.enabled)
}

export function getSkillById(id: string): CopilotSkill | undefined {
  return BUILTIN_SKILLS.find(skill => skill.id === id)
}

export function buildSystemPromptFromSkills(enabledSkills: CopilotSkill[]): string {
  if (enabledSkills.length === 0) {
    return '你是一個智能助手。'
  }

  // 簡化版本：只列出能力名稱和簡短描述，不包含詳細的 systemPromptAddition
  const skillsList = enabledSkills
    .map(skill => `• ${skill.icon} **${skill.name}**：${skill.description}`)
    .join('\n')

  return `你擁有以下能力：

${skillsList}

請根據用戶需求靈活運用這些能力。`
}
