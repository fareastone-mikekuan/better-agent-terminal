# AI Agent 數據庫操作情境分析

## 當前行為

基於你的技能設定（`"database": false`），以下是三種情境的實際行為：

---

## 情境 1：技能禁止 DB，但用戶要求分析 DB

**用戶輸入**：「分析資料庫的用戶表」

**實際行為**：
1. ✅ AI Agent 會嘗試使用 `queryDatabase` 工具
2. ❌ 系統會**立即拒絕**，因為權限檢查失敗
3. 💬 返回錯誤：「工具 queryDatabase 不在允許列表中」
4. 🔄 AI Agent 可能會改用其他方式（例如讀取配置文件、日誌等）

**代碼位置**：
```typescript
// src/services/ai-agent-executor.ts:517
if (!this.isToolAllowed(actionData.type)) {
  throw new Error(`工具 ${actionData.type} 不在允許列表中`)
}
```

**控制台輸出示例**：
```
[AI Agent] 解析動作: {"type":"queryDatabase","params":{"query":"SELECT * FROM users"}}
[AI Agent] ❌ 錯誤: 工具 queryDatabase 不在允許列表中
[AI Agent] 回退策略: 使用 readFile 讀取配置
```

---

## 情境 2：技能允許 DB，但沒有開任何連線

**技能設定修改**：`"database": true`
**用戶輸入**：「查詢用戶數量」

**目前行為（待改進）**：
1. ✅ 權限檢查通過
2. ⚠️ 執行 `queryDatabase()` 方法
3. ⚠️ **返回模擬數據**：「資料庫功能待實現」
4. ❌ **沒有檢查實際連線是否存在**

**代碼位置**：
```typescript
// src/services/ai-agent-executor.ts:609
private async queryDatabase(_query: string): Promise<string> {
  try {
    // 暫時返回模擬數據
    return `查詢結果:\n${JSON.stringify({ message: '資料庫功能待實現' }, null, 2)}`
  } catch (error) {
    throw new Error(`資料庫查詢失敗: ${error}`)
  }
}
```

**應該改進為**：
```typescript
private async queryDatabase(query: string): Promise<string> {
  try {
    // 檢查是否有可用的資料庫連線
    const connections = await this.getAvailableDatabaseConnections()
    
    if (connections.length === 0) {
      return `錯誤: 沒有可用的資料庫連線。請先建立連線：
      1. 點擊「知識庫」分頁
      2. 選擇「資料庫連線」
      3. 新增資料庫連線配置`
    }
    
    // 執行實際查詢
    const result = await window.electronAPI.skill.executeDbQuery({
      query: query
    })
    
    if (!result.success) {
      throw new Error(result.error || '查詢失敗')
    }
    
    return `查詢成功:\n${JSON.stringify(result.data, null, 2)}`
  } catch (error) {
    throw new Error(`資料庫查詢失敗: ${error}`)
  }
}
```

---

## 情境 3：技能允許 DB，且有使用中的連線

**技能設定**：`"database": true`
**前置條件**：已建立 PostgreSQL 連線 "production_db"
**用戶輸入**：「查詢今天的訂單數量」

**理想行為**：
1. ✅ 權限檢查通過
2. ✅ AI Agent 生成 SQL：`SELECT COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE`
3. ✅ 檢查可用連線
4. ✅ 選擇正確的連線（可能需要用戶確認）
5. ✅ 執行查詢
6. ✅ 返回結果：「今天有 42 筆訂單」

**安全機制**：
- 🔒 危險查詢需要用戶批准（DELETE, UPDATE, DROP 等）
- 🔒 查詢超時限制（5 秒）
- 🔒 結果行數限制（最多 1000 行）
- 🔒 只讀模式選項

---

## 建議的改進

### 1. 完整的 DB 連線管理

創建 `src/stores/database-store.ts`：
```typescript
interface DatabaseConnection {
  id: string
  name: string
  type: 'postgres' | 'mysql' | 'mongodb' | 'sqlite'
  host?: string
  port?: number
  database?: string
  username?: string
  // password 應該加密存儲
  isActive: boolean
  lastUsed?: number
}

class DatabaseStore {
  private connections: DatabaseConnection[] = []
  
  async addConnection(config: DatabaseConnection): Promise<void>
  async testConnection(id: string): Promise<boolean>
  async removeConnection(id: string): Promise<void>
  getActiveConnections(): DatabaseConnection[]
}
```

### 2. 增強 queryDatabase 方法

- ✅ 檢查連線可用性
- ✅ 支援多連線選擇
- ✅ SQL 注入防護
- ✅ 查詢審核（危險操作）
- ✅ 錯誤友善提示

### 3. UI 改進

在「知識庫」分頁添加：
- 📊 資料庫連線管理面板
- 🔌 快速測試連線按鈕
- 📝 查詢歷史記錄
- ⚠️ 連線狀態指示器

---

## 當前測試建議

### 測試情境 1：權限拒絕
```bash
# 1. 保持技能設定 "database": false
# 2. 在 AI Agent 面板輸入：「查詢資料庫的 users 表」
# 3. 觀察錯誤訊息：「工具 queryDatabase 不在允許列表中」
# 4. 觀察 AI 是否嘗試其他方式
```

### 測試情境 2：無連線提示
```bash
# 1. 修改技能設定 "database": true
# 2. 在 AI Agent 面板輸入：「查詢今天的訂單」
# 3. 目前會看到：「資料庫功能待實現」
# 4. 改進後應看到：「沒有可用的資料庫連線」
```

### 測試情境 3：模擬連線使用
```bash
# 需要先實現 DatabaseStore 和連線管理 UI
# 暫時無法完整測試
```

---

## 相關文件

- [src/services/ai-agent-executor.ts](src/services/ai-agent-executor.ts) - AI Agent 執行器
- [src/types/index.ts](src/types/index.ts) - 類型定義（包含 dbConnection）
- [electron/main.ts](electron/main.ts) - IPC handlers（需要添加 DB 相關）
- [src/types/electron.d.ts](src/types/electron.d.ts) - Electron API 定義

---

## 總結

| 情境 | 當前行為 | 建議改進 |
|------|---------|---------|
| 權限禁止 | ✅ 正確拒絕 | 可添加更友善的提示 |
| 無連線 | ⚠️ 返回模擬數據 | ❌ 應檢查並提示建立連線 |
| 有連線 | ⚠️ 尚未實現 | ❌ 需完整實現連線管理和查詢功能 |

**優先級**：
1. 🔴 高：改進 `queryDatabase()` 檢查連線
2. 🟡 中：實現 `DatabaseStore` 連線管理
3. 🟢 低：添加查詢歷史和統計
