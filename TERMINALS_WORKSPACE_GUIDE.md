# Better Agent Terminal - Terminals 與 Workspace 使用指南

## 核心概念

### 📁 Workspace（工作區）
**定義**：一個專案或資料夾的工作環境
- 每個 Workspace 對應一個資料夾路徑
- 可以包含多個終端
- 支援自訂名稱（alias）和角色（role）

**結構**：
```typescript
{
  id: string              // 唯一識別碼
  name: string            // 資料夾名稱
  alias?: string          // 自訂顯示名稱
  role?: string           // 角色標籤（如 Iris、Lucy 等）
  folderPath: string      // 實際路徑
  createdAt: number       // 建立時間
}
```

### 💻 Terminal（終端）
**定義**：在 Workspace 中執行命令的終端實例
- 每個終端屬於一個 Workspace
- 支援三種類型：terminal、copilot、claude-code

**結構**：
```typescript
{
  id: string              // 唯一識別碼
  workspaceId: string     // 所屬 Workspace ID
  type: 'terminal' | 'copilot' | 'claude-code'
  title: string           // 顯示名稱（如 Terminal 1）
  alias?: string          // 自訂別名
  cwd: string             // 當前工作目錄
  scrollbackBuffer: []    // 終端輸出緩衝
}
```

## 使用方式

### 1️⃣ 基本操作流程

```
創建 Workspace → 添加 Terminals → 在 Terminals 中工作
```

#### 創建 Workspace
1. 點擊側邊欄的 "+" 按鈕
2. 選擇資料夾路徑
3. 系統自動創建 Workspace 和第一個終端

#### 管理 Terminals
- **新增終端**：Workspace 中點擊 "+" 或 "New Terminal"
- **切換終端**：點擊縮圖或使用鍵盤快捷鍵
- **關閉終端**：點擊終端標籤的 X 按鈕
- **重新命名**：右鍵終端 → Rename

### 2️⃣ Workspace 角色系統

預設角色（用於快速識別專案類型）：
- **Iris** 🟢 - 綠色主題
- **IrisGo PM** 🔵 - 藍色主題  
- **Lucy** 🟣 - 紫色主題
- **Veda** 🟡 - 黃色主題
- **Exia** 🔴 - 紅色主題
- **Leo** 🟤 - 棕色主題
- **Custom** ⚪ - 自訂

**使用場景**：
```
專案 A (role: Iris)   → 前端開發
專案 B (role: Veda)   → 後端 API
專案 C (role: Lucy)   → 測試環境
```

### 3️⃣ 三種終端類型

#### 🖥️ Terminal（普通終端）
- 標準終端，執行任何命令
- 可在一個 Workspace 中開多個
- 用途：編譯、測試、監控、調試等

**典型用法**：
```
Terminal 1: npm run dev          (啟動開發伺服器)
Terminal 2: git status           (查看版本控制)
Terminal 3: tail -f logs/app.log (監控日誌)
```

#### 🤖 Copilot（GitHub Copilot Agent）- **預設代碼助手**
- AI 對話助手，支援代碼分析
- 每個 Workspace 自動創建一個
- 可以對話、提問、獲取建議
- 會自動識別代碼塊並生成執行按鈕
- **這是主要的 AI 助手功能**

**使用流程**：
```
1. 每個 Workspace 自動有 Copilot 面板
2. 輸入問題："如何查看 Python 進程？"
3. Copilot 回覆命令：ps aux | grep python
4. 點擊綠色按鈕執行
5. 輸出自動回傳給 Copilot 分析
```

**代碼分析功能**：
```
問："分析這個 server.py 的功能"
Copilot 給命令 → 點擊執行 → 自動讀取代碼 → AI 分析結構
```

#### 🎯 Claude Code（舊版代碼助手，保留相容性）
- 前版本使用的 Claude AI
- 功能已被 GitHub Copilot 取代
- 系統保留支援但不推薦使用

### 4️⃣ 實際使用場景

#### 場景 1：多專案並行開發
```
Workspace: frontend (role: Iris)
  ├─ Terminal 1: npm run dev
  ├─ Terminal 2: npm test --watch
  └─ Copilot: 諮詢前端問題

Workspace: backend (role: Veda)
  ├─ Terminal 1: python manage.py runserver
  ├─ Terminal 2: celery worker
  └─ Copilot: 諮詢 API 設計
```

#### 場景 2：調試複雜問題
```
Workspace: debugging-project
  ├─ Terminal 1: 執行測試
  ├─ Terminal 2: 監控日誌
  ├─ Terminal 3: 查看系統資源
  └─ Copilot: "為什麼記憶體一直增長？"
     → Copilot 建議檢查命令
     → 點擊執行，自動分析結果
```

#### 場景 3：學習新技術
```
Workspace: learning-rust
  ├─ Terminal 1: cargo run
  └─ Copilot: 
     問：「如何處理 Rust 的錯誤？」
     Copilot 回覆 → 點擊執行範例代碼 → 看結果學習
```

## 快捷操作

### 縮圖欄功能
- **左側縮圖**：顯示所有終端預覽
- **拖放排序**：可調整終端順序
- **顏色標記**：根據 Workspace 角色著色
- **快速切換**：點擊縮圖立即跳轉

### 多終端協作
1. 在 Terminal 1 啟動服務
2. 切換到 Terminal 2 測試
3. 遇到問題 → 切換到 Copilot 詢問
4. Copilot 給建議 → 點擊執行 → 自動回傳結果

## 資料存儲

### 配置文件位置
- **Windows**: `%APPDATA%\better-agent-terminal\workspaces.json`
- **Linux**: `~/.config/better-agent-terminal/workspaces.json`
- **macOS**: `~/Library/Application Support/better-agent-terminal/workspaces.json`

### 自動保存
- Workspace 列表自動保存
- 終端狀態在關閉時保存
- 重啟應用自動恢復工作區

## 進階技巧

### 1. 環境變數管理
每個 Workspace 可以有獨立的環境變數（未來功能）

### 2. Snippet 快捷命令
保存常用命令為 Snippet，一鍵執行（已實現）

### 3. 終端輸出捕獲
Copilot 執行命令時自動捕獲輸出，無需手動複製

## 總結

**Workspace** = 專案容器
**Terminal** = 執行工具
**Copilot** = AI 助手

最佳實踐：
1. 一個專案一個 Workspace
2. 用角色快速識別專案類型
3. 多開終端處理並行任務
4. 善用 Copilot 提升效率
5. 終端縮圖隨時監控狀態
