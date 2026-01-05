// 測試 workflow parser 的簡單腳本
// 在 Node.js 環境中運行: node test-workflow-parser.js

const testContent = `
## Workflow

1. [TERMINAL] Write-Host "Test" - 測試命令
2. [API] POST https://httpbin.org/post {"key":"value"} - 測試 API
3. [API] GET https://httpbin.org/get - 測試 GET
4. [DB] SELECT * FROM users - 默認連接
5. [DB:my_db] SELECT COUNT(*) FROM orders - 指定連接
6. [WEB] https://google.com - 開啟網頁
7. [WAIT] time 5 - 等待 5 秒
`

// 簡化的解析邏輯（與 workflow-parser.ts 對應）
function parseWorkflow(content) {
  const steps = []
  const workflowMatch = content.match(/##\s+Workflow\s*\n([\s\S]*?)(?=\n##|\n---|\n\`\`\`|$)/i)
  
  if (!workflowMatch) {
    console.log('❌ 找不到 ## Workflow 區塊')
    return steps
  }
  
  const workflowContent = workflowMatch[1]
  const lines = workflowContent.split('\n')
  
  console.log('📄 找到 Workflow 區塊，共', lines.length, '行')
  console.log('')
  
  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s*\[(\w+(?::\w+)?)\]\s+(.+?)\s*(?:-\s*(.+))?$/)
    if (!match) continue
    
    const [, type, content, description] = match
    const typeUpper = type.toUpperCase()
    const label = description || content
    
    console.log(`✅ 解析步驟: [${type}]`)
    console.log(`   內容: ${content}`)
    console.log(`   說明: ${label}`)
    
    // 檢查 DB 連接
    const dbMatch = type.match(/^DB:(.+)$/i)
    if (dbMatch) {
      console.log(`   🔌 DB 連接: ${dbMatch[1]}`)
    }
    
    // 檢查 API body
    if (typeUpper.startsWith('API')) {
      const apiMatch = content.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\S+)(.*)$/i)
      if (apiMatch) {
        const [, method, url, bodyPart] = apiMatch
        const body = bodyPart.trim()
        console.log(`   📡 方法: ${method}`)
        console.log(`   🔗 URL: ${url}`)
        if (body) {
          console.log(`   📦 Body: ${body}`)
        }
      }
    }
    
    console.log('')
    steps.push({ type, content, label })
  }
  
  return steps
}

console.log('🧪 開始測試 Workflow Parser')
console.log('=' .repeat(60))
console.log('')

const steps = parseWorkflow(testContent)

console.log('=' .repeat(60))
console.log(`✅ 總共解析到 ${steps.length} 個步驟`)
