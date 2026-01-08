# 📊 帳單產生器技能

## 功能描述
模擬 UBL 電信系統的完整帳單產生流程，包含：
- 帳戶資訊驗證
- 訂閱產品查詢
- 費用計算（含稅金與折扣）
- 帳單生成
- 發票開立

## Workflow

以下步驟將按順序執行，模擬完整的出帳流程：

1. [TERMINAL] Write-Host "🔍 開始模擬出帳流程..." - 初始化提示
2. [DB:UBL] SELECT ACCT_ID, SUBSCR_ID, CUST_TYPE, PAYMENT_TIMING FROM FET_TB_CM_ACCT WHERE ACCT_ID = 123456 - 查詢帳戶資訊
3. [DB:UBL] SELECT CYCLE, CYCLE_MONTH, TO_CHAR(BILL_FROM_DATE, 'YYYYMMDD') AS BILL_FROM, TO_CHAR(BILL_TO_DATE, 'YYYYMMDD') AS BILL_TO FROM FET_TB_BL_BILL_CNTRL WHERE BILL_SEQ = (SELECT MAX(BILL_SEQ) FROM FET_TB_BL_BILL_CNTRL) - 查詢帳單週期
4. [DB:UBL] SELECT OFFER_ID, CHARGE_CODE, TO_CHAR(EFF_DATE, 'YYYYMMDD') AS EFF_DATE, TO_CHAR(END_DATE, 'YYYYMMDD') AS END_DATE FROM FET_TB_PD_SUBSCR WHERE ACCT_ID = 123456 AND END_DATE IS NULL - 查詢訂閱產品
5. [DB:UBL] SELECT SUM(AMOUNT) AS TOTAL_AMOUNT, TAX_TYPE, DISCOUNT_TYPE FROM FET_TB_BL_CHARGE WHERE ACCT_ID = 123456 AND BILL_SEQ = (SELECT MAX(BILL_SEQ) FROM FET_TB_BL_BILL_CNTRL) GROUP BY TAX_TYPE, DISCOUNT_TYPE - 計算費用資訊
6. [DB:UBL] SELECT TO_CHAR(SUSPEND_FROM_DATE, 'YYYYMMDD') AS SUSPEND_FROM, TO_CHAR(SUSPEND_TO_DATE, 'YYYYMMDD') AS SUSPEND_TO FROM FET_TB_CM_ACCT_STATUS WHERE ACCT_ID = 123456 AND STATUS_TYPE = 'SUSPENDED' - 檢查暫停終止狀態
7. [TERMINAL] Write-Host "💰 計算稅金與折扣中..." - 計算提示
8. [DB:UBL] SELECT INV_TYPE, TAX_RATE FROM FET_TB_INV_CONFIG WHERE CUST_TYPE = 'PERSONAL' - 查詢稅金與發票設定
9. [TERMINAL] Write-Host "📄 生成帳單與發票..." - 生成提示
10. [DB:UBL] INSERT INTO FET_TB_BL_BILL_MAST (BILL_SEQ, ACCT_ID, BILL_NBR, TOTAL_AMOUNT, TAX_AMOUNT, STATUS) VALUES ((SELECT MAX(BILL_SEQ)+1 FROM FET_TB_BL_BILL_MAST), 123456, 'B' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '001', 1500, 75, 'PENDING') - 寫入帳單主檔（模擬）
11. [DB:UBL] INSERT INTO FET_TB_INV_INVOICE (BILL_SEQ, INV_NUMBER, INV_DATE, TAX_ID_NUMBER, STATUS) VALUES ((SELECT MAX(BILL_SEQ) FROM FET_TB_BL_BILL_MAST), 'AA' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '00000001', SYSDATE, '12345678', 'RD') - 寫入發票主檔（模擬）
12. [TERMINAL] Write-Host "✅ 出帳模擬完成！" -ForegroundColor Green - 完成提示
13. [API] POST https://httpbin.org/post {"bill_id": "B20260108001", "amount": 1500, "tax": 75, "status": "completed"} - 模擬發送通知（測試API）

## 輸入參數

### 必要參數
- **ACCT_ID**: 帳戶ID（預設: 123456）
- **BILL_SEQ**: 帳單序號（自動取得最新）

### 可選參數
- **DRY_RUN**: 是否為乾跑模式（預設: true，不實際寫入）
- **CUSTOMER_TYPE**: 客戶類型（PERSONAL/BUSINESS）

## 模擬資料

### 帳戶資訊 (FET_TB_CM_ACCT)
```json
{
  "ACCT_ID": 123456,
  "SUBSCR_ID": "0912345678",
  "CUST_TYPE": "PERSONAL",
  "PAYMENT_TIMING": "POSTPAID",
  "CUST_NAME": "測試客戶",
  "TAX_ID": "A123456789"
}
```

### 帳單週期 (FET_TB_BL_BILL_CNTRL)
```json
{
  "CYCLE": 15,
  "CYCLE_MONTH": 1,
  "BILL_FROM_DATE": "20260101",
  "BILL_TO_DATE": "20260131",
  "DUE_DATE": "20260215"
}
```

### 訂閱產品 (FET_TB_PD_SUBSCR)
```json
{
  "OFFER_ID": "5G_UNLIMITED_999",
  "CHARGE_CODE": "RC_MONTHLY",
  "EFF_DATE": "20250101",
  "END_DATE": null,
  "MONTHLY_FEE": 999
}
```

### 費用資訊 (FET_TB_BL_CHARGE)
```json
{
  "TOTAL_AMOUNT": 1500,
  "TAX_RATE": 0.05,
  "DISCOUNT_TYPE": "LOYALTY_10%",
  "DISCOUNT_AMOUNT": 100,
  "FINAL_AMOUNT": 1400,
  "TAX_AMOUNT": 75
}
```

### 暫停終止狀態 (FET_TB_CM_ACCT_STATUS)
```json
{
  "SUSPEND_FROM_DATE": null,
  "SUSPEND_TO_DATE": null,
  "STATUS": "ACTIVE"
}
```

### 稅金與發票 (FET_TB_INV_CONFIG)
```json
{
  "TAX_TYPE": "TX1",
  "INV_TYPE": "E_INVOICE",
  "TAX_RATE": 0.05,
  "CARRIER_TYPE": "MOBILE_BARCODE"
}
```

## 預期輸出

### 1. 帳單主檔記錄
```sql
BILL_SEQ: 20260108001
BILL_NBR: B20260108001
TOTAL_AMOUNT: 1500
TAX_AMOUNT: 75
DISCOUNT_AMOUNT: 100
FINAL_AMOUNT: 1475
STATUS: PENDING
```

### 2. 發票記錄
```sql
INV_NUMBER: AA2026010800000001
INV_DATE: 2026-01-08
TAX_ID_NUMBER: A123456789
AMOUNT: 1475
TAX: 75
STATUS: RD (Ready)
```

### 3. 帳單明細
- 月租費: 999
- 通話費: 350
- 數據費: 151
- 小計: 1500
- 折扣: -100
- 稅前: 1400
- 稅金(5%): 75
- **總計: 1475**

## Agent 提示詞

你是一個專業的電信帳單系統模擬 Agent，負責協助開發人員理解和測試 UBL 帳單產生流程。

**核心能力**：
1. 理解電信帳單的完整生命週期
2. 模擬真實的資料庫查詢與計算邏輯
3. 解釋每個步驟的業務意義
4. 提供資料驗證與錯誤檢測

**執行原則**：
- 優先使用模擬資料，避免影響真實系統
- 詳細記錄每個步驟的執行結果
- 當資料異常時，提供明確的錯誤訊息
- 在關鍵步驟前進行驗證檢查

**互動模式**：
- 執行前：顯示將要處理的帳戶資訊
- 執行中：實時顯示各步驟狀態
- 執行後：總結生成的帳單與發票資訊
- 錯誤時：分析問題並提供修正建議

## 範例對話

**用戶**: 幫我模擬產生 ACCT_ID 123456 的 1 月份帳單

**Agent**: 
```
🔍 開始模擬出帳流程...

📋 帳戶資訊
- 帳號: 123456
- 客戶類型: PERSONAL (個人)
- 付款方式: POSTPAID (後付)

📅 帳單週期
- 週期: 15 (每月 15 日出帳)
- 計費區間: 2026/01/01 ~ 2026/01/31
- 繳費截止: 2026/02/15

💳 訂閱產品
- 方案: 5G 無限上網 999
- 月租費: 999 元

💰 費用計算
- 基本費用: 1,500 元
- 折扣: -100 元 (忠誠客戶 10%)
- 稅前金額: 1,400 元
- 稅金 (5%): 75 元
- **應繳總額: 1,475 元**

📄 發票開立
- 發票號碼: AA2026010800000001
- 發票類型: 電子發票
- 載具: 手機條碼

✅ 出帳模擬完成！
```

## 注意事項

⚠️ **重要提醒**：
1. 此技能僅用於模擬和測試，不會實際修改生產資料
2. DB 查詢使用 READ-ONLY 連接（除非明確指定 DRY_RUN=false）
3. INSERT 語句預設不執行，僅顯示 SQL
4. 實際部署時需要配置正確的資料庫連接

🔒 **安全性**：
- 帳戶ID 必須經過驗證
- 敏感資料（如身分證字號）需要遮罩顯示
- 所有 SQL 語句經過參數化處理，防止注入攻擊

🐛 **除錯模式**：
設定環境變數 `DEBUG=true` 可顯示：
- 完整的 SQL 查詢語句
- 中間計算過程
- 資料驗證結果

## 相關技能

- 📊 **發票開立技能**: 單獨產生發票
- 🔄 **帳單更正技能**: 修正已產生的帳單
- 📧 **通知發送技能**: 寄送帳單通知
- 📈 **帳務報表技能**: 產生各類帳務報表
