# UBL-DB 深度解析：FY_PG_BL_DATA_SYNC Package

## 一、Package 概覽

**Package 名稱**：FY_PG_BL_DATA_SYNC  
**代碼行數**：3,233 行  
**核心功能**：資料同步處理，將前端系統（DIO/MPBS/HGBN）的變更同步到計費系統  
**業務定位**：UBL 與其他系統的資料橋樑，處理帳戶、服務、參數的新增、變更、終止

---

## 二、核心業務邏輯

### 1. 資料同步架構

**系統整合關係**：
```
┌─────────────┐
│ DIO (前端)   │ ──┐
└─────────────┘   │
                  │
┌─────────────┐   │    ┌──────────────────┐
│ MPBS        │ ──┼───→│ FY_PG_BL_DATA_SYNC│
└─────────────┘   │    └──────────────────┘
                  │             │
┌─────────────┐   │             ↓
│ HGBN/MIB    │ ──┘    ┌──────────────────┐
└─────────────┘        │ FY_TB_BL_* 計費表 │
                       └──────────────────┘
```

**同步目標表**：
- `FY_TB_BL_ACCOUNT`：帳戶主檔
- `FY_TB_BL_CUST_CYCLE`：客戶帳期
- `FY_TB_BL_CHANGE_CYCLE`：帳期變更記錄
- `FY_TB_BL_SUB_STATUS_PERIOD`：服務狀態期間
- `FY_TB_BL_ACCT_PKG`：訂閱 Package
- `FY_TB_BL_OFFER_PARAM`：Offer 參數
- `FY_TB_BL_BILL_CI`：費用項目（OC/RC）

---

### 2. 36 個核心函數列表

#### A. 帳戶與客戶管理

| 函數名稱 | 功能說明 | 主要處理表 |
|---------|----------|-----------|
| **NEW_ACCOUNT** | 新建帳戶同步 | FY_TB_BL_ACCOUNT, FY_TB_BL_CUST_CYCLE |
| **NEW_CUSTOMER** | 新建客戶同步 | FY_TB_BL_ACCOUNT, FY_TB_BL_CUST_CYCLE |
| **CHGCYC** | 變更帳期 | FY_TB_BL_CHANGE_CYCLE, FY_TB_BL_CUST_CYCLE |

#### B. 服務（OU）管理

| 函數名稱 | 功能說明 | 主要處理表 |
|---------|----------|-----------|
| **OU_SERVICE_CHANGE** | OU 服務變更 | FY_TB_BL_ACCT_PKG, FY_TB_BL_OFFER_PARAM, FY_TB_BL_BILL_CI |
| **OU_UPDATE_PARAMETER** | OU 參數更新 | FY_TB_BL_OFFER_PARAM, FY_TB_BL_BILL_CI |

#### C. 服務號碼（Subscriber）管理

| 函數名稱 | 功能說明 | 主要處理表 |
|---------|----------|-----------|
| **NEW_SUB_ACTIVATION** | 新服務號碼啟用 | FY_TB_BL_SUB_STATUS_PERIOD, FY_TB_BL_ACCT_PKG, FY_TB_BL_BILL_CI |
| **SERVICE_CHANGE** | 服務變更 | FY_TB_BL_ACCT_PKG, FY_TB_BL_OFFER_PARAM, FY_TB_BL_BILL_CI |
| **CHANGE_RESOURCE** | 資源變更（號碼移轉） | FY_TB_BL_ACCT_PKG, FY_TB_BL_BILL_CI |
| **MOVE_SUB** | 服務號碼搬家 | FY_TB_BL_ACCT_PKG, FY_TB_BL_BILL_CI |
| **UPDATE_SUB_DATE** | 更新服務號碼日期 | FY_TB_BL_SUB_STATUS_PERIOD |
| **UPDATE_SUB_OFFER_DATE** | 更新服務號碼 Offer 日期 | FY_TB_BL_ACCT_PKG |
| **SUB_MODI_STATUS** | 服務號碼狀態異動 | FY_TB_BL_SUB_STATUS_PERIOD, FY_TB_BL_BILL_CI |
| **UPDATE_PARAMETERS** | 更新服務號碼參數 | FY_TB_BL_OFFER_PARAM, FY_TB_BL_BILL_CI |
| **UPDATE_SUB_ATTR** | 更新服務號碼屬性 | FY_TB_BL_OFFER_PARAM |

#### D. Offer & Param 處理（內部函數）

| 函數名稱 | 功能說明 | 處理邏輯 |
|---------|----------|---------|
| **CHANGE_OFFER** | Offer 變更處理 | 處理 NEW/OLD Offer，更新 FY_TB_BL_ACCT_PKG |
| **CHANGE_PARAM** | 參數變更處理 | 處理 NEW/OLD Param，更新 FY_TB_BL_OFFER_PARAM |
| **CREATE_OFFER_OC** | 建立 Offer OC 費用 | 依據 Offer 建立 One-time Charge |
| **CREATE_CI** | 建立 CI 費用項目 | 建立 Charge Item（OC/RC/DE） |

---

### 3. 關鍵函數深度解析

#### NEW_ACCOUNT：新建帳戶同步

**業務場景**：DIO 建立新帳戶時，同步到計費系統

**參數說明**：
```sql
PROCEDURE NEW_ACCOUNT(
   PI_TRAN_ID           IN   NUMBER,          -- 交易ID
   PI_TRX_DATE          IN   DATE,            -- 交易日期
   PI_RSN_CODE          IN   VARCHAR2,        -- 原因碼
   PI_ACCT_ID           IN   NUMBER,          -- 帳戶ID
   PI_CUST_ID           IN   NUMBER,          -- 客戶ID
   PI_OU_ID             IN   NUMBER,          -- OU_ID
   PI_SUBSCR_ID         IN   NUMBER,          -- 服務號碼ID
   PI_NEW_VALUE         IN   VARCHAR2,        -- 新值
   PI_OLD_VALUE         IN   VARCHAR2,        -- 舊值
   PI_STATUS            IN   VARCHAR2,        -- 服務狀態
   PI_STATUS_DATE       IN   DATE,            -- 狀態日期
   PI_EFF_DATE          IN   DATE,            -- 生效日期
   PI_END_DATE          IN   DATE,            -- 終止日期
   PI_CHARGE_CODE       IN   VARCHAR2,        -- 費用代碼
   PI_DATE_TYPE         IN   VARCHAR2,        -- 日期類型（EFF/END/FUTURE_EXP/ORIG_EFF）
   PI_WAIVE_INDICATOR   IN   VARCHAR2,        -- 是否免收費（Y/N）
   PI_PREV_SUB_ID       IN   NUMBER,          -- 前服務號碼（MoveSub用）
   PI_SUBSCR_TYPE       IN   VARCHAR2,        -- 服務號碼類型
   PI_REMARK            IN   VARCHAR2,        -- UCM XSD
   PI_NEW_OFFER         IN   FY_TT_SYS_SYNC_OFFER_INFO,    -- 新Offer清單
   PI_OLD_OFFER         IN   FY_TT_SYS_SYNC_OFFER_INFO,    -- 舊Offer清單
   PI_NEW_PARAM         IN   FY_TT_SYS_SYNC_PARAM_INFO,    -- 新參數清單
   PI_OLD_PARAM         IN   FY_TT_SYS_SYNC_PARAM_INFO,    -- 舊參數清單
   PI_NEW_RESOURCE      IN   FY_TT_SYS_SYNC_RESOURCE,      -- 新資源清單
   PI_OLD_RESOURCE      IN   FY_TT_SYS_SYNC_RESOURCE,      -- 舊資源清單
   PI_NEW_ATTR          IN   FY_TT_SYS_SYNC_PARAM_INFO,    -- 新屬性清單
   PI_OLD_ATTR          IN   FY_TT_SYS_SYNC_PARAM_INFO,    -- 舊屬性清單
   PO_ERR_CDE          OUT   VARCHAR2,        -- 錯誤代碼
   PO_ERR_MSG          OUT   VARCHAR2         -- 錯誤訊息
);
```

**關鍵處理流程**：
```sql
-- 1. 初始化全域變數
gnTRAN_ID     := PI_TRAN_ID;
gdTRX_DATE    := PI_STATUS_DATE;
gvRSN_CODE    := PI_RSN_CODE;
gnCUST_ID     := PI_CUST_ID;
gnACCT_ID     := PI_ACCT_ID;
gnOU_ID       := PI_OU_ID;
gvENTITY_TYPE := 'A';  -- Account

-- 2. 插入帳戶主檔
INSERT INTO FY_TB_BL_ACCOUNT (
   ACCT_ID, CUST_ID, OU_ID, ...
) VALUES (...);

-- 3. 插入客戶帳期
INSERT INTO FY_TB_BL_CUST_CYCLE (
   CUST_ID, CYCLE, CYCLE_MONTH, ...
) VALUES (...);

-- 4. MPBS_Migration 判斷
-- 2020/06/30: 新增 MPBL (MPBS) 判斷邏輯
WHERE CYCLE = gnCYCLE
  AND ((gvMPBL='Y' AND CREATE_USER='MPBL') OR
       (gvMPBL<>'Y' AND CREATE_USER<>'MPBL'));

-- 5. 建立費用項目（若有 CHARGE_CODE）
IF PI_CHARGE_CODE IS NOT NULL THEN
   CREATE_CI(NULL,  -- PI_OFFER_INSTANCE_ID,
             NULL,  -- PI_OFFER_ID,
             NULL,  -- PI_OFFER_SEQ,
             gdTRX_DATE, -- PI_EFF_DATE
             NULL,  -- NU_PKG_ID,
             NULL,  -- PI_OC_ID
             PI_CHARGE_CODE,
             NULL,  -- AMOUNT
             NULL,  -- NU_OVERWRITE,
             PI_WAIVE_INDICATOR);
END IF;

-- 6. COMMIT (AUTONOMOUS_TRANSACTION)
COMMIT;
```

**PRAGMA AUTONOMOUS_TRANSACTION**：
- 獨立交易處理，避免影響主流程
- 即使主流程失敗，同步資料也能保留

---

#### SERVICE_CHANGE：服務變更

**業務場景**：服務號碼變更 Offer/Param 時同步到計費系統

**關鍵處理邏輯**：
```sql
-- 1. 處理舊參數（OLD_PARAM）
gvSTEP := 'OLD_PARAM CALL CHANGE_PARAM:';
CHANGE_PARAM('OLD',         -- PI_TYPE
             'PARAM',       -- PARAM_TYPE
             PI_OLD_PARAM); -- PI_PARAM_OBJECT

-- 2. 處理舊 Offer（OLD_OFFER）
gvSTEP := 'OLD OFFER CALL CHANGE_OFFER:';
CHANGE_OFFER('OLD',         -- PI_TYPE
             NULL,          -- PI_DATE_TYPE
             PI_OLD_OFFER); -- PI_OFFER_OBJECT

-- 3. 處理新參數（NEW_PARAM）
gvSTEP := 'NEW PARAM CALL CHANGE_PARAM:';
CHANGE_PARAM('NEW',         -- PI_TYPE
             'PARAM',       -- PARAM_TYPE
             PI_NEW_PARAM); -- PI_PARAM_OBJECT

-- 4. 處理新 Offer（NEW_OFFER）
gvSTEP := 'NEW OFFER CALL CHANGE_OFFER:';
CHANGE_OFFER('NEW',         -- PI_TYPE
             NULL,          -- PI_DATE_TYPE
             PI_NEW_OFFER); -- PI_OFFER_OBJECT

-- 5. 建立費用項目（若有 CHARGE_CODE）
IF PI_CHARGE_CODE IS NOT NULL THEN
   gvSTEP := 'CALL CREATE_CI.OU_ID='||TO_CHAR(PI_OU_ID)||':';
   CREATE_CI(...);
END IF;
```

**處理順序重要性**：
- **先處理 OLD**：終止舊 Offer/Param（設定 END_DATE）
- **再處理 NEW**：啟用新 Offer/Param（設定 EFF_DATE）
- **避免重疊**：確保不會有兩個 Offer 同時 ACTIVE

---

#### CHANGE_OFFER：Offer 變更處理

**業務場景**：內部函數，處理 Offer 的新增/終止

**參數說明**：
```sql
PROCEDURE CHANGE_OFFER(
   PI_TYPE          IN VARCHAR2,                  -- 'NEW' 或 'OLD'
   PI_DATE_TYPE     IN VARCHAR2,                  -- 日期類型
   PI_OFFER_OBJECT  IN FY_TT_SYS_SYNC_OFFER_INFO -- Offer 清單 (Table Type)
);
```

**處理邏輯**：
```sql
-- 1. 迴圈處理 Offer 清單
FOR i IN 1..PI_OFFER_OBJECT.COUNT LOOP
   -- 2. 新增 Offer（PI_TYPE='NEW'）
   IF PI_TYPE = 'NEW' THEN
      INSERT INTO FY_TB_BL_ACCT_PKG (
         PKG_ID,
         ACCT_ID,
         SUBSCR_ID,
         OFFER_ID,
         OFFER_INSTANCE_ID,
         OFFER_SEQ,
         EFF_DATE,
         END_DATE,
         ...
      ) VALUES (...);

      -- 建立 OC 費用
      CREATE_OFFER_OC(PI_OFFER_OBJECT(i).INSTANCE_ID,
                      PI_OFFER_OBJECT(i).OFFER_ID,
                      PI_OFFER_OBJECT(i).OFFER_SEQ);
   END IF;

   -- 3. 終止 Offer（PI_TYPE='OLD'）
   IF PI_TYPE = 'OLD' THEN
      UPDATE FY_TB_BL_ACCT_PKG
         SET END_DATE = gdTRX_DATE,
             END_RSN = gvRSN_CODE,
             STATUS = 'INACTIVE'
       WHERE PKG_ID = PI_OFFER_OBJECT(i).PKG_ID
         AND ACCT_ID = gnACCT_ID;
   END IF;
END LOOP;
```

---

#### CHANGE_PARAM：參數變更處理

**業務場景**：內部函數，處理 Param 的新增/終止

**參數說明**：
```sql
PROCEDURE CHANGE_PARAM(
   PI_TYPE         IN VARCHAR2,                  -- 'NEW' 或 'OLD'
   PARAM_TYPE      IN VARCHAR2,                  -- 'PARAM' 或 'ATTR'
   PI_PARAM_OBJECT IN FY_TT_SYS_SYNC_PARAM_INFO  -- 參數清單 (Table Type)
);
```

**處理邏輯**：
```sql
-- 1. 迴圈處理參數清單
FOR i IN 1..PI_PARAM_OBJECT.COUNT LOOP
   -- 2. 新增參數（PI_TYPE='NEW'）
   IF PI_TYPE = 'NEW' THEN
      INSERT INTO FY_TB_BL_OFFER_PARAM (
         OFFER_SEQ,
         PARAM_NAME,
         PARAM_VALUE,
         EFF_DATE,
         END_DATE,
         ...
      ) VALUES (...);
   END IF;

   -- 3. 終止參數（PI_TYPE='OLD'）
   IF PI_TYPE = 'OLD' THEN
      UPDATE FY_TB_BL_OFFER_PARAM
         SET END_DATE = gdTRX_DATE,
             END_RSN = gvRSN_CODE
       WHERE OFFER_SEQ = PI_PARAM_OBJECT(i).OFFER_SEQ
         AND PARAM_NAME = PI_PARAM_OBJECT(i).PARAM_NAME;
   END IF;
END LOOP;
```

---

#### CREATE_CI：建立 CI 費用項目

**業務場景**：根據 CHARGE_CODE 建立費用項目到 FY_TB_BL_BILL_CI

**參數說明**：
```sql
PROCEDURE CREATE_CI(
   PI_INSTANCE_ID      IN NUMBER,      -- Offer Instance ID
   PI_OFFER_ID         IN NUMBER,      -- Offer ID
   PI_OFFER_SEQ        IN NUMBER,      -- Offer SEQ
   PI_EFF_DATE         IN DATE,        -- 生效日期
   PI_PKG_ID           IN NUMBER,      -- Package ID
   PI_OC_ID            IN NUMBER,      -- OC ID (from FY_TB_PBK_PACKAGE_OC)
   PI_CHARGE_CODE      IN VARCHAR2,    -- 費用代碼
   PI_AMOUNT           IN NUMBER,      -- 金額（NULL 則從 FY_TB_PBK_CHARGE_CODE 取得）
   PI_OVERWRITE        IN VARCHAR2,    -- 覆寫標記
   PI_WAIVE_INDICATOR  IN VARCHAR2     -- 免收費標記（Y/N）
);
```

**關鍵處理邏輯**：
```sql
-- 1. 查詢費用代碼資訊
SELECT AMOUNT, CHARGE_ORG, ...
  INTO NU_AMOUNT, CH_CHARGE_ORG, ...
  FROM FY_TB_PBK_CHARGE_CODE
 WHERE CHARGE_CODE = PI_CHARGE_CODE;

-- 2. 判斷是否免收費
IF PI_WAIVE_INDICATOR = 'Y' THEN
   NU_AMOUNT := 0;  -- 費用歸零
END IF;

-- 3. 插入 CI
INSERT INTO FY_TB_BL_BILL_CI (
   BILL_SEQ,        -- 帳單序號（未定）
   CYCLE,           -- 帳期
   CYCLE_MONTH,     -- 帳期月份
   ACCT_ID,         -- 帳戶ID
   SUBSCR_ID,       -- 服務號碼ID
   OFFER_ID,        -- Offer ID
   OFFER_INSTANCE_ID, -- Offer Instance ID
   OFFER_SEQ,       -- Offer SEQ
   PKG_ID,          -- Package ID
   CHARGE_CODE,     -- 費用代碼
   AMOUNT,          -- 金額
   SOURCE,          -- 來源（OC/RC/UC/DE）
   CHRG_DATE,       -- 費用日期
   CHARGE_ORG,      -- 費用組織（RA/CC/DE/IN）
   OVERWRITE,       -- 覆寫標記
   WAIVE_INDICATOR, -- 免收費標記
   ...
) VALUES (...);
```

**SOURCE 決定**：
```sql
-- OC: One-time Charge（一次性費用）
-- RC: Recurring Charge（月租費）
-- UC: Usage Charge（用量費）
-- DE: Discount（折扣）
```

---

### 4. MPBS_Migration 特殊處理

**業務背景**：2020/06/30 MPBS_Migration（SR226548）

**技術實現**：
```sql
-- 全域變數
gvMPBL VARCHAR2(1);  -- 'Y'/'N'

-- CYCLE 查詢邏輯
SELECT CYCLE, CURRECT_PERIOD
  FROM FY_TB_BL_CYCLE
 WHERE CYCLE = gnCYCLE
   AND ((gvMPBL='Y' AND CREATE_USER='MPBL') OR     -- MPBS 資料
        (gvMPBL<>'Y' AND CREATE_USER<>'MPBL'));    -- 非 MPBS 資料
```

**隔離原因**：
- MPBS 與 DIO 是兩套獨立系統
- CYCLE 定義可能不同（FROM_DAY/TO_DAY）
- 需要避免資料混亂

---

### 5. 版本演進與需求背景

| 版本 | 日期 | SR 編號 | 業務需求 |
|------|------|---------|----------|
| 1.0 | 2018/09/01 | - | CREATE 初版 |
| 1.1 | 2018/09/14 | - | 修正 FY_TB_BL_BILL_CI.CHRG_DATE=OFFER.EFF_DATE |
| 1.2 | 2018/10/01 | - | 修正 FY_TB_RAT_CUST_CYCLE trunc(eff_date) |
| 1.3 | 2018/10/03 | - | 修正 fy_tb_bl_bill_offer_param.param_name 寫法 |
| 1.4 | 2018/10/05 | - | 修正 ACCT_KEY 寫法 |
| 1.5 | 2018/10/22 | - | 修正 PI_ATTR_OBJECT & DT_FUTURE_DATE 處理 |
| 2.0 | 2018/10/30 | - | TABLE SCAN INDEX 方法改用 ACCT_KEY |
| 2.1 | 2019/11/20 | - | SERVICE_CHANGE 新增輸出 PRE_ACCT_ID |
| 2.2 | 2020/06/09 | SR226548 | 遠傳（企業）服務及服務系統整合 |
| 3.0 | 2020/06/30 | - | **MPBS_Migration**：FY_TB_BL_CYCLE P_KEY 改為 CYCLE+CREATE_USER |
| 3.1 | 2021/12/03 | - | Prepayment 繳費方式的 properties 改為 rolling |
| 4.3 | 2021/10/20 | SR239378 | SDWAN_NPEP solution 整合 |
| 4.4 | 2022/01/13 | SR246834 | SDWAN_NPEP solution 整合_DYNAMIC_ATTRIBUTE 新增 DEVICE_COUNT |
| 5.0 | 2023/08/01 | SR260229 | Project-M Fixed line Phase I，修正 CHANGE CYCLE 時期間問題 |

---

## 三、複雜場景處理

### 案例 1：服務號碼啟用（NEW_SUB_ACTIVATION）

**背景資料**：
- **服務號碼**：SUBSCR_ID=12345
- **Offer**：[OFFER_1, OFFER_2]（新增）
- **Param**：[{PARAM_NAME='DATA_LIMIT', PARAM_VALUE='10GB'}]（新增）
- **CHARGE_CODE**：'OC_ACT'（啟用費 500 元）
- **EFF_DATE**：2025/01/06

**處理流程**：

**步驟 1：初始化**
```sql
gnTRAN_ID     := 1001;
gdTRX_DATE    := 2025/01/06;
gvRSN_CODE    := 'ACT';
gnSUBSCR_ID   := 12345;
gvENTITY_TYPE := 'S';  -- Subscriber
```

**步驟 2：插入服務狀態期間**
```sql
INSERT INTO FY_TB_BL_SUB_STATUS_PERIOD (
   SUBSCR_ID,
   STATUS,
   EFF_DATE,
   END_DATE,
   ...
) VALUES (
   12345,
   'ACTIVE',
   TO_DATE('2025/01/06', 'YYYY/MM/DD'),
   NULL,
   ...
);
```

**步驟 3：處理 NEW_OFFER**
```sql
CHANGE_OFFER('NEW', NULL, PI_NEW_OFFER);

-- 內部邏輯：
FOR i IN 1..PI_NEW_OFFER.COUNT LOOP
   INSERT INTO FY_TB_BL_ACCT_PKG (
      PKG_ID,
      ACCT_ID,
      SUBSCR_ID,
      OFFER_ID,
      OFFER_INSTANCE_ID,
      OFFER_SEQ,
      EFF_DATE,
      END_DATE,
      STATUS,
      ...
   ) VALUES (
      PKG_ID_SEQ.NEXTVAL,
      gnACCT_ID,
      12345,
      PI_NEW_OFFER(i).OFFER_ID,
      PI_NEW_OFFER(i).INSTANCE_ID,
      PI_NEW_OFFER(i).OFFER_SEQ,
      TO_DATE('2025/01/06', 'YYYY/MM/DD'),
      NULL,
      'ACTIVE',
      ...
   );

   -- 建立 OC 費用
   CREATE_OFFER_OC(PI_NEW_OFFER(i).INSTANCE_ID,
                   PI_NEW_OFFER(i).OFFER_ID,
                   PI_NEW_OFFER(i).OFFER_SEQ);
END LOOP;
```

**步驟 4：處理 NEW_PARAM**
```sql
CHANGE_PARAM('NEW', 'PARAM', PI_NEW_PARAM);

-- 內部邏輯：
FOR i IN 1..PI_NEW_PARAM.COUNT LOOP
   INSERT INTO FY_TB_BL_OFFER_PARAM (
      OFFER_SEQ,
      PARAM_NAME,
      PARAM_VALUE,
      EFF_DATE,
      END_DATE,
      ...
   ) VALUES (
      PI_NEW_PARAM(i).OFFER_SEQ,
      'DATA_LIMIT',
      '10GB',
      TO_DATE('2025/01/06', 'YYYY/MM/DD'),
      NULL,
      ...
   );
END LOOP;
```

**步驟 5：建立啟用費 CI**
```sql
CREATE_CI(NULL,           -- PI_INSTANCE_ID
          NULL,           -- PI_OFFER_ID
          NULL,           -- PI_OFFER_SEQ
          gdTRX_DATE,     -- PI_EFF_DATE
          NULL,           -- NU_PKG_ID
          NULL,           -- PI_OC_ID
          'OC_ACT',       -- PI_CHARGE_CODE
          NULL,           -- AMOUNT (從 FY_TB_PBK_CHARGE_CODE 取得)
          NULL,           -- NU_OVERWRITE
          'N');           -- PI_WAIVE_INDICATOR

-- 內部邏輯：
INSERT INTO FY_TB_BL_BILL_CI (
   BILL_SEQ,        -- NULL（尚未產生帳單）
   CYCLE,           -- 10
   CYCLE_MONTH,     -- 202501
   ACCT_ID,         -- 12345
   SUBSCR_ID,       -- 12345
   CHARGE_CODE,     -- 'OC_ACT'
   AMOUNT,          -- 500
   SOURCE,          -- 'OC'
   CHRG_DATE,       -- 2025/01/06
   CHARGE_ORG,      -- 'CC'
   WAIVE_INDICATOR, -- 'N'
   ...
) VALUES (...);
```

**最終結果**：
- **FY_TB_BL_SUB_STATUS_PERIOD**：1 筆（ACTIVE）
- **FY_TB_BL_ACCT_PKG**：2 筆（OFFER_1, OFFER_2）
- **FY_TB_BL_OFFER_PARAM**：1 筆（DATA_LIMIT=10GB）
- **FY_TB_BL_BILL_CI**：1 筆（OC_ACT, 500 元）+ N 筆（Offer OC，依 FY_TB_PBK_PACKAGE_OC 決定）

---

### 案例 2：服務變更（SERVICE_CHANGE）

**背景資料**：
- **服務號碼**：SUBSCR_ID=12345
- **OLD_OFFER**：[OFFER_1]（終止）
- **NEW_OFFER**：[OFFER_2]（新增）
- **OLD_PARAM**：[{PARAM_NAME='DATA_LIMIT', PARAM_VALUE='10GB'}]（終止）
- **NEW_PARAM**：[{PARAM_NAME='DATA_LIMIT', PARAM_VALUE='20GB'}]（新增）
- **CHARGE_CODE**：NULL（無費用）
- **TRX_DATE**：2025/01/10

**處理流程**：

**步驟 1：處理 OLD_PARAM**
```sql
CHANGE_PARAM('OLD', 'PARAM', PI_OLD_PARAM);

-- 內部邏輯：
UPDATE FY_TB_BL_OFFER_PARAM
   SET END_DATE = TO_DATE('2025/01/10', 'YYYY/MM/DD'),
       END_RSN = gvRSN_CODE
 WHERE OFFER_SEQ = 1001
   AND PARAM_NAME = 'DATA_LIMIT';
```

**步驟 2：處理 OLD_OFFER**
```sql
CHANGE_OFFER('OLD', NULL, PI_OLD_OFFER);

-- 內部邏輯：
UPDATE FY_TB_BL_ACCT_PKG
   SET END_DATE = TO_DATE('2025/01/10', 'YYYY/MM/DD'),
       END_RSN = gvRSN_CODE,
       STATUS = 'INACTIVE'
 WHERE PKG_ID = 1001
   AND ACCT_ID = gnACCT_ID;
```

**步驟 3：處理 NEW_PARAM**
```sql
CHANGE_PARAM('NEW', 'PARAM', PI_NEW_PARAM);

-- 內部邏輯：
INSERT INTO FY_TB_BL_OFFER_PARAM (
   OFFER_SEQ,
   PARAM_NAME,
   PARAM_VALUE,
   EFF_DATE,
   END_DATE,
   ...
) VALUES (
   1002,
   'DATA_LIMIT',
   '20GB',
   TO_DATE('2025/01/10', 'YYYY/MM/DD'),
   NULL,
   ...
);
```

**步驟 4：處理 NEW_OFFER**
```sql
CHANGE_OFFER('NEW', NULL, PI_NEW_OFFER);

-- 內部邏輯：
INSERT INTO FY_TB_BL_ACCT_PKG (
   PKG_ID,
   ACCT_ID,
   SUBSCR_ID,
   OFFER_ID,
   OFFER_INSTANCE_ID,
   OFFER_SEQ,
   EFF_DATE,
   END_DATE,
   STATUS,
   ...
) VALUES (
   PKG_ID_SEQ.NEXTVAL,
   gnACCT_ID,
   12345,
   OFFER_2,
   INSTANCE_2,
   1002,
   TO_DATE('2025/01/10', 'YYYY/MM/DD'),
   NULL,
   'ACTIVE',
   ...
);

-- 建立 OC 費用
CREATE_OFFER_OC(INSTANCE_2, OFFER_2, 1002);
```

**最終結果**：
- **FY_TB_BL_ACCT_PKG**：
  - PKG_ID=1001：END_DATE=2025/01/10, STATUS='INACTIVE'
  - PKG_ID=1002：EFF_DATE=2025/01/10, END_DATE=NULL, STATUS='ACTIVE'
- **FY_TB_BL_OFFER_PARAM**：
  - OFFER_SEQ=1001, DATA_LIMIT='10GB'：END_DATE=2025/01/10
  - OFFER_SEQ=1002, DATA_LIMIT='20GB'：EFF_DATE=2025/01/10, END_DATE=NULL

---

## 四、技術亮點與設計模式

### 1. AUTONOMOUS_TRANSACTION

**設計原因**：
```sql
PRAGMA AUTONOMOUS_TRANSACTION;
```

**優點**：
- 獨立交易，避免互相影響
- 即使主流程 ROLLBACK，同步資料也能保留
- 適合異步處理（Batch Job）

**缺點**：
- 無法共享 LOCK
- 需要顯式 COMMIT

---

### 2. Table Type 參數傳遞

**定義**：
```sql
-- 在 Package Spec 定義 Object Type
CREATE OR REPLACE TYPE FY_TO_SYS_SYNC_OFFER IS OBJECT (
   PKG_ID           NUMBER,
   OFFER_ID         NUMBER,
   OFFER_SEQ        NUMBER,
   INSTANCE_ID      NUMBER,
   EFF_DATE         DATE,
   END_DATE         DATE,
   ...
);

-- 定義 Table Type
CREATE OR REPLACE TYPE FY_TT_SYS_SYNC_OFFER_INFO 
   AS TABLE OF FY_TO_SYS_SYNC_OFFER;
```

**使用**：
```sql
PROCEDURE SERVICE_CHANGE(
   PI_NEW_OFFER IN FY_TT_SYS_SYNC_OFFER_INFO,  -- 傳入陣列
   ...
);
```

**優點**：
- 一次傳遞多筆資料
- 避免多次呼叫函數
- 邏輯清晰

---

### 3. 錯誤處理模式

**全域變數**：
```sql
gvSTEP    VARCHAR2(300);  -- 目前步驟
gvERR_CDE VARCHAR2(4);    -- 錯誤代碼
gvERR_MSG VARCHAR2(300);  -- 錯誤訊息
```

**錯誤捕捉**：
```sql
gvSTEP := 'CALL CREATE_CI.ACCT_ID='||TO_CHAR(PI_ACCT_ID)||':';
CREATE_CI(...);
IF gvERR_CDE <> '0000' THEN
   PO_ERR_CDE := gvERR_CDE;
   gvSTEP := Substr(gvSTEP||gvERR_MSG, 1, 250);
   RAISE ON_ERR;
END IF;

...

EXCEPTION
   WHEN ON_ERR THEN
      ROLLBACK;
      PO_ERR_CDE := gvERR_CDE;
      PO_ERR_MSG := gvSTEP;
```

**優點**：
- 詳細記錄錯誤位置
- 便於 Debug

---

## 五、與其他 Package 的關聯

### 輸入來源：
- **DIO（前端系統）**：透過 API 呼叫 DATA_SYNC 函數
- **MPBS（行動計費）**：透過 Batch Job 呼叫
- **HGBN/MIB（企業計費）**：透過整合介面呼叫

### 輸出目標：
- **FY_TB_BL_ACCOUNT**：帳戶主檔
- **FY_TB_BL_ACCT_PKG**：訂閱 Package（供 CI/BI/MAST 使用）
- **FY_TB_BL_OFFER_PARAM**：Offer 參數（供 CI 計算使用）
- **FY_TB_BL_BILL_CI**：費用項目（供 BI/MAST 彙總）

### 關聯 Package：
- **FY_PG_BL_BILL_CI**：讀取 FY_TB_BL_ACCT_PKG 進行 RC 計算
- **FY_PG_BL_BILL_BI**：讀取 FY_TB_BL_BILL_CI 進行彙總
- **FY_PG_BL_BILL_MAST**：讀取 FY_TB_BL_BILL_BI 生成帳單

---

## 六、開發與維護建議

### 1. 測試重點

**關鍵測試案例**：
- **NEW_ACCOUNT**：新建帳戶 + Offer + Param + CI
- **SERVICE_CHANGE**：Offer 變更（OLD → NEW）
- **MPBS_Migration**：MPBL='Y' 與 MPBL='N' 隔離
- **WAIVE_INDICATOR**：免收費標記（金額歸零）
- **AUTONOMOUS_TRANSACTION**：獨立交易 COMMIT/ROLLBACK

---

### 2. 效能優化

**索引需求**：
- FY_TB_BL_ACCT_PKG：`(PKG_ID, ACCT_ID, SUBSCR_ID, STATUS)`
- FY_TB_BL_OFFER_PARAM：`(OFFER_SEQ, PARAM_NAME, EFF_DATE, END_DATE)`
- FY_TB_BL_BILL_CI：`(BILL_SEQ, CYCLE, CYCLE_MONTH, ACCT_KEY, ACCT_ID)`

**批次處理建議**：
- 使用 FORALL 批次 INSERT
- 避免逐筆 COMMIT（改用批次 COMMIT）

---

### 3. 常見問題排查

**Q1：資料同步失敗，但找不到錯誤記錄？**
- 檢查 AUTONOMOUS_TRANSACTION 是否已 COMMIT
- 檢查 gvSTEP 錯誤位置

**Q2：MPBS 與 DIO 資料混亂？**
- 檢查 gvMPBL 判斷邏輯
- 檢查 CREATE_USER 是否正確

**Q3：Offer 變更後，舊 Offer 未終止？**
- 檢查 CHANGE_OFFER('OLD') 是否執行
- 檢查 END_DATE 是否設定

---

## 七、總結

FY_PG_BL_DATA_SYNC 是 UBL 系統的資料同步核心，負責將前端系統（DIO/MPBS/HGBN）的變更即時同步到計費系統。其複雜度在於：

1. **多系統整合**：DIO、MPBS、HGBN 三套系統整合
2. **36 個函數**：涵蓋帳戶、服務、參數的所有變更場景
3. **AUTONOMOUS_TRANSACTION**：獨立交易處理，避免互相影響
4. **Table Type 傳遞**：一次處理多筆 Offer/Param
5. **MPBS_Migration**：MPBL 與非 MPBL 資料隔離

理解 DATA_SYNC Package 是掌握 UBL 與其他系統整合的關鍵。
