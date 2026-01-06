# UBL-AP 深度解析：Shell Scripts 自動化系統

## 一、系統概覽

**專案名稱**：ubl-ap  
**技術架構**：Korn Shell (ksh) + Oracle 19c + AutoWatch + Mail/SMS 整合  
**核心功能**：月結處理、資料確認/還原/截止/提取、報表生成  
**代碼規模**：21+ Shell 腳本，分佈在 Confirm/Undo/CutDate/Extract/RPT 目錄  
**關鍵特性**：環境檢測、錯誤通知、AutoWatch 監控、多環境支援（PT/SIT/UAT/PROD）

---

## 二、架構設計

### 1. 目錄結構

```
ubl-ap/UBL/BL/
├── Confirm/bin/               # 資料確認
│   └── HGB_UBL_Confirm.sh    (300+ 行)
├── Undo/bin/                  # 資料還原
│   └── HGB_UBL_Undo.sh
├── CutDate/bin/               # 截止日期處理
│   └── HGB_UBL_CutDate.sh
├── Extract/bin/               # 資料提取
│   └── HGB_UBL_Extract.sh
├── Surrounding/
│   ├── RPT/                   # 報表生成
│   │   ├── SR223576_Cloud_Service_Report.sh (269 行)
│   │   ├── SR239730_AWS_Report.sh
│   │   ├── SR276169_HGBN_BA_Close_Report.sh
│   │   ├── SR213344_NPEP_Settlement_Report.sh
│   │   ├── SR259699_FSS_RPT_Non-monthlyPayment_Report.sh
│   │   ├── SR260229_HGBN_Bill_Monthly_Check_Report.sh
│   │   ├── SR265840_Azure_Product_Report.sh
│   │   ├── SR250171_HGB_UBL_ESDP_UNBILL_Report.sh
│   │   ├── SR264001_HGBN_o365_Report.sh
│   │   ├── SR260229_HGBN_ACT-014_Report.sh
│   │   ├── SR266082_HGBN_UBL_ICT_Report.sh
│   │   ├── SR241657_BDE_Remaining_Report.sh
│   │   ├── SR225879_HGB_MPBL_Unbill_OC_Report.sh
│   │   └── SR226434_BDE_Remaining_Report.sh
│   ├── BMEX_RETN/             # BMEX 回傳檔案處理
│   │   └── HGB_BMEX_RETN_file_loader.sh
│   └── Insert_Multiple_Account/bin/
│       └── HGB_Insert_Multiple_Account.sh
└── MailList.txt               # 郵件清單
└── smsList.txt                # 簡訊清單
```

---

### 2. 系統架構圖

```
┌─────────────────────────────────────────────────────┐
│                   Scheduler (cron)                   │
│         月結/確認/還原/提取/報表 定時執行              │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┴──────────────┐
        │                           │
        ↓                           ↓
┌─────────────────┐      ┌─────────────────┐
│  Core Scripts   │      │  Report Scripts │
│  (Confirm/      │      │  (SR系列)       │
│   Undo/         │      │                 │
│   CutDate/      │      │                 │
│   Extract)      │      │                 │
└────────┬────────┘      └────────┬────────┘
         │                        │
         ↓                        ↓
┌─────────────────────────────────────────┐
│            Oracle Database              │
│  (FY_PG_BL_BILL_* Packages)            │
└────────┬────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────┐
│          Notification System             │
│  - AutoWatch (Job Monitor)              │
│  - Mail (mailx)                         │
│  - SMS (SendSms.sh)                     │
└─────────────────────────────────────────┘
```

---

## 三、核心腳本深度解析

### Script 1: HGB_UBL_Confirm.sh（資料確認）

#### 功能說明

**用途**：確認帳單資料，更新狀態為 'CN'（Confirmed）  
**執行時機**：月結流程的最後階段  
**輸入參數**：
- `$1`: BillDate（帳期，如 20190701）
- `$2`: ProcessNo（批次號，001~010, 888, 999）
- `$3`: Cycle（週期，如 50）

---

#### 環境檢測

**Hostname → DB/OCS 映射**：

```bash
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t")       # TEST06 (PT)
    DB="HGBDEV2"
    OCS_AP="fetwrk26"
    ;;
"hgbdev01t")         # TEST06 (PT)
    DB="HGBDEV3"
    OCS_AP="fetwrk26"
    ;;
"pc-hgbap11t")       # TEST15 (SIT)
    DB="HGBBLSIT"
    OCS_AP="fetwrk15"
    ;;
"pc-hgbap21t")       # TEST02 (UAT)
    DB="HGBBLUAT"
    OCS_AP="fetwrk21"
    ;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p")  # PROD
    DB="HGBBL"
    OCS_AP="prdbl2"
    ;;
*)
    echo "Unknown AP Server"
    exit 0
    ;;
esac
```

**密碼解密**：

```bash
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`
```

**關鍵設計**：
- **環境自動檢測**：根據 hostname 自動選擇資料庫
- **安全性**：使用 CRYPT 工具解密密碼（非明文）
- **多環境支援**：PT/SIT/UAT/PROD 四套環境

---

#### 執行流程

**Step 0: Confirm Step Check**

```bash
function HGB_UBL_Confirm_STEP_Check
{
    `sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STEP.data <<EOF
    @HGB_UBL_Confirm_STEP_Check.sql $1 $2 $3
EOF`
    cat ${LogDir}/${progName}_STEP.data | read STEP
    echo "Step or Message: ${STEP}" | tee -a ${LogFile}
}

HGB_UBL_Confirm_STEP_Check $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_STEP.data | grep -E 'ORA|ora|RETURN_CODE = 9999' | wc -l`
if [[ $checkcode -ge 1 ]]; then
    echo "Step 0. Run Confirm Step Check Process (End...Failed)" | tee -a $LogFile
    AutoWatch 1
fi
```

**SQL 推測（HGB_UBL_Confirm_STEP_Check.sql）**：

```sql
SET SERVEROUTPUT ON
SET FEEDBACK OFF
SET HEADING OFF

DECLARE
    v_step VARCHAR2(10);
    v_return_code VARCHAR2(10) := '0000';
BEGIN
    -- 檢查是否可以執行 Confirm
    SELECT NVL(MAX(PREP_STATUS), 'XX')
      INTO v_step
      FROM FY_TB_BL_BILL_PROC
     WHERE BILL_DATE = '&1'
       AND CYCLE = &3
       AND PROCESS_NO = '&2';
    
    -- 判斷狀態
    IF v_step = 'CN' THEN
        DBMS_OUTPUT.PUT_LINE('CN');  -- 可以執行
    ELSIF v_step = 'XX' THEN
        DBMS_OUTPUT.PUT_LINE('Confirm_STEP_Check Process RETURN_CODE = 9999');
        v_return_code := '9999';
    ELSE
        DBMS_OUTPUT.PUT_LINE('Current Step: ' || v_step);
    END IF;
END;
/
EXIT;
```

---

**Step 1: Confirm STATUS Check (BEFORE)**

```bash
function HGB_UBL_Confirm_STATUS_Check
{
    `sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STATUS.data <<EOF
    @HGB_UBL_Confirm_STATUS_Check.sql $1 $2 $3 $4
EOF`
    cat ${LogDir}/${progName}_STATUS.data | tee -a ${LogFile}
}

HGB_UBL_Confirm_STATUS_Check $BillDate $Cycle $ProcessNo BEFORE
```

**SQL 推測（HGB_UBL_Confirm_STATUS_Check.sql）**：

```sql
-- 檢查 Confirm 前的資料狀態
SELECT 'CI Count: ' || COUNT(*) AS STATUS_INFO
  FROM FY_TB_BL_BILL_CI
 WHERE BILL_DATE = '&1'
   AND CYCLE = &3
   AND PROCESS_NO = '&2'
   AND PREP_STATUS != 'CN';

SELECT 'BI Count: ' || COUNT(*) AS STATUS_INFO
  FROM FY_TB_BL_BILL_BI
 WHERE BILL_DATE = '&1'
   AND CYCLE = &3
   AND PROCESS_NO = '&2'
   AND PREP_STATUS != 'CN';
```

---

**Step 2: Run Confirm**

```bash
function HGB_UBL_Confirm
{
    `sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
    @HGB_UBL_Confirm.sql $1 $2 $3
    exit
EOF`
}

if [[ ${STEP} == 'CN' ]]; then
    echo "Step 2. Run Confirm Process (Start...)" | tee -a $LogFile
    HGB_UBL_Confirm $BillDate $Cycle $ProcessNo
    checkcode=`cat ${LogFile} | grep -E 'ORA|ora|RETURN_CODE = 9999' | wc -l`
    if [[ $checkcode -ge 1 ]]; then
        echo "Step 2. Run Confirm Process (End...Failed)" | tee -a $LogFile
        AutoWatch 1
    fi
fi
```

**SQL 推測（HGB_UBL_Confirm.sql）**：

```sql
SET SERVEROUTPUT ON
BEGIN
    -- 呼叫 PL/SQL Package
    FY_PG_BL_BILL_CONFIRM.DO_CONFIRM(
        P_BILL_DATE  => '&1',
        P_CYCLE      => &3,
        P_PROCESS_NO => '&2'
    );
    
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Confirm Process RETURN_CODE = 0000');
EXCEPTION
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Confirm Process RETURN_CODE = 9999');
        DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
        ROLLBACK;
END;
/
EXIT;
```

---

**Step 3: Run Confirm_USED_UP（處理用盡資料）**

```bash
function HGB_UBL_Confirm_USED_UP
{
    `sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
    @HGB_UBL_Confirm_USED_UP.sql $1 $2 $3
    exit
EOF`
}

echo "Step 3. Run Confirm_USED_UP Process (Start...)" | tee -a $LogFile
HGB_UBL_Confirm_USED_UP $BillDate $ProcessNo $Cycle
checkcode=`cat ${LogFile} | grep -E 'ORA|ora|RETURN_CODE = 9999' | wc -l`
if [[ $checkcode -eq 1 ]]; then
    echo "Step 3. Run Confirm_USED_UP Process (End...Failed)" | tee -a $LogFile
    AutoWatch 1
fi
```

**用途**：處理已用盡的優惠/折扣（USED UP 狀態）

---

**Step 4: Confirm STATUS Check (AFTER)**

```bash
echo "Step 4. Run Confirm STATUS Check Process (Start...)" | tee -a $LogFile
HGB_UBL_Confirm_STATUS_Check $BillDate $Cycle $ProcessNo AFTER
```

**確認 Confirm 後的狀態是否正確**

---

#### 通知機制

**AutoWatch 整合**：

```bash
function AutoWatch
{
    checksum=$1
    AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
    touch $AutoWatchFile
    
    if [[ $checksum -eq 1 ]]; then
        echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
        sendMail 0
        if [[ $DB = "HGBBL" ]]; then
            sendSMS 0
        fi
    elif [[ $checksum -eq 0 ]]; then
        echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
        sendMail 1
        if [[ $DB = "HGBBL" ]]; then
            sendSMS 1
        fi
    fi
    
    exit 0
}
```

**AutoWatch 檔案格式**：

```
HGB_UBL_Confirm,Normal,2025/01/06-10:30:00
```

---

**Email 通知**：

```bash
function sendMail
{
    type=$1
    cd ${LogDir}
    # 轉換為 Big5 編碼（支援中文）
    iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
    mv ${LogFile}.big5 ${LogFile}
    maillist=`cat $MailList`
    
    if [[ $type -eq 1 ]]; then
        # 成功通知
        mailx -r "HGB_UBL" \
              -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Normal" \
              -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
    else
        # 失敗通知
        mailx -r "HGB_UBL" \
              -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Abnormal" \
              -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
    fi
}
```

**關鍵設計**：
- **Big5 編碼**：支援中文郵件內容
- **附加 Log**：完整執行記錄
- **區分成功/失敗**：不同主旨（Normal/Abnormal）

---

**SMS 通知**（僅 PROD 環境）：

```bash
function sendSMS
{
    type=$1
    errorMessage=" Abnormal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
    okMessage=" Normal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
    smslist=`cat $smsList`
    
    if [[ $type -eq 1 ]]; then
        ${smsProg} "${okMessage}" "${smsList}"
    else
        ${smsProg} "${errorMessage}" "${smsList}"
    fi
}
```

**SMS 工具**：`/cb/BCM/util/SendSms.sh`

---

#### 執行範例

**Production 月結確認**：

```bash
# 執行 Cycle=50, BillDate=20190701, ProcessNo=001
$ ./HGB_UBL_Confirm.sh 20190701 001 50

# Log 輸出範例
2025/01/06-10:00:00 --------------BEGIN HGB_UBL_Confirm--------------
HGB_DB_ENV : HGBBL
OCS_AP_ENV : prdbl2
BILL_DATE : 20190701
CYCLE : 50
PROCESS_NO : 001

----->>>>>-----Step 0. Run Confirm Step Check Process (Start...)
Step or Message: CN
-----<<<<<-----Step 0. Run Confirm Step Check Process (End... Successed)
.....
----->>>>>-----Step 1. Run Confirm STATUS Check Process (Start...)
CI Count: 500
BI Count: 200
-----<<<<<-----Step 1. Run Confirm STATUS Check Process (End... Successed)
.....
----->>>>>-----Step 2. Run Confirm Process (Start...)
Confirm Process RETURN_CODE = 0000
-----<<<<<-----Step 2. Run Confirm Process (End... Successed)
.....
----->>>>>-----Step 3. Run Confirm_USED_UP Process (Start...)
Confirm_USED_UP Process RETURN_CODE = 0000
-----<<<<<-----Step 3. Run Confirm_USED_UP Process (End...Successed)
.....
----->>>>>-----Step 4. Run Confirm STATUS Check Process (Start...)
CI Count: 0
BI Count: 0
-----<<<<<-----Step 4. Run Confirm STATUS Check Process (End... Successed)

Send AutoWatch (Successed)
Send Mail (Successed)
Send SMS (Successed)
2025/01/06-10:05:30 --------------END HGB_UBL_Confirm--------------
```

---

### Script 2: SR223576_Cloud_Service_Report.sh（雲服務報表）

#### 功能說明

**用途**：生成 Cloud Service 監控報表（AWS/Azure/O365）  
**執行時機**：每小時自動執行（cron）  
**報表內容**：過去 1 小時內的雲服務帳單異常資料

---

#### 環境變數

```bash
home="/extsoft/UBL/BL/Surrounding/RPT"
progName=$(basename $0 .sh)
pid=$$

# 資料庫連線
DB_SID="HGBBL"                                  # PROD
#DB_SID="HGBBLUAT"                              # UAT
#DB_SID="HGBBLSIT"                              # SIT
DB_USER=$(/cb/CRYPT/GetId.sh ${DB_SID})
DB_PASSWD=$(/cb/CRYPT/GetPw.sh ${DB_SID})

# 時間範圍
startDate="`date -d "1 hour ago" +"%Y-%m-%d %H:"`00:00"
reportEndTime=`date +"%Y-%m-%d %H:%M:%S"`
```

---

#### SQL 配置檔

**conf/SR223576_Cloud_Service_Report_SQL.conf**：

```bash
monitorlist="AWS,Azure,O365"

# AWS 監控 SQL
sqlsyntaxCntAWS="SELECT COUNT(*) FROM FY_TB_BL_BILL_CI 
                 WHERE BILL_DATE >= TO_DATE('${startDate}', 'YYYY-MM-DD HH24:MI:SS')
                   AND SERVICE_TYPE = 'AWS' 
                   AND STATUS = 'ERROR'"

sqlsyntaxAWS="SELECT ACCOUNT_NO, SERVICE_NAME, ERROR_MSG 
              FROM FY_TB_BL_BILL_CI 
              WHERE BILL_DATE >= TO_DATE('${startDate}', 'YYYY-MM-DD HH24:MI:SS')
                AND SERVICE_TYPE = 'AWS' 
                AND STATUS = 'ERROR'"

sqlsyntaxTbAWS="AWS 服務異常清單"

# Azure 監控 SQL
sqlsyntaxCntAzure="SELECT COUNT(*) FROM FY_TB_BL_BILL_CI 
                   WHERE BILL_DATE >= TO_DATE('${startDate}', 'YYYY-MM-DD HH24:MI:SS')
                     AND SERVICE_TYPE = 'Azure' 
                     AND STATUS = 'ERROR'"

sqlsyntaxAzure="SELECT ACCOUNT_NO, SERVICE_NAME, ERROR_MSG 
                FROM FY_TB_BL_BILL_CI 
                WHERE BILL_DATE >= TO_DATE('${startDate}', 'YYYY-MM-DD HH24:MI:SS')
                  AND SERVICE_TYPE = 'Azure' 
                  AND STATUS = 'ERROR'"

sqlsyntaxTbAzure="Azure 服務異常清單"

# O365 監控 SQL
sqlsyntaxCntO365="SELECT COUNT(*) FROM FY_TB_BL_BILL_CI 
                  WHERE BILL_DATE >= TO_DATE('${startDate}', 'YYYY-MM-DD HH24:MI:SS')
                    AND SERVICE_TYPE = 'O365' 
                    AND STATUS = 'ERROR'"

sqlsyntaxO365="SELECT ACCOUNT_NO, SERVICE_NAME, ERROR_MSG 
               FROM FY_TB_BL_BILL_CI 
               WHERE BILL_DATE >= TO_DATE('${startDate}', 'YYYY-MM-DD HH24:MI:SS')
                 AND SERVICE_TYPE = 'O365' 
                 AND STATUS = 'ERROR'"

sqlsyntaxTbO365="O365 服務異常清單"
```

---

#### 報表生成

**executeSqlCnt（查詢資料量）**：

```bash
function executeSqlCnt
{
    g1sqlsyntax=$1
    `sqlplus -s ${DB_USER}/${DB_PASSWD}@${DB_SID} > ${sqlDataFile} <<EOF
set heading off;
set pagesize 0;
set feedback off;
${g1sqlsyntax};
exit;
EOF`
    read count < ${sqlDataFile}
}
```

**generateReport（生成 HTML 報表）**：

```bash
function generateReport
{
    g2tablename=$1
    g2sqlsyntax=$2
    
    NLS_LANG="TRADITIONAL CHINESE_TAIWAN.AL32UTF8"
    export NLS_LANG
    
    `sqlplus -s ${DB_USER}/${DB_PASSWD}@${DB_SID} >> ${sqlLogFile} <<EOF
set tab off
SET PAGESIZE 32766
SET LINESIZE 32766
SET FEEDBACK OFF
set linesize 1024
SET TRIMSPOOL ON

spool ${htmlFile}

set markup html on spool on TABLE "class=tb-wd-1" entmap off
${g2sqlsyntax}
/

SET MARKUP HTML OFF
spool off
exit;
EOF`
}
```

**關鍵技術**：
- **SET MARKUP HTML ON**：自動生成 HTML 表格
- **NLS_LANG**：支援中文輸出
- **TABLE class**：CSS 樣式

---

#### 郵件範本

**template/template_SR223576_Cloud_Service_Report.html**：

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Cloud Service Report</title>
    <style>
        .tb-wd-1 { width: 90%; border-collapse: collapse; }
        .tb-wd-1 th { background-color: #4CAF50; color: white; padding: 8px; }
        .tb-wd-1 td { border: 1px solid #ddd; padding: 8px; }
        .tb-wd-1 tr:nth-child(even) { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h2>Cloud Service 監控報表</h2>
    <p>報表時間：%reportTime%</p>
    <p>監控區間：%reportStartTime% ~ %reportEndTime% (耗時：%reportDiffTime%)</p>
    <p>主機名稱：%hostname%</p>
    
    <h3>監控結果</h3>
    %tablecontent%
    
    <hr>
    <p style="font-size: 12px; color: #888;">
        此郵件由系統自動產生，請勿回覆。<br>
        如有問題請聯繫：IT Support Team
    </p>
</body>
</html>
```

---

#### 郵件發送

**sendMail 函數**：

```bash
function sendMail
{
    # 載入郵件清單
    source "${home}/conf/SR223576_Cloud_Service_Report_mail.conf"
    
    # 複製範本
    cp -p ${tmpl} ${tmplTmp}
    
    # 替換變數
    sed -i 's|%sender%|'"${sender}"'|g' ${tmplTmp}
    sed -i 's|%recipient%|'"${recipientHJ}"'|g' ${tmplTmp}
    sed -i 's|%sysdt%|'"${sysdt}"'|g' ${tmplTmp}
    sed -i 's|%reportTime%|'"${sysdt}"'|g' ${tmplTmp}
    sed -i 's|%reportStartTime%|'"${reportStartTime}"'|g' ${tmplTmp}
    sed -i 's|%reportEndTime%|'"${reportEndTime}"'|g' ${tmplTmp}
    sed -i 's|%reportDiffTime%|'"${reportDiffTime}"'|g' ${tmplTmp}
    sed -i 's|%hostname%|'"${hostname}"'|g' ${tmplTmp}
    
    # 插入報表內容
    sed -i '/%tablecontent%/r '"${sqlLogFile}"'' ${tmplTmp}
    sed -i '/%tablecontent%/d' ${tmplTmp}
    
    # 清理空表格
    sed -i ':a;N;$!ba;s/<table class=tb-wd-1>\n<\/table>//g' ${tmplTmp}
    
    # 發送郵件
    cat ${tmplTmp} | ${sendmail} -t
}
```

**郵件清單配置（conf/SR223576_Cloud_Service_Report_mail.conf）**：

```bash
sender="HGB_UBL_Report@fareastone.com.tw"
recipientHJ="it-team@fareastone.com.tw"
subsidiaryHJ="manager@fareastone.com.tw"
```

---

#### 主執行流程

```bash
# 載入配置
source "${home}/conf/SR223576_Cloud_Service_Report_SQL.conf"
source "${home}/conf/SR223576_Cloud_Service_Report_mail.conf"

# 遍歷監控項目
isGenRpt="N"
IFS=',' read -ra monitorArr <<< "${monitorlist}"
for i in "${monitorArr[@]}"; do
    echo "${i}"
    var1="sqlsyntaxCnt${i}"
    sqlsyntaxCnt="${!var1}"
    var2="sqlsyntax${i}"
    sqlsyntax="${!var2}"
    var3="sqlsyntaxTb${i}"
    sqlsyntaxTb="${!var3}"
    
    # 查詢資料量
    unset count
    executeSqlCnt "${sqlsyntaxCnt}"
    echo "count:${count}"
    
    # 若有資料，生成報表
    if [[ "${count}" -ne "0" ]]; then
        isGenRpt="Y"
        generateReport "${sqlsyntaxTb}" "${sqlsyntax}"
    fi
done

# 若有報表，發送郵件
if [[ "${isMail:=Y}" == "Y" && "${isGenRpt}" == "Y" ]]; then
    echo "Send Mail..."
    sendMail
    echo "Send Mail completed at $(date +"%Y-%m-%d %H:%M:%S")."
else 
    echo "Do not need to send mail at $(date +"%Y-%m-%d %H:%M:%S")"
fi
```

**關鍵邏輯**：
- **動態配置**：透過間接變數引用（`${!var1}`）
- **條件發送**：只有異常時才發送郵件（count > 0）
- **多項目合併**：一封郵件包含 AWS/Azure/O365 所有異常

---

## 四、其他核心腳本

### 1. HGB_UBL_Undo.sh（資料還原）

**用途**：還原已確認的帳單資料（PREP_STATUS: 'CN' → 'XX'）  
**執行時機**：發現帳單錯誤時手動執行  
**參數**：BillDate, ProcessNo, Cycle

**主要功能**：
```bash
# 呼叫 PL/SQL Package
FY_PG_BL_BILL_UNDO.DO_UNDO(
    P_BILL_DATE  => '20190701',
    P_CYCLE      => 50,
    P_PROCESS_NO => '001'
);
```

**業務場景**：
- 帳單確認後發現錯誤
- 需要重新計算
- 還原至 Extract 前狀態

---

### 2. HGB_UBL_CutDate.sh（截止日期處理）

**用途**：處理帳單截止日期，計算 CUTDATE  
**執行時機**：月初第一天  
**參數**：BillDate, Cycle

**主要功能**：
```bash
# 呼叫 PL/SQL Package
FY_PG_BL_BILL_CUTDATE.DO_CUTDATE(
    P_BILL_DATE => '20190801',
    P_CYCLE     => 50
);
```

**業務場景**：
- 計算帳期截止日
- 依 CYCLE 決定不同截止日
- 影響計費區間

---

### 3. HGB_UBL_Extract.sh（資料提取）

**用途**：將帳單資料提取至前端系統（DIO）  
**執行時機**：Confirm 完成後  
**參數**：BillDate, ProcessNo, Cycle

**主要功能**：
```bash
# 呼叫 PL/SQL Package
FY_PG_BL_BILL_MAST.DO_EXTRACT(
    P_BILL_DATE  => '20190701',
    P_CYCLE      => 50,
    P_PROCESS_NO => '001'
);

# 可能包含 FTP/SFTP 傳輸
ftp -nv ${DIO_SERVER} <<EOF
user ${DIO_USER} ${DIO_PWD}
cd /data/UBL/incoming
put ${EXTRACT_FILE}
bye
EOF
```

**業務場景**：
- 帳單資料傳送到 DIO
- 支援客服查詢
- 提供前端帳單顯示

---

## 五、報表腳本清單

### 報表類型

| 腳本名稱 | 用途 | 頻率 |
|---------|------|------|
| SR223576_Cloud_Service_Report.sh | 雲服務異常監控（AWS/Azure/O365） | 每小時 |
| SR239730_AWS_Report.sh | AWS 詳細帳單報表 | 每日 |
| SR276169_HGBN_BA_Close_Report.sh | 月結關帳報表 | 每月 |
| SR213344_NPEP_Settlement_Report.sh | NPEP 結算報表 | 每月 |
| SR259699_FSS_RPT_Non-monthlyPayment_Report.sh | 非月繳帳單報表 | 每月 |
| SR260229_HGBN_Bill_Monthly_Check_Report.sh | 月帳單核對報表 | 每月 |
| SR265840_Azure_Product_Report.sh | Azure 產品報表 | 每日 |
| SR250171_HGB_UBL_ESDP_UNBILL_Report.sh | ESDP 未開帳報表 | 每日 |
| SR264001_HGBN_o365_Report.sh | O365 帳單報表 | 每日 |
| SR260229_HGBN_ACT-014_Report.sh | ACT-014 報表 | 每月 |
| SR266082_HGBN_UBL_ICT_Report.sh | ICT 服務報表 | 每月 |
| SR241657_BDE_Remaining_Report.sh | BDE 剩餘額度報表 | 每月 |
| SR225879_HGB_MPBL_Unbill_OC_Report.sh | MPBL 未開帳 OC 報表 | 每日 |
| SR226434_BDE_Remaining_Report.sh | BDE 剩餘額度報表 v2 | 每月 |

---

## 六、技術特性

### 1. 環境自動檢測

**優勢**：
- 同一套代碼支援 PT/SIT/UAT/PROD 四套環境
- 根據 hostname 自動選擇資料庫
- 避免誤操作（生產環境用測試資料庫）

---

### 2. 安全性設計

**密碼管理**：
```bash
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
```

**優勢**：
- 密碼不明文存在代碼中
- 統一密碼管理工具
- 支援密碼輪轉

---

### 3. 錯誤通知機制

**三重通知**：
1. **AutoWatch**：Job Monitor 系統
2. **Email**：附加完整 Log
3. **SMS**：生產環境即時簡訊

**通知時機**：
- SQL 錯誤（grep 'ORA'）
- 業務邏輯錯誤（RETURN_CODE = 9999）
- 腳本異常退出

---

### 4. 編碼轉換

**支援中文郵件**：
```bash
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
```

**原因**：
- Oracle 資料庫輸出 UTF-8
- 郵件系統需要 Big5
- 確保中文正確顯示

---

### 5. HTML 報表生成

**SQL*Plus MARKUP**：
```sql
set markup html on spool on TABLE "class=tb-wd-1" entmap off
```

**優勢**：
- 自動生成 HTML 表格
- 支援 CSS 樣式
- 郵件直接顯示（不需附件）

---

## 七、真實案例

### 案例：月結流程執行

**背景**：2019 年 7 月 1 日，Cycle=50，10 個批次（ProcessNo 001~010）

---

#### Day 1: 截止日計算

```bash
$ ./HGB_UBL_CutDate.sh 20190701 50

# 計算結果（假設）
CUTDATE for CYCLE=50: 2019-06-25
```

---

#### Day 2~5: 帳單計算（由 ubl-db 的 DO_RECUR 等 Package 處理）

---

#### Day 6: 資料確認（10 個批次並行）

```bash
# Terminal 1
$ ./HGB_UBL_Confirm.sh 20190701 001 50

# Terminal 2
$ ./HGB_UBL_Confirm.sh 20190701 002 50

# ...

# Terminal 10
$ ./HGB_UBL_Confirm.sh 20190701 010 50
```

**執行時間**：每批次約 5 分鐘，並行執行總計 5 分鐘

---

#### Day 6: 發現錯誤需要還原（假設 ProcessNo=005 有誤）

```bash
$ ./HGB_UBL_Undo.sh 20190701 005 50

# 還原成功，重新計算
$ sqlplus ${DBID}/${DBPWD}@${DB}
SQL> EXEC FY_PG_BL_BILL_CI.DO_RECUR('20190701', 50, '005');
SQL> COMMIT;

# 再次確認
$ ./HGB_UBL_Confirm.sh 20190701 005 50
```

---

#### Day 7: 資料提取

```bash
# 10 個批次依序提取
$ ./HGB_UBL_Extract.sh 20190701 001 50
$ ./HGB_UBL_Extract.sh 20190701 002 50
# ...
$ ./HGB_UBL_Extract.sh 20190701 010 50
```

**執行時間**：每批次約 10 分鐘，總計 100 分鐘

---

#### 每小時：報表監控

```bash
# cron 設定
0 * * * * /extsoft/UBL/BL/Surrounding/RPT/SR223576_Cloud_Service_Report.sh

# 若發現異常，自動發送郵件
# 主旨：Cloud Service 異常報表
# 內容：AWS 3筆異常、Azure 1筆異常
```

---

## 八、Cron 排程範例

**crontab 設定（推測）**：

```cron
# UBL 月結流程
# 每月 1 日凌晨 2:00 執行截止日計算
0 2 1 * * /extsoft/UBL/BL/CutDate/bin/HGB_UBL_CutDate.sh $(date +\%Y\%m01) 50

# 每月 6 日凌晨 3:00 執行確認（自動批次）
0 3 6 * * /extsoft/UBL/BL/Confirm/bin/batch_confirm.sh

# 每月 7 日凌晨 4:00 執行提取（自動批次）
0 4 7 * * /extsoft/UBL/BL/Extract/bin/batch_extract.sh

# 報表監控（每小時）
0 * * * * /extsoft/UBL/BL/Surrounding/RPT/SR223576_Cloud_Service_Report.sh

# 每日報表（凌晨 1:00）
0 1 * * * /extsoft/UBL/BL/Surrounding/RPT/SR239730_AWS_Report.sh
0 1 * * * /extsoft/UBL/BL/Surrounding/RPT/SR265840_Azure_Product_Report.sh
0 1 * * * /extsoft/UBL/BL/Surrounding/RPT/SR264001_HGBN_o365_Report.sh

# 每月報表（每月 8 日凌晨 2:00）
0 2 8 * * /extsoft/UBL/BL/Surrounding/RPT/SR276169_HGBN_BA_Close_Report.sh
0 2 8 * * /extsoft/UBL/BL/Surrounding/RPT/SR213344_NPEP_Settlement_Report.sh
```

---

## 九、故障處理

### 1. SQL 錯誤

**偵測機制**：
```bash
checkcode=`cat ${LogFile} | grep -E 'ORA|ora|RETURN_CODE = 9999' | wc -l`
if [[ $checkcode -ge 1 ]]; then
    AutoWatch 1
fi
```

**常見錯誤**：
- **ORA-00001**：主鍵衝突（重複執行）
- **ORA-01476**：除數為零
- **ORA-20001**：業務邏輯錯誤（自定義異常）

**處理方式**：
1. 檢查 Log 檔案（附在郵件中）
2. 查看 AutoWatch 記錄
3. 必要時執行 Undo 還原

---

### 2. 郵件發送失敗

**可能原因**：
- MailList.txt 格式錯誤
- sendmail 服務未啟動
- 郵件伺服器連線問題

**檢查方式**：
```bash
$ cat /extsoft/UBL/BL/MailList.txt
user1@example.com user2@example.com

$ systemctl status sendmail
```

---

### 3. AutoWatch 檔案未產生

**可能原因**：
- AutoWatchDir 目錄不存在
- 權限不足

**檢查方式**：
```bash
$ ls -ld /extsoft/UBL/BL/Confirm/log/joblog
drwxr-xr-x 2 oracle dba 4096 Jan 6 10:00 joblog

$ touch /extsoft/UBL/BL/Confirm/log/joblog/test.log
```

---

## 十、與其他模組的協作

### 資料流向

```
┌──────────────────┐
│ ubl-ws           │ (REST API: createCharge)
│ (Spring Boot)    │
└────────┬─────────┘
         │ INSERT
         ↓
┌──────────────────┐
│ FY_TB_BL_BILL_CI │ (CI 資料表)
└────────┬─────────┘
         │ SELECT
         ↓
┌──────────────────┐
│ ubl-db           │ (PL/SQL Packages)
│ - DO_RECUR       │
│ - DO_DISCOUNT    │
│ - GEN_BI         │
└────────┬─────────┘
         │ UPDATE PREP_STATUS
         ↓
┌──────────────────┐
│ ubl-ap           │ ← HGB_UBL_Confirm.sh
│ (Shell Scripts)  │
└────────┬─────────┘
         │ EXTRACT
         ↓
┌──────────────────┐
│ ubl-batch        │ (Spring Batch: SendSysCtrl)
│ (Spring Batch)   │
└────────┬─────────┘
         │ JMS
         ↓
┌──────────────────┐
│ DIO (前端系統)    │
└──────────────────┘
```

---

## 十一、最佳實踐

### 1. 腳本模組化

**設計原則**：
- 每個腳本單一職責（Confirm/Undo/Extract 分離）
- 共用函數獨立管理（AutoWatch/sendMail）
- 配置檔與代碼分離（SQL.conf, mail.conf）

---

### 2. Log 完整記錄

**記錄內容**：
- 開始/結束時間
- 輸入參數
- 每個步驟的執行結果
- SQL 輸出
- 錯誤訊息

**優勢**：
- 附加在郵件中，方便排查
- 支援 AutoWatch 監控
- 保留歷史記錄（Log 檔案按日期命名）

---

### 3. 多重通知機制

**設計理由**：
- **AutoWatch**：集中監控多個 Job
- **Email**：完整執行記錄
- **SMS**：生產環境即時通知（凌晨也能收到）

---

### 4. 環境隔離

**設計理由**：
- 避免測試環境影響生產
- 自動檢測，減少人為錯誤
- 支援多套環境並行開發

---

## 十二、總結

ubl-ap 是 UBL 系統的自動化執行層，負責月結流程的關鍵步驟（Confirm/Undo/CutDate/Extract）和報表生成。其核心價值在於：

1. **環境自動檢測**：根據 hostname 自動選擇資料庫，支援 PT/SIT/UAT/PROD 四套環境
2. **錯誤通知機制**：AutoWatch + Email + SMS 三重通知，確保問題及時發現
3. **安全性設計**：密碼加密存儲，不明文在代碼中
4. **HTML 報表**：SQL*Plus MARKUP 自動生成 HTML 表格，郵件直接顯示
5. **編碼轉換**：支援中文郵件（UTF-8 → Big5）
6. **模組化設計**：腳本單一職責，配置檔與代碼分離

理解 ubl-ap 是掌握 UBL 系統自動化運維的關鍵。
