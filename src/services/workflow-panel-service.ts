/**
 * 工作流程面板服務
 * 負責在執行工作流程時創建和管理對應的面板
 */

import type { SkillWorkflowStep } from '../types'

export interface PanelCreationRequest {
  workspaceId: string
  step: SkillWorkflowStep
  stepIndex: number
}

export interface CreateTerminalRequest {
  workspaceId: string
  type: 'terminal' | 'oracle' | 'webview' | 'file' | 'api'
  title?: string
  command?: string
  url?: string
}

/**
 * 工作流程面板創建回調
 */
export type WorkflowPanelCallback = (request: CreateTerminalRequest) => Promise<string>

let panelCallback: WorkflowPanelCallback | null = null

/**
 * 註冊面板創建回調（由 App.tsx 調用）
 */
export function registerPanelCallback(callback: WorkflowPanelCallback) {
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
  if (!panelCallback) {
    console.error('Panel callback not registered')
    return null
  }

  switch (step.type) {
    case 'terminal':
      // 創建終端面板並執行命令
      return await panelCallback({
        workspaceId,
        type: 'terminal',
        title: step.label || `Step ${stepIndex + 1}: Terminal`,
        command: step.command
      })

    case 'api':
      // 創建 API Tester 面板
      return await panelCallback({
        workspaceId,
        type: 'api',
        title: step.label || `Step ${stepIndex + 1}: API`,
        command: `${step.apiMethod} ${step.apiUrl}`
      })

    case 'db':
      // 創建 Oracle/DB 面板
      return await panelCallback({
        workspaceId,
        type: 'oracle',
        title: step.label || `Step ${stepIndex + 1}: DB`,
        command: step.dbQuery
      })

    case 'web':
      // 創建 WebView 面板
      return await panelCallback({
        workspaceId,
        type: 'webview',
        title: step.label || `Step ${stepIndex + 1}: Web`,
        url: step.webUrl
      })

    case 'file':
      // 創建 File Explorer 面板
      return await panelCallback({
        workspaceId,
        type: 'file',
        title: step.label || `Step ${stepIndex + 1}: File`,
        command: `${step.fileAction} ${step.filePath}`
      })

    case 'wait':
      // WAIT 類型不需要創建面板，在工作流程執行器中處理
      return null

    default:
      console.warn('Unknown step type:', step.type)
      return null
  }
}

/**
 * 執行步驟動作（在面板中）
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
        // TODO: 通知 API 面板執行請求
        console.log('Executing API in panel:', terminalId, step.apiMethod, step.apiUrl)
        return true

      case 'db':
        // TODO: 通知 DB 面板執行查詢
        console.log('Executing DB query in panel:', terminalId, step.dbQuery)
        return true

      case 'web':
        // WebView 已經在創建時載入
        return true

      case 'file':
        // TODO: 通知 File 面板執行操作
        console.log('Executing file action in panel:', terminalId, step.fileAction)
        return true

      default:
        return false
    }
  } catch (error) {
    console.error('Failed to execute panel action:', error)
    return false
  }
}
