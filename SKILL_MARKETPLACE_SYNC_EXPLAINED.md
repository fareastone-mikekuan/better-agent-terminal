# 技能市場同步機制說明

## 問題：市場同步與 Gist 的關係

**重要澄清：技能市場不使用 Gist！Gist 專門用於共享筆記功能。**

### Gist 的用途
- **唯一用途**：共享筆記（Snippets）功能
- **位置**：左側面板「筆記」標籤
- **功能**：上傳/下載程式碼片段到 GitHub Gist
- **相關檔案**：`electron/snippet-db.ts`

### 技能市場的同步來源

技能市場使用**完全不同的機制**，支援以下三種來源：

#### 1. GitHub Raw URL（推薦）
```
https://raw.githubusercontent.com/your-org/skills-repo/main/marketplace.json
```

**優點：**
- 版本控制
- 團隊協作
- 自動更新
- 免費託管

**使用方式：**
```javascript
// 在 GitHub 倉庫根目錄創建 marketplace.json
{
  "version": "1.0",
  "name": "遠傳電信技能市場",
  "packages": [ /* 技能包陣列 */ ]
}
```

#### 2. 自訂 API 伺服器
```
https://your-company.com/api/skills/marketplace.json
```

**優點：**
- 完全控制
- 動態生成
- 權限管理
- 統計追蹤

**範例實作：**
```javascript
// Express.js 範例
app.get('/api/skills/marketplace.json', (req, res) => {
  const packages = db.query('SELECT * FROM skills WHERE published = true')
  res.json({
    version: "1.0",
    packages: packages.map(formatSkillPackage)
  })
})
```

#### 3. 本地 JSON 檔案（測試用）
```
file:///C:/skills/marketplace.json
```

**優點：**
- 離線測試
- 快速開發
- 無需網路

## 技術實作細節

### 儲存位置
- **市場來源配置**：`%APPDATA%/better-agent-terminal/skill-sources.json`
- **快取的技能包**：記憶體中（state.packages）

### 同步流程
```typescript
// 1. 載入已配置的來源
const sources = await window.electronAPI.skills.loadSources()

// 2. 遍歷所有啟用的來源
for (const source of sources.filter(s => s.enabled)) {
  // 3. 根據來源類型抓取數據
  if (source.type === 'github') {
    const response = await fetch(source.url)
    const data = await response.json()
    packages.push(...data.packages)
  }
}

// 4. 更新本地快取
this.state.packages = packages
```

### 資料格式
```json
{
  "version": "1.0",
  "name": "市場名稱",
  "description": "市場說明",
  "packages": [
    {
      "id": "unique-package-id",
      "skill": {
        // 完整的 AIAgentSkill 物件
      },
      "metadata": {
        "author": "作者",
        "version": "1.0.0",
        "downloads": 100,
        "rating": 4.5,
        // ...
      }
    }
  ]
}
```

## 與 Gist 的區別

| 特性 | 技能市場 | Gist（筆記） |
|------|---------|-------------|
| **用途** | 分享 AI Agent 技能 | 分享程式碼片段 |
| **資料結構** | JSON marketplace | Gist API |
| **同步來源** | GitHub Raw/API/本地 | GitHub Gist 服務 |
| **儲存位置** | skill-sources.json | snippets DB |
| **UI 位置** | 技能庫 > 市場標籤 | 左側 > 筆記面板 |
| **相關檔案** | skill-marketplace-store.ts | snippet-db.ts |

## 日誌編碼問題

### 問題原因
Windows PowerShell 預設使用 Big5/UTF-8 混合編碼，Node.js console.log 輸出中文時可能亂碼。

### 解決方案
已將所有日誌改為英文：

```typescript
// 之前（亂碼）
console.log('[Main] 保存技能到:', configPath)

// 之後（正常）
console.log('[Main] Saving skills to:', configPath)
```

### 檢查日誌
```powershell
# 開發模式查看日誌
npm run dev

# 正常日誌輸出範例
[Main] Saving skills to: C:\Users\...\skills.json
[Main] Skills saved successfully
[Main] Loading skills from: C:\Users\...\skills.json
[Main] Skills loaded successfully, size: 5949 bytes
```

## 最佳實踐

### 1. 設定市場來源
```javascript
// 推薦：使用 GitHub 倉庫
{
  "id": "fareastone-official",
  "name": "遠傳官方技能市場",
  "url": "https://raw.githubusercontent.com/fareastone/skills/main/marketplace.json",
  "type": "github",
  "enabled": true
}
```

### 2. 發布技能
```bash
# 1. 創建 GitHub 倉庫
git init skills-repo
cd skills-repo

# 2. 創建 marketplace.json
cat > marketplace.json << 'EOF'
{
  "version": "1.0",
  "packages": []
}
EOF

# 3. 添加技能包
# 從「技能庫」匯出技能，添加 metadata

# 4. 提交推送
git add marketplace.json
git commit -m "Add skills"
git push origin main
```

### 3. 團隊協作
```bash
# 1. Fork 官方倉庫
# 2. 添加自己的技能
# 3. 提交 Pull Request
# 4. 審核合併後自動同步
```

## 故障排除

### 問題 1：無法同步
**檢查：**
- 網路連線
- URL 是否正確
- JSON 格式是否有效
- CORS 設定（自訂 API）

### 問題 2：技能不顯示
**檢查：**
- 來源是否啟用
- 點擊「同步」按鈕
- 檢查瀏覽器 Console

### 問題 3：安裝失敗
**檢查：**
- 技能 ID 是否衝突
- 依賴是否滿足
- 查看錯誤訊息

## 安全考量

### 來源驗證
- 僅添加信任的市場來源
- 使用 HTTPS 傳輸
- 定期審查已安裝技能

### 權限控制
- 技能執行前需要批准
- 危險操作（資料庫修改）需確認
- 保護敏感資訊

---

**總結：技能市場使用 GitHub Raw URL、自訂 API 或本地檔案作為來源，與 Gist（用於筆記）完全獨立。**
