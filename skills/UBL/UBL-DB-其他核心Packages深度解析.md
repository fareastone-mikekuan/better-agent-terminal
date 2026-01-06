# UBL-DB 深度解析：其他核心 Packages 綜合說明

## 一、Packages 概覽

本文檔涵蓋 UBL-DB 其他 5 個核心 Packages 的深度解析：

| Package 名稱 | 代碼行數 | 核心功能 | 業務定位 |
|------------|---------|---------|---------|
| **FY_PG_BL_BILL_UTIL** | 1,540 行 | 工具函數集合 | RC計算、MARKET_PKG、錯誤處理、MPBL判斷 |
| **FY_PG_BL_BILL_CUTDATE** | 1,355 行 | 截止日處理 | 計算計費期間、Pro-rata天數、SUSPEND天數 |
| **FY_PG_BL_BILL_MAST** | 960 行 | 帳單主檔生成 | 彙總BI生成MAST、發票類型判斷 |
| **FY_PG_BL_BILL_CONFIRM** | 636 行 | 帳單確認 | 帳單狀態確認、發送準備 |
| **FY_PG_BL_BILL_UNDO** | 628 行 | 帳單沖銷 | 帳單反轉、重新計費 |

**總代碼行數**：5,119 行

---

## 二、FY_PG_BL_BILL_UTIL Package

### 1. Package 定位

**核心功能**：
- **RC（Recurring Charge）計算工具**
- **MARKET_PKG**：處理產品轉移
- **錯誤處理**：統一的錯誤記錄機制
- **MPBL判斷**：判斷客戶是否為MPBS客戶

### 2. 核心函數列表

| 函數名稱 | 功能說明 | 主要用途 |
|---------|----------|---------|
| **Ins_Process_Err** | 插入錯誤記錄到 FY_TB_BL_BILL_PROCESS_ERR | 錯誤追蹤 |
| **Ins_Process_LOG** | 插入處理日誌到 FY_TB_BL_BILL_PROCESS_LOG | 進度追蹤 |
| **MARKET_PKG** | 處理產品轉移（MARKET MOVE） | 產品搬家邏輯 |
| **QUERY_ACCT_PKG** | 查詢帳戶Package資訊 | 資料查詢 |
| **DO_RECUR** | 處理月租費（RC）計算 | RC主邏輯 |
| **GET_ACTIVE_DAY** | 計算啟用天數 | Pro-rata計算 |
| **DO_RC_ACTIVE** | 處理RC啟用 | RC生效邏輯 |
| **GET_MONTH** | 計算月份差距 | 期間計算 |
| **INS_CI** | 插入CI費用項目 | 費用寫入 |
| **CHECK_MPBL** | 檢查是否為MPBL客戶 | MPBS判斷 |

---

### 3. DO_RECUR：RC計算核心邏輯

**業務場景**：計算月租費（Recurring Charge）

**函數簽名**：
```sql
PROCEDURE DO_RECUR(
   PI_ACCT_ID   IN NUMBER,   -- 帳戶ID
   PO_ERR_CDE   OUT VARCHAR2, -- 錯誤代碼
   PO_ERR_MSG   OUT VARCHAR2  -- 錯誤訊息
);
```

**關鍵處理邏輯**：

**步驟 1：查詢需要計費的 RC**
```sql
CURSOR C_RC IS
   SELECT AP.PKG_ID,
          AP.ACCT_ID,
          AP.SUBSCR_ID,
          AP.OFFER_SEQ,
          AP.OFFER_INSTANCE_ID,
          AP.OFFER_ID,
          AP.OFFER_LEVEL,
          AP.OFFER_LEVEL_ID,
          AP.PKG_TYPE_DTL,
          AP.RECUR_BILLED,      -- 正式計費已計到哪期
          AP.RECUR_SEQ,         -- 正式計費序號
          AP.TEST_RECUR_BILLED, -- 測試計費已計到哪期
          AP.TEST_RECUR_SEQ,    -- 測試計費序號
          PP.RC_ID,
          PP.PAYMENT_TIMING,    -- D: Deferred(預付), R: Regular(月繳)
          PP.FREQUENCY,         -- 計費頻率（1=每月, 3=每季, 12=每年）
          PP.RECURRING          -- Y/N
     FROM FY_TB_BL_ACCT_PKG AP,
          FY_TB_PBK_PACKAGE_RC PP
    WHERE AP.ACCT_ID = PI_ACCT_ID
      AND AP.PKG_TYPE_DTL = 'RC'
      AND AP.PKG_ID = PP.PKG_ID
      AND PP.OVERWRITE_TYPE IN ('RC', 'BL');  -- SR226548
```

**步驟 2：判斷是否需要計費**
```sql
-- 檢查是否已計費到本期
IF (PI_PROC_TYPE='B' AND PI_BILL_SEQ <> R_PKG.RECUR_SEQ) OR
   (PI_PROC_TYPE<>'B' AND PI_BILL_SEQ <> R_PKG.TEST_RECUR_SEQ) THEN
   
   -- 需要計費，呼叫 FY_PG_BL_BILL_CI.DO_RECUR
   FY_PG_BL_BILL_CI.DO_RECUR(
      PI_ACCT_ID        => PI_ACCT_ID,
      PI_OFFER_SEQ      => R_RC.OFFER_SEQ,
      PI_OFFER_ID       => R_RC.OFFER_ID,
      PI_PKG_ID         => R_RC.PKG_ID,
      PI_RC_ID          => R_RC.RC_ID,
      PI_PAYMENT_TIMING => R_RC.PAYMENT_TIMING,
      PI_FREQUENCY      => R_RC.FREQUENCY,
      PI_RECURRING      => R_RC.RECURRING,
      ...
   );
   
   -- 更新已計費記錄
   UPDATE FY_TB_BL_ACCT_PKG
      SET RECUR_BILLED = gvBILL_PERIOD,
          RECUR_SEQ = gnBILL_SEQ
    WHERE PKG_ID = R_RC.PKG_ID;
END IF;
```

**關鍵設計**：
- **RECUR_BILLED**：記錄已計到哪個帳期（如 202501）
- **RECUR_SEQ**：記錄已計到哪個帳單序號（避免重複計費）
- **PAYMENT_TIMING='D'**：預付費（當期先收費）
- **PAYMENT_TIMING='R'**：月繳費（當期計費，次期收費）

---

### 4. MARKET_PKG：產品轉移處理

**業務場景**：處理產品從一個 ACCT_ID 轉移到另一個 ACCT_ID

**函數簽名**：
```sql
PROCEDURE MARKET_PKG(
   PI_CYCLE       IN NUMBER,         -- 帳期
   PI_PROC_TYPE   IN VARCHAR2,       -- 'B' or 'T'
   PI_BILL_SEQ    IN NUMBER,         -- 帳單序號
   PI_USER        IN VARCHAR2,       -- 使用者
   PO_ERR_CDE     OUT VARCHAR2,
   PO_ERR_MSG     OUT VARCHAR2
);
```

**處理邏輯**：
```sql
-- 1. 查詢需要轉移的 Package
SELECT PKG_ID, 
       OLD_ACCT_ID,    -- 舊帳戶
       NEW_ACCT_ID,    -- 新帳戶
       MARKET_DATE     -- 轉移日期
  FROM FY_TB_BL_ACCT_PKG
 WHERE MARKET_FLAG = 'Y'
   AND MARKET_BILLED IS NULL;  -- 尚未處理

-- 2. 在舊帳戶計算費用（Pro-rata到轉移日）
FY_PG_BL_BILL_CI.DO_RECUR(
   PI_ACCT_ID => OLD_ACCT_ID,
   PI_MARKET_DATE => MARKET_DATE,  -- 截止日期
   ...
);

-- 3. 在新帳戶計算費用（從轉移日開始）
FY_PG_BL_BILL_CI.DO_RECUR(
   PI_ACCT_ID => NEW_ACCT_ID,
   PI_MARKET_DATE => MARKET_DATE,  -- 起始日期
   ...
);

-- 4. 更新 MARKET_BILLED 標記
UPDATE FY_TB_BL_ACCT_PKG
   SET MARKET_BILLED = gvBILL_PERIOD,
       MARKET_FLAG = 'N'
 WHERE PKG_ID = R_PKG.PKG_ID;
```

**版本演進**：
- **4.0 (2021/06/15)**：新增小數點位數處理，新增 PROC_TYPE, BILL_SEQ 參數

---

### 5. CHECK_MPBL：MPBS客戶判斷

**業務場景**：判斷客戶是否為MPBS（行動計費）客戶

**函數簽名**：
```sql
PROCEDURE CHECK_MPBL(
   PI_CUST_ID   IN NUMBER,      -- 客戶ID
   PO_MPBL      OUT VARCHAR2,   -- 'Y' or 'N'
   PO_ERR_CDE   OUT VARCHAR2,
   PO_ERR_MSG   OUT VARCHAR2
);
```

**處理邏輯**：
```sql
-- 查詢客戶類型
SELECT CUST_TYPE
  INTO CH_CUST_TYPE
  FROM FY_TB_CRM_CUSTOMER
 WHERE CUST_ID = PI_CUST_ID;

-- 判斷邏輯
IF CH_CUST_TYPE IN ('MPBL', 'MPBS') THEN
   PO_MPBL := 'Y';
ELSE
   PO_MPBL := 'N';
END IF;
```

**版本演進**：
- **3.0 (2020/06/30)**：MPBS_Migration 新增此函數

---

### 6. Ins_Process_Err：錯誤記錄

**業務場景**：統一的錯誤記錄機制

**函數簽名**：
```sql
PROCEDURE Ins_Process_Err(
   Pi_Bill_Seq     IN NUMBER,         -- 帳單序號
   Pi_Proc_Type    IN VARCHAR2,       -- 'B' or 'T'
   Pi_Acct_Id      IN NUMBER,         -- 帳戶ID
   Pi_SUBSCR_Id    IN NUMBER,         -- 服務號碼ID
   PI_PROCESS_NO   IN NUMBER,         -- 處理批號
   PI_ACCT_GROUP   IN VARCHAR2,       -- 帳戶群組
   PI_PG_NAME      IN VARCHAR2,       -- Package名稱
   PI_USER_ID      IN VARCHAR2,       -- 使用者
   PI_ERR_CDE      IN VARCHAR2,       -- 錯誤代碼
   PI_ERR_MSG      IN VARCHAR2,       -- 錯誤訊息
   PO_ERR_CDE      OUT VARCHAR2,
   PO_ERR_MSG      OUT VARCHAR2
);
```

**處理邏輯**：
```sql
INSERT INTO FY_TB_BL_BILL_PROCESS_ERR (
   BILL_SEQ,
   PROC_TYPE,
   ACCT_ID,
   SUBSCR_ID,
   PROCESS_NO,
   ACCT_GROUP,
   PG_NAME,
   ERR_CODE,
   ERR_MSG,
   CREATE_DATE,
   CREATE_USER
) VALUES (
   Pi_Bill_Seq,
   Pi_Proc_Type,
   Pi_Acct_Id,
   Pi_SUBSCR_Id,
   PI_PROCESS_NO,
   PI_ACCT_GROUP,
   PI_PG_NAME,
   PI_ERR_CDE,
   PI_ERR_MSG,
   SYSDATE,
   PI_USER_ID
);
```

---

## 三、FY_PG_BL_BILL_CUTDATE Package

### 1. Package 定位

**核心功能**：截止日處理與期間計算

**主要用途**：
- 計算計費期間（FROM_DATE ~ END_DATE）
- 計算 Pro-rata 天數（按日計費）
- 計算 SUSPEND 天數（暫停天數）
- 計算 ACTIVE 天數（啟用天數）

### 2. 核心函數推測

基於 1,355 行代碼，推測包含以下核心邏輯：

**A. 計費期間計算**：
```sql
FUNCTION GET_BILL_PERIOD(
   PI_CYCLE           IN NUMBER,      -- 帳期
   PI_CYCLE_MONTH     IN NUMBER,      -- 帳期月份
   PI_EFF_DATE        IN DATE,        -- 生效日期
   PI_END_DATE        IN DATE         -- 終止日期
) RETURN NUMBER;  -- 返回天數
```

**B. SUSPEND天數計算**：
```sql
FUNCTION GET_SUSPEND_DAYS(
   PI_SUBSCR_ID       IN NUMBER,      -- 服務號碼
   PI_FROM_DATE       IN DATE,        -- 起始日期
   PI_END_DATE        IN DATE         -- 終止日期
) RETURN NUMBER;  -- 返回暫停天數
```

**C. Pro-rata計算**：
```sql
FUNCTION CALC_PRORATE(
   PI_AMOUNT          IN NUMBER,      -- 原金額
   PI_ACTIVE_DAYS     IN NUMBER,      -- 啟用天數
   PI_TOTAL_DAYS      IN NUMBER       -- 總天數
) RETURN NUMBER;  -- 返回Pro-rata金額
```

### 3. 業務邏輯推測

**案例：月中啟用服務的 Pro-rata 計算**

**背景資料**：
- **服務號碼**：SUBSCR_ID=12345
- **月租費**：RC_BASIC = 1000 元/月
- **啟用日期**：2025/01/15
- **帳期**：10（1號~31號）
- **計費期間**：2025/01/01 ~ 2025/01/31（31天）
- **實際啟用期間**：2025/01/15 ~ 2025/01/31（17天）

**計算邏輯**：
```sql
-- 1. 計算啟用天數
NU_ACTIVE_DAYS := GET_BILL_PERIOD(
   PI_CYCLE => 10,
   PI_CYCLE_MONTH => 202501,
   PI_EFF_DATE => TO_DATE('2025/01/15', 'YYYY/MM/DD'),
   PI_END_DATE => TO_DATE('2025/01/31', 'YYYY/MM/DD')
);  -- 返回 17

-- 2. 計算總天數
NU_TOTAL_DAYS := 31;  -- 1月份總天數

-- 3. 計算 Pro-rata 金額
NU_PRORATE_AMOUNT := CALC_PRORATE(
   PI_AMOUNT => 1000,
   PI_ACTIVE_DAYS => 17,
   PI_TOTAL_DAYS => 31
);  -- 返回 548.39 = 1000 * (17/31)
```

---

## 四、FY_PG_BL_BILL_MAST Package

### 1. Package 定位

**核心功能**：帳單主檔生成與彙總

**主要用途**：
- 從 FY_TB_BL_BILL_BI 彙總到 FY_TB_BL_BILL_MAST
- 計算帳單總金額
- 判斷發票類型（二聯式/三聯式）

### 2. 核心函數列表

| 函數名稱 | 功能說明 |
|---------|----------|
| **MAIN** | 主流程：彙總BI生成MAST |
| **INVOICE_TYPE** | 判斷發票類型（二聯/三聯） |

### 3. MAIN：彙總BI生成MAST

**業務場景**：將 BI（Bill Item）彙總成 MAST（帳單主檔）

**函數簽名**：
```sql
PROCEDURE Main(
   Pi_Bill_Seq     IN NUMBER,         -- 帳單序號
   Pi_Process_No   IN NUMBER,         -- 處理批號
   Pi_Acct_Group   IN VARCHAR2,       -- 帳戶群組
   Pi_Proc_Type    IN VARCHAR2,       -- 'B' or 'T'
   Pi_User_Id      IN VARCHAR2,       -- 使用者
   Po_Err_Cde      OUT VARCHAR2,
   Po_Err_Msg      OUT VARCHAR2
);
```

**處理邏輯推測**：
```sql
-- 1. 從 BI 彙總資料
SELECT ACCT_ID,
       SUM(CASE WHEN CHARGE_ORG='RA' THEN AMOUNT ELSE 0 END) AS REVENUE,
       SUM(CASE WHEN CHARGE_ORG='CC' THEN AMOUNT ELSE 0 END) AS CHARGE,
       SUM(CASE WHEN CHARGE_ORG='DE' THEN AMOUNT ELSE 0 END) AS DISCOUNT,
       SUM(AMOUNT) AS TOTAL_AMOUNT,
       SUM(TAX_AMT) AS TOTAL_TAX
  FROM FY_TB_BL_BILL_BI
 WHERE BILL_SEQ = Pi_Bill_Seq
 GROUP BY ACCT_ID;

-- 2. 插入或更新 MAST
MERGE INTO FY_TB_BL_BILL_MAST M
USING (SELECT ...) BI
ON (M.BILL_SEQ = BI.BILL_SEQ AND M.ACCT_ID = BI.ACCT_ID)
WHEN MATCHED THEN
   UPDATE SET M.TOTAL_AMOUNT = BI.TOTAL_AMOUNT,
              M.TOTAL_TAX = BI.TOTAL_TAX,
              ...
WHEN NOT MATCHED THEN
   INSERT (BILL_SEQ, ACCT_ID, TOTAL_AMOUNT, TOTAL_TAX, ...)
   VALUES (BI.BILL_SEQ, BI.ACCT_ID, BI.TOTAL_AMOUNT, BI.TOTAL_TAX, ...);
```

### 4. INVOICE_TYPE：發票類型判斷

**業務場景**：判斷帳單應開立二聯式或三聯式發票

**函數簽名**：
```sql
PROCEDURE INVOICE_TYPE(
   PI_BILL_SEQ      IN NUMBER,        -- 帳單序號
   PI_ACCT_ID       IN NUMBER,        -- 帳戶ID
   PO_INVOICE_TYPE  OUT VARCHAR2,     -- '2': 二聯式, '3': 三聯式
   PO_ERR_CDE       OUT VARCHAR2,
   PO_ERR_MSG       OUT VARCHAR2
);
```

**判斷邏輯推測**：
```sql
-- 1. 查詢客戶資訊
SELECT CUST_TYPE,         -- 客戶類型（個人/企業）
       TAX_ID_NO,         -- 統一編號
       INVOICE_TYPE       -- 發票偏好
  INTO CH_CUST_TYPE, CH_TAX_ID_NO, CH_INVOICE_TYPE
  FROM FY_TB_BL_BILL_ACCT A, FY_TB_CRM_CUSTOMER C
 WHERE A.BILL_SEQ = PI_BILL_SEQ
   AND A.ACCT_ID = PI_ACCT_ID
   AND A.CUST_ID = C.CUST_ID;

-- 2. 判斷發票類型
IF CH_CUST_TYPE = 'CORPORATE' AND CH_TAX_ID_NO IS NOT NULL THEN
   PO_INVOICE_TYPE := '3';  -- 三聯式（企業）
ELSE
   PO_INVOICE_TYPE := '2';  -- 二聯式（個人）
END IF;

-- 3. 尊重客戶偏好
IF CH_INVOICE_TYPE IS NOT NULL THEN
   PO_INVOICE_TYPE := CH_INVOICE_TYPE;
END IF;
```

---

## 五、FY_PG_BL_BILL_CONFIRM Package

### 1. Package 定位

**核心功能**：帳單確認與發送準備

**主要用途**：
- 確認帳單資料完整性
- 鎖定帳單（避免修改）
- 準備發送到客戶

### 2. 核心邏輯推測

**函數簽名**：
```sql
PROCEDURE MAIN(
   Pi_Bill_Seq     IN NUMBER,         -- 帳單序號
   Pi_Process_No   IN NUMBER,         -- 處理批號
   Pi_Acct_Group   IN VARCHAR2,       -- 帳戶群組
   Pi_User_Id      IN VARCHAR2,       -- 使用者
   Po_Err_Cde      OUT VARCHAR2,
   Po_Err_Msg      OUT VARCHAR2
);
```

**處理流程推測**：
```sql
-- 1. 檢查帳單資料完整性
-- 檢查 CI/BI/MAST 是否一致
SELECT COUNT(*) INTO NU_CI_COUNT FROM FY_TB_BL_BILL_CI WHERE BILL_SEQ = Pi_Bill_Seq;
SELECT COUNT(*) INTO NU_BI_COUNT FROM FY_TB_BL_BILL_BI WHERE BILL_SEQ = Pi_Bill_Seq;
SELECT COUNT(*) INTO NU_MAST_COUNT FROM FY_TB_BL_BILL_MAST WHERE BILL_SEQ = Pi_Bill_Seq;

IF NU_MAST_COUNT = 0 THEN
   RAISE_APPLICATION_ERROR(-20001, 'MAST not found');
END IF;

-- 2. 鎖定帳單
UPDATE FY_TB_BL_BILL_ACCT
   SET STATUS = 'CONFIRMED',
       CONFIRM_DATE = SYSDATE,
       CONFIRM_USER = Pi_User_Id
 WHERE BILL_SEQ = Pi_Bill_Seq;

-- 3. 準備發送資料
-- 可能包含：
-- - 產生PDF檔案路徑
-- - 寫入發送佇列（FY_TB_SYS_SYNC_CNTRL）
-- - 觸發EDI傳輸

-- 4. 更新處理日誌
INSERT INTO FY_TB_BL_BILL_PROCESS_LOG (
   BILL_SEQ, STATUS, PROCESS_NAME, CREATE_DATE, CREATE_USER
) VALUES (
   Pi_Bill_Seq, 'CN', 'CONFIRM', SYSDATE, Pi_User_Id
);
```

---

## 六、FY_PG_BL_BILL_UNDO Package

### 1. Package 定位

**核心功能**：帳單沖銷與反轉處理

**主要用途**：
- 沖銷錯誤帳單
- 反轉費用項目
- 重新計費準備

### 2. 核心邏輯推測

**函數簽名**：
```sql
PROCEDURE MAIN(
   Pi_Bill_Seq     IN NUMBER,         -- 帳單序號
   Pi_Reason       IN VARCHAR2,       -- 沖銷原因
   Pi_User_Id      IN VARCHAR2,       -- 使用者
   Po_Err_Cde      OUT VARCHAR2,
   Po_Err_Msg      OUT VARCHAR2
);
```

**處理流程推測**：
```sql
-- 1. 檢查帳單狀態
SELECT STATUS INTO CH_STATUS
  FROM FY_TB_BL_BILL_ACCT
 WHERE BILL_SEQ = Pi_Bill_Seq;

IF CH_STATUS = 'CONFIRMED' THEN
   RAISE_APPLICATION_ERROR(-20001, 'Cannot undo confirmed bill');
END IF;

-- 2. 反轉 CI
UPDATE FY_TB_BL_BILL_CI
   SET AMOUNT = -AMOUNT,       -- 金額反轉
       UNDO_FLAG = 'Y',
       UNDO_REASON = Pi_Reason,
       UNDO_DATE = SYSDATE,
       UNDO_USER = Pi_User_Id
 WHERE BILL_SEQ = Pi_Bill_Seq;

-- 3. 反轉 BI
UPDATE FY_TB_BL_BILL_BI
   SET AMOUNT = -AMOUNT,
       TAX_AMT = -TAX_AMT,
       UNDO_FLAG = 'Y'
 WHERE BILL_SEQ = Pi_Bill_Seq;

-- 4. 更新 MAST
UPDATE FY_TB_BL_BILL_MAST
   SET TOTAL_AMOUNT = -TOTAL_AMOUNT,
       TOTAL_TAX = -TOTAL_TAX,
       UNDO_FLAG = 'Y'
 WHERE BILL_SEQ = Pi_Bill_Seq;

-- 5. 更新帳單狀態
UPDATE FY_TB_BL_BILL_ACCT
   SET STATUS = 'UNDONE',
       UNDO_DATE = SYSDATE,
       UNDO_USER = Pi_User_Id
 WHERE BILL_SEQ = Pi_Bill_Seq;

-- 6. 重置 RECUR_BILLED（允許重新計費）
UPDATE FY_TB_BL_ACCT_PKG
   SET RECUR_BILLED = NULL,
       RECUR_SEQ = NULL
 WHERE ACCT_ID IN (SELECT ACCT_ID FROM FY_TB_BL_BILL_ACCT WHERE BILL_SEQ = Pi_Bill_Seq);
```

---

## 七、Packages 相互關聯圖

```
┌─────────────────────────────────────────────────────┐
│              FY_PG_BL_DATA_SYNC                     │
│         (DIO/MPBS/HGBN → UBL 資料同步)               │
└────────────────────┬────────────────────────────────┘
                     │ INSERT
                     ↓
        ┌────────────────────────────┐
        │  FY_TB_BL_ACCT_PKG         │ ← FY_PG_BL_BILL_UTIL.MARKET_PKG
        │  FY_TB_BL_OFFER_PARAM      │
        └────────────┬───────────────┘
                     │ READ
                     ↓
        ┌────────────────────────────┐
        │  FY_PG_BL_BILL_UTIL        │
        │  - DO_RECUR (呼叫 CI)       │ → FY_PG_BL_BILL_CUTDATE
        │  - MARKET_PKG               │   (計算天數)
        └────────────┬───────────────┘
                     │ CALL
                     ↓
        ┌────────────────────────────┐
        │  FY_PG_BL_BILL_CI          │
        │  (費用計算核心)              │
        └────────────┬───────────────┘
                     │ INSERT
                     ↓
        ┌────────────────────────────┐
        │  FY_TB_BL_BILL_CI          │
        └────────────┬───────────────┘
                     │ READ
                     ↓
        ┌────────────────────────────┐
        │  FY_PG_BL_BILL_BI          │
        │  (彙總 CI → BI)             │
        └────────────┬───────────────┘
                     │ INSERT
                     ↓
        ┌────────────────────────────┐
        │  FY_TB_BL_BILL_BI          │
        └────────────┬───────────────┘
                     │ READ
                     ↓
        ┌────────────────────────────┐
        │  FY_PG_BL_BILL_MAST        │
        │  (彙總 BI → MAST)           │
        └────────────┬───────────────┘
                     │ INSERT
                     ↓
        ┌────────────────────────────┐
        │  FY_TB_BL_BILL_MAST        │
        └────────────┬───────────────┘
                     │ READ
                     ↓
        ┌────────────────────────────┐
        │  FY_PG_BL_BILL_CONFIRM     │
        │  (帳單確認)                 │
        └────────────┬───────────────┘
                     │ UPDATE
                     ↓
        ┌────────────────────────────┐
        │  FY_TB_BL_BILL_ACCT        │
        │  (STATUS = 'CONFIRMED')    │
        └────────────────────────────┘

                   ┌─────────────────┐
                   │ FY_PG_BL_BILL_UNDO│ (錯誤時沖銷)
                   │ (AMOUNT反轉)      │
                   └─────────────────┘
```

---

## 八、總結與建議

### 1. UBL-DB Packages 核心定位

| 層級 | Packages | 功能定位 |
|------|---------|---------|
| **同步層** | DATA_SYNC | DIO/MPBS/HGBN → UBL |
| **計算層** | CI, UTIL, CUTDATE | 費用計算、RC處理、天數計算 |
| **彙總層** | BI, MAST | CI→BI→MAST 彙總 |
| **控制層** | CONFIRM, UNDO | 帳單確認、沖銷 |

### 2. 開發建議

**測試重點**：
- **UTIL.DO_RECUR**：月中啟用、月中終止、MARKET_PKG 轉移
- **CUTDATE**：閏年、月底、SUSPEND 天數計算
- **MAST**：BI 彙總正確性、發票類型判斷
- **CONFIRM**：帳單鎖定、重複確認保護
- **UNDO**：反轉邏輯、RECUR_BILLED 重置

**效能優化**：
- **UTIL.DO_RECUR**：批次處理 ACCT_PKG（避免逐筆）
- **MAST**：使用 MERGE 代替 INSERT+UPDATE
- **CONFIRM**：批次更新狀態

**維護建議**：
- **版本記錄**：每個 SR 都要記錄在 Package 開頭
- **錯誤處理**：統一使用 UTIL.Ins_Process_Err
- **日誌記錄**：關鍵步驟使用 UTIL.Ins_Process_LOG

---

## 九、與 CI/BI 的協作關係

### 完整計費流程：

1. **DATA_SYNC**：前端系統同步 → FY_TB_BL_ACCT_PKG
2. **UTIL.DO_RECUR**：判斷需要計費 → 呼叫 CI.DO_RECUR
3. **CUTDATE**：計算天數 → 傳給 CI
4. **CI.DO_RECUR**：計算費用 → INSERT FY_TB_BL_BILL_CI
5. **BI.GEN_BI**：彙總 CI → INSERT FY_TB_BL_BILL_BI
6. **MAST.MAIN**：彙總 BI → INSERT FY_TB_BL_BILL_MAST
7. **CONFIRM.MAIN**：確認帳單 → UPDATE STATUS = 'CONFIRMED'
8. **UNDO.MAIN**（錯誤時）：沖銷帳單 → AMOUNT 反轉

理解這 5 個 Package 的協作關係是掌握 UBL 計費流程的關鍵。
