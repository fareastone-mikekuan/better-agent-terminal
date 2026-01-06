# UBL-WS 深度解析：Spring Boot REST API 層

## 一、系統概覽

**專案名稱**：ubl-ws  
**技術架構**：Spring Boot 1.5.8 + MyBatis + Oracle 19c  
**核心功能**：提供 REST API 給 DIO/MPBS/HGBN 前端系統呼叫，處理計費相關業務邏輯  
**代碼規模**：329 行 ChargeService + 60+ Java 類別  
**主要 API**：createCharge（新增費用）、correctCharge（費用更正）

---

## 二、架構設計

### 1. 分層架構

```
┌─────────────────────────────────────────┐
│          Controller Layer               │ ← REST API 端點
│  - CrChargeController                   │
│  - CorrectChargeController              │
│  - CacheController                      │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│          Service Layer                   │ ← 業務邏輯層
│  - ChargeService (329 行)               │
│  - BaseService                          │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│          DAO Layer (MyBatis)            │ ← 資料存取層
│  - ChargeDao                            │
│  - BaseDao                              │
│  - FyTbBlBillCiMapper                   │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│          Database Layer                  │
│  - FY_TB_BL_BILL_CI (費用明細表)         │
│  - FY_TB_BL_ACCOUNT (帳戶表)            │
│  - FY_TB_PBK_CHARGE_CODE (費用代碼表)   │
└─────────────────────────────────────────┘
```

---

### 2. 配置管理

**核心配置類別**：

| 配置類別 | 功能說明 | 主要設定 |
|---------|----------|---------|
| **WebSecurityConfig** | Spring Security 安全配置 | Authorization Token 驗證 |
| **MybatisConfig** | MyBatis ORM 配置 | Mapper 掃描、SQL Session Factory |
| **RestConfig** | REST 配置 | Jackson JSON 序列化設定 |
| **CacheConfig** | Cache 配置 | EhCache 本地快取 |
| **SwaggerConfig** | API 文件配置 | Swagger UI 設定 |

---

## 三、核心業務流程

### 1. createCharge：新增費用

**API 端點**：
```
POST /UBL/createCharge
Authorization: Bearer <token>
Content-Type: application/json
```

**請求結構**：
```json
{
  "entityInfo": {
    "entityType": "A",       // A: Account, S: Subscriber, O: OrgUnit
    "entityId": 12345        // 對應的 ID
  },
  "createChargeInfo": [
    {
      "chargeCode": "OC_ACT",      // 費用代碼
      "amount": 500.00,            // 金額
      "chargeDate": "2025-01-06",  // 費用日期
      "offerSeq": 1001,            // Offer 序號（選填）
      "offerInstanceId": 2001,     // Offer Instance ID（選填）
      "offerName": "Basic Plan",   // Offer 名稱（選填）
      "remark": "啟用費",           // 備註
      "attributeInfo": [
        {
          "attributeName": "DEVICE_COUNT",
          "attributeValue": "3"
        }
      ]
    }
  ]
}
```

**處理流程**：

#### 步驟 1：輸入驗證（chkInputCreate）
```java
private List<FyTbBlBillCi> chkInputCreate(CreateCharge input) throws Exception {
    List<FyTbBlBillCi> insCiList = new ArrayList<>();
    
    // 1. 檢查 EntityType 是否有效（A/S/O）
    if (!Arrays.asList("A", "S", "O").contains(input.getEntityInfo().getEntityType())) {
        throw new HGBException(ErrorCode.ENTITY_TYPE_ERROR);
    }
    
    // 2. 檢查 EntityId 是否存在
    validateEntityId(input.getEntityInfo());
    
    // 3. 處理每筆 CreateChargeInfo
    for (CreateChargeInfo chargeInfo : input.getCreateChargeInfo()) {
        FyTbBlBillCi ci = new FyTbBlBillCi();
        
        // 3.1 查詢 CHARGE_CODE 是否存在
        FyTbPbkChargeCode chargeCode = baseDao.getChargeCode(chargeInfo.getChargeCode());
        if (chargeCode == null) {
            throw new HGBException(ErrorCode.CHARGE_CODE_NOT_EXIST);
        }
        
        // 3.2 設定基本欄位
        ci.setChargeCode(chargeInfo.getChargeCode());
        ci.setAmount(new BigDecimal(chargeInfo.getAmount()));
        ci.setChrgDate(parseDate(chargeInfo.getChargeDate()));
        ci.setSource(chargeCode.getChargeOrg()); // OC/RC/UC/DE
        ci.setChargeOrg(chargeCode.getChargeOrg());
        
        // 3.3 設定 Account/Subscriber/OrgUnit 資訊
        setEntityInfo(ci, input.getEntityInfo());
        
        // 3.4 設定 CYCLE 與 CYCLE_MONTH
        setCycleInfo(ci, input.getEntityInfo());
        
        // 3.5 處理 Offer 資訊（選填）
        if (chargeInfo.getOfferSeq() != null) {
            ci.setOfferSeq(chargeInfo.getOfferSeq());
            ci.setOfferInstanceId(chargeInfo.getOfferInstanceId());
            ci.setOfferName(chargeInfo.getOfferName());
        }
        
        // 3.6 組合 DYNAMIC_ATTRIBUTE
        String dynamicAttr = buildDynamicAttribute(chargeInfo.getAttributeInfo());
        ci.setDynamicAttribute(dynamicAttr);
        
        // 3.7 設定 ACCT_KEY（用於資料分區）
        ci.setAcctKey(calculateAcctKey(ci.getAcctId()));
        
        insCiList.add(ci);
    }
    
    return insCiList;
}
```

#### 步驟 2：逐筆新增至 FY_TB_BL_BILL_CI
```java
@Transactional(rollbackFor = Exception.class)
public ChargeNoInfo createCharge(CreateCharge input, String userId) throws Exception {
    ChargeNoInfo chargeNoInfo = new ChargeNoInfo();
    List<Long> ciSeqList = new ArrayList<>();
    
    // 輸入值檢查與 CI 物件建立
    List<FyTbBlBillCi> insCiList = chkInputCreate(input);
    
    for (FyTbBlBillCi charInfo : insCiList) {
        // 取得 CI_SEQ（使用 Oracle Sequence）
        Long seq = baseDao.getSeq(SeqName.FY_SQ_BL_BILL_CI.name());
        Date date = new Date();
        
        charInfo.setCiSeq(seq);
        charInfo.setCorrectSeq((short) 0);  // 初始為 0
        
        // CHARGE_CODE 取前兩碼存於 CI.CHRG_ID
        if (charInfo.getChargeCode().length() > 2) {
            charInfo.setChrgId(charInfo.getChargeCode().substring(2));
        }
        
        // 設定審計欄位
        charInfo.setCreateUser(userId);
        charInfo.setCreateDate(date);
        charInfo.setUpdateUser(userId);
        charInfo.setUpdateDate(date);
        
        // 插入資料庫
        chargeDao.insBillCiBySelective(charInfo);
        ciSeqList.add(seq);
    }
    
    chargeNoInfo.setCiSeq(ciSeqList);
    return chargeNoInfo;
}
```

**關鍵設計**：
- **@Transactional**：確保多筆 CI 新增的原子性
- **Sequence 生成 CI_SEQ**：使用 Oracle Sequence 確保唯一性
- **ACCT_KEY 分區**：`TO_NUMBER(SUBSTR(LPAD(ACCT_ID,18,0),-2))`（取帳戶ID後兩碼）

---

### 2. correctCharge：費用更正

**API 端點**：
```
POST /UBL/correctCharge
Authorization: Bearer <token>
Content-Type: application/json
```

**請求結構**：
```json
{
  "entityInfo": {
    "entityType": "C",        // C: CI_SEQ
    "entityId": 123456        // CI_SEQ
  },
  "amount": -500.00,          // 更正金額（可正可負）
  "remark": "費用退款"         // 更正原因
}
```

**處理流程**：

#### 步驟 1：輸入驗證（chkInputCorrect）
```java
private void chkInputCorrect(CorrectCharge input) throws Exception {
    // 1. 檢查 EntityType 必須為 'C'
    if (!"C".equals(input.getEntityInfo().getEntityType())) {
        throw new HGBException(ErrorCode.ENTITY_TYPE_ERROR, 
            "CorrectCharge EntityType must be 'C'");
    }
    
    // 2. 檢查 EntityId（CI_SEQ）是否存在
    if (input.getEntityInfo().getEntityId() == null) {
        throw new HGBException(ErrorCode.ENTITY_ID_REQUIRED);
    }
    
    // 3. 檢查 Amount 不能為 0
    if (input.getAmount() == 0) {
        throw new HGBException(ErrorCode.AMOUNT_CANNOT_BE_ZERO);
    }
}
```

#### 步驟 2：取得原始 CI 並驗證
```java
@Transactional(rollbackFor = Exception.class)
public ChargeNoInfo correctCharge(CorrectCharge input, String userId) throws Exception {
    ChargeNoInfo chargeNoInfo = new ChargeNoInfo();
    
    // 輸入驗證
    chkInputCorrect(input);
    
    // 根據 CI_SEQ 取得原始 CI
    FyTbBlBillCi originalCi = chargeDao.getBillCiByKey(input.getEntityInfo().getEntityId());
    if (originalCi == null) {
        throw new HGBException(ErrorCode.DATA_NO_EXIST, 
            "CI_SEQ: " + input.getEntityInfo().getEntityId());
    }
    
    // 檢查金額是否可進行 CORRECT
    BigDecimal originalAmount = originalCi.getAmount();
    BigDecimal correctAmount = new BigDecimal(input.getAmount());
    BigDecimal resultAmount = originalAmount.add(correctAmount);
    
    // 如果更正後金額與原金額符號相反，不允許（避免過度更正）
    if (originalAmount.signum() != resultAmount.signum() && resultAmount.signum() != 0) {
        throw new HGBException(ErrorCode.CORRECT_AMOUNT_INVALID,
            "Original: " + originalAmount + ", Correct: " + correctAmount);
    }
    
    // ... 繼續處理
}
```

#### 步驟 3：建立更正 CI
```java
// 複製原始 CI 的所有欄位
FyTbBlBillCi correctCi = copyOriginalCi(originalCi);

// 取得新的 CI_SEQ
Long newCiSeq = baseDao.getSeq(SeqName.FY_SQ_BL_BILL_CI.name());
correctCi.setCiSeq(newCiSeq);

// 設定更正金額
correctCi.setAmount(new BigDecimal(input.getAmount()));

// 設定 CORRECT_CI_SEQ（指向原始 CI）
correctCi.setCorrectCiSeq(input.getEntityInfo().getEntityId());

// 增加 CORRECT_SEQ（更正序號）
Short newCorrectSeq = (short) (originalCi.getCorrectSeq() + 1);
correctCi.setCorrectSeq(newCorrectSeq);

// 設定備註
correctCi.setRemark(input.getRemark());

// 設定審計欄位
Date date = new Date();
correctCi.setCreateUser(userId);
correctCi.setCreateDate(date);
correctCi.setUpdateUser(userId);
correctCi.setUpdateDate(date);

// 插入資料庫
chargeDao.insBillCiBySelective(correctCi);

// 更新原始 CI 的 CORRECT_SEQ
originalCi.setCorrectSeq(newCorrectSeq);
originalCi.setUpdateUser(userId);
originalCi.setUpdateDate(date);
chargeDao.updateBillCiByKey(originalCi);

chargeNoInfo.setCiSeq(Arrays.asList(newCiSeq));
return chargeNoInfo;
```

**關鍵設計**：
- **CORRECT_CI_SEQ**：指向原始 CI（建立關聯）
- **CORRECT_SEQ 累加**：原始 CI 與更正 CI 都要更新
- **金額符號檢查**：避免過度更正（如：原金額 500，更正 -600，結果 -100，不合理）

---

## 四、關鍵類別深度解析

### 1. ChargeService.java（329 行）

**主要方法**：

| 方法名稱 | 功能說明 | 回傳值 |
|---------|----------|-------|
| **createCharge** | 新增費用到 FY_TB_BL_BILL_CI | ChargeNoInfo（含 CI_SEQ 清單） |
| **correctCharge** | 更正費用（新增更正 CI） | ChargeNoInfo（含新 CI_SEQ） |
| **chkInputCreate** | 驗證 createCharge 輸入 | List<FyTbBlBillCi> |
| **chkInputCorrect** | 驗證 correctCharge 輸入 | void（拋出異常） |
| **validateEntityId** | 驗證 EntityId 是否存在 | void（拋出異常） |
| **setEntityInfo** | 設定 Account/Subscriber/OrgUnit 資訊 | void |
| **setCycleInfo** | 設定 CYCLE 與 CYCLE_MONTH | void |
| **buildDynamicAttribute** | 組合 DYNAMIC_ATTRIBUTE 字串 | String |
| **calculateAcctKey** | 計算 ACCT_KEY（分區鍵） | Integer |
| **copyOriginalCi** | 複製原始 CI 物件 | FyTbBlBillCi |

---

### 2. Controller 層

#### CrChargeController（createCharge）

```java
@RestController
@RequestMapping("/UBL")
public class CrChargeController extends BaseController {
    
    private static final String SERVICE_NAME = "createCharge";
    
    @Autowired
    private ChargeService chargeService;
    
    @PostMapping("/createCharge")
    public HGBResponseEntity createCharge(
            @RequestHeader("Authorization") String authorization,
            @RequestBody CreateCharge input) throws Exception {
        
        HGBResponseEntity response = new HGBResponseEntity();
        
        try {
            // 呼叫 Service 層
            ChargeNoInfo chargeNoInfo = chargeService.createCharge(
                input, 
                AuthUtil.getLoginUser(authorization)
            );
            
            response.setData(chargeNoInfo);
            response.setReturnCode("0000");
            response.setReturnMsg("Success");
            
        } catch (HGBException ex) {
            // 業務異常處理
            response.setReturnCode(ex.getErrorCode());
            response.setReturnMsg(ex.getMessage());
            LOG.error("createCharge error: ", ex);
            
        } catch (Exception ex) {
            // 系統異常處理
            response.setReturnCode("9999");
            response.setReturnMsg("System Error");
            LOG.error("createCharge system error: ", ex);
        }
        
        return response;
    }
}
```

#### CorrectChargeController（correctCharge）

```java
@RestController
@RequestMapping("/UBL")
public class CorrectChargeController extends BaseController {
    
    private static final String SERVICE_NAME = "correctCharge";
    
    @Autowired
    private ChargeService chargeService;
    
    @PostMapping("/correctCharge")
    public HGBResponseEntity correctCharge(
            @RequestHeader("Authorization") String authorization,
            @RequestBody CorrectCharge input) throws Exception {
        
        HGBResponseEntity response = new HGBResponseEntity();
        
        try {
            ChargeNoInfo chargeNoInfo = chargeService.correctCharge(
                input, 
                AuthUtil.getLoginUser(authorization)
            );
            
            response.setData(chargeNoInfo);
            response.setReturnCode("0000");
            response.setReturnMsg("Success");
            
        } catch (HGBException ex) {
            response.setReturnCode(ex.getErrorCode());
            response.setReturnMsg(ex.getMessage());
            LOG.error("correctCharge error: ", ex);
        }
        
        return response;
    }
}
```

---

### 3. DAO 層（MyBatis）

#### ChargeDao.java

```java
@Repository
public class ChargeDao {
    
    @Autowired
    private FyTbBlBillCiMapper billCiMapper;
    
    /**
     * 新增 CI（使用 Selective 方式，只插入非 null 欄位）
     */
    public int insBillCiBySelective(FyTbBlBillCi record) {
        return billCiMapper.insertSelective(record);
    }
    
    /**
     * 根據 CI_SEQ 查詢 CI
     */
    public FyTbBlBillCi getBillCiByKey(Long ciSeq) {
        return billCiMapper.selectByPrimaryKey(ciSeq);
    }
    
    /**
     * 更新 CI
     */
    public int updateBillCiByKey(FyTbBlBillCi record) {
        return billCiMapper.updateByPrimaryKeySelective(record);
    }
}
```

#### FyTbBlBillCiMapper.xml（MyBatis SQL）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
"http://mybatis.org/dtd/mybatis-3-mapper.dtd">

<mapper namespace="com.foyatech.hgb.dao.mybatis.mapper.FyTbBlBillCiMapper">

    <!-- Result Map -->
    <resultMap id="BaseResultMap" type="com.foyatech.hgb.dao.mybatis.model.FyTbBlBillCi">
        <id column="CI_SEQ" property="ciSeq" jdbcType="DECIMAL" />
        <result column="BILL_SEQ" property="billSeq" jdbcType="DECIMAL" />
        <result column="CYCLE" property="cycle" jdbcType="DECIMAL" />
        <result column="CYCLE_MONTH" property="cycleMonth" jdbcType="DECIMAL" />
        <result column="ACCT_ID" property="acctId" jdbcType="DECIMAL" />
        <result column="SUBSCR_ID" property="subscrId" jdbcType="DECIMAL" />
        <result column="CHARGE_CODE" property="chargeCode" jdbcType="VARCHAR" />
        <result column="AMOUNT" property="amount" jdbcType="DECIMAL" />
        <result column="SOURCE" property="source" jdbcType="VARCHAR" />
        <result column="CHRG_DATE" property="chrgDate" jdbcType="TIMESTAMP" />
        <result column="CORRECT_CI_SEQ" property="correctCiSeq" jdbcType="DECIMAL" />
        <result column="CORRECT_SEQ" property="correctSeq" jdbcType="DECIMAL" />
        <result column="DYNAMIC_ATTRIBUTE" property="dynamicAttribute" jdbcType="VARCHAR" />
        <!-- ... 其他欄位 ... -->
    </resultMap>

    <!-- Insert (Selective) -->
    <insert id="insertSelective" parameterType="com.foyatech.hgb.dao.mybatis.model.FyTbBlBillCi">
        INSERT INTO FY_TB_BL_BILL_CI
        <trim prefix="(" suffix=")" suffixOverrides=",">
            <if test="ciSeq != null">CI_SEQ,</if>
            <if test="billSeq != null">BILL_SEQ,</if>
            <if test="cycle != null">CYCLE,</if>
            <if test="cycleMonth != null">CYCLE_MONTH,</if>
            <if test="acctId != null">ACCT_ID,</if>
            <if test="subscrId != null">SUBSCR_ID,</if>
            <if test="chargeCode != null">CHARGE_CODE,</if>
            <if test="amount != null">AMOUNT,</if>
            <if test="source != null">SOURCE,</if>
            <if test="chrgDate != null">CHRG_DATE,</if>
            <if test="correctCiSeq != null">CORRECT_CI_SEQ,</if>
            <if test="correctSeq != null">CORRECT_SEQ,</if>
            <if test="dynamicAttribute != null">DYNAMIC_ATTRIBUTE,</if>
            <!-- ... 其他欄位 ... -->
        </trim>
        <trim prefix="VALUES (" suffix=")" suffixOverrides=",">
            <if test="ciSeq != null">#{ciSeq,jdbcType=DECIMAL},</if>
            <if test="billSeq != null">#{billSeq,jdbcType=DECIMAL},</if>
            <if test="cycle != null">#{cycle,jdbcType=DECIMAL},</if>
            <if test="cycleMonth != null">#{cycleMonth,jdbcType=DECIMAL},</if>
            <if test="acctId != null">#{acctId,jdbcType=DECIMAL},</if>
            <if test="subscrId != null">#{subscrId,jdbcType=DECIMAL},</if>
            <if test="chargeCode != null">#{chargeCode,jdbcType=VARCHAR},</if>
            <if test="amount != null">#{amount,jdbcType=DECIMAL},</if>
            <if test="source != null">#{source,jdbcType=VARCHAR},</if>
            <if test="chrgDate != null">#{chrgDate,jdbcType=TIMESTAMP},</if>
            <if test="correctCiSeq != null">#{correctCiSeq,jdbcType=DECIMAL},</if>
            <if test="correctSeq != null">#{correctSeq,jdbcType=DECIMAL},</if>
            <if test="dynamicAttribute != null">#{dynamicAttribute,jdbcType=VARCHAR},</if>
            <!-- ... 其他欄位 ... -->
        </trim>
    </insert>

    <!-- Select by Primary Key -->
    <select id="selectByPrimaryKey" parameterType="java.lang.Long" resultMap="BaseResultMap">
        SELECT 
            CI_SEQ, BILL_SEQ, CYCLE, CYCLE_MONTH, ACCT_ID, SUBSCR_ID,
            CHARGE_CODE, AMOUNT, SOURCE, CHRG_DATE, CORRECT_CI_SEQ, CORRECT_SEQ,
            DYNAMIC_ATTRIBUTE, CREATE_USER, CREATE_DATE, UPDATE_USER, UPDATE_DATE
        FROM FY_TB_BL_BILL_CI
        WHERE CI_SEQ = #{ciSeq,jdbcType=DECIMAL}
    </select>

    <!-- Update (Selective) -->
    <update id="updateByPrimaryKeySelective" parameterType="com.foyatech.hgb.dao.mybatis.model.FyTbBlBillCi">
        UPDATE FY_TB_BL_BILL_CI
        <set>
            <if test="amount != null">AMOUNT = #{amount,jdbcType=DECIMAL},</if>
            <if test="correctSeq != null">CORRECT_SEQ = #{correctSeq,jdbcType=DECIMAL},</if>
            <if test="updateUser != null">UPDATE_USER = #{updateUser,jdbcType=VARCHAR},</if>
            <if test="updateDate != null">UPDATE_DATE = #{updateDate,jdbcType=TIMESTAMP},</if>
            <!-- ... 其他可更新欄位 ... -->
        </set>
        WHERE CI_SEQ = #{ciSeq,jdbcType=DECIMAL}
    </update>

</mapper>
```

---

## 五、安全機制

### 1. Authorization Token 驗證

**WebSecurityConfig.java**：
```java
@Configuration
@EnableWebSecurity
public class WebSecurityConfig extends WebSecurityConfigurerAdapter {
    
    @Autowired
    private BLAuthorizationService authorizationService;
    
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http
            .csrf().disable()  // 關閉 CSRF（REST API 使用 Token）
            .authorizeRequests()
                .antMatchers("/UBL/**").authenticated()  // UBL API 需要驗證
                .anyRequest().permitAll()
            .and()
            .addFilterBefore(
                new AuthorizationFilter(authorizationService),
                UsernamePasswordAuthenticationFilter.class
            );
    }
}
```

**AuthorizationFilter**：
```java
public class AuthorizationFilter extends OncePerRequestFilter {
    
    private BLAuthorizationService authorizationService;
    
    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        
        String authHeader = request.getHeader("Authorization");
        
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Missing Authorization Header");
            return;
        }
        
        String token = authHeader.substring(7);
        
        // 驗證 Token
        boolean isValid = authorizationService.validateToken(token);
        if (!isValid) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid Token");
            return;
        }
        
        // Token 有效，繼續處理請求
        filterChain.doFilter(request, response);
    }
}
```

---

### 2. 權限控制

**BLAuthorizationService.java**：
```java
@Service
public class BLAuthorizationService {
    
    @Autowired
    private AuthDao authDao;
    
    /**
     * 驗證 Token 有效性
     */
    public boolean validateToken(String token) {
        // 1. 解碼 Token
        String decodedToken = ShaEncryptor.decrypt(token);
        
        // 2. 查詢資料庫驗證
        AuthToken authToken = authDao.getAuthToken(decodedToken);
        if (authToken == null) {
            return false;
        }
        
        // 3. 檢查過期時間
        if (authToken.getExpireDate().before(new Date())) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 從 Token 取得使用者資訊
     */
    public String getLoginUser(String authorization) {
        String token = authorization.substring(7);
        String decodedToken = ShaEncryptor.decrypt(token);
        AuthToken authToken = authDao.getAuthToken(decodedToken);
        return authToken != null ? authToken.getUserId() : null;
    }
}
```

---

## 六、錯誤處理機制

### 1. HGBException 自定義異常

```java
public class HGBException extends Exception {
    
    private String errorCode;
    private String errorMessage;
    
    public HGBException(ErrorCode errorCode, Object... params) {
        super(String.format(errorCode.getMessage(), params));
        this.errorCode = errorCode.getCode();
        this.errorMessage = String.format(errorCode.getMessage(), params);
    }
    
    public String getErrorCode() {
        return errorCode;
    }
    
    public String getErrorMessage() {
        return errorMessage;
    }
}
```

### 2. ErrorCode 枚舉

```java
public enum ErrorCode {
    
    // 通用錯誤
    SUCCESS("0000", "Success"),
    SYSTEM_ERROR("9999", "System Error"),
    
    // 輸入驗證錯誤
    ENTITY_TYPE_ERROR("1001", "Invalid EntityType: %s"),
    ENTITY_ID_REQUIRED("1002", "EntityId is required"),
    AMOUNT_CANNOT_BE_ZERO("1003", "Amount cannot be zero"),
    
    // 資料不存在錯誤
    DATA_NO_EXIST("2001", "%s not exist in %s"),
    CHARGE_CODE_NOT_EXIST("2002", "ChargeCode %s not exist"),
    ACCOUNT_NOT_EXIST("2003", "Account %s not exist"),
    
    // 業務邏輯錯誤
    CORRECT_AMOUNT_INVALID("3001", "Correct amount invalid: %s"),
    BILL_ALREADY_CONFIRMED("3002", "Bill %s already confirmed"),
    
    // ... 更多錯誤碼 ...
    
    private String code;
    private String message;
    
    ErrorCode(String code, String message) {
        this.code = code;
        this.message = message;
    }
    
    public String getCode() {
        return code;
    }
    
    public String getMessage() {
        return message;
    }
}
```

---

## 七、快取機制

### 1. CacheConfig 配置

```java
@Configuration
@EnableCaching
public class CacheConfig {
    
    @Bean
    public CacheManager cacheManager() {
        EhCacheCacheManager cacheManager = new EhCacheCacheManager();
        cacheManager.setCacheManager(ehCacheManager().getObject());
        return cacheManager;
    }
    
    @Bean
    public EhCacheManagerFactoryBean ehCacheManager() {
        EhCacheManagerFactoryBean factory = new EhCacheManagerFactoryBean();
        factory.setConfigLocation(new ClassPathResource("ehcache.xml"));
        factory.setShared(true);
        return factory;
    }
}
```

### 2. 快取使用範例

```java
@Service
public class ChargeService extends BaseService {
    
    /**
     * 查詢 ChargeCode（帶快取）
     */
    @Cacheable(value = CacheName.CHARGE_CODE, key = "#chargeCode")
    public FyTbPbkChargeCode getChargeCode(String chargeCode) {
        return baseDao.getChargeCode(chargeCode);
    }
    
    /**
     * 清除快取
     */
    @CacheEvict(value = CacheName.CHARGE_CODE, allEntries = true)
    public void clearChargeCodeCache() {
        LOG.info("ChargeCode cache cleared");
    }
}
```

**ehcache.xml 配置**：
```xml
<ehcache>
    <cache name="chargeCode"
           maxElementsInMemory="1000"
           eternal="false"
           timeToIdleSeconds="3600"
           timeToLiveSeconds="7200"
           overflowToDisk="false"
           memoryStoreEvictionPolicy="LRU" />
</ehcache>
```

---

## 八、真實案例

### 案例 1：新增啟用費

**背景**：客戶啟用新服務，需要收取啟用費 500 元

**Request**：
```json
POST /UBL/createCharge
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "entityInfo": {
    "entityType": "S",
    "entityId": 12345
  },
  "createChargeInfo": [
    {
      "chargeCode": "OC_ACT",
      "amount": 500.00,
      "chargeDate": "2025-01-06",
      "offerSeq": 1001,
      "offerInstanceId": 2001,
      "offerName": "Basic Plan",
      "remark": "Service activation fee"
    }
  ]
}
```

**處理流程**：
1. 驗證 Token → 有效
2. 查詢 SUBSCR_ID=12345 → 存在
3. 查詢 CHARGE_CODE='OC_ACT' → 存在，CHARGE_ORG='CC'
4. 查詢 SUBSCR 的 CYCLE → CYCLE=10, CYCLE_MONTH=202501
5. 取得 CI_SEQ=999001
6. 計算 ACCT_KEY=45（ACCT_ID=12345 → 後兩碼=45）
7. 插入 FY_TB_BL_BILL_CI

**Response**：
```json
{
  "returnCode": "0000",
  "returnMsg": "Success",
  "data": {
    "ciSeq": [999001]
  }
}
```

**資料庫記錄**：
```sql
SELECT * FROM FY_TB_BL_BILL_CI WHERE CI_SEQ = 999001;

| CI_SEQ | BILL_SEQ | CYCLE | CYCLE_MONTH | ACCT_ID | SUBSCR_ID | CHARGE_CODE | AMOUNT | SOURCE | CHRG_DATE  | ACCT_KEY |
|--------|----------|-------|-------------|---------|-----------|-------------|--------|--------|------------|----------|
| 999001 | NULL     | 10    | 202501      | 12345   | 12345     | OC_ACT      | 500.00 | CC     | 2025-01-06 | 45       |
```

---

### 案例 2：費用更正（退款）

**背景**：客戶要求退還啟用費 500 元

**Request**：
```json
POST /UBL/correctCharge
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "entityInfo": {
    "entityType": "C",
    "entityId": 999001
  },
  "amount": -500.00,
  "remark": "Refund activation fee"
}
```

**處理流程**：
1. 驗證 Token → 有效
2. 查詢 CI_SEQ=999001 → 存在，AMOUNT=500.00, CORRECT_SEQ=0
3. 檢查更正金額：500 + (-500) = 0（合法）
4. 取得新 CI_SEQ=999002
5. 複製原始 CI，設定 AMOUNT=-500.00, CORRECT_CI_SEQ=999001, CORRECT_SEQ=1
6. 插入新 CI
7. 更新原始 CI 的 CORRECT_SEQ=1

**Response**：
```json
{
  "returnCode": "0000",
  "returnMsg": "Success",
  "data": {
    "ciSeq": [999002]
  }
}
```

**資料庫記錄**：
```sql
SELECT * FROM FY_TB_BL_BILL_CI WHERE CI_SEQ IN (999001, 999002) ORDER BY CI_SEQ;

| CI_SEQ | CHARGE_CODE | AMOUNT  | CORRECT_CI_SEQ | CORRECT_SEQ | REMARK                 |
|--------|-------------|---------|----------------|-------------|------------------------|
| 999001 | OC_ACT      | 500.00  | NULL           | 1           | Service activation fee |
| 999002 | OC_ACT      | -500.00 | 999001         | 1           | Refund activation fee  |

-- 淨金額：500 + (-500) = 0
```

---

## 九、技術亮點與最佳實踐

### 1. RESTful API 設計

**良好實踐**：
- 使用 POST 方法（非冪等操作）
- 統一回傳結構（HGBResponseEntity）
- HTTP Status Code 正確使用（200, 401, 500）
- Authorization Header 驗證

---

### 2. 交易管理

**@Transactional 使用**：
```java
@Transactional(rollbackFor = Exception.class)
public ChargeNoInfo createCharge(CreateCharge input, String userId) throws Exception {
    // 所有操作在同一個交易中
    // 若拋出任何 Exception，自動 ROLLBACK
}
```

**優點**：
- 確保資料一致性
- 自動 ROLLBACK
- 簡化錯誤處理

---

### 3. MyBatis Selective 模式

**優點**：
- 只插入/更新非 null 欄位
- 避免覆蓋預設值
- 提升效能

**範例**：
```xml
<insert id="insertSelective">
    INSERT INTO FY_TB_BL_BILL_CI
    <trim prefix="(" suffix=")" suffixOverrides=",">
        <if test="ciSeq != null">CI_SEQ,</if>
        <if test="amount != null">AMOUNT,</if>
        <!-- 只插入傳入的欄位 -->
    </trim>
    <trim prefix="VALUES (" suffix=")" suffixOverrides=",">
        <if test="ciSeq != null">#{ciSeq},</if>
        <if test="amount != null">#{amount},</if>
    </trim>
</insert>
```

---

### 4. 錯誤處理統一化

**三層錯誤處理**：
1. **輸入驗證**：拋出 HGBException（錯誤碼 1xxx）
2. **業務邏輯**：拋出 HGBException（錯誤碼 2xxx, 3xxx）
3. **系統異常**：捕捉 Exception（錯誤碼 9999）

---

## 十、效能優化建議

### 1. 資料庫索引

**關鍵索引**：
```sql
-- CI_SEQ (Primary Key)
CREATE UNIQUE INDEX PK_FY_TB_BL_BILL_CI ON FY_TB_BL_BILL_CI(CI_SEQ);

-- 帳期查詢
CREATE INDEX IDX_BILL_CI_CYCLE ON FY_TB_BL_BILL_CI(CYCLE, CYCLE_MONTH, ACCT_ID);

-- 更正查詢
CREATE INDEX IDX_BILL_CI_CORRECT ON FY_TB_BL_BILL_CI(CORRECT_CI_SEQ);

-- ACCT_KEY 分區
CREATE INDEX IDX_BILL_CI_ACCT_KEY ON FY_TB_BL_BILL_CI(ACCT_KEY, ACCT_ID);
```

---

### 2. 批次插入優化

**目前方式**（逐筆）：
```java
for (FyTbBlBillCi ci : insCiList) {
    chargeDao.insBillCiBySelective(ci);  // 每次一筆
}
```

**優化方式**（批次）：
```java
// MyBatis Batch Insert
chargeDao.batchInsertBillCi(insCiList);  // 一次多筆
```

**MyBatis Batch Insert XML**：
```xml
<insert id="batchInsertBillCi" parameterType="java.util.List">
    INSERT INTO FY_TB_BL_BILL_CI (CI_SEQ, CHARGE_CODE, AMOUNT, ...)
    VALUES
    <foreach collection="list" item="item" separator=",">
        (#{item.ciSeq}, #{item.chargeCode}, #{item.amount}, ...)
    </foreach>
</insert>
```

---

### 3. Connection Pool 設定

**application.properties**：
```properties
# HikariCP 連線池設定
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000
```

---

## 十一、與 DB Packages 的協作

### 1. 資料流向

```
┌──────────────────┐
│ DIO/MPBS (前端)   │
└────────┬─────────┘
         │ REST API
         ↓
┌──────────────────┐
│ ubl-ws           │ ← createCharge, correctCharge
│ (ChargeService)  │
└────────┬─────────┘
         │ INSERT
         ↓
┌──────────────────┐
│ FY_TB_BL_BILL_CI │ ← CI 資料
└────────┬─────────┘
         │ READ
         ↓
┌──────────────────┐
│ FY_PG_BL_BILL_CI │ ← DO_RECUR, DO_DISCOUNT
│ (DB Package)     │
└──────────────────┘
```

### 2. 分工

**ubl-ws 負責**：
- 接收前端 API 請求
- 驗證輸入資料
- 新增/更正 CI（One-time Charge, Manual Charge）

**DB Package 負責**：
- RC（Recurring Charge）計算
- Discount 計算
- Pro-rata 計算
- SUSPEND 處理

---

## 十二、總結

UBL-WS 是 UBL 系統的 REST API 層，提供給前端系統呼叫。其核心價值在於：

1. **統一介面**：標準化的 REST API（createCharge, correctCharge）
2. **輸入驗證**：嚴格的輸入檢查，避免髒資料
3. **交易管理**：@Transactional 確保資料一致性
4. **錯誤處理**：統一的異常處理機制
5. **安全機制**：Token 驗證與權限控制
6. **效能優化**：快取機制、Connection Pool

理解 ubl-ws 是掌握 UBL 系統 API 層的關鍵。
