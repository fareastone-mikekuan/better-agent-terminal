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
  
  constructor(skill: AIAgentSkill, context: AgentContext) {
    this.skill = skill
    this.context = context
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
          this.state.result = {
            summary: thought.content,
            findings: [],
            recommendations: []
          }
          break
        }
        
        // 決定要執行的動作
        if (thought.type === 'action') {
          const action = await this.parseAction(thought.content)
          
          if (action) {
            // 檢查是否需要批准
            if (this.skill.config?.requireApproval && action.requiresApproval) {
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
    
    // 知識庫
    if (this.context.knowledgeBase.length > 0) {
      systemPrompt += `## 知識庫\n`
      this.context.knowledgeBase.forEach(kb => {
        systemPrompt += `### ${kb.title}\n${kb.content}\n\n`
      })
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
    systemPrompt += `你必須嚴格遵循以下格式之一回應：\n\n`
    systemPrompt += `**格式 1 - 需要執行動作時：**\n`
    systemPrompt += `THOUGHT: [簡短說明你的分析]\n`
    systemPrompt += `ACTION: {"type": "動作類型", "params": {參數}, "description": "說明"}\n\n`
    systemPrompt += `**格式 2 - 任務完成時：**\n`
    systemPrompt += `RESULT: [總結發現和建議]\n\n`
    systemPrompt += `⚠️ 重要提醒：\n`
    systemPrompt += `- 不要只有 THOUGHT 而沒有 ACTION 或 RESULT\n`
    systemPrompt += `- 每次回應必須包含 ACTION（執行某個操作）或 RESULT（任務完成）\n`
    systemPrompt += `- 如果不需要更多資訊，直接給出 RESULT\n`
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
      
      console.log('[AI Agent] AI 回應內容:', content)
      
      // 判斷回應類型
      let thoughtType: 'analysis' | 'action' | 'result' = 'analysis'
      let extractedContent = content
      
      if (content.includes('THOUGHT:')) {
        thoughtType = 'analysis'
        const thought = content.split('THOUGHT:')[1].split('ACTION:')[0].split('RESULT:')[0].trim()
        extractedContent = thought
        console.log('[AI Agent] 檢測到 THOUGHT:', thought)
      } 
      
      if (content.includes('ACTION:')) {
        thoughtType = 'action'
        const action = content.split('ACTION:')[1].split('RESULT:')[0].trim()
        extractedContent = action
        console.log('[AI Agent] 檢測到 ACTION:', action)
      } 
      
      if (content.includes('RESULT:')) {
        thoughtType = 'result'
        const result = content.split('RESULT:')[1].trim()
        extractedContent = result
        console.log('[AI Agent] 檢測到 RESULT:', result)
      }
      
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
        throw new Error(`工具 ${actionData.type} 不在允許列表中`)
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
          return await this.readFile(action.params.path)
          
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
  private async queryDatabase(_query: string): Promise<string> {
    try {
      // 這裡需要整合實際的資料庫查詢功能
      // 暫時返回模擬數據
      return `查詢結果:\n${JSON.stringify({ message: '資料庫功能待實現' }, null, 2)}`
    } catch (error) {
      throw new Error(`資料庫查詢失敗: ${error}`)
    }
  }

  /**
   * 執行命令
   */
  private async runCommand(command: string): Promise<string> {
    try {
      // 使用 pty 執行命令（需要創建臨時 terminal）
      // 暫時返回模擬數據
      return `命令執行結果 (${command}):\n[命令執行功能待實現]`
    } catch (error) {
      throw new Error(`命令執行失敗: ${error}`)
    }
  }

  /**
   * 讀取文件
   */
  private async readFile(path: string): Promise<string> {
    try {
      // 特殊處理：如果請求讀取 terminal buffer
      if (path.startsWith('terminal://')) {
        const terminalId = path.replace('terminal://', '')
        const buffer = this.context.terminalBuffers?.get(terminalId)
        if (buffer) {
          return `Terminal Buffer (最近 50 行):\n${buffer.slice(-50).join('')}`
        }
        return `Terminal buffer not found for: ${terminalId}`
      }
      
      // 實際文件讀取
      if (window.electronAPI?.readFile) {
        const content = await window.electronAPI.readFile(path)
        return `文件內容 (${path}):\n${content}`
      }
      
      return `文件讀取功能不可用 (路徑: ${path})`
    } catch (error) {
      throw new Error(`無法讀取文件: ${error}`)
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
    if (tools.database) {
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
        return allowedTools.database
      case 'makeApiCall':
        return allowedTools.api
      case 'searchKnowledge':
        return allowedTools.knowledgeBase
      default:
        return false
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
