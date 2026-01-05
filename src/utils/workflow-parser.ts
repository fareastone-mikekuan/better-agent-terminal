import type { SkillWorkflowStep } from '../types'

/**
 * 從 skill.md 檔案內容解析工作流程步驟
 * 
 * 格式範例：
 * ## Workflow
 * 
 * 1. [API] POST /api/deploy - 觸發部署
 * 2. [FILE] download /logs/deploy.log - 下載日誌
 * 3. [DB] SELECT * FROM deployments ORDER BY created_at DESC LIMIT 1 - 查詢狀態
 * 4. [WEB] https://status.example.com/deploy - 開啟監控
 * 5. [TERMINAL] tail -f deploy.log - 監看日誌
 * 6. [WAIT] log_contains "Deployment completed successfully" - 等待完成
 */
export function parseWorkflowFromMarkdown(content: string): SkillWorkflowStep[] {
  const steps: SkillWorkflowStep[] = []
  
  // 找到 Workflow 區塊
  const workflowMatch = content.match(/##\s+Workflow\s*\n([\s\S]*?)(?=\n##|\n---|\n```|$)/i)
  if (!workflowMatch) {
    return steps
  }
  
  const workflowContent = workflowMatch[1]
  
  // 解析每一行
  const lines = workflowContent.split('\n')
  
  for (const line of lines) {
    // 匹配格式: 1. [TYPE] content - description
    const match = line.match(/^\s*\d+\.\s*\[(\w+)\]\s+(.+?)\s*(?:-\s*(.+))?$/)
    if (!match) continue
    
    const [, type, content, description] = match
    const typeUpper = type.toUpperCase()
    const label = description || content
    
    let step: SkillWorkflowStep | null = null
    
    switch (typeUpper) {
      case 'TERMINAL':
        step = {
          type: 'terminal',
          label,
          command: content.trim()
        }
        break
        
      case 'API': {
        // 解析 API: METHOD URL [body]
        // 支持两种格式：
        // 1. POST https://api.com/endpoint {"key":"value"}
        // 2. POST https://api.com/endpoint (无 body)
        const apiMatch = content.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\S+)(.*)$/i)
        if (apiMatch) {
          const [, method, url, bodyPart] = apiMatch
          // 提取 body（去除前导空格，但保留 JSON 内的空格）
          const body = bodyPart.trim() || undefined
          step = {
            type: 'api',
            label,
            apiMethod: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
            apiUrl: url,
            apiBody: body
          }
        }
        break
      }
        
      case 'DB': {
        // 支持两种格式：
        // 1. [DB] SELECT * FROM users - 使用默认连接
        // 2. [DB:connection_name] SELECT * FROM users - 指定连接名称
        const dbConnectionMatch = type.match(/^DB:(.+)$/i)
        const connectionName = dbConnectionMatch ? dbConnectionMatch[1] : undefined
        
        step = {
          type: 'db',
          label,
          dbQuery: content.trim(),
          dbConnection: connectionName
        }
        break
      }
        break
        
      case 'WEB':
        step = {
          type: 'web',
          label,
          webUrl: content.trim()
        }
        break
        
      case 'FILE': {
        // 解析 FILE: action path
        const fileMatch = content.match(/^(download|upload|open)\s+(.+)$/i)
        if (fileMatch) {
          const [, action, path] = fileMatch
          step = {
            type: 'file',
            label,
            fileAction: action.toLowerCase() as 'download' | 'upload' | 'open',
            filePath: path.trim()
          }
        }
        break
      }
        
      case 'WAIT': {
        // 解析 WAIT: condition target [timeout]
        const waitMatch = content.match(/^(log_contains|api_status|file_exists|time)\s+["]?([^"]+)["]?(?:\s+(\d+))?$/i)
        if (waitMatch) {
          const [, condition, target, timeout] = waitMatch
          step = {
            type: 'wait',
            label,
            waitCondition: condition.toLowerCase() as 'log_contains' | 'api_status' | 'file_exists' | 'time',
            waitTarget: target.trim(),
            waitTimeout: timeout ? parseInt(timeout) : 300
          }
        }
        break
      }
    }
    
    if (step) {
      steps.push(step)
    }
  }
  
  return steps
}

/**
 * 生成 skill.md 模板（包含 Workflow 範例）
 */
export function generateSkillTemplate(name: string): string {
  return `# ${name}

## 功能描述
這個技能的主要功能和用途

## Workflow

以下步驟將按順序自動執行：

1. [TERMINAL] npm run build - 建置專案
2. [API] POST http://localhost:3000/api/deploy {"version": "1.0.0"} - 觸發部署
3. [WAIT] time 10 - 等待 10 秒
4. [DB] SELECT * FROM deployments ORDER BY created_at DESC LIMIT 1 - 查詢部署狀態
5. [WEB] https://status.example.com/deploy - 開啟監控頁面
6. [FILE] download /logs/deploy.log - 下載部署日誌
7. [WAIT] log_contains "Deployment completed successfully" - 等待完成訊息

## 使用方式

1. 開啟此工作區
2. 點擊「▶️ 執行工作流程」按鈕
3. 系統將自動執行以上所有步驟

## 輸入參數
- 參數1：說明
- 參數2：說明

## 預期輸出
預期的輸出結果說明

## Agent 提示詞
You are an AI assistant specialized in...

## 範例
\`\`\`bash
# 使用範例
command --param value
\`\`\`

## 注意事項
- 確保所有服務都在運行
- 檢查網路連線
- 確認權限設定
`
}
