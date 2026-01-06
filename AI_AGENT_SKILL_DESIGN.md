# AI Agent 技能系統設計

## 概念

將技能系統從**自動化腳本**升級為**智能 AI Agent**，能夠：

1. **理解情境** - 分析錯誤、LOG、系統狀態
2. **智能決策** - 利用知識庫和 Prompt 判斷行動
3. **自主執行** - 動態選擇要檢查的資料表、LOG、API
4. **對話互動** - 像維運人員一樣解釋問題並建議解決方案

## 架構設計

### 1. AI Agent 技能類型

```typescript
interface AIAgentSkill {
  id: string
  name: string
  description: string
  type: 'ai-agent'  // 新類型
  
  // Agent 定義
  prompt: {
    role: string              // 角色定義（例如：DevOps Engineer）
    expertise: string[]       // 專業領域
    instructions: string      // 行為指令
    constraints: string[]     // 限制條件
  }
  
  // 知識整合
  knowledgeBaseIds: string[]  // 關聯的知識庫 ID
  
  // 工具權限
  allowedTools: {
    terminal: boolean         // 可執行命令
    fileSystem: boolean       // 可讀寫檔案
    database: boolean         // 可查詢資料庫
    api: boolean             // 可調用 API
    knowledgeBase: boolean   // 可查詢知識庫
  }
  
  // 觸發條件
  triggers: {
    manual: boolean           // 手動觸發
    errorPatterns?: string[]  // 錯誤模式（正則）
    logPatterns?: string[]    // LOG 模式
    events?: string[]         // 系統事件
  }
  
  // 執行配置
  config: {
    maxIterations: number     // 最大思考輪次
    timeout: number           // 超時時間
    requireApproval: boolean  // 是否需要批准
  }
}
```

### 2. 執行流程

```
┌─────────────────────────────────────────┐
│ 1. 觸發 Agent                            │
│    - 用戶手動啟動                        │
│    - 錯誤自動觸發                        │
│    - LOG 模式匹配                        │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 2. Agent 初始化                          │
│    - 載入 Prompt 和角色                  │
│    - 載入關聯的知識庫                    │
│    - 取得當前工作區上下文                │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 3. Agent 推理循環                        │
│    ┌─────────────────────────────┐      │
│    │ a. 分析當前情況              │      │
│    │    - 讀取錯誤訊息            │      │
│    │    - 查看 LOG               │      │
│    │    - 檢查系統狀態            │      │
│    └─────────────────────────────┘      │
│                  ↓                       │
│    ┌─────────────────────────────┐      │
│    │ b. 查詢知識庫                │      │
│    │    - 相關文檔                │      │
│    │    - 最佳實踐                │      │
│    │    - 歷史案例                │      │
│    └─────────────────────────────┘      │
│                  ↓                       │
│    ┌─────────────────────────────┐      │
│    │ c. 決策下一步行動            │      │
│    │    - 查看特定 LOG 檔案       │      │
│    │    - 查詢資料表              │      │
│    │    - 執行診斷命令            │      │
│    └─────────────────────────────┘      │
│                  ↓                       │
│    ┌─────────────────────────────┐      │
│    │ d. 執行行動                  │      │
│    │    （需要用戶批准）          │      │
│    └─────────────────────────────┘      │
│                  ↓                       │
│    └─────────── 重複直到解決 ────────┘   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 4. 生成報告                              │
│    - 問題摘要                            │
│    - 執行的檢查                          │
│    - 發現的問題                          │
│    - 建議的解決方案                      │
└─────────────────────────────────────────┘
```

### 3. UI 設計

#### 技能面板 - AI Agent 模式

```
┌─────────────────────────────────────────┐
│ 🎯 技能                         [收合][×]│
├─────────────────────────────────────────┤
│ 🤖 DevOps 維運 Agent                    │
│ AI 智能診斷和問題排查                    │
│ 關聯知識庫: 3 個                        │
│                                         │
│ ▶ 啟動 Agent                            │
├─────────────────────────────────────────┤
│ Agent 執行中...                         │
│                                         │
│ 🔍 正在分析錯誤訊息...                  │
│ ○ 讀取應用程式 LOG                      │
│ ○ 檢查資料庫連線                        │
│ ○ 查詢錯誤知識庫                        │
│                                         │
│ [暫停] [停止]                           │
├─────────────────────────────────────────┤
│ 💬 Agent 對話                           │
│                                         │
│ Agent: 我檢查了 app.log，發現連線      │
│        timeout 錯誤。建議檢查資料庫     │
│        連線池配置。                      │
│                                         │
│ 建議執行:                               │
│ > SELECT * FROM pg_stat_activity        │
│                                         │
│ [批准執行] [拒絕]                       │
└─────────────────────────────────────────┘
```

## 實現步驟

### Phase 1: 基礎架構（1-2 週）

1. **擴展技能類型**
   - 在 `skill.ts` 添加 `AIAgentSkill` 介面
   - 更新 skill-store 支持新類型

2. **Agent 執行引擎**
   - 創建 `AIAgentExecutor` 組件
   - 整合 Copilot API 進行推理
   - 實現工具調用接口

3. **知識庫整合**
   - 將知識庫內容注入 Agent context
   - 實現知識查詢接口

### Phase 2: 互動界面（1 週）

1. **Agent 面板 UI**
   - 顯示 Agent 思考過程
   - 對話式互動
   - 批准/拒絕行動

2. **執行可視化**
   - 顯示 Agent 正在執行的操作
   - 展示推理鏈（Chain of Thought）
   - 實時反饋

### Phase 3: 進階功能（2-3 週）

1. **Prompt 匯入**
   - 支持從 skillsmp.com 匯入 Prompt
   - 解析 SKILL.md 格式
   - 自動生成 AIAgentSkill 配置

2. **自動觸發**
   - 監控 LOG 文件
   - 錯誤模式匹配
   - 自動啟動對應 Agent

3. **學習和改進**
   - 記錄 Agent 執行歷史
   - 優化 Prompt
   - 累積解決方案知識庫

## 使用範例

### 範例 1: 資料庫問題診斷 Agent

```typescript
const dbDiagnosticAgent: AIAgentSkill = {
  id: 'agent-db-diagnostic',
  name: '資料庫診斷專家',
  description: '自動診斷資料庫連線、效能、死鎖等問題',
  type: 'ai-agent',
  
  prompt: {
    role: 'Database Reliability Engineer',
    expertise: ['PostgreSQL', 'MySQL', 'Connection Pooling', 'Query Optimization'],
    instructions: `
      當檢測到資料庫相關錯誤時：
      1. 檢查應用程式 LOG 中的 SQL 錯誤
      2. 查詢 pg_stat_activity 了解連線狀態
      3. 檢查慢查詢日誌
      4. 分析死鎖情況
      5. 提供優化建議
    `,
    constraints: [
      '不要執行 DELETE 或 DROP 命令',
      '只能讀取 LOG，不能修改',
      '需要用戶批准才能執行 SQL'
    ]
  },
  
  knowledgeBaseIds: [
    'kb-postgresql-docs',
    'kb-db-troubleshooting',
    'kb-production-runbook'
  ],
  
  allowedTools: {
    terminal: true,
    fileSystem: true,   // 讀取 LOG
    database: true,
    api: false,
    knowledgeBase: true
  },
  
  triggers: {
    manual: true,
    errorPatterns: [
      'connection.*timeout',
      'too many connections',
      'deadlock detected'
    ],
    logPatterns: [
      'ERROR.*database',
      'FATAL.*connection'
    ]
  },
  
  config: {
    maxIterations: 10,
    timeout: 300000,  // 5 分鐘
    requireApproval: true
  }
}
```

### 範例 2: 使用流程

```typescript
// 1. 用戶遇到資料庫錯誤
console.error('Database connection timeout')

// 2. 系統自動觸發 Agent（因為匹配到 errorPattern）
const agent = new AIAgentExecutor(dbDiagnosticAgent, workspaceId)

// 3. Agent 開始推理
await agent.execute({
  initialContext: {
    errorMessage: 'Database connection timeout',
    timestamp: Date.now(),
    workspace: currentWorkspace
  }
})

// 4. Agent 執行過程（顯示在面板中）
/*
🔍 Agent 思考:
   - 檢測到連線超時錯誤
   - 需要檢查連線池狀態和活動查詢

📖 查詢知識庫:
   - 找到相關文檔：「PostgreSQL 連線池調優」
   - 參考歷史案例：「上次連線池耗盡的解決方案」

💡 決策:
   1. 查看當前連線數
   2. 檢查是否有長時間執行的查詢
   3. 查看 LOG 中的錯誤模式

🔧 請求執行:
   執行 SQL: SELECT count(*) FROM pg_stat_activity
   [批准] [拒絕]
*/

// 5. 用戶批准後，Agent 繼續
// 6. 最終生成診斷報告
```

## 技術實現

### Agent 推理引擎

```typescript
class AIAgentExecutor {
  private skill: AIAgentSkill
  private workspaceId: string
  private conversationHistory: Message[] = []
  private iterations = 0
  
  async execute(context: AgentContext) {
    // 1. 初始化
    await this.initialize(context)
    
    // 2. 推理循環
    while (this.iterations < this.skill.config.maxIterations) {
      // 思考
      const thought = await this.think()
      
      // 決策
      const action = await this.decide(thought)
      
      // 執行（需批准）
      if (action.requiresApproval) {
        const approved = await this.requestApproval(action)
        if (!approved) continue
      }
      
      const result = await this.executeAction(action)
      
      // 檢查是否完成
      if (result.isComplete) {
        return await this.generateReport()
      }
      
      this.iterations++
    }
  }
  
  private async think(): Promise<Thought> {
    // 使用 Copilot API 進行推理
    const prompt = this.buildPrompt()
    const response = await copilotAPI.chat(prompt)
    return this.parseThought(response)
  }
  
  private buildPrompt(): string {
    return `
${this.skill.prompt.role}

你的專業領域：${this.skill.prompt.expertise.join(', ')}

當前情況：
${this.formatContext()}

知識庫內容：
${this.formatKnowledge()}

對話歷史：
${this.formatHistory()}

指令：
${this.skill.prompt.instructions}

限制：
${this.skill.prompt.constraints.join('\n')}

請分析情況並決定下一步行動。
`
  }
  
  private async executeAction(action: Action) {
    switch (action.type) {
      case 'readLog':
        return await this.readLogFile(action.path)
      case 'queryDatabase':
        return await this.executeQuery(action.sql)
      case 'runCommand':
        return await this.runTerminalCommand(action.command)
      case 'queryKnowledge':
        return await this.searchKnowledgeBase(action.query)
    }
  }
}
```

## 與 skillsmp.com 整合

### 匯入 Prompt 技能

```typescript
async function importSkillFromSMP(skillMdPath: string): Promise<AIAgentSkill> {
  const content = await fs.readFile(skillMdPath, 'utf-8')
  
  // 解析 frontmatter
  const { data, content: markdown } = parseFrontmatter(content)
  
  return {
    id: generateId(),
    name: data.name,
    description: data.description,
    type: 'ai-agent',
    prompt: {
      role: extractRole(markdown),
      expertise: extractExpertise(markdown),
      instructions: extractInstructions(markdown),
      constraints: data['allowed-tools'] || []
    },
    knowledgeBaseIds: [],  // 用戶稍後關聯
    allowedTools: parseAllowedTools(data['allowed-tools']),
    triggers: {
      manual: true,
      errorPatterns: extractTriggerTerms(data.description)
    },
    config: {
      maxIterations: 20,
      timeout: 600000,
      requireApproval: true
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}
```

## 優勢

### vs 固定腳本

| 特性 | 固定腳本 | AI Agent |
|------|---------|---------|
| 靈活性 | ❌ 固定步驟 | ✅ 動態決策 |
| 智能度 | ❌ 無思考 | ✅ 推理分析 |
| 適應性 | ❌ 單一場景 | ✅ 多種情況 |
| 知識利用 | ❌ 無 | ✅ 整合知識庫 |
| 互動性 | ❌ 自動執行 | ✅ 對話式 |

### 實際應用場景

1. **生產環境問題排查**
   - Agent 自動檢查 LOG、資料庫、系統狀態
   - 利用知識庫中的 Runbook
   - 生成診斷報告和解決建議

2. **程式碼審查**
   - Agent 分析程式碼變更
   - 參考最佳實踐知識庫
   - 提供改進建議

3. **部署前檢查**
   - Agent 執行檢查清單
   - 驗證配置、測試、文檔
   - 確保符合規範

## 下一步

1. **您想先實現哪個部分？**
   - [ ] 基礎 AI Agent 架構
   - [ ] Prompt 匯入功能
   - [ ] 知識庫整合
   - [ ] 互動 UI

2. **我可以幫您：**
   - 實現 AIAgentSkill 類型
   - 創建 Agent 執行引擎
   - 設計對話式 UI
   - 整合 Copilot API 進行推理

這樣您的系統就能從「自動化工具」升級為「智能 AI 助手」！
