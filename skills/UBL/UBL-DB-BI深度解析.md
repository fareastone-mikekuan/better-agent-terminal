# UBL-DB 深度解析：FY_PG_BL_BILL_BI Package

## 一、Package 概覽

**Package 名稱**：FY_PG_BL_BILL_BI  
**代碼行數**：1,674 行  
**核心功能**：帳單項目（Bill Item）生成、Rounding 處理、稅率計算、DYNAMIC_ATTRIBUTE 組合  
**業務定位**：將 CI（Charge Item）彙總成 BI，並處理複雜的稅金與捨入邏輯

---

## 二、核心業務邏輯

### 1. BI 生成流程（GEN_BI）

**業務場景**：從 FY_TB_BL_BILL_CI 彙總資料到 FY_TB_BL_BILL_BI

#### 彙總規則：
```sql
-- PN (Parent Number) 彙總邏輯
-- SR255529: PN 計費邏輯調整
GROUP BY BILL_SUBSCR_ID, CHARGE_CODE, SOURCE, OFFER_ID, PKG_ID

-- 特殊處理：SR261173 Home grown CMP project Phase1
-- DE (Discount) 依據 PRODUCT_TYPE 分開彙總
WHERE SOURCE = 'DE' 
  AND PKG_ID IN (SELECT PKG_ID FROM FY_TB_BL_ACCT_PKG A, FY_TB_PBK_OFFER B 
                 WHERE A.OFFER_ID = B.OFFER_ID AND B.PRODUCT_TYPE = 'I')
GROUP BY BILL_SUBSCR_ID, CHARGE_CODE, SOURCE, OFFER_ID, PKG_ID, OFFER_INSTANCE_ID, OFFER_SEQ
```

**關鍵欄位轉換**：
- **CHARGE_ORG 決定**：
  ```sql
  DECODE(SOURCE,
    'UC', DECODE(SIGN(SUM(AMOUNT)), -1, 'DE', 'RA'),  -- Usage Charge: 負數→Debit, 正數→Revenue
    'DE', 'DE',                                        -- Discount: 固定Debit
    'CC')                                              -- Correction: 固定CC
  ```

- **CORRECT_SEQ 處理**：
  ```sql
  -- OC (One-time Charge) 需要累加序號
  DECODE(SOURCE, 'OC', 
    NVL(DECODE(MAX(NVL(CORRECT_SEQ,0)), 0, 0, MAX(NVL(CORRECT_SEQ,0))+1), 1), 
    0)
  ```

- **DYNAMIC_ATTRIBUTE 標記**：
  ```sql
  'Is prorated=false#PN_IND=Y'  -- PN 標記
  ```

---

### 2. Rounding 處理機制

#### Tax Type 與 Rounding 規則

**三種稅率類型**：
- **TX1**：一般營業稅（預設稅率）
- **TX2**：免稅（稅率 0%）
- **TX3**：特殊稅率

#### 關鍵處理邏輯：

**A. 稅率查詢（GET_CURRENCY）**：
```sql
-- 1. 從 CHARGE_CODE 取得預設稅率
SELECT CC.TAX_RATE, CC.DSCR, LC.RATE_TAX
  FROM FY_TB_PBK_CHARGE_CODE CC, FY_TB_LOV_COMMON LC
 WHERE CC.CHARGE_CODE = PI_CHARGE_CODE
   AND LC.LOOKUP_TYPE = 'TAX_TYPE'
   AND LC.LOOKUP_CODE = CC.TAX_RATE

-- 2. SR273784: Project M Fixed Line Phase II
-- elem5 (0,21) 稅率轉換邏輯
SELECT DECODE(elem5, 
         0, DECODE(CH_TAX_RATE, 'TX2', 'TX1', 'TX1', 'TX2', CH_TAX_RATE),
         21, DECODE(CH_TAX_RATE, 'TX2', 'TX1', 'TX1', 'TX2', CH_TAX_RATE),
         CH_TAX_RATE) TAX_RATE,
       DECODE(elem5, 
         0, DECODE(NU_RATE_TAX, 0, 5, 5, 0, NU_RATE_TAX),
         21, DECODE(NU_RATE_TAX, 0, 5, 5, 0, NU_RATE_TAX),
         NU_RATE_TAX) RATE_TAX
```

**B. SR237202：AWS HGB 稅率特殊處理**：
```sql
-- AWS 在 HGB 設定了全新稅率（未有專案設定）
-- 若查無稅率，預設為 TX2（免稅）
SELECT 'TX2' as TAX_RATE, 0 as RATE_TAX
  INTO CH_TAX_RATE, NU_RATE_TAX
```

**C. DO_ROUND 處理**：
```sql
-- 彙總各 TAX_TYPE 的金額
SELECT TAX_TYPE, SUM(AMOUNT) AMOUNT, SUM(TAX_AMT) TAX_AMT
  FROM (CI 資料)
 GROUP BY TAX_TYPE
 ORDER BY TAX_TYPE DESC;

-- 依據 TAX_TYPE 更新全域變數
IF R_BI.TAX_TYPE = 'TX1' THEN
   gvROUND_TX1 := R_BI.CHARGE_CODE;
   gnRATE_TX1 := R_BI.TAX_AMT;
ELSIF R_BI.TAX_TYPE = 'TX2' THEN
   gvROUND_TX2 := R_BI.CHARGE_CODE;
   gnRATE_TX2 := R_BI.TAX_AMT;
ELSIF R_BI.TAX_TYPE = 'TX3' THEN
   gvROUND_TX3 := R_BI.CHARGE_CODE;
   gnRATE_TX3 := R_BI.TAX_AMT;
END IF;
```

---

### 3. INS_BI 插入邏輯

**業務場景**：插入帳單項目到 FY_TB_BL_BILL_BI

**關鍵處理**：
```sql
PROCEDURE INS_BI(
   PI_CHARGE_CODE             IN VARCHAR2,
   PI_CHARGE_DESCR            IN VARCHAR2,
   PI_OFFER_SEQ               IN NUMBER,
   PI_OFFER_INSTANCE_ID       IN NUMBER,
   PI_PKG_ID                  IN NUMBER,
   PI_AMOUNT                  IN NUMBER,
   PI_CHRG_DATE               IN DATE,
   PI_CHRG_FROM_DATE          IN DATE,
   PI_CHRG_END_DATE           IN DATE,
   PI_SOURCE                  IN VARCHAR2,
   PI_CORRECT_SEQ             IN NUMBER,
   PI_CI_SEQ                  IN NUMBER,
   PI_DYNAMIC_ATTRIBUTE       IN VARCHAR2,
   PI_CHARGE_ORG              IN VARCHAR2,
   PI_BILL_SUBSCR_ID          IN NUMBER
);
```

**DYNAMIC_ATTRIBUTE 組合**：
- 從 CI 繼承：`FY_TB_BL_BILL_CI.DYNAMIC_ATTRIBUTE`
- PN 標記：`'Is prorated=false#PN_IND=Y'`
- 2019/11/11 SR219716：IOT 預付費處理，新增 DE DYNAMIC_ATTRIBUTE 來源

---

### 4. 幣別處理（Currency）

**A. GET_CURRENCY**：
```sql
-- 計算稅金金額
NU_RATE_TAX := LC.RATE_TAX;  -- 稅率（如 5% → RATE_TAX = 5）
-- 實際稅額計算在 CI 階段完成
```

**B. GET_NTD_CURRENCY**：
```sql
-- 新台幣（NTD）匯率處理
PROCEDURE GET_NTD_CURRENCY(
   PI_BILL_CURRENCY    IN VARCHAR2,
   PI_BILL_FROM_DATE   IN DATE,
   PO_RATE_SCALE       OUT NUMBER,
   PO_ERR_CDE          OUT VARCHAR2,
   PO_ERR_MSG          OUT VARCHAR2
);
```

**C. DO_NTD_ROUND**：
```sql
-- 新台幣捨入處理
-- 通常為四捨五入到整數
```

---

## 三、版本演進與需求背景

### 重要版本歷史：

| 版本 | 日期 | SR 編號 | 業務需求 |
|------|------|---------|----------|
| 1.0 | 2018/09/01 | - | CREATE 初版 |
| 1.1 | 2018/09/25 | - | 0 金額處理，避免重複匯率計算 |
| 1.6 | 2018/10/24 | - | UC GROUP BY 從 CET 改為 CHARGE_CODE，新增 CHRG_DATE 處理 |
| 2.0 | 2018/10/29 | - | TABLE SCAN INDEX 方法改用 ACCT_KEY |
| 2.1 | 2019/06/30 | - | FY_TB_BL_BILL_BI 新增 UC DYNAMIC_ATTRIBUTE 來源 |
| 2.2 | 2019/11/11 | SR219716 | IOT 預付費處理，新增 DE DYNAMIC_ATTRIBUTE 來源 |
| 2.3 | 2019/12/31 | - | 計算稅後新增 DYNAMIC_ATTRIBUTE，避免重複 rounding charge |
| 3.0 | 2020/06/30 | - | MPBS_Migration 新增憑證輸出處理 |
| 3.1 | 2021/02/23 | - | MPBS_Migration 修正折返後 CI.BI_SEQ 確認邏輯 |
| 3.2 | 2021/04/29 | SR237202 | AWS 在 HGB 設定了全新稅率（未有專案設定） |
| 4.0 | 2021/06/15 | - | 小數點位數處理 |
| 4.1 | 2021/07/01 | - | PN BILL_SUBSCR_ID 處理 |
| 4.1 | 2022/04/08 | - | 425 元件 4G 預付費減讓 |
| 4.2 | 2022/10/14 | SR255529 | PN 計費邏輯調整 |
| 5.0 | 2023/04/18 | SR260229 | Project-M Fixed line Phase I，新增 CYCLE(15,20) |
| 5.1 | 2023/04/20 | SR260229 | Project-M Fixed line Phase I，新增電子帳單折扣功能 |
| 5.2 | 2024/07/30 | SR261173 | Home grown CMP project Phase1，修改計費 group 邏輯 |
| 5.3 | 2025/01/24 | SR277369 | 新增 Netflix 與 Spotify 專案計費 5 個月，影響計算與計數充扣標準 |
| 5.4 | 2025/04/14 | SR273784 | Project M Fixed Line Phase II 輸出憑證，增加匯率轉換 FOREIGN_REMITTANCE 欄位（暫停步驟3） |
| 5.5 | 2025/04/14 | SR273784 | Project M Fixed Line Phase II 輸出憑證，調整 elem5 (0,21) 匯率轉換 |

---

## 四、真實案例：BI 生成與 Rounding

### 案例：一個帳戶有 3 個產品的 BI 生成

**背景資料**：
- **帳戶**：ACCT_ID=12345
- **CYCLE**：10（從 1 號到 31 號）
- **計費期間**：2025/01/01 ~ 2025/01/31

**CI 資料（來源）**：

| CI_SEQ | SUBSCR_ID | CHARGE_CODE | SOURCE | AMOUNT | TAX_TYPE | TAX_RATE | BILL_SUBSCR_ID |
|--------|-----------|-------------|--------|--------|----------|----------|----------------|
| 1001 | 111 | RC_BASIC | RC | 1000.00 | TX1 | 5 | 111 |
| 1002 | 111 | UC_DATA | UC | 523.50 | TX1 | 5 | 111 |
| 1003 | 222 | RC_ADDON | RC | 300.00 | TX2 | 0 | 111 |
| 1004 | 222 | DSC_E_BILL | DE | -50.00 | TX2 | 0 | 111 |
| 1005 | 333 | OC_INSTALL | OC | 500.00 | TX1 | 5 | 333 |

**GEN_BI 彙總**：

**步驟 1：PN 彙總邏輯**
```sql
-- SUBSCR_ID=111, 222 都歸在 BILL_SUBSCR_ID=111（Parent Number）
-- SUBSCR_ID=333 歸在 BILL_SUBSCR_ID=333（自己）

GROUP BY BILL_SUBSCR_ID, CHARGE_CODE, SOURCE, OFFER_ID, PKG_ID
```

**步驟 2：CHARGE_ORG 決定**
```sql
-- CI_SEQ=1001: RC → CC
-- CI_SEQ=1002: UC AMOUNT>0 → RA
-- CI_SEQ=1003: RC → CC
-- CI_SEQ=1004: DE → DE
-- CI_SEQ=1005: OC → CC
```

**步驟 3：稅金計算**
```sql
-- TX1 (5%): 1000 + 523.50 + 500 = 2023.50 → Tax = 101.18
-- TX2 (0%): 300 - 50 = 250.00 → Tax = 0
```

**步驟 4：DO_ROUND 處理**
```sql
SELECT TAX_TYPE, SUM(AMOUNT) AMOUNT, SUM(TAX_AMT) TAX_AMT
  FROM FY_TB_BL_BILL_CI
 WHERE BILL_SEQ = 999
   AND ACCT_ID = 12345
 GROUP BY TAX_TYPE
 ORDER BY TAX_TYPE DESC;

-- Result:
-- TX1: AMOUNT=2023.50, TAX_AMT=101.18
-- TX2: AMOUNT=250.00, TAX_AMT=0
```

**最終 BI 資料**：

| BI_SEQ | BILL_SUBSCR_ID | CHARGE_CODE | AMOUNT | TAX_TYPE | TAX_AMT | CHARGE_ORG | DYNAMIC_ATTRIBUTE |
|--------|----------------|-------------|--------|----------|---------|------------|-------------------|
| 5001 | 111 | RC_BASIC | 1000.00 | TX1 | 50.00 | CC | Is prorated=false#PN_IND=Y |
| 5002 | 111 | UC_DATA | 523.50 | TX1 | 26.18 | RA | Is prorated=false#PN_IND=Y |
| 5003 | 111 | RC_ADDON | 300.00 | TX2 | 0.00 | CC | Is prorated=false#PN_IND=Y |
| 5004 | 111 | DSC_E_BILL | -50.00 | TX2 | 0.00 | DE | Is prorated=false#PN_IND=Y |
| 5005 | 333 | OC_INSTALL | 500.00 | TX1 | 25.00 | CC | Is prorated=false |

---

## 五、複雜場景處理

### 1. SR261173：Home grown CMP project Phase1

**需求背景**：CMP（Campaign Management Platform）計費邏輯調整

**技術實現**：
```sql
-- 原邏輯：所有 DE（Discount）統一彙總
-- 新邏輯：DE 依據 PRODUCT_TYPE='I' 分開彙總

-- PRODUCT_TYPE='I' 的 DE
WHERE SOURCE = 'DE' 
  AND PKG_ID IN (SELECT PKG_ID FROM FY_TB_BL_ACCT_PKG A, FY_TB_PBK_OFFER B 
                 WHERE A.OFFER_ID = B.OFFER_ID AND B.PRODUCT_TYPE = 'I')
GROUP BY BILL_SUBSCR_ID, CHARGE_CODE, SOURCE, OFFER_ID, PKG_ID, OFFER_INSTANCE_ID, OFFER_SEQ

-- PRODUCT_TYPE<>'I' 的 DE
WHERE SOURCE = 'DE' 
  AND PKG_ID NOT IN (SELECT PKG_ID FROM FY_TB_BL_ACCT_PKG A, FY_TB_PBK_OFFER B 
                     WHERE A.OFFER_ID = B.OFFER_ID AND B.PRODUCT_TYPE = 'I')
GROUP BY BILL_SUBSCR_ID, CHARGE_CODE, SOURCE, OFFER_ID, PKG_ID
```

---

### 2. SR273784：Project M Fixed Line Phase II

**需求背景**：elem5 (0,21) 稅率轉換

**技術實現**：
```sql
-- elem5=0 或 21 時，TX1 與 TX2 互換，稅率也反轉
SELECT DECODE(elem5, 
         0, DECODE(CH_TAX_RATE, 'TX2', 'TX1', 'TX1', 'TX2', CH_TAX_RATE),
         21, DECODE(CH_TAX_RATE, 'TX2', 'TX1', 'TX1', 'TX2', CH_TAX_RATE),
         CH_TAX_RATE) TAX_RATE,
       DECODE(elem5, 
         0, DECODE(NU_RATE_TAX, 0, 5, 5, 0, NU_RATE_TAX),  -- 0→5, 5→0
         21, DECODE(NU_RATE_TAX, 0, 5, 5, 0, NU_RATE_TAX),
         NU_RATE_TAX) RATE_TAX
```

**業務邏輯**：
- elem5=0：國內交易，稅率正常
- elem5=21：跨境交易，稅率反轉（免稅變應稅，應稅變免稅）

---

### 3. SR255529：PN 計費邏輯調整

**需求背景**：Parent Number 計費需要精確到 OFFER_INSTANCE_ID 與 OFFER_SEQ

**技術實現**：
```sql
-- 原邏輯：GROUP BY BILL_SUBSCR_ID, CHARGE_CODE, SOURCE, OFFER_ID, PKG_ID
-- 新邏輯：新增 MAX(OFFER_INSTANCE_ID), MAX(OFFER_SEQ)

SELECT BILL_SUBSCR_ID,
       OFFER_ID,
       MAX(OFFER_INSTANCE_ID) OFFER_INSTANCE_ID,
       MAX(OFFER_SEQ) OFFER_SEQ,
       PKG_ID,
       CHARGE_CODE,
       SUM(AMOUNT) AMOUNT
  FROM FY_TB_BL_BILL_CI
 WHERE BILL_SUBSCR_ID <> SUBSCR_ID  -- PN 條件
 GROUP BY BILL_SUBSCR_ID, CHARGE_CODE, SOURCE, OFFER_ID, PKG_ID
```

---

## 六、技術亮點與設計模式

### 1. 彙總策略（Aggregation Strategy）

**設計原則**：
- **PN 彙總**：以 BILL_SUBSCR_ID 為主鍵
- **CMP 分離**：PRODUCT_TYPE='I' 的 DE 獨立彙總
- **UNION 拼接**：3 個 UNION 拼接不同彙總規則

---

### 2. 稅率動態查詢

**查詢優先級**：
1. FY_TB_PBK_CHARGE_CODE.TAX_RATE（CHARGE_CODE 預設稅率）
2. FY_TB_LOV_COMMON.RATE_TAX（稅率對照表）
3. elem5 特殊邏輯（Project M Phase II）
4. AWS HGB 預設值（TX2, 0%）

---

### 3. DYNAMIC_ATTRIBUTE 追蹤

**標記格式**：
```
Is prorated=false#PN_IND=Y
```

**用途**：
- `Is prorated=false`：不按日計費（Monthly）
- `PN_IND=Y`：Parent Number 標記
- 可擴充：`#DEVICE_COUNT=5`（SDWAN_NPEP）

---

## 七、與其他 Package 的關聯

### 輸入來源：
- **FY_PG_BL_BILL_CI**：CI 生成（費用計算）
- **FY_TB_BL_BILL_ACCT**：帳戶資訊
- **FY_TB_BL_ACCT_PKG**：訂閱 Package 資訊
- **FY_TB_PBK_CHARGE_CODE**：費用代碼與稅率
- **FY_TB_LOV_COMMON**：稅率對照表

### 輸出目標：
- **FY_TB_BL_BILL_BI**：帳單項目表
- **FY_PG_BL_BILL_MAST**：帳單主檔彙總

---

## 八、開發與維護建議

### 1. 測試重點

**關鍵測試案例**：
- **PN 彙總**：BILL_SUBSCR_ID ≠ SUBSCR_ID
- **稅率轉換**：elem5=0,21 的反轉邏輯
- **CMP 分離**：PRODUCT_TYPE='I' 的 DE 彙總
- **CORRECT_SEQ**：OC 序號累加
- **0 金額**：避免重複匯率計算

---

### 2. 效能優化

**索引需求**：
- FY_TB_BL_BILL_CI：`(BILL_SEQ, CYCLE, CYCLE_MONTH, ACCT_KEY, ACCT_ID)`
- FY_TB_BL_BILL_CI：`(BILL_SUBSCR_ID, SUBSCR_ID)`

**SQL 優化**：
- 避免 3 次 UNION：可考慮 CASE WHEN 合併
- ACCT_KEY 分區：`TO_NUMBER(SUBSTR(LPAD(gnACCT_ID,18,0),-2))`

---

### 3. 常見問題排查

**Q1：BI 金額與 CI 彙總不一致？**
- 檢查 PN 彙總邏輯（BILL_SUBSCR_ID）
- 檢查 CMP 分離邏輯（PRODUCT_TYPE）

**Q2：稅金計算錯誤？**
- 檢查 elem5 稅率反轉邏輯
- 檢查 AWS HGB 預設稅率

**Q3：DYNAMIC_ATTRIBUTE 遺失？**
- 檢查 CI → BI 繼承邏輯
- 檢查 PN 標記是否正確

---

## 九、總結

FY_PG_BL_BILL_BI 是 UBL 系統中的關鍵彙總層，負責將細粒度的 CI（Charge Item）轉換為客戶可見的 BI（Bill Item）。其複雜度在於：

1. **彙總策略多樣**：PN 彙總、CMP 分離、PRODUCT_TYPE 區分
2. **稅率動態計算**：3 種 TAX_TYPE、elem5 反轉邏輯、AWS 特殊處理
3. **版本演進豐富**：5.5 個大版本，涵蓋 10+ 個 SR
4. **業務邏輯緊密**：與 CI、MAST、CONFIRM 緊密耦合

理解 BI Package 是掌握 UBL 帳單生成核心的關鍵。
