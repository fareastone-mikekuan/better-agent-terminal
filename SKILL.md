---
name: billing-automation
description: 自動化出帳流程，模擬計算帳單、生成發票、發送通知等完整步驟
tags: 財務, 出帳, 自動化, 計費
---

# 模擬出帳技能

一鍵執行完整的自動化出帳流程，從計算帳單到確認完成。

## Workflow

以下步驟將按順序自動執行：

1. [TERMINAL] Write-Host "=== 開始出帳流程 ===" - 顯示開始訊息
2. [TERMINAL] Get-Date -Format "yyyy-MM-dd HH:mm:ss" - 記錄開始時間
3. [TERMINAL] Write-Host "正在計算本月帳單..." - 計算帳單
4. [WAIT] time 3 - 等待 3 秒模擬計算
5. [TERMINAL] Write-Host "已計算 125 筆訂單，總金額 $45,320" - 顯示計算結果
6. [API] POST https://httpbin.org/post {"action":"generate_invoices","count":125,"amount":45320} - 模擬生成發票 API
7. [WAIT] time 2 - 等待發票生成
8. [TERMINAL] Write-Host "發票生成完成，準備發送通知..." - 顯示進度
9. [API] GET https://httpbin.org/get?status=billing_completed - 查詢出帳狀態
10. [TERMINAL] Write-Host "=== 出帳完成 ===" - 完成訊息

## 功能描述

這個技能會自動執行以下操作：
1. **啟動流程**：顯示出帳開始訊息
2. **記錄時間**：記錄出帳執行時間
3. **計算帳單**：模擬計算所有訂單金額
4. **等待計算**：給予系統時間處理
5. **顯示結果**：展示計算出的訂單數和金額
6. **生成發票**：呼叫 API 生成所有發票
7. **等待生成**：等待發票生成完成
8. **發送通知**：顯示通知發送狀態
9. **查詢狀態**：確認出帳流程完成
10. **完成訊息**：顯示整體流程結束

## 使用方式

### 一鍵執行工作流程
1. 先把這個 SKILL.md 放到某個工作區目錄下（例如 `C:\billing-test\skill.md`）
2. 在 Better Agent Terminal 中開啟該目錄作為工作區
3. 右鍵工作區 → 選擇「⚙ 配置」
4. 勾選「📚 這是一個技能工作區」，儲存
5. 開啟技能庫（側邊欄 📚 按鈕）
6. 找到「模擬出帳」技能卡片
7. 點擊 **▶️ 按鈕**執行完整工作流程
8. 觀看執行進度視窗，追蹤每個步驟

### 控制執行
- **▶️ 開始執行**：啟動工作流程
- **⏸️ 暫停**：暫停執行（可稍後繼續）
- **⏹️ 停止**：終止工作流程
- 失敗時會自動停止並顯示錯誤

## 前置需求

### 環境檢查
- ✅ PowerShell 可以執行（Windows 內建）
- ✅ 網路連線正常（用於測試 API）
- ⚠️ 沒有真實的出帳系統（這是模擬測試）

### 測試說明
這個技能使用 **httpbin.org** 作為測試 API，這是一個免費的 HTTP 測試服務，不會產生任何實際的出帳動作，完全安全。

## 預期結果

執行成功後應該看到：
- ✅ 所有 10 個步驟都顯示綠色勾選
- ✅ 終端顯示出帳流程訊息
- ✅ API 呼叫成功返回
- ✅ 整個流程在 10 秒內完成

## 故障排除

### 步驟失敗處理
- **❌ 紅色叉叉**：該步驟執行失敗
- 查看錯誤訊息了解失敗原因
- 可以點擊「⏸️ 暫停」修正問題後「▶️ 繼續」

### 常見問題

#### 終端命令失敗
```
❌ 步驟 1: 顯示開始訊息失敗
錯誤: PowerShell 命令執行失敗
```
**解決方法**：確認當前工作區有終端已開啟

#### API 連線失敗
```
❌ 步驟 6: API 呼叫失敗
錯誤: Network error
```
**解決方法**：
1. 檢查網路連線
2. httpbin.org 可能暫時無法訪問，稍後再試
3. 可以修改為其他測試 API

#### 等待超時
```
❌ 步驟 4: 等待超時
```
**解決方法**：這不應該發生，因為只等待 3 秒。如果失敗，請檢查系統效能。

## Agent 提示詞

You are an AI assistant specialized in billing automation and financial workflows. When helping with this skill:

1. **Monitor Progress**: Track each billing step and report status clearly
2. **Calculate Verification**: Verify billing calculations are correct
3. **Error Handling**: Help diagnose issues with billing processes
4. **Compliance**: Ensure billing follows proper procedures
5. **Optimization**: Suggest ways to improve billing efficiency

Example interactions:
- "Billing calculation completed: 125 orders totaling $45,320"
- "Invoice generation successful, all PDFs created"
- "Notification emails sent to 125 customers"

## 範例執行輸出

```
▶️ 工作流程執行: 模擬出帳
進度: 10 / 10 步驟

✅ #1: 顯示開始訊息 (耗時: 0.2s)
    [TERMINAL] Write-Host "=== 開始出帳流程 ==="
    === 開始出帳流程 ===

✅ #2: 記錄開始時間 (耗時: 0.3s)
    [TERMINAL] Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    2026-01-05 14:30:25

✅ #3: 計算帳單 (耗時: 0.2s)
    [TERMINAL] Write-Host "正在計算本月帳單..."
    正在計算本月帳單...

✅ #4: 等待計算 (耗時: 3.0s)
    [WAIT] time 3
    等待條件已滿足

✅ #5: 顯示計算結果 (耗時: 0.2s)
    [TERMINAL] Write-Host "已計算 125 筆訂單，總金額 $45,320"
    已計算 125 筆訂單，總金額 $45,320

✅ #6: 模擬生成發票 API (耗時: 1.5s)
    [API] POST https://httpbin.org/post
    API 呼叫成功

✅ #7: 等待生成 (耗時: 2.0s)
    [WAIT] time 2
    等待條件已滿足

✅ #8: 顯示進度 (耗時: 0.2s)
    [TERMINAL] Write-Host "發票生成完成，準備發送通知..."
    發票生成完成，準備發送通知...

✅ #9: 查詢出帳狀態 (耗時: 1.2s)
    [API] GET https://httpbin.org/get?status=billing_completed
    API 呼叫成功

✅ #10: 完成訊息 (耗時: 0.2s)
    [TERMINAL] Write-Host "=== 出帳完成 ==="
    === 出帳完成 ===

總耗時: 9.0 秒
```

## 工作流程格式說明

### 定義格式
在 `## Workflow` 區塊下，按順序列出步驟：
```
1. [TYPE] command/url/query - 步驟說明
```

### 支援的步驟類型

#### 1. TERMINAL - 執行終端命令
```
1. [TERMINAL] npm run build - 建置專案
1. [TERMINAL] docker-compose up -d - 啟動容器
```

#### 2. API - 呼叫 HTTP API
```
1. [API] GET http://api.example.com/status - 查詢狀態
1. [API] POST http://api.example.com/deploy {"version":"1.0"} - 觸發部署
```
支援：GET, POST, PUT, DELETE, PATCH

#### 3. DB - 資料庫查詢
```
1. [DB] SELECT * FROM users LIMIT 10 - 查詢用戶
1. [DB] UPDATE deployments SET status='completed' WHERE id=1 - 更新狀態
```
注意：需要先在 DB 面板建立連線

#### 4. WEB - 開啟網頁
```
1. [WEB] https://status.example.com - 開啟監控頁面
1. [WEB] http://localhost:3000 - 開啟本地服務
```

#### 5. FILE - 文件操作
```
1. [FILE] download /logs/app.log - 下載日誌
1. [FILE] open /path/to/file.txt - 開啟文件
```
支援：download, open

#### 6. WAIT - 等待條件
```
1. [WAIT] time 30 - 等待 30 秒
1. [WAIT] log_contains "success" 300 - 等待日誌出現關鍵字（超時 300 秒）
1. [WAIT] file_exists /tmp/ready 60 - 等待文件出現（超時 60 秒）
```
支援條件：
- `time N` - 等待 N 秒
- `log_contains "keyword" [timeout]` - 等待日誌包含關鍵字
- `file_exists path [timeout]` - 等待文件出現
- `api_status url [timeout]` - 輪詢 API 直到返回 200

## 進階技巧

### 自訂出帳參數
你可以修改工作流程中的數值：
```
5. [TERMINAL] Write-Host "已計算 250 筆訂單，總金額 $120,500" - 修改訂單數和金額
```

### 真實出帳整合
如果你有實際的出帳系統，可以替換步驟：
```
6. [API] POST https://your-billing-api.com/generate {"month":"2026-01"} - 替換為真實 API
```

### 加入資料庫查詢
```
4. [DB] SELECT COUNT(*), SUM(amount) FROM invoices WHERE billing_date = CURDATE() - 查詢今日出帳
```

### 發送通知
```
9. [API] POST https://your-notification-api.com/send {"type":"billing_completed"} - 發送 Email 通知
```

## 注意事項

### 測試環境
- 🟢 這是**模擬測試**，不會產生任何實際出帳
- 🟢 使用 httpbin.org 作為測試 API，完全安全
- 🟢 所有金額和訂單數都是假的

### 實際應用
- 🔴 真實出帳前請務必修改 API 端點
- 🔴 確認資料庫連線和查詢正確
- 🔴 測試完整流程後再用於生產環境
- 🔴 建議先在測試環境執行

## 相關資源

- [httpbin.org](https://httpbin.org) - HTTP 測試服務
- [計費系統文檔](./docs/billing.md)
- [出帳流程規範](./docs/billing-process.md)

---

💡 **測試步驟**：

1. **創建測試工作區**：
   ```powershell
   mkdir C:\billing-test
   # 將此 SKILL.md 複製到 C:\billing-test\skill.md
   ```

2. **在 Better Agent Terminal 中**：
   - 點擊「開啟目錄」
   - 選擇 `C:\billing-test`
   - 右鍵工作區 → ⚙ 配置
   - 勾選「📚 這是一個技能工作區」

3. **執行測試**：
   - 打開技能庫
   - 點擊 ▶️ 執行
   - 觀看結果！
