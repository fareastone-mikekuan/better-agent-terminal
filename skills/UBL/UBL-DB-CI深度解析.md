# UBL-DB CI 處理深度解析（補充版）

## 🎯 核心警告

**FY_PG_BL_BILL_CI** 是 UBL 系統**最複雜**的 Package：
- **3,997 行**代碼（pkb）
- **25 KB** 規格定義（pks）
- **219 KB** 實作代碼（pkb）
- 處理 117+ 種 SUSPEND/ACTIVE/Pro-rata/MARKET 場景

這是整個帳務系統的**心臟**，幾乎所有費用計算邏輯都在這裡。

---

## 🔄 不同 CYCLE 的處理邏輯

### CYCLE 分類與特性

```sql
IF gnCYCLE IN ('10','15','20') OR (gnCYCLE = '50' AND gvUSER='UBL') THEN
    -- 特殊處理：Project-M Fixed Line (固網專案)
    -- SDWAN/NPEP 特殊邏輯
END IF
```

#### CYCLE 10/15/20：Project-M Fixed Line
**業務背景**: SR260229 - Project-M Fixed line Phase I（固網整合專案）

**特殊處理**:
1. **SDWAN 判斷**
   ```sql
   SELECT 'Y' INTO gvSDWAN
   FROM FY_TB_PBK_OFFER_PROPERTIES A
   WHERE OFFER_ID = R_RC.OFFER_ID
     AND PRT_ID = gnPRT_ID      -- 從 LOOKUP_CODE='SDWAN' 取得
     AND PRT_VALUE = gvPRT_VALUE
   ```

2. **預付費特殊處理** (PAYMENT_TIMING='D')
   - D = Deferred（延遲付款/預付）
   - R = Regular（一般月結）
   
   ```sql
   IF gvPAYMENT_TIMING='D' THEN
       -- 預付費邏輯
       -- 記錄 DYNAMIC_ATTRIBUTE: 'PAYMENT_TIMING=D'
   ```

3. **終止原因處理** (END_RSN)
   - DFC: Disconnect for Credit（信用終止）
   - CS1~CS9, CSZ: Customer Service 各種原因
   - M32: Project M Phase II 新增原因
   
   **關鍵邏輯**:
   ```sql
   WHEN sign(nvl(AP.end_date,gdBILL_END_DATE)-gdBILL_END_DATE) = 1 
        and AP.CUR_BILLED IS NULL 
        and PR.PAYMENT_TIMING = 'D' 
        and AP.END_RSN IN ('DFC','CS1',...,'M32')
   THEN NULL  -- 不計算此筆費用
   ELSE TRUNC(AP.END_DATE)-1
   ```
   
   **商業意義**: 
   - 預付費產品提前終止時
   - 如果還沒出過帳（CUR_BILLED IS NULL）
   - 且終止日超過本期帳單截止日
   - 則該產品**不產生本期費用**（避免重複計費）

4. **預付費到期處理**
   ```sql
   IF gnCYCLE IN ('10','15','20') 
      and gvPAYMENT_TIMING='D' 
      and gnFREQUENCY = 1 
      and gvCI_STEP != 'T' THEN
       -- 預付費到期，產生 CI 但不計入最後一期
   ```

#### CYCLE 50：HGBN/MIB 特殊處理
**業務背景**: SR277291 - HGBN與MIB系統的 billing 功能整合

**限制**:
```sql
(gnCYCLE = '50' AND gvUSER='UBL')
-- 且 OFFER_ID != '203550'（排除特定產品）
```

#### 其他 CYCLE：標準月結處理
- CYCLE 01~09: 每月 1~9 號出帳
- 標準 RC/UC/OC 計算流程

---

## 💰 RC (Recurring Charge) 複雜邏輯深度解析

### DO_RECUR Procedure 核心流程

#### 1. 產品生命週期判斷

```sql
CURSOR C_RC IS
  SELECT 
    TRUNC(AP.EFF_DATE) EFF_DATE,           -- 生效日
    CASE 
      WHEN 終止日超過帳單截止日 
           AND 未出過帳 
           AND 預付費 
           AND 特定終止原因
      THEN NULL                             -- 不計費
      ELSE TRUNC(AP.END_DATE)-1             -- 終止日-1
    END END_DATE,
    TRUNC(AP.FUTURE_EXP_DATE)-1 FUTURE_EXP_DATE,  -- 未來到期日
    AP.STATUS,                              -- 狀態
    AP.CUR_BILLED,                          -- 當前已出帳日期
    ...
  FROM FY_TB_BL_ACCT_PKG AP
```

**狀態說明**:
- `STATUS`: A=Active, S=Suspended, T=Terminated, P=Pending
- `CUR_BILLED`: 記錄上次出帳日期，用於判斷是否已計費
- `FUTURE_EXP_DATE`: 用於處理未來到期的產品

#### 2. Pro-rata 計算（按天數比例）

**場景 A: 產品啟用不滿一個月**
```sql
-- 計算實際使用天數
IF R_RC.EFF_DATE > gdBILL_FROM_DATE THEN
    START_DATE := R_RC.EFF_DATE    -- 從生效日開始
ELSE
    START_DATE := gdBILL_FROM_DATE -- 從帳期起始日開始
END IF

IF R_RC.END_DATE < gdBILL_END_DATE THEN
    END_DATE := R_RC.END_DATE      -- 到終止日
ELSE
    END_DATE := gdBILL_END_DATE    -- 到帳期結束日
END IF

-- Pro-rata 金額 = 月租費 × (使用天數 / 該月總天數)
PRORATA_AMT := MONTHLY_FEE * (END_DATE - START_DATE + 1) / 該月天數
```

**場景 B: MARKET MOVE（產品變更）**
```sql
IF R_AT.PRE_CYCLE IS NOT NULL THEN
    -- 從前一個產品轉移過來
    -- 需要查詢前一個 CYCLE 的出帳狀態
    SELECT BILL_END_DATE
      INTO PRE_BILL_END_DATE
      FROM FY_TB_BL_BILL_CNTRL
     WHERE CYCLE = R_AT.PRE_CYCLE
    
    -- 調用 MARKET_PKG 處理市場變更邏輯
    Fy_Pg_Bl_Bill_Util.MARKET_PKG(
        gnCYCLE,
        R_AT.SUBSCR_ID,
        R_AT.PRE_CYCLE
    )
END IF
```

**MARKET_PKG 處理內容**:
- 檢查前一產品的費用是否已計算
- 避免重複計費
- 處理產品交接期間的費用分攤

#### 3. SUSPEND 期間處理

**核心邏輯**: 暫停期間**不計費**，但要**扣除暫停天數**

```sql
PROCEDURE GET_SUSPEND_DAY(
    PI_TYPE IN VARCHAR2,       -- 'RC' 或其他
    PI_AMY_QTY IN NUMBER,      -- 原始數量
    PI_Tab_PKG_RATES IN t_PKG_RATES,
    PO_ACTIVE_DAY OUT NUMBER   -- 輸出：實際應計費天數
)

-- 計算邏輯
SELECT SUM(天數) INTO SUSPEND_DAYS
FROM FY_TB_CM_SUBSCR_SUSPEND
WHERE SUBSCR_ID = ?
  AND SUSPEND_FROM_DATE <= BILL_END_DATE
  AND SUSPEND_TO_DATE >= BILL_FROM_DATE

-- 實際計費天數 = 帳期總天數 - 暫停天數
ACTIVE_DAY := 該月天數 - SUSPEND_DAYS

-- 費用 = 月租費 × (實際計費天數 / 該月總天數)
```

**複雜情境**:
1. **跨月暫停**: 只計算本帳期內的暫停天數
2. **部分暫停**: 從 15 號暫停到 25 號，只扣除這 11 天
3. **多次暫停**: 一個月內多次暫停，累計所有暫停天數

#### 4. PREPAYMENT（預付費）處理

**三種預付費情境**:

**情境 1: 首次啟用預付費**
```sql
IF R_RC.PRE_PKG_SEQ IS NOT NULL 
   AND R_RC.TRANS_IN_DATE IS NULL 
   AND R_RC.PREPAYMENT IS NOT NULL THEN
    -- 這是從預付費產品轉換過來的
    -- PREPAYMENT 欄位記錄預付金額
    
    -- 計算實際應收 = 月租費 - 預付金額
    CHARGE_AMT := RC_AMT - R_RC.PREPAYMENT
END IF
```

**情境 2: MARKET MOVE 帶來的預付**
```sql
IF (R_RC.PREPAYMENT IS NULL OR R_RC.TRANS_IN_QTY IS NULL) AND
   gvPREPAYMENT IS NOT NULL THEN
    -- 從前一產品繼承預付金額
    CHARGE_AMT := RC_AMT - gvPREPAYMENT
END IF
```

**情境 3: TRANS_IN（轉入）預付**
```sql
IF R_RC.TRANS_IN_DATE IS NOT NULL THEN
    -- 有轉入日期，表示是轉移產品
    -- TRANS_IN_QTY 記錄轉入的數量/金額
    -- 需要特殊處理計費邏輯
END IF
```

#### 5. DFC (Disconnect for Credit) 退費處理

**DFC 商業邏輯**: 客戶因信用問題被終止服務，需要**退還未使用期間的費用**

```sql
IF R_RC.END_RSN='DFC' OR 
   (gvPAYMENT_TIMING='D' and gnFREQUENCY=1 and R_RC.END_RSN IN ('CS1',...)) OR
   (gvPAYMENT_TIMING='D' and R_RC.END_RSN IN ('M32')) THEN
    
    -- DFC 退費計算
    IF R_RC.END_DATE < R_RC.CUR_BILLED THEN
        -- 終止日早於已出帳日期，需要退費
        
        -- 退費金額 = 已收費用 × (未使用天數 / 已付費天數)
        REFUND_AMT := BILLED_AMT × 
                      (CUR_BILLED - END_DATE) / 
                      (CUR_BILLED - PREV_BILLED)
        
        -- 產生負向 CI (ChargeType='CRD')
        INSERT INTO FY_TB_BL_BILL_CI (
            CHARGE_TYPE = 'CRD',
            AMOUNT = -REFUND_AMT,
            ...
        )
    END IF
END IF
```

**退費範例**:
```
客戶於 2024/01/01 啟用月租 $3000 的產品
1月帳單已收取 $3000（帳期 01/01~01/31）
但客戶於 2024/01/15 因信用問題被 DFC 終止

退費計算：
- 已付費期間：31 天
- 實際使用：15 天
- 未使用：16 天
- 退費金額：$3000 × (16/31) = $1,548

1月帳單會產生：
CI 1: $3000 (DBT) - 原始月租費
CI 2: -$1548 (CRD) - DFC 退費
淨額：$1,452
```

#### 6. 預付費到期但不計入最後一期

**場景**: Project-M 固網預付費產品到期

```sql
IF gnCYCLE IN ('10','15','20') and 
   gvPAYMENT_TIMING='D' and 
   gnFREQUENCY = 1 and 
   gvCI_STEP != 'T' THEN
    
    -- 這是預付費產品的最後一期
    -- 產品已到期但不產生費用
    -- 因為費用已在首次啟用時收取
    
    -- 產生 CI 記錄但金額為 0
    -- 目的：記錄產品生命週期，方便追蹤
END IF
```

---

## 🎁 折扣處理 (DO_DISCOUNT) 深度解析

### 折扣處理流程

```sql
PROCEDURE DO_DISCOUNT(
    PI_PROC_ID IN NUMBER,      -- 1: ACCT_GROUP='MV', 2: 只處理 MV
    PI_SUBSCR_ID IN NUMBER,    -- 用戶ID
    PI_PRE_CYCLE IN NUMBER     -- 前一個 CYCLE（用於 MARKET MOVE）
)
```

### 折扣類型與優先序

#### 1. CONTRIBUTE（貢獻度）判斷

**商業邏輯**: 某些折扣需要用戶「貢獻」特定條件才能享有

```sql
PROCEDURE GET_CONTRIBUTE(
    PI_CONTRIBUTE_IN IN NUMBER,      -- 要求的貢獻條件（IN 群組）
    PI_CONTRIBUTE_EX IN NUMBER,      -- 排除的貢獻條件（EX 群組）
    PI_Tab_PKG_RATES IN t_PKG_RATES, -- PBK 費率表
    PI_EFF_DATE IN DATE,             -- 產品生效日
    PO_CONTRIBUTE_CNT OUT NUMBER,    -- 符合條件的數量
    PO_CRI_ORDER OUT NUMBER          -- 條件優先序
)

-- 判斷邏輯
SELECT COUNT(*) INTO CONTRIBUTE_CNT
FROM FY_TB_BL_ACCT_PKG
WHERE ACCT_ID = ?
  AND OFFER_ID IN (
      SELECT OFFER_ID 
      FROM CRITERION_GROUP
      WHERE GROUP_ID = PI_CONTRIBUTE_IN
  )
  AND OFFER_ID NOT IN (
      SELECT OFFER_ID 
      FROM CRITERION_GROUP  
      WHERE GROUP_ID = PI_CONTRIBUTE_EX
  )
  AND EFF_DATE <= PI_EFF_DATE
  AND (END_DATE IS NULL OR END_DATE > PI_EFF_DATE)
  AND STATUS = 'A'  -- Active
```

**範例**:
```
折扣規則：訂購「雲端儲存包」才能享有「雲端服務」9折優惠

CONTRIBUTE_IN = 群組ID=100 (包含所有雲端儲存包產品)
CONTRIBUTE_EX = 群組ID=101 (排除試用版儲存包)

邏輯：
1. 檢查該客戶是否有訂購群組 100 的產品
2. 但不能是群組 101 的產品
3. 且該產品必須是 Active 狀態
4. 如果符合，CONTRIBUTE_CNT = 訂購數量
```

#### 2. ELIGIBLE（資格）計算折扣

```sql
PROCEDURE DO_ELIGIBLE(
    PI_ELIGIBLE_IN IN NUMBER,        -- 資格條件 IN
    PI_ELIGIBLE_EX IN NUMBER,        -- 資格條件 EX
    PI_CONTRIBUTE_CNT IN NUMBER,     -- 貢獻數量
    PI_CRI_ORDER IN NUMBER,          -- 條件優先序
    PI_FROM_DATE IN DATE,            -- 計算起始日
    PI_END_DATE IN DATE,             -- 計算結束日
    PI_Tab_PKG_RATES IN t_PKG_RATES, -- 費率表
    PI_MARKET IN VARCHAR2,           -- MARKET MOVE 標記
    PI_EFF_DATE IN DATE,             -- 生效日
    PO_PKG_DISC OUT NUMBER,          -- 折扣金額
    PO_PKG_QTY OUT NUMBER,           -- 可用數量
    PO_PKG_USE OUT NUMBER            -- 已用數量
)
```

**折扣計算邏輯**:

**情境 A: 金額折扣**
```sql
-- PBK 費率表定義
DISCOUNT_TYPE = 'AMT'  -- 金額折扣
DISCOUNT_VALUE = 500   -- 折扣 $500

-- 計算
IF PI_CONTRIBUTE_CNT >= REQUIRED_CNT THEN
    -- 符合條件，給予折扣
    PKG_DISC := DISCOUNT_VALUE
    
    -- 但要考慮 Pro-rata
    IF PI_MARKET = 'Y' THEN
        -- MARKET MOVE 情境，按比例計算
        DAYS_IN_MONTH := 取得該月天數
        ACTIVE_DAYS := PI_END_DATE - PI_FROM_DATE + 1
        PKG_DISC := DISCOUNT_VALUE * (ACTIVE_DAYS / DAYS_IN_MONTH)
    END IF
END IF
```

**情境 B: 百分比折扣**
```sql
DISCOUNT_TYPE = 'PCT'  -- 百分比折扣
DISCOUNT_VALUE = 10    -- 打9折 (10% off)

-- 計算
BASE_AMT := 計算原始費用
PKG_DISC := BASE_AMT * (DISCOUNT_VALUE / 100)

-- 上限檢查
IF PKG_DISC > MAX_DISCOUNT THEN
    PKG_DISC := MAX_DISCOUNT
END IF
```

**情境 C: 免費額度 (Quota)**
```sql
DISCOUNT_TYPE = 'QTY'  -- 數量型折扣
DISCOUNT_VALUE = 100   -- 100 GB 免費額度

-- 邏輯
PKG_QTY := DISCOUNT_VALUE  -- 可用額度
PKG_USE := 0               -- 已用額度（從 UC 計算）

-- 在 UC 處理時會扣減
IF USAGE_QTY <= PKG_QTY THEN
    CHARGE_AMT := 0        -- 完全免費
    PKG_USE := USAGE_QTY
ELSE
    CHARGE_AMT := (USAGE_QTY - PKG_QTY) * UNIT_PRICE
    PKG_USE := PKG_QTY
END IF
```

#### 3. 折扣疊加規則

**ORDER BY OFFER_SEQ**: 折扣按產品序號順序套用

```sql
-- 假設客戶有以下產品：
OFFER_SEQ=1: 基礎雲端服務 ($1000)
OFFER_SEQ=2: 雲端儲存包 ($500) - 提供9折折扣
OFFER_SEQ=3: 企業方案 ($2000) - 提供額外$300折扣

-- 折扣計算順序：
1. 先計算 OFFER_SEQ=1 的費用 $1000
2. 檢查 OFFER_SEQ=2 是否提供折扣
   → 9折優惠，折扣 $100
3. 檢查 OFFER_SEQ=3 是否提供折扣  
   → 額外折扣 $300
4. 總折扣 = $100 + $300 = $400
5. 實收 = $1000 - $400 = $600
```

**但有限制**:
```sql
-- 某些折扣不可疊加
IF EXCLUSIVE_FLAG = 'Y' THEN
    -- 只能享有最大的一個折扣
    PKG_DISC := MAX(DISCOUNT_1, DISCOUNT_2, ...)
ELSE
    -- 可以疊加
    PKG_DISC := SUM(ALL_DISCOUNTS)
END IF
```

#### 4. OVERWRITE（覆寫）機制

**用途**: 人工調整折扣金額

```sql
-- FY_TB_BL_ACCT_PKG.OVERWRITE 欄位
IF R_RC.OVERWRITE IS NOT NULL THEN
    -- 有人工調整
    -- 忽略系統計算的折扣
    -- 使用 OVERWRITE 值
    PKG_DISC := R_RC.OVERWRITE
    
    -- 記錄到 DYNAMIC_ATTRIBUTE
    gvDYNAMIC_ATTRIBUTE := gvDYNAMIC_ATTRIBUTE || 
                           '#OVERWRITE=' || TO_CHAR(R_RC.OVERWRITE)
END IF
```

---

## 📊 DYNAMIC_ATTRIBUTE 記錄機制

### 用途
記錄 CI 計算過程中的**關鍵決策點**和**特殊處理**，方便日後追蹤和除錯。

### 格式
```
name1=value1#name2=value2#name3=value3#...
```

### 常見記錄項目

```sql
-- PAYMENT_TIMING
IF gvPAYMENT_TIMING='D' THEN
    gvDYNAMIC_ATTRIBUTE := gvDYNAMIC_ATTRIBUTE || '#PAYMENT_TIMING=D'
END IF

-- DFC 退費
IF R_RC.END_RSN='DFC' THEN
    gvDYNAMIC_ATTRIBUTE := gvDYNAMIC_ATTRIBUTE || '#END_RSN=DFC#REFUND_AMT=' || REFUND_AMT
END IF

-- OVERWRITE
IF R_RC.OVERWRITE IS NOT NULL THEN
    gvDYNAMIC_ATTRIBUTE := gvDYNAMIC_ATTRIBUTE || '#OVERWRITE=' || R_RC.OVERWRITE
END IF

-- SUSPEND 天數
gvDYNAMIC_ATTRIBUTE := gvDYNAMIC_ATTRIBUTE || '#SUSPEND_DAYS=' || SUSPEND_DAYS || '#ACTIVE_DAYS=' || ACTIVE_DAYS

-- Pro-rata
gvDYNAMIC_ATTRIBUTE := gvDYNAMIC_ATTRIBUTE || '#PRORATA=Y#FROM_DATE=' || TO_CHAR(FROM_DATE) || '#END_DATE=' || TO_CHAR(END_DATE)
```

---

## 🎯 實戰範例：完整計費情境

### 情境：客戶A的1月帳單

**客戶資訊**:
- CYCLE: 15（每月15號出帳）
- 帳期: 2024/12/16 ~ 2025/01/15

**訂購產品**:
1. **固網專線** (OFFER_ID=5001)
   - 月租費: $5,000
   - PAYMENT_TIMING='D' (預付費)
   - 啟用日: 2024/12/01
   - 預付金額: $5,000 (已在12月收取)

2. **雲端儲存 100GB** (OFFER_ID=6001)
   - 月租費: $1,000
   - 啟用日: 2024/12/20
   - 終止日: 2025/01/10 (DFC)

3. **企業方案** (OFFER_ID=7001)
   - 月租費: $3,000
   - 啟用日: 2024/12/16
   - 暫停: 2024/12/25 ~ 2025/01/05 (共12天)

### 計算過程

#### 產品 1: 固網專線
```sql
-- 檢查 CYCLE
gnCYCLE = '15'  -- 符合 Project-M 條件

-- 檢查 PAYMENT_TIMING
gvPAYMENT_TIMING = 'D'  -- 預付費

-- 檢查是否已出帳
R_RC.CUR_BILLED = 2024/12/15  -- 已在12月出過帳

-- 計算本期費用
因為是預付費且已出過帳，本期不產生費用
但記錄 CI (金額=0) 供追蹤

INSERT INTO FY_TB_BL_BILL_CI:
  CHARGE_TYPE = 'DBT'
  AMOUNT = 0
  DYNAMIC_ATTRIBUTE = '#PAYMENT_TIMING=D#CUR_BILLED=2024-12-15#FREQ=1'
```

#### 產品 2: 雲端儲存 (DFC退費)
```sql
-- 計算使用天數
啟用日: 2024/12/20
終止日: 2025/01/10
本帳期: 2024/12/16 ~ 2025/01/15

本帳期內使用天數 = 2025/01/10 - 2024/12/20 + 1 = 22天
本帳期總天數 = 31天

-- Pro-rata 費用
原始月租 = $1,000
Pro-rata = $1,000 × (22/31) = $710

-- 但是 DFC 終止，需要退費
已出帳金額 = $1,000 (假設12月已收取全月)
實際使用 = 22天
退費 = $1,000 × (9/31) = $290  -- 未使用的9天

INSERT CI 1:
  CHARGE_TYPE = 'DBT'
  AMOUNT = 710
  
INSERT CI 2 (退費):
  CHARGE_TYPE = 'CRD'
  AMOUNT = -290
  DYNAMIC_ATTRIBUTE = '#END_RSN=DFC#REFUND_DAYS=9'
```

#### 產品 3: 企業方案 (SUSPEND)
```sql
-- 計算 SUSPEND 天數
SUSPEND 期間: 2024/12/25 ~ 2025/01/05
本帳期: 2024/12/16 ~ 2025/01/15

本帳期內 SUSPEND 天數 = 2025/01/05 - 2024/12/25 + 1 = 12天
本帳期總天數 = 31天
實際計費天數 = 31 - 12 = 19天

-- 計算費用
原始月租 = $3,000
實際費用 = $3,000 × (19/31) = $1,839

INSERT INTO FY_TB_BL_BILL_CI:
  CHARGE_TYPE = 'DBT'
  AMOUNT = 1839
  DYNAMIC_ATTRIBUTE = '#SUSPEND_DAYS=12#ACTIVE_DAYS=19#FROM=2024-12-16#TO=2025-01-15'
```

### 帳單彙總
```
產品1 (固網專線):     $0     (預付費,已收)
產品2 (雲端儲存):    $420    ($710 - $290 退費)
產品3 (企業方案):  $1,839    (扣除暫停天數)
─────────────────────────────
本期應收合計:      $2,259
```

---

## 🚨 特殊注意事項

### 1. MARKET_PKG 呼叫時機
```sql
-- 只在 MARKET MOVE 時呼叫
IF R_AT.PRE_CYCLE IS NOT NULL THEN
    Fy_Pg_Bl_Bill_Util.MARKET_PKG(
        gnCYCLE,
        R_AT.SUBSCR_ID, 
        R_AT.PRE_CYCLE,
        PI_PROC_TYPE,
        PI_BILL_SEQ
    )
END IF
```

### 2. BDE 處理的複雜性
```sql
-- 從 MV 取得 BDE 資料時
-- 最小一個 SUB 時獎金為 0
-- 超流量不計入業績
```

### 3. NPEP 結算
```sql
-- SR228032 NPEP Phase 2.1
-- SR239378 SDWAN_NPEP solution
-- 需要特別處理 PRT_ID 和 PRT_VALUE
```

---

## 📝 版本演進的商業邏輯變更

### 3.0 (2020/06/30) - MPBS Migration
- 新增預定費 RC 常態計算處理
- 新增 FY_TB_RAT_SUMMARY → FY_TB_RAT_SUMMARY_BILL
- 新增 TXN_ID 欄位

### 4.0 (2021/06/15) - 帳單預付處理
- 新增 MARKET_PKG 參數
- 新增 PRE_CYCLE 判斷
- 重寫 PREPAYMENT 邏輯

### 5.0 (2023/04/18) - Project-M Fixed Line Phase I
- 新增 CYCLE 15, 20 處理
- 新增預付費到期不計入最後一期邏輯
- 新增 PAYMENT_TIMING='D' 特殊處理
- 新增 DFC 退費邏輯

### 5.9 (2024/04/16) - SR266082 ICT 擴展
- 費用自動調整機制

---

**文檔產生時間**: 2026-01-06  
**基於 Package 版本**: 5.9+  
**代碼行數**: 3,997 行  
**作者**: 基於實際 PL/SQL 代碼深度分析
