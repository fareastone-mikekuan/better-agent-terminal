import { BrowserWindow } from 'electron'
import https from 'https'
import type { CopilotConfig, CopilotChatOptions, CopilotChatResponse } from '../src/types'

const COPILOT_API_BASE = 'https://api.github.com/copilot_internal/v2/chat/completions'

interface CopilotChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  stream: boolean;
}

export class CopilotManager {
  private config: CopilotConfig | null = null
  private window: BrowserWindow
  private activeChats: Map<string, AbortController> = new Map()
  private copilotToken: string | null = null
  private tokenExpiry: number = 0
  private lastAuthToken: string | null = null
  private githubDeviceToken: string | null = null

  constructor(window: BrowserWindow) {
    this.window = window
  }

  private clearCachedTokens(): void {
    this.copilotToken = null
    this.tokenExpiry = 0
    this.lastAuthToken = null
  }

  setConfig(config: CopilotConfig): void {
    const prevApiKey = this.config?.apiKey
    const prevEnabled = this.config?.enabled
    const prevProvider = this.config?.provider

    this.config = config

    const apiKeyChanged = prevApiKey !== config.apiKey
    const enabledChanged = prevEnabled !== config.enabled
    const providerChanged = prevProvider !== config.provider

    // Important: token is cached in-memory; if config changes (logout/login, token update),
    // we must clear caches so requests use the newest token immediately.
    if (apiKeyChanged || enabledChanged || providerChanged) {
      this.clearCachedTokens()
    }

    // On logout/disable, also clear any device-flow token held in memory.
    if (!config.enabled) {
      this.githubDeviceToken = null
      this.clearCachedTokens()
    }
  }

  getConfig(): CopilotConfig | null {
    return this.config
  }

  isEnabled(): boolean {
    return this.config?.enabled === true && (!!this.config?.apiKey || !!this.githubDeviceToken)
  }

  /**
   * Get instructions for manually importing token from VS Code
   * VS Code stores tokens in system keyring, so we guide users to extract it manually
   */
  async getVSCodeTokenInstructions(): Promise<string> {
    const instructions = `
VS Code 將 GitHub token 存儲在系統的安全存儲中（keyring），無法直接讀取。

請按照以下步驟手動獲取 token：

**方法 1：使用 VS Code 開發者工具（推薦）**
1. 在 VS Code 中按 Ctrl+Shift+P（或 Cmd+Shift+P on Mac）
2. 輸入 "Developer: Toggle Developer Tools"
3. 切換到 Console 標籤
4. 輸入以下命令並按 Enter：
   \`\`\`javascript
   copy(await (await fetch('https://api.github.com/copilot_internal/v2/token', {
     headers: { 'Authorization': 'token ' + (await (await fetch('command:github.copilot.chat.feedback')).json()).sessionId }
   })).json())
   \`\`\`
5. Token 會被複製到剪貼板

**方法 2：從 VS Code 設定中查看**
1. 在 VS Code 中按 Ctrl+Shift+P
2. 輸入 "GitHub: View GitHub User"
3. 查看您的 GitHub 帳戶資訊
4. 或使用命令：code --status 查看擴充套件狀態

**方法 3：使用 GitHub CLI（如已安裝）**
\`\`\`bash
gh auth token
\`\`\`

獲取 token 後，請直接貼到下方的 "API Key / Token" 欄位中。
    `.trim()

    return instructions
  }

  /**
   * Open VS Code token helper dialog
   * Since VS Code uses system keyring, we provide a helper method
   */
  async openVSCodeTokenHelper(): Promise<void> {
    const { shell } = require('electron')
    
    // Try to open VS Code documentation
    await shell.openExternal('https://github.com/settings/tokens')
    
    throw new Error(await this.getVSCodeTokenInstructions())
  }

  /**
   * Start GitHub OAuth device flow
   */
  async startDeviceFlow(): Promise<{ userCode: string; verificationUri: string; deviceCode: string }> {
    return new Promise((resolve, reject) => {
      const requestBody = JSON.stringify({
        client_id: 'Ov23li7ONNXhQEmmImcW',
        scope: 'read:user user:email'
      })

      const options = {
        hostname: 'github.com',
        path: '/login/device/code',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'Accept': 'application/json',
          'User-Agent': 'Better-Agent-Terminal/1.0'
        }
      }

      const req = https.request(options, (res: any) => {
        let data = ''
        res.on('data', (chunk: any) => { data += chunk })
        res.on('end', () => {
          if (res.statusCode === 200) {
            const response = JSON.parse(data)
            console.log('Device flow response:', response)
            resolve({
              userCode: response.user_code,
              verificationUri: response.verification_uri,
              deviceCode: response.device_code
            })
          } else {
            console.error('Device flow error:', res.statusCode, data)
            reject(new Error(`Device flow failed: ${res.statusCode}`))
          }
        })
      })

      req.on('error', reject)
      req.write(requestBody)
      req.end()
    })
  }

  /**
   * Complete GitHub OAuth device flow
   */
  async completeDeviceFlow(deviceCode: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const requestBody = JSON.stringify({
        client_id: 'Ov23li7ONNXhQEmmImcW',
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })

      const options = {
        hostname: 'github.com',
        path: '/login/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'Accept': 'application/json'
        }
      }

      const req = https.request(options, (res: any) => {
        let data = ''
        res.on('data', (chunk: any) => { data += chunk })
        res.on('end', () => {
          console.log('Complete device flow response:', data)
          const response = JSON.parse(data)
          if (response.access_token) {
            this.githubDeviceToken = response.access_token
            // Also save to config so it persists
            if (this.config) {
              this.config.apiKey = response.access_token
            }
            this.clearCachedTokens()
            resolve(response.access_token)
          } else if (response.error === 'authorization_pending') {
            reject(new Error('PENDING'))
          } else {
            console.error('Device flow completion error:', response)
            reject(new Error(response.error || 'Unknown error'))
          }
        })
      })

      req.on('error', reject)
      req.write(requestBody)
      req.end()
    })
  }

  /**
   * Get GitHub Copilot token
   * Use OAuth token from device flow or config
   */
  private async getCopilotToken(): Promise<string> {
    // Prefer OAuth token from device flow
    const authToken = this.githubDeviceToken || this.config?.apiKey
    if (!authToken) {
      throw new Error('No GitHub OAuth token available. Please use "🔐 GitHub 登入" button to authenticate.')
    }

    // Check if we have a valid cached token for the same auth token
    if (this.copilotToken && Date.now() < this.tokenExpiry && this.lastAuthToken === authToken) {
      return this.copilotToken
    }

    // Use the OAuth token directly
    this.lastAuthToken = authToken
    this.copilotToken = authToken
    this.tokenExpiry = Date.now() + (25 * 60 * 1000)
    return this.copilotToken
  }

  /**
   * Send a chat message to GitHub Copilot and get response
   * Uses the official Copilot API endpoint
   */
  async chat(chatId: string, options: CopilotChatOptions): Promise<CopilotChatResponse> {
    if (!this.isEnabled()) {
      throw new Error('GitHub Copilot is not configured or enabled')
    }

    try {
      const request: CopilotChatRequest = {
        messages: options.messages,
        model: options.model || this.config?.model || 'gpt-4o',
        temperature: options.temperature ?? 0.7,
        top_p: 1,
        max_tokens: options.maxTokens ?? 2048,
        stream: false
      }

      console.log('[CopilotManager] Using model:', request.model)
      return await this.makeRequest(request)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Copilot chat error:', errorMessage)
      throw error
    }
  }

  /**
   * Stream chat response for real-time output
   */
  async *chatStream(
    chatId: string,
    options: CopilotChatOptions
  ): AsyncGenerator<string, void, unknown> {
    if (!this.isEnabled()) {
      throw new Error('GitHub Copilot is not configured or enabled')
    }

    const controller = new AbortController()
    this.activeChats.set(chatId, controller)

    try {
      const request: CopilotChatRequest = {
        messages: options.messages,
        model: options.model || this.config?.model || 'gpt-4o',
        temperature: options.temperature ?? 0.7,
        top_p: 1,
        max_tokens: options.maxTokens ?? 2048,
        stream: true
      }

      console.log('[CopilotManager] Using model for stream:', request.model)
      yield* this.makeStreamRequest(request, controller.signal)
    } finally {
      this.activeChats.delete(chatId)
    }
  }

  /**
   * Cancel an active chat session
   */
  cancelChat(chatId: string): void {
    const controller = this.activeChats.get(chatId)
    if (controller) {
      controller.abort()
      this.activeChats.delete(chatId)
    }
  }

  /**
   * List available models for the current authenticated Copilot session.
   */
  async listModels(): Promise<string[]> {
    if (!this.isEnabled()) {
      throw new Error('GitHub Copilot is not configured or enabled')
    }

    const copilotToken = await this.getCopilotToken()

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.githubcopilot.com',
        path: '/models',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${copilotToken}`,
          'User-Agent': 'Better-Agent-Terminal/1.0',
          'Accept': 'application/json',
          'Editor-Version': 'vscode/1.85.0',
          'Editor-Plugin-Version': 'copilot-chat/0.11.0',
          'Openai-Organization': this.config?.organizationSlug || 'github-copilot',
          'Openai-Intent': 'conversation-panel',
          'VScode-SessionId': Date.now().toString(),
          'VScode-MachineId': 'better-agent-terminal'
        }
      }

      const req = https.request(options, (res: any) => {
        res.setEncoding('utf8')
        let data = ''

        res.on('data', (chunk: any) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            if (res.statusCode === 401) {
              reject(new Error('GitHub Copilot API key is invalid or expired'))
              return
            }

            if (res.statusCode !== 200) {
              console.error('Copilot models API error:', res.statusCode, data)
              reject(new Error(`GitHub Copilot API error: ${res.statusCode}`))
              return
            }

            const payload = JSON.parse(data)
            const items = Array.isArray(payload) ? payload : payload.data
            if (!Array.isArray(items)) {
              reject(new Error('Unexpected /models response format'))
              return
            }

            const ids = items
              .map((m: any) => (typeof m === 'string' ? m : (m.id || m.model || m.name)))
              .filter(Boolean)

            // Dedupe + stable sort
            const uniqueSorted = Array.from(new Set(ids)).sort()
            resolve(uniqueSorted)
          } catch (error) {
            reject(error)
          }
        })
      })

      req.on('error', reject)
      req.end()
    })
  }

  private async makeRequest(request: CopilotChatRequest): Promise<CopilotChatResponse> {
    const copilotToken = await this.getCopilotToken()
    
    // 調試：檢查 messages 是否為空
    console.log('[CopilotManager] Request messages:', JSON.stringify(request.messages, null, 2))
    
    if (!request.messages || request.messages.length === 0) {
      throw new Error('Messages array is empty. Cannot send request to Copilot API.')
    }
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.githubcopilot.com',
        path: '/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${copilotToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Better-Agent-Terminal/1.0',
          'Accept': 'application/json',
          'Editor-Version': 'vscode/1.85.0',
          'Editor-Plugin-Version': 'copilot-chat/0.11.0',
          'Openai-Organization': this.config?.organizationSlug || 'github-copilot',
          'Openai-Intent': 'conversation-panel',
          'VScode-SessionId': Date.now().toString(),
          'VScode-MachineId': 'better-agent-terminal'
        }
      }

      const req = https.request(options, (res: any) => {
        let data = ''
        
        res.setEncoding('utf8')

        res.on('data', (chunk: any) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            if (res.statusCode === 401) {
              reject(new Error('GitHub Copilot API key is invalid or expired'))
              return
            }

            if (res.statusCode !== 200) {
              console.error('Copilot API error:', res.statusCode, data)
              console.error('[CopilotManager] Request details:', {
                model: request.model,
                hostname: options.hostname,
                path: options.path,
                statusCode: res.statusCode
              })
              try {
                const errorData = JSON.parse(data)
                console.error('[CopilotManager] Error details:', errorData)
                if (errorData.error) {
                  reject(new Error(`GitHub Copilot API error: ${res.statusCode} - ${errorData.error.message || JSON.stringify(errorData.error)}`))
                  return
                }
              } catch (e) {
                // 無法解析錯誤 JSON，使用原始訊息
              }
              reject(new Error(`GitHub Copilot API error: ${res.statusCode}`))
              return
            }

            const response = JSON.parse(data)
            console.log('[CopilotManager] API Response:', {
              model: response.model,
              requestedModel: request.model,
              finishReason: response.choices?.[0]?.finish_reason,
              statusCode: res.statusCode
            })
            console.log('[CopilotManager] Full response structure:', {
              hasChoices: !!response.choices,
              choicesLength: response.choices?.length,
              hasModel: !!response.model,
              modelValue: response.model
            })
            const content = response.choices?.[0]?.message?.content || ''
            const finishReason = response.choices?.[0]?.finish_reason || 'stop'

            resolve({
              content,
              model: response.model, // 返回實際使用的模型
              finishReason: finishReason as 'stop' | 'length' | 'error',
              usage: response.usage
            })
          } catch (error) {
            reject(error)
          }
        })
      })

      req.on('error', reject)
      req.write(JSON.stringify(request))
      req.end()
    })
  }

  private async *makeStreamRequest(
    request: CopilotChatRequest,
    signal: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    const copilotToken = await this.getCopilotToken()
    
    const options = {
      hostname: 'api.githubcopilot.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${copilotToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Better-Agent-Terminal/1.0',
        'Accept': 'text/event-stream',
        'Editor-Version': 'vscode/1.85.0',
        'Editor-Plugin-Version': 'copilot-chat/0.11.0',
        'Openai-Organization': this.config?.organizationSlug || 'github-copilot',
        'Openai-Intent': 'conversation-panel',
        'VScode-SessionId': Date.now().toString(),
        'VScode-MachineId': 'better-agent-terminal'
      }
    }

    const chunks: string[] = []
    let streamEnded = false
    let streamError: Error | null = null

    await new Promise<void>((resolve, reject) => {
      const req = https.request(options, (res: any) => {
        res.setEncoding('utf8')
        let buffer = ''

        if (res.statusCode === 401) {
          streamError = new Error('GitHub Copilot API key is invalid or expired')
          reject(streamError)
          return
        }

        if (res.statusCode !== 200) {
          streamError = new Error(`GitHub Copilot API error: ${res.statusCode}`)
          reject(streamError)
          return
        }

        res.on('data', (chunk: any) => {
          buffer += chunk.toString('utf8')
          const lines = buffer.split('\n')

          // Keep the last incomplete line in buffer
          buffer = lines[lines.length - 1]

          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim()

            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                const content = data.choices?.[0]?.delta?.content

                if (content) {
                  chunks.push(content)
                }
              } catch (e) {
                // Ignore parse errors for keep-alive comments
              }
            }
          }
        })

        res.on('end', () => {
          // Process any remaining buffer
          if (buffer.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(buffer.trim().slice(6))
              const content = data.choices?.[0]?.delta?.content
              if (content) {
                chunks.push(content)
              }
            } catch (e) {
              // Ignore
            }
          }
          streamEnded = true
          resolve()
        })
      })

      signal.addEventListener('abort', () => {
        req.destroy()
        streamError = new Error('Chat cancelled')
        reject(streamError)
      })

      req.on('error', (err: Error) => {
        streamError = err
        reject(err)
      })
      
      req.write(JSON.stringify(request))
      req.end()
    })

    // Yield all collected chunks
    for (const chunk of chunks) {
      yield chunk
    }
  }
}
