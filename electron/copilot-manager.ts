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

  constructor(window: BrowserWindow) {
    this.window = window
  }

  setConfig(config: CopilotConfig): void {
    this.config = config
  }

  getConfig(): CopilotConfig | null {
    return this.config
  }

  isEnabled(): boolean {
    return this.config?.enabled === true && !!this.config?.apiKey
  }

  /**
   * Send a chat message to GitHub Copilot and get response
   * Uses the official Copilot API endpoint
   */
  async chat(chatId: string, options: CopilotChatOptions): Promise<CopilotChatResponse> {
    if (!this.isEnabled()) {
      throw new Error('GitHub Copilot is not configured or enabled')
    }

    if (!this.config?.apiKey) {
      throw new Error('GitHub Copilot API key is not set')
    }

    try {
      const request: CopilotChatRequest = {
        messages: options.messages,
        model: 'gpt-4',
        temperature: options.temperature ?? 0.7,
        top_p: 1,
        max_tokens: options.maxTokens ?? 2048,
        stream: false
      }

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

    if (!this.config?.apiKey) {
      throw new Error('GitHub Copilot API key is not set')
    }

    const controller = new AbortController()
    this.activeChats.set(chatId, controller)

    try {
      const request: CopilotChatRequest = {
        messages: options.messages,
        model: 'gpt-4',
        temperature: options.temperature ?? 0.7,
        top_p: 1,
        max_tokens: options.maxTokens ?? 2048,
        stream: true
      }

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

  private makeRequest(request: CopilotChatRequest): Promise<CopilotChatResponse> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/copilot_internal/v2/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config?.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Better-Agent-Terminal/1.0',
          'Accept': 'application/json',
          'Editor-Version': '1.0',
          'Editor-Plugin-Version': '1.0',
          'Openai-Organization': this.config?.organizationSlug || 'user'
        }
      }

      const req = https.request(options, (res) => {
        let data = ''

        res.on('data', (chunk) => {
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
              reject(new Error(`GitHub Copilot API error: ${res.statusCode}`))
              return
            }

            const response = JSON.parse(data)
            const content = response.choices?.[0]?.message?.content || ''
            const finishReason = response.choices?.[0]?.finish_reason || 'stop'

            resolve({
              content,
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
    const options = {
      hostname: 'api.github.com',
      path: '/copilot_internal/v2/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config?.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Better-Agent-Terminal/1.0',
        'Accept': 'text/event-stream',
        'Editor-Version': '1.0',
        'Editor-Plugin-Version': '1.0',
        'Openai-Organization': this.config?.organizationSlug || 'user'
      }
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let buffer = ''

        if (res.statusCode === 401) {
          reject(new Error('GitHub Copilot API key is invalid or expired'))
          return
        }

        if (res.statusCode !== 200) {
          reject(new Error(`GitHub Copilot API error: ${res.statusCode}`))
          return
        }

        res.on('data', (chunk) => {
          buffer += chunk.toString()
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
                  // Yield content directly
                  ;(async () => {
                    yield content
                  })().catch(reject)
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
                // Final yield
                ;(async () => {
                  yield content
                })().catch(reject)
              }
            } catch (e) {
              // Ignore
            }
          }
          resolve(undefined)
        })
      })

      signal.addEventListener('abort', () => {
        req.destroy()
        reject(new Error('Chat cancelled'))
      })

      req.on('error', reject)
      req.write(JSON.stringify(request))
      req.end()
    }) as Promise<void> & AsyncIterable<string>
  }
}
