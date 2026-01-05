/**
 * 工作流程面板服務
 * 負責在執行工作流程時創建和管理對應的面板
 */

import type { SkillWorkflowStep } from '../types'

export interface PanelCreationConfig {
  command?: string
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
  query?: string
  connection?: string
  path?: string
}

/**
 * 工作流程面板創建回調
 * @param workspaceId 工作區 ID
 * @param type 面板類型
 * @param config 面板配置
 * @returns 創建的面板/終端 ID
 */
export type WorkflowPanelCallback = (
  workspaceId: string,
  type: 'terminal' | 'api' | 'db' | 'web' | 'file',
  config?: PanelCreationConfig
) => Promise<string | null>

let panelCallback: WorkflowPanelCallback | null = null

/**
 * 註冊面板創建回調（由 App.tsx 調用）
 */
export function registerPanelCallback(callback: WorkflowPanelCallback) {
  console.log('[workflow-panel-service] 註冊面板創建回調')
  panelCallback = callback
}

/**
 * 根據工作流程步驟創建對應的面板
 */
export async function createPanelForStep(
  workspaceId: string,
  step: SkillWorkflowStep,
  stepIndex: number
): Promise<string | null> {
  console.log('[workflow-panel-service] createPanelForStep 被調用')
  console.log('[workflow-panel-service] workspaceId:', workspaceId)
  console.log('[workflow-panel-service] step:', step)
  console.log('[workflow-panel-service] panelCallback:', panelCallback ? '已註冊' : '未註冊')
  
  if (!panelCallback) {
    console.error('[workflow-panel-service] Panel callback not registered')
    return null
  }

  try {
    switch (step.type) {
      case 'terminal':
        console.log('[workflow-panel-service] 創建 terminal 面板')
        const terminalId = await panelCallback(workspaceId, 'terminal', {
          command: step.command
        })
        console.log('[workflow-panel-service] terminal 創建完成，返回 ID:', terminalId)
        return terminalId

      case 'api':
        console.log('[workflow-panel-service] 創建 API 面板')
        const apiId = await panelCallback(workspaceId, 'api', {
          method: step.apiMethod,
          url: step.apiUrl,
          headers: step.apiHeaders,
          body: step.apiBody
        })
        console.log('[workflow-panel-service] API 面板創建完成，返回 ID:', apiId)
        return apiId

      case 'db':
        console.log('[workflow-panel-service] 創建 DB 面板')
        const dbId = await panelCallback(workspaceId, 'db', {
          query: step.dbQuery,
          connection: step.dbConnection
        })
        console.log('[workflow-panel-service] DB 面板創建完成，返回 ID:', dbId)
        return dbId

      case 'web':
        console.log('[workflow-panel-service] 創建 WebView 面板')
        const webId = await panelCallback(workspaceId, 'web', {
          url: step.webUrl
        })
        console.log('[workflow-panel-service] WebView 創建完成，返回 ID:', webId)
        return webId

      case 'file':
        console.log('[workflow-panel-service] 創建 File 面板')
        const fileId = await panelCallback(workspaceId, 'file', {
          path: step.filePath
        })
        console.log('[workflow-panel-service] File 面板創建完成，返回 ID:', fileId)
        return fileId

      default:
        console.warn('[workflow-panel-service] 不支持的面板類型:', step.type)
        return null
    }
  } catch (error) {
    console.error('[workflow-panel-service] 創建面板失敗:', error)
    return null
  }
}

/**
 * 執行步驟動作（在面板中）
 * 這個函數用於在面板創建後執行特定動作
 */
export async function executePanelAction(
  terminalId: string,
  step: SkillWorkflowStep
): Promise<boolean> {
  try {
    switch (step.type) {
      case 'terminal':
        // 終端命令已經在創建時執行
        return true

      case 'api':
        // API 請求已通過 custom event 觸發
        console.log('[workflow-panel-service] API 請求已在面板中觸發:', terminalId)
        return true

      case 'db':
        // DB 查詢已通過 custom event 觸發
        console.log('[workflow-panel-service] DB 查詢已在面板中觸發:', terminalId)
        return true

      case 'web':
        // WebView 已自動加載 URL
        return true

      case 'file':
        // 文件操作已通過 custom event 觸發
        console.log('[workflow-panel-service] 文件操作已在面板中觸發:', terminalId)
        return true

      case 'wait':
        // WAIT 類型由 WorkflowExecutor 直接處理
        return true

      default:
        console.warn('[workflow-panel-service] 未知的步驟類型:', step.type)
        return false
    }
  } catch (error) {
    console.error('[workflow-panel-service] 執行面板動作失敗:', error)
    return false
  }
}
