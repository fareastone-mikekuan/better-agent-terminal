import type { SkillWorkflowStep } from '../types'
import { v4 as uuidv4 } from 'uuid'

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
  
  // 合併被自動換行的長行
  // 如果一行不是以數字開頭（即不是新的步驟），則合併到上一行
  const rawLines = workflowContent.split('\n').map(l => l.replace(/\r/g, ''))
  const mergedLines: string[] = []
  let currentLine = ''
  
  for (const line of rawLines) {
    const trimmed = line.trim()
    // 檢查是否是新步驟的開始（數字 + 點 + 空格 + 方括號）
    if (/^\d+\.\s*\[/.test(trimmed)) {
      // 這是新步驟，保存上一行（如果有）
      if (currentLine) {
        mergedLines.push(currentLine)
      }
      currentLine = trimmed
    } else if (trimmed) {
      // 這是續行，合併到當前行
      currentLine += ' ' + trimmed
    }
  }
  // 保存最後一行
  if (currentLine) {
    mergedLines.push(currentLine)
  }
  
  const lines = mergedLines
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // 匹配格式: 1. [TYPE] content - description
    // 使用更精确的匹配，避免把命令中的 "-" 当作分隔符
    // 分隔符必须是 " - "（前后有空格）
    const match = line.match(/^\s*\d+\.\s*\[(\w+(?::\w+)?)\]\s+(.+)$/)
    if (!match) {
      console.log(`[workflow-parser] 第${i+1}行不匹配正則`)
      continue
    }
    
    console.log('[workflow-parser] 匹配成功! 解析步驟:', line.substring(0, 80))
    
    const [, type, rest] = match
    
    // 分离 content 和 description
    // 寻找 " - " 作为分隔符（前后必须有空格）
    const separatorIndex = rest.lastIndexOf(' - ')
    let content: string
    let description: string | undefined
    
    if (separatorIndex !== -1) {
      content = rest.substring(0, separatorIndex).trim()
      description = rest.substring(separatorIndex + 3).trim()
    } else {
      content = rest.trim()
      description = undefined
    }
    
    const typeUpper = type.toUpperCase()
    const label = description || content
    
    // 處理 DB:connection 類型
    const isDbType = typeUpper === 'DB' || typeUpper.startsWith('DB:')
    
    let step: SkillWorkflowStep | null = null
    
    if (typeUpper === 'TERMINAL') {
      step = {
        id: uuidv4(),
        type: 'terminal',
        label,
        command: content.trim()
      }
    } else if (typeUpper === 'API') {
      // 解析 API: METHOD URL [body]
      const apiMatch = content.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\S+)(.*)$/i)
      if (apiMatch) {
        const [, method, url, bodyPart] = apiMatch
        const body = bodyPart.trim() || undefined
        step = {
          id: uuidv4(),
          type: 'api',
          label,
          apiMethod: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
          apiUrl: url,
          apiBody: body
        }
      }
    } else if (isDbType) {
      // 處理 DB 或 DB:connection_name
      const dbConnectionMatch = type.match(/^DB:(.+)$/i)
      const connectionName = dbConnectionMatch ? dbConnectionMatch[1] : undefined
      
      step = {
        id: uuidv4(),
        type: 'db',
        label,
        dbQuery: content.trim(),
        dbConnection: connectionName
      }
    } else if (typeUpper === 'WEB') {
      step = {
        id: uuidv4(),
        type: 'web',
        label,
        webUrl: content.trim()
      }
    } else if (typeUpper === 'FILE') {
      // 解析 FILE: action path
      const fileMatch = content.match(/^(download|upload|open)\s+(.+)$/i)
      if (fileMatch) {
        const [, action, path] = fileMatch
        step = {
          id: uuidv4(),
          type: 'file',
          label,
          fileAction: action.toLowerCase() as 'download' | 'upload' | 'open',
          filePath: path.trim()
        }
      }
    } else if (typeUpper === 'WAIT') {
      // 解析 WAIT: condition target [timeout]
      const waitMatch = content.match(/^(log_contains|api_status|file_exists|time)\s+["]?([^"]+)["]?(?:\s+(\d+))?$/i)
      if (waitMatch) {
        const [, condition, target, timeout] = waitMatch
        step = {
          id: uuidv4(),
          type: 'wait',
          label,
          waitCondition: condition.toLowerCase() as 'log_contains' | 'api_status' | 'file_exists' | 'time',
          waitTarget: target.trim(),
          waitTimeout: timeout ? parseInt(timeout) : 300
        }
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
