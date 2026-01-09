/**
 * AI Agent 執行引擎
 * 負責執行 AI Agent 技能的推理循環
 */
import type { 
  AIAgentSkill, 
  AgentExecutionState, 
  AgentThought, 
  AgentAction,
  AIAgentTools 
} from '../types/skill'

// Agent 上下文
export interface AgentContext {
  workspaceId: string
  workspaceName: string
  currentPath?: string
  envVars: Array<{ key: string; value: string }>
  terminals?: Array<{
    id: string
    name: string
    lastCommand?: string
    exitCode?: number
  }>
  activeTerminalId?: string | null
  terminalBuffers?: Map<string, string[]>  // terminal ID -> scrollback buffer
  trigger: {
    type: 'manual' | 'error' | 'log' | 'event'
    data?: any
  }
  knowledgeBase: Array<{
    id: string
    title: string
    content: string
  }>
}

// 執行結果
export interface AgentExecutionResult {
  success: boolean
  message: string
  actions: AgentAction[]
  thoughts: AgentThought[]
}

/**
 * AI Agent 執行器
 */
export class AIAgentExecutor {
  private skill: AIAgentSkill
  private context: AgentContext
  private state: AgentExecutionState
  private abortController: AbortController
  private onStateChange?: (state: AgentExecutionState) => void
  
  constructor(skill: AIAgentSkill, context: AgentContext, onStateChange?: (state: AgentExecutionState) => void) {
    this.skill = skill
    this.context = context
    this.onStateChange = onStateChange
    this.abortController = new AbortController()
    this.state = {
      skillId: skill.id,
      status: 'idle',
      currentIteration: 0,
      thoughts: [],
      conversationHistory: []
    }
  }
  
  /**
   * 通知状态变更（用于UI实时更新）
   */
  private notifyStateChange() {
    console.log('[AI Agent] 狀態變更通知, thoughts數量:', this.state.thoughts.length)
    if (this.onStateChange) {
      this.onStateChange({ ...this.state })
    }
  }

  /**
   * 執行 Agent
   */
  async execute(): Promise<AgentExecutionResult> {
    try {
      this.state.status = 'thinking'
      
      // 建構系統提示
      const systemPrompt = this.buildSystemPrompt()
      
      // 建構初始用戶訊息
      const userMessage = this.buildUserMessage()
      
      // 初始化對話歷史
      this.state.conversationHistory = [
        { role: 'system', content: systemPrompt, timestamp: Date.now() },
        { role: 'user', content: userMessage, timestamp: Date.now() }
      ]
      
      // 檢查是否有預定義步驟（用於模擬本地+AI混合流程）
      const expectedSteps = (this.skill as any).config?.expectedSteps
      if (expectedSteps && Array.isArray(expectedSteps)) {
        console.log('[AI Agent] 檢測到預定義步驟，使用混合執行模式')
        return await this.executeWithSteps(expectedSteps)
      }
      
      // 原有的純AI循環邏輯
      // 開始推理循環
      let iteration = 0
      const maxIterations = this.skill.config?.maxIterations || 10
      let consecutiveAnalysisCount = 0 // 追蹤連續分析次數
      
      while (iteration < maxIterations) {
        iteration++
        this.state.currentIteration = iteration
        this.state.status = 'thinking'
        
        // 思考 - 使用 AI 分析當前情況
        const thought = await this.think()
        this.state.thoughts.push(thought)
        
        // 如果只是分析（沒有行動），增加計數
        if (thought.type === 'analysis') {
          consecutiveAnalysisCount++
          
          // 檢查是否包含 CONTINUE（多階段技能的標記）
          if (thought.content.includes('CONTINUE')) {
            // 根據當前進度給出具體指引
            let guidance = ''
            if (iteration >= maxIterations - 1) {
              // 已經是倒數第二次迭代，下次必須完成
              guidance = `你已完成階段 ${iteration}/${maxIterations}。\n\n⚠️ 這是最後一次迭代！請執行最終階段：\n- 如果是帳單生成任務，請生成完整格式化帳單\n- 最後必須使用 RESULT: 格式結束，不要再用 CONTINUE\n- 例如：RESULT: 帳單生成完成，總額$XXX`
            } else {
              // 還有多次迭代，繼續下一階段
              guidance = `你已完成階段 ${iteration}/${maxIterations}。請繼續執行下一階段的步驟。`
            }
            
            this.state.conversationHistory.push({
              role: 'user',
              content: guidance,
              timestamp: Date.now()
            })
            consecutiveAnalysisCount = 0 // 重置計數
            continue
          }
          
          // 如果連續 3 次只分析不行動，強制要求給出結果
          if (consecutiveAnalysisCount >= 3) {
            this.state.conversationHistory.push({
              role: 'user',
              content: '⚠️ 你已經分析了多次但沒有採取行動。請直接使用 RESULT: 格式給出你的結論和建議，或使用 ACTION: 執行一個具體動作。',
              timestamp: Date.now()
            })
            consecutiveAnalysisCount = 0 // 重置計數
            continue
          }
        } else {
          consecutiveAnalysisCount = 0 // 重置計數
        }
        
        // 如果 AI 決定完成
        if (thought.type === 'result') {
          this.state.status = 'completed'
          
          // 只提取 RESULT 部分作為簡短摘要，完整內容保留在 thoughts 中
          let shortSummary = thought.content
          if (thought.content.includes('RESULT:')) {
            const resultPart = thought.content.split('RESULT:').pop()?.trim() || ''
            // 取 RESULT 的第一行或前100個字符作為摘要
            const firstLine = resultPart.split('\n')[0].replace(/```.*$/, '').trim()
            shortSummary = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine
          } else if (thought.content.length > 150) {
            // 如果沒有 RESULT: 標記，取最後一行或截取
            const lines = thought.content.trim().split('\n')
            const lastLine = lines[lines.length - 1].trim()
            shortSummary = lastLine.length > 100 ? lastLine.substring(0, 100) + '...' : lastLine
          }
          
          this.state.result = {
            summary: shortSummary,
            findings: [],
            recommendations: []
          }
          break
        }
        
        // 決定要執行的動作
        if (thought.type === 'action') {
          const action = await this.parseAction(thought.content)
          
          if (action) {
            console.log('[AI Agent] 解析動作:', {
              type: action.type,
              requiresApproval: action.requiresApproval,
              skillRequireApproval: this.skill.config?.requireApproval
            })
            
            // 檢查是否需要批准
            if (this.skill.config?.requireApproval && action.requiresApproval) {
              console.log('[AI Agent] 設置等待批准狀態')
              this.state.status = 'waiting-approval'
              this.state.pendingAction = action
              // 等待外部批准（由 UI 處理）
              return {
                success: false,
                message: '等待批准',
                actions: this.state.thoughts.filter(t => t.type === 'action').map(t => this.parseActionSync(t.content)),
                thoughts: this.state.thoughts
              }
            }
            
            // 執行動作
            this.state.status = 'executing'
            const actionResult = await this.executeAction(action)
            
            // 將結果加入對話歷史
            this.state.conversationHistory.push({
              role: 'assistant',
              content: `執行動作: ${action.type}\n參數: ${JSON.stringify(action.params)}\n結果: ${actionResult}`,
              timestamp: Date.now()
            })
            
            // 加入結果思考
            this.state.thoughts.push({
              type: 'result',
              content: actionResult,
              timestamp: Date.now()
            })
            
            this.state.status = 'thinking'
          }
        }
        
        // 檢查是否超時
        if (this.skill.config?.timeout && Date.now() - this.state.conversationHistory[0].timestamp > this.skill.config.timeout) {
          throw new Error('執行超時')
        }
      }
      
      // 如果達到最大迭代次數仍未完成，強制完成
      if (iteration >= maxIterations && this.state.status !== 'completed') {
        this.state.status = 'completed'
        this.state.result = {
          summary: '已達到最大執行次數。基於目前的分析，任務可能需要更明確的指示或不同的方法。',
          findings: this.state.thoughts.map(t => t.content),
          recommendations: ['請提供更具體的任務描述', '檢查 Agent 的工具權限設定', '考慮調整 maxIterations 設定']
        }
      }
      
      return {
        success: true,
        message: this.state.result?.summary || '執行完成',
        actions: this.state.thoughts.filter(t => t.type === 'action').map(t => this.parseActionSync(t.content)),
        thoughts: this.state.thoughts
      }
      
    } catch (error) {
      this.state.status = 'error'
      return {
        success: false,
        message: error instanceof Error ? error.message : '執行失敗',
        actions: [],
        thoughts: this.state.thoughts
      }
    }
  }

  /**
   * 批准待處理的動作
   */
  async approveAction(): Promise<void> {
    if (!this.state.pendingAction) return
    
    const action = this.state.pendingAction
    this.state.pendingAction = undefined
    this.state.status = 'executing'
    
    const result = await this.executeAction(action)
    
    this.state.conversationHistory.push({
      role: 'assistant',
      content: `執行動作: ${action.type}\n結果: ${result}`,
      timestamp: Date.now()
    })
    
    this.state.status = 'thinking'
  }

  /**
   * 拒絕待處理的動作
   */
  rejectAction(reason?: string): void {
    if (!this.state.pendingAction) return
    
    this.state.conversationHistory.push({
      role: 'user',
      content: `拒絕執行動作: ${this.state.pendingAction.type}${reason ? `\n原因: ${reason}` : ''}`,
      timestamp: Date.now()
    })
    
    this.state.pendingAction = undefined
    this.state.status = 'thinking'
  }

  /**
   * 使用預定義步驟執行（混合本地+AI模式）
   */
  private async executeWithSteps(expectedSteps: any[]): Promise<AgentExecutionResult> {
    console.log('[AI Agent] 開始混合執行模式，共', expectedSteps.length, '個步驟')
    
    let collectedData: any = {}
    
    for (let i = 0; i < expectedSteps.length; i++) {
      const step = expectedSteps[i]
      const isLocalStep = step.label.includes('[本地') || step.label.includes('[本機')
      
      console.log(`[AI Agent] 執行步驟 ${i + 1}/${expectedSteps.length}: ${step.label}`, { isLocalStep })
      
      if (isLocalStep) {
        // 本地步驟：模擬數據讀取
        await new Promise(resolve => setTimeout(resolve, 500)) // 延遲500ms模擬讀取
        
        const mockData = (this.skill as any).mockData
        let thoughtContent = ''
        
        // 根據步驟ID生成對應的模擬內容
        if (step.id === 'customer' && mockData?.account) {
          thoughtContent = `✓ 已讀取客戶資料：${mockData.account.CUST_NAME || mockData.account.COMPANY_NAME || '客戶'}`
          collectedData.account = mockData.account
        } else if (step.id === 'plan' && mockData?.account) {
          thoughtContent = `✓ 已讀取資費方案資訊`
          collectedData.plan = mockData.account
        } else if (step.id === 'charges' && mockData?.charges) {
          const total = Object.values(mockData.charges).reduce((sum: number, val: any) => sum + (typeof val === 'number' ? val : 0), 0)
          thoughtContent = `✓ 已讀取收費項目，共 ${Object.keys(mockData.charges).length} 項，總計 $${total}`
          collectedData.charges = mockData.charges
        } else if (step.id === 'organize') {
          thoughtContent = `✓ 資料整理完成，準備進行計算`
          collectedData.discount = mockData?.discount
          collectedData.tax = mockData?.tax
        } else {
          thoughtContent = `✓ ${step.label.split('[')[0].trim()} 完成`
        }
        
        // 添加本地步驟的 thought
        this.state.thoughts.push({
          type: 'analysis',
          content: thoughtContent,
          timestamp: Date.now()
        })
        
        console.log('[AI Agent] 本地步驟完成:', thoughtContent)
        
      } else {
        // AI步驟：真正調用AI，並顯示標準化的4個子步驟
        console.log('[AI Agent] AI步驟，準備調用Copilot API')
        
        // 根據步驟類型顯示不同的子步驟
        const isCalculateStep = step.label.includes('計算')
        const isGenerateStep = step.label.includes('生成')
        
        // 子步驟1：分析需求
        this.state.thoughts.push({
          type: 'analysis',
          content: isCalculateStep ? '🎯 分析計算需求 [本地算法]' : '🎯 分析生成需求 [本地算法]',
          timestamp: Date.now()
        })
        this.notifyStateChange()
        await new Promise(resolve => setTimeout(resolve, 800))
        
        // ========== 兩階段知識庫查詢（仿 CHAT 機制）==========
        // 第一階段：使用輕量級索引進行匹配
        const searchKeywords = isCalculateStep 
          ? ['計費', '稅率', 'TAX', 'BILL', 'BI', 'CI', 'CHARGE', '帳單', '費用', '價格']
          : ['UBL', 'XML', 'Invoice', '發票', '格式', '帳單', '電信']
        
        // 使用索引資訊進行智能匹配（不載入完整內容）
        interface KnowledgeWithScore {
          kb: typeof this.context.knowledgeBase[0]
          score: number
          matchedKeywords: string[]
        }
        
        const scoredKnowledge: KnowledgeWithScore[] = this.context.knowledgeBase
          .filter(kb => kb && (kb.title || kb.name))
          .map(kb => {
            const titleOrName = (kb.title || kb.name || '').toLowerCase()
            const index = (kb as any).index // KnowledgeIndex
            let score = 0
            const matchedKeywords: string[] = []
            
            // 匹配標題（權重高）
            searchKeywords.forEach(keyword => {
              if (titleOrName.includes(keyword.toLowerCase())) {
                score += 10
                matchedKeywords.push(keyword)
              }
            })
            
            // 匹配索引資訊（如果有）
            if (index) {
              // 匹配索引摘要
              const summary = (index.summary || '').toLowerCase()
              searchKeywords.forEach(keyword => {
                if (summary.includes(keyword.toLowerCase())) {
                  score += 5
                  if (!matchedKeywords.includes(keyword)) matchedKeywords.push(keyword)
                }
              })
              
              // 匹配索引關鍵詞
              const indexKeywords = index.keywords || []
              indexKeywords.forEach((kw: string) => {
                searchKeywords.forEach(sk => {
                  if (kw.toLowerCase().includes(sk.toLowerCase())) {
                    score += 8
                    if (!matchedKeywords.includes(sk)) matchedKeywords.push(sk)
                  }
                })
              })
              
              // 匹配業務流程
              const processes = index.businessProcesses || []
              processes.forEach((proc: string) => {
                searchKeywords.forEach(sk => {
                  if (proc.toLowerCase().includes(sk.toLowerCase())) {
                    score += 6
                    if (!matchedKeywords.includes(sk)) matchedKeywords.push(sk)
                  }
                })
              })
            }
            
            return { kb, score, matchedKeywords }
          })
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score)
        
        // 只取前 3 個最相關的
        const relevantKnowledge = scoredKnowledge.slice(0, 3).map(item => item.kb)
        
        console.log('[AI Agent] 索引匹配結果:', {
          總數: this.context.knowledgeBase.length,
          相關: relevantKnowledge.length,
          關鍵詞: searchKeywords,
          匹配詳情: scoredKnowledge.slice(0, 5).map(item => ({
            title: item.kb.title || item.kb.name,
            score: item.score,
            matched: item.matchedKeywords
          }))
        })
        
        // 子步驟2：顯示索引查詢結果
        this.state.thoughts.push({
          type: 'analysis',
          content: isCalculateStep 
            ? `🔍 查詢計費規則索引 [找到 ${relevantKnowledge.length} 筆相關資料]` 
            : `🔍 查詢 UBL 格式索引 [找到 ${relevantKnowledge.length} 筆相關資料]`,
          timestamp: Date.now()
        })
        this.notifyStateChange()
        await new Promise(resolve => setTimeout(resolve, 800))
        
        // 子步驟3：載入知識摘要（顯示找到的知識標題）
        const knowledgeTitles = relevantKnowledge.slice(0, 3).map(kb => kb.title || kb.name || '未命名').join(', ')
        this.state.thoughts.push({
          type: 'analysis',
          content: relevantKnowledge.length > 0 
            ? `📚 載入知識: ${knowledgeTitles}${relevantKnowledge.length > 3 ? '...' : ''}`
            : isCalculateStep ? '📚 使用內建計費規則 [無額外知識庫]' : '📚 使用 UBL 2.1 標準 [無額外知識庫]',
          timestamp: Date.now()
        })
        this.notifyStateChange()
        await new Promise(resolve => setTimeout(resolve, 800))
        
        // ========== 第二階段：載入精簡的知識內容 ==========
        // 優先使用索引摘要，否則取內容開頭的關鍵部分
        const MAX_KNOWLEDGE_ENTRIES = 3
        const MAX_CHARS_PER_ENTRY = 500  // 單筆最大字符
        const MAX_TOTAL_CHARS = 1200     // 總計最大字符
        
        const knowledgeParts: string[] = []
        let totalChars = 0
        
        for (const kb of relevantKnowledge.slice(0, MAX_KNOWLEDGE_ENTRIES)) {
          if (totalChars >= MAX_TOTAL_CHARS) break
          
          const kbTitle = kb.title || kb.name || '未命名'
          const index = (kb as any).index
          
          let summary = ''
          if (index && index.summary) {
            // 優先使用索引摘要（最精簡）
            summary = index.summary.substring(0, 200)  // 摘要限制 200 字
            if (index.keywords && index.keywords.length > 0) {
              summary += `\n關鍵詞: ${index.keywords.slice(0, 5).join(', ')}`
            }
          } else if (kb.content) {
            // 沒有索引時，取內容開頭
            summary = kb.content.length > MAX_CHARS_PER_ENTRY 
              ? kb.content.substring(0, MAX_CHARS_PER_ENTRY) + '...'
              : kb.content
          }
          
          if (summary) {
            const part = `### ${kbTitle}\n${summary}`
            if (totalChars + part.length <= MAX_TOTAL_CHARS) {
              knowledgeParts.push(part)
              totalChars += part.length
            }
          }
        }
        
        const knowledgeContent = knowledgeParts.join('\n\n---\n\n')
        
        // Debug: 顯示知識庫內容
        console.log('[AI Agent] 知識庫內容長度:', knowledgeContent.length)
        if (knowledgeContent.length > 0) {
          console.log('[AI Agent] 知識庫內容預覽:', knowledgeContent.substring(0, 500))
        }
        
        // 構建AI請求，包含已收集的數據和知識庫內容
        const aiPrompt = isCalculateStep 
          ? `你現在在步驟 ${i + 1}/${expectedSteps.length}: ${step.label}

已收集的數據：
\`\`\`json
${JSON.stringify(collectedData, null, 2)}
\`\`\`

${knowledgeContent ? `## 📚 相關知識庫內容（必須參考）：
${knowledgeContent}

**重要**：請根據上述知識庫中的計費規則和公式進行計算，不要使用通用假設。

` : ''}請根據以上數據進行詳細計算，必須包含：
1. 使用的計費公式
2. 每一步的計算過程（含數字和運算符號）
3. 稅率計算方式
4. 最終總金額

輸出格式要求：
THOUGHT: 
✓ 步驟1 - 基本服務費計算
  公式：BUSINESS_PLAN + VOICE_CHARGE + DATA_CHARGE + DEDICATED_LINE
  計算：1299 + 380 + 850 + 600 = 3129 元

✓ 步驟2 - 企業折扣計算
  公式：VIP_DISCOUNT + LONG_TERM_CONTRACT
  計算：500 + 200 = 700 元

✓ 步驟3 - 折後金額
  公式：基本服務費 - 企業折扣
  計算：3129 - 700 = 2429 元

✓ 步驟4 - 稅額計算
  公式：折後金額 × TAX_RATE
  計算：2429 × 0.05 = 121.45 元

✓ 步驟5 - 應付總額
  公式：折後金額 + 稅額
  計算：2429 + 121.45 = 2550.45 元

RESULT: 帳單總金額為 NT$ 2,550.45 元（含稅）`
          : `你現在在步驟 ${i + 1}/${expectedSteps.length}: ${step.label}

已收集和計算的數據：
\`\`\`json
${JSON.stringify(collectedData, null, 2)}
\`\`\`

${knowledgeContent ? `## 📚 相關知識庫內容（必須參考）：
${knowledgeContent}

` : ''}請根據已計算的數據生成結構化的 JSON 帳單資料，用於產生 PDF 帳單。

**重要**：必須輸出 JSON 格式的帳單資料，不是純文字帳單。

輸出格式：
THOUGHT: [說明帳單內容來源和計算結果]

RESULT:
\`\`\`json
{
  "invoiceNumber": "BB${new Date().toISOString().slice(0,10).replace(/-/g,'')}001",
  "issueDate": "${new Date().toISOString().slice(0,10)}",
  "dueDate": "${new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10)}",
  "customer": {
    "name": "客戶公司名稱",
    "taxId": "統一編號",
    "contact": "聯絡人",
    "phone": "電話"
  },
  "items": [
    { "name": "項目名稱", "quantity": 1, "unitPrice": 金額, "amount": 金額 }
  ],
  "discounts": [
    { "name": "折扣名稱", "amount": 折扣金額 }
  ],
  "subtotal": 小計,
  "totalDiscount": 折扣合計,
  "afterDiscount": 折後金額,
  "taxRate": 0.05,
  "tax": 稅額,
  "total": 應付總額,
  "paymentMethod": "月結付款"
}
\`\`\`

請根據 collectedData 中的實際資料填入上述 JSON 結構。`
        
        this.state.conversationHistory.push({
          role: 'user',
          content: aiPrompt,
          timestamp: Date.now()
        })
        
        // 子步驟4：AI 處理中
        this.state.thoughts.push({
          type: 'analysis',
          content: isCalculateStep ? '✨ AI 執行計算並驗證結果 [AI 處理中...]' : '✨ AI 生成 UBL XML 格式 [AI 處理中...]',
          timestamp: Date.now()
        })
        this.notifyStateChange()
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // 調用AI
        const thought = await this.think()
        
        console.log('[AI Agent] ========= AI返回內容 =========')
        console.log('[AI Agent] thought.type:', thought.type)
        console.log('[AI Agent] thought.content 長度:', thought.content?.length || 0)
        console.log('[AI Agent] thought.content 預覽:', thought.content?.substring(0, 200))
        console.log('[AI Agent] ===============================')
        
        this.state.thoughts.push(thought)
        
        console.log('[AI Agent] AI步驟完成，thought type:', thought.type)
        
        // 如果是最後一個AI步驟且返回result，結束執行
        if (thought.type === 'result' && i === expectedSteps.length - 1) {
          this.state.status = 'completed'
          
          // 提取 RESULT 後面的完整帳單內容作為 summary（給技能面板顯示）
          // 完整的 THOUGHT + RESULT 保留在 thought.content（給詳細記錄顯示）
          let billContent = thought.content
          if (thought.content.includes('RESULT:')) {
            // 提取 RESULT: 後面的所有內容（完整帳單）
            const resultPart = thought.content.split('RESULT:').pop()?.trim() || ''
            // 清理 markdown code block 標記
            billContent = resultPart
              .replace(/^```[\w]*\n?/m, '')  // 開頭的 ```
              .replace(/\n?```$/m, '')       // 結尾的 ```
              .trim()
          }
          
          this.state.result = {
            summary: billContent,  // 完整帳單內容
            findings: [],
            recommendations: []
          }
          
          return {
            success: true,
            message: thought.content,
            actions: [],
            thoughts: this.state.thoughts
          }
        }
      }
    }
    
    // 所有步驟完成
    this.state.status = 'completed'
    const lastThought = this.state.thoughts[this.state.thoughts.length - 1]
    
    return {
      success: true,
      message: lastThought?.content || '執行完成',
      actions: [],
      thoughts: this.state.thoughts
    }
  }

  /**
   * 中止執行
   */
  abort(): void {
    this.abortController.abort()
    this.state.status = 'error'
  }

  /**
   * 獲取當前狀態
   */
  getState(): AgentExecutionState {
    return this.state
  }

  /**
   * 建構系統提示
   */
  private buildSystemPrompt(): string {
    const { prompt, allowedTools } = this.skill
    
    let systemPrompt = `# 角色定義\n${prompt.role}\n\n`
    
    if (prompt.expertise && prompt.expertise.length > 0) {
      systemPrompt += `## 專業領域\n${prompt.expertise.map(e => `- ${e}`).join('\n')}\n\n`
    }
    
    systemPrompt += `## 指令\n${prompt.instructions}\n\n`
    
    if (prompt.constraints && prompt.constraints.length > 0) {
      systemPrompt += `## 限制條件\n${prompt.constraints.map(c => `- ${c}`).join('\n')}\n\n`
    }
    
    // 可用工具
    systemPrompt += `## 可用工具\n`
    const tools = this.getAvailableToolsDescription(allowedTools)
    systemPrompt += tools.map(t => `- ${t}`).join('\n') + '\n\n'
    
    // 被限制的工具
    const restrictedTools = this.getRestrictedToolsDescription(allowedTools)
    if (restrictedTools.length > 0) {
      systemPrompt += `## ⚠️ 被限制的工具（不可使用）\n`
      systemPrompt += restrictedTools.map(t => `- ❌ ${t}`).join('\n') + '\n'
      systemPrompt += `\n**重要**: 如果用戶要求使用以上工具，請明確告知該功能已被限制，並建議替代方案。\n\n`
    }
    
    // 模擬數據（如果技能有提供）
    if ((this.skill as any).mockData) {
      systemPrompt += `## 可用數據 (mockData)\n`
      systemPrompt += `以下是技能提供的數據，請直接使用這些數據進行計算，不需要調用工具讀取：\n\n`
      systemPrompt += '```json\n'
      systemPrompt += JSON.stringify((this.skill as any).mockData, null, 2)
      systemPrompt += '\n```\n\n'
    }
    
    // 知識庫索引（只放摘要，不放完整內容，避免 token 超限）
    if (this.context.knowledgeBase.length > 0) {
      systemPrompt += `## 可用知識庫（${this.context.knowledgeBase.length} 個文件）\n`
      systemPrompt += `以下是可查詢的知識庫列表，在需要時會載入相關內容：\n\n`
      this.context.knowledgeBase.slice(0, 10).forEach((kb, idx) => {
        const title = kb.title || kb.name || '未命名'
        const index = (kb as any).index
        if (index && index.summary) {
          // 有索引時顯示摘要
          systemPrompt += `${idx + 1}. **${title}**\n   摘要: ${index.summary.substring(0, 100)}...\n\n`
        } else {
          // 沒有索引時只顯示標題
          systemPrompt += `${idx + 1}. **${title}**\n\n`
        }
      })
      if (this.context.knowledgeBase.length > 10) {
        systemPrompt += `... 還有 ${this.context.knowledgeBase.length - 10} 個文件\n\n`
      }
    }
    
    // 工作環境
    systemPrompt += `## 當前環境\n`
    systemPrompt += `- 工作區: ${this.context.workspaceName}\n`
    if (this.context.currentPath) {
      systemPrompt += `- 當前路徑: ${this.context.currentPath}\n`
    }
    if (this.context.envVars.length > 0) {
      systemPrompt += `- 環境變數:\n${this.context.envVars.map(e => `  - ${e.key}=${e.value}`).join('\n')}\n`
    }
    
    systemPrompt += `\n## 執行指南\n`
    systemPrompt += `1. 分析問題並理解用戶意圖\n`
    systemPrompt += `2. 查詢知識庫獲取相關資訊\n`
    systemPrompt += `3. 決定需要執行的動作\n`
    systemPrompt += `4. 執行動作並分析結果\n`
    systemPrompt += `5. 根據結果決定下一步或完成任務\n\n`
    
    systemPrompt += `\n## 回應格式要求（重要！）\n`
    systemPrompt += `你必須嚴格遵循以下格式回應：\n\n`
    systemPrompt += `**格式 1 - 需要執行動作時：**\n`
    systemPrompt += `THOUGHT: [簡短說明你的分析]\n`
    systemPrompt += `ACTION: {"type": "動作類型", "params": {參數}, "description": "說明"}\n\n`
    systemPrompt += `**格式 2 - 分析和計算任務時（同時包含 THOUGHT 和 RESULT）：**\n`
    systemPrompt += `THOUGHT:\n`
    systemPrompt += `✓ 步驟1 - 計算項目名稱\n`
    systemPrompt += `  公式：A + B + C\n`
    systemPrompt += `  計算：100 + 200 + 300 = 600 元\n`
    systemPrompt += `✓ 步驟2 - 下一個計算項目\n`
    systemPrompt += `  公式：...\n`
    systemPrompt += `  計算：...\n`
    systemPrompt += `RESULT: [簡短總結最終結果]\n\n`
    systemPrompt += `**格式 3 - 任務完成時：**\n`
    systemPrompt += `RESULT: [總結發現和建議]\n\n`
    systemPrompt += `⚠️ 重要提醒：\n`
    systemPrompt += `- 如果是計算任務，THOUGHT 中必須詳細列出每一步的公式和計算過程\n`
    systemPrompt += `- THOUGHT 和 RESULT 可以同時存在（推薦用於計算任務）\n`
    systemPrompt += `- THOUGHT 包含詳細過程，RESULT 包含簡短結論\n`
    systemPrompt += `- 如果不需要更多資訊，直接給出完整的 THOUGHT + RESULT\n`
    systemPrompt += `- 最多執行 ${this.skill.config?.maxIterations || 10} 個動作後必須給出 RESULT\n`
    
    return systemPrompt
  }

  /**
   * 建構用戶訊息
   */
  private buildUserMessage(): string {
    const { trigger, terminals, activeTerminalId, workspaceName, currentPath } = this.context
    
    let message = ''
    
    // 添加工作區上下文
    message += `📍 當前工作區：${workspaceName}\n`
    if (currentPath) {
      message += `📂 路徑：${currentPath}\n`
    }
    
    // 添加 Terminal 上下文
    if (terminals && terminals.length > 0) {
      message += `\n🖥️ **Terminals 狀態** (共 ${terminals.length} 個)\n`
      terminals.forEach((term, index) => {
        const isActive = term.id === activeTerminalId
        message += `\n${isActive ? '👉 ' : '   '}Terminal ${index + 1}: ${term.name}${isActive ? ' [當前活躍]' : ''}\n`
        if (term.lastCommand) {
          message += `   └─ 最後命令: ${term.lastCommand}\n`
          message += `   └─ 退出代碼: ${term.exitCode ?? 'N/A'}\n`
        } else {
          message += `   └─ (無命令歷史)\n`
        }
      })
      
      if (activeTerminalId) {
        const activeTerm = terminals.find(t => t.id === activeTerminalId)
        if (activeTerm) {
          message += `\n💡 當前聚焦在 "${activeTerm.name}" terminal\n`
          message += `   💾 可以使用 readFile("terminal://${activeTerm.id}") 讀取完整的 terminal 輸出\n`
        }
      } else {
        message += `\n⚠️ 沒有活躍的 terminal\n`
      }
      
      // 如果有多個 terminals，提示 AI 詢問
      if (terminals.length > 1) {
        message += `\n📌 重要：有多個 terminals。如果用戶的任務不明確指定哪個 terminal，請先詢問用戶想分析哪一個。\n`
      }
    } else {
      message += `\n⚠️ 沒有可用的 terminals\n`
    }
    
    message += `\n---\n\n`
    
    switch (trigger.type) {
      case 'manual':
        if (trigger.data?.task) {
          message += `🎯 用戶任務：${trigger.data.task}`
          message += `\n\n請執行以下步驟：`
          message += `\n1. 根據上面的 terminal 狀態分析任務需求`
          message += `\n2. 決定需要執行的動作（讀取日誌、查詢資料等）`
          message += `\n3. 執行動作並分析結果`
          message += `\n4. 給出最終結論和建議`
        } else {
          message += '用戶手動觸發了此技能。'
          if (trigger.data?.message) {
            message += `\n\n用戶訊息: ${trigger.data.message}`
          }
        }
        break
        
      case 'error':
        message = '檢測到錯誤:\n'
        message += `${JSON.stringify(trigger.data, null, 2)}`
        message += '\n\n請分析錯誤原因並提供解決方案。'
        break
        
      case 'log':
        message = '檢測到日誌模式:\n'
        message += `${JSON.stringify(trigger.data, null, 2)}`
        message += '\n\n請分析日誌並判斷是否需要採取行動。'
        break
        
      case 'event':
        message = '檢測到事件:\n'
        message += `${JSON.stringify(trigger.data, null, 2)}`
        message += '\n\n請處理此事件。'
        break
    }
    
    return message
  }

  /**
   * 思考 - 使用 AI 推理
   */
  private async think(): Promise<AgentThought> {
    try {
      // 準備對話訊息
      const messages: Array<{ role: 'user' | 'assistant', content: string }> = []
      
      // 取得系統提示
      const systemMessage = this.state.conversationHistory.find(m => m.role === 'system')
      if (systemMessage) {
        // 將系統提示作為第一條用戶消息
        messages.push({
          role: 'user',
          content: `[系統設定]\n${systemMessage.content}`
        })
      }
      
      // 添加其他對話歷史（排除 system）
      this.state.conversationHistory
        .filter(m => m.role !== 'system')
        .forEach(m => {
          messages.push({
            role: m.role as 'user' | 'assistant',
            content: m.content
          })
        })
      
      // 確保至少有一條消息
      if (messages.length === 0) {
        throw new Error('No messages to send to AI')
      }
      
      // 呼叫 Copilot API
      const chatId = `agent-${this.skill.id}-${Date.now()}`
      const response = await window.electronAPI.copilot.chat(chatId, {
        messages,
        temperature: 0.7,
        maxTokens: 2048
      })
      
      console.log('[AI Agent] Copilot API 響應:', response)
      
      // 檢查回應
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response from Copilot API')
      }
      
      // 解析回應內容（Copilot API 返回 {content, model, finishReason}）
      const content = (typeof response === 'string' ? response : response.content)?.trim() || ''
      
      if (!content) {
        console.error('[AI Agent] 空響應，完整 response:', JSON.stringify(response, null, 2))
        throw new Error('Empty response from Copilot API')
      }
      
      console.log('[AI Agent] AI 回應內容:', content)
      
      // 判斷回應類型並保留完整內容
      let thoughtType: 'analysis' | 'action' | 'result' = 'analysis'
      let extractedContent = content
      
      // 檢查是否包含 RESULT（最終結果）
      if (content.includes('RESULT:')) {
        thoughtType = 'result'
        // 保留完整內容（包含 THOUGHT 和 RESULT）
        extractedContent = content
        console.log('[AI Agent] 檢測到最終結果（RESULT）')
      } else if (content.includes('THOUGHT:')) {
        thoughtType = 'analysis'
        // 保留完整 THOUGHT 內容（多行計算過程）
        extractedContent = content
        console.log('[AI Agent] 檢測到思考過程（THOUGHT）')
      } else if (content.includes('ACTION:')) {
        thoughtType = 'action'
        const action = content.split('ACTION:')[1].trim()
        extractedContent = action
        console.log('[AI Agent] 檢測到動作（ACTION）')
      }
      
      console.log('[AI Agent] 提取的內容長度:', extractedContent.length)
      
      if (!content.includes('THOUGHT:') && !content.includes('ACTION:') && !content.includes('RESULT:')) {
        console.warn('[AI Agent] ⚠️ AI 回應沒有使用正確的格式（缺少 THOUGHT:/ACTION:/RESULT:），將視為分析')
        console.warn('[AI Agent] 原始內容:', content)
      }
      
      return {
        type: thoughtType,
        content: extractedContent,
        timestamp: Date.now()
      }
      
    } catch (error) {
      throw new Error(`AI 推理失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  /**
   * 解析動作（異步）
   */
  private async parseAction(actionStr: string): Promise<AgentAction | null> {
    try {
      // 嘗試解析 JSON
      const actionData = JSON.parse(actionStr)
      
      // 檢查工具權限
      if (!this.isToolAllowed(actionData.type)) {
        const suggestion = this.getAlternativeSuggestion(actionData.type)
        throw new Error(`⚠️ 權限拒絕: 工具 "${actionData.type}" 已被技能配置禁止使用。\n\n${suggestion}`)
      }
      
      const action: AgentAction = {
        id: `action-${Date.now()}`,
        type: actionData.type,
        description: actionData.description || `執行 ${actionData.type}`,
        params: actionData.params || {},
        requiresApproval: this.isActionDangerous(actionData.type)
      }
      
      return action
      
    } catch (error) {
      console.error('解析動作失敗:', error)
      return null
    }
  }

  /**
   * 解析動作（同步，用於結果統計）
   */
  private parseActionSync(actionStr: string): AgentAction {
    try {
      const actionData = JSON.parse(actionStr)
      return {
        id: `action-${Date.now()}`,
        type: actionData.type || 'readFile',
        description: actionData.description || `執行 ${actionData.type}`,
        params: actionData.params || {},
        requiresApproval: this.isActionDangerous(actionData.type)
      }
    } catch {
      return {
        id: `action-${Date.now()}`,
        type: 'readFile',
        description: '解析失敗',
        params: {},
        requiresApproval: false
      }
    }
  }

  /**
   * 執行動作
   */
  private async executeAction(action: AgentAction): Promise<string> {
    try {
      switch (action.type) {
        case 'readLog':
          return await this.readLog(action.params.path)
          
        case 'queryDatabase':
          return await this.queryDatabase(action.params.query || '')
          
        case 'runCommand':
          return await this.runCommand(action.params.command)
          
        case 'readFile':
          // 支持多種參數名稱：path, filePath, filepath
          return await this.readFile(action.params.path || action.params.filePath || action.params.filepath)
          
        case 'writeFile':
          return await this.writeFile(action.params.path || action.params.filePath, action.params.content)
          
        case 'queryKnowledge':
          return await this.searchKnowledge(action.params.query)
          
        case 'callAPI':
          return await this.makeApiCall(action.params.url, action.params.method, action.params.data)
          
        default:
          throw new Error(`不支持的動作類型: ${action.type}`)
      }
    } catch (error) {
      return `執行失敗: ${error instanceof Error ? error.message : '未知錯誤'}`
    }
  }

  /**
   * 讀取日誌
   */
  private async readLog(path: string): Promise<string> {
    try {
      // 使用 Node.js fs 模塊讀取文件（需要在 preload 中暴露）
      // 暫時返回模擬數據
      return `日誌內容 (${path}):\n[日誌讀取功能待實現]`
    } catch (error) {
      throw new Error(`無法讀取日誌: ${error}`)
    }
  }

  /**
   * 查詢資料庫
   */
  private async queryDatabase(query: string): Promise<string> {
    try {
      console.log('[AI Agent] 執行資料庫查詢:', query)
      
      // 使用 Electron IPC 執行資料庫查詢
      if (!window.electronAPI?.skill?.executeDbQuery) {
        return '❌ 資料庫功能不可用：缺少 executeDbQuery API'
      }
      
      // 從 skill 獲取資料庫連接配置
      const dbConfig = this.skill.allowedTools.database
      let connectionInfo: any = undefined
      
      if (dbConfig && typeof dbConfig === 'object' && 'enabled' in dbConfig) {
        if (dbConfig.enabled && dbConfig.host) {
          connectionInfo = {
            type: dbConfig.type || 'oracle',
            host: dbConfig.host,
            port: dbConfig.port,
            username: dbConfig.username,
            password: dbConfig.password,
            database: dbConfig.database
          }
          console.log('[AI Agent] 使用 Agent 配置的資料庫連接:', { 
            type: connectionInfo.type, 
            host: connectionInfo.host, 
            port: connectionInfo.port 
          })
        }
      }
      
      // executeDbQuery 需要 { connection?, query } 參數格式
      const result = await window.electronAPI.skill.executeDbQuery({ 
        connection: connectionInfo,
        query 
      })
      console.log('[AI Agent] 資料庫查詢結果:', result)
      
      if (!result.success) {
        return `❌ 資料庫查詢失敗: ${result.error || '未知錯誤'}`
      }
      
      // 格式化結果
      const rows = result.data || []
      if (rows.length === 0) {
        return '✅ 查詢成功，但沒有返回數據'
      }
      
      // 限制顯示行數避免輸出過長
      const displayRows = rows.slice(0, 10)
      const hasMore = rows.length > 10
      
      return `✅ 查詢成功 (共 ${rows.length} 行${hasMore ? '，僅顯示前 10 行' : ''}):\n${JSON.stringify(displayRows, null, 2)}`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知錯誤'
      console.error('[AI Agent] 資料庫查詢錯誤:', errorMsg)
      return `❌ 資料庫查詢失敗: ${errorMsg}`
    }
  }

  /**
   * 執行命令
   */
  private async runCommand(command: string): Promise<string> {
    try {
      console.log('[AI Agent] 執行命令:', command)
      
      // 使用當前活動的 terminal 執行命令
      const terminalId = this.context.activeTerminalId
      if (!terminalId) {
        return '❌ 無法執行命令：沒有活動的 terminal'
      }
      
      // 使用 Electron IPC 在 terminal 中執行命令
      if (!window.electronAPI?.pty?.write) {
        return '❌ 命令執行功能不可用：缺少 pty.write API'
      }
      
      // 寫入命令到 terminal
      await window.electronAPI.pty.write(terminalId, command + '\r')
      
      // 等待一段時間讓命令執行
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // 讀取 terminal 輸出
      const buffer = this.context.terminalBuffers?.get(terminalId)
      if (buffer) {
        const recentOutput = buffer.slice(-20).join('')
        return `✅ 命令已執行: ${command}\n\n最近輸出:\n${recentOutput}`
      }
      
      return `✅ 命令已發送到 terminal: ${command}`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知錯誤'
      console.error('[AI Agent] 命令執行錯誤:', errorMsg)
      return `❌ 命令執行失敗: ${errorMsg}`
    }
  }

  /**
   * 讀取文件
   */
  private async readFile(path: string): Promise<string> {
    try {
      // 參數驗證
      if (!path) {
        return '❌ 文件讀取失敗: 未提供文件路徑'
      }
      
      // 特殊處理：如果請求讀取 terminal buffer
      if (path.startsWith('terminal://')) {
        const terminalId = path.replace('terminal://', '')
        const buffer = this.context.terminalBuffers?.get(terminalId)
        if (buffer) {
          return `Terminal Buffer (最近 50 行):\n${buffer.slice(-50).join('')}`
        }
        return `❌ Terminal buffer not found for: ${terminalId}`
      }
      
      // 實際文件讀取
      if (window.electronAPI?.fs?.readFile) {
        const result = await window.electronAPI.fs.readFile(path, this.context.currentPath || '')
        if (!result.success) {
          return `❌ 文件讀取失敗: ${result.error || '未知錯誤'}`
        }
        return `✅ 文件內容 (${path}):\n${result.content || ''}`
      }
      
      return `❌ 文件讀取功能不可用 (路徑: ${path})`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知錯誤'
      console.error('[AI Agent] 文件讀取錯誤:', errorMsg)
      return `❌ 文件讀取失敗: ${errorMsg}`
    }
  }

  /**
   * 寫入文件
   */
  private async writeFile(path: string, content: string): Promise<string> {
    try {
      console.log('[AI Agent] 寫入文件:', path)
      
      // 使用 Electron IPC 寫入文件
      if (!window.electronAPI?.fs?.writeFile) {
        return '❌ 文件寫入功能不可用：缺少 fs.writeFile API'
      }
      
      const result = await window.electronAPI.fs.writeFile(path, content)
      
      if (!result.success) {
        return `❌ 文件寫入失敗: ${result.error || '未知錯誤'}`
      }
      
      console.log('[AI Agent] 文件寫入成功:', path)
      
      return `✅ 文件寫入成功: ${path}\n\n內容長度: ${content.length} 字符`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知錯誤'
      console.error('[AI Agent] 文件寫入錯誤:', errorMsg)
      return `❌ 文件寫入失敗: ${errorMsg}`
    }
  }

  /**
   * 搜尋知識庫
   */
  private async searchKnowledge(query: string): Promise<string> {
    const results = this.context.knowledgeBase.filter(kb => 
      kb.title.toLowerCase().includes(query.toLowerCase()) ||
      kb.content.toLowerCase().includes(query.toLowerCase())
    )
    
    if (results.length === 0) {
      return '未找到相關知識'
    }
    
    return `找到 ${results.length} 條相關知識:\n${results.map(r => `- ${r.title}`).join('\n')}`
  }

  /**
   * 呼叫 API
   */
  private async makeApiCall(url: string, method: string, data?: any): Promise<string> {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: data ? JSON.stringify(data) : undefined
      })
      
      const result = await response.json()
      return `API 回應:\n${JSON.stringify(result, null, 2)}`
    } catch (error) {
      throw new Error(`API 呼叫失敗: ${error}`)
    }
  }

  /**
   * 獲取可用工具描述
   */
  private getAvailableToolsDescription(tools: AIAgentTools): string[] {
    const descriptions: string[] = []
    
    if (tools.terminal) {
      descriptions.push('runCommand: 執行終端命令')
    }
    if (tools.fileSystem) {
      descriptions.push('readFile: 讀取文件')
      descriptions.push('writeFile: 寫入文件')
      descriptions.push('readLog: 讀取日誌')
    }
    // 檢查 database 是否可用（支持 boolean 或 DatabaseConfig）
    const isDatabaseEnabled = typeof tools.database === 'boolean' 
      ? tools.database 
      : tools.database?.enabled
    if (isDatabaseEnabled) {
      descriptions.push('queryDatabase: 查詢資料庫')
    }
    if (tools.api) {
      descriptions.push('makeApiCall: 呼叫 API')
    }
    if (tools.knowledgeBase) {
      descriptions.push('searchKnowledge: 搜尋知識庫')
    }
    
    return descriptions
  }

  /**
   * 獲取被限制的工具描述
   */
  private getRestrictedToolsDescription(tools: any): string[] {
    const descriptions: string[] = []
    
    if (!tools.terminal) {
      descriptions.push('runCommand: 執行終端命令（原因：技能配置禁止）')
    }
    if (!tools.fileSystem) {
      descriptions.push('readFile/writeFile: 讀寫文件（原因：技能配置禁止）')
    }
    // 檢查 database 是否被禁用
    const isDatabaseEnabled = typeof tools.database === 'boolean' 
      ? tools.database 
      : tools.database?.enabled
    if (!isDatabaseEnabled) {
      descriptions.push('queryDatabase: 查詢資料庫（原因：技能配置禁止）')
    }
    if (!tools.api) {
      descriptions.push('makeApiCall: 呼叫 API（原因：技能配置禁止）')
    }
    if (!tools.knowledgeBase) {
      descriptions.push('searchKnowledge: 搜尋知識庫（原因：技能配置禁止）')
    }
    
    return descriptions
  }

  /**
   * 檢查工具是否允許
   */
  private isToolAllowed(actionType: string): boolean {
    const { allowedTools } = this.skill
    
    switch (actionType) {
      case 'runCommand':
        return allowedTools.terminal
      case 'readFile':
      case 'writeFile':
      case 'readLog':
        return allowedTools.fileSystem
      case 'queryDatabase':
        // 支持 boolean 或 DatabaseConfig 格式
        return typeof allowedTools.database === 'boolean' 
          ? allowedTools.database 
          : allowedTools.database?.enabled || false
      case 'makeApiCall':
        return allowedTools.api
      case 'searchKnowledge':
        return allowedTools.knowledgeBase
      default:
        return false
    }
  }

  /**
   * 獲取工具被禁止時的替代方案建議
   */
  private getAlternativeSuggestion(actionType: string): string {
    switch (actionType) {
      case 'queryDatabase':
        return `💡 替代方案:\n` +
               `1. 檢查 terminal 中是否有資料庫查詢結果\n` +
               `2. 讀取資料庫日誌文件（如果 fileSystem 權限可用）\n` +
               `3. 建議用戶手動執行查詢並貼上結果\n` +
               `4. 或請管理員修改技能配置，啟用 database 權限`
      case 'runCommand':
        return `💡 替代方案:\n` +
               `1. 讀取相關日誌或配置文件（如果 fileSystem 權限可用）\n` +
               `2. 建議用戶手動執行命令並提供輸出\n` +
               `3. 或請管理員修改技能配置，啟用 terminal 權限`
      case 'makeApiCall':
        return `💡 替代方案:\n` +
               `1. 建議用戶使用 curl 或 PowerShell 手動呼叫 API\n` +
               `2. 或請管理員修改技能配置，啟用 api 權限`
      case 'readFile':
      case 'writeFile':
        return `💡 替代方案:\n` +
               `1. 建議用戶手動檢查或修改文件\n` +
               `2. 或請管理員修改技能配置，啟用 fileSystem 權限`
      default:
        return `請檢查技能配置的 allowedTools 設定。`
    }
  }

  /**
   * 判斷動作是否危險
   */
  private isActionDangerous(actionType: string): boolean {
    const dangerousActions = ['writeFile', 'runCommand', 'queryDatabase']
    return dangerousActions.includes(actionType)
  }
}
