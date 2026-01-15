# UBL-AP scripts (MPBL, UBL)

## MPBL\BL\MailList.txt
```text
mikekuan@fareastone.com.tw SharonLin@fareastone.com.tw
```

## MPBL\BL\smsList.txt
```text
0936585468 0936585468
```

## MPBL\BL\Confirm\bin\HGB_MPBL_Confirm_DIO_Check.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Extract.sh
--# Path : /extsoft/MPBL/BL/Extract/bin
--# SQL name : HGB_MPBL_Confirm_DIO_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1'; 
  v_CYCLE          NUMBER(2)    := '&2'; 
  v_PROC_ID        VARCHAR2(9)  := '&3';
  v_PROCESS_NO     NUMBER(3)    := '&4';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STATUS        FY_TB_DIO_CNTRL.STATUS%TYPE;
  CH_IO_TYPE       FY_TB_DIO_CNTRL.IO_TYPE%TYPE;
  NU_CNT           NUMBER;
  NU_CNT_CHECK     NUMBER; 
  RUN_MINS         NUMBER;  
  On_Err           EXCEPTION;
  CURSOR C1 IS
     SELECT BILL_SEQ, STATUS, ROUND(TO_NUMBER(sysdate - START_TIME) * 24 * 60) RUN_MINS, b.COUNT p_count, c.COUNT c_count
       FROM FY_TB_DIO_CNTRL A,
         (SELECT COUNT (proc_id) COUNT
            FROM fy_tb_dio_cntrl a
           WHERE bill_seq = nu_bill_seq
             AND process_no = v_process_no
             --AND acct_group = ch_acct_group
             AND proc_type = v_proc_type
             AND proc_id = v_PROC_ID
             AND confirm_id =
                    (SELECT MAX (confirm_id)
                       FROM fy_tb_dio_cntrl
                      WHERE bill_seq = a.bill_seq
                        AND process_no = a.process_no
                        --AND acct_group = a.acct_group
                        AND proc_type = a.proc_type
                        AND proc_id = v_PROC_ID)) b,
         (SELECT COUNT (status) COUNT
            FROM fy_tb_dio_cntrl a
           WHERE bill_seq = nu_bill_seq
             AND process_no = v_process_no
             --AND acct_group = ch_acct_group
             AND proc_type = v_proc_type
             AND proc_id = v_PROC_ID
             AND status = 'S'
             AND confirm_id =
                    (SELECT MAX (confirm_id)
                       FROM fy_tb_dio_cntrl
                      WHERE bill_seq = a.bill_seq
                        AND process_no = a.process_no
                        --AND acct_group = a.acct_group
                        AND proc_type = a.proc_type
                        AND proc_id = v_PROC_ID)) c
      WHERE BILL_SEQ  =NU_BILL_SEQ
		AND process_no = v_process_no
		--AND acct_group = ch_acct_group
        AND PROC_TYPE =v_PROC_TYPE
        AND PROC_ID   =v_PROC_ID
        AND CONFIRM_ID =(SELECT MAX(CONFIRM_ID) FROM FY_TB_DIO_CNTRL
                             WHERE BILL_SEQ  =A.BILL_SEQ
                               AND PROC_TYPE =A.PROC_TYPE
                               AND PROC_ID   =v_PROC_ID)
		order by decode(STATUS,'E',1,'A',2,'S',3,4);

begin
SELECT bill_seq,
       (CASE
           WHEN v_process_no <> 999
              THEN (SELECT acct_group
                      FROM fy_tb_bl_cycle_process
                     WHERE CYCLE = v_cycle AND process_no = v_process_no)
           ELSE (SELECT DECODE (v_proc_type, 'B', 'HOLD', 'QA')
                   FROM DUAL)
        END
       ) acct_group
  INTO nu_bill_seq,
       ch_acct_group
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   and a.create_user=CH_USER;
   
  CH_STATUS :='Y';
  FOR R1 IN C1 LOOP
    IF R1.STATUS='E' AND R1.RUN_MINS <= 10 THEN
		DELETE fy_tb_dio_cntrl_dtl
			WHERE cntrl_seq IN (SELECT cntrl_seq
								FROM fy_tb_dio_cntrl
								WHERE bill_seq = nu_bill_seq AND status = 'E');
	
		UPDATE fy_tb_dio_cntrl
			SET status = 'A',
				last_grp_id = NULL,
				tot_cnt = NULL,
				tot_amt = NULL,
				start_time = NULL,
				end_time = NULL
		WHERE bill_seq = nu_bill_seq AND status = 'E';
	
		COMMIT;
	
       DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Processing'); 
       RAISE ON_ERR;
    ELSIF R1.STATUS='E' THEN
       DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Process RETURN_CODE = 9999'); 
       RAISE ON_ERR;
    ELSIF R1.STATUS<>'S' THEN
       DBMS_OUTPUT.Put_Line('Confirm_DIO_Check '||v_PROC_ID||' Processing'); 
       RAISE ON_ERR;
    END IF;
	CH_STATUS :='N';
	NU_CNT := R1.P_COUNT;
	NU_CNT_CHECK := R1.C_COUNT;
	DBMS_OUTPUT.Put_Line('CH_STATUS='||CH_STATUS||' ,NU_CNT='||NU_CNT||' ,NU_CNT_CHECK='||NU_CNT_CHECK);
  END LOOP;
  
  IF CH_STATUS='N' AND NU_CNT = NU_CNT_CHECK THEN
     DBMS_OUTPUT.Put_Line('Confirm_DIO_Check '||v_PROC_ID||' Process RETURN_CODE = 0000'); 
  ELSE   
     DBMS_OUTPUT.Put_Line('Confirm_DIO_Check '||v_PROC_ID||' Processing'); 
  END IF; 
  
EXCEPTION 
   WHEN on_err THEN
      NULL;
   WHEN OTHERS THEN
     DBMS_OUTPUT.Put_Line('Confirm_DIO_Check '||v_PROC_ID||' Process RETURN_CODE = 9999'); 
end;
/

```

## MPBL\BL\Confirm\bin\HGB_MPBL_Confirm_MV_ACCT_Check.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Confirm.sh
--# Path : /extsoft/MPBL/BL/Confirm/bin
--# SQL name : HGB_MPBL_Confirm_MV_ACCT_Check.sql
--#
--# Date : 2021/09/02 Created by Mike Kuan
--# Description : SR233414_行動裝置險月繳保費預繳專案
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '888';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number, iacct_group varchar2) IS
     select nvl(
      (select count(1) cnt
       from fy_tb_bl_bill_acct b
      where b.bill_seq   =ibill_seq
        and b.acct_group =iacct_group
		and b.BILL_STATUS ='MA'
        and v_PROCESS_NO=888),0) cnt from dual;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO=888 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)          
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   AND A.CREATE_USER=CH_USER;
  FOR R1 IN C1(nu_bill_seq,CH_ACCT_GROUP) LOOP
     DBMS_OUTPUT.Put_Line(to_char(r1.cnt));  
  end loop; 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Confirm_MV_ACCT_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## MPBL\BL\Confirm\bin\HGB_MPBL_Confirm_OCS_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Preparation.sh
--# Path : /extsoft/UBL/BL/Preparation/bin
--# SQL name : HGB_UBL_Preparation_AR_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  nu_count         number;
  NU_CNT           NUMBER;
  On_Err           EXCEPTION;
  CURSOR C1 IS
	SELECT count(1) COUNT
		FROM bl1_cyc_payer_pop@prdappc.prdcm
	WHERE cycle_seq_no = NU_BILL_SEQ AND status = 'BL';

begin
  select bill_SEQ
    into nu_bill_seq
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   and A.CREATE_USER=CH_USER;
   
  nu_count :=0;
  FOR R1 IN C1 LOOP
    IF R1.COUNT != 0 THEN
       DBMS_OUTPUT.Put_Line('Confirm_OCS_Check Processing'); 
       RAISE ON_ERR;
    ELSIF R1.COUNT IS NULL THEN
       DBMS_OUTPUT.Put_Line('Confirm_OCS_Check Process RETURN_CODE = 9999'); 
       RAISE ON_ERR;
    END IF;
    nu_count :=0;
  END LOOP;
  IF nu_count !=0 THEN
     DBMS_OUTPUT.Put_Line('Confirm_OCS_Check Processing'); 
  ELSE   
     DBMS_OUTPUT.Put_Line('Confirm_OCS_Check Process RETURN_CODE = 0000'); 
  END IF;   
EXCEPTION 
   WHEN on_err THEN
      NULL;
   WHEN OTHERS THEN
     DBMS_OUTPUT.Put_Line('Confirm_OCS_Check Process RETURN_CODE = 9999'); 
end;
/

```

## MPBL\BL\Confirm\bin\HGB_MPBL_Confirm_Patch_Change_Cycle.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Confirm.sh
--# SQL name : HGB_MPBL_Confirm_Patch_Change_Cycle.sql
--# Path : /extsoft/MPBL/BL/CutDate/bin
--#
--# Date : 2021/01/19 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB_Patch_Change_Cycle
--########################################################################################
--# Date : 2021/02/23 Created by Mike Kuan
--# Description : 修正有出帳CUST中含有不需出帳的ACCT無法被正常更新CYCLE的問題
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
   v_BILL_DATE       VARCHAR2(8)  := '&1'; 
   v_CYCLE           NUMBER(2)    := '&2'; 
   CH_STATUS         VARCHAR2(6);
   CH_USER           VARCHAR2(8)  := 'MPBL';
   NU_CNT            NUMBER;
   ERR_CNT           NUMBER       := 0;
   On_ERR            EXCEPTION;
CURSOR c1 IS
    SELECT CUST_ID
      FROM fy_tb_bl_change_cycle a
     WHERE future_eff_date = TO_DATE (v_BILL_DATE, 'yyyymmdd')
       AND old_cycle = v_CYCLE
       AND tran_id =
            (SELECT MAX (tran_id)
                FROM fy_tb_bl_change_cycle
                WHERE cust_id = a.cust_id AND future_eff_date = a.future_eff_date);
                
begin
	DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Patch Change Cycle Process...'); 
	DBMS_OUTPUT.Put_Line('CYCLE='||v_CYCLE||', BILL_DATE='||v_BILL_DATE);
	--查詢出帳狀態 (需為CN才可繼續)
    SELECT status
      INTO CH_STATUS
      FROM fy_tb_bl_bill_cntrl
     WHERE bill_date = TO_DATE (v_BILL_DATE, 'yyyymmdd')
       AND CYCLE = v_CYCLE
       AND create_user = CH_USER;
	DBMS_OUTPUT.Put_Line('CH_STATUS='||CH_STATUS);

	--確認BL fy_tb_bl_change_cycle send_flag筆數
    SELECT COUNT (1)
	  INTO nu_cnt
      FROM fy_tb_bl_change_cycle a
     WHERE old_cycle = v_CYCLE
       AND future_eff_date = TO_DATE (v_BILL_DATE, 'yyyymmdd')
       AND tran_id =
              (SELECT MAX (tran_id)
                 FROM fy_tb_bl_change_cycle
                WHERE cust_id = a.cust_id AND future_eff_date = a.future_eff_date);
	DBMS_OUTPUT.Put_Line('NULL SEND_FLAG COUNT='||TO_CHAR(NU_CNT));
	
	IF CH_STATUS='CN' AND NU_CNT>0 THEN
		for R1 in c1 loop
			begin
				DBMS_OUTPUT.Put_Line('CUST_ID='||TO_CHAR(R1.CUST_ID));
				--確認CUSTOMER啟用早於出帳日
				SELECT COUNT (1)
				  INTO nu_cnt
				  FROM fy_Tb_cm_customer
				 WHERE cust_id = R1.CUST_ID
				   --AND CYCLE = v_CYCLE
				   AND eff_date < TO_DATE (v_BILL_DATE, 'yyyymmdd');
				IF NU_CNT=0 THEN
					RAISE ON_ERR;
				ELSE
					--寫入CM fy_tb_cm_sync_send_pub
					INSERT INTO fy_tb_cm_sync_send_pub
								(trx_id, svc_code, actv_code, entity_type, entity_id, sync_mesg,
								create_date, create_user, update_date, update_user, route_id)
					SELECT fy_sq_cm_trx.NEXTVAL, '9926', 'BLCHANGECYCLECONF', 'C', cust_id,
							remark, SYSDATE, 'MPBL_PATCH', SYSDATE, 'MPBL_PATCH', cust_id
						FROM fy_tb_bl_change_cycle a
						WHERE send_flag IS NULL
						  AND old_cycle = v_CYCLE
						  AND future_eff_date = TO_DATE (v_BILL_DATE, 'yyyymmdd')
						  AND cust_id = R1.CUST_ID
						  AND tran_id =
								(SELECT MAX (tran_id)
									FROM fy_tb_bl_change_cycle
								WHERE cust_id = a.cust_id
									AND future_eff_date = a.future_eff_date);
					DBMS_OUTPUT.Put_Line('INSERT fy_tb_cm_sync_send_pub, CUST_ID='||TO_CHAR(R1.CUST_ID));
					
                    --更新BL fy_tb_bl_account
                    UPDATE fy_tb_bl_account a
                       SET CYCLE =
                              (SELECT new_cycle
                                 FROM fy_tb_bl_change_cycle a
                                WHERE old_cycle = v_CYCLE
                                  AND future_eff_date = TO_DATE (v_BILL_DATE, 'yyyymmdd')
                                  AND cust_id = R1.CUST_ID
                                  AND tran_id =
                                         (SELECT MAX (tran_id)
                                            FROM fy_tb_bl_change_cycle
                                           WHERE cust_id = a.cust_id
                                             AND future_eff_date = a.future_eff_date)),
                           update_date = SYSDATE,
                           update_user = 'MPBL_PATCH'
                     WHERE bl_status = 'OPEN'
                       AND CYCLE = v_CYCLE
                       AND EXISTS (SELECT 1
                                     FROM fy_tb_cm_account b
                                    WHERE b.cust_id = R1.CUST_ID AND a.acct_id = b.acct_id);
					DBMS_OUTPUT.Put_Line('UPDATE fy_tb_bl_account, CUST_ID='||TO_CHAR(R1.CUST_ID));
					
					--更新BL fy_tb_bl_change_cycle
					UPDATE fy_tb_bl_change_cycle a
						SET send_flag = 'Y',
							update_date = SYSDATE,
							update_user = 'MPBL_PATCH'
						WHERE send_flag IS NULL
	                      AND old_cycle = v_CYCLE
                          AND future_eff_date = TO_DATE (v_BILL_DATE, 'yyyymmdd')
                          AND cust_id = R1.CUST_ID
                          AND tran_id =
                                (SELECT MAX (tran_id)
                                    FROM fy_tb_bl_change_cycle
                                    WHERE cust_id = a.cust_id AND future_eff_date = a.future_eff_date);
					DBMS_OUTPUT.Put_Line('UPDATE fy_tb_bl_change_cycle, CUST_ID='||TO_CHAR(R1.CUST_ID));									
                END IF;

            EXCEPTION
                WHEN ON_ERR THEN
                    ERR_CNT := ERR_CNT+1;
                WHEN OTHERS THEN
                    ERR_CNT := ERR_CNT+1;
            END;
        END LOOP;

		--確認BL fy_tb_bl_change_cycle send_flag筆數
        SELECT COUNT (1)
		  INTO nu_cnt
          FROM fy_tb_bl_change_cycle a
         WHERE send_flag IS NULL
           AND old_cycle = v_CYCLE
           AND future_eff_date = TO_DATE (v_BILL_DATE, 'yyyymmdd')
           AND tran_id =
                  (SELECT MAX (tran_id)
                     FROM fy_tb_bl_change_cycle
                    WHERE cust_id = a.cust_id AND future_eff_date = a.future_eff_date);

        DBMS_OUTPUT.Put_Line('ERR_CNT='||TO_CHAR(ERR_CNT)||', NULL SEND_FLAG COUNT='||TO_CHAR(NU_CNT));
        IF ERR_CNT>0 OR NU_CNT>0 THEN
            ROLLBACK;
            DBMS_OUTPUT.Put_Line('Confirm_Patch_Change_Cycle Process RETURN_CODE = 9999');
            DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END Patch Change Cycle Process...');
        ELSE
            COMMIT;
            DBMS_OUTPUT.Put_Line('fy_tb_bl_change_cycle null send_flag count='||TO_CHAR(NU_CNT));
            DBMS_OUTPUT.Put_Line('Confirm_Patch_Change_Cycle Process RETURN_CODE = 0000');
            DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END Patch Change Cycle Process...');
        END IF;
        
    ELSE
        DBMS_OUTPUT.Put_Line('CYCLE NOT FINISHED YET or NO DATA NEED TO PROCESS');
        DBMS_OUTPUT.Put_Line('Confirm_Patch_Change_Cycle Process RETURN_CODE = 0000');
        DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END Patch Change Cycle Process...');
    END IF;

EXCEPTION 
   WHEN OTHERS THEN
      DBMS_OUTPUT.Put_Line('Confirm_Patch_Change_Cycle Process RETURN_CODE = 9999');
      DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||SUBSTR(' END Patch Change Cycle Process... '||SQLERRM,1,250));         
end;
/
exit

```

## MPBL\BL\Confirm\bin\HGB_MPBL_Confirm_STATUS_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Confirm.sh
--# Path : /extsoft/UBL/BL/Confirm/bin
--# SQL name : HGB_UBL_Confirm_STATUS_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_type           VARCHAR2(8)  := '&4';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  NU_CYCLE         NUMBER(2);
  NU_CYCLE_MONTH   NUMBER(2);
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  nu_cnt           number;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number, iacct_group varchar2) IS
     select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_acct_list a,
			fy_tb_bl_bill_acct b
	  where a.bill_seq    =ibill_seq
	    and a.type        =iacct_group
	    and b.bill_seq    =a.bill_seq
	    AND B.CYCLE       =NU_CYCLE
	    AND B.CYCLE_MONTH =NU_CYCLE_MONTH
	    AND B.ACCT_KEY    =MOD(A.ACCT_ID,100)
	    and b.acct_id     =a.acct_id
		and v_PROCESS_NO=999
	  group by b.bill_status
	union
     select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_bill_acct b
	  where b.bill_seq    =ibill_seq
	    AND B.CYCLE       =NU_CYCLE
	    AND B.CYCLE_MONTH =NU_CYCLE_MONTH
	    AND B.ACCT_KEY    =MOD(B.ACCT_ID,100)
	    and b.acct_group =iacct_group
		and v_PROCESS_NO<>999
	  group by b.bill_status;	
begin
  select bill_SEQ, CYCLE, CYCLE_MONTH,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =A.CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','CONF','QA')
                FROM DUAL)                      
         END) ACCT_GROUP
    into nu_bill_seq, NU_CYCLE, NU_CYCLE_MONTH, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and a.cycle=v_CYCLE
   AND A.CREATE_USER=CH_USER;
  if v_PROCESS_NO=999 and v_type='AFTER' THEN 
     SELECT MAX(ACCT_GROUP) 
        INTO CH_ACCT_GROUP
        FROM FY_TB_BL_BILL_PROCESS_LOG A
       WHERE BILL_SEQ   =NU_BILL_SEQ
         AND PROCESS_NO =v_PROCESS_NO
         AND ACCT_GROUP LIKE 'CONF%'
         AND PROC_TYPE  ='B'
         AND STATUS     ='CN'; 
  END IF;       
  nu_cnt := 0; 
  FOR R1 IN C1(nu_bill_seq,CH_ACCT_GROUP) LOOP
      nu_cnt := nu_cnt + r1.cnt;
     DBMS_OUTPUT.Put_Line('Confirm_STATUS_Check Status='||r1.status||', Cnt='||to_char(r1.cnt));  
  end loop; 
  if nu_cnt=0 then
     DBMS_OUTPUT.Put_Line('Confirm_STATUS_Check Process RETURN_CODE = 9999'); 
  end if;	 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Confirm_STATUS_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## MPBL\BL\Confirm\bin\HGB_MPBL_Confirm_STEP_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Confirm.sh
--# Path : /extsoft/UBL/BL/Confirm/bin
--# SQL name : HGB_UBL_Confirm_STEP_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1 IS
     SELECT DECODE(STATUS,'CL','CI',
                   'CI','BI',
                   'BI','MAST',
                   'MAST','CN',
                   'CN','END',STATUS) STEP                            
       FROM FY_TB_BL_BILL_PROCESS_LOG BL 
      WHERE BILL_SEQ  = nu_BILL_SEQ
        AND PROCESS_NO= v_PROCESS_NO
        AND (ACCT_GROUP= CH_ACCT_GROUP OR ACCT_GROUP= 'KEEP')
        AND PROC_TYPE = v_PROC_TYPE
        AND BEGIN_TIME= (SELECT MAX(BEGIN_TIME) from FY_TB_BL_BILL_PROCESS_LOG 
                                           WHERE BILL_SEQ  = BL.BILL_SEQ
                                             AND PROCESS_No= BL.PROCESS_NO
                                             AND ACCT_GROUP= BL.ACCT_GROUP
                                             AND PROC_TYPE = BL.PROC_TYPE)
     order by DECODE(STATUS,'CL',1,'CI',2,'BI',3,'MAST',4,'CN',5,0) DESC; 
     R1     C1%ROWTYPE;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =A.CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and a.cycle=v_CYCLE
   and a.create_user=CH_USER;
  OPEN C1;
  FETCH C1 INTO R1;
  IF C1%NOTFOUND THEN  
     CH_STEP :='CI';
  ELSE
     CH_STEP := R1.STEP;
  END IF;
  CLOSE C1;
  IF CH_STEP NOT IN ('CI','BI','MAST','CN') THEN
     DBMS_OUTPUT.Put_Line('Confirm_STEP_Check Process RETURN_CODE = 9999'); 
  ELSE   
     DBMS_OUTPUT.Put_Line(CH_STEP);
  END IF;   
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Confirm_STEP_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## MPBL\BL\Confirm\bin\HGB_MPBL_Confirm_USED_UP.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Confirm.sh
--# Path : /extsoft/MPBL/BL/Confirm/bin
--# SQL name : HGB_MPBL_Confirm_USED_UP.sql
--#
--# Date : 2021/09/02 Created by Mike Kuan
--# Description : SR233414_��ʸ˸m�I��ú�O�O�wú�M��
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
v_BILL_DATE       VARCHAR2(8)  := '&1';
v_PROCESS_NO      NUMBER(3)    := '&2';
v_CYCLE           NUMBER(2)    := '&3';
NU_CYCLE          NUMBER(2);
CH_BILL_PERIOD    VARCHAR2(6);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ACCT_GROUP     FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
CH_USER           VARCHAR2(8)  :='MPBL';
ch_remark         FY_TB_SYS_SYNC_CNTRL.CONTENT%type;
nu_seq            number;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;
cursor c1(ibill_seq number, icycle number, icycle_month number, iacct_group varchar2) is
   select b.acct_id,
          b.eff_date,
          b.end_date,
          b.offer_id,
          b.offer_instance_id,
          b.offer_level_id subscr_id,
          b.cust_id,
          c.CUST_TYPE
     from fy_tb_bl_acct_pkg_log a,
          fy_tb_bl_acct_pkg b,
          fy_tb_bl_bill_acct al,
          FY_TB_CM_CUSTOMER c
    where a.bill_seq   =ibill_seq
     -- and a.cycle      =icycle
     -- and a.cycle_month=icycle_month
      and a.RECUR_SEQ  =a.bill_seq
      and a.pkg_type_dtl in ('BDX','BDN')
      and a.PREPAYMENT is not null
	  and a.CUST_ID = c.CUST_ID
      and b.acct_pkg_seq=a.acct_pkg_seq
      AND B.ACCT_KEY    =MOD(A.ACCT_ID,100)
      and b.end_date is null
      and b.status      ='CLOSE'
      and al.bill_seq   =a.bill_seq
      AND AL.cycle     =icycle
      and AL.cycle_month=icycle_month
      AND AL.ACCT_KEY   =MOD(A.ACCT_ID,100)
      and al.acct_id    =a.acct_id
      and al.bill_status='CN'
      and nvl(al.CONFIRM_ID,0)<>999
      and ((v_PROCESS_NO<>999 and al.acct_group=Iacct_group) or
           (v_PROCESS_NO=999 and exists  (select 1 from fy_tb_bl_acct_list
                                          where bill_seq=a.bill_seq and type=Iacct_group and acct_id=a.acct_id)
          ));
begin
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS')||':CONFIRM USED_UP BEGIN');
   CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.CYCLE, A.BILL_PERIOD, A.BILL_SEQ, A.CYCLE_MONTH, B.ACCT_GROUP
     INTO NU_CYCLE, CH_BILL_PERIOD, NU_BILL_SEQ, NU_CYCLE_MONTH, CH_ACCT_GROUP
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
	  and b.cycle=v_CYCLE
      AND B.CYCLE     =A.CYCLE
	  AND A.CREATE_USER = CH_USER
      AND B.PROCESS_NO=v_PROCESS_NO;
   IF v_PROCESS_NO=999 THEN
      SELECT MAX(ACCT_GROUP)
        INTO CH_ACCT_GROUP
        FROM FY_TB_BL_BILL_PROCESS_LOG A
       WHERE BILL_SEQ   =NU_BILL_SEQ
         AND PROCESS_NO =v_PROCESS_NO
         AND ACCT_GROUP LIKE 'CONF%'
         AND PROC_TYPE  ='B'
         AND STATUS     ='CN';
   END IF;
   DBMS_OUTPUT.Put_Line('CH_ACCT_GROUP - '||CH_ACCT_GROUP);
   FOR r1 IN c1(nu_bill_seq, nu_cycle, nu_cycle_month, ch_acct_group) LOOP
   DBMS_OUTPUT.Put_Line('r1.subscr_id - '||r1.subscr_id);
   DBMS_OUTPUT.Put_Line('r1.acct_id - '||r1.acct_id);
   DBMS_OUTPUT.Put_Line('r1.offer_id - '||r1.offer_id);
   DBMS_OUTPUT.Put_Line('r1.offer_instance_id - '||r1.offer_instance_id);

      CH_REMARK := '<?xml version="1.0" encoding="UTF-8" ?>'||
          '<TRB_TRX xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'||
              '<HEADER ReqNotf="N" TransactionCode="CM9_OFFER_EXPIRATION_MPBL" PublisherApplID="CM" PublisherApplThreadID="1" IssueDate="'||to_char(r1.eff_date,'yyyy-mm-dd')||'T'||to_char(r1.eff_date,'hh24:mi:ss')|| --2017-12-19T23:59:59
                 '" EffectiveDate="'||to_char(r1.eff_date,'yyyy-mm-dd')||'T'||to_char(r1.eff_date,'hh24:mi:ss')|| --2017-12-19T23:59:59
                 '" RoutingId="'||to_char(r1.subscr_id)|| --345601122
                 '" DistributionType="ALL" BulkTransaction="N" EntityId="'||to_char(r1.subscr_id)|| --345601122
                 '" EntityType="SUBSCRIBER"/>'||
              '<DATA>'||
                  '<CmHeaderTransaction>'||
                      '<TransactionRsn>CREQ</TransactionRsn>'||
                      '<TransactionId>'||to_char(r1.acct_id)||'</TransactionId>'||
                      '<ActivityPath>CM9_OFFER_EXPIRATION_MPBL</ActivityPath>'||
                      '<ActivityPcn xsi:nil="true"/>'||
                      '<WaiveIndicator xsi:nil="true"/>'||
                      '<WaiveReason xsi:nil="true"/>'||
                      '<ActivityGroupId xsi:nil="true"/>'||
                      '<LoadInd></LoadInd>'||
                  '</CmHeaderTransaction>'||
                  '<OfferExpirationInfo>'||
                      '<SubscriberID>'||to_char(r1.subscr_id)||'</SubscriberID>'||
                      '<OfferID>'||to_char(r1.offer_id)||'</OfferID>'||
                      '<ExpirationDate>'||to_char(sysdate,'yyyy-mm-dd')||'T'||to_char(sysdate,'hh24:mi:ss')||'</ExpirationDate>'||
                      '<OfferInstanceId>'||to_char(r1.offer_instance_id)||'</OfferInstanceId>'||
                      '<AgreementID>'||to_char(r1.subscr_id)||'</AgreementID>'||
                      '<OfferLevel>S</OfferLevel>'||
                      '<PaymentCategory>POST</PaymentCategory>'||
                      '<MessageType>Discount Expiration</MessageType>'||
                      '<MessageId>DISC_EXP_001</MessageId>'||
                      '<Entity_Name>FET Bill Discount Expiration</Entity_Name>'||
                  '</OfferExpirationInfo>'||
              '</DATA>'||
          '</TRB_TRX>';
      --
      select fy_sq_cm_trx.nextval
        into nu_seq
        from dual;
      CH_ERR_MSG :='INSERT DATA_SYNC.SUB_ID='||TO_CHAR(R1.SUBSCR_ID)||':';

      INSERT INTO FY_TB_CM_SYNC_SEND_CNTRL
                        (TRX_ID,
                         SVC_CODE,
                         ACTV_CODE,
                         MODULE_ID,
                         SORT,
                         ENTITY_TYPE,
                         ENTITY_ID,
                         HEAD_CONTENT,
                         CREATE_DATE,
                         CREATE_USER,
                         UPDATE_DATE,
                         UPDATE_USER,
                         CONTENT,
                         ROUTE_ID)
                   Values
                        (nu_seq,
                         '29',
                         'CM9_OFFER_EXPIRATION_MPBL',
                         'EMS',
                         1,
                         'S',
                         r1.subscr_id,
                         'TRX_ID='||to_char(nu_seq)||',ACTV_CODE=CM9_OFFER_EXPIRATION_MPBL,BE_ID=110154,SUBSCRIBER_ID='||to_char(r1.subscr_id),
                         sysdate,
                         CH_USER,
                         sysdate,
                         CH_USER,
                         ch_remark,
                         r1.cust_id);

      update fy_tb_bl_bill_acct set CONFIRM_ID=999
                         where bill_seq=nu_bill_seq
                           and acct_id =r1.acct_id;
   commit;
   end loop;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS')||':CONFIRM USED_UP END');
   DBMS_OUTPUT.Put_Line('Confirm_USED_UP Process RETURN_CODE = 0000');
EXCEPTION
    WHEN OTHERS THEN
         ROLLBACK;
         DBMS_OUTPUT.Put_Line('Confirm_USED_UP Process RETURN_CODE = 9999');
END;
/
```

## MPBL\BL\Confirm\bin\HGB_MPBL_Confirm.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_MPBL_Confirm.sh
# Path : /extsoft/MPBL/BL/Confirm/bin
#
# Date : 2021/02/20 Created by Mike Kuan
# Description : SR222460_MPBS migrate to HGB
########################################################################################
# Date : 2021/02/24 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB - add UPDATE_ACCT_LIST
########################################################################################
# Date : 2021/09/02 Created by Mike Kuan
# Description : SR233414_行動裝置險月繳保費預繳專案
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_MPBL_Confirm"
sysdt=`date +%Y%m%d%H%M%S`
BillDate=$1
Cycle=$2
ProcessNo=$3
HomeDir=/extsoft/MPBL/BL
WorkDir=$HomeDir/Confirm/bin
LogDir=$HomeDir/Confirm/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_${progName}.log
AutoWatchFileName=${BillDate}_${progName}.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`

#---------------------------------------------------------------------------------------#
#      FTP
#---------------------------------------------------------------------------------------# 
utilDir="/cb/BCM/util"
ftpProg="${utilDir}/Ftp2Remote.sh"
putip1='10.68.8.37'
putuser1=$OCSID
putpass1=$OCSPWD
putpath1=/cb/AutoWatch/log/joblog

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_MPBL_Confirm_MV_ACCT_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_MV_ACCT.data <<EOF
@HGB_MPBL_Confirm_MV_ACCT_Check.sql $1 $2
EOF`
cat ${LogDir}/${progName}_MV_ACCT.data |read ACCT
echo "MV Acct Count: ${ACCT}" | tee -a ${LogFile}
}

function HGB_MPBL_Confirm_STEP_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STEP.data <<EOF
@HGB_MPBL_Confirm_STEP_Check.sql $1 $2 $3
EOF`
cat ${LogDir}/${progName}_STEP.data |read STEP
echo "Step or Message: ${STEP}" | tee -a ${LogFile}
}

function HGB_MPBL_UPDATE_ACCT_LIST
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_UPDATE_ACCT_LIST.data <<EOF
@HGB_MPBL_UPDATE_ACCT_LIST.sql $1 $2
EOF`
cat ${LogDir}/${progName}_UPDATE_ACCT_LIST.data | tee -a ${LogFile}
}

function HGB_MPBL_Confirm_STATUS_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STATUS.data <<EOF
@HGB_MPBL_Confirm_STATUS_Check.sql $1 $2 $3 $4
EOF`
cat ${LogDir}/${progName}_STATUS.data | tee -a ${LogFile}
}

function HGB_MPBL_Confirm
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_Confirm.sql $1 $2 $3
exit
EOF`
}

function HGB_MPBL_Confirm_OCS_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_OCS_Check.data <<EOF
@HGB_MPBL_Confirm_OCS_Check.sql $1 $2
EOF`
cat ${LogDir}/${progName}_OCS_Check.data |read COUNT
}

function HGB_MPBL_Confirm_DIO_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_DIO_Check.data <<EOF
@HGB_MPBL_Confirm_DIO_Check.sql $1 $2 $3 $4
exit
EOF`
cat ${LogDir}/${progName}_DIO_Check.data | tee -a ${LogFile}
}

function HGB_MPBL_Confirm_Patch_Change_Cycle
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_Patch_Change_Cycle.data <<EOF
@HGB_MPBL_Confirm_Patch_Change_Cycle.sql $1 $2
EOF`
cat ${LogDir}/${progName}_Patch_Change_Cycle.data | tee -a ${LogFile}
}

function HGB_MPBL_Confirm_USED_UP
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_Confirm_USED_UP.sql $1 $2 $3
exit
EOF`
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
   		echo "Send SMS (Failed)" | tee -a $LogFile
		sendSMS 0
		echo "FTP Command: ${ftpProg} ${putip1} ${putuser1} ******** ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0
   fi
   echo "Send Mail (Failed)" | tee -a $LogFile
   sendMail 0
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Succeeded)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
   		echo "Send SMS (Succeeded)" | tee -a $LogFile
		sendSMS 1
		echo "FTP Command: ${ftpProg} ${putip1} ${putuser1} ******** ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0
   fi
   echo "Send Mail (Succeeded)" | tee -a $LogFile
   sendMail 1
fi
exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
tar zcvf ${progName}_${sysdt}.tar.tgz ${progName}_${sysdt}.log
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Normal" -a ${progName}_${sysdt}.tar.tgz ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Succeeded.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
elif [[ $type -eq 2 ]]; then
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Start" ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Start.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Abnormal" -a ${progName}_${sysdt}.tar.tgz ${maillist}  << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
fi
}

function sendSMS
{
type=$1
	errorMessage=" Abnormal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	okMessage=" Normal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	startMessage=" Start! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	smslist=`cat $smsList`
	
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
	${smsProg} "${okMessage}" "${smslist}"
elif [[ $type -eq 2 ]]; then
	${smsProg} "${startMessage}" "${smslist}"
else
	${smsProg} "${errorMessage}" "${smslist}"
fi
}

function sendDelayMail
{
count=$1
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} OCS_Confirm執行時間已達${count}分鐘" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} Bill_Date:${BillDate} CYCLE:${Cycle} OCS_Confirm執行時間已達${count}分鐘，請確認是否正常.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
}

function sendDelaySMS
{
count=$1
	Message=" Warning! OCS_Confirm runtime over <${count}> minutes ${BillDate} <${Cycle}> ${progName}"
	smslist=`cat $smsList`

	${smsProg} "${Message}" "${smslist}"
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BILL_DATE> <CYCLE> <PROCESS_NO> "
	echo ""
    echo "For PROD example: $0 20210301 50 001"
    echo "For PROD example: $0 20210303 51 001"
    echo "For PROD example: $0 20210305 52 001"
    echo "For PROD example: $0 20210308 53 001"
    echo "For PROD example: $0 20210311 54 001"
    echo "For PROD example: $0 20210314 55 001"
    echo "For PROD example: $0 20210317 56 001"
    echo "For PROD example: $0 20210220 57 001"
    echo "For PROD example: $0 20210223 58 001"
    echo "For PROD example: $0 20210225 59 001"
	echo "For PROD example: $0 20210227 60 001"
    echo "For HOLD example: $0 20210301 50 999"
    echo "For HOLD example: $0 20210303 51 999"
    echo "For HOLD example: $0 20210305 52 999"
    echo "For HOLD example: $0 20210308 53 999"
    echo "For HOLD example: $0 20210311 54 999"
    echo "For HOLD example: $0 20210314 55 999"
    echo "For HOLD example: $0 20210317 56 999"
    echo "For HOLD example: $0 20210220 57 999"
    echo "For HOLD example: $0 20210223 58 999"
    echo "For HOLD example: $0 20210225 59 999"
	echo "For HOLD example: $0 20210227 60 999"
	echo ""
}

if [[ $# -lt 3 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_DATE : ${BillDate}" | tee -a $LogFile
echo "CYCLE : ${Cycle}" | tee -a $LogFile
echo "PROCESS_NO : ${ProcessNo}" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $DB = "HGBBL" ]]; then
	echo "Send SMS (Start)" | tee -a $LogFile
	sendSMS 2
	Pause
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
else
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
fi

cd ${WorkDir}
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Confirm MV ACCT Check
if [[ ${ProcessNo} -ne 999 ]]; then
	echo "----->>>>>-----Step 888. Run Confirm MV ACCT Check Process (Start...)" | tee -a $LogFile
	HGB_MPBL_Confirm_MV_ACCT_Check $BillDate $Cycle
	checkcode=`cat ${LogDir}/${progName}_MV_ACCT.data|grep -E 'ORA|ora|Confirm_MV_ACCT_Check Process RETURN_CODE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 888. Run Confirm MV ACCT Check Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
	if [[ ${ACCT}-${ACCT} -ne 0 ]]; then
		echo "-----<<<<<-----Step 888. Run Confirm MV ACCT Check Process (End...Get MV Acct Count Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
	echo "-----<<<<<-----Step 888. Run Confirm MV ACCT Check Process (End... Succeeded)" | tee -a $LogFile
fi
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Confirm Step Check
echo "----->>>>>-----Step 0. Run Confirm Step Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_Confirm_STEP_Check $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_STEP.data|grep -E 'ORA|ora|Confirm_STEP_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 0. Run Confirm Step Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 0. Run Confirm Step Check Process (End... Succeeded)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行UPDATE ACCT LIST
if [[ $ProcessNo -eq 999 ]]; then
	echo "----->>>>>-----Step 1. Run UPDATE ACCT LIST Process (Start...)" | tee -a $LogFile
	HGB_MPBL_UPDATE_ACCT_LIST $BillDate $Cycle
	checkcode=`cat ${LogDir}/${progName}_UPDATE_ACCT_LIST.data|grep -E 'ORA|ora|update FY_TB_BL_ACCT_LIST.TYPE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
	echo "-----<<<<<-----Step 1. Run UPDATE ACCT LIST Process (End...Failed)" | tee -a $LogFile
	AutoWatch 1
	fi
	echo "-----<<<<<-----Step 1. Run UPDATE ACCT LIST Process (End... Succeeded)" | tee -a $LogFile
fi
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Confirm STATUS Check
echo "----->>>>>-----Step 2. Run Confirm STATUS Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_Confirm_STATUS_Check $BillDate $Cycle $ProcessNo BEFORE
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Confirm_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 2. Run Confirm STATUS Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 2. Run Confirm STATUS Check Process (End... Succeeded)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
if [[ ${STEP} == 'CN' ]]; then
#------------執行Confirm
	if [[ $DB = "HGBBL" ]]; then
	run_cnt=0
	mod_cnt=1
	checkdone=0
	checkerror=0
	checkwait=0
		while [ $checkdone -eq 0 ] 
		do
			echo "----->>>>>-----Step 3. Run Confirm OCS Check Process (Start...)" | tee -a $LogFile
			HGB_MPBL_Confirm_OCS_Check $BillDate $Cycle
			sleep 60
			(( run_cnt++ ))
			mod_cnt=`expr $run_cnt % 60`
			checkdone=`cat ${LogDir}/${progName}_OCS_Check.data|grep 'Confirm_OCS_Check Process RETURN_CODE = 0000'|wc -l`
			checkerror=`cat ${LogDir}/${progName}_OCS_Check.data|grep -E 'ORA|ora|Confirm_OCS_Check Process RETURN_CODE = 9999'|wc -l`
			checkwait=`cat ${LogDir}/${progName}_OCS_Check.data|grep 'Confirm_OCS_Check Processing'|wc -l`
				if [[ $mod_cnt -eq 0 ]]; then
					echo "Run Count : $run_cnt" | tee -a $LogFile
					echo "!!!please check Confirm OCS Status!!!" | tee -a $LogFile
					echo "-----<<<<<-----Step 3. Run Confirm OCS Check `expr $run_cnt / 60`hours (Need to Check...)" | tee -a $LogFile
					sendDelayMail $run_cnt
					sendDelaySMS $run_cnt
				fi
				
				if  [[ $checkerror -ge 1 ]]; then
					echo "Error Count : $checkerror" | tee -a $LogFile
					echo "-----<<<<<-----Step 3. Run Confirm OCS Check Process (End...Failed)" | tee -a $LogFile
					AutoWatch 1
				elif [[ $checkwait -eq 1 ]]; then
					echo "Run Count : $run_cnt" | tee -a $LogFile
					echo "-----<<<<<-----Step 3. Run Confirm OCS Check Processing" | tee -a $LogFile
					Pause
				else
					echo "Run Count : $run_cnt" | tee -a $LogFile
					echo "Done Count : $checkdone" | tee -a $LogFile
					echo "Error Count : $checkerror" | tee -a $LogFile
					echo "Wait Count : $checkwait" | tee -a $LogFile
					echo "-----<<<<<-----Step 3. Run Confirm OCS Check Process (End...Succeeded)" | tee -a $LogFile
					Pause
				fi
		done
	else
		echo "----->>>>>-----Step 3. Run Confirm OCS Check Process (TEST ENV PASS...)" | tee -a $LogFile
	fi
	
	echo "----->>>>>-----Step 4. Run Confirm Process (Start...)" | tee -a $LogFile
	Pause
	HGB_MPBL_Confirm $BillDate $Cycle $ProcessNo
	checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Confirm Process RETURN_CODE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 4. Run Confirm Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	else
		echo "waiting for 60 seconds before check DIO status" | tee -a $LogFile
		run_cnt=0
		mod_cnt=1
		checkdone=0
		checkerror=0
		checkwait=0
			while [ $checkdone -eq 0 ] 
			do
				echo "----->>>>>-----Step 5. Run Confirm DIO Check MPCONFIRM Process (Start...)" | tee -a $LogFile
				HGB_MPBL_Confirm_DIO_Check $BillDate $Cycle MPCONFIRM $ProcessNo
				sleep 60
				(( run_cnt++ ))
				mod_cnt=`expr $run_cnt % 60`
				checkdone=`cat ${LogDir}/${progName}_DIO_Check.data|grep 'Confirm_DIO_Check MPCONFIRM Process RETURN_CODE = 0000'|wc -l`
				checkerror=`cat ${LogDir}/${progName}_DIO_Check.data|grep -E 'ORA|ora|Confirm_DIO_Check MPCONFIRM Process RETURN_CODE = 9999'|wc -l`
				checkwait=`cat ${LogDir}/${progName}_DIO_Check.data|grep 'Confirm_DIO_Check MPCONFIRM Processing'|wc -l`
					if [[ $mod_cnt -eq 0 ]]; then
						echo "Run Count : $run_cnt" | tee -a $LogFile
						echo "!!!please check Confirm DIO MPCONFIRM status!!!" | tee -a $LogFile
						echo "----->>>>>-----Step 5. Run Confirm DIO Check MPCONFIRM Processed `expr $run_cnt / 60`hours (Need to Check...)" | tee -a $LogFile
						sendDelayMail $run_cnt
						if [[ $DB = "HGBBL" ]]; then
							sendDelaySMS $run_cnt
						fi
					fi
					
					if  [[ $checkerror -ge 1 ]]; then
						echo "Error Count : $checkerror" | tee -a $LogFile
						echo "-----<<<<<-----Step 4. Run Confirm Process (End...Failed)" | tee -a $LogFile
						echo "-----<<<<<-----Step 5. Run Confirm DIO Check MPCONFIRM Process (End... Failed)" | tee -a $LogFile
						AutoWatch 1
					elif [[ $checkwait -eq 1 ]]; then
						echo "Run Count : $run_cnt" | tee -a $LogFile
						echo "-----<<<<<-----Step 5. Run Confirm DIO Check MPCONFIRM Processing" | tee -a $LogFile
						Pause
					else
						echo "Run Count : $run_cnt" | tee -a $LogFile
						echo "Done Count : $checkdone" | tee -a $LogFile
						echo "Error Count : $checkerror" | tee -a $LogFile
						echo "Wait Count : $checkwait" | tee -a $LogFile
						echo "-----<<<<<-----Step 5. Run Confirm DIO Check MPCONFIRM Process (End... Succeeded)" | tee -a $LogFile
						Pause
					fi
			done
		echo "-----<<<<<-----Step 4. Run Confirm Process (End... Succeeded)" | tee -a $LogFile
		Pause
		echo "----->>>>>-----Step 6. Run Confirm_USED_UP Process (Start...)" | tee -a $LogFile
		HGB_MPBL_Confirm_USED_UP $BillDate $ProcessNo $Cycle
		checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Confirm_USED_UP Process RETURN_CODE = 9999'|wc -l`
		if [[ $checkcode -eq 1 ]]; then
			echo "-----<<<<<-----Step 6. Run Confirm_USED_UP Process (End...Failed)" | tee -a $LogFile
			AutoWatch 1
		else
			echo "-----<<<<<-----Step 6. Run Confirm_USED_UP Process (End...Successed)" | tee -a $LogFile
		fi
	fi

	if [[ ${ProcessNo} -ne 999 ]]; then
		if [[ ${ACCT} -ge 1 ]]; then #確認MV ACCT待confirm筆數
			echo "----->>>>>-----Step 7. Run MV Confirm Process (Start...)" | tee -a $LogFile
			Pause
			HGB_MPBL_Confirm $BillDate $Cycle 888
			checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Confirm Process RETURN_CODE = 9999'|wc -l`
			if [[ $checkcode -ge 1 ]]; then
				echo "-----<<<<<-----Step 7. Run MV Confirm Process (End...Failed)" | tee -a $LogFile
				AutoWatch 1
			else
				echo "waiting for 60 seconds before check DIO status" | tee -a $LogFile
				run_cnt=0
				mod_cnt=1
				checkdone=0
				checkerror=0
				checkwait=0
					while [ $checkdone -eq 0 ] 
					do
						echo "----->>>>>-----Step 8. Run MV Confirm DIO Check MPCONFIRM Process (Start...)" | tee -a $LogFile
						HGB_MPBL_Confirm_DIO_Check $BillDate $Cycle MPCONFIRM 888
						sleep 60
						(( run_cnt++ ))
						mod_cnt=`expr $run_cnt % 60`
						checkdone=`cat ${LogDir}/${progName}_DIO_Check.data|grep 'Confirm_DIO_Check MPCONFIRM Process RETURN_CODE = 0000'|wc -l`
						checkerror=`cat ${LogDir}/${progName}_DIO_Check.data|grep -E 'ORA|ora|Confirm_DIO_Check MPCONFIRM Process RETURN_CODE = 9999'|wc -l`
						checkwait=`cat ${LogDir}/${progName}_DIO_Check.data|grep 'Confirm_DIO_Check MPCONFIRM Processing'|wc -l`
							if [[ $mod_cnt -eq 0 ]]; then
								echo "Run Count : $run_cnt" | tee -a $LogFile
								echo "!!!please check Confirm DIO MPCONFIRM status!!!" | tee -a $LogFile
								echo "----->>>>>-----Step 8. Run MV Confirm DIO Check MPCONFIRM Processed `expr $run_cnt / 60`hours (Need to Check...)" | tee -a $LogFile
								sendDelayMail $run_cnt
								if [[ $DB = "HGBBL" ]]; then
									sendDelaySMS $run_cnt
								fi
							fi
							
							if  [[ $checkerror -ge 1 ]]; then
								echo "Error Count : $checkerror" | tee -a $LogFile
								echo "-----<<<<<-----Step 7. Run MV Confirm Process (End...Failed)" | tee -a $LogFile
								echo "-----<<<<<-----Step 8. Run MV Confirm DIO Check MPCONFIRM Process (End... Failed)" | tee -a $LogFile
								AutoWatch 1
							elif [[ $checkwait -eq 1 ]]; then
								echo "Run Count : $run_cnt" | tee -a $LogFile
								echo "-----<<<<<-----Step 8. Run MV Confirm DIO Check MPCONFIRM Processing" | tee -a $LogFile
								Pause
							else
								echo "Run Count : $run_cnt" | tee -a $LogFile
								echo "Done Count : $checkdone" | tee -a $LogFile
								echo "Error Count : $checkerror" | tee -a $LogFile
								echo "Wait Count : $checkwait" | tee -a $LogFile
								echo "-----<<<<<-----Step 8. Run MV Confirm DIO Check MPCONFIRM Process (End... Succeeded)" | tee -a $LogFile
								Pause
							fi
					done		
				echo "-----<<<<<-----Step 7. Run MV Confirm Process (End... Succeeded)" | tee -a $LogFile
				Pause
				echo "----->>>>>-----Step 9. Run Confirm_USED_UP Process (Start...)" | tee -a $LogFile
				HGB_MPBL_Confirm_USED_UP $BillDate 888 $Cycle
				checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Confirm_USED_UP Process RETURN_CODE = 9999'|wc -l`
				if [[ $checkcode -eq 1 ]]; then
					echo "-----<<<<<-----Step 9. Run Confirm_USED_UP Process (End...Failed)" | tee -a $LogFile
					AutoWatch 1
				else
					echo "-----<<<<<-----Step 9. Run Confirm_USED_UP Process (End...Successed)" | tee -a $LogFile
				fi
			fi
		else
			echo "MV ACCT is : ${ACCT}" | tee -a $LogFile
		fi
	fi
else
	echo "Confirm Status not in ('CN')" | tee -a $LogFile
fi		
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Confirm STATUS Check
echo "----->>>>>-----Step 10. Run Confirm STATUS Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_Confirm_STATUS_Check $BillDate $Cycle $ProcessNo AFTER
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Confirm_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 10. Run Confirm STATUS Check Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
echo "-----<<<<<-----Step 10. Run Confirm STATUS Check Process (End... Succeeded)" | tee -a $LogFile
Pause
echo "----->>>>>-----Step 11. Run Confirm MV STATUS Check Process (Start...)" | tee -a $LogFile
if [[ ${ACCT} -ge 1 ]]; then #確認MV ACCT已confirm狀態
HGB_MPBL_Confirm_STATUS_Check $BillDate $Cycle 888 AFTER
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Confirm_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 11. Run Confirm MV STATUS Check Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
echo "-----<<<<<-----Step 11. Run Confirm MV STATUS Check Process (End... Succeeded)" | tee -a $LogFile
fi
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Patch Change Cycle
echo "----->>>>>-----Step 12. Run Confirm Patch Change Cycle Process (Start...)" | tee -a $LogFile
HGB_MPBL_Confirm_Patch_Change_Cycle $BillDate $Cycle
checkcode=`cat ${LogDir}/${progName}_Patch_Change_Cycle.data|grep -E 'ORA|ora|Confirm_Patch_Change_Cycle Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 12. Run Confirm Patch Change Cycle Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 12. Run Confirm Patch Change Cycle Process (End... Succeeded)" | tee -a $LogFile

AutoWatch 0

```

## MPBL\BL\Confirm\bin\HGB_MPBL_Confirm.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Confirm.sh
--# Path : /extsoft/UBL/BL/Confirm/bin
--# SQL name : HGB_UBL_Confirm.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE       VARCHAR2(8)  := '&1';
v_CYCLE           NUMBER(2)    := '&2';
v_PROCESS_NO      NUMBER(3)    := '&3';
CH_USER           VARCHAR2(8)  := 'MPBL';
NU_CYCLE          NUMBER(2);
CH_BILL_PERIOD    VARCHAR2(6);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ACCT_GROUP     FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;
begin 
   CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.CYCLE, A.BILL_PERIOD, A.BILL_SEQ, A.CYCLE_MONTH, B.ACCT_GROUP
     INTO NU_CYCLE, CH_BILL_PERIOD, NU_BILL_SEQ, NU_CYCLE_MONTH, CH_ACCT_GROUP
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
	  AND A.CREATE_USER=CH_USER
	  --AND A.CREATE_USER=B.CREATE_USER
	  AND b.cycle =v_CYCLE
      AND B.CYCLE     =A.CYCLE
      AND B.PROCESS_NO=v_PROCESS_NO;
   --999�B�z
	 IF v_PROCESS_NO=999 THEN 
      SELECT MAX(ACCT_GROUP) 
        INTO CH_ACCT_GROUP
        FROM FY_TB_BL_BILL_PROCESS_LOG A
       WHERE BILL_SEQ   =NU_BILL_SEQ
         AND PROCESS_NO =v_PROCESS_NO
         AND ACCT_GROUP LIKE 'CONF%'
         AND PROC_TYPE  ='B'
         AND STATUS     ='CN';
      IF CH_ACCT_GROUP IS NULL THEN
         CH_ACCT_GROUP := 'CONF1';
      ELSE
         CH_ACCT_GROUP := 'CONF'||(TO_NUMBER(SUBSTR(CH_ACCT_GROUP,-1))+1);
      END IF; 
      INSERT INTO FY_TB_BL_BILL_PROCESS_LOG
                      (BILL_SEQ,
                       PROCESS_NO,
                       ACCT_GROUP,
                       PROC_TYPE,
                       STATUS,
                       FILE_REPLY,
                       BEGIN_TIME,
                       END_TIME,
                       CURRECT_ACCT_ID,
                       COUNT,
                       CREATE_DATE,
                       CREATE_USER,
                       UPDATE_DATE,
                       UPDATE_USER)
                SELECT BILL_SEQ,
                       PROCESS_NO,
                       CH_ACCT_GROUP,
                       PROC_TYPE,
                       STATUS,
                       FILE_REPLY,
                       BEGIN_TIME,
                       END_TIME,
                       CURRECT_ACCT_ID,
                       COUNT,
                       CREATE_DATE,
                       CREATE_USER,
                       UPDATE_DATE,
                       UPDATE_USER
                  FROM FY_TB_BL_BILL_PROCESS_LOG
                 WHERE BILL_SEQ   =NU_BILL_SEQ
                   AND PROCESS_NO =v_PROCESS_NO
                   AND (ACCT_GROUP = 'HOLD' OR ACCT_GROUP = 'KEEP')
                   AND PROC_TYPE  ='B'
				   AND ROWNUM <=3
				   ORDER BY begin_time DESC;
      UPDATE FY_TB_BL_ACCT_LIST SET TYPE=CH_ACCT_GROUP
                          WHERE BILL_SEQ =NU_BILL_SEQ
                            AND TYPE     ='CONF';       
   COMMIT;
   END IF;     
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS')||':CONFIRM BEGIN');
   FY_PG_BL_BILL_CONFIRM.MAIN(NU_BILL_SEQ,
                              v_PROCESS_NO,
                              CH_ACCT_GROUP,
                              'B',
                              CH_USER, 
                              CH_ERR_CDE, 
                              CH_ERR_MSG); 
   IF CH_ERR_CDE<>'0000' THEN
      CH_ERR_MSG := 'FY_PG_BL_BILL_CONFIRM:'||CH_ERR_MSG;
      RAISE ON_ERR;
   END IF;                         
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS')||':CONFIRM END');                      
           DBMS_OUTPUT.Put_Line(CH_ERR_CDE||CH_ERR_MSG);  
EXCEPTION 
   WHEN ON_ERR THEN
       DBMS_OUTPUT.Put_Line('Confirm Process RETURN_CODE = 9999');
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Confirm Process RETURN_CODE = 9999');
end;
/

exit;

```

## MPBL\BL\Confirm\bin\HGB_MPBL_UPDATE_ACCT_LIST.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Undo.sh
--# Program name : HGB_MPBL_Confirm.sh
--# Path : /extsoft/MPBL/BL/Undo/bin
--# Path : /extsoft/MPBL/BL/Confirm/bin
--# SQL name : HGB_MPBL_UPDATE_ACCT_LIST.sql
--#
--# Date : 2021/02/19 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE       VARCHAR2(8)  := '&1';
v_CYCLE           NUMBER(2)    := '&2';
v_PROCESS_NO      NUMBER(3)    := '999';
CH_USER           VARCHAR2(8)  := 'MPBL';
CH_BILL_DAY       VARCHAR2(2);
CH_HOLD_TABLE     VARCHAR2(30);
v_SQL1             VARCHAR2(1000);
v_SQL2            VARCHAR2(1000);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;

  CURSOR C1(ibill_seq number) IS
	SELECT h.hold_count, c.confirm_count, ced.confirmed_count
	FROM (SELECT COUNT (1) hold_count
			FROM fy_tb_bl_acct_list
			WHERE bill_seq = ibill_seq AND TYPE = 'HOLD') h,
		(SELECT COUNT (1) confirm_count
			FROM fy_tb_bl_acct_list
			WHERE bill_seq = ibill_seq AND TYPE = 'CONF') c,
		(SELECT COUNT (1) confirmed_count
			FROM fy_tb_bl_acct_list
			WHERE bill_seq = ibill_seq
			AND TYPE LIKE 'CONF%'
			AND TYPE NOT IN ('HOLD', 'CONF')) ced;
		
begin 
   CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.BILL_SEQ, A.CYCLE_MONTH, substr(to_char(A.BILL_DATE,'yyyymmdd'),7,8) BILL_DAY
     INTO NU_BILL_SEQ, NU_CYCLE_MONTH, CH_BILL_DAY
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
	  AND A.CREATE_USER=CH_USER
	  AND A.CYCLE=v_CYCLE
      AND B.CYCLE=A.CYCLE
      AND B.PROCESS_NO=v_PROCESS_NO;
   DBMS_OUTPUT.Put_Line('BILL_SEQ = '||NU_BILL_SEQ||' , CYCLE_MONTH = '||NU_CYCLE_MONTH||' , BILL_DAY = '||CH_BILL_DAY);

CH_HOLD_TABLE:='M'||CH_BILL_DAY||'_HOLD_LIST@prdappc.prdcm';
   DBMS_OUTPUT.Put_Line('OCS HOLD TABLE = '||CH_HOLD_TABLE);
   
--dynamic SQL update HGB_MPBL acct_list from OCS hold_list
   DBMS_OUTPUT.Put_Line('start update FY_TB_BL_ACCT_LIST.TYPE from HOLD to CONF');
   v_SQL1:='update fy_tb_bl_acct_list a set TYPE = ''CONF'''
            || ' WHERE TYPE = ''HOLD'''
            || '   AND NOT EXISTS ('
			|| ' SELECT 1 FROM ' ||CH_HOLD_TABLE
			|| ' WHERE a.acct_id = account_no AND a.bill_seq = cycle_seq_no '
			|| ' AND a.CYCLE = cycle_code)'
            || ' AND a.bill_seq = '||NU_BILL_SEQ;
   DBMS_OUTPUT.Put_Line('start update FY_TB_BL_ACCT_LIST.TYPE from CONF to HOLD');		
   v_SQL2:='update fy_tb_bl_acct_list a set TYPE = ''HOLD'''
            || ' WHERE TYPE = ''CONF'''
            || '   AND EXISTS ('
			|| ' SELECT 1 FROM ' ||CH_HOLD_TABLE
			|| ' WHERE a.acct_id = account_no AND a.bill_seq = cycle_seq_no '
			|| ' AND a.CYCLE = cycle_code)'
            || ' AND a.bill_seq = '||NU_BILL_SEQ;
			
execute immediate v_SQL1;
   DBMS_OUTPUT.Put_Line('end update FY_TB_BL_ACCT_LIST.TYPE from HOLD to CONF');
execute immediate v_SQL2;
   DBMS_OUTPUT.Put_Line('end update FY_TB_BL_ACCT_LIST.TYPE from CONF to HOLD');
COMMIT;

FOR R1 IN C1(nu_bill_seq) LOOP
   DBMS_OUTPUT.Put_Line('updated FY_TB_BL_ACCT_LIST.TYPE, HOLD_COUNT='||to_char(r1.hold_count)||' ,CONFIRM_COUNT='||to_char(r1.confirm_count)||' ,CONFIRMED_COUNT='||to_char(r1.confirmed_count));
       DBMS_OUTPUT.Put_Line('update FY_TB_BL_ACCT_LIST.TYPE = 0000'); 
end loop; 

EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line(CH_ERR_MSG||'update FY_TB_BL_ACCT_LIST.TYPE = 9999'); 
end;
/

exit;

```

## MPBL\BL\CutDate\bin\HGB_MPBL_CutDate_AR.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_CutDate.sh
--# SQL name : HGB_MPBL_CutDate_Pre.sql
--# Path : /extsoft/MPBL/BL/CutDate/bin
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare 
	v_BILL_DATE         VARCHAR2(8)   := '&1'; 
	v_CYCLE             NUMBER(2)     := '&2';
	v_USER              VARCHAR2(8)   := 'MPBL'; 
	NU_CNT              NUMBER        := 0;
	NU_BILL_SEQ         NUMBER;
	NU_BILL_FROM_DATE   DATE;
	NU_BILL_END_DATE    DATE;
begin
--Check Cycle Information
DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Check Cycle Information Process...'||v_BILL_DATE||' cycle:'||v_CYCLE); 
	SELECT cycle_seq_no, TRUNC (start_date), TRUNC (end_date)
	INTO nu_bill_seq, nu_bill_from_date, nu_bill_end_date
	FROM bl1_cycle_control
	WHERE end_date = TO_DATE (v_bill_date, 'yyyymmdd') - 1
		AND cycle_code = v_cycle;
DBMS_OUTPUT.Put_Line('BILL_SEQ='||NU_BILL_SEQ||', NU_BILL_FROM_DATE='||NU_BILL_FROM_DATE||', NU_BILL_END_DATE='||NU_BILL_END_DATE); 
DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END Check Cycle Information Process...'); 

--Query
DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Query Table Process...'); 
	SELECT COUNT (1)
	INTO nu_cnt
	FROM fet1_transaction_log_mpbl
	WHERE bill_seq = nu_bill_seq;
DBMS_OUTPUT.Put_Line('NU_CNT='||NU_CNT);
DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END Query Table Process...'); 

--Delete
if NU_CNT > 0 then
	DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Delete Table Process...'); 
		DELETE fet1_transaction_log_mpbl WHERE bill_seq = nu_bill_seq;
		COMMIT;
	DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END Delete Table Process...'); 
	
	--Insert
	DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Insert Table Process...'); 
		INSERT INTO fet1_transaction_log_mpbl VALUE
					(period_key, bill_seq, TRANS_TYPE, TRANS_DATE, account_id, create_date, create_user)
		SELECT   a.period_key, NU_BILL_SEQ , TRANS_TYPE, TRANS_DATE, account_id , SYSDATE , v_USER
			FROM fet1_transaction_log a
		WHERE (   a.period_key =
						TO_NUMBER (TO_CHAR (NU_BILL_FROM_DATE, 'YYYYMM'))
				OR a.period_key =
						TO_NUMBER (TO_CHAR (NU_BILL_END_DATE, 'YYYYMM'))
				)
			AND a.trans_date >= NU_BILL_FROM_DATE
			AND a.trans_date <= NU_BILL_END_DATE
			AND a.trans_type NOT IN ('WO', 'WOR', 'INV')
			AND a.account_id < 990000000;
		commit;
	DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END Insert Table Process...'); 
else
	--Insert
	DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Insert Table Process...'); 
		INSERT INTO fet1_transaction_log_mpbl VALUE
					(period_key, bill_seq, TRANS_TYPE, TRANS_DATE, account_id, create_date, create_user)
		SELECT   a.period_key, NU_BILL_SEQ , TRANS_TYPE, TRANS_DATE, account_id , SYSDATE , v_USER
			FROM fet1_transaction_log a
		WHERE (   a.period_key =
						TO_NUMBER (TO_CHAR (NU_BILL_FROM_DATE, 'YYYYMM'))
				OR a.period_key =
						TO_NUMBER (TO_CHAR (NU_BILL_END_DATE, 'YYYYMM'))
				)
			AND a.trans_date >= NU_BILL_FROM_DATE
			AND a.trans_date <= NU_BILL_END_DATE
			AND a.trans_type NOT IN ('WO', 'WOR', 'INV')
			AND a.account_id < 990000000;
		commit;
	DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END Insert Table Process...'); 
end if;

--Query
DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Query Table Process...'); 
	SELECT COUNT (1)
	INTO nu_cnt
	FROM fet1_transaction_log_mpbl
	WHERE bill_seq = nu_bill_seq;
 DBMS_OUTPUT.Put_Line('NU_CNT='||NU_CNT);
DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END Query Table Process...'); 

   --IF NU_CNT!=0 THEN
   --   DBMS_OUTPUT.Put_Line('Create_AR_Table Process RETURN_CODE = 0000'||NULL);
   --ELSE
   --   DBMS_OUTPUT.Put_Line('Create_AR_Table Process RETURN_CODE = 9999'||' Warning... ROW_CNT = '||TO_CHAR(NU_CNT)); 
   --END IF;                                                                               
EXCEPTION 
   WHEN OTHERS THEN
      DBMS_OUTPUT.Put_Line('Create_AR_Table Process RETURN_CODE = 9999');
      DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||SUBSTR(' END Check DataSync Process... '||SQLERRM,1,250)); 
end;
/

```

## MPBL\BL\CutDate\bin\HGB_MPBL_CutDate_Fix_Change_Cycle.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_CutDate.sh
--# SQL name : HGB_MPBL_CutDate_Fix_Change_Cycle.sql
--# Path : /extsoft/MPBL/BL/CutDate/bin
--#
--# Date : 2020/11/19 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB_Fix_Change_Cycle時間差
--########################################################################################
--# Date : 2023/04/17 Modify by Mike Kuan
--# Description : SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare 
   v_CYCLE              NUMBER(2)    := '&1';
   CH_BILL_DATE         VARCHAR2(8);
   CH_NEXT_BILL_DATE    VARCHAR2(8);
   NU_CNT               NUMBER;
   NU_OLD_CNT           NUMBER;
   NU_NEW_CNT           NUMBER;
   CH_USER              VARCHAR2(8)  := 'MPBL';
   CH_ERR_MSG           VARCHAR2(300);
   ON_ERR               EXCEPTION;
   
   CURSOR c1(iBILL_DATE VARCHAR2, iNEXT_BILL_DATE VARCHAR2) IS
    SELECT b.cust_id
      FROM fy_tb_cm_customer a, fy_tb_bl_change_cycle b
     WHERE a.CYCLE = b.old_cycle
       AND a.new_cycle = b.new_cycle
       AND a.CYCLE = v_CYCLE
       AND a.cust_id = b.cust_id
       AND a.new_cycle IS NOT NULL
       AND a.cust_type NOT IN ('N', 'D', 'P') --SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
       AND TRUNC (a.update_cycle_date) >= to_date(iBILL_DATE,'yyyymmdd')
	   AND TRUNC (a.update_cycle_date) < to_date(iNEXT_BILL_DATE,'yyyymmdd')
       AND TRUNC (b.future_eff_date) = to_date(iBILL_DATE,'yyyymmdd');
  
BEGIN
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Fix_Change_Cycle Process...'); 
   CH_ERR_MSG := 'GET CYCLE='||v_CYCLE||':';
   SELECT to_char(add_months(LBC_DATE+1,1),'yyyymmdd') BILL_DATE, to_char(add_months(LBC_DATE+1,2),'yyyymmdd') NEXT_BILL_DATE
     INTO CH_BILL_DATE, CH_NEXT_BILL_DATE
     FROM FY_TB_BL_CYCLE
    WHERE currect_period IS NOT NULL
      AND cycle = v_CYCLE
      AND CREATE_USER = CH_USER;

	FOR R1 IN C1(CH_BILL_DATE, CH_NEXT_BILL_DATE) LOOP
		BEGIN
	    DBMS_OUTPUT.Put_Line('BILL_DATE='||to_date(CH_BILL_DATE,'yyyy/mm/dd')||'; NEXT_BILL_DATE='||to_date(CH_NEXT_BILL_DATE,'yyyy/mm/dd')||'; CYCLE='||v_CYCLE||'; CUST_ID='||R1.CUST_ID);
            CH_ERR_MSG := 'COUNTING FY_TB_BL_CUST_CYCLE.OLD_CYCLE';
            SELECT COUNT(1)
              INTO NU_OLD_CNT
              FROM fy_tb_bl_cust_cycle
             WHERE cust_id = R1.CUST_ID
               AND CYCLE = v_CYCLE
               AND end_date = TO_DATE (CH_BILL_DATE, 'yyyymmdd');
            CH_ERR_MSG := 'COUNTING FY_TB_BL_CUST_CYCLE.NEW_CYCLE';
            SELECT COUNT(1)
              INTO NU_NEW_CNT
              FROM fy_tb_bl_cust_cycle
             WHERE cust_id = R1.CUST_ID
               AND CYCLE != v_CYCLE
               AND eff_date = TO_DATE (CH_BILL_DATE, 'yyyymmdd');
               
            IF NU_OLD_CNT!=1 OR NU_NEW_CNT!=1 THEN
                RAISE ON_ERR;
            ELSE
                CH_ERR_MSG := 'UPDATE FY_TB_BL_CUST_CYCLE.OLD_CYCLE';
                UPDATE fy_tb_bl_cust_cycle
                   SET end_date = TO_DATE (CH_NEXT_BILL_DATE, 'yyyymmdd')
                 WHERE cust_id = R1.CUST_ID
                   AND CYCLE = v_CYCLE
                   AND end_date = TO_DATE (CH_BILL_DATE, 'yyyymmdd');
                CH_ERR_MSG := 'UPDATE FY_TB_BL_CUST_CYCLE.NEW_CYCLE';
                UPDATE fy_tb_bl_cust_cycle
                   SET eff_date = TO_DATE (CH_NEXT_BILL_DATE, 'yyyymmdd')
                 WHERE cust_id = R1.CUST_ID
                   AND CYCLE != v_CYCLE
                   AND eff_date = TO_DATE (CH_BILL_DATE, 'yyyymmdd');
                CH_ERR_MSG := 'UPDATE FY_TB_BL_CHANGE_CYCLE';   
                UPDATE fy_tb_bl_change_cycle
                   SET future_eff_date = TO_DATE (CH_NEXT_BILL_DATE, 'yyyymmdd')
                 WHERE cust_id = R1.CUST_ID
                   AND old_cycle = v_CYCLE
                   AND new_cycle IS NOT NULL
                   AND future_eff_date = TO_DATE (CH_BILL_DATE, 'yyyymmdd');
               
                DBMS_OUTPUT.Put_Line('CUST_ID='||R1.CUST_ID||'; DONE');
            END IF;
            
            EXCEPTION
                WHEN ON_ERR THEN
                    DBMS_OUTPUT.Put_Line('CUST_ID='||R1.CUST_ID||'; ERR_MSG='||CH_ERR_MSG);
                    DBMS_OUTPUT.Put_Line('CutDate_Fix_Change_Cycle Process RETURN_CODE = 9999');
                WHEN OTHERS THEN
                    DBMS_OUTPUT.Put_Line('CutDate_Fix_Change_Cycle Process RETURN_CODE = 9999');
        END;
    END LOOP;
    COMMIT;
    DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END Fix_Change_Cycle Process...');  
    DBMS_OUTPUT.Put_Line('CutDate_Fix_Change_Cycle Process RETURN_CODE = 0000');    

EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('CutDate_Fix_Change_Cycle Process RETURN_CODE = 9999'); 
END;
/

exit;

```

## MPBL\BL\CutDate\bin\HGB_MPBL_CutDate_Pre.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_CutDate.sh
--# SQL name : HGB_MPBL_CutDate_Pre.sql
--# Path : /extsoft/MPBL/BL/CutDate/bin
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################
--# Date : 2023/04/17 Modify by Mike Kuan
--# Description : SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE       VARCHAR2(8)   := '&1'; 
v_CYCLE           NUMBER(2)     := '&2'; 
v_TYPE            VARCHAR(1)    := '&3'; 
NU_CNT            NUMBER        := 0;
   CURSOR C_C1 IS
      SELECT DISTINCT DECODE(ENTITY_TYPE,'S','SUBSCR_ID=','ACCT_ID=') TYPE, ENTITY_ID 
        FROM FY_TB_SYS_SYNC_ERROR A
       WHERE MODULE_ID='BL'
         AND ((ENTITY_TYPE='S' AND EXISTS (SELECT 1 FROM FY_TB_CM_SUBSCR S,
                                                         FY_TB_CM_CUSTOMER CC
                                           WHERE S.SUBSCR_ID=A.ENTITY_ID
                                             AND S.INIT_ACT_DATE<TO_DATE(v_BILL_DATE,'YYYYMMDD')
                                             AND CC.CUST_ID =S.CUST_ID
                                             AND CC.CYCLE   =v_CYCLE
											 AND CC.CUST_TYPE NOT IN ('D', 'N', 'P'))) OR --SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
              (ENTITY_TYPE='A' AND EXISTS (SELECT 1 FROM FY_TB_CM_ACCOUNT S,
                                                         FY_TB_CM_CUSTOMER CC
                                           WHERE S.ACCT_ID  =A.ENTITY_ID
										     and s.eff_date <TO_DATE(v_BILL_DATE,'YYYYMMDD')
                                             AND CC.CUST_ID =S.CUST_ID
                                             AND CC.CYCLE   =v_CYCLE
											 AND CC.CUST_TYPE NOT IN ('D', 'N', 'P')))) --SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
       ORDER BY DECODE(ENTITY_TYPE,'S','SUBSCR_ID=','ACCT_ID='),ENTITY_ID;
begin
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Check DataSync Process...'); 
   --GET DATA_SYNC CHEKC
   FOR R_C1 IN C_C1 LOOP
      NU_CNT := NVL(NU_CNT,0) + 1;
      IF v_TYPE='Y' THEN
         DBMS_OUTPUT.Put_Line(R_C1.TYPE||TO_CHAR(R_C1.ENTITY_ID)); 
      END IF;   
   END LOOP;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||' END Check DataSync Process...');   
   IF NU_CNT=0 THEN
      DBMS_OUTPUT.Put_Line('Pre_CutDate Process RETURN_CODE = 0000'||NULL);
   ELSE
      DBMS_OUTPUT.Put_Line('Pre_CutDate Process RETURN_CODE = 9999'||' Warning... ERROR_CNT = '||TO_CHAR(NU_CNT)); 
   END IF;                                                                               
EXCEPTION 
   WHEN OTHERS THEN
      DBMS_OUTPUT.Put_Line('Pre_CutDate Process RETURN_CODE = 9999');
      DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||SUBSTR(' END Check DataSync Process... '||SQLERRM,1,250)); 
end;
/

```

## MPBL\BL\CutDate\bin\HGB_MPBL_CutDate_RollBack_getCycleInfo.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_CutDate_RollBack.sh
--# SQL name : HGB_MPBL_CutDate_RollBack_getCycleInfo.sql
--# Path : /extsoft/MPBL/BL/CutDate/bin
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

set heading off
set feedback off
set verify off
set pagesize 0

select to_char(bill_date,'yyyymmdd') billdate,cycle from fy_tb_Bl_bill_cntrl where bill_seq='&1';

exit

```

## MPBL\BL\CutDate\bin\HGB_MPBL_CutDate_RollBack.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_MPBL_CutDate_RollBack.sh
# Path : /extsoft/MPBL/BL/CutDate/bin
#
# Date : 2020/04/23 Created by Mike Kuan
# Description : SR222460_MPBS migrate to HGB only for test env
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_MPBL_CutDate_RollBack"
sysdt=`date +%Y%m%d%H%M%S`
BillSeq=$1
HomeDir=/extsoft/MPBL/BL
WorkDir=$HomeDir/CutDate/bin
LogDir=$HomeDir/CutDate/log
LogFile=$LogDir/${progName}_${sysdt}.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh
#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
#"pet-hgbap01p","pet-hgbap02p","idc-hgbap01p","idc-hgbap02p") #(PET) (PROD)
#DB="HGBBL"
#OCS_AP="prdbl2"
#;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_MPBL_CutDate_RollBack_getCycleInfo
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}.data <<EOF
@HGB_MPBL_CutDate_RollBack_getCycleInfo.sql $1
EOF`
cat ${LogDir}/${progName}.data |read BillDate CYCLE
echo "BILL_DATE[${BillDate}] CycleCode[${CYCLE}]" | tee -a ${LogFile}
}

function HGB_MPBL_CutDate_AR
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_CutDate_AR.sql $1 $2
exit
EOF`
}

function HGB_MPBL_CutDate_RollBack
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_CutDate_RollBack.sql $1
exit
EOF`
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_MPBL" -s "${progName} BILL_SEQ:${BillSeq} Normal" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} BILL_SEQ:${BillSeq} Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB_MPBL" -s "${progName} BILL_SEQ:${BillSeq} Abnormal" -a ${LogFile} ${maillist}  << EOF
Dears,
   ${progName} CYCLE:${Cycle} BILL_SEQ:${BillSeq} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
fi

exit 0;
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BILL_SEQ> "
	echo ""
	echo "For example: $0 150001"
	echo ""
}

if [[ $# -lt 1 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_SEQ : ${BillSeq}" | tee -a $LogFile
echo '' | tee -a $LogFile
cd ${WorkDir}
Pause
#----------------------------------------------------------------------------------------------------
#------------取得Cycle資訊
echo "----->>>>>-----Step 1. Get Cycle Information (Start...)" | tee -a $LogFile
HGB_MPBL_CutDate_RollBack_getCycleInfo $BillSeq
if [[ ${CYCLE} -lt 50 || ${CYCLE} -gt 60 ]]; then
  echo "-----<<<<<-----Step 1. Get Cycle Information (End... Failed)" | tee -a $LogFile
  sendMail 0
fi
echo "-----<<<<<-----Step 1. Get Cycle Information (End... Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行AR_CutDate
echo "----->>>>>-----Step 0. Run AR_CutDate Process (Start...)" | tee -a $LogFile
HGB_MPBL_CutDate_AR $BillDate $CYCLE
checkcode=`cat ${LogFile}|grep 'Create_AR_Table Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -eq 1 ]]; then
  echo "-----<<<<<-----Step 0. Run AR_CutDate Process (End...Failed)" | tee -a $LogFile
  sendMail 0
fi
echo "-----<<<<<-----Step 0. Run AR_CutDate Process (End...Successed)" | tee -a $LogFile
Pause
#------------執行CutDate RollBack
echo "----->>>>>-----Step 1. Run CutDate RollBack Process (Start...)" | tee -a $LogFile
HGB_MPBL_CutDate_RollBack $BillSeq
checkcode=`cat ${LogFile}|grep 'CutDate RollBack Process RETURN_CODE = 0000'|wc -l`
if [[ $checkcode -eq 0 ]]; then
  echo "-----<<<<<-----Step 1. Run CutDate RollBack Process (End...Failed)" | tee -a $LogFile
  sendMail 0
fi
echo "-----<<<<<-----Step 1. Run CutDate RollBack Process (End...Successed)" | tee -a $LogFile

sendMail 1

```

## MPBL\BL\CutDate\bin\HGB_MPBL_CutDate_RollBack.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_CutDate_RollBack.sh
--# SQL name : HGB_MPBL_CutDate_RollBack.sql
--# Path : /extsoft/MPBL/BL/CutDate/bin
--#
--# Date : 2020/04/22 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB only for test env
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_USER                VARCHAR2(8)  := 'MPBL';
v_OLD_BILL_SEQ        NUMBER(6)    := '&1';
v_NEW_BILL_SEQ        NUMBER(6);
nu_CYCLE              NUMBER(2);
nu_OLD_BILL_PERIOD    VARCHAR2(6);
nu_NEW_BILL_PERIOD    VARCHAR2(6);
CH_ERR_CDE            VARCHAR2(10);
CH_ERR_MSG            VARCHAR2(300);
--檢查OC數量
CURSOR C1(v_OLD_BILL_SEQ number) IS
	SELECT COUNT (1) cnt
		FROM fy_tb_bl_bill_ci a
	WHERE a.bill_seq = v_OLD_BILL_SEQ
	AND a.SOURCE = 'OC'
	AND EXISTS (
			SELECT 1
				FROM fy_tb_bl_bill_acct b
			WHERE a.acct_id = b.acct_id
				AND b.bill_status = 'CL'
				AND a.bill_seq = b.bill_seq);
				
--檢查ACCT數量
CURSOR C2(v_OLD_BILL_SEQ number) IS
      SELECT count(1) cnt FROM fy_tb_bl_bill_acct
      WHERE bill_seq = v_OLD_BILL_SEQ AND bill_status = 'CL';
	  
begin
--查詢CYCLE與新舊BILL_PERIOD
	SELECT a.CYCLE, a.currect_period new_bill_period, b.bill_period old_bill_period
		INTO nu_cycle, nu_new_bill_period, nu_old_bill_period
	FROM fy_tb_bl_cycle a, fy_tb_bl_bill_cntrl b
	WHERE b.bill_seq = v_OLD_BILL_SEQ
	AND b.CYCLE = a.CYCLE
	AND b.bill_period =
			TO_CHAR (ADD_MONTHS (TO_DATE (a.currect_period, 'YYYYMM'), -1),
					'YYYYMM'
					);
	DBMS_OUTPUT.Put_Line('CYCLE:'||nu_CYCLE||' OLD_BILL_SEQ:'||v_OLD_BILL_SEQ||' NEW_BILL_PERIOD:'||nu_NEW_BILL_PERIOD||' OLD_BILL_PERIOD:'||nu_OLD_BILL_PERIOD);

--還原FY_TB_BL_CYCLE.CURRECT_PERIOD至前月BILL_PERIOD
if nu_CYCLE is not null then	
	--刪除CUTDATE相關TABLE資料
	FOR R2 IN C2(v_OLD_BILL_SEQ) LOOP
		DBMS_OUTPUT.Put_Line('FY_TB_BL_BILL_ACCT.BILL_SEQ='||v_OLD_BILL_SEQ||', Cnt='||to_char(r2.cnt));
			if r2.cnt > 0 then
				--將ACCOUNT狀態為CL的FY_TB_BL_BILL_CI.BILL_SEQ清空為NULL
				FOR R1 IN C1(v_OLD_BILL_SEQ) LOOP
					DBMS_OUTPUT.Put_Line('FY_TB_BL_BILL_CI.BILL_SEQ='||v_OLD_BILL_SEQ||', Cnt='||to_char(r1.cnt));  
						if r1.cnt > 0 then
							DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' UPDATE FY_TB_BL_BILL_CI.BILL_SEQ BEGIN');
								UPDATE fy_tb_bl_bill_ci a
									SET a.bill_seq = NULL
								WHERE a.bill_seq = v_OLD_BILL_SEQ
								AND a.source = 'OC'
								AND EXISTS (
										SELECT 1
											FROM fy_tb_bl_bill_acct b
										WHERE a.acct_id = b.acct_id
											AND b.bill_status = 'CL'
											AND a.bill_seq = b.bill_seq);
							DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' UPDATE FY_TB_BL_BILL_CI.BILL_SEQ END');	
						else
							DBMS_OUTPUT.Put_Line('FY_TB_BL_BILL_CI no data');
						end if;	
				END LOOP;

			--PARAM
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE OLD FY_TB_BL_BILL_OFFER_PARAM BEGIN');
					DELETE fy_tb_bl_bill_offer_param a
						WHERE bill_seq = v_OLD_BILL_SEQ
							AND NOT EXISTS (
								SELECT 1
									FROM fy_tb_bl_bill_acct b
									WHERE a.acct_id = b.acct_id
									AND b.bill_status = 'CN'
									AND a.bill_seq = b.bill_seq);
					UPDATE fy_tb_bl_bill_offer_param a SET bill_seq = '9527'||v_OLD_BILL_SEQ
						WHERE bill_seq = v_OLD_BILL_SEQ
							AND EXISTS (
								SELECT 1
									FROM fy_tb_bl_bill_acct b
									WHERE a.acct_id = b.acct_id
									AND b.bill_status = 'CN'
									AND a.bill_seq = b.bill_seq);
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE OLD FY_TB_BL_BILL_OFFER_PARAM END');
			
			--SUB
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE OLD FY_TB_BL_BILL_SUB BEGIN');
					DELETE fy_tb_bl_bill_sub a
						WHERE bill_seq = v_OLD_BILL_SEQ
							AND NOT EXISTS (
								SELECT 1
									FROM fy_tb_bl_bill_acct b
									WHERE a.acct_id = b.acct_id
									AND b.bill_status = 'CN'
									AND a.bill_seq = b.bill_seq);
					UPDATE fy_tb_bl_bill_sub a SET bill_seq = '9527'||v_OLD_BILL_SEQ
						WHERE bill_seq = v_OLD_BILL_SEQ
							AND NOT EXISTS (
								SELECT 1
									FROM fy_tb_bl_bill_acct b
									WHERE a.acct_id = b.acct_id
									AND b.bill_status = 'CN'
									AND a.bill_seq = b.bill_seq);
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE OLD FY_TB_BL_BILL_SUB END');
	
			--ACCT_MPBL
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE OLD FY_TB_BL_BILL_ACCT_MPBL BEGIN');
					DELETE fy_tb_bl_bill_acct_mpbl a
						WHERE bill_seq = v_old_bill_seq
							AND NOT EXISTS (SELECT 1
										FROM fy_tb_bl_bill_acct b
										WHERE a.bill_seq = b.bill_seq AND b.bill_status = 'CN');
					UPDATE fy_tb_bl_bill_acct_mpbl a SET bill_seq = '9527'||v_OLD_BILL_SEQ
						WHERE bill_seq = v_old_bill_seq
							AND NOT EXISTS (SELECT 1
										FROM fy_tb_bl_bill_acct b
										WHERE a.bill_seq = b.bill_seq AND b.bill_status = 'CN');
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE OLD FY_TB_BL_BILL_ACCT_MPBL END');
				
			--ACCT
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE OLD FY_TB_BL_BILL_ACCT BEGIN');
					DELETE fy_tb_bl_bill_acct
						WHERE bill_seq = v_OLD_BILL_SEQ AND bill_status = 'CL';
					DELETE fy_tb_bl_bill_acct
						WHERE bill_seq = '9527'||v_OLD_BILL_SEQ AND bill_status = 'CN';
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE OLD FY_TB_BL_BILL_ACCT END');
						
			--Process_Log
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE OLD FY_TB_BL_BILL_PROCESS_LOG BEGIN');
					DELETE fy_tb_bl_bill_process_log WHERE bill_seq = v_old_bill_seq;
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE OLD FY_TB_BL_BILL_PROCESS_LOG END');
					
			--CNTRL
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' UPDATE OLD FY_TB_BL_BILL_CNTRL.ACCT_COUNT BEGIN');
					DELETE fy_tb_bl_bill_cntrl WHERE cycle = nu_cycle AND bill_seq = v_OLD_BILL_SEQ;
                    --UPDATE fy_tb_bl_bill_cntrl a
                    --    SET bill_seq = '9527'||v_OLD_BILL_SEQ, status = 'CN',
                    --    acct_count = (SELECT COUNT (acct_id)
                    --                    FROM fy_tb_bl_bill_acct b
                    --                    WHERE b.bill_status = 'CN' AND b.bill_seq = v_OLD_BILL_SEQ)
                    --WHERE bill_seq = v_OLD_BILL_SEQ;
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' UPDATE OLD FY_TB_BL_BILL_CNTRL.ACCT_COUNT END');

			--CYCLE
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' UPDATE FY_TB_BL_CYCLE.CURRECT_PERIOD BEGIN');
					UPDATE fy_tb_bl_cycle
						SET currect_period = nu_old_bill_period, lbc_date = add_months(lbc_date,-1)
					WHERE CYCLE = nu_cycle AND currect_period = nu_new_bill_period;
				DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' UPDATE FY_TB_BL_CYCLE.CURRECT_PERIOD END');
				DBMS_OUTPUT.Put_Line('CYCLE:'||nu_CYCLE||' UPDATE BILL_PERIOD FROM '||nu_NEW_BILL_PERIOD||' TO '||nu_OLD_BILL_PERIOD);
			commit;

			--執行CUTDATE
				FY_PG_BL_BILL_CUTDATE.MAIN(nu_CYCLE, nu_old_bill_period, v_USER, CH_ERR_CDE, CH_ERR_MSG);
					if ch_err_cde='0000' then
						DBMS_OUTPUT.Put_Line('CutDate Process RETURN_CODE = 0000');
						
						--查詢新BILL_SEQ
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' SELECT FY_TB_BL_BILL_CI.BILL_SEQ BEGIN');
						SELECT b.bill_seq
							INTO v_NEW_BILL_SEQ
						FROM fy_tb_bl_bill_cntrl b, fy_tb_bl_cycle a
						WHERE b.CYCLE = nu_CYCLE
						AND b.CYCLE = a.CYCLE
						AND b.CREATE_USER = v_USER
						AND b.bill_period =
											TO_CHAR (ADD_MONTHS (TO_DATE (a.currect_period, 'YYYYMM'),
																-1
																),
													'YYYYMM'
													);
						DBMS_OUTPUT.Put_Line('CYCLE:'||nu_CYCLE||' NEW_BILL_SEQ:'||v_NEW_BILL_SEQ);
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' SELECT FY_TB_BL_BILL_CI.BILL_SEQ END');
					
						--ACCT_MPBL
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE NEW FY_TB_BL_BILL_ACCT_MPBL BEGIN');
							DELETE fy_tb_bl_bill_acct_mpbl a
								WHERE bill_seq = v_NEW_BILL_SEQ
									AND EXISTS (
										SELECT 1
											FROM fy_tb_bl_bill_acct b
											WHERE a.acct_id = b.acct_id
											AND b.bill_status = 'CN'
											AND b.bill_seq = '9527'||v_OLD_BILL_SEQ
																);
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE NEW FY_TB_BL_BILL_ACCT_MPBL END');
				
						--ACCT
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE NEW FY_TB_BL_BILL_ACCT BEGIN');
							DELETE fy_tb_bl_bill_acct a
								WHERE bill_seq = v_NEW_BILL_SEQ
									AND EXISTS (
										SELECT 1
											FROM fy_tb_bl_bill_acct b
											WHERE a.acct_id = b.acct_id
											AND b.bill_status = 'CN'
											AND b.bill_seq = '9527'||v_OLD_BILL_SEQ
																);
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE NEW FY_TB_BL_BILL_ACCT END');
			
						--SUB
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE NEW FY_TB_BL_BILL_SUB BEGIN');
							DELETE fy_tb_bl_bill_sub a
								WHERE bill_seq = v_NEW_BILL_SEQ
									AND EXISTS (
										SELECT 1
											FROM fy_tb_bl_bill_acct b
											WHERE a.acct_id = b.acct_id
											AND b.bill_status = 'CN'
											AND b.bill_seq = '9527'||v_OLD_BILL_SEQ
																);
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE NEW FY_TB_BL_BILL_SUB END');
						
						--PARAM
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE NEW FY_TB_BL_BILL_OFFER_PARAM BEGIN');
							DELETE fy_tb_bl_bill_offer_param a
								WHERE bill_seq = v_NEW_BILL_SEQ
									AND EXISTS (
										SELECT 1
											FROM fy_tb_bl_bill_acct b
											WHERE a.acct_id = b.acct_id
											AND b.bill_status = 'CN'
											AND b.bill_seq = '9527'||v_OLD_BILL_SEQ
																);
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' DELETE NEW FY_TB_BL_BILL_OFFER_PARAM END');
						--CNTRL
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' UPDATE NEW FY_TB_BL_BILL_CNTRL.ACCT_COUNT BEGIN');
							UPDATE fy_tb_bl_bill_cntrl a
								SET acct_count = (SELECT COUNT (acct_id)
												FROM fy_tb_bl_bill_acct b
												WHERE b.bill_seq = v_NEW_BILL_SEQ
																	)
							WHERE bill_seq = v_NEW_BILL_SEQ;
						DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' UPDATE NEW FY_TB_BL_BILL_CNTRL.ACCT_COUNT END');
						commit;
						DBMS_OUTPUT.Put_Line('CutDate RollBack Process RETURN_CODE = 0000');
					else        
						DBMS_OUTPUT.Put_Line('CutDate Process RETURN_CODE = 9999'); 
					end if;     
			else
				DBMS_OUTPUT.Put_Line('FY_TB_BL_BILL_ACCT無ACCT資料需處理');
			end if;
	END LOOP;
else
	DBMS_OUTPUT.Put_Line('找不到FY_TB_BL_CYCLE資訊');
end if;

EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('CutDate RollBack Process RETURN_CODE = 9999'); 
end;
/

exit;

```

## MPBL\BL\CutDate\bin\HGB_MPBL_CutDate_STATUS_Check.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_CutDate.sh
--# SQL name : HGB_MPBL_CutDate_STATUS_Check.sql
--# Path : /extsoft/MPBL/BL/CutDate/bin
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_USER           VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number) IS
     select distinct bill_status status, count(1) cnt
           from fy_tb_bl_bill_acct B
          where B.bill_seq=ibill_seq
		  AND B.CYCLE   =v_CYCLE
          group by b.bill_status;  
begin
  select bill_SEQ
    into nu_bill_seq
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   AND A.CYCLE   =v_CYCLE
   AND A.CREATE_USER =v_USER;
  FOR R1 IN C1(nu_bill_seq) LOOP
     DBMS_OUTPUT.Put_Line('CutDate_STATUS_Check Status='||r1.status||', Cnt='||to_char(r1.cnt));  
  end loop; 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('CutDate_STATUS_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## MPBL\BL\CutDate\bin\HGB_MPBL_CutDate.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_MPBL_CutDate.sh
# Path : /extsoft/MPBL/BL/CutDate/bin
#
# Date : 2020/03/26 Created by Mike Kuan
# Description : SR222460_MPBS migrate to HGB
########################################################################################
# Date : 2021/02/22 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB - fix SMS
########################################################################################
# Date : 2021/10/26 Modify by Mike Kuan
# Description : SR239378_SD-WAN 移除ProcessNo
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_MPBL_CutDate"
sysdt=`date +%Y%m%d%H%M%S`
BillDate=$1
Cycle=$2
HomeDir=/extsoft/MPBL/BL
WorkDir=$HomeDir/CutDate/bin
LogDir=$HomeDir/CutDate/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_${progName}.log
AutoWatchFileName=${BillDate}_${progName}.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`

#---------------------------------------------------------------------------------------#
#      FTP
#---------------------------------------------------------------------------------------# 
utilDir="/cb/BCM/util"
ftpProg="${utilDir}/Ftp2Remote.sh"
putip1='10.68.8.37'
putuser1=$OCSID
putpass1=$OCSPWD
putpath1=/cb/AutoWatch/log/joblog

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_MPBL_getCycleInfo
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}.data <<EOF
@HGB_MPBL_getCycleInfo.sql $1 $2
EOF`
cat ${LogDir}/${progName}.data |read CYCLE CURRECT_PERIOD
echo "CycleCode[${CYCLE}] PeriodKey[${CURRECT_PERIOD}]" | tee -a ${LogFile}
}

function HGB_MPBL_CutDate_Pre
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_CutDate_Pre.sql $1 $2 $3
exit
EOF`
}

function HGB_MPBL_CutDate_Fix_Change_Cycle
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_CutDate_Fix_Change_Cycle.sql $1
exit
EOF`
}

function HGB_MPBL_CutDate_AR
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_CutDate_AR.sql $1 $2
exit
EOF`
}

function HGB_MPBL_CutDate
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_CutDate.sql $1 $2
exit
EOF`
}

function HGB_MPBL_CutDate_STATUS_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STATUS.data <<EOF
@HGB_MPBL_CutDate_STATUS_Check.sql $1 $2
exit
EOF`
cat ${LogDir}/${progName}_STATUS.data | tee -a ${LogFile}
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
   		echo "Send SMS (Failed)" | tee -a $LogFile
		sendSMS 0
		echo "FTP Command: ${ftpProg} ${putip1} ${putuser1} ******** ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0
   fi
   echo "Send Mail (Failed)" | tee -a $LogFile
   sendMail 0
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Successed)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
   		echo "Send SMS (Successed)" | tee -a $LogFile
		sendSMS 1
		echo "FTP Command: ${ftpProg} ${putip1} ${putuser1} ******** ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0
   fi
   echo "Send Mail (Successed)" | tee -a $LogFile
   sendMail 1
fi
exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
tar zcvf ${progName}_${sysdt}.tar.tgz ${progName}_${sysdt}.log
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Normal" -a ${progName}_${sysdt}.tar.tgz ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
elif [[ $type -eq 2 ]]; then
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Start" ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} Start.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Abnormal" -a ${progName}_${sysdt}.tar.tgz ${maillist}  << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
fi
}

function sendSMS
{
type=$1
	errorMessage=" Abnormal! ${BillDate} ${Cycle} ${progName}"
	okMessage=" Normal! ${BillDate} ${Cycle} ${progName}"
	startMessage=" Start! ${BillDate} ${Cycle} ${progName}"
	smslist=`cat $smsList`
	
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
	${smsProg} "${okMessage}" "${smslist}"
elif [[ $type -eq 2 ]]; then
	${smsProg} "${startMessage}" "${smslist}"
else
	${smsProg} "${errorMessage}" "${smslist}"
fi
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BILL_DATE> <CYCLE> "
	echo ""
	echo "For example: $0 20210301 50"
	echo "For example: $0 20210303 51"
	echo "For example: $0 20210305 52"
	echo "For example: $0 20210308 53"
	echo "For example: $0 20210311 54"
	echo "For example: $0 20210314 55"
	echo "For example: $0 20210317 56"
	echo "For example: $0 20210220 57"
	echo "For example: $0 20210223 58"
	echo "For example: $0 20210225 59"
	echo "For example: $0 20210227 60"
	echo ""
}

if [[ $# -lt 2 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_DATE : ${BillDate}" | tee -a $LogFile
echo "CYCLE : ${Cycle}" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $DB = "HGBBL" ]]; then
	echo "Send SMS (Start)" | tee -a $LogFile
	sendSMS 2
	Pause
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
else
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
fi

cd ${WorkDir}
Pause
#----------------------------------------------------------------------------------------------------
#------------取得Cycle資訊
echo "----->>>>>-----Step 1. Get Cycle Information (Start...)" | tee -a $LogFile
HGB_MPBL_getCycleInfo $BillDate $Cycle
if [[ ${CYCLE} -lt 50 || ${CYCLE} -gt 60 ]]; then
  echo "-----<<<<<-----Step 1. Get Cycle Information (End... Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 1. Get Cycle Information (End... Successed)" | tee -a $LogFile
Pause
##----------------------------------------------------------------------------------------------------
#------------執行Pre_CutDate
echo "----->>>>>-----Step 2. Run Pre_CutDate Process (Start...)" | tee -a $LogFile
echo $BillDate
echo $CYCLE
HGB_MPBL_CutDate_Pre $BillDate $CYCLE Y
checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Pre_CutDate Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  error_cnt=`cat ${LogFile}|grep -Eo 'ERROR_CNT = [0-9]'|grep '[0-9]'|awk '{print $3}'`
  if  [[ $error_cnt -ne 0 ]]; then
	echo "error list:"
	cat ${LogFile}|grep 'ACCT_ID='
	cat ${LogFile}|grep 'SUBSCR_ID='
  fi
  checkdone=0
  rerun_cnt=1
  while [ $checkdone -eq 0 ] 
  do
    sleep 60
	    echo "ReRun:$rerun_cnt Pre_CutDate Process (Start...)" | tee -a $LogFile
    HGB_MPBL_CutDate_Pre $BillDate $CYCLE N
	checkdone=`cat ${LogFile}|grep 'Pre_CutDate Process RETURN_CODE = 0000'|wc -l`
		(( rerun_cnt++ ))
		if [[ $rerun_cnt -eq 11 ]]; then
		  echo "-----<<<<<-----Step 2. Run Pre_CutDate Process (End... Failed)" | tee -a $LogFile
		  AutoWatch 1
		fi
  done  
fi
echo "-----<<<<<-----Step 2. Run Pre_CutDate Process (End... Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Fix_Change_Cycle_CutDate
echo "----->>>>>-----Step 3. Run Fix_Change_Cycle_CutDate Process (Start...)" | tee -a $LogFile
HGB_MPBL_CutDate_Fix_Change_Cycle $CYCLE
checkcode=`cat ${LogFile}|grep -E 'ORA|ora|CutDate_Fix_Change_Cycle Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -eq 1 ]]; then
  echo "-----<<<<<-----Step 3. Run Fix_Change_Cycle_CutDate Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 3. Run Fix_Change_Cycle_CutDate Process (End...Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行AR_CutDate
echo "----->>>>>-----Step 4. Run AR_CutDate Process (Start...)" | tee -a $LogFile
HGB_MPBL_CutDate_AR $BillDate $CYCLE
checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Create_AR_Table Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -eq 1 ]]; then
  echo "-----<<<<<-----Step 4. Run AR_CutDate Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 4. Run AR_CutDate Process (End...Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行CutDate
echo "----->>>>>-----Step 5. Run CutDate Process (Start...)" | tee -a $LogFile
HGB_MPBL_CutDate $CYCLE $CURRECT_PERIOD
checkcode=`cat ${LogFile}|grep -E 'ORA|ora|CutDate Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -eq 1 ]]; then
  echo "-----<<<<<-----Step 5. Run CutDate Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 5. Run CutDate Process (End...Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行CutDate STATUS Check
echo "----->>>>>-----Step 6. Run CutDate STATUS Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_CutDate_STATUS_Check $BillDate $CYCLE
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|CutDate_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 6. Run CutDate STATUS Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 6. Run CutDate STATUS Check Process (End... Successed)" | tee -a $LogFile

AutoWatch 0

```

## MPBL\BL\CutDate\bin\HGB_MPBL_CutDate.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_CutDate.sh
--# SQL name : HGB_MPBL_CutDate.sql
--# Path : /extsoft/MPBL/BL/CutDate/bin
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_CYCLE          NUMBER(2)    := '&1'; 
v_BILL_PERIOD    VARCHAR2(6)  := '&2'; 
CH_USER          VARCHAR2(8)  := 'MPBL';
CH_ERR_CDE       VARCHAR2(10);
CH_ERR_MSG       VARCHAR2(300);
begin
     FY_PG_BL_BILL_CUTDATE.MAIN(v_CYCLE, v_BILL_PERIOD, CH_USER, CH_ERR_CDE, CH_ERR_MSG);
     if ch_err_cde='0000' then
        DBMS_OUTPUT.Put_Line('CutDate Process RETURN_CODE = 0000');
     else        
        DBMS_OUTPUT.Put_Line('CutDate Process RETURN_CODE = 9999'); 
     end if;     
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('CutDate Process RETURN_CODE = 9999'); 
end;
/

exit;

```

## MPBL\BL\CutDate\bin\HGB_MPBL_getCycleInfo.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_CutDate.sh
--# SQL name : HGB_MPBL_getCycleInfo.sql
--# Path : /extsoft/MPBL/BL/CutDate/bin
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

set heading off
set feedback off
set verify off
set pagesize 0

SELECT CYCLE, CURRECT_PERIOD
     FROM FY_TB_BL_CYCLE
    WHERE currect_period IS NOT NULL
    AND TO_DATE(CURRECT_PERIOD||FROM_DAY,'YYYYMMDD') =
        DECODE(SUBSTR('&1',-2),'01',ADD_MONTHS(TO_DATE('&1','YYYYMMDD'),-1),TO_DATE('&1','YYYYMMDD')) 
		and cycle = '&2'
		and create_user = 'MPBL'
    ;

exit

```

## MPBL\BL\Extract\bin\HGB_MPBL_Extract_DIO_Check.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Extract.sh
--# Path : /extsoft/MPBL/BL/Extract/bin
--# SQL name : HGB_MPBL_Extract_DIO_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1'; 
  v_CYCLE          NUMBER(2)    := '&2'; 
  v_PROC_ID        VARCHAR2(8)  := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_STATUS        FY_TB_DIO_CNTRL.STATUS%TYPE;
  CH_IO_TYPE       FY_TB_DIO_CNTRL.IO_TYPE%TYPE;
  NU_CNT           NUMBER;
  RUN_MINS         NUMBER;
  On_Err           EXCEPTION;
  CURSOR C1 IS
     SELECT BILL_SEQ, STATUS, ROUND(TO_NUMBER(sysdate - START_TIME) * 24 * 60) RUN_MINS
       FROM FY_TB_DIO_CNTRL A
      WHERE BILL_SEQ  =NU_BILL_SEQ
        AND PROC_TYPE =v_PROC_TYPE
        AND PROC_ID   =v_PROC_ID
        AND CONFIRM_ID =(SELECT MAX(CONFIRM_ID) FROM FY_TB_DIO_CNTRL
                             WHERE BILL_SEQ  =A.BILL_SEQ
                               AND PROC_TYPE =A.PROC_TYPE
                               AND PROC_ID   =v_PROC_ID)
		order by decode(STATUS,'E',1,'A',2,'S',3,4);

begin
  select bill_SEQ
    into nu_bill_seq
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   and a.create_user=CH_USER;
   
  CH_STATUS :='Y';
  FOR R1 IN C1 LOOP
    IF R1.STATUS='E' AND R1.RUN_MINS <= 10 THEN
		DELETE fy_tb_dio_cntrl_dtl
			WHERE cntrl_seq IN (SELECT cntrl_seq
								FROM fy_tb_dio_cntrl
								WHERE bill_seq = nu_bill_seq AND status = 'E');
	
		UPDATE fy_tb_dio_cntrl
			SET status = 'A',
				last_grp_id = NULL,
				tot_cnt = NULL,
				tot_amt = NULL,
				start_time = NULL,
				end_time = NULL
		WHERE bill_seq = nu_bill_seq AND status = 'E';
	
		COMMIT;
	
       DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Processing'); 
       RAISE ON_ERR;
    ELSIF R1.STATUS='E' THEN
       DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Process RETURN_CODE = 9999'); 
       RAISE ON_ERR;
    ELSIF R1.STATUS<>'S' THEN
       DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Processing'); 
       RAISE ON_ERR;
    ELSE
       CH_STATUS :='N';
    END IF;
  END LOOP;
  IF CH_STATUS='Y' THEN
     DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Processing'); 
  ELSE   
     DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Process RETURN_CODE = 0000'); 
  END IF;   
EXCEPTION 
   WHEN on_err THEN
      NULL;
   WHEN OTHERS THEN
     DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Process RETURN_CODE = 9999'); 
end;
/

```

## MPBL\BL\Extract\bin\HGB_MPBL_Extract_Ready.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Extract.sh
--# Path : /extsoft/MPBL/BL/Extract/bin
--# SQL name : HGB_MPBL_Extract.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
   v_BILL_DATE      VARCHAR2(8)  := '&1'; 
   v_CYCLE          NUMBER(2)    := '&2'; 
   v_PROC_TYPE      VARCHAR2(1)  := 'B'; 
   CH_USER          VARCHAR2(8)  := 'MPBL';
   NU_BILL_SEQ      NUMBER;
   CH_ERR_CDE       VARCHAR2(10);
   CH_ERR_MSG       VARCHAR2(300);
   On_Err           EXCEPTION;
begin
        DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Extract Process...'); 
         SELECT A.BILL_SEQ
           INTO NU_BILL_SEQ
     FROM FY_TB_BL_BILL_CNTRL A
    WHERE A.BILL_DATE   =TO_DATE(v_BILL_DATE,'YYYYMMDD')
	and a.cycle =v_CYCLE
	and a.create_user =CH_USER;
    ----DIO 
    Fy_Pg_Dio_Util.Ins_Dio_MAST
                           ('UBL',     --Pi_Sys_Id ,
                            'MPREADY', --Pi_Proc_Id ,
                            NU_Bill_Seq ,
                            v_Proc_Type, 
                            'O',        --Pi_Io_Type,
                            CH_USER,
                            CH_Err_Cde,
                            CH_Err_Msg);                           
    IF CH_Err_Cde <> '0000' THEN
       RAISE ON_ERR;
    END IF; 
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||' END Extract Process...'); 
   DBMS_OUTPUT.Put_Line('Extract Ready Process RETURN_CODE = 0000'||null);  
EXCEPTION 
   WHEN ON_ERR THEN
       DBMS_OUTPUT.Put_Line('Extract Ready Process RETURN_CODE = 9999'||SUBSTR(' Extract'||ch_err_msg,1,250)); 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Extract Ready Process RETURN_CODE = 9999'||SUBSTR(' Extract'||SQLERRM,1,250)); 
end;
/

exit;

```

## MPBL\BL\Extract\bin\HGB_MPBL_Extract.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_MPBL_Extract.sh
# Path : /extsoft/MPBL/BL/Extract/bin
#
# Date : 2021/02/20 Created by Mike Kuan
# Description : SR222460_MPBS migrate to HGB
########################################################################################
# Date : 2021/02/22 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB - fix SMS
########################################################################################
# Date : 2021/10/26 Modify by Mike Kuan
# Description : SR239378_SD-WAN ����ProcessNo
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_MPBL_Extract"
sysdt=`date +%Y%m%d%H%M%S`
BillDate=$1
Cycle=$2
HomeDir=/extsoft/MPBL/BL
WorkDir=$HomeDir/Extract/bin
LogDir=$HomeDir/Extract/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_${progName}.log
AutoWatchFileName=${BillDate}_${progName}.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`

#---------------------------------------------------------------------------------------#
#      FTP
#---------------------------------------------------------------------------------------# 
utilDir="/cb/BCM/util"
ftpProg="${utilDir}/Ftp2Remote.sh"
putip1='10.68.8.37'
putuser1=$OCSID
putpass1=$OCSPWD
putpath1=/cb/AutoWatch/log/joblog

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #Ū��
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_MPBL_Extract
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}.data <<EOF
@HGB_MPBL_Extract.sql $1 $2 $3
exit
EOF`
cat ${LogDir}/${progName}.data | tee -a ${LogFile}
}

function HGB_MPBL_Extract_Ready
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_Ready.data <<EOF
@HGB_MPBL_Extract_Ready.sql $1 $2
exit
EOF`
cat ${LogDir}/${progName}_Ready.data | tee -a ${LogFile}
}

function HGB_MPBL_Extract_DIO_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_DIO_Check.data <<EOF
@HGB_MPBL_Extract_DIO_Check.sql $1 $2 $3 $4
exit
EOF`
cat ${LogDir}/${progName}_DIO_Check.data | tee -a ${LogFile}
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
   		echo "Send SMS (Failed)" | tee -a $LogFile
		sendSMS 0
		echo "FTP Command: ${ftpProg} ${putip1} ${putuser1} ******** ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0
   fi
   echo "Send Mail (Failed)" | tee -a $LogFile
   sendMail 0
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Successed)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
   		echo "Send SMS (Successed)" | tee -a $LogFile
		sendSMS 1
		echo "FTP Command: ${ftpProg} ${putip1} ${putuser1} ******** ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0
   fi
   echo "Send Mail (Successed)" | tee -a $LogFile
   sendMail 1
fi
exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
tar zcvf ${progName}_${sysdt}.tar.tgz ${progName}_${sysdt}.log
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Normal" -a ${progName}_${sysdt}.tar.tgz ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} Successed.
   
(�Ъ`�N�G���l�󬰨t�Φ۰ʶǰe�A�ФŪ����^�СI)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
elif [[ $type -eq 2 ]]; then
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Start" ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} Start.
   
(�Ъ`�N�G���l�󬰨t�Φ۰ʶǰe�A�ФŪ����^�СI)
EOF
else
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Abnormal" -a ${progName}_${sysdt}.tar.tgz ${maillist}  << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} Failed, Please check!!!
   
(�Ъ`�N�G���l�󬰨t�Φ۰ʶǰe�A�ФŪ����^�СI)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
fi
}

function sendSMS
{
type=$1
	errorMessage=" Abnormal! ${BillDate} ${Cycle} ${progName}"
	okMessage=" Normal! ${BillDate} ${Cycle} ${progName}"
	startMessage=" Start! ${BillDate} ${Cycle} ${progName}"
	smslist=`cat $smsList`
	
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
	${smsProg} "${okMessage}" "${smslist}"
elif [[ $type -eq 2 ]]; then
	${smsProg} "${startMessage}" "${smslist}"
else
	${smsProg} "${errorMessage}" "${smslist}"
fi
}

function sendDelayMail
{
count=$1
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ����ɶ��w�F${count}����" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ����ɶ��w�F${count}�����A�нT�{�O�_���`.
   
(�Ъ`�N�G���l�󬰨t�Φ۰ʶǰe�A�ФŪ����^�СI)
EOF
}

function sendDelaySMS
{
count=$1
	Message=" Warning! over <${count}> minutes ${BillDate} <${Cycle}> ${progName}"
	smslist=`cat $smsList`

	${smsProg} "${Message}" "${smslist}"
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BILL_DATE> <CYCLE>"
	echo ""
    echo "For example: $0 20210301 50"
    echo "For example: $0 20210303 51"
    echo "For example: $0 20210305 52"
    echo "For example: $0 20210308 53"
    echo "For example: $0 20210311 54"
    echo "For example: $0 20210314 55"
    echo "For example: $0 20210317 56"
    echo "For example: $0 20210220 57"
    echo "For example: $0 20210223 58"
    echo "For example: $0 20210225 59"
	echo "For example: $0 20210227 60"
	echo ""
}

if [[ $# -lt 2 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_DATE : ${BillDate}" | tee -a $LogFile
echo "CYCLE : ${Cycle}" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $DB = "HGBBL" ]]; then
	echo "Send SMS (Start)" | tee -a $LogFile
	sendSMS 2
	Pause
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
else
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
fi

cd ${WorkDir}
Pause
#----------------------------------------------------------------------------------------------------
#------------����Extract MPMAST
echo "----->>>>>-----Step 1. Run Extract MPMAST Process (Start...)" | tee -a $LogFile
HGB_MPBL_Extract $BillDate $Cycle
Pause
checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Extract Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
	echo "-----<<<<<-----Step 1. Run Extract MPMAST Process (End...Failed)" | tee -a $LogFile
	AutoWatch 1
else
	echo "waiting for 60 seconds before check DIO status" | tee -a $LogFile
	sleep 60
	run_cnt=0
	mod_cnt=1
	checkdone=0
	checkerror=0
	checkwait=0
		while [ $checkdone -eq 0 ] 
		do
			echo "----->>>>>-----Step 2. Run Extract DIO Check MPMAST Process (Start...)" | tee -a $LogFile
			HGB_MPBL_Extract_DIO_Check $BillDate $Cycle MPMAST
			sleep 60
			(( run_cnt++ ))
			mod_cnt=`expr $run_cnt % 60`
			checkdone=`cat ${LogDir}/${progName}_DIO_Check.data|grep 'Extract_DIO_Check MPMAST Process RETURN_CODE = 0000'|wc -l`
			checkerror=`cat ${LogDir}/${progName}_DIO_Check.data|grep -E 'ORA|ora|Extract_DIO_Check MPMAST Process RETURN_CODE = 9999'|wc -l`
			checkwait=`cat $LogFile|grep 'Extract_DIO_Check MPMAST Processing'|wc -l`
				if [[ $mod_cnt -eq 0 ]]; then
					echo "Run Count : $run_cnt" | tee -a $LogFile
					echo "!!!please check Extract DIO MPMAST status!!!" | tee -a $LogFile
					echo "----->>>>>-----Step 2. Run Extract DIO Check MPMAST Processed `expr $run_cnt / 60`hours (Need to Check...)" | tee -a $LogFile
					sendDelayMail $run_cnt
					if [[ $DB = "HGBBL" ]]; then
						sendDelaySMS $run_cnt
					fi
				fi
				
				if  [[ $checkerror -ge 1 ]]; then
					echo "Error Count : $checkerror" | tee -a $LogFile
					echo "-----<<<<<-----Step 1. Run Extract MPMAST Process (End...Failed)" | tee -a $LogFile
					echo "-----<<<<<-----Step 2. Run Extract DIO Check MPMAST Process (End... Failed)" | tee -a $LogFile
					AutoWatch 1
				else
					echo "Run Count : $run_cnt" | tee -a $LogFile
					echo "Done Count : $checkdone" | tee -a $LogFile
					echo "Error Count : $checkerror" | tee -a $LogFile
					echo "Wait Count : $checkwait" | tee -a $LogFile
					echo "---------------Step 2. Run Extract DIO Check MPMAST Processing" | tee -a $LogFile
					Pause
				fi
		done
	echo "-----<<<<<-----Step 1. Run Extract MPMAST Process (End... Successed)" | tee -a $LogFile
	echo "-----<<<<<-----Step 2. Run Extract DIO Check MPMAST Process (End... Successed)" | tee -a $LogFile
fi
Pause
#----------------------------------------------------------------------------------------------------
#------------����Extract MPREADY
echo "----->>>>>-----Step 3. Run Extract MPREADY Process (Start...)" | tee -a $LogFile
HGB_MPBL_Extract_Ready $BillDate $Cycle
Pause
checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Extract MPREADY Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
	echo "-----<<<<<-----Step 3. Run Extract MPREADY Process (End...Failed)" | tee -a $LogFile
	AutoWatch 1
else
	echo "waiting for 60 seconds before check DIO status" | tee -a $LogFile
	sleep 60
	run_cnt=0
	mod_cnt=1
	checkdone=0
	checkerror=0
	checkwait=0
		while [ $checkdone -eq 0 ] 
		do
			echo "----->>>>>-----Step 4. Run Extract DIO Check MPREADY Process (Start...)" | tee -a $LogFile
			HGB_MPBL_Extract_DIO_Check $BillDate $Cycle MPREADY
			sleep 60
			(( run_cnt++ ))
			mod_cnt=`expr $run_cnt % 60`
			checkdone=`cat ${LogDir}/${progName}_DIO_Check.data|grep 'Extract_DIO_Check MPREADY Process RETURN_CODE = 0000'|wc -l`
			checkerror=`cat ${LogDir}/${progName}_DIO_Check.data|grep -E 'ORA|ora|Extract_DIO_Check MPREADY Process RETURN_CODE = 9999'|wc -l`
			checkwait=`cat $LogFile|grep 'Extract_DIO_Check MPREADY Processing'|wc -l`
				if [[ $mod_cnt -eq 0 ]]; then
					echo "Run Count : $run_cnt" | tee -a $LogFile
					echo "!!!please check Extract DIO status!!!" | tee -a $LogFile
					echo "----->>>>>-----Step 4. Run Extract DIO Check MPREADY Processed `expr $run_cnt / 60`hours (Need to Check...)" | tee -a $LogFile
					sendDelayMail $run_cnt
					if [[ $DB = "HGBBL" ]]; then
						sendDelaySMS $run_cnt
					fi
				fi
				
				if  [[ $checkerror -ge 1 ]]; then
					echo "Error Count : $checkerror" | tee -a $LogFile
					echo "-----<<<<<-----Step 3. Run Extract MPREADY Process (End...Failed)" | tee -a $LogFile
					echo "-----<<<<<-----Step 4. Run Extract DIO Check MPREADY Process (End... Failed)" | tee -a $LogFile
					AutoWatch 1
				else
					echo "Run Count : $run_cnt" | tee -a $LogFile
					echo "Done Count : $checkdone" | tee -a $LogFile
					echo "Error Count : $checkerror" | tee -a $LogFile
					echo "Wait Count : $checkwait" | tee -a $LogFile
					Pause
				fi
		done
	echo "-----<<<<<-----Step 3. Run Extract MPREADY Process (End... Successed)" | tee -a $LogFile
	echo "-----<<<<<-----Step 4. Run Extract DIO Check MPREADY Process (End... Successed)" | tee -a $LogFile
fi

AutoWatch 0

```

## MPBL\BL\Extract\bin\HGB_MPBL_Extract.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Extract.sh
--# Path : /extsoft/MPBL/BL/Extract/bin
--# SQL name : HGB_MPBL_Extract.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
   v_BILL_DATE      VARCHAR2(8)  := '&1'; 
   v_CYCLE          NUMBER(2)    := '&2'; 
   v_PROC_TYPE      VARCHAR2(1)  := 'B'; 
   CH_USER          VARCHAR2(8)  := 'MPBL';
   NU_BILL_SEQ      NUMBER;
   CH_ERR_CDE       VARCHAR2(10);
   CH_ERR_MSG       VARCHAR2(300);
   On_Err           EXCEPTION;
begin
        DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Extract Process...'); 
         SELECT A.BILL_SEQ
           INTO NU_BILL_SEQ
     FROM FY_TB_BL_BILL_CNTRL A
    WHERE A.BILL_DATE   =TO_DATE(v_BILL_DATE,'YYYYMMDD')
	and a.cycle =v_CYCLE
	and a.create_user =CH_USER;
    ----DIO 
    Fy_Pg_Dio_Util.Ins_Dio_MAST
                           ('UBL',     --Pi_Sys_Id ,
                            'MPMAST', --Pi_Proc_Id ,
                            NU_Bill_Seq ,
                            v_Proc_Type, 
                            'O',        --Pi_Io_Type,
                            CH_USER,
                            CH_Err_Cde,
                            CH_Err_Msg);                           
    IF CH_Err_Cde <> '0000' THEN
       RAISE ON_ERR;
    END IF; 
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||' END Extract Process...'); 
   DBMS_OUTPUT.Put_Line('Extract Process RETURN_CODE = 0000'||null);  
EXCEPTION 
   WHEN ON_ERR THEN
       DBMS_OUTPUT.Put_Line('Extract Process RETURN_CODE = 9999'||SUBSTR(' Extract'||ch_err_msg,1,250)); 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Extract Process RETURN_CODE = 9999'||SUBSTR(' Extract'||SQLERRM,1,250)); 
end;
/

exit;

```

## MPBL\BL\Preparation\bin\HGB_MPBL_Preparation_AR_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Preparation.sh
--# Path : /extsoft/UBL/BL/Preparation/bin
--# SQL name : HGB_UBL_Preparation_AR_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################
--# Date : 2021/03/04 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB add DBMS_OUTPUT NU_CNT_VALUE
--########################################################################################
--# Date : 2021/09/02 Created by Mike Kuan
--# Description : SR233414_行動裝置險月繳保費預繳專案
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STATUS        FY_TB_DIO_CNTRL.STATUS%TYPE;
  CH_IO_TYPE       FY_TB_DIO_CNTRL.IO_TYPE%TYPE;
  NU_CNT           NUMBER;
  NU_CNT_CHECK     NUMBER; 
  NU_CNT_VALUE     NUMBER; 
  On_Err           EXCEPTION;
CURSOR C1 IS
SELECT   status, b.COUNT p_count, c.COUNT c_count, d.COUNT d_count
    FROM fy_tb_dio_cntrl a,
         (SELECT COUNT (proc_id) COUNT
            FROM fy_tb_dio_cntrl a
           WHERE bill_seq = nu_bill_seq
             AND process_no = v_process_no
             AND acct_group = ch_acct_group
             AND proc_type = v_proc_type
             AND proc_id = 'BALANCE'
             AND confirm_id =
                    (SELECT MAX (confirm_id)
                       FROM fy_tb_dio_cntrl
                      WHERE bill_seq = a.bill_seq
                        AND process_no = a.process_no
                        AND acct_group = a.acct_group
                        AND proc_type = a.proc_type
                        AND proc_id = 'MPACCTLIST')) b,
         (SELECT COUNT (status) COUNT
            FROM fy_tb_dio_cntrl a
           WHERE bill_seq = nu_bill_seq
             AND process_no = v_process_no
             AND acct_group = ch_acct_group
             AND proc_type = v_proc_type
             AND proc_id = 'BALANCE'
             AND status = 'S'
             AND confirm_id =
                    (SELECT MAX (confirm_id)
                       FROM fy_tb_dio_cntrl
                      WHERE bill_seq = a.bill_seq
                        AND process_no = a.process_no
                        AND acct_group = a.acct_group
                        AND proc_type = a.proc_type
                        AND proc_id = 'MPACCTLIST')) c,(SELECT LAST_GRP_ID*2 COUNT
            FROM fy_tb_dio_cntrl a
           WHERE bill_seq = nu_bill_seq
             AND process_no = v_process_no
             AND acct_group = ch_acct_group
             AND proc_type = v_proc_type
             AND proc_id = 'MPACCTLIST'
             AND status = 'S'
             AND confirm_id =(SELECT MAX (confirm_id)
                FROM fy_Tb_dio_cntrl
                WHERE bill_seq = a.bill_seq
                AND process_no = a.process_no
                AND acct_group = a.acct_group
                AND proc_type  = a.proc_type 
                AND proc_id='MPACCTLIST')) d
   WHERE bill_seq = nu_bill_seq
     AND process_no = v_process_no
     AND acct_group = ch_acct_group
     AND proc_type = v_proc_type
     AND proc_id = 'BALANCE'
     AND confirm_id =
            (SELECT MAX (confirm_id)
               FROM fy_tb_dio_cntrl
              WHERE bill_seq = a.bill_seq
                AND process_no = a.process_no
                AND acct_group = a.acct_group
                AND proc_type = a.proc_type
                AND proc_id = 'MPACCTLIST')
ORDER BY DECODE (status, 'E', 1, 'A', 2, 'S', 3, 4);

begin
SELECT bill_seq,
       (CASE
           WHEN v_process_no <> 999
              THEN (SELECT acct_group
                      FROM fy_tb_bl_cycle_process
                     WHERE CYCLE = v_cycle AND process_no = v_process_no)
           ELSE (SELECT DECODE (v_proc_type, 'B', 'HOLD', 'QA')
                   FROM DUAL)
        END
       ) acct_group
  INTO nu_bill_seq,
       ch_acct_group
  FROM fy_tb_bl_bill_cntrl a
 WHERE a.bill_date = TO_DATE (v_bill_date, 'yyyymmdd')
   AND a.CYCLE = v_cycle
   AND a.create_user = ch_user;

CH_STATUS :='Y';
FOR R1 IN C1 LOOP
    IF R1.STATUS='E' THEN
        DBMS_OUTPUT.Put_Line('Preparation_AR_Check Process RETURN_CODE = 9999'); 
        RAISE ON_ERR;
    ELSIF R1.STATUS<>'S' THEN
        DBMS_OUTPUT.Put_Line('Preparation_AR_Check Processing'); 
        RAISE ON_ERR;
    END IF;
    CH_STATUS :='N';
    NU_CNT := R1.P_COUNT;
    NU_CNT_CHECK := R1.C_COUNT;
    NU_CNT_VALUE := R1.D_COUNT;
    DBMS_OUTPUT.Put_Line('CH_STATUS='||CH_STATUS||' ,NU_CNT='||NU_CNT||' ,NU_CNT_CHECK='||NU_CNT_CHECK||' ,NU_CNT_VALUE='||NU_CNT_VALUE);
END LOOP;

IF CH_STATUS='N' AND NU_CNT = NU_CNT_VALUE AND NU_CNT = NU_CNT_CHECK THEN
    DBMS_OUTPUT.Put_Line('Preparation_AR_Check Process RETURN_CODE = 0000'); 
ELSE   
    DBMS_OUTPUT.Put_Line('Preparation_AR_Check Processing'); 
END IF;

EXCEPTION 
   WHEN ON_ERR THEN
      NULL;
   WHEN OTHERS THEN
    DBMS_OUTPUT.Put_Line('Preparation_AR_Check Process RETURN_CODE = 9999'); 
end;
/

```

## MPBL\BL\Preparation\bin\HGB_MPBL_Preparation_ERROR_Check.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Preparation.sh
--# Path : /extsoft/MPBL/BL/Preparation/bin
--# SQL name : HGB_MPBL_Preparation_ERROR_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE       VARCHAR2(8)  := '&1';
v_CYCLE           NUMBER(2)    := '&2';
v_PROCESS_NO      NUMBER(3)    := '&3';
CH_USER           VARCHAR2(8)  := 'MPBL';
CH_BILL_DAY       VARCHAR2(2);
CH_HOLD_TABLE     VARCHAR2(30);
v_SQL             VARCHAR2(1000);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;

  CURSOR C1(ibill_seq number) IS
     select distinct ERR_CDE MSG, count(1) cnt
           from fy_tb_bl_bill_process_err B
          where B.bill_seq=ibill_seq
		  AND B.process_no   =v_PROCESS_NO
          group by b.ERR_CDE;  
		
begin 
   CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.BILL_SEQ, A.CYCLE_MONTH, substr(to_char(A.BILL_DATE,'yyyymmdd'),7,8) BILL_DAY
     INTO NU_BILL_SEQ, NU_CYCLE_MONTH, CH_BILL_DAY
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
	  AND A.CREATE_USER=CH_USER
	  --AND A.CREATE_USER=B.CREATE_USER
	  AND A.CYCLE=v_CYCLE
      AND B.CYCLE=A.CYCLE
      AND B.PROCESS_NO=v_PROCESS_NO;
   DBMS_OUTPUT.Put_Line('BILL_SEQ = '||NU_BILL_SEQ||' , CYCLE_MONTH = '||NU_CYCLE_MONTH||' , BILL_DAY = '||CH_BILL_DAY);

CH_HOLD_TABLE:='M'||CH_BILL_DAY||'_HOLD_LIST@prdappc.prdcm';
   DBMS_OUTPUT.Put_Line('OCS HOLD TABLE = '||CH_HOLD_TABLE);
   
--dynamic SQL insert OCS hold_list from HGB_MPBL acct_list
   DBMS_OUTPUT.Put_Line('start insert into '||CH_HOLD_TABLE);
   v_SQL:='INSERT INTO '||CH_HOLD_TABLE 
                      ||'(ba_no, '
                      ||' account_no, '
                      ||' format_ext_group, ' 
                      ||' customer_id, '
                      ||' hold_desc, '
                      ||' bf_undo, '
                      ||' bl_undo, '
                      ||' rerate, '
                      ||' insert_date, '
                      ||' cycle_code, '
                      ||' cycle_month, '
                      ||' cycle_seq_no, '
                      ||' cycle_year, '
                      ||' bu_qa, '
                      ||' hold_ind, '
                      ||' qa_group_name) '
             ||' SELECT DISTINCT d.ben,' 
                    ||'d.ban, '
                    ||'''0'', '
                    ||'d.customer_id, '
                    ||'''HGB_MPBL_Reject'', '
                    ||'''Y'', '
                    ||'''Y'', '
                    ||'''N'', '
                    ||'TO_DATE('''||TO_CHAR(SYSDATE,'YYYYMMDD')||''',''YYYYMMDD'')' ||',' 
                    ||'c.cycle_code, '
                    ||'c.cycle_instance, '
                    ||'c.cycle_seq_no, '
                    ||'c.cycle_year, '
                    ||'''Y'', '
                    ||'''Y'', '
                    ||'''HGB_MPBL_Reject'''
              ||' FROM fy_tb_bl_bill_process_err a, '
              ||' fy_tb_bl_bill_acct b, '
			  ||'(SELECT cycle_year, '
			  ||'cycle_instance, '
			  ||'cycle_code, '
              ||'cycle_seq_no'
                      ||' FROM bl1_cycle_control@prdappc.prdcm '
                     ||'WHERE cycle_seq_no = '||NU_BILL_SEQ
					 ||') c,'
              ||'csm_pay_channel@prdappc.prdcm'||' d '
            || ' WHERE a.bill_seq = '||NU_BILL_SEQ
            || '   and a.bill_seq = b.bill_seq '
            || '   and a.bill_seq = c.cycle_seq_no '
            || '   and a.process_no = '||v_PROCESS_NO
            || '   and a.acct_id = b.acct_id '
            || '   and a.acct_id = d.ban '
            || '   and b.bill_status = ''RJ'''	
            || '   and d.ben NOT IN (SELECT ba_no'
			|| ' FROM '||CH_HOLD_TABLE
			|| ' WHERE hold_desc LIKE ''HGB_MPBL_Reject'')';

execute immediate v_SQL;
   DBMS_OUTPUT.Put_Line('end insert into '||CH_HOLD_TABLE);
COMMIT;

FOR R1 IN C1(nu_bill_seq) LOOP
   DBMS_OUTPUT.Put_Line('Preparation ERROR Check MSG='||r1.MSG||', Cnt='||to_char(r1.cnt));
       DBMS_OUTPUT.Put_Line('Preparation ERROR Check Process RETURN_CODE = 0000'); 
end loop; 

EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line(CH_ERR_MSG||'Preparation ERROR Check Process RETURN_CODE = 9999'); 
end;
/

exit;

```

## MPBL\BL\Preparation\bin\HGB_MPBL_Preparation_MV_ACCT_Check.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Preparation.sh
--# Path : /extsoft/MPBL/BL/Preparation/bin
--# SQL name : HGB_MPBL_Preparation_MV_ACCT_Check.sql
--#
--# Date : 2021/09/02 Created by Mike Kuan
--# Description : SR233414_行動裝置險月繳保費預繳專案
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '888';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number, iacct_group varchar2) IS
     select nvl(
      (select count(1) cnt
       from fy_tb_bl_bill_acct b
      where b.bill_seq   =ibill_seq
        and b.acct_group =iacct_group
        and v_PROCESS_NO=888),0) cnt from dual;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO=888 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)       
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   AND A.CREATE_USER=CH_USER;
  FOR R1 IN C1(nu_bill_seq,CH_ACCT_GROUP) LOOP
     DBMS_OUTPUT.Put_Line(to_char(r1.cnt));  
  end loop; 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Preparation_MV_ACCT_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## MPBL\BL\Preparation\bin\HGB_MPBL_Preparation_STATUS_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Preparation.sh
--# Path : /extsoft/UBL/BL/Preparation/bin
--# SQL name : HGB_UBL_Preparation_STATUS_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number, iacct_group varchar2) IS
     select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_acct_list a,
			fy_tb_bl_bill_acct b
	  where a.bill_seq=ibill_seq
	    and a.type    =iacct_group
	    and b.bill_seq=a.bill_seq
	    and b.acct_id =a.acct_id
	  group by b.bill_status
	union
      select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_bill_acct b
	  where b.bill_seq   =ibill_seq
	    and b.acct_group =iacct_group
		and v_PROCESS_NO<>999
	  group by b.bill_status;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   AND A.CREATE_USER=CH_USER;
  FOR R1 IN C1(nu_bill_seq,CH_ACCT_GROUP) LOOP
     DBMS_OUTPUT.Put_Line('Preparation_STATUS_Check Status='||r1.status||', Cnt='||to_char(r1.cnt));  
  end loop; 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Preparation_STATUS_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## MPBL\BL\Preparation\bin\HGB_MPBL_Preparation_STEP_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Preparation.sh
--# Path : /extsoft/UBL/BL/Preparation/bin
--# SQL name : HGB_UBL_Preparation_STEP_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1 IS
     SELECT DECODE(STATUS,'CL','CI',
                   'CI','BI',
                   'BI','MAST',
                   'MAST','CN',
                   'CN','END',STATUS) STEP                            
       FROM FY_TB_BL_BILL_PROCESS_LOG BL 
      WHERE BILL_SEQ  = nu_BILL_SEQ
        AND PROCESS_NO= v_PROCESS_NO
        AND ACCT_GROUP= CH_ACCT_GROUP
        AND PROC_TYPE = v_PROC_TYPE
        AND BEGIN_TIME= (SELECT MAX(BEGIN_TIME) from FY_TB_BL_BILL_PROCESS_LOG 
                                           WHERE BILL_SEQ  = BL.BILL_SEQ
                                             AND PROCESS_No= BL.PROCESS_NO
                                             AND ACCT_GROUP= BL.ACCT_GROUP
                                             AND PROC_TYPE = BL.PROC_TYPE)
     order by DECODE(STATUS,'CL',1,'CI',2,'BI',3,'MAST',4,'CN',5,0) DESC; 
     R1     C1%ROWTYPE;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   and A.CREATE_USER=CH_USER;
  OPEN C1;
  FETCH C1 INTO R1;
  IF C1%NOTFOUND THEN  
     CH_STEP :='CI';
  ELSE
     CH_STEP := R1.STEP;
  END IF;
  CLOSE C1;
  IF CH_STEP NOT IN ('CI','BI','MAST','CN') THEN
     DBMS_OUTPUT.Put_Line('Preparation_STEP_Check Process RETURN_CODE = 9999'); 
  ELSE   
     DBMS_OUTPUT.Put_Line(CH_STEP);
  END IF;   
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Preparation_STEP_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## MPBL\BL\Preparation\bin\HGB_MPBL_Preparation.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_MPBL_Preparation.sh
# Path : /extsoft/MPBL/BL/Preparation/bin
#
# Date : 2021/02/20 Created by Mike Kuan
# Description : SR222460_MPBS migrate to HGB
########################################################################################
# Date : 2021/02/22 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB - fix SMS
########################################################################################
# Date : 2021/09/02 Created by Mike Kuan
# Description : SR233414_行動裝置險月繳保費預繳專案
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_MPBL_Preparation"
sysdt=`date +%Y%m%d%H%M%S`
BillDate=$1
Cycle=$2
ProcessNo=$3
HomeDir=/extsoft/MPBL/BL
WorkDir=$HomeDir/Preparation/bin
LogDir=$HomeDir/Preparation/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_${progName}.log
AutoWatchFileName=${BillDate}_${progName}.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`

#---------------------------------------------------------------------------------------#
#      FTP
#---------------------------------------------------------------------------------------# 
utilDir="/cb/BCM/util"
ftpProg="${utilDir}/Ftp2Remote.sh"
putip1='10.68.8.37'
putuser1=$OCSID
putpass1=$OCSPWD
putpath1=/cb/AutoWatch/log/joblog

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_MPBL_Preparation_MV_ACCT_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_MV_ACCT.data <<EOF
@HGB_MPBL_Preparation_MV_ACCT_Check.sql $1 $2
EOF`
cat ${LogDir}/${progName}_MV_ACCT.data |read ACCT
echo "MV Acct Count: ${ACCT}" | tee -a ${LogFile}
}

function HGB_MPBL_Preparation_STEP_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STEP.data <<EOF
@HGB_MPBL_Preparation_STEP_Check.sql $1 $2 $3
EOF`
cat ${LogDir}/${progName}_STEP.data |read STEP
echo "Step or Message: ${STEP}" | tee -a ${LogFile}
}

function HGB_MPBL_Preparation_STATUS_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STATUS.data <<EOF
@HGB_MPBL_Preparation_STATUS_Check.sql $1 $2 $3
EOF`
cat ${LogDir}/${progName}_STATUS.data | tee -a ${LogFile}
}

function HGB_MPBL_Preparation_CI
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_Preparation.sql $1 $2 $3 CI
exit
EOF`
}

function HGB_MPBL_Preparation_BI
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_Preparation.sql $1 $2 $3 BI
exit
EOF`
}

function HGB_MPBL_Preparation_AR_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_AR.data <<EOF
@HGB_MPBL_Preparation_AR_Check.sql $1 $2 $3
EOF`
cat ${LogDir}/${progName}_AR.data |read STATUS
}

function HGB_MPBL_Preparation_MAST
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_Preparation.sql $1 $2 $3 MAST
exit
EOF`
}

function HGB_MPBL_Preparation_ERROR_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_Error.data <<EOF
@HGB_MPBL_Preparation_ERROR_Check.sql $1 $2 $3
EOF`
cat ${LogDir}/${progName}_Error.data | tee -a ${LogFile}
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
   		echo "Send SMS (Failed)" | tee -a $LogFile
		sendSMS 0
		echo "FTP Command: ${ftpProg} ${putip1} ${putuser1} ******** ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0
   fi
   echo "Send Mail (Failed)" | tee -a $LogFile
   sendMail 0
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Succeeded)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
   		echo "Send SMS (Succeeded)" | tee -a $LogFile
		sendSMS 1
		echo "FTP Command: ${ftpProg} ${putip1} ${putuser1} ******** ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0
   fi
   echo "Send Mail (Succeeded)" | tee -a $LogFile
   sendMail 1
fi
exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
tar zcvf ${progName}_${sysdt}.tar.tgz ${progName}_${sysdt}.log
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Normal" -a ${progName}_${sysdt}.tar.tgz ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Succeeded.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
elif [[ $type -eq 2 ]]; then
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Start" ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Start.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Abnormal" -a ${progName}_${sysdt}.tar.tgz ${maillist}  << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
fi
}

function sendSMS
{
type=$1
	errorMessage=" Abnormal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	okMessage=" Normal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	startMessage=" Start! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	smslist=`cat $smsList`
	
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
	${smsProg} "${okMessage}" "${smslist}"
elif [[ $type -eq 2 ]]; then
	${smsProg} "${startMessage}" "${smslist}"
else
	${smsProg} "${errorMessage}" "${smslist}"
fi
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BILL_DATE> <CYCLE> <PROCESS_NO> "
	echo ""
    echo "For PROD example: $0 20210301 50 001"
    echo "For PROD example: $0 20210303 51 001"
    echo "For PROD example: $0 20210305 52 001"
    echo "For PROD example: $0 20210308 53 001"
    echo "For PROD example: $0 20210311 54 001"
    echo "For PROD example: $0 20210314 55 001"
    echo "For PROD example: $0 20210317 56 001"
    echo "For PROD example: $0 20210220 57 001"
    echo "For PROD example: $0 20210223 58 001"
    echo "For PROD example: $0 20210225 59 001"
	echo "For PROD example: $0 20210227 60 001"
    echo "For HOLD example: $0 20210301 50 999"
    echo "For HOLD example: $0 20210303 51 999"
    echo "For HOLD example: $0 20210305 52 999"
    echo "For HOLD example: $0 20210308 53 999"
    echo "For HOLD example: $0 20210311 54 999"
    echo "For HOLD example: $0 20210314 55 999"
    echo "For HOLD example: $0 20210317 56 999"
    echo "For HOLD example: $0 20210220 57 999"
    echo "For HOLD example: $0 20210223 58 999"
    echo "For HOLD example: $0 20210225 59 999"
	echo "For HOLD example: $0 20210227 60 999"
	echo ""
}

if [[ $# -lt 3 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_DATE : ${BillDate}" | tee -a $LogFile
echo "CYCLE : ${Cycle}" | tee -a $LogFile
echo "PROCESS_NO : ${ProcessNo}" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $DB = "HGBBL" ]]; then
	echo "Send SMS (Start)" | tee -a $LogFile
	sendSMS 2
	Pause
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
else
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
fi

cd ${WorkDir}
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Preparation MV ACCT Check
if [[ ${ProcessNo} -ne 999 ]]; then
	echo "----->>>>>-----Step 888. Run Preparation MV ACCT Check Process (Start...)" | tee -a $LogFile
	HGB_MPBL_Preparation_MV_ACCT_Check $BillDate $Cycle
	checkcode=`cat ${LogDir}/${progName}_MV_ACCT.data|grep -E 'ORA|ora|Preparation_MV_ACCT_Check Process RETURN_CODE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 888. Run Preparation MV ACCT Check Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
	if [[ ${ACCT}-${ACCT} -ne 0 ]]; then
		echo "-----<<<<<-----Step 888. Run Preparation MV ACCT Check Process (End...Get MV Acct Count Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
	echo "-----<<<<<-----Step 888. Run Preparation MV ACCT Check Process (End... Succeeded)" | tee -a $LogFile
fi
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Preparation Step Check
echo "----->>>>>-----Step 0. Run Preparation Step Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_Preparation_STEP_Check $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_STEP.data|grep -E 'ORA|ora|Preparation_STEP_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 0. Run Preparation Step Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 0. Run Preparation Step Check Process (End... Succeeded)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Preparation Status Check
echo "----->>>>>-----Step 1. Run Preparation Status Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_Preparation_STATUS_Check $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Preparation_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 1. Run Preparation Status Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 1. Run Preparation Status Check Process (End... Succeeded)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
if [[ ${STEP} == 'CI' ]]; then
#------------執行Preparation_CI, Preparation_BI, Preparation_MAST
	echo "----->>>>>-----Step 2. Run Preparation_CI Process (Start...)" | tee -a $LogFile
	HGB_MPBL_Preparation_CI $BillDate $Cycle $ProcessNo
	checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_CI Process RETURN_CODE = 9999'|wc -l`
		if [[ $checkcode -ge 1 ]]; then
			echo "-----<<<<<-----Step 2. Run Preparation_CI Process (End...Failed)" | tee -a $LogFile
			AutoWatch 1
		else
			echo "-----<<<<<-----Step 2. Run Preparation_CI Process (End... Succeeded)" | tee -a $LogFile
			Pause
			if [[ ${ProcessNo} -ne 999 ]]; then
				echo "----->>>>>-----Step 888. Run MV Preparation_CI Process (Start...)" | tee -a $LogFile
				if [[ ${ACCT} -ge 1 ]]; then #確認MV ACCT待process筆數
					HGB_MPBL_Preparation_CI $BillDate $Cycle 888
					checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_CI Process RETURN_CODE = 9999'|wc -l`
						if [[ $checkcode -ge 1 ]]; then
							echo "-----<<<<<-----Step 888. Run Preparation_CI Process (End...Failed)" | tee -a $LogFile
							AutoWatch 1
						fi
				else
					echo "MV Acct Count: ${ACCT}" | tee -a ${LogFile}
				fi
				echo "----->>>>>-----Step 888. Run MV Preparation_CI Process (End...)" | tee -a $LogFile
			Pause
			fi
			echo "----->>>>>-----Step 3. Run Preparation_BI Process (Start...)" | tee -a $LogFile
			HGB_MPBL_Preparation_BI $BillDate $Cycle $ProcessNo
			checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_BI Process RETURN_CODE = 9999'|wc -l`
				if [[ $checkcode -ge 1 ]]; then
					echo "-----<<<<<-----Step 3. Run Preparation_BI Process (End...Failed)" | tee -a $LogFile
					AutoWatch 1
				else
					echo "-----<<<<<-----Step 3. Run Preparation_BI Process (End... Succeeded)" | tee -a $LogFile
					Pause
					if [[ ${ProcessNo} -ne 999 ]]; then
						echo "----->>>>>-----Step 888. Run MV Preparation_BI Process (Start...)" | tee -a $LogFile
						if [[ ${ACCT} -ge 1 ]]; then #確認MV ACCT待process筆數
							HGB_MPBL_Preparation_BI $BillDate $Cycle 888
							checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_CI Process RETURN_CODE = 9999'|wc -l`
								if [[ $checkcode -ge 1 ]]; then
									echo "-----<<<<<-----Step 888. Run Preparation_BI Process (End...Failed)" | tee -a $LogFile
									AutoWatch 1
								fi
						else
							echo "MV Acct Count: ${ACCT}" | tee -a ${LogFile}
						fi
						echo "----->>>>>-----Step 888. Run MV Preparation_BI Process (End...)" | tee -a $LogFile
					fi
					Pause					
					run_cnt=0
					checkdone=0
					checkerror=0
					checkwait=0
						while [ $checkdone -eq 0 ] 
						do
							echo "----->>>>>-----Step 4. Run Preparation AR Check Process (Start...)" | tee -a $LogFile
							sleep 600
							HGB_MPBL_Preparation_AR_Check $BillDate $Cycle $ProcessNo
							checkdone=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Process RETURN_CODE = 0000'|wc -l`
							checkerror=`cat ${LogDir}/${progName}_AR.data|grep -E 'ORA|ora|Preparation_AR_Check Process RETURN_CODE = 9999'|wc -l`
							checkwait=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Processing'|wc -l`
							(( run_cnt++ ))
								if [[ $run_cnt -eq 20 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "!!! please check AR Balance to BL status, then rerun $0 $1 $2 $3 !!!" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif  [[ $checkerror -ge 1 ]]; then
									echo "Error Count : $checkerror"
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif [[ $checkwait -eq 1 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "----->>>>>-----Step 4. Run Preparation_AR_Check Processing" | tee -a $LogFile
									Pause
								else
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "Done Count : $checkdone" | tee -a $LogFile
									echo "Error Count : $checkerror" | tee -a $LogFile
									echo "Wait Count : $checkwait" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Succeeded)" | tee -a $LogFile
									Pause
								fi
						done
					echo "----->>>>>-----Step 5. Run Preparation_MAST Process (Start...)" | tee -a $LogFile
					HGB_MPBL_Preparation_MAST $BillDate $Cycle $ProcessNo
					checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_MAST Process RETURN_CODE = 9999'|wc -l`
						if [[ $checkcode -ge 1 ]]; then
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Failed)" | tee -a $LogFile
							AutoWatch 1
						else
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Succeeded)" | tee -a $LogFile
							Pause
							if [[ ${ProcessNo} -ne 999 ]]; then
								echo "----->>>>>-----Step 888. Run MV Preparation_MAST Process (Start...)" | tee -a $LogFile
								if [[ ${ACCT} -ge 1 ]]; then #確認MV ACCT待process筆數
									HGB_MPBL_Preparation_MAST $BillDate $Cycle 888
									checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_CI Process RETURN_CODE = 9999'|wc -l`
										if [[ $checkcode -ge 1 ]]; then
											echo "-----<<<<<-----Step 888. Run Preparation_MAST Process (End...Failed)" | tee -a $LogFile
											AutoWatch 1
										fi
								else
									echo "MV Acct Count: ${ACCT}" | tee -a ${LogFile}
								fi
								echo "----->>>>>-----Step 888. Run MV Preparation_MAST Process (End...)" | tee -a $LogFile
							fi
							Pause
						fi
				fi
		fi
#----------------------------------------------------------------------------------------------------
elif [[ ${STEP} == 'BI' ]]; then
#------------執行Preparation_BI, Preparation_MAST
			echo "--------------------Before Step... 2. Run Preparation_CI Process (End... Succeeded)--------------------" | tee -a $LogFile
			Pause
			echo "----->>>>>-----Step 3. Run Preparation_BI Process (Start...)" | tee -a $LogFile
			HGB_MPBL_Preparation_BI $BillDate $Cycle $ProcessNo
			checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_BI Process RETURN_CODE = 9999'|wc -l`
				if [[ $checkcode -ge 1 ]]; then
					echo "-----<<<<<-----Step 3. Run Preparation_BI Process (End...Failed)" | tee -a $LogFile
					AutoWatch 1
				else
					echo "-----<<<<<-----Step 3. Run Preparation_BI Process (End... Succeeded)" | tee -a $LogFile
					Pause
					if [[ ${ProcessNo} -ne 999 ]]; then
						echo "----->>>>>-----Step 888. Run MV Preparation_BI Process (Start...)" | tee -a $LogFile
						if [[ ${ACCT} -ge 1 ]]; then #確認MV ACCT待process筆數
							HGB_MPBL_Preparation_BI $BillDate $Cycle 888
							checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_CI Process RETURN_CODE = 9999'|wc -l`
								if [[ $checkcode -ge 1 ]]; then
									echo "-----<<<<<-----Step 888. Run Preparation_BI Process (End...Failed)" | tee -a $LogFile
									AutoWatch 1
								fi
						else
							echo "MV Acct Count: ${ACCT}" | tee -a ${LogFile}
						fi
						echo "----->>>>>-----Step 888. Run MV Preparation_BI Process (End...)" | tee -a $LogFile
					fi
					Pause
					run_cnt=0
					checkdone=0
					checkerror=0
					checkwait=0
						while [ $checkdone -eq 0 ] 
						do
							echo "----->>>>>-----Step 4. Run Preparation AR Check Process (Start...)" | tee -a $LogFile
							sleep 600
							HGB_MPBL_Preparation_AR_Check $BillDate $Cycle $ProcessNo
							checkdone=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Process RETURN_CODE = 0000'|wc -l`
							checkerror=`cat ${LogDir}/${progName}_AR.data|grep -E 'ORA|ora|Preparation_AR_Check Process RETURN_CODE = 9999'|wc -l`
							checkwait=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Processing'|wc -l`
							(( run_cnt++ ))
								if [[ $run_cnt -eq 20 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "!!! please check AR Balance to BL status, then rerun $0 $1 $2 $3 !!!" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif  [[ $checkerror -ge 1 ]]; then
									echo "Error Count : $checkerror"
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif [[ $checkwait -eq 1 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "----->>>>>-----Step 4. Run Preparation_AR_Check Processing" | tee -a $LogFile
									Pause
								else
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "Done Count : $checkdone" | tee -a $LogFile
									echo "Error Count : $checkerror" | tee -a $LogFile
									echo "Wait Count : $checkwait" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Succeeded)" | tee -a $LogFile
									Pause
								fi
						done
					echo "----->>>>>-----Step 5. Run Preparation_MAST Process (Start...)" | tee -a $LogFile
					HGB_MPBL_Preparation_MAST $BillDate $Cycle $ProcessNo
					checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_MAST Process RETURN_CODE = 9999'|wc -l`
						if [[ $checkcode -ge 1 ]]; then
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Failed)" | tee -a $LogFile
							AutoWatch 1
						else
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Succeeded)" | tee -a $LogFile
							Pause
							if [[ ${ProcessNo} -ne 999 ]]; then
								echo "----->>>>>-----Step 888. Run MV Preparation_MAST Process (Start...)" | tee -a $LogFile
								if [[ ${ACCT} -ge 1 ]]; then #確認MV ACCT待process筆數
									HGB_MPBL_Preparation_MAST $BillDate $Cycle 888
									checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_CI Process RETURN_CODE = 9999'|wc -l`
										if [[ $checkcode -ge 1 ]]; then
											echo "-----<<<<<-----Step 888. Run Preparation_MAST Process (End...Failed)" | tee -a $LogFile
											AutoWatch 1
										fi
								else
									echo "MV Acct Count: ${ACCT}" | tee -a ${LogFile}
								fi
								echo "----->>>>>-----Step 888. Run MV Preparation_MAST Process (End...)" | tee -a $LogFile
							fi
							Pause
						fi
				fi
#----------------------------------------------------------------------------------------------------
elif [[ ${STEP} == 'MAST' ]]; then
#------------執行Preparation_MAST
					echo "--------------------Before Step... 2. Run Preparation_CI Process (End... Succeeded)--------------------" | tee -a $LogFile
					echo "--------------------Before Step... 3. Run Preparation_BI Process (End... Succeeded)--------------------" | tee -a $LogFile
					Pause
					run_cnt=0
					checkdone=0
					checkerror=0
					checkwait=0
						while [ $checkdone -eq 0 ] 
						do
							echo "----->>>>>-----Step 4. Run Preparation AR Check Process (Start...)" | tee -a $LogFile
							sleep 600
							HGB_MPBL_Preparation_AR_Check $BillDate $Cycle $ProcessNo
							checkdone=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Process RETURN_CODE = 0000'|wc -l`
							checkerror=`cat ${LogDir}/${progName}_AR.data|grep -E 'ORA|ora|Preparation_AR_Check Process RETURN_CODE = 9999'|wc -l`
							checkwait=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Processing'|wc -l`
							(( run_cnt++ ))
								if [[ $run_cnt -eq 20 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "!!! please check AR Balance to BL status, then rerun $0 $1 $2 $3 !!!" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif  [[ $checkerror -ge 1 ]]; then
									echo "Error Count : $checkerror"
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif [[ $checkwait -eq 1 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "----->>>>>-----Step 4. Run Preparation_AR_Check Processing" | tee -a $LogFile
									Pause
								else
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "Done Count : $checkdone" | tee -a $LogFile
									echo "Error Count : $checkerror" | tee -a $LogFile
									echo "Wait Count : $checkwait" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Succeeded)" | tee -a $LogFile
									Pause
								fi
						done
					echo "----->>>>>-----Step 5. Run Preparation_MAST Process (Start...)" | tee -a $LogFile
					HGB_MPBL_Preparation_MAST $BillDate $Cycle $ProcessNo
					checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_MAST Process RETURN_CODE = 9999'|wc -l`
						if [[ $checkcode -ge 1 ]]; then
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Failed)" | tee -a $LogFile
							AutoWatch 1
						else
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Succeeded)" | tee -a $LogFile
							Pause
							if [[ ${ProcessNo} -ne 999 ]]; then
								echo "----->>>>>-----Step 888. Run MV Preparation_MAST Process (Start...)" | tee -a $LogFile
								if [[ ${ACCT} -ge 1 ]]; then #確認MV ACCT待process筆數
									HGB_MPBL_Preparation_MAST $BillDate $Cycle 888
									checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_CI Process RETURN_CODE = 9999'|wc -l`
										if [[ $checkcode -ge 1 ]]; then
											echo "-----<<<<<-----Step 888. Run Preparation_MAST Process (End...Failed)" | tee -a $LogFile
											AutoWatch 1
										fi
								else
									echo "MV Acct Count: ${ACCT}" | tee -a ${LogFile}
								fi
								echo "----->>>>>-----Step 888. Run MV Preparation_MAST Process (End...)" | tee -a $LogFile
							fi
							Pause
						fi
else
	echo "Preparation Status not in ('CI','BI','MAST')" | tee -a $LogFile
fi		
Pause

#----------------------------------------------------------------------------------------------------
#------------執行Preparation Status Check
echo "----->>>>>-----Step 6. Run Preparation Status Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_Preparation_STATUS_Check $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Preparation_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
	echo "-----<<<<<-----Step 6. Run Preparation Status Check Process (End...Failed)" | tee -a $LogFile
	AutoWatch 1
fi
echo "-----<<<<<-----Step 6. Run Preparation Status Check Process (End... Succeeded)" | tee -a $LogFile

#----------------------------------------------------------------------------------------------------
#------------執行Preparation ERROR Check
echo "----->>>>>-----Step 7. Run Preparation Error Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_Preparation_ERROR_Check $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_Error.data|grep -E 'ORA|ora|Preparation_Error_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
	echo "-----<<<<<-----Step 7. Run Preparation Error Check Process (End...Failed)" | tee -a $LogFile
	AutoWatch 1
fi
echo "-----<<<<<-----Step 7. Run Preparation Error Check Process (End... Succeeded)" | tee -a $LogFile
Pause
if [[ ${ProcessNo} -ne 999 ]]; then
	echo "----->>>>>-----Step 888. Run MV Preparation Error Check Process (Start...)" | tee -a $LogFile
		if [[ ${ACCT} -ge 1 ]]; then #確認MV ACCT待process筆數
			HGB_MPBL_Preparation_ERROR_Check $BillDate $Cycle 888
			checkcode=`cat ${LogDir}/${progName}_Error.data|grep -E 'ORA|ora|Preparation_Error_Check Process RETURN_CODE = 9999'|wc -l`
			if [[ $checkcode -ge 1 ]]; then
				echo "-----<<<<<-----Step 888. Run MV Preparation Error Check Process (End...Failed)" | tee -a $LogFile
				AutoWatch 1
			fi
		else
			echo "MV Acct Count: ${ACCT}" | tee -a ${LogFile}
		fi
	echo "----->>>>>-----Step 888. Run MV Preparation Error Check Process (End...)" | tee -a $LogFile
fi
	
AutoWatch 0

```

## MPBL\BL\Preparation\bin\HGB_MPBL_Preparation.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Preparation.sh
--# Path : /extsoft/UBL/BL/Preparation/bin
--# SQL name : HGB_UBL_Preparation_AR_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE       VARCHAR2(8)  := '&1';
v_CYCLE           NUMBER(2)    := '&2';
v_PROCESS_NO      NUMBER(3)    := '&3';
v_STEP            VARCHAR2(4)  := '&4';
v_PROC_TYPE       VARCHAR2(1)  := 'B';
CH_USER           VARCHAR2(8)  := 'MPBL';
NU_CYCLE          NUMBER(2);
CH_BILL_PERIOD    VARCHAR2(6);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ACCT_GROUP     FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;
begin 
	 CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.CYCLE, A.BILL_PERIOD, A.BILL_SEQ, A.CYCLE_MONTH, DECODE(V_PROCESS_NO,999,DECODE(V_PROC_TYPE,'T','QA',B.ACCT_GROUP),B.ACCT_GROUP)
     INTO NU_CYCLE, CH_BILL_PERIOD, NU_BILL_SEQ, NU_CYCLE_MONTH, CH_ACCT_GROUP
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
      AND A.CREATE_USER=CH_USER
	  --AND A.CREATE_USER=B.CREATE_USER
	  AND A.CYCLE     =v_CYCLE
      AND B.CYCLE     =A.CYCLE
      AND B.PROCESS_NO=v_PROCESS_NO;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':Preparation_'||v_STEP||' BEGIN');  
   IF v_STEP='CI' THEN
      FY_PG_BL_BILL_CI.MAIN(NU_BILL_SEQ,
                            v_PROCESS_NO,
                            CH_ACCT_GROUP,
                            v_PROC_TYPE,
                            CH_USER, 
                            CH_ERR_CDE, 
                            CH_ERR_MSG); 
      IF CH_ERR_CDE<>'0000' THEN
         RAISE ON_ERR;
      END IF;
   ELSIF v_STEP='BI' THEN   
      FY_PG_BL_BILL_BI.MAIN(NU_BILL_SEQ,
                            v_PROCESS_NO,
                            CH_ACCT_GROUP,
                            v_PROC_TYPE,
                            CH_USER, 
                            CH_ERR_CDE, 
                            CH_ERR_MSG); 
      IF CH_ERR_CDE<>'0000' THEN
         RAISE ON_ERR;
      END IF;   
   ELSIF v_STEP='MAST' THEN 
      FY_PG_BL_BILL_MAST.MAIN(NU_BILL_SEQ,
                              v_PROCESS_NO,
                              CH_ACCT_GROUP,
                              v_PROC_TYPE,
                              CH_USER, 
                              CH_ERR_CDE, 
                              CH_ERR_MSG); 
      IF CH_ERR_CDE<>'0000' THEN
         RAISE ON_ERR;
      END IF;  
   END IF;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':Preparation_'||v_STEP||' END');                       
	 DBMS_OUTPUT.Put_Line(CH_ERR_CDE||CH_ERR_MSG);  
EXCEPTION 
   WHEN ON_ERR THEN
       DBMS_OUTPUT.Put_Line('Preparation_'||v_STEP|| ' Process RETURN_CODE = 9999'); 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Preparation_'||v_STEP|| ' Process RETURN_CODE = 9999'); 
end;
/

exit;
```

## MPBL\BL\Surrounding\Create_OC\HGB_CREATE_OC.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_CREATE_OC.sh
# Path : /extsoft/MPBL/BL/Preparation/bin
#
# Date : 2020/07/08 Created by Mike Kuan
# Description : HGB CREATE OC by File
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
home="/extsoft/MPBL/BL/Surrounding/Create_OC"
sourceFileFolder="${home}/sourceFile"
sourceFile="${sourceFileFolder}/HGB_CREATE_OC.txt"
logFolder="${home}/log"
log="${logFolder}/HGB_CREATE_OC_`date +%Y%m%d%H%M%S`.log"
progName=$(basename $0 .sh)
echo "Program Name is:${progName}"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_CREATE_OC
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${logFolder}/${progName}.data <<EOF
@HGB_CREATE_OC.sql $1 $2 $3 $4 $5 $6 MPBL_ML
exit
EOF`
}

####################################################
# Main
####################################################
sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "DBID : ${DBID}" | tee -a $LogFile
echo "DBPWD : ${DBPWD}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo '' | tee -a $LogFile
cd ${home}
Pause

startDate=`date +%Y/%m/%d_%H:%M:%S`
echo "START: "$startDate | tee -a ${log}

#Check sourceFile exists
echo sourceFile exists | tee -a ${log}
echo '' | tee -a $LogFile
[ -f $sourceFile ] && echo "sourceFile exists" || exit 1
Pause

#read sourceFile to insert DB
echo "read sourceFile to insert DB" | tee -a ${log}
echo '' | tee -a $LogFile
cat ${sourceFile}|while read TYPE TYPE_ID BILL_PERIOD CHARGE_CODE AMOUNT DYNAMIC_ATTRIBUTE
do
echo ${TYPE} ${TYPE_ID} ${BILL_PERIOD} ${CHARGE_CODE} ${AMOUNT} ${DYNAMIC_ATTRIBUTE} | tee -a ${log}
HGB_CREATE_OC $TYPE $TYPE_ID $BILL_PERIOD $CHARGE_CODE $AMOUNT $DYNAMIC_ATTRIBUTE
done
Pause

#backup sourceFile to bak folder
echo "backup sourceFile to bak folder" | tee -a ${log}
echo '' | tee -a $LogFile
mv ${sourceFile} ${sourceFileFolder}/bak/HGB_CREATE_OC_`date +%Y%m%d%H%M%S`.txt
Pause

endDate=`date +%Y/%m/%d_%H:%M:%S`
echo "END: "$endDate | tee -a ${log}


```

## MPBL\BL\Surrounding\Create_OC\HGB_CREATE_OC.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Preparation.sh
--# Path : /extsoft/UBL/BL/Preparation/bin
--# SQL name : HGB_UBL_Preparation_AR_Check.sql
--#
--# Date : 2020/07/08 Created by Mike Kuan
--# Description : HGB CREATE OC
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

DECLARE
   V_TYPE               VARCHAR2(1)                              := '&1'; --'S/O/A'
   V_TYPE_ID            NUMBER                                   := '&2';
   V_BILL_PERIOD        FY_TB_BL_BILL_CNTRL.BILL_PERIOD%TYPE     := '&3'; --YYYYMM
   V_CHARGE_CODE        FY_TB_BL_BILL_CI.CHARGE_CODE%TYPE        := '&4';
   V_AMOUNT             FY_TB_BL_BILL_CI.AMOUNT%TYPE             := '&5';
   CH_DYNAMIC_ATTRIBUTE FY_TB_BL_BILL_CI.DYNAMIC_ATTRIBUTE%TYPE  := '&6';
   CH_USER              FY_TB_BL_BILL_CI.CREATE_USER%TYPE        := '&7';
   NU_CNT               NUMBER;
   CH_CHARGE_TYPE       FY_TB_BL_BILL_CI.CHARGE_TYPE%TYPE;
   CH_REVENUE_CODE      FY_TB_PBK_CHARGE_CODE.REVENUE_CODE%TYPE;
   NU_BILL_SEQ          FY_TB_BL_BILL_CNTRL.BILL_SEQ%TYPE;
   CH_STEP              VARCHAR2(300);
   On_Err               EXCEPTION;
   CURSOR C1 IS
      SELECT A.ACCT_ID, A.CUST_ID, A.SUBSCR_ID, B.CYCLE, C.CURRECT_PERIOD
        FROM FY_TB_CM_SUBSCR A,
             FY_TB_CM_CUSTOMER B,
             FY_TB_BL_CYCLE C
       WHERE A.SUBSCR_ID=V_TYPE_ID
         AND B.CUST_ID  =A.CUST_ID
         AND C.CYCLE    =B.CYCLE
         AND V_TYPE     ='S'     
    UNION  
      SELECT A.ACCT_ID, A.CUST_ID, NULL SUBSCR_ID, B.CYCLE, C.CURRECT_PERIOD
        FROM fy_tb_cm_org_unit A,
             FY_TB_CM_CUSTOMER B,
             FY_TB_BL_CYCLE C
       WHERE A.OU_ID    =V_TYPE_ID
         AND B.CUST_ID  =A.CUST_ID
         AND C.CYCLE    =B.CYCLE
         AND V_TYPE     ='O' 
    UNION  
      SELECT A.ACCT_ID, A.CUST_ID, NULL SUBSCR_ID, B.CYCLE, C.CURRECT_PERIOD
        FROM FY_TB_CM_ACCOUNT A,
             FY_TB_CM_CUSTOMER B,
             FY_TB_BL_CYCLE C
       WHERE A.ACCT_ID  =V_TYPE_ID
         AND B.CUST_ID  =A.CUST_ID
         AND C.CYCLE    =B.CYCLE
         AND V_TYPE     ='A'; 
   R1            C1%ROWTYPE;             
BEGIN
   OPEN C1;
   FETCH C1 INTO R1;
   IF C1%NOTFOUND THEN
      CH_STEP     := '系統中無此SUB、OU、ACCOUNT';
      RAISE ON_ERR;
   END IF;  
   CLOSE C1;
   
   --CHECK BILL_SEQ
   IF V_BILL_PERIOD=R1.CURRECT_PERIOD THEN
      NU_BILL_SEQ := NULL;
   ELSE
      SELECT BILL_SEQ 
        INTO NU_BILL_SEQ
        FROM FY_TB_BL_BILL_CNTRL
       WHERE CYCLE=R1.CYCLE
         AND BILL_PERIOD=V_BILL_PERIOD
         AND STATUS<>'CN';   
      R1.CURRECT_PERIOD :=V_BILL_PERIOD;  
   END IF;
   
   IF V_AMOUNT>=0 THEN
      CH_CHARGE_TYPE := 'DBT';
   ELSE
      CH_CHARGE_TYPE := 'CRD';   
   END IF;   

   CH_STEP := 'GET REVENUE_CODE.CHARGE_CODE='||V_CHARGE_CODE||':';
   SELECT REVENUE_CODE
     INTO CH_REVENUE_CODE
     FROM FY_TB_PBK_CHARGE_CODE
    WHERE CHARGE_CODE=V_CHARGE_CODE;

   CH_STEP := 'INSERT BILL_CI:';
   INSERT INTO FY_TB_BL_BILL_CI
                       (CI_SEQ,
                        ACCT_ID,
                        SUBSCR_ID,
                        CUST_ID,
                        OU_ID,
                        CHRG_ID,
                        CHARGE_TYPE,
                        AMOUNT,
                        OFFER_SEQ,
                        OFFER_ID,
                        OFFER_INSTANCE_ID,
                        PKG_ID,
                        CHRG_DATE,
                        CHRG_FROM_DATE,
                        CHRG_END_DATE,
                        CHARGE_CODE,
                        BILL_SEQ,
                        CYCLE,
                        CYCLE_MONTH,
                        TRX_ID,
                        TX_REASON,
                        AMT_DAY,
                        CDR_QTY,
                        CDR_ORG_AMT,
                        SOURCE,
                        SOURCE_CI_SEQ,
                        SOURCE_OFFER_ID,
                        BI_SEQ,
                        SERVICE_RECEIVER_TYPE,
                        CORRECT_SEQ,
                        CORRECT_CI_SEQ,
                        SERVICE_FILTER,
                        POINT_CLASS,
                        CET,
                        OVERWRITE,
                        DYNAMIC_ATTRIBUTE,
                        CREATE_DATE,
                        CREATE_USER,
                        UPDATE_DATE,
                        UPDATE_USER)
                 SELECT FY_SQ_BL_BILL_CI.NEXTVAL,
                        R1.ACCT_ID,
                        R1.SUBSCR_ID,
                        R1.CUST_ID,
                        DECODE(V_TYPE,'O',V_TYPE_ID,NULL) ,--OU_ID,
                        SUBSTR(V_CHARGE_CODE,3), --gvCHRG_ID,
                        CH_CHARGE_TYPE,
                        ROUND(V_AMOUNT,2),
                        NULL, --gnOFFER_SEQ,
                        NULL, --gnOFFER_ID,
                        NULL, --gnOFFER_INSTANCE_ID,
                        NULL, --gnPKG_ID,
                        SYSDATE, --gdBILL_DATE-1,   --CHRG_DATE,
                        NULL, --TRUNC(PI_START_DATE), --CHRG_FROM_DATE,
                        NULL, --TRUNC(PI_END_DATE),   --CHRG_END_DATE,
                        V_CHARGE_CODE,
                        NU_BILL_SEQ,
                        R1.CYCLE,
                        SUBSTR(R1.CURRECT_PERIOD,-2), --CYCLE_MONTH,
                        NULL,  --TRX_ID,
                        NULL,  --TX_REASON,
                        NULL,  --AMT_DAY,
                        NULL,  --CDR_QTY,
                        NULL,  --CDR_ORG_AMT
                        CH_REVENUE_CODE,  --SOURCE,
                        NULL,  --SOURCE_CI_SEQ,
                        NULL,  --SOURCE_OFFER_ID,
                        NULL,  --BI_SEQ,
                        V_TYPE, --SERVICE_RECEIVER_TYPE,
                        0,     --CORRECT_SEQ,
                        NULL,  --CORRECT_CI_SEQ,
                        NULL,  --SERVICE_FILTER,
                        NULL,  --POINT_CLASS,
                        NULL,  --CET,
                        NULL,  --OVERWRITE,
                        CH_DYNAMIC_ATTRIBUTE,  --DYNAMIC_ATTRIBUTE,
                        SYSDATE,
                        CH_USER,
                        SYSDATE,
                        CH_USER
                   FROM DUAL;
   COMMIT;
   DBMS_OUTPUT.Put_Line('0000');
EXCEPTION
   WHEN on_err THEN
      DBMS_OUTPUT.Put_Line('9999');
   WHEN OTHERS THEN
      DBMS_OUTPUT.Put_Line('9999');
END;
/

```

## MPBL\BL\Undo\bin\HGB_MPBL_Undo_MV_ACCT_Check.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Undo.sh
--# Path : /extsoft/MPBL/BL/Undo/bin
--# SQL name : HGB_MPBL_Undo_MV_ACCT_Check.sql
--#
--# Date : 2021/09/02 Created by Mike Kuan
--# Description : SR233414_行動裝置險月繳保費預繳專案
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '888';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number, iacct_group varchar2) IS
     select nvl(
      (select count(1) cnt
       from fy_tb_bl_bill_acct b
      where b.bill_seq   =ibill_seq
        and b.acct_group =iacct_group
        and v_PROCESS_NO=888),0) cnt from dual;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO=888 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)    
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   AND A.CREATE_USER=CH_USER;
  FOR R1 IN C1(nu_bill_seq,CH_ACCT_GROUP) LOOP
     DBMS_OUTPUT.Put_Line(to_char(r1.cnt));  
  end loop; 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Undo_MV_ACCT_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## MPBL\BL\Undo\bin\HGB_MPBL_Undo_Pre.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Undo.sh
--# Path : /extsoft/MPBL/BL/Undo/bin
--# SQL name : HGB_MPBL_Undo_Pre.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################
--# Date : 2021/09/02 Created by Mike Kuan
--# Description : SR233414_行動裝置險月繳保費預繳專案
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE       VARCHAR2(8)  := '&1';
v_CYCLE           NUMBER(2)    := '&2';
v_PROCESS_NO      NUMBER(3)    := '&3';
v_USER            VARCHAR2(8)  := 'MPBL';
CH_BILL_DAY       VARCHAR2(2);
CH_HOLD_TABLE     VARCHAR2(30);
v_SQL             VARCHAR2(3000);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;

  CURSOR C1(ibill_seq number) IS
     select '999: '||count(1) cnt
           from fy_tb_bl_acct_list
          where bill_seq=ibill_seq
          AND CYCLE   =v_CYCLE
          AND TYPE='HOLD'
          AND v_PROCESS_NO=999
    UNION
      SELECT '001: '||COUNT(1) cnt
        FROM FY_TB_BL_BILL_ACCT
       WHERE bill_seq=ibill_seq
         AND ACCT_GROUP='G001'
         AND v_PROCESS_NO<>999
    UNION
      SELECT '888: '||COUNT(1) cnt
        FROM FY_TB_BL_BILL_ACCT
       WHERE bill_seq=ibill_seq
         AND ACCT_GROUP='MV'
         AND v_PROCESS_NO<>999;
          
begin 
   CH_ERR_MSG := 'GET BILL_CNTRL:';
   
   SELECT A.BILL_SEQ, A.CYCLE_MONTH, substr(to_char(A.BILL_DATE,'yyyymmdd'),7,8) BILL_DAY
     INTO NU_BILL_SEQ, NU_CYCLE_MONTH, CH_BILL_DAY
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
      AND A.CREATE_USER=v_USER
      --AND A.CREATE_USER=B.CREATE_USER
      AND A.CYCLE=v_CYCLE
      AND B.CYCLE=A.CYCLE
      AND B.PROCESS_NO=v_PROCESS_NO;

   DBMS_OUTPUT.Put_Line('BILL_SEQ = '||NU_BILL_SEQ||' , CYCLE_MONTH = '||NU_CYCLE_MONTH||' , BILL_DAY = '||CH_BILL_DAY);

CH_HOLD_TABLE:='M'||CH_BILL_DAY||'_HOLD_LIST@prdappc.prdcm';
   DBMS_OUTPUT.Put_Line('OCS HOLD TABLE = '||CH_HOLD_TABLE);
   
--dynamic SQL insert HGB_MPBL acct_list from OCS hold_list
   DBMS_OUTPUT.Put_Line('start insert into fy_tb_bl_acct_list');
   v_SQL:='INSERT INTO fy_tb_bl_acct_list '
                      ||'(bill_seq, '
                      ||' acct_id, '
                      ||' bill_start_period, ' 
                      ||' bill_end_period, '
                      ||' bill_end_date, '
                      ||' type, '
                      ||' hold_desc, '
                      ||' uc_flag, '
                      ||' create_date, '
                      ||' create_user, '
                      ||' update_date, '
                      ||' update_user, '
                      ||' cycle_month, '
                      ||' cycle, '
                      ||' cust_id) '
             ||' SELECT distinct a.bill_seq,' 
                    ||'b.acct_id, '
                    ||'a.bill_period, '
                    ||'a.bill_period, '
                    ||'a.bill_end_date, '
                    ||'''HOLD'', '
                    ||'''OCS'', '
                    ||'''Y'', '
                    ||'TO_DATE('''||TO_CHAR(SYSDATE,'YYYYMMDD')||''',''YYYYMMDD'')' ||',' 
                    ||'''MPBL'', '
                    ||'TO_DATE('''||TO_CHAR(SYSDATE,'YYYYMMDD')||''',''YYYYMMDD'')' ||',' 
                    ||'''MPBL'', ' 
                    ||'a.cycle_month, '
                    ||'a.CYCLE, '
                    ||'b.cust_id '
              ||' FROM fy_tb_bl_bill_cntrl a, '
              ||' fy_tb_bl_bill_acct b, '
              ||CH_HOLD_TABLE||' c '
            || ' WHERE a.bill_seq = '||NU_BILL_SEQ
            || '   and a.bill_seq = b.bill_seq '
            || '   and a.bill_seq = c.cycle_seq_no '			
            || '   and b.acct_id = c.account_no '
            || '   AND b.bill_status != ''CN'''
            || '   AND NOT EXISTS (SELECT 1'
            ||' FROM fy_tb_bl_acct_list d '
            ||' WHERE d.bill_seq = b.bill_seq '
            ||' AND d.acct_id = b.acct_id) ';
   --DBMS_OUTPUT.Put_Line(v_SQL);
execute immediate v_SQL;
   DBMS_OUTPUT.Put_Line('end insert into fy_tb_bl_acct_list');
commit;

FOR R1 IN C1(nu_bill_seq) LOOP
   DBMS_OUTPUT.Put_Line('ACCT_LIST HOLD Acct Cnt='||to_char(r1.cnt));
   DBMS_OUTPUT.Put_Line('Undo_Pre Process RETURN_CODE = 0000'); 
end loop; 

EXCEPTION 
   WHEN OTHERS THEN
   DBMS_OUTPUT.Put_Line('Undo_Pre Process RETURN_CODE = 9999'); 
end;
/

exit;

```

## MPBL\BL\Undo\bin\HGB_MPBL_Undo_STATUS_Check.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Undo.sh
--# SQL name : HGB_MPBL_Undo_STATUS_Check.sql
--# Path : /extsoft/MPBL/BL/Undo/bin
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number, iacct_group varchar2) IS
     select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_acct_list a,
			fy_tb_bl_bill_acct b
	  where a.bill_seq=ibill_seq
	    and a.type    =iacct_group
	    and b.bill_seq=a.bill_seq
	    and b.acct_id =a.acct_id
		and v_PROCESS_NO=999
	  group by b.bill_status
	union
      select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_bill_acct b
	  where b.bill_seq   =ibill_seq
	    and b.acct_group =iacct_group
		and v_PROCESS_NO<>999
	  group by b.bill_status;	
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and a.cycle=v_CYCLE
   AND A.CREATE_USER =CH_USER;
  FOR R1 IN C1(nu_bill_seq,CH_ACCT_GROUP) LOOP
     DBMS_OUTPUT.Put_Line('Undo_STATUS_Check Status='||r1.status||', Cnt='||to_char(r1.cnt));  
  end loop; 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Undo_STATUS_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## MPBL\BL\Undo\bin\HGB_MPBL_Undo_STEP_Check.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Undo.sh
--# SQL name : HGB_MPBL_Undo_STEP_Check.sql
--# Path : /extsoft/MPBL/BL/Undo/bin
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'MPBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1 IS
     SELECT DECODE(STATUS,'CL','CI',
                   'CI','BI',
                   'BI','MAST',
                   'MAST','CN',
                   'CN','END',STATUS) STEP                            
       FROM FY_TB_BL_BILL_PROCESS_LOG BL 
      WHERE BILL_SEQ  = nu_BILL_SEQ
        AND PROCESS_NO= v_PROCESS_NO
        AND ACCT_GROUP= CH_ACCT_GROUP
        AND PROC_TYPE = v_PROC_TYPE
        AND BEGIN_TIME= (SELECT MAX(BEGIN_TIME) from FY_TB_BL_BILL_PROCESS_LOG 
                                           WHERE BILL_SEQ  = BL.BILL_SEQ
                                             AND PROCESS_No= BL.PROCESS_NO
                                             AND ACCT_GROUP= BL.ACCT_GROUP
                                             AND PROC_TYPE = BL.PROC_TYPE)
     order by DECODE(STATUS,'CL',1,'CI',2,'BI',3,'MAST',4,'CN',5,0) DESC; 
     R1     C1%ROWTYPE;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date=to_date(v_BILL_DATE,'yyyymmdd')
   and a.cycle=v_CYCLE
   and A.CREATE_USER=CH_USER;
  OPEN C1;
  FETCH C1 INTO R1;
  IF C1%NOTFOUND THEN  
     CH_STEP :='CI';
  ELSE
     CH_STEP := R1.STEP;
  END IF;
  CLOSE C1;
  IF CH_STEP NOT IN ('CI','BI','MAST','CN') THEN
     IF v_PROCESS_NO=999 AND v_PROC_TYPE='B' AND CH_STEP='END' THEN
        DBMS_OUTPUT.Put_Line(CH_STEP);
     ELSE   
        DBMS_OUTPUT.Put_Line('Undo_STEP_Check Process RETURN_CODE = 9999'); 
     END IF;   
  ELSE   
     DBMS_OUTPUT.Put_Line(CH_STEP);
  END IF;   
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Undo_STEP_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## MPBL\BL\Undo\bin\HGB_MPBL_Undo.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_MPBL_Undo.sh
# Path : /extsoft/MPBL/BL/Undo/bin
#
# Date : 2021/02/20 Created by Mike Kuan
# Description : SR222460_MPBS migrate to HGB
########################################################################################
# Date : 2021/02/22 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB - fix SMS
########################################################################################
# Date : 2021/02/24 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB - add UPDATE_ACCT_LIST
########################################################################################
# Date : 2021/09/02 Modify by Mike Kuan
# Description : SR233414_行動裝置險月繳保費預繳專案
########################################################################################
# Date : 2021/09/09 Modify by Mike Kuan
# Description : 增加正式環境Undo筆數檢核，避免無筆數時Process Log遭刪除，使BLE2空等
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_MPBL_Undo"
sysdt=`date +%Y%m%d%H%M%S`
BillDate=$1
Cycle=$2
ProcessNo=$3
HomeDir=/extsoft/MPBL/BL
WorkDir=$HomeDir/Undo/bin
LogDir=$HomeDir/Undo/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_${progName}.log
AutoWatchFileName=${BillDate}_${progName}.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`

#---------------------------------------------------------------------------------------#
#      FTP
#---------------------------------------------------------------------------------------# 
utilDir="/cb/BCM/util"
ftpProg="${utilDir}/Ftp2Remote.sh"
putip1='10.68.8.37'
putuser1=$OCSID
putpass1=$OCSPWD
putpath1=/cb/AutoWatch/log/joblog

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_MPBL_Undo_MV_ACCT_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_MV_ACCT.data <<EOF
@HGB_MPBL_Undo_MV_ACCT_Check.sql $1 $2
EOF`
cat ${LogDir}/${progName}_MV_ACCT.data |read ACCT
echo "MV Acct Count: ${ACCT}" | tee -a ${LogFile}
}

function HGB_MPBL_Undo_STEP_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STEP.data <<EOF
@HGB_MPBL_Undo_STEP_Check.sql $1 $2 $3
EOF`
cat ${LogDir}/${progName}_STEP.data |read STEP
echo "Step or Message: ${STEP}" | tee -a ${LogFile}
}

function HGB_MPBL_Undo_Pre
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_Pre.data <<EOF
@HGB_MPBL_Undo_Pre.sql $1 $2 $3
EOF`
cat ${LogDir}/${progName}_Pre.data | tee -a ${LogFile}
}

function HGB_MPBL_UPDATE_ACCT_LIST
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_UPDATE_ACCT_LIST.data <<EOF
@HGB_MPBL_UPDATE_ACCT_LIST.sql $1 $2
EOF`
cat ${LogDir}/${progName}_UPDATE_ACCT_LIST.data | tee -a ${LogFile}
}

function HGB_MPBL_Undo_STATUS_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STATUS.data <<EOF
@HGB_MPBL_Undo_STATUS_Check.sql $1 $2 $3
EOF`
cat ${LogDir}/${progName}_STATUS.data | tee -a ${LogFile}
}

function HGB_MPBL_Undo
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_MPBL_Undo.sql $1 $2 $3
exit
EOF`
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
   		echo "Send SMS (Failed)" | tee -a $LogFile
		sendSMS 0
		echo "FTP Command: ${ftpProg} ${putip1} ${putuser1} ******** ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0
   fi
   echo "Send Mail (Failed)" | tee -a $LogFile
   sendMail 0
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Succeeded)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
   		echo "Send SMS (Succeeded)" | tee -a $LogFile
		sendSMS 1
		echo "FTP Command: ${ftpProg} ${putip1} ${putuser1} ******** ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${AutoWatchDir} ${putpath1} ${AutoWatchFileName} 0
   fi
   echo "Send Mail (Succeeded)" | tee -a $LogFile
   sendMail 1
fi
exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
tar zcvf ${progName}_${sysdt}.tar.tgz ${progName}_${sysdt}.log
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Normal" -a ${progName}_${sysdt}.tar.tgz ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Succeeded.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
elif [[ $type -eq 2 ]]; then
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Start" ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Start.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB_MPBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Abnormal" -a ${progName}_${sysdt}.tar.tgz ${maillist}  << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
fi
}

function sendSMS
{
type=$1
	errorMessage=" Abnormal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	okMessage=" Normal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	startMessage=" Start! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	smslist=`cat $smsList`
	
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
	${smsProg} "${okMessage}" "${smslist}"
elif [[ $type -eq 2 ]]; then
	${smsProg} "${startMessage}" "${smslist}"
else
	${smsProg} "${errorMessage}" "${smslist}"
fi
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BILL_DATE> <CYCLE> <PROCESS_NO> "
	echo ""
    echo "For PROD example: $0 20210301 50 001"
    echo "For PROD example: $0 20210303 51 001"
    echo "For PROD example: $0 20210305 52 001"
    echo "For PROD example: $0 20210308 53 001"
    echo "For PROD example: $0 20210311 54 001"
    echo "For PROD example: $0 20210314 55 001"
    echo "For PROD example: $0 20210317 56 001"
    echo "For PROD example: $0 20210220 57 001"
    echo "For PROD example: $0 20210223 58 001"
    echo "For PROD example: $0 20210225 59 001"
	echo "For PROD example: $0 20210227 60 001"
    echo "For HOLD example: $0 20210301 50 999"
    echo "For HOLD example: $0 20210303 51 999"
    echo "For HOLD example: $0 20210305 52 999"
    echo "For HOLD example: $0 20210308 53 999"
    echo "For HOLD example: $0 20210311 54 999"
    echo "For HOLD example: $0 20210314 55 999"
    echo "For HOLD example: $0 20210317 56 999"
    echo "For HOLD example: $0 20210220 57 999"
    echo "For HOLD example: $0 20210223 58 999"
    echo "For HOLD example: $0 20210225 59 999"
	echo "For HOLD example: $0 20210227 60 999"
	echo ""
}

if [[ $# -lt 3 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_DATE : ${BillDate}" | tee -a $LogFile
echo "CYCLE : ${Cycle}" | tee -a $LogFile
echo "PROCESS_NO : ${ProcessNo}" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $DB = "HGBBL" ]]; then
	echo "Send SMS (Start)" | tee -a $LogFile
	sendSMS 2
	Pause
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
else
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
fi

cd ${WorkDir}
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Preparation MV ACCT Check
if [[ ${ProcessNo} -ne 999 ]]; then
	echo "----->>>>>-----Step 888. Run Undo MV ACCT Check Process (Start...)" | tee -a $LogFile
	HGB_MPBL_Undo_MV_ACCT_Check $BillDate $Cycle
	checkcode=`cat ${LogDir}/${progName}_MV_ACCT.data|grep -E 'ORA|ora|Undo_MV_ACCT_Check Process RETURN_CODE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 888. Run Undo MV ACCT Check Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
	if [[ ${ACCT}-${ACCT} -ne 0 ]]; then
		echo "-----<<<<<-----Step 888. Run Undo MV ACCT Check Process (End...Get MV Acct Count Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
	echo "-----<<<<<-----Step 888. Run Undo MV ACCT Check Process (End... Succeeded)" | tee -a $LogFile
fi
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Undo Step Check
echo "----->>>>>-----Step 1. Run Undo Step Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_Undo_STEP_Check $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_STEP.data|grep -E 'ORA|ora|Undo_STEP_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 1. Run Undo Step Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 1. Run Undo Step Check Process (End... Succeeded)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Pre Undo
echo "----->>>>>-----Step 2. Run Undo Pre Process (Start...)" | tee -a $LogFile
HGB_MPBL_Undo_Pre $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_Pre.data|grep -E 'ORA|ora|Undo_Pre Process RETURN_CODE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 2. Run Undo Pre Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
echo "-----<<<<<-----Step 2. Run Undo Pre Process (End... Succeeded)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行UPDATE ACCT LIST
echo "----->>>>>-----Step 3. Run UPDATE ACCT LIST Process (Start...)" | tee -a $LogFile
HGB_MPBL_UPDATE_ACCT_LIST $BillDate $Cycle
checkcode=`cat ${LogDir}/${progName}_UPDATE_ACCT_LIST.data|grep -E 'ORA|ora|update FY_TB_BL_ACCT_LIST.TYPE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 3. Run UPDATE ACCT LIST Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
	if [[ $DB = "HGBBL" ]]; then
	HOLD_COUNT=`cat ${LogDir}/${progName}_UPDATE_ACCT_LIST.data | grep "HOLD_COUNT=" | awk -F'=' '{print $2}'| awk -F' ' '{print $1}'`
		if [[ $HOLD_COUNT -eq 0 ]]; then
			echo "HOLD_COUNT: ${HOLD_COUNT}" | tee -a ${LogFile}
			echo "-----<<<<<-----Step 3. Run UPDATE ACCT LIST Process (End...No Processed Data Found)" | tee -a $LogFile
			AutoWatch 0
		else
			echo "HOLD_COUNT: ${HOLD_COUNT}" | tee -a ${LogFile}
		fi
	fi
echo "-----<<<<<-----Step 3. Run UPDATE ACCT LIST Process (End... Succeeded)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Undo STATUS Check
echo "----->>>>>-----Step 4. Run Undo STATUS Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_Undo_STATUS_Check $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Undo_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 4. Run Undo STATUS Check Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
echo "-----<<<<<-----Step 4. Run Undo STATUS Check Process (End... Succeeded)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#if [[ ${STEP} == 'CN' || ${STEP} == 'MAST' || ${STEP} == 'BI' ]]; then
#------------執行Undo
echo "----->>>>>-----Step 5. Run Undo Process (Start...)" | tee -a $LogFile
HGB_MPBL_Undo $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Undo Process RETURN_CODE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 5. Run Undo Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	else
		echo '' | tee -a $LogFile
		echo "-----<<<<<-----Step 5. Run Undo Process (End... Succeeded)" | tee -a $LogFile
	fi
Pause
#----------------------------------------------------------------------------------------------------
#if [[ ${STEP} == 'CN' || ${STEP} == 'MAST' || ${STEP} == 'BI' ]]; then
#------------執行MV Undo
if [[ ${ProcessNo} -ne 999 ]]; then
	echo "----->>>>>-----Step 888. Run MV Undo Process (Start...)" | tee -a $LogFile
		if [[ ${ACCT} -ge 1 ]]; then #確認MV ACCT待undo筆數
			HGB_MPBL_Undo $BillDate $Cycle 888
			checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Undo Process RETURN_CODE = 9999'|wc -l`
				if [[ $checkcode -ge 1 ]]; then
					echo "-----<<<<<-----Step 888. Run MV Undo Process (End...Failed)" | tee -a $LogFile
					AutoWatch 1
				fi
		else
			echo "MV ACCT is : ${ACCT}" | tee -a $LogFile
		fi
	echo '' | tee -a $LogFile
	echo "-----<<<<<-----Step 888. Run MV Undo Process (End... Succeeded)" | tee -a $LogFile
fi
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Undo STATUS Check
echo "----->>>>>-----Step 6. Run Undo STATUS Check Process (Start...)" | tee -a $LogFile
HGB_MPBL_Undo_STATUS_Check $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Undo_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 6. Run Undo STATUS Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 6. Run Undo STATUS Check Process (End... Succeeded)" | tee -a $LogFile

AutoWatch 0

```

## MPBL\BL\Undo\bin\HGB_MPBL_Undo.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Undo.sh
--# SQL name : HGB_MPBL_Undo.sql
--# Path : /extsoft/MPBL/BL/Undo/bin
--#
--# Date : 2020/03/24 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE 	  VARCHAR2(8)  := '&1';
v_CYCLE           NUMBER(2)    := '&2';
v_PROCESS_NO      NUMBER(3)    := '&3';
v_PROC_TYPE       VARCHAR2(1)  := 'B';
v_USER            VARCHAR2(8)  := 'MPBL';
NU_CYCLE          NUMBER(2);
CH_BILL_PERIOD    VARCHAR2(6);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ACCT_GROUP     FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;
begin 
	 CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.CYCLE, A.BILL_PERIOD, A.BILL_SEQ, A.CYCLE_MONTH, DECODE(V_PROCESS_NO,999,DECODE(V_PROC_TYPE,'T','QA',B.ACCT_GROUP),B.ACCT_GROUP)
     INTO NU_CYCLE, CH_BILL_PERIOD, NU_BILL_SEQ, NU_CYCLE_MONTH, CH_ACCT_GROUP
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
	  AND A.CREATE_USER=v_USER
	  --AND A.CREATE_USER=B.CREATE_USER
	  AND A.CYCLE=v_CYCLE
	  AND B.CYCLE     =A.CYCLE
      AND B.PROCESS_NO=v_PROCESS_NO;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':UNDO BEGIN');
   --update fy_tb_bl_bill_acct										
   FY_PG_BL_BILL_UNDO.MAIN(NU_BILL_SEQ,
                           v_PROCESS_NO,
                           CH_ACCT_GROUP,
                           v_PROC_TYPE,
                           v_USER, 
                           CH_ERR_CDE, 
                           CH_ERR_MSG); 
   IF CH_ERR_CDE<>'0000' THEN
      CH_ERR_MSG := 'FY_PG_BL_BILL_CI:'||CH_ERR_MSG;
      RAISE ON_ERR;
   END IF;
   if v_PROCESS_NO=999 and v_PROC_TYPE='B' then
      update fy_tb_bl_bill_acct a set acct_group='HOLD'
	                    where bill_seq   =nu_bill_seq
						  and cycle      =nu_cycle
						  and cycle_month=nu_cycle_month
						  and acct_key   =mod(acct_id,100)
						  and bill_status <>'CN'
						  and exists (select 1 from fy_tb_bl_acct_list
						                  where bill_seq=nu_bill_seq
										    and type=ch_acct_group
											and acct_id=a.acct_id);
   commit;
   end if;	
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':UNDO END');   
	 DBMS_OUTPUT.Put_Line(CH_ERR_CDE||CH_ERR_MSG);  
EXCEPTION 
   WHEN ON_ERR THEN
       DBMS_OUTPUT.Put_Line('Undo Process RETURN_CODE = 9999');
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Undo Process RETURN_CODE = 9999'); 
end;
/

exit;
```

## MPBL\BL\Undo\bin\HGB_MPBL_UPDATE_ACCT_LIST.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Undo.sh
--# Program name : HGB_MPBL_Confirm.sh
--# Path : /extsoft/MPBL/BL/Undo/bin
--# Path : /extsoft/MPBL/BL/Confirm/bin
--# SQL name : HGB_MPBL_UPDATE_ACCT_LIST.sql
--#
--# Date : 2021/02/19 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE       VARCHAR2(8)  := '&1';
v_CYCLE           NUMBER(2)    := '&2';
v_PROCESS_NO      NUMBER(3)    := '999';
CH_USER           VARCHAR2(8)  := 'MPBL';
CH_BILL_DAY       VARCHAR2(2);
CH_HOLD_TABLE     VARCHAR2(30);
v_SQL1             VARCHAR2(1000);
v_SQL2            VARCHAR2(1000);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;

  CURSOR C1(ibill_seq number) IS
	SELECT h.hold_count, c.confirm_count, ced.confirmed_count
	FROM (SELECT COUNT (1) hold_count
			FROM fy_tb_bl_acct_list
			WHERE bill_seq = ibill_seq AND TYPE = 'HOLD') h,
		(SELECT COUNT (1) confirm_count
			FROM fy_tb_bl_acct_list
			WHERE bill_seq = ibill_seq AND TYPE = 'CONF') c,
		(SELECT COUNT (1) confirmed_count
			FROM fy_tb_bl_acct_list
			WHERE bill_seq = ibill_seq
			AND TYPE LIKE 'CONF%'
			AND TYPE NOT IN ('HOLD', 'CONF')) ced;
		
begin 
   CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.BILL_SEQ, A.CYCLE_MONTH, substr(to_char(A.BILL_DATE,'yyyymmdd'),7,8) BILL_DAY
     INTO NU_BILL_SEQ, NU_CYCLE_MONTH, CH_BILL_DAY
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
	  AND A.CREATE_USER=CH_USER
	  AND A.CYCLE=v_CYCLE
      AND B.CYCLE=A.CYCLE
      AND B.PROCESS_NO=v_PROCESS_NO;
   DBMS_OUTPUT.Put_Line('BILL_SEQ = '||NU_BILL_SEQ||' , CYCLE_MONTH = '||NU_CYCLE_MONTH||' , BILL_DAY = '||CH_BILL_DAY);

CH_HOLD_TABLE:='M'||CH_BILL_DAY||'_HOLD_LIST@prdappc.prdcm';
   DBMS_OUTPUT.Put_Line('OCS HOLD TABLE = '||CH_HOLD_TABLE);
   
--dynamic SQL update HGB_MPBL acct_list from OCS hold_list
   DBMS_OUTPUT.Put_Line('start update FY_TB_BL_ACCT_LIST.TYPE from HOLD to CONF');
   v_SQL1:='update fy_tb_bl_acct_list a set TYPE = ''CONF'''
            || ' WHERE TYPE = ''HOLD'''
            || '   AND NOT EXISTS ('
			|| ' SELECT 1 FROM ' ||CH_HOLD_TABLE
			|| ' WHERE a.acct_id = account_no AND a.bill_seq = cycle_seq_no '
			|| ' AND a.CYCLE = cycle_code)'
            || ' AND a.bill_seq = '||NU_BILL_SEQ;
   DBMS_OUTPUT.Put_Line('start update FY_TB_BL_ACCT_LIST.TYPE from CONF to HOLD');		
   v_SQL2:='update fy_tb_bl_acct_list a set TYPE = ''HOLD'''
            || ' WHERE TYPE = ''CONF'''
            || '   AND EXISTS ('
			|| ' SELECT 1 FROM ' ||CH_HOLD_TABLE
			|| ' WHERE a.acct_id = account_no AND a.bill_seq = cycle_seq_no '
			|| ' AND a.CYCLE = cycle_code)'
            || ' AND a.bill_seq = '||NU_BILL_SEQ;
			
execute immediate v_SQL1;
   DBMS_OUTPUT.Put_Line('end update FY_TB_BL_ACCT_LIST.TYPE from HOLD to CONF');
execute immediate v_SQL2;
   DBMS_OUTPUT.Put_Line('end update FY_TB_BL_ACCT_LIST.TYPE from CONF to HOLD');
COMMIT;

FOR R1 IN C1(nu_bill_seq) LOOP
   DBMS_OUTPUT.Put_Line('updated FY_TB_BL_ACCT_LIST.TYPE, HOLD_COUNT='||to_char(r1.hold_count)||' ,CONFIRM_COUNT='||to_char(r1.confirm_count)||' ,CONFIRMED_COUNT='||to_char(r1.confirmed_count));
       DBMS_OUTPUT.Put_Line('update FY_TB_BL_ACCT_LIST.TYPE = 0000'); 
end loop; 

EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line(CH_ERR_MSG||'update FY_TB_BL_ACCT_LIST.TYPE = 9999'); 
end;
/

exit;

```

## UBL\BL\MailList.txt
```text
mikekuan@fareastone.com.tw SharonLin@fareastone.com.tw
```

## UBL\BL\smsList.txt
```text
0936585468 0936585468
```

## UBL\BL\Confirm\bin\HGB_UBL_Confirm_STATUS_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Confirm.sh
--# Path : /extsoft/UBL/BL/Confirm/bin
--# SQL name : HGB_UBL_Confirm_STATUS_Check.sql
--#
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################
--# Date : 2022/04/07 Modify by Mike Kuan
--# Description : HOLD > CONF
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_type           VARCHAR2(8)  := '&4';
  CH_USER          VARCHAR2(8)  := 'UBL';
  nu_bill_seq      number;
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  NU_CYCLE         NUMBER(2);
  NU_CYCLE_MONTH   NUMBER(2);
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  nu_cnt           number;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number, iacct_group varchar2) IS
     select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_acct_list a,
			fy_tb_bl_bill_acct b
	  where a.bill_seq    =ibill_seq
	    and a.type        =iacct_group
	    and b.bill_seq    =a.bill_seq
	    AND B.CYCLE       =NU_CYCLE
	    AND B.CYCLE_MONTH =NU_CYCLE_MONTH
	    AND B.ACCT_KEY    =MOD(A.ACCT_ID,100)
	    and b.acct_id     =a.acct_id
		and v_PROCESS_NO=999
	  group by b.bill_status
	union
     select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_bill_acct b
	  where b.bill_seq    =ibill_seq
	    AND B.CYCLE       =NU_CYCLE
	    AND B.CYCLE_MONTH =NU_CYCLE_MONTH
	    AND B.ACCT_KEY    =MOD(B.ACCT_ID,100)
	    and b.acct_group =iacct_group
		and v_PROCESS_NO<>999
	  group by b.bill_status;	
begin
  select bill_SEQ, CYCLE, CYCLE_MONTH,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =A.CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','CONF','QA')
                FROM DUAL)                      
         END) ACCT_GROUP
    into nu_bill_seq, NU_CYCLE, NU_CYCLE_MONTH, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and a.cycle=v_CYCLE
   AND A.CREATE_USER=CH_USER;
  if v_PROCESS_NO=999 and v_type='AFTER' THEN 
     SELECT MAX(ACCT_GROUP) 
        INTO CH_ACCT_GROUP
        FROM FY_TB_BL_BILL_PROCESS_LOG A
       WHERE BILL_SEQ   =NU_BILL_SEQ
         AND PROCESS_NO =v_PROCESS_NO
         AND ACCT_GROUP LIKE 'CONF%'
         AND PROC_TYPE  ='B'
         AND STATUS     ='CN'; 
  END IF;       
  nu_cnt := 0; 
  FOR R1 IN C1(nu_bill_seq,CH_ACCT_GROUP) LOOP
      nu_cnt := nu_cnt + r1.cnt;
     DBMS_OUTPUT.Put_Line('Confirm_STATUS_Check Status='||r1.status||', Cnt='||to_char(r1.cnt));  
  end loop; 
  if nu_cnt=0 then
     DBMS_OUTPUT.Put_Line('Confirm_STATUS_Check Process RETURN_CODE = 9999'); 
  end if;	 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Confirm_STATUS_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## UBL\BL\Confirm\bin\HGB_UBL_Confirm_STEP_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Confirm.sh
--# Path : /extsoft/UBL/BL/Confirm/bin
--# SQL name : HGB_UBL_Confirm_STEP_Check.sql
--#
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2020/05/14 Modify by Mike Kuan
--# Description : SR215584_NPEP 2.0調整出帳Confirm流程，使Confirm作業可在Undo之後執行
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################
--# Date : 2022/04/07 Modify by Mike Kuan
--# Description : CONF > HOLD
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := 'B';
  CH_USER          VARCHAR2(8)  := 'UBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1 IS
     SELECT DECODE(STATUS,'CL','CI',
                   'CI','BI',
                   'BI','MAST',
                   'MAST','CN',
                   'CN','END',STATUS) STEP                            
       FROM FY_TB_BL_BILL_PROCESS_LOG BL 
      WHERE BILL_SEQ  = nu_BILL_SEQ
        AND PROCESS_NO= v_PROCESS_NO
        AND (ACCT_GROUP= CH_ACCT_GROUP OR ACCT_GROUP= 'KEEP')
        AND PROC_TYPE = v_PROC_TYPE
        AND BEGIN_TIME= (SELECT MAX(BEGIN_TIME) from FY_TB_BL_BILL_PROCESS_LOG 
                                           WHERE BILL_SEQ  = BL.BILL_SEQ
                                             AND PROCESS_No= BL.PROCESS_NO
                                             AND ACCT_GROUP= BL.ACCT_GROUP
                                             AND PROC_TYPE = BL.PROC_TYPE)
     order by DECODE(STATUS,'CL',1,'CI',2,'BI',3,'MAST',4,'CN',5,0) DESC; 
     R1     C1%ROWTYPE;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =A.CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and a.cycle=v_CYCLE
   and a.create_user=CH_USER;
  OPEN C1;
  FETCH C1 INTO R1;
  IF C1%NOTFOUND THEN  
     CH_STEP :='CI';
  ELSE
     CH_STEP := R1.STEP;
  END IF;
  CLOSE C1;
  IF CH_STEP NOT IN ('CI','BI','MAST','CN') THEN
     DBMS_OUTPUT.Put_Line('Confirm_STEP_Check Process RETURN_CODE = 9999'); 
  ELSE   
     DBMS_OUTPUT.Put_Line(CH_STEP);
  END IF;   
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Confirm_STEP_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## UBL\BL\Confirm\bin\HGB_UBL_Confirm_USED_UP.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Confirm.sh
--# Path : /extsoft/UBL/BL/Confirm/bin
--# SQL name : HGB_UBL_Confirm_USED_UP.sql
--#
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2019/11/07 Modify by Mike Kuan
--# Description : SR219716_IoT�wú�馩�ݨD�A�t�g�JFY_TB_CM_SYNC_SEND_CNTRL�ݰϤ�CUST_TYPE
--########################################################################################
--# Date : 2020/04/14 Modify by Mike Kuan
--# Description : SR219716_IoT�wú�馩�ݨD�Aupdate CM9_OFFER_EXPIRATION_HOM
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare 
v_BILL_DATE       VARCHAR2(8)  := '&1'; 
v_PROCESS_NO      NUMBER(3)    := '&2'; 
v_CYCLE           NUMBER(2)    := '&3'; 
NU_CYCLE          NUMBER(2);
CH_BILL_PERIOD    VARCHAR2(6);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ACCT_GROUP     FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
CH_USER           VARCHAR2(8)  :='UBL';
ch_remark         FY_TB_SYS_SYNC_CNTRL.CONTENT%type;
nu_seq            number;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;
cursor c1(ibill_seq number, icycle number, icycle_month number, iacct_group varchar2) is
   select b.acct_id,  
          b.eff_date,
          b.end_date,          
          b.offer_id,
          b.offer_instance_id,
          b.offer_level_id subscr_id,
          b.cust_id,
          c.CUST_TYPE
     from fy_tb_bl_acct_pkg_log a,
          fy_tb_bl_acct_pkg b,
          fy_tb_bl_bill_acct al,
          FY_TB_CM_CUSTOMER c
    where a.bill_seq   =ibill_seq
     -- and a.cycle      =icycle
     -- and a.cycle_month=icycle_month
      and a.RECUR_SEQ  =a.bill_seq
      and a.pkg_type_dtl in ('BDX','BDN')
      and a.PREPAYMENT is not null
	  and a.CUST_ID = c.CUST_ID
      and b.acct_pkg_seq=a.acct_pkg_seq
      AND B.ACCT_KEY    =MOD(A.ACCT_ID,100) 
      and b.end_date is null
      and b.status      ='CLOSE'
      and al.bill_seq   =a.bill_seq
      AND AL.cycle     =icycle
      and AL.cycle_month=icycle_month    
      AND AL.ACCT_KEY   =MOD(A.ACCT_ID,100)  
      and al.acct_id    =a.acct_id
      and al.bill_status='CN'
      and nvl(al.CONFIRM_ID,0)<>999
      and ((v_PROCESS_NO<>999 and al.acct_group=Iacct_group) or
           (v_PROCESS_NO=999 and exists  (select 1 from fy_tb_bl_acct_list
                                          where bill_seq=a.bill_seq and type=Iacct_group and acct_id=a.acct_id)
          ));
begin
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS')||':CONFIRM USED_UP BEGIN');
   CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.CYCLE, A.BILL_PERIOD, A.BILL_SEQ, A.CYCLE_MONTH, B.ACCT_GROUP
     INTO NU_CYCLE, CH_BILL_PERIOD, NU_BILL_SEQ, NU_CYCLE_MONTH, CH_ACCT_GROUP
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
	  and b.cycle=v_CYCLE
      AND B.CYCLE     =A.CYCLE
	  AND A.CREATE_USER = CH_USER
      AND B.PROCESS_NO=v_PROCESS_NO;
   IF v_PROCESS_NO=999 THEN 
      SELECT MAX(ACCT_GROUP) 
        INTO CH_ACCT_GROUP
        FROM FY_TB_BL_BILL_PROCESS_LOG A
       WHERE BILL_SEQ   =NU_BILL_SEQ
         AND PROCESS_NO =v_PROCESS_NO
         AND ACCT_GROUP LIKE 'CONF%'
         AND PROC_TYPE  ='B'
         AND STATUS     ='CN';
   END IF;         
   DBMS_OUTPUT.Put_Line('CH_ACCT_GROUP - '||CH_ACCT_GROUP);
   FOR r1 IN c1(nu_bill_seq, nu_cycle, nu_cycle_month, ch_acct_group) LOOP 
   DBMS_OUTPUT.Put_Line('r1.subscr_id - '||r1.subscr_id);
   DBMS_OUTPUT.Put_Line('r1.acct_id - '||r1.acct_id);
   DBMS_OUTPUT.Put_Line('r1.offer_id - '||r1.offer_id);
   DBMS_OUTPUT.Put_Line('r1.offer_instance_id - '||r1.offer_instance_id);
   
   IF R1.CUST_TYPE='D' THEN
      CH_REMARK := '<?xml version="1.0" encoding="UTF-8" ?>'||
          '<TRB_TRX xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'||
              '<HEADER ReqNotf="N" TransactionCode="CM9_OFFER_EXPIRATION" PublisherApplID="CM" PublisherApplThreadID="1" IssueDate="'||to_char(r1.eff_date,'yyyy-mm-dd')||'T'||to_char(r1.eff_date,'hh24:mi:ss')|| --2017-12-19T23:59:59
                 '" EffectiveDate="'||to_char(r1.eff_date,'yyyy-mm-dd')||'T'||to_char(r1.eff_date,'hh24:mi:ss')|| --2017-12-19T23:59:59
                 '" RoutingId="'||to_char(r1.subscr_id)|| --345601122
                 '" DistributionType="ALL" BulkTransaction="N" EntityId="'||to_char(r1.subscr_id)|| --345601122
                 '" EntityType="SUBSCRIBER"/>'||
              '<DATA>'||
                  '<CmHeaderTransaction>'||
                      '<TransactionRsn>CREQ</TransactionRsn>'||
                      '<TransactionId>'||to_char(r1.acct_id)||'</TransactionId>'||
                      '<ActivityPath>CM9_OFFER_EXPIRATION</ActivityPath>'||
                      '<ActivityPcn xsi:nil="true"/>'||
                      '<WaiveIndicator xsi:nil="true"/>'||
                      '<WaiveReason xsi:nil="true"/>'||
                      '<ActivityGroupId xsi:nil="true"/>'||
                      '<LoadInd></LoadInd>'||
                  '</CmHeaderTransaction>'||
                  '<OfferExpirationInfo>'||
                      '<SubscriberID>'||to_char(r1.subscr_id)||'</SubscriberID>'||
                      '<OfferID>'||to_char(r1.offer_id)||'</OfferID>'||
                      '<ExpirationDate>'||to_char(sysdate,'yyyy-mm-dd')||'T'||to_char(sysdate,'hh24:mi:ss')||'</ExpirationDate>'||
                      '<OfferInstanceId>'||to_char(r1.offer_instance_id)||'</OfferInstanceId>'||
                      '<AgreementID>'||to_char(r1.subscr_id)||'</AgreementID>'||
                      '<OfferLevel>S</OfferLevel>'||
                      '<PaymentCategory>POST</PaymentCategory>'||
                      '<MessageType>Discount Expiration</MessageType>'||
                      '<MessageId>DISC_EXP_001</MessageId>'||
                      '<Entity_Name>FET Bill Discount Expiration</Entity_Name>'||
                  '</OfferExpirationInfo>'||
              '</DATA>'||
          '</TRB_TRX>';
	ELSE
      CH_REMARK := '<?xml version="1.0" encoding="UTF-8" ?>'||
          '<TRB_TRX xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'||
              '<HEADER ReqNotf="N" TransactionCode="CM9_OFFER_EXPIRATION_HOM" PublisherApplID="CM" PublisherApplThreadID="1" IssueDate="'||to_char(r1.eff_date,'yyyy-mm-dd')||'T'||to_char(r1.eff_date,'hh24:mi:ss')|| --2017-12-19T23:59:59
                 '" EffectiveDate="'||to_char(r1.eff_date,'yyyy-mm-dd')||'T'||to_char(r1.eff_date,'hh24:mi:ss')|| --2017-12-19T23:59:59
                 '" RoutingId="'||to_char(r1.subscr_id)|| --345601122
                 '" DistributionType="ALL" BulkTransaction="N" EntityId="'||to_char(r1.subscr_id)|| --345601122
                 '" EntityType="SUBSCRIBER"/>'||
              '<DATA>'||
                  '<CmHeaderTransaction>'||
                      '<TransactionRsn>CREQ</TransactionRsn>'||
                      '<TransactionId>'||to_char(r1.acct_id)||'</TransactionId>'||
                      '<ActivityPath>CM9_OFFER_EXPIRATION_HOM</ActivityPath>'||
                      '<ActivityPcn xsi:nil="true"/>'||
                      '<WaiveIndicator xsi:nil="true"/>'||
                      '<WaiveReason xsi:nil="true"/>'||
                      '<ActivityGroupId xsi:nil="true"/>'||
                      '<LoadInd></LoadInd>'||
                  '</CmHeaderTransaction>'||
                  '<OfferExpirationInfo>'||
                      '<SubscriberID>'||to_char(r1.subscr_id)||'</SubscriberID>'||
                      '<OfferID>'||to_char(r1.offer_id)||'</OfferID>'||
                      '<ExpirationDate>'||to_char(sysdate,'yyyy-mm-dd')||'T'||to_char(sysdate,'hh24:mi:ss')||'</ExpirationDate>'||
                      '<OfferInstanceId>'||to_char(r1.offer_instance_id)||'</OfferInstanceId>'||
                      '<AgreementID>'||to_char(r1.subscr_id)||'</AgreementID>'||
                      '<OfferLevel>S</OfferLevel>'||
                      '<PaymentCategory>POST</PaymentCategory>'||
                      '<MessageType>Discount Expiration</MessageType>'||
                      '<MessageId>DISC_EXP_001</MessageId>'||
                      '<Entity_Name>FET Bill Discount Expiration</Entity_Name>'||
                  '</OfferExpirationInfo>'||
              '</DATA>'||
          '</TRB_TRX>';
	END IF;
      --
      select fy_sq_cm_trx.nextval
        into nu_seq
        from dual;
      CH_ERR_MSG :='INSERT DATA_SYNC.SUB_ID='||TO_CHAR(R1.SUBSCR_ID)||':'; 
	  IF R1.CUST_TYPE='D' THEN
      INSERT INTO FY_TB_CM_SYNC_SEND_CNTRL
                        (TRX_ID, 
                         SVC_CODE, 
                         ACTV_CODE, 
                         MODULE_ID, 
                         SORT, 
                         ENTITY_TYPE, 
                         ENTITY_ID, 
                         HEAD_CONTENT, 
                         CREATE_DATE, 
                         CREATE_USER, 
                         UPDATE_DATE, 
                         UPDATE_USER, 
                         CONTENT, 
                         ROUTE_ID)
                   Values
                        (nu_seq,
                         '27',
                         'CM9_OFFER_EXPIRATION',
                         'EMS', 
                         1,
                         'S',
                         r1.subscr_id, 
                         'TRX_ID='||to_char(nu_seq)||',ACTV_CODE=CM9_OFFER_EXPIRATION,BE_ID=110154,SUBSCRIBER_ID='||to_char(r1.subscr_id),
                         sysdate,
                         'UBL',
                         sysdate,
                         'UBL',
                         ch_remark, 
                         r1.cust_id);
		ELSE
	  INSERT INTO FY_TB_CM_SYNC_SEND_CNTRL
                   (TRX_ID, 
                    SVC_CODE, 
                    ACTV_CODE, 
                    MODULE_ID, 
                    SORT, 
                    ENTITY_TYPE, 
                    ENTITY_ID, 
                    HEAD_CONTENT, 
                    CREATE_DATE, 
                    CREATE_USER, 
                    UPDATE_DATE, 
                    UPDATE_USER, 
                    CONTENT, 
                    ROUTE_ID)
              Values
                   (nu_seq,
                    '28',
                    'CM9_OFFER_EXPIRATION_HOM',
                    'EMS', 
                    1,
                    'S',
                    r1.subscr_id, 
                    'TRX_ID='||to_char(nu_seq)||',ACTV_CODE=CM9_OFFER_EXPIRATION_HOM,BE_ID=110154,SUBSCRIBER_ID='||to_char(r1.subscr_id),
                    sysdate,
                    'UBL',
                    sysdate,
                    'UBL',
                    ch_remark, 
                    r1.cust_id);
	  END IF;			 
      update fy_tb_bl_bill_acct set CONFIRM_ID=999
                         where bill_seq=nu_bill_seq
                           and acct_id =r1.acct_id; 
   commit;						   
   end loop;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS')||':CONFIRM USED_UP END');                     
   DBMS_OUTPUT.Put_Line('Confirm_USED_UP Process RETURN_CODE = 0000'); 
EXCEPTION
    WHEN OTHERS THEN
         ROLLBACK;
         DBMS_OUTPUT.Put_Line('Confirm_USED_UP Process RETURN_CODE = 9999');
END;
/
```

## UBL\BL\Confirm\bin\HGB_UBL_Confirm.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_UBL_Confirm.sh
# Path : /extsoft/UBL/BL/Confirm/bin
#
# Date : 2018/09/20 Created by Mike Kuan
# Description : HGB UBL Confirm
########################################################################################
# Date : 2018/10/01 Modify by Mike Kuan
# Description : add Status Check
########################################################################################
# Date : 2018/10/16 Modify by Mike Kuan
# Description : add USED UP
########################################################################################
# Date : 2018/11/06 Modify by Mike Kuan
# Description : add grep condiation
########################################################################################
# Date : 2018/11/26 Modify by Mike Kuan
# Description : add MPC
########################################################################################
# Date : 2019/06/30 Modify by Mike Kuan
# Description : SR213344_NPEP add cycle parameter
########################################################################################
# Date : 2021/02/20 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_UBL_Confirm"
sysdt=`date +%Y%m%d%H%M%S`
BillDate=$1
ProcessNo=$2
Cycle=$3
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Confirm/bin
LogDir=$HomeDir/Confirm/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_HGB_UBL_Confirm.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh
#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_UBL_Confirm_STEP_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STEP.data <<EOF
@HGB_UBL_Confirm_STEP_Check.sql $1 $2 $3
EOF`
cat ${LogDir}/${progName}_STEP.data |read STEP
echo "Step or Message: ${STEP}" | tee -a ${LogFile}
}

function HGB_UBL_Confirm_STATUS_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STATUS.data <<EOF
@HGB_UBL_Confirm_STATUS_Check.sql $1 $2 $3 $4
EOF`
cat ${LogDir}/${progName}_STATUS.data | tee -a ${LogFile}
}

function HGB_UBL_Confirm
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_UBL_Confirm.sql $1 $2 $3
exit
EOF`
}

function HGB_UBL_Confirm_USED_UP
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_UBL_Confirm_USED_UP.sql $1 $2 $3
exit
EOF`
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   sendMail 0
   echo "Send Mail (Failed)" | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
		sendSMS 0
		echo "Send SMS (Failed)" | tee -a $LogFile
   fi
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Successed)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   sendMail 1
   echo "Send Mail (Successed)" | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
		sendSMS 1
		echo "Send SMS (Successed)" | tee -a $LogFile
   fi
fi

#if [[ $DB = "HGBBL" ]]; then
#ftp -nv 10.68.8.37 <<EOF
#user $OCSID $OCSPW
#prompt off
#ascii
#cd /cb/AutoWatch/log/joblog
#put $AutoWatchFile
#bye
#EOF
#fi

exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Normal" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Abnormal" -a ${LogFile} ${maillist}  << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
fi
}

function sendSMS
{
type=$1
	errorMessage=" Abnormal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	okMessage=" Normal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	smslist=`cat $smsList`
	
echo '' | tee -a $LogFile
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
	${smsProg} "${okMessage}" "${smsList}"
else
	${smsProg} "${errorMessage}" "${smsList}"
fi
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BILL_DATE> <PROCESS_NO> <CYCLE>"
	echo ""
    echo "For PROD example: $0 20190701 001 50"
    echo "For PROD example: $0 20190701 002 50"
    echo "For PROD example: $0 20190701 003 50"
    echo "For PROD example: $0 20190701 004 50"
    echo "For PROD example: $0 20190701 005 50"
    echo "For PROD example: $0 20190701 006 50"
    echo "For PROD example: $0 20190701 007 50"
    echo "For PROD example: $0 20190701 008 50"
    echo "For PROD example: $0 20190701 009 50"
    echo "For PROD example: $0 20190701 010 50"
    echo "For PROD_MV example: $0 20190701 888 50"
    echo "For HOLD example: $0 20190701 999 50"
	echo ""
}

if [[ $# -lt 3 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_DATE : ${BillDate}" | tee -a $LogFile
echo "CYCLE : ${Cycle}" | tee -a $LogFile
echo "PROCESS_NO : ${ProcessNo}" | tee -a $LogFile
echo '' | tee -a $LogFile
cd ${WorkDir}

#----------------------------------------------------------------------------------------------------
#------------執行Confirm Step Check
echo "----->>>>>-----Step 0. Run Confirm Step Check Process (Start...)" | tee -a $LogFile
HGB_UBL_Confirm_STEP_Check $BillDate $Cycle $ProcessNo
checkcode=`cat ${LogDir}/${progName}_STEP.data|grep -E 'ORA|ora|Confirm_STEP_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 0. Run Confirm Step Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 0. Run Confirm Step Check Process (End... Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Confirm STATUS Check
echo "----->>>>>-----Step 1. Run Confirm STATUS Check Process (Start...)" | tee -a $LogFile
HGB_UBL_Confirm_STATUS_Check $BillDate $Cycle $ProcessNo BEFORE
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Confirm_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 1. Run Confirm STATUS Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 1. Run Confirm STATUS Check Process (End... Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
if [[ ${STEP} == 'CN' ]]; then
#------------執行Confirm
	echo "----->>>>>-----Step 2. Run Confirm Process (Start...)" | tee -a $LogFile
	HGB_UBL_Confirm $BillDate $Cycle $ProcessNo
	checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Confirm Process RETURN_CODE = 9999'|wc -l`
		if [[ $checkcode -ge 1 ]]; then
			echo "-----<<<<<-----Step 2. Run Confirm Process (End...Failed)" | tee -a $LogFile
			AutoWatch 1
		else
			echo "-----<<<<<-----Step 2. Run Confirm Process (End... Successed)" | tee -a $LogFile
			Pause
			echo "----->>>>>-----Step 3. Run Confirm_USED_UP Process (Start...)" | tee -a $LogFile
			HGB_UBL_Confirm_USED_UP $BillDate $ProcessNo $Cycle
			checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Confirm_USED_UP Process RETURN_CODE = 9999'|wc -l`
				if [[ $checkcode -eq 1 ]]; then
					echo "-----<<<<<-----Step 3. Run Confirm_USED_UP Process (End...Failed)" | tee -a $LogFile
					AutoWatch 1
				else
					echo "-----<<<<<-----Step 3. Run Confirm_USED_UP Process (End...Successed)" | tee -a $LogFile
				fi
		fi
else
	echo "Preparation Status not in ('CN')" | tee -a $LogFile
fi		
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Confirm STATUS Check
echo "----->>>>>-----Step 4. Run Confirm STATUS Check Process (Start...)" | tee -a $LogFile
HGB_UBL_Confirm_STATUS_Check $BillDate $Cycle $ProcessNo AFTER
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Confirm_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 4. Run Confirm STATUS Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 4. Run Confirm STATUS Check Process (End... Successed)" | tee -a $LogFile

AutoWatch 0

```

## UBL\BL\Confirm\bin\HGB_UBL_Confirm.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Confirm.sh
--# Path : /extsoft/UBL/BL/Confirm/bin
--# SQL name : HGB_UBL_Confirm.sql
--#
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2020/05/14 Modify by Mike Kuan
--# Description : SR215584_NPEP 2.0�վ�X�bConfirm�y�{�A��Confirm�@�~�i�bUndo�������
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE       VARCHAR2(8)  := '&1';
v_CYCLE           NUMBER(2)    := '&2';
v_PROCESS_NO      NUMBER(3)    := '&3';
CH_USER           VARCHAR2(8)  := 'UBL';
NU_CYCLE          NUMBER(2);
CH_BILL_PERIOD    VARCHAR2(6);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ACCT_GROUP     FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;
begin 
   CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.CYCLE, A.BILL_PERIOD, A.BILL_SEQ, A.CYCLE_MONTH, B.ACCT_GROUP
     INTO NU_CYCLE, CH_BILL_PERIOD, NU_BILL_SEQ, NU_CYCLE_MONTH, CH_ACCT_GROUP
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
	  AND A.CREATE_USER=CH_USER
	  --AND A.CREATE_USER=B.CREATE_USER
	  AND b.cycle =v_CYCLE
      AND B.CYCLE     =A.CYCLE
      AND B.PROCESS_NO=v_PROCESS_NO;
   --999�B�z
	 IF v_PROCESS_NO=999 THEN 
      SELECT MAX(ACCT_GROUP) 
        INTO CH_ACCT_GROUP
        FROM FY_TB_BL_BILL_PROCESS_LOG A
       WHERE BILL_SEQ   =NU_BILL_SEQ
         AND PROCESS_NO =v_PROCESS_NO
         AND ACCT_GROUP LIKE 'CONF%'
         AND PROC_TYPE  ='B'
         AND STATUS     ='CN';
      IF CH_ACCT_GROUP IS NULL THEN
         CH_ACCT_GROUP := 'CONF1';
      ELSE
         CH_ACCT_GROUP := 'CONF'||(TO_NUMBER(SUBSTR(CH_ACCT_GROUP,-1))+1);
      END IF; 
      INSERT INTO FY_TB_BL_BILL_PROCESS_LOG
                      (BILL_SEQ,
                       PROCESS_NO,
                       ACCT_GROUP,
                       PROC_TYPE,
                       STATUS,
                       FILE_REPLY,
                       BEGIN_TIME,
                       END_TIME,
                       CURRECT_ACCT_ID,
                       COUNT,
                       CREATE_DATE,
                       CREATE_USER,
                       UPDATE_DATE,
                       UPDATE_USER)
                SELECT BILL_SEQ,
                       PROCESS_NO,
                       CH_ACCT_GROUP,
                       PROC_TYPE,
                       STATUS,
                       FILE_REPLY,
                       BEGIN_TIME,
                       END_TIME,
                       CURRECT_ACCT_ID,
                       COUNT,
                       CREATE_DATE,
                       CREATE_USER,
                       UPDATE_DATE,
                       UPDATE_USER
                  FROM FY_TB_BL_BILL_PROCESS_LOG
                 WHERE BILL_SEQ   =NU_BILL_SEQ
                   AND PROCESS_NO =v_PROCESS_NO
                   AND (ACCT_GROUP = 'HOLD' OR ACCT_GROUP = 'KEEP')
                   AND PROC_TYPE  ='B'
				   AND ROWNUM <=3
				   ORDER BY begin_time DESC;
      UPDATE FY_TB_BL_ACCT_LIST SET TYPE=CH_ACCT_GROUP
                          WHERE BILL_SEQ =NU_BILL_SEQ
                            AND TYPE     ='CONF';       
   COMMIT;
   END IF;     
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS')||':CONFIRM BEGIN');
   FY_PG_BL_BILL_CONFIRM.MAIN(NU_BILL_SEQ,
                              v_PROCESS_NO,
                              CH_ACCT_GROUP,
                              'B',
                              CH_USER, 
                              CH_ERR_CDE, 
                              CH_ERR_MSG); 
   IF CH_ERR_CDE<>'0000' THEN
      CH_ERR_MSG := 'FY_PG_BL_BILL_CONFIRM:'||CH_ERR_MSG;
      RAISE ON_ERR;
   END IF;                         
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH24:MI:SS')||':CONFIRM END');                      
           DBMS_OUTPUT.Put_Line(CH_ERR_CDE||CH_ERR_MSG);  
EXCEPTION 
   WHEN ON_ERR THEN
       DBMS_OUTPUT.Put_Line('Confirm Process RETURN_CODE = 9999');
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Confirm Process RETURN_CODE = 9999');
end;
/

exit;

```

## UBL\BL\CutDate\bin\HGB_UBL_CutDate_BA_Close.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_CutDate.sh
--# Path : /extsoft/UBL/BL/CutDate/bin
--# SQL name : HGB_BL_Close.sql
--#
--# Date : 2019/12/03 Created by Mike Kuan
--# Description : HGB UBL CutDate
--########################################################################################
--# Date : 2020/11/10 Created by Mike Kuan
--# Description : SR232859_修改IoTHGBN BA Close & NHGB Account Close的條件
--#               remove TOT_AMT<=0, add final bill status check, for HGBN&HGB both
--########################################################################################
--# Date : 2023/04/17 Modify by Mike Kuan
--# Description : SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
   v_BILL_DATE       VARCHAR2(8)  := '&1'; 
   v_CYCLE           NUMBER(2)    := '&2'; 
   NU_CYCLE          NUMBER(2);
   CH_BILL_PERIOD    VARCHAR2(6);
   CH_USER           VARCHAR2(8)  := 'UBL';
   nu_CTRL_CNT       number       :=0;
   NU_CNT            NUMBER;
   CH_ERR_CDE        VARCHAR2(10);
   CH_ERR_MSG        VARCHAR2(300);
   On_Err            EXCEPTION;
   CURSOR c1(iCYCLE NUMBER) IS
	SELECT acct_id, pre_bill_seq, pre_bill_nbr
	  FROM fy_tb_bl_account ba, fy_tb_cm_customer cc
	 WHERE ba.cust_id = cc.cust_id
	  AND ba.CYCLE = icycle
	  AND ba.bl_status <> 'CLOSE'
	  AND ba.last_bill_seq IS NOT NULL
	  AND ADD_MONTHS (ba.eff_date, -6) < TRUNC (SYSDATE)
	  AND cc.cust_type IN ('N', 'D', 'P'); --SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
begin
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN BA_CLOSE Process...'); 
   CH_ERR_MSG := 'GET CYCLE.BILL_DATE='||V_BILL_DATE||':';
   SELECT CYCLE, CURRECT_PERIOD
     INTO NU_CYCLE, CH_BILL_PERIOD
     FROM FY_TB_BL_CYCLE
    WHERE currect_period IS NOT NULL
      AND cycle = v_CYCLE
	  AND CREATE_USER = CH_USER
      AND TO_DATE(CURRECT_PERIOD||FROM_DAY,'YYYYMMDD') =
          DECODE(SUBSTR(v_BILL_DATE,-2),'01',ADD_MONTHS(TO_DATE(v_BILL_DATE,'YYYYMMDD'),-1),TO_DATE(v_BILL_DATE,'YYYYMMDD'));
        
   for R1 in c1(NU_CYCLE) loop
      NU_CTRL_CNT := NU_CTRL_CNT+1;
      begin
         CH_ERR_MSG := 'GET FY_TB_CM_ACCOUNT.ACCT_ID='||TO_CHAR(R1.ACCT_ID)||':';
         SELECT COUNT(1)
           INTO NU_CNT
           FROM FY_TB_CM_ACCOUNT
          where ACCT_ID = R1.ACCT_ID
            AND STATUS='C'
            AND EFF_DATE<add_months(to_date(to_char(sysdate, 'yyyymm')||'01', 'yyyymmdd'), -6);
         IF NU_CNT=0 THEN
            RAISE ON_ERR;
         END IF;   

         CH_ERR_MSG := 'GET FY_TB_BL_BILL_CI.ACCT_ID='||TO_CHAR(R1.ACCT_ID)||':';
         SELECT COUNT(1)
           INTO NU_CNT
           FROM FY_TB_BL_BILL_CI
          WHERE ACCT_ID =R1.ACCT_ID
            AND BILL_SEQ IS NULL;
         IF NU_CNT>0 THEN
            RAISE ON_ERR;
         END IF;               
      
         SELECT COUNT(1)
           INTO NU_CNT  
           FROM FY_TB_BL_BILL_MAST a, FY_TB_BL_BILL_ACCT b
          WHERE a.BILL_SEQ=R1.PRE_BILL_SEQ
		    AND a.BILL_SEQ=b.BILL_SEQ
            AND a.ACCT_ID =R1.ACCT_ID
			and a.ACCT_ID=b.ACCT_ID
            AND a.BILL_NBR=R1.PRE_BILL_NBR
			AND b.PRODUCTION_TYPE in ('FN','RF')
            AND CHRG_AMT<=0;
         IF NU_CNT>0 THEN   
            UPDATE FY_TB_BL_ACCOUNT SET  BL_STATUS  ='CLOSE',
                                         STATUS_DATE=SYSDATE,
                                         UPDATE_DATE=SYSDATE,
                                         UPDATE_USER='UBL'
                                   WHERE ACCT_ID=R1.ACCT_ID;
			DBMS_OUTPUT.Put_Line('CLOSE ACCOUNT='|| R1.ACCT_ID);
         END IF;
      EXCEPTION
         WHEN ON_ERR THEN
            NULL;
         WHEN OTHERS THEN
            NULL;
      END;
   END LOOP;  
   COMMIT;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END BA_CLOSE Process...');  
   DBMS_OUTPUT.Put_Line('CutDate_BA_Close Process RETURN_CODE = 0000');    
EXCEPTION 
   WHEN OTHERS THEN
      DBMS_OUTPUT.Put_Line('CutDate_BA_Close Process RETURN_CODE = 9999');
      DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||SUBSTR(' END BA_CLOSE Process... '||SQLERRM,1,250));         
end;
/
exit

```

## UBL\BL\CutDate\bin\HGB_UBL_CutDate_ERP.sql
```sql
SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE                  VARCHAR2(8)  := '&1'; 
NU_CYCLE          NUMBER(2);
CH_BILL_PERIOD    VARCHAR2(6);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
DT_BILL_END_DATE DATE;
CH_USER           VARCHAR2(8)  :='UBL';
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
begin
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':GET ERP BEGIN'); 
   SELECT CYCLE, BILL_PERIOD, BILL_SEQ, CYCLE_MONTH, BILL_END_DATE
     INTO NU_CYCLE, CH_BILL_PERIOD, NU_BILL_SEQ, NU_CYCLE_MONTH, DT_BILL_END_DATE
     FROM FY_TB_BL_BILL_CNTRL
    WHERE TO_CHAR(BILL_DATE,'YYYYMMDD')=V_BILL_DATE;   
   --DT_BILL_END_DATE CHECK
   IF TO_NUMBER(TO_CHAR(DT_BILL_END_DATE,'DD'))>25 THEN
      DT_BILL_END_DATE := TO_DATE(TO_CHAR(DT_BILL_END_DATE,'YYYYMM')||'25','YYYYMMDD');
   ELSE
      DT_BILL_END_DATE := TO_DATE(TO_CHAR(ADD_MONTHS(DT_BILL_END_DATE,-1),'YYYYMM')||'25','YYYYMMDD');
   END IF;             
   --GET ERP 
   --gvSTEP := 'INSERT BL_BILL_RATES:';
   INSERT INTO FY_TB_BL_BILL_RATES
                       (BILL_SEQ,
                        CYCLE,
                        CYCLE_MONTH,
                        FROM_CURRENCY,
                        TO_CURRENCY,
                        CONVERSION_DATE,
                        CONVERSION_TYPE,
                        CONVERSION_RATE,
                        CREATE_DATE,
                        CREATE_USER,
                        UPDATE_DATE,
                        UPDATE_USER)
                 SELECT NU_BILL_SEQ,
                        NU_CYCLE,
                        NU_CYCLE_MONTH,
                        decode(FROM_CURRENCY,'TWD','NTD',FROM_CURRENCY),
                        decode(TO_CURRENCY,'TWD','NTD',TO_CURRENCY),
                        CONVERSION_DATE,
                        CONVERSION_TYPE,
                        CONVERSION_RATE,
                        SYSDATE,
                        CH_USER,
                        SYSDATE,
                        CH_USER
                   FROM APPS.ERP_PO_DAILY_RATES_V@HGB2ERP.ERP
                  where TRUNC(CONVERSION_DATE)=DT_BILL_END_DATE ;
   IF SQL%ROWCOUNT=0 THEN
      DBMS_OUTPUT.Put_Line('Get ERP RETURN_CODE = 9999'); 
   ELSE   
      DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':GET ERP END'); 
      DBMS_OUTPUT.Put_Line('Get ERP RETURN_CODE = 0000'||NULL); 
	  COMMIT;
   END IF;   
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Get ERP RETURN_CODE = 9999'); 
end;
/   
    
```

## UBL\BL\CutDate\bin\HGB_UBL_CutDate_Pre.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_CutDate.sh
--# SQL name : HGB_UBL_CutDate_Pre.sql
--# Path : /extsoft/UBL/BL/CutDate/bin
--#
--# Date : 2018/09/06 Created by FY
--# Description : HGB UBL CutDate
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################
--# Date : 2023/04/17 Modify by Mike Kuan
--# Description : SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE       VARCHAR2(8)   := '&1'; 
v_CYCLE           NUMBER(2)     := '&2'; 
v_TYPE            VARCHAR(1)    := '&3'; 
NU_CNT            NUMBER        := 0;
   CURSOR C_C1 IS
      SELECT DISTINCT DECODE(ENTITY_TYPE,'S','SUBSCR_ID=','ACCT_ID=') TYPE, ENTITY_ID 
        FROM FY_TB_SYS_SYNC_ERROR A
       WHERE MODULE_ID='BL'
         AND ((ENTITY_TYPE='S' AND EXISTS (SELECT 1 FROM FY_TB_CM_SUBSCR S,
                                                         FY_TB_CM_CUSTOMER CC
                                           WHERE S.SUBSCR_ID=A.ENTITY_ID
                                             AND S.INIT_ACT_DATE<TO_DATE(v_BILL_DATE,'YYYYMMDD')
                                             AND CC.CUST_ID =S.CUST_ID
                                             AND CC.CYCLE   =v_CYCLE
											 AND CC.CUST_TYPE IN ('D', 'N', 'P'))) OR --SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
              (ENTITY_TYPE='A' AND EXISTS (SELECT 1 FROM FY_TB_CM_ACCOUNT S,
                                                         FY_TB_CM_CUSTOMER CC
                                           WHERE S.ACCT_ID  =A.ENTITY_ID
										     and s.eff_date <TO_DATE(v_BILL_DATE,'YYYYMMDD')
                                             AND CC.CUST_ID =S.CUST_ID
                                             AND CC.CYCLE   =v_CYCLE
											 AND CC.CUST_TYPE IN ('D', 'N', 'P')))) --SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
       ORDER BY DECODE(ENTITY_TYPE,'S','SUBSCR_ID=','ACCT_ID='),ENTITY_ID;
begin
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Check DataSync Process...'); 
   --GET DATA_SYNC CHEKC
   FOR R_C1 IN C_C1 LOOP
      NU_CNT := NVL(NU_CNT,0) + 1;
      IF v_TYPE='Y' THEN
         DBMS_OUTPUT.Put_Line(R_C1.TYPE||TO_CHAR(R_C1.ENTITY_ID)); 
      END IF;   
   END LOOP;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||' END Check DataSync Process...');   
   IF NU_CNT=0 THEN
      DBMS_OUTPUT.Put_Line('Pre_CutDate Process RETURN_CODE = 0000'||NULL);
   ELSE
      DBMS_OUTPUT.Put_Line('Pre_CutDate Process RETURN_CODE = 9999'||' Warning... ERROR_CNT = '||TO_CHAR(NU_CNT)); 
   END IF;                                                                               
EXCEPTION 
   WHEN OTHERS THEN
      DBMS_OUTPUT.Put_Line('Pre_CutDate Process RETURN_CODE = 9999');
      DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||SUBSTR(' END Check DataSync Process... '||SQLERRM,1,250)); 
end;
/

```

## UBL\BL\CutDate\bin\HGB_UBL_CutDate_STATUS_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_CutDate.sh
--# SQL name : HGB_UBL_CutDate_STATUS_Check.sql
--# Path : /extsoft/UBL/BL/CutDate/bin
--#
--# Date : 2018/09/06 Created by FY
--# Description : HGB UBL CutDate
--########################################################################################
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  CH_USER           VARCHAR2(8)  := 'UBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number) IS
     select distinct bill_status status, count(1) cnt
           from fy_tb_bl_bill_acct B
          where B.bill_seq=ibill_seq
		  AND B.CYCLE   =v_CYCLE
          group by b.bill_status;  
begin
  select bill_SEQ
    into nu_bill_seq
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   AND A.CYCLE   =v_CYCLE
   AND A.CREATE_USER =CH_USER;
  FOR R1 IN C1(nu_bill_seq) LOOP
     DBMS_OUTPUT.Put_Line('CutDate_STATUS_Check Status='||r1.status||', Cnt='||to_char(r1.cnt));  
  end loop; 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('CutDate_STATUS_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## UBL\BL\CutDate\bin\HGB_UBL_CutDate.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_UBL_CutDate.sh
# Path : /extsoft/UBL/BL/CutDate/bin
#
# Date : 2018/09/06 Created by Mike Kuan
# Description : HGB UBL CutDate
########################################################################################
# Date : 2018/10/01 Modify by Mike Kuan
# Description : add Status Check
########################################################################################
# Date : 2018/11/06 Modify by Mike Kuan
# Description : add grep condiation
########################################################################################
# Date : 2018/11/26 Modify by Mike Kuan
# Description : add MPC
########################################################################################
# Date : 2018/12/04 Modify by Mike Kuan
# Description : adj BillDate to sysdate
########################################################################################
# Date : 2019/06/30 Modify by Mike Kuan
# Description : SR213344_NPEP add cycle parameter、關閉取得ERP匯率
########################################################################################
# Date : 2019/08/29 Modify by Mike Kuan
# Description : SR213344_NPEP modify bill_date
########################################################################################
# Date : 2020/11/10 Modify by Mike Kuan
# Description : SR232859_修改IoT&HGBN BA Close的條件
########################################################################################
# Date : 2021/02/20 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB
########################################################################################
# Date : 2021/10/26 Modify by Mike Kuan
# Description : SR239378_SD-WAN 調整function sendSMS,sendMail，增加start提醒
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_UBL_CutDate"
sysdt=`date +%Y%m%d%H%M%S`
#BillDate=$1
#BillDate=`date +%Y%m%d` #20190829
#BillDate=`date +%Y%m01` #20190829
#Cycle=$1
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/CutDate/bin
LogDir=$HomeDir/CutDate/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_${progName}.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh
#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_UBL_getCycleInfo
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}.data <<EOF
@HGB_UBL_getCycleInfo.sql $1 $2
EOF`
cat ${LogDir}/${progName}.data |read CYCLE CURRECT_PERIOD
echo "CycleCode[${CYCLE}] PeriodKey[${CURRECT_PERIOD}]" | tee -a ${LogFile}
}

function HGB_UBL_CutDate_BA_Close
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_BA_Close.data <<EOF
@HGB_UBL_CutDate_BA_Close.sql $1 $2
exit
EOF`
cat ${LogDir}/${progName}_BA_Close.data | tee -a ${LogFile}
}

function HGB_UBL_CutDate_Pre
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_UBL_CutDate_Pre.sql $1 $2 $3
exit
EOF`
}

function HGB_UBL_CutDate
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_UBL_CutDate.sql $1 $2
exit
EOF`
}

function HGB_UBL_CutDate_STATUS_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STATUS.data <<EOF
@HGB_UBL_CutDate_STATUS_Check.sql $1 $2
exit
EOF`
cat ${LogDir}/${progName}_STATUS.data | tee -a ${LogFile}
}

function HGB_UBL_CutDate_ERP
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_UBL_CutDate_ERP.sql $1
exit
EOF`
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
		sendSMS 0
		echo "Send SMS (Failed)" | tee -a $LogFile
   fi
   echo "Send Mail (Failed)" | tee -a $LogFile
   sendMail 0
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Successed)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
		sendSMS 1
		echo "Send SMS (Successed)" | tee -a $LogFile
   fi
   echo "Send Mail (Successed)" | tee -a $LogFile
   sendMail 1
fi
exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Normal" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
elif [[ $type -eq 2 ]]; then
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Start" ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} Start.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Abnormal" -a ${LogFile} ${maillist}  << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
fi
}

function sendSMS
{
type=$1
	errorMessage=" Abnormal! ${BillDate} ${Cycle} ${progName}"
	okMessage=" Normal! ${BillDate} ${Cycle} ${progName}"
	startMessage=" Start! ${BillDate} ${Cycle} ${progName}"
	smslist=`cat $smsList`
	
echo '' | tee -a $LogFile
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
	${smsProg} "${okMessage}" "${smsList}"
elif [[ $type -eq 2 ]]; then
	${smsProg} "${startMessage}" "${smslist}"
else
	${smsProg} "${errorMessage}" "${smsList}"
fi
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
if [[ $DB != "HGBBL" ]]; then
	BillDate=$1
	Cycle=$2
	usage()
	{
		echo "Usage:"
		echo " $0 <BILL_DATE> "
		echo ""
		echo "For example: $0 20190701 10"
		echo "For example: $0 20190701 50"
		echo ""
	}

	if [[ $# -lt 2 ]]; then
		usage
		exit 0
	fi
else
	BillDate=`date +%Y%m01`
	Cycle=$1
	if [[ $# -lt 1 ]]; then
		usage
		exit 0
	fi
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_DATE : ${BillDate}" | tee -a $LogFile
echo "CYCLE : ${Cycle}" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $DB = "HGBBL" ]]; then
	echo "Send SMS (Start)" | tee -a $LogFile
	sendSMS 2
	Pause
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
else
	echo "Send Mail (Start)" | tee -a $LogFile
	sendMail 2
fi

cd ${WorkDir}
Pause
#----------------------------------------------------------------------------------------------------
#------------取得Cycle資訊
echo "----->>>>>-----Step 1. Get Cycle Information (Start...)" | tee -a $LogFile
HGB_UBL_getCycleInfo $BillDate $Cycle
if [[ ${CYCLE} -lt 10 || ${CYCLE} -gt 60 ]]; then
  echo "-----<<<<<-----Step 1. Get Cycle Information (End... Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 1. Get Cycle Information (End... Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行CutDate BA Close
if [[ $DB = "HGBBL" ]]; then
	echo "----->>>>>-----Step 2. Run CutDate BA Close Process (Start...)" | tee -a $LogFile
	HGB_UBL_CutDate_BA_Close $BillDate $CYCLE
	checkcode=`cat ${LogDir}/${progName}_BA_Close.data|grep -E 'ORA|ora|CutDate_BA_Close Process RETURN_CODE = 9999'|wc -l`
	if [[ $checkcode -ge 1 ]]; then
		echo "-----<<<<<-----Step 2. Run CutDate BA Close Process (End...Failed)" | tee -a $LogFile
		AutoWatch 1
	fi
	echo "-----<<<<<-----Step 2. Run CutDate BA Close Process (End... Successed)" | tee -a $LogFile
	Pause
fi
##----------------------------------------------------------------------------------------------------
#------------執行Pre_CutDate
echo "----->>>>>-----Step 3. Run Pre_CutDate Process (Start...)" | tee -a $LogFile
echo $BillDate
echo $CYCLE
HGB_UBL_CutDate_Pre $BillDate $CYCLE Y
checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Pre_CutDate Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  error_cnt=`cat ${LogFile}|grep -Eo 'ERROR_CNT = [0-9]'|grep '[0-9]'|awk '{print $3}'`
  if  [[ $error_cnt -ne 0 ]]; then
	echo "error list:"
	cat ${LogFile}|grep 'ACCT_ID='
	cat ${LogFile}|grep 'SUBSCR_ID='
  fi
  checkdone=0
  rerun_cnt=1
  while [ $checkdone -eq 0 ] 
  do
    sleep 2
	    echo "ReRun:$rerun_cnt Pre_CutDate Process (Start...)" | tee -a $LogFile
    HGB_UBL_CutDate_Pre $BillDate $CYCLE N
	checkdone=`cat ${LogFile}|grep 'Pre_CutDate Process RETURN_CODE = 0000'|wc -l`
		(( rerun_cnt++ ))
		if [[ $rerun_cnt -eq 11 ]]; then
		  echo "-----<<<<<-----Step 3. Run Pre_CutDate Process (End... Failed)" | tee -a $LogFile
		  AutoWatch 1
		fi
  done  
fi
echo "-----<<<<<-----Step 3. Run Pre_CutDate Process (End... Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行CutDate
echo "----->>>>>-----Step 4. Run CutDate Process (Start...)" | tee -a $LogFile
HGB_UBL_CutDate $CYCLE $CURRECT_PERIOD
checkcode=`cat ${LogFile}|grep -E 'ORA|ora|CutDate Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -eq 1 ]]; then
  echo "-----<<<<<-----Step 4. Run CutDate Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 4. Run CutDate Process (End...Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行CutDate STATUS Check
echo "----->>>>>-----Step 5. Run CutDate STATUS Check Process (Start...)" | tee -a $LogFile
HGB_UBL_CutDate_STATUS_Check $BillDate $CYCLE
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|CutDate_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 5. Run CutDate STATUS Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 5. Run CutDate STATUS Check Process (End... Successed)" | tee -a $LogFile
Pause
##----------------------------------------------------------------------------------------------------
##------------取得ERP匯率
#echo "----->>>>>-----Step 5. Get ERP (Start...)" | tee -a $LogFile
#HGB_UBL_CutDate_ERP $BillDate
#checkcode=`cat ${LogFile}|grep 'Get ERP RETURN_CODE = 0000'|wc -l`
#if [[ $checkcode -eq 0 ]]; then
#  echo "-----<<<<<-----Step 5. Get ERP (End... Failed)" | tee -a $LogFile
#  AutoWatch 1
#fi
#echo "-----<<<<<-----Step 5. Get ERP (End... Successed)" | tee -a $LogFile

AutoWatch 0

```

## UBL\BL\CutDate\bin\HGB_UBL_CutDate.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_CutDate.sh
--# SQL name : HGB_UBL_CutDate.sql
--# Path : /extsoft/UBL/BL/CutDate/bin
--#
--# Date : 2018/09/06 Created by FY
--# Description : HGB UBL CutDate
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_CYCLE          NUMBER(2)    := '&1'; 
v_BILL_PERIOD    VARCHAR2(6)  := '&2'; 
CH_USER          VARCHAR2(8)  := 'UBL';
CH_ERR_CDE       VARCHAR2(10);
CH_ERR_MSG       VARCHAR2(300);
begin
     FY_PG_BL_BILL_CUTDATE.MAIN(v_CYCLE, v_BILL_PERIOD, CH_USER, CH_ERR_CDE, CH_ERR_MSG);
     if ch_err_cde='0000' then
        DBMS_OUTPUT.Put_Line('CutDate Process RETURN_CODE = 0000');
     else        
        DBMS_OUTPUT.Put_Line('CutDate Process RETURN_CODE = 9999'); 
     end if;     
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('CutDate Process RETURN_CODE = 9999'); 
end;
/

exit;

```

## UBL\BL\CutDate\bin\HGB_UBL_getCycleInfo.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_CutDate.sh
--# SQL name : HGB_UBL_getCycleInfo.sql
--# Path : /extsoft/UBL/BL/CutDate/bin
--#
--# Date : 2018/09/06 Created by FY
--# Description : HGB UBL CutDate
--########################################################################################
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

set heading off
set feedback off
set verify off
set pagesize 0

SELECT CYCLE, CURRECT_PERIOD
     FROM FY_TB_BL_CYCLE
    WHERE currect_period IS NOT NULL
    AND TO_DATE(CURRECT_PERIOD||FROM_DAY,'YYYYMMDD') =
        DECODE(SUBSTR('&1',-2),'01',ADD_MONTHS(TO_DATE('&1','YYYYMMDD'),-1),TO_DATE('&1','YYYYMMDD')) 
		and cycle = '&2'
		and create_user = 'UBL'
    ;

exit

```

## UBL\BL\Extract\bin\HGB_UBL_Extract_DIO_Check.sql
```sql
--########################################################################################
--# Program name : HGB_MPBL_Extract.sh
--# Path : /extsoft/MPBL/BL/Extract/bin
--# SQL name : HGB_MPBL_Extract_DIO_Check.sql
--#
--# Date : 2021/02/20 Created by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1'; 
  v_CYCLE          NUMBER(2)    := '&2'; 
  v_PROC_ID        VARCHAR2(8)  := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := '&4';
  CH_USER          VARCHAR2(8)  := 'UBL';
  nu_bill_seq      number;
  CH_STATUS        FY_TB_DIO_CNTRL.STATUS%TYPE;
  CH_IO_TYPE       FY_TB_DIO_CNTRL.IO_TYPE%TYPE;
  NU_CNT           NUMBER;
  RUN_MINS         NUMBER;
  On_Err           EXCEPTION;
  CURSOR C1 IS
     SELECT BILL_SEQ, STATUS, ROUND(TO_NUMBER(sysdate - START_TIME) * 24 * 60) RUN_MINS
       FROM FY_TB_DIO_CNTRL A
      WHERE BILL_SEQ  =NU_BILL_SEQ
        AND PROC_TYPE =v_PROC_TYPE
        AND PROC_ID   =v_PROC_ID
        AND CNTRL_SEQ =(SELECT MAX(CNTRL_SEQ) FROM FY_TB_DIO_CNTRL
                             WHERE BILL_SEQ  =A.BILL_SEQ
                               AND PROC_TYPE =A.PROC_TYPE
                               AND PROC_ID   =v_PROC_ID)
		order by decode(STATUS,'E',1,'A',2,'FIN',3,4);

begin
  select bill_SEQ
    into nu_bill_seq
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   and a.create_user=CH_USER;
   
  CH_STATUS :='Y';
  FOR R1 IN C1 LOOP
    IF R1.STATUS='E' AND R1.RUN_MINS <= 10 THEN
		DELETE fy_tb_dio_cntrl_dtl
			WHERE cntrl_seq IN (SELECT cntrl_seq
								FROM fy_tb_dio_cntrl
								WHERE bill_seq = nu_bill_seq AND status = 'E');
	
		UPDATE fy_tb_dio_cntrl
			SET status = 'A',
				last_grp_id = NULL,
				tot_cnt = NULL,
				tot_amt = NULL,
				start_time = NULL,
				end_time = NULL
		WHERE bill_seq = nu_bill_seq AND status = 'E';
	
		COMMIT;

       DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Processing'); 
       RAISE ON_ERR;
    ELSIF R1.STATUS='E' THEN
       DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Process RETURN_CODE = 9999'); 
       RAISE ON_ERR;
    ELSIF R1.STATUS<>'FIN' THEN
       DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Processing'); 
       RAISE ON_ERR;
	ELSE
	   CH_STATUS :='N';
    END IF;
  END LOOP;
  IF CH_STATUS='Y' THEN
     DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Processing'); 
  ELSE   
     DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Process RETURN_CODE = 0000'); 
  END IF;   
EXCEPTION 
   WHEN on_err THEN
      NULL;
   WHEN OTHERS THEN
     DBMS_OUTPUT.Put_Line('Extract_DIO_Check '||v_PROC_ID||' Process RETURN_CODE = 9999'); 
end;
/

```

## UBL\BL\Extract\bin\HGB_UBL_Extract.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_UBL_Extract.sh
# Path : /extsoft/UBL/BL/Extract/bin
#
# Date : 2018/09/20 Created by Mike Kuan
# Description : HGB UBL Extract
########################################################################################
# Date : 2018/11/06 Modify by Mike Kuan
# Description : add grep condiation
########################################################################################
# Date : 2018/11/26 Modify by Mike Kuan
# Description : add MPC
########################################################################################
# Date : 2019/06/30 Modify by Mike Kuan
# Description : SR213344_NPEP add cycle parameter
########################################################################################
# Date : 2021/02/20 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_UBL_Extract"
sysdt=`date +%Y%m%d%H%M%S`
BillDate=$1
ProcType=$2
Cycle=$3
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Extract/bin
LogDir=$HomeDir/Extract/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_${progName}.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh
#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_UBL_Extract
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}.data <<EOF
@HGB_UBL_Extract.sql $1 $2 $3
exit
EOF`
cat ${LogDir}/${progName}.data | tee -a ${LogFile}
}

function HGB_UBL_Extract_DIO_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_DIO_Check.data <<EOF
@HGB_UBL_Extract_DIO_Check.sql $1 $2 $3 $4
exit
EOF`
cat ${LogDir}/${progName}_DIO_Check.data | tee -a ${LogFile}
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   sendMail 0
   echo "Send Mail (Failed)" | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
		sendSMS 0
		echo "Send SMS (Failed)" | tee -a $LogFile
   fi
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Successed)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   sendMail 1
   echo "Send Mail (Successed)" | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
		sendSMS 1
		echo "Send SMS (Successed)" | tee -a $LogFile
   fi
fi

#if [[ $DB = "HGBBL" ]]; then
#ftp -nv 10.68.8.37 <<EOF
#user $OCSID $OCSPW
#prompt off
#ascii
#cd /cb/AutoWatch/log/joblog
#put $AutoWatchFile
#bye
#EOF
#fi

exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Normal" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Abnormal" -a ${LogFile} ${maillist}  << EOF
Dears,
   ${progName} Bill_Date:${BillDate} CYCLE:${Cycle} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
fi
}

function sendSMS
{
type=$1
	errorMessage=" Abnormal! ${BillDate} ${Cycle} ${progName}"
	okMessage=" Normal! ${BillDate} ${Cycle} ${progName}"
	smslist=`cat $smsList`
	
echo '' | tee -a $LogFile
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
	${smsProg} "${okMessage}" "${smsList}"
else
	${smsProg} "${errorMessage}" "${smsList}"
fi
}

function sendDelayMail
{
count=$1
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} 執行時間已達${count}分鐘" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} Bill_Date:${BillDate} CYCLE:${Cycle} 執行時間已達${count}分鐘，請確認是否正常.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
}

function sendDelaySMS
{
count=$1
	Message=" Warning! over <${count}> minutes ${BillDate} <${Cycle}> ${progName}"
	smslist=`cat $smsList`

	${smsProg} "${Message}" "${smsList}"
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BILL_DATE> <PROC_TYPE> <CYCLE>"
	echo ""
	echo "For example: $0 20190701 B 50"
	echo "For example: $0 20190701 T 50"
	echo ""
}

if [[ $# -lt 3 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_DATE : ${BillDate}" | tee -a $LogFile
echo "PROC_TYPE : ${ProcType}" | tee -a $LogFile
echo "CYCLE : ${Cycle}" | tee -a $LogFile
echo '' | tee -a $LogFile
cd ${WorkDir}
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Extract MAST
echo "----->>>>>-----Step 1. Run Extract MAST Process (Start...)" | tee -a $LogFile
HGB_UBL_Extract $BillDate $Cycle $ProcType
Pause
checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Extract Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
	echo "-----<<<<<-----Step 1. Run Extract MAST Process (End...Failed)" | tee -a $LogFile
	AutoWatch 1
else
	echo "waiting for 60 seconds before check DIO status" | tee -a $LogFile
	sleep 60
	run_cnt=0
	mod_cnt=1
	checkdone=0
	checkerror=0
	checkwait=0
		while [ $checkdone -eq 0 ] 
		do
			echo "----->>>>>-----Step 2. Run Extract DIO Check MAST Process (Start...)" | tee -a $LogFile
			HGB_UBL_Extract_DIO_Check $BillDate $Cycle MAST $ProcType
			sleep 60
			(( run_cnt++ ))
			mod_cnt=`expr $run_cnt % 60`
			checkdone=`cat ${LogDir}/${progName}_DIO_Check.data|grep 'Extract_DIO_Check MAST Process RETURN_CODE = 0000'|wc -l`
			checkerror=`cat ${LogDir}/${progName}_DIO_Check.data|grep -E 'ORA|ora|Extract_DIO_Check MAST Process RETURN_CODE = 9999'|wc -l`
			checkwait=`cat $LogFile|grep 'Extract_DIO_Check MAST Processing'|wc -l`
				if [[ $mod_cnt -eq 0 ]]; then
					echo "Run Count : $run_cnt" | tee -a $LogFile
					echo "!!!please check Extract DIO MAST status!!!" | tee -a $LogFile
					echo "----->>>>>-----Step 2. Run Extract DIO Check MAST Processed `expr $run_cnt / 60`hours (Need to Check...)" | tee -a $LogFile
					sendDelayMail $run_cnt
					if [[ $DB = "HGBBL" ]]; then
						sendDelaySMS $run_cnt
					fi
				fi
				
				if  [[ $checkerror -ge 1 ]]; then
					echo "Error Count : $checkerror" | tee -a $LogFile
					echo "-----<<<<<-----Step 1. Run Extract MAST Process (End...Failed)" | tee -a $LogFile
					echo "-----<<<<<-----Step 2. Run Extract DIO Check MAST Process (End... Failed)" | tee -a $LogFile
					AutoWatch 1
				else
					echo "Run Count : $run_cnt" | tee -a $LogFile
					echo "Done Count : $checkdone" | tee -a $LogFile
					echo "Error Count : $checkerror" | tee -a $LogFile
					echo "Wait Count : $checkwait" | tee -a $LogFile
					echo "---------------Step 2. Run Extract DIO Check MAST Processing" | tee -a $LogFile
					Pause
				fi
		done
	echo "-----<<<<<-----Step 1. Run Extract MAST Process (End... Successed)" | tee -a $LogFile
	echo "-----<<<<<-----Step 2. Run Extract DIO Check MAST Process (End... Successed)" | tee -a $LogFile
fi

AutoWatch 0

```

## UBL\BL\Extract\bin\HGB_UBL_Extract.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Extract.sh
--# Path : /extsoft/UBL/BL/Extract/bin
--# SQL name : HGB_UBL_Extract.sql
--#
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
   v_BILL_DATE      VARCHAR2(8)  := '&1';
   v_CYCLE          NUMBER(2)    := '&2';
   v_PROC_TYPE      VARCHAR2(1)  := '&3';
   CH_USER          VARCHAR2(8)  := 'UBL';
   NU_BILL_SEQ      NUMBER;
   CH_ERR_CDE       VARCHAR2(10);
   CH_ERR_MSG       VARCHAR2(300);
   On_Err           EXCEPTION;
begin
        DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN Extract Process...'); 
         SELECT A.BILL_SEQ
           INTO NU_BILL_SEQ
     FROM FY_TB_BL_BILL_CNTRL A
    WHERE A.BILL_DATE   =TO_DATE(v_BILL_DATE,'YYYYMMDD')
	and a.cycle =v_CYCLE
	and a.create_user =CH_USER;
    ----DIO 
    Fy_Pg_Dio_Util.Ins_Dio_MAST
                           ('UBL',     --Pi_Sys_Id ,
                            'MAST', --Pi_Proc_Id ,
                            NU_Bill_Seq ,
                            v_Proc_Type, 
                            'O',        --Pi_Io_Type,
                            CH_USER,
                            CH_Err_Cde,
                            CH_Err_Msg);                           
    IF CH_Err_Cde <> '0000' THEN
       RAISE ON_ERR;
    END IF; 
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||' END Extract Process...'); 
   DBMS_OUTPUT.Put_Line('Extract Process RETURN_CODE = 0000'||null);  
EXCEPTION 
   WHEN ON_ERR THEN
       DBMS_OUTPUT.Put_Line('Extract Process RETURN_CODE = 9999'||SUBSTR(' Extract'||ch_err_msg,1,250)); 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Extract Process RETURN_CODE = 9999'||SUBSTR(' Extract'||SQLERRM,1,250)); 
end;
/

exit;

```

## UBL\BL\Preparation\bin\HGB_UBL_Preparation_AR_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Preparation.sh
--# Path : /extsoft/UBL/BL/Preparation/bin
--# SQL name : HGB_UBL_Preparation_AR_Check.sql
--#
--# Date : 2018/09/17 Created by Mike Kuan
--# Description : HGB UBL Preparation
--########################################################################################
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := '&4';
  CH_USER          VARCHAR2(8)  := 'UBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STATUS        FY_TB_DIO_CNTRL.STATUS%TYPE;
  CH_IO_TYPE       FY_TB_DIO_CNTRL.IO_TYPE%TYPE;
  NU_CNT           NUMBER;
  On_Err           EXCEPTION;
  CURSOR C1 IS
     SELECT STATUS
       FROM FY_TB_DIO_CNTRL A
      WHERE BILL_SEQ  =NU_BILL_SEQ
        AND PROCESS_NO=v_PROCESS_NO
        AND ACCT_GROUP=CH_ACCT_GROUP
        AND PROC_TYPE =v_PROC_TYPE
        AND PROC_ID   ='BALANCE' 
     --   AND STATUS    ='S'
        AND PRE_CNTRL_SEQ =(SELECT MAX(CNTRL_SEQ) FROM FY_TB_DIO_CNTRL
                             WHERE BILL_SEQ  =A.BILL_SEQ
                               AND PROCESS_NO=A.PROCESS_NO
                               AND ACCT_GROUP=A.ACCT_GROUP
                               AND PROC_TYPE =A.PROC_TYPE
                               AND PROC_ID   ='ACCTLIST')
		order by decode(STATUS,'E',1,'A',2,'S',3,4);

begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   and A.CREATE_USER=CH_USER;
   
  CH_STATUS :='Y';
  FOR R1 IN C1 LOOP
    IF R1.STATUS='E' THEN
       DBMS_OUTPUT.Put_Line('Preparation_AR_Check Process RETURN_CODE = 9999'); 
       RAISE ON_ERR;
    ELSIF R1.STATUS<>'S' THEN
       DBMS_OUTPUT.Put_Line('Preparation_AR_Check Processing'); 
       RAISE ON_ERR;
    END IF;
    CH_STATUS :='N';
  END LOOP;
  IF CH_STATUS='Y' THEN
     DBMS_OUTPUT.Put_Line('Preparation_AR_Check Processing'); 
  ELSE   
     DBMS_OUTPUT.Put_Line('Preparation_AR_Check Process RETURN_CODE = 0000'); 
  END IF;   
EXCEPTION 
   WHEN on_err THEN
      NULL;
   WHEN OTHERS THEN
     DBMS_OUTPUT.Put_Line('Preparation_AR_Check Process RETURN_CODE = 9999'); 
end;
/

```

## UBL\BL\Preparation\bin\HGB_UBL_Preparation_STATUS_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Preparation.sh
--# Path : /extsoft/UBL/BL/Preparation/bin
--# SQL name : HGB_UBL_Preparation_STATUS_Check.sql
--#
--# Date : 2018/09/17 Created by Mike Kuan
--# Description : HGB UBL Preparation
--########################################################################################
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := '&4';
  CH_USER          VARCHAR2(8)  := 'UBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number, iacct_group varchar2) IS
     select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_acct_list a,
			fy_tb_bl_bill_acct b
	  where a.bill_seq=ibill_seq
	    and a.type    =iacct_group
	    and b.bill_seq=a.bill_seq
	    and b.acct_id =a.acct_id
	  group by b.bill_status
	union
      select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_bill_acct b
	  where b.bill_seq   =ibill_seq
	    and b.acct_group =iacct_group
		and v_PROCESS_NO<>999
	  group by b.bill_status;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   AND A.CREATE_USER=CH_USER;
  FOR R1 IN C1(nu_bill_seq,CH_ACCT_GROUP) LOOP
     DBMS_OUTPUT.Put_Line('Preparation_STATUS_Check Status='||r1.status||', Cnt='||to_char(r1.cnt));  
  end loop; 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Preparation_STATUS_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## UBL\BL\Preparation\bin\HGB_UBL_Preparation_STEP_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Preparation.sh
--# Path : /extsoft/UBL/BL/Preparation/bin
--# SQL name : HGB_UBL_Preparation_STEP_Check.sql
--#
--# Date : 2018/09/17 Created by Mike Kuan
--# Description : HGB UBL Preparation
--########################################################################################
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := '&4';
  CH_USER          VARCHAR2(8)  := 'UBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1 IS
     SELECT DECODE(STATUS,'CL','CI',
                   'CI','BI',
                   'BI','MAST',
                   'MAST','CN',
                   'CN','END',STATUS) STEP                            
       FROM FY_TB_BL_BILL_PROCESS_LOG BL 
      WHERE BILL_SEQ  = nu_BILL_SEQ
        AND PROCESS_NO= v_PROCESS_NO
        AND ACCT_GROUP= CH_ACCT_GROUP
        AND PROC_TYPE = v_PROC_TYPE
        AND BEGIN_TIME= (SELECT MAX(BEGIN_TIME) from FY_TB_BL_BILL_PROCESS_LOG 
                                           WHERE BILL_SEQ  = BL.BILL_SEQ
                                             AND PROCESS_No= BL.PROCESS_NO
                                             AND ACCT_GROUP= BL.ACCT_GROUP
                                             AND PROC_TYPE = BL.PROC_TYPE)
     order by DECODE(STATUS,'CL',1,'CI',2,'BI',3,'MAST',4,'CN',5,0) DESC; 
     R1     C1%ROWTYPE;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and A.cycle=v_CYCLE
   and A.CREATE_USER=CH_USER;
  OPEN C1;
  FETCH C1 INTO R1;
  IF C1%NOTFOUND THEN  
     CH_STEP :='CI';
  ELSE
     CH_STEP := R1.STEP;
  END IF;
  CLOSE C1;
  IF CH_STEP NOT IN ('CI','BI','MAST','CN') THEN
     DBMS_OUTPUT.Put_Line('Preparation_STEP_Check Process RETURN_CODE = 9999'); 
  ELSE   
     DBMS_OUTPUT.Put_Line(CH_STEP);
  END IF;   
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Preparation_STEP_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## UBL\BL\Preparation\bin\HGB_UBL_Preparation.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_UBL_Preparation.sh
# Path : /extsoft/UBL/BL/Preparation/bin
#
# Date : 2018/09/17 Created by Mike Kuan
# Description : HGB UBL Preparation
########################################################################################
# Date : 2018/09/28 Modify by Mike Kuan
# Description : add Status Check
########################################################################################
# Date : 2018/11/06 Modify by Mike Kuan
# Description : add grep condiation
########################################################################################
# Date : 2018/11/26 Modify by Mike Kuan
# Description : add MPC
########################################################################################
# Date : 2019/06/30 Modify by Mike Kuan
# Description : SR213344_NPEP add cycle parameter
########################################################################################
# Date : 2021/02/20 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_UBL_Preparation"
sysdt=`date +%Y%m%d%H%M%S`
BillDate=$1
ProcType=$2
ProcessNo=$3
Cycle=$4
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Preparation/bin
LogDir=$HomeDir/Preparation/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_${progName}.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh
#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_UBL_Preparation_STEP_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STEP.data <<EOF
@HGB_UBL_Preparation_STEP_Check.sql $1 $2 $3 $4
EOF`
cat ${LogDir}/${progName}_STEP.data |read STEP
echo "Step or Message: ${STEP}" | tee -a ${LogFile}
}

function HGB_UBL_Preparation_STATUS_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STATUS.data <<EOF
@HGB_UBL_Preparation_STATUS_Check.sql $1 $2 $3 $4
EOF`
cat ${LogDir}/${progName}_STATUS.data | tee -a ${LogFile}
}

function HGB_UBL_Preparation_CI
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_UBL_Preparation.sql $1 $2 $3 CI $4
exit
EOF`
}

function HGB_UBL_Preparation_BI
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_UBL_Preparation.sql $1 $2 $3 BI $4
exit
EOF`
}

function HGB_UBL_Preparation_AR_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_AR.data <<EOF
@HGB_UBL_Preparation_AR_Check.sql $1 $2 $3 $4
EOF`
cat ${LogDir}/${progName}_AR.data |read STEP
}

function HGB_UBL_Preparation_MAST
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_UBL_Preparation.sql $1 $2 $3 MAST $4
exit
EOF`
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   sendMail 0
   echo "Send Mail (Failed)" | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
		sendSMS 0
		echo "Send SMS (Failed)" | tee -a $LogFile
   fi
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Successed)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   sendMail 1
   echo "Send Mail (Successed)" | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
		sendSMS 1
		echo "Send SMS (Successed)" | tee -a $LogFile
   fi
fi

#if [[ $DB = "HGBBL" ]]; then
#ftp -nv 10.68.8.37 <<EOF
#user $OCSID $OCSPW
#prompt off
#ascii
#cd /cb/AutoWatch/log/joblog
#put $AutoWatchFile
#bye
#EOF
#fi

exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Normal" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Abnormal" -a ${LogFile} ${maillist}  << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
fi
}

function sendSMS
{
type=$1
	errorMessage=" Abnormal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	okMessage=" Normal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	smslist=`cat $smsList`
	
echo '' | tee -a $LogFile
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
	${smsProg} "${okMessage}" "${smsList}"
else
	${smsProg} "${errorMessage}" "${smsList}"
fi
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BILL_DATE> <PROC_TYPE> <PROCESS_NO> <CYCLE>"
	echo ""
    echo "For QA example: $0 20190701 T 999 50"
    echo "For PROD example: $0 20190701 B 001 50"
    echo "For PROD example: $0 20190701 B 002 50"
    echo "For PROD example: $0 20190701 B 003 50"
    echo "For PROD example: $0 20190701 B 004 50"
    echo "For PROD example: $0 20190701 B 005 50"
    echo "For PROD example: $0 20190701 B 006 50"
    echo "For PROD example: $0 20190701 B 007 50"
    echo "For PROD example: $0 20190701 B 008 50"
    echo "For PROD example: $0 20190701 B 009 50"
    echo "For PROD example: $0 20190701 B 010 50"
    echo "For PROD_MV example: $0 20190701 B 888 50"
    echo "For HOLD example: $0 20190701 B 999 50"
	echo ""
}

if [[ $# -lt 4 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_DATE : ${BillDate}" | tee -a $LogFile
echo "CYCLE : ${Cycle}" | tee -a $LogFile
echo "PROC_TYPE : ${ProcType}" | tee -a $LogFile
echo "PROCESS_NO : ${ProcessNo}" | tee -a $LogFile
echo '' | tee -a $LogFile
cd ${WorkDir}
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Preparation Step Check
echo "----->>>>>-----Step 0. Run Preparation Step Check Process (Start...)" | tee -a $LogFile
HGB_UBL_Preparation_STEP_Check $BillDate $Cycle $ProcessNo $ProcType
checkcode=`cat ${LogDir}/${progName}_STEP.data|grep -E 'ORA|ora|Preparation_STEP_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 0. Run Preparation Step Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 0. Run Preparation Step Check Process (End... Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Preparation Status Check
echo "----->>>>>-----Step 1. Run Preparation Status Check Process (Start...)" | tee -a $LogFile
HGB_UBL_Preparation_STATUS_Check $BillDate $Cycle $ProcessNo $ProcType
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Preparation_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 1. Run Preparation Status Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 1. Run Preparation Status Check Process (End... Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
if [[ ${STEP} == 'CI' ]]; then
#------------執行Preparation_CI, Preparation_BI, Preparation_MAST
	echo "----->>>>>-----Step 2. Run Preparation_CI Process (Start...)" | tee -a $LogFile
	HGB_UBL_Preparation_CI $BillDate $Cycle $ProcessNo $ProcType
	checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_CI Process RETURN_CODE = 9999'|wc -l`
		if [[ $checkcode -ge 1 ]]; then
			echo "-----<<<<<-----Step 2. Run Preparation_CI Process (End...Failed)" | tee -a $LogFile
			AutoWatch 1
		else
			echo "-----<<<<<-----Step 2. Run Preparation_CI Process (End... Successed)" | tee -a $LogFile
			Pause
			echo "----->>>>>-----Step 3. Run Preparation_BI Process (Start...)" | tee -a $LogFile
			HGB_UBL_Preparation_BI $BillDate $Cycle $ProcessNo $ProcType
			checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_BI Process RETURN_CODE = 9999'|wc -l`
				if [[ $checkcode -ge 1 ]]; then
					echo "-----<<<<<-----Step 3. Run Preparation_BI Process (End...Failed)" | tee -a $LogFile
					AutoWatch 1
				else
					echo "-----<<<<<-----Step 3. Run Preparation_BI Process (End... Successed)" | tee -a $LogFile
					Pause
					run_cnt=0
					checkdone=0
					checkerror=0
					checkwait=0
						while [ $checkdone -eq 0 ] 
						do
							echo "----->>>>>-----Step 4. Run Preparation AR Check Process (Start...)" | tee -a $LogFile
							sleep 60
							HGB_UBL_Preparation_AR_Check $BillDate $Cycle $ProcessNo $ProcType
							checkdone=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Process RETURN_CODE = 0000'|wc -l`
							checkerror=`cat ${LogDir}/${progName}_AR.data|grep -E 'ORA|ora|Preparation_AR_Check Process RETURN_CODE = 9999'|wc -l`
							checkwait=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Processing'|wc -l`
							(( run_cnt++ ))
								if [[ $run_cnt -eq 20 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "!!! please check AR Balance to BL status, then rerun $0 $1 $2 $3 !!!" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif  [[ $checkerror -ge 1 ]]; then
									echo "Error Count : $checkerror"
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif [[ $checkwait -eq 1 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "----->>>>>-----Step 4. Run Preparation_AR_Check Processing" | tee -a $LogFile
									Pause
								else
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "Done Count : $checkdone" | tee -a $LogFile
									echo "Error Count : $checkerror" | tee -a $LogFile
									echo "Wait Count : $checkwait" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Successed)" | tee -a $LogFile
									Pause
								fi
						done
					echo "----->>>>>-----Step 5. Run Preparation_MAST Process (Start...)" | tee -a $LogFile
					HGB_UBL_Preparation_MAST $BillDate $Cycle $ProcessNo $ProcType
					checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_MAST Process RETURN_CODE = 9999'|wc -l`
						if [[ $checkcode -ge 1 ]]; then
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Failed)" | tee -a $LogFile
							AutoWatch 1
						else
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Successed)" | tee -a $LogFile
						fi
				fi
		fi
#----------------------------------------------------------------------------------------------------
elif [[ ${STEP} == 'BI' ]]; then
#------------執行Preparation_BI, Preparation_MAST
			echo "--------------------Before Step... 2. Run Preparation_CI Process (End... Successed)--------------------" | tee -a $LogFile
			Pause
			echo "----->>>>>-----Step 3. Run Preparation_BI Process (Start...)" | tee -a $LogFile
			HGB_UBL_Preparation_BI $BillDate $Cycle $ProcessNo $ProcType
			checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_BI Process RETURN_CODE = 9999'|wc -l`
				if [[ $checkcode -ge 1 ]]; then
					echo "-----<<<<<-----Step 3. Run Preparation_BI Process (End...Failed)" | tee -a $LogFile
					AutoWatch 1
				else
					echo "-----<<<<<-----Step 3. Run Preparation_BI Process (End... Successed)" | tee -a $LogFile
					Pause
					run_cnt=0
					checkdone=0
					checkerror=0
					checkwait=0
						while [ $checkdone -eq 0 ] 
						do
							echo "----->>>>>-----Step 4. Run Preparation AR Check Process (Start...)" | tee -a $LogFile
							sleep 60
							HGB_UBL_Preparation_AR_Check $BillDate $Cycle $ProcessNo $ProcType
							checkdone=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Process RETURN_CODE = 0000'|wc -l`
							checkerror=`cat ${LogDir}/${progName}_AR.data|grep -E 'ORA|ora|Preparation_AR_Check Process RETURN_CODE = 9999'|wc -l`
							checkwait=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Processing'|wc -l`
							(( run_cnt++ ))
								if [[ $run_cnt -eq 20 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "!!! please check AR Balance to BL status, then rerun $0 $1 $2 $3 !!!" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif  [[ $checkerror -ge 1 ]]; then
									echo "Error Count : $checkerror"
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif [[ $checkwait -eq 1 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "----->>>>>-----Step 4. Run Preparation_AR_Check Processing" | tee -a $LogFile
									Pause
								else
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "Done Count : $checkdone" | tee -a $LogFile
									echo "Error Count : $checkerror" | tee -a $LogFile
									echo "Wait Count : $checkwait" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Successed)" | tee -a $LogFile
									Pause
								fi
						done
					echo "----->>>>>-----Step 5. Run Preparation_MAST Process (Start...)" | tee -a $LogFile
					HGB_UBL_Preparation_MAST $BillDate $Cycle $ProcessNo $ProcType
					checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_MAST Process RETURN_CODE = 9999'|wc -l`
						if [[ $checkcode -ge 1 ]]; then
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Failed)" | tee -a $LogFile
							AutoWatch 1
						else
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Successed)" | tee -a $LogFile
						fi
				fi
#----------------------------------------------------------------------------------------------------
elif [[ ${STEP} == 'MAST' ]]; then
#------------執行Preparation_MAST
					echo "--------------------Before Step... 2. Run Preparation_CI Process (End... Successed)--------------------" | tee -a $LogFile
					echo "--------------------Before Step... 3. Run Preparation_BI Process (End... Successed)--------------------" | tee -a $LogFile
					Pause
					run_cnt=0
					checkdone=0
					checkerror=0
					checkwait=0
						while [ $checkdone -eq 0 ] 
						do
							echo "----->>>>>-----Step 4. Run Preparation AR Check Process (Start...)" | tee -a $LogFile
							sleep 60
							HGB_UBL_Preparation_AR_Check $BillDate $Cycle $ProcessNo $ProcType
							checkdone=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Process RETURN_CODE = 0000'|wc -l`
							checkerror=`cat ${LogDir}/${progName}_AR.data|grep -E 'ORA|ora|Preparation_AR_Check Process RETURN_CODE = 9999'|wc -l`
							checkwait=`cat ${LogDir}/${progName}_AR.data|grep 'Preparation_AR_Check Processing'|wc -l`
							(( run_cnt++ ))
								if [[ $run_cnt -eq 20 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "!!! please check AR Balance to BL status, then rerun $0 $1 $2 $3 !!!" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif  [[ $checkerror -ge 1 ]]; then
									echo "Error Count : $checkerror"
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Failed)" | tee -a $LogFile
									AutoWatch 1
								elif [[ $checkwait -eq 1 ]]; then
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "----->>>>>-----Step 4. Run Preparation_AR_Check Processing" | tee -a $LogFile
									Pause
								else
									echo "Run Count : $run_cnt" | tee -a $LogFile
									echo "Done Count : $checkdone" | tee -a $LogFile
									echo "Error Count : $checkerror" | tee -a $LogFile
									echo "Wait Count : $checkwait" | tee -a $LogFile
									echo "-----<<<<<-----Step 4. Run Preparation AR Check Process (End... Successed)" | tee -a $LogFile
									Pause
								fi
						done
					echo "----->>>>>-----Step 5. Run Preparation_MAST Process (Start...)" | tee -a $LogFile
					HGB_UBL_Preparation_MAST $BillDate $Cycle $ProcessNo $ProcType
					checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Preparation_MAST Process RETURN_CODE = 9999'|wc -l`
						if [[ $checkcode -ge 1 ]]; then
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Failed)" | tee -a $LogFile
							AutoWatch 1
						else
							echo "-----<<<<<-----Step 5. Run Preparation_MAST Process (End...Successed)" | tee -a $LogFile
						fi
else
	echo "Preparation Status not in ('CI','BI','MAST')" | tee -a $LogFile
fi		
Pause

#----------------------------------------------------------------------------------------------------
#------------執行Preparation Status Check
echo "----->>>>>-----Step 6. Run Preparation Status Check Process (Start...)" | tee -a $LogFile
HGB_UBL_Preparation_STATUS_Check $BillDate $Cycle $ProcessNo $ProcType
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Preparation_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 6. Run Preparation Status Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 6. Run Preparation Status Check Process (End... Successed)" | tee -a $LogFile

AutoWatch 0

```

## UBL\BL\Preparation\bin\HGB_UBL_Preparation.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Preparation.sh
--# Path : /extsoft/UBL/BL/Preparation/bin
--# SQL name : HGB_UBL_Preparation_AR_Check.sql
--#
--# Date : 2018/09/17 Created by Mike Kuan
--# Description : HGB UBL Preparation
--########################################################################################
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE 	  VARCHAR2(8)  := '&1';
v_CYCLE           NUMBER(2)    := '&2';
v_PROCESS_NO      NUMBER(3)    := '&3';
v_STEP            VARCHAR2(4)  := '&4';
v_PROC_TYPE       VARCHAR2(1)  := '&5';
CH_USER           VARCHAR2(8)  := 'UBL';
NU_CYCLE          NUMBER(2);
CH_BILL_PERIOD    VARCHAR2(6);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ACCT_GROUP     FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;
begin 
	 CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.CYCLE, A.BILL_PERIOD, A.BILL_SEQ, A.CYCLE_MONTH, DECODE(V_PROCESS_NO,999,DECODE(V_PROC_TYPE,'T','QA',B.ACCT_GROUP),B.ACCT_GROUP)
     INTO NU_CYCLE, CH_BILL_PERIOD, NU_BILL_SEQ, NU_CYCLE_MONTH, CH_ACCT_GROUP
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
      AND A.CREATE_USER=CH_USER
	  --AND A.CREATE_USER=B.CREATE_USER
	  AND A.CYCLE     =v_CYCLE
      AND B.CYCLE     =A.CYCLE
      AND B.PROCESS_NO=v_PROCESS_NO;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':Preparation_'||v_STEP||' BEGIN');  
   IF v_STEP='CI' THEN
      FY_PG_BL_BILL_CI.MAIN(NU_BILL_SEQ,
                            v_PROCESS_NO,
                            CH_ACCT_GROUP,
                            v_PROC_TYPE,
                            CH_USER, 
                            CH_ERR_CDE, 
                            CH_ERR_MSG); 
      IF CH_ERR_CDE<>'0000' THEN
         RAISE ON_ERR;
      END IF;
   ELSIF v_STEP='BI' THEN   
      FY_PG_BL_BILL_BI.MAIN(NU_BILL_SEQ,
                            v_PROCESS_NO,
                            CH_ACCT_GROUP,
                            v_PROC_TYPE,
                            CH_USER, 
                            CH_ERR_CDE, 
                            CH_ERR_MSG); 
      IF CH_ERR_CDE<>'0000' THEN
         RAISE ON_ERR;
      END IF;   
   ELSIF v_STEP='MAST' THEN 
      FY_PG_BL_BILL_MAST.MAIN(NU_BILL_SEQ,
                              v_PROCESS_NO,
                              CH_ACCT_GROUP,
                              v_PROC_TYPE,
                              CH_USER, 
                              CH_ERR_CDE, 
                              CH_ERR_MSG); 
      IF CH_ERR_CDE<>'0000' THEN
         RAISE ON_ERR;
      END IF;  
   END IF;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':Preparation_'||v_STEP||' END');                       
	 DBMS_OUTPUT.Put_Line(CH_ERR_CDE||CH_ERR_MSG);  
EXCEPTION 
   WHEN ON_ERR THEN
       DBMS_OUTPUT.Put_Line('Preparation_'||v_STEP|| ' Process RETURN_CODE = 9999'); 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Preparation_'||v_STEP|| ' Process RETURN_CODE = 9999'); 
end;
/

exit;
```

## UBL\BL\Surrounding\BL_Close\bin\HGB_BL_Close.sql
```sql
SET serveroutput ON SIZE 1000000
set verify off
declare 
   v_BILL_DATE       VARCHAR2(8)  := '&1'; 
   NU_CYCLE          NUMBER(2);
   CH_BILL_PERIOD    VARCHAR2(6);
   CH_USER           VARCHAR2(8)  :='UBL';
   nu_CTRL_CNT       number       :=0;
   NU_CNT            NUMBER;
   CH_ERR_CDE        VARCHAR2(10);
   CH_ERR_MSG        VARCHAR2(300);
   On_Err            EXCEPTION;
   CURSOR c1(iCYCLE NUMBER) IS
      select * 
        from fy_tb_bl_account 
       where cycle     = iCYCLE
         and bl_status<>'CLOSE'
         and LAST_BILL_SEQ is not null  --SUBSCRIBER.STATUS = ��C��
         and add_months(eff_date,-6)< TRUNC(SYSDATE); --TO_DATE(V_BILL_DATE,'YYYYMMDD');  --< 6�Ӥ�
begin
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' BEGIN BA_CLOSE Process...'); 
   CH_ERR_MSG := 'GET CYCLE.BILL_DATE='||V_BILL_DATE||':';
   SELECT CYCLE, CURRECT_PERIOD
     INTO NU_CYCLE, CH_BILL_PERIOD
     FROM FY_TB_BL_CYCLE
    WHERE currect_period IS NOT NULL
      AND TO_DATE(CURRECT_PERIOD||FROM_DAY,'YYYYMMDD') =
          DECODE(SUBSTR(v_BILL_DATE,-2),'01',ADD_MONTHS(TO_DATE(v_BILL_DATE,'YYYYMMDD'),-1),TO_DATE(v_BILL_DATE,'YYYYMMDD'));
        
   for R1 in c1(NU_CYCLE) loop
      NU_CTRL_CNT := NU_CTRL_CNT+1;
      begin
         --CSM_PAY_CHANNEL.PCN_STATUS = ��C�� & STATUS_DATE < 6�Ӥ�
         CH_ERR_MSG := 'GET FY_TB_CM_ACCOUNT.ACCT_ID='||TO_CHAR(R1.ACCT_ID)||':';
         SELECT COUNT(1)
           INTO NU_CNT
           FROM FY_TB_CM_ACCOUNT
          where ACCT_ID = R1.ACCT_ID
            AND STATUS='C'
            AND EFF_DATE<add_months(to_date(to_char(sysdate, 'yyyymm')||'01', 'yyyymmdd'), -6);
         IF NU_CNT=0 THEN
            RAISE ON_ERR;
         END IF;   
         
         --AR1_ACCOUNT.LAST_ACTIVITY_STATUS_DATE < 6�Ӥ� & AR_BALANCE <= 0
         CH_ERR_MSG := 'GET AR1_ACCOUNT.ACCT_ID='||TO_CHAR(R1.ACCT_ID)||':';
         select count(1) 
           into NU_CNT
           from ar1_account@HGB_UAR_REF
          where account_id = R1.ACCT_ID
            and (last_activity_status_date >= add_months(to_date(to_char(sysdate, 'yyyymm')||'01', 'yyyymmdd'), -6) OR
                 ar_balance > 0 ); 
         IF NU_CNT>0 THEN
            RAISE ON_ERR;
         END IF;  
         
         --CHEKC �����X�bOC
         CH_ERR_MSG := 'GET FY_TB_BL_BILL_CI.ACCT_ID='||TO_CHAR(R1.ACCT_ID)||':';
         SELECT COUNT(1)
           INTO NU_CNT
           FROM FY_TB_BL_BILL_CI
          WHERE ACCT_ID =R1.ACCT_ID
            AND BILL_SEQ IS NULL;
         IF NU_CNT>0 THEN
            RAISE ON_ERR;
         END IF;               
      
         --�̪�@���X�b���PREV_BALANCE_AMT <= 0 & TOTAL_AMT_DUE <= 0 & TOTAL_FINANCE_ACT = 0
         SELECT COUNT(1)
           INTO NU_CNT  
           FROM FY_TB_BL_BILL_MAST
          WHERE BILL_SEQ=R1.PRE_BILL_SEQ
            AND ACCT_ID =R1.ACCT_ID
            AND BILL_NBR=R1.PRE_BILL_NBR
            AND LAST_AMT<=0 
            AND TOT_AMT <=0
            AND PAID_AMT =0;
         IF NU_CNT>0 THEN   
            UPDATE FY_TB_BL_ACCOUNT SET  BL_STATUS  ='CLOSE',
                                         STATUS_DATE=SYSDATE,
                                         UPDATE_DATE=SYSDATE,
                                         UPDATE_USER='UBL'
                                   WHERE ACCT_ID=R1.ACCT_ID;     
         END IF;
      EXCEPTION
         WHEN ON_ERR THEN
            NULL;
         WHEN OTHERS THEN
            NULL;
      END;
   END LOOP;  
   COMMIT;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||' END BA_CLOSE Process...');  
   DBMS_OUTPUT.Put_Line('0000');    
EXCEPTION 
   WHEN OTHERS THEN
      DBMS_OUTPUT.Put_Line('Pre_CutDate Process RETURN_CODE = 9999');
      DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY/MM/DD-HH:MI:SS')||SUBSTR(' END BA_CLOSE Process... '||SQLERRM,1,250));         
end;
/
exit

```

## UBL\BL\Surrounding\BMEX_RETN\HGB_BMEX_RETN_file_loader.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_BMEX_RETN_file_loader.sh
# Path : /extsoft/UBL/BL/Surrounding/BMEX_RETN
#
# Date : 2021/06/11 Created by Mike Kuan
# Description : SR228930_紙本帳單整合交寄功能HGB&HGBN
#               SR228931_紙本帳單攔回 HGB及HGBN
########################################################################################
# Date : 2023/01/10 Created by Mike Kuan
# Description : CR23015954_cabsftp 帳號密碼變更
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
BillDate=`date +%Y%m%d`
home="/extsoft/UBL/BL/Surrounding/BMEX_RETN"
dataFolder="${home}/data"
bakFolder="${dataFolder}/bak"
dataFile="${dataFolder}/HGB_BMEX_RETN_$BillDate.txt"
dataFile_HGB_BMEX="${dataFolder}/HGB_BMEX_list.txt"
dataFile_HGBN_BMEX="${dataFolder}/HGBN_BMEX_list.txt"
dataFile_HGB_RETN="${dataFolder}/HGB_RETN_list.txt"
dataFile_HGBN_RETN="${dataFolder}/HGBN_RETN_list.txt"
LogDir="${home}/log"
LogFile="${LogDir}/HGB_BMEX_RETN_$BillDate.log"
MailList=/extsoft/UBL/BL/MailList.txt
progName=$(basename $0 .sh)
echo "Program Name is:${progName}"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=fareastone/cabsftp
OCSPWD=CabsQAws!!22

#---------------------------------------------------------------------------------------#
#      FTP
#---------------------------------------------------------------------------------------# 
utilDir="/cb/BCM/util"
ftpPROG="${utilDir}/Ftp2Remote.sh"
ftpIP='10.64.16.102'
ftpUSER=$OCSID
ftpPWD=$OCSPWD
ftpPATH=/FTPService/Unmask_MSISDN
ftpFILE_HGB_BMEX=HGB_BMEX_list.txt
ftpFILE_HGBN_BMEX=HGBN_BMEX_list.txt
ftpFILE_HGB_RETN=HGB_RETN_list.txt
ftpFILE_HGBN_RETN=HGBN_RETN_list.txt

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a ${LogFile}
sleep 1
done
}

function getFile
{
getFileDate=`date '+%Y/%m/%d-%H:%M:%S'`
   echo '' | tee -a ${LogFile}
   echo "getting BMEX & RETN files..." | tee -a ${LogFile}
   echo '' | tee -a ${LogFile}
   if [[ ${hostname} = "idc-hgbap01p" ]]; then
		echo "FTP Command: ${ftpPROG} ${ftpIP} ${ftpUSER} ******** ${dataFolder} ${ftpPATH} ${ftpFILE_HGB_BMEX} 1" | tee -a ${logFile}
		${ftpPROG} ${ftpIP} ${ftpUSER} ${ftpPWD} ${dataFolder} ${ftpPATH} ${ftpFILE_HGB_BMEX} 1
		echo "FTP Command: ${ftpPROG} ${ftpIP} ${ftpUSER} ******** ${dataFolder} ${ftpPATH} ${ftpFILE_HGBN_BMEX} 1" | tee -a ${logFile}
		${ftpPROG} ${ftpIP} ${ftpUSER} ${ftpPWD} ${dataFolder} ${ftpPATH} ${ftpFILE_HGBN_BMEX} 1
		echo "FTP Command: ${ftpPROG} ${ftpIP} ${ftpUSER} ******** ${dataFolder} ${ftpPATH} ${ftpFILE_HGB_RETN} 1" | tee -a ${logFile}
		${ftpPROG} ${ftpIP} ${ftpUSER} ${ftpPWD} ${dataFolder} ${ftpPATH} ${ftpFILE_HGB_RETN} 1		
		echo "FTP Command: ${ftpPROG} ${ftpIP} ${ftpUSER} ******** ${dataFolder} ${ftpPATH} ${ftpFILE_HGBN_RETN} 1" | tee -a ${logFile}
		${ftpPROG} ${ftpIP} ${ftpUSER} ${ftpPWD} ${dataFolder} ${ftpPATH} ${ftpFILE_HGBN_RETN} 1
	else
		echo "host=${hostname}" | tee -a ${logFile}
   fi
}

function truncateDB
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@${home}/truncate_BMEX_RETN.sql
exit
EOF`
}

function insertDB
{
file=$1
echo "Call insertDB"
NLS_LANG="TRADITIONAL CHINESE_TAIWAN.AL32UTF8"
export NLS_LANG
`sqlplus -s ${DBID}/${DBPWD}@${DB}<<EOF
set tab off
SET ECHO OFF
set termout off
SET PAGESIZE 32766
SET LINESIZE 32766
SET FEEDBACK OFF
-- set NULL 'NO ROWS SELECTED'
set linesize 1024
SET TRIMSPOOL ON

@${home}/data/HGB_BMEX_RETN_$BillDate.sql

exit;
EOF`
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_UBL" -s "${progName} Date:${BillDate} Normal" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} Date:${BillDate} Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a ${LogFile}
else
mailx -r "HGB_UBL" -s "${progName} Date:${BillDate} Abnormal" -a ${LogFile} ${maillist}  << EOF
Dears,
   ${progName} Date:${BillDate} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a ${LogFile}
exit 0;
fi
}

########################################################################################
# Main
########################################################################################

cd ${home}
startDate=`date +%Y%m%d_%H%M%S`
echo $startDate > ${LogFile}

## get files as FTP
echo "get files as FTP" | tee -a ${LogFile}
getFile
Pause

## check file exists
[ -f $dataFile_HGB_BMEX -a -f $dataFile_HGBN_BMEX -a -f $dataFile_HGB_RETN -a -f $dataFile_HGBN_RETN ] && echo "all files exists" | tee -a ${LogFile} || sendMail 0
Pause

## truncate table HGB_BMEX, HGBN_BMEX, HGB_RETN, HGBN_RETN
[ -f truncate_BMEX_RETN.sql ] && echo "truncate SQL file exists" | tee -a ${LogFile} || sendMail 0
truncateDB
Pause

## preparing HGB_BMEX insert data into sql file
IFS="," #改變DATA FILE分隔符號從預設空白改為逗號
cat ${dataFile_HGB_BMEX}|while read NAME ACCT_ID EFF_DATE
do
echo "INSERT INTO fet_tb_bl_bmex_list VALUE
   (SELECT '${NAME}' "NAME", ${ACCT_ID} "ACCT_ID", 50 "CYCLE",
           TO_DATE (${EFF_DATE}, 'yyyymmdd') "EFF_DATE", SYSDATE create_date,
           'UBL' create_user, SYSDATE update_date, 'UBL' update_user
      FROM DUAL);" >> ${home}/data/HGB_BMEX_RETN_$BillDate.sql
#echo "IID[${PRIM_RESOURCE_VAL}] COUNT[${COUNT}]" | tee -a ${logFile}
done < $dataFile_HGB_BMEX
Pause

## preparing HGBN_BMEX insert data into sql file
cat ${dataFile_HGBN_BMEX}|while read NAME ACCT_ID EFF_DATE
do
echo "INSERT INTO fet_tb_bl_bmex_list VALUE
   (SELECT '${NAME}' "NAME", ${ACCT_ID} "ACCT_ID", 10 "CYCLE",
           TO_DATE (${EFF_DATE}, 'yyyymmdd') "EFF_DATE", SYSDATE create_date,
           'UBL' create_user, SYSDATE update_date, 'UBL' update_user
      FROM DUAL);" >> ${home}/data/HGB_BMEX_RETN_$BillDate.sql
#echo "IID[${PRIM_RESOURCE_VAL}] COUNT[${COUNT}]" | tee -a ${logFile}
done < $dataFile_HGBN_BMEX
Pause

## preparing HGB_RETN insert data into sql file
cat ${dataFile_HGB_RETN}|while read ACCT_ID SYS_IND CYCLE PRINT_IND
do
echo "INSERT INTO fet_tb_bl_retn_list VALUE
   (SELECT ${ACCT_ID} "ACCT_ID", 50 "CYCLE", '${SYS_IND}' "SYS_IND", '${PRINT_IND}' "PRINT_IND", 
           SYSDATE create_date,
           'UBL' create_user, SYSDATE update_date, 'UBL' update_user
      FROM DUAL);" >> ${home}/data/HGB_BMEX_RETN_$BillDate.sql
done < $dataFile_HGB_RETN
Pause

## preparing HGBN_RETN insert data into sql file
cat ${dataFile_HGBN_RETN}|while read ACCT_ID SYS_IND CYCLE PRINT_IND
do
echo "INSERT INTO fet_tb_bl_retn_list VALUE
   (SELECT ${ACCT_ID} "ACCT_ID", 10 "CYCLE", '${SYS_IND}' "SYS_IND", '${PRINT_IND}' "PRINT_IND", 
           SYSDATE create_date,
           'UBL' create_user, SYSDATE update_date, 'UBL' update_user
      FROM DUAL);" >> ${home}/data/HGB_BMEX_RETN_$BillDate.sql
done < $dataFile_HGBN_RETN
Pause

## insert data to db
echo "Connect to ${DBID}@${DB}" | tee -a ${LogFile}
insertDB
Pause

echo "Move file to bak" | tee -a ${LogFile}
mv ${dataFolder}/*$BillDate* ${dataFolder}/bak
mv ${dataFile_HGB_BMEX} ${dataFolder}/bak/${ftpFILE_HGB_BMEX}_$BillDate
mv ${dataFile_HGBN_BMEX} ${dataFolder}/bak/${ftpFILE_HGBN_BMEX}_$BillDate
mv ${dataFile_HGB_RETN} ${dataFolder}/bak/${ftpFILE_HGB_RETN}_$BillDate
mv ${dataFile_HGBN_RETN} ${dataFolder}/bak/${ftpFILE_HGBN_RETN}_$BillDate

endDate=`date +%Y%m%d_%H%M%S`
echo $endDate | tee -a ${LogFile}

sendMail 1

```

## UBL\BL\Surrounding\BMEX_RETN\HGB_BMEX_RETN_file_loader.sh.bak
```text
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_BMEX_RETN_file_loader.sh
# Path : /extsoft/UBL/BL/Surrounding/BMEX_RETN
#
# Date : 2021/06/11 Created by Mike Kuan
# Description : SR228930_紙本帳單整合交寄功能HGB&HGBN
#               SR228931_紙本帳單攔回 HGB及HGBN
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
BillDate=`date +%Y%m%d`
home="/extsoft/UBL/BL/Surrounding/BMEX_RETN"
dataFolder="${home}/data"
bakFolder="${dataFolder}/bak"
dataFile="${dataFolder}/HGB_BMEX_RETN_$BillDate.txt"
dataFile_HGB_BMEX="${dataFolder}/HGB_BMEX_list.txt"
dataFile_HGBN_BMEX="${dataFolder}/HGBN_BMEX_list.txt"
dataFile_HGB_RETN="${dataFolder}/HGB_RETN_list.txt"
dataFile_HGBN_RETN="${dataFolder}/HGBN_RETN_list.txt"
LogDir="${home}/log"
LogFile="${LogDir}/HGB_BMEX_RETN_$BillDate.log"
MailList=/extsoft/UBL/BL/MailList.txt
progName=$(basename $0 .sh)
echo "Program Name is:${progName}"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=fareastone/cabsftp
OCSPWD=cabsreport

#---------------------------------------------------------------------------------------#
#      FTP
#---------------------------------------------------------------------------------------# 
utilDir="/cb/BCM/util"
ftpPROG="${utilDir}/Ftp2Remote.sh"
ftpIP='10.64.16.102'
ftpUSER=$OCSID
ftpPWD=$OCSPWD
ftpPATH=/FTPService/Unmask_MSISDN
ftpFILE_HGB_BMEX=HGB_BMEX_list.txt
ftpFILE_HGBN_BMEX=HGBN_BMEX_list.txt
ftpFILE_HGB_RETN=HGB_RETN_list.txt
ftpFILE_HGBN_RETN=HGBN_RETN_list.txt

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a ${LogFile}
sleep 1
done
}

function getFile
{
getFileDate=`date '+%Y/%m/%d-%H:%M:%S'`
   echo '' | tee -a ${LogFile}
   echo "getting BMEX & RETN files..." | tee -a ${LogFile}
   echo '' | tee -a ${LogFile}
   if [[ ${hostname} = "idc-hgbap01p" ]]; then
		echo "FTP Command: ${ftpPROG} ${ftpIP} ${ftpUSER} ******** ${dataFolder} ${ftpPATH} ${ftpFILE_HGB_BMEX} 1" | tee -a ${logFile}
		${ftpPROG} ${ftpIP} ${ftpUSER} ${ftpPWD} ${dataFolder} ${ftpPATH} ${ftpFILE_HGB_BMEX} 1
		echo "FTP Command: ${ftpPROG} ${ftpIP} ${ftpUSER} ******** ${dataFolder} ${ftpPATH} ${ftpFILE_HGBN_BMEX} 1" | tee -a ${logFile}
		${ftpPROG} ${ftpIP} ${ftpUSER} ${ftpPWD} ${dataFolder} ${ftpPATH} ${ftpFILE_HGBN_BMEX} 1
		echo "FTP Command: ${ftpPROG} ${ftpIP} ${ftpUSER} ******** ${dataFolder} ${ftpPATH} ${ftpFILE_HGB_RETN} 1" | tee -a ${logFile}
		${ftpPROG} ${ftpIP} ${ftpUSER} ${ftpPWD} ${dataFolder} ${ftpPATH} ${ftpFILE_HGB_RETN} 1		
		echo "FTP Command: ${ftpPROG} ${ftpIP} ${ftpUSER} ******** ${dataFolder} ${ftpPATH} ${ftpFILE_HGBN_RETN} 1" | tee -a ${logFile}
		${ftpPROG} ${ftpIP} ${ftpUSER} ${ftpPWD} ${dataFolder} ${ftpPATH} ${ftpFILE_HGBN_RETN} 1
	else
		echo "host=${hostname}" | tee -a ${logFile}
   fi
}

function truncateDB
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@${home}/truncate_BMEX_RETN.sql
exit
EOF`
}

function insertDB
{
file=$1
echo "Call insertDB"
NLS_LANG="TRADITIONAL CHINESE_TAIWAN.AL32UTF8"
export NLS_LANG
`sqlplus -s ${DBID}/${DBPWD}@${DB}<<EOF
set tab off
SET ECHO OFF
set termout off
SET PAGESIZE 32766
SET LINESIZE 32766
SET FEEDBACK OFF
-- set NULL 'NO ROWS SELECTED'
set linesize 1024
SET TRIMSPOOL ON

@${home}/data/HGB_BMEX_RETN_$BillDate.sql

exit;
EOF`
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_UBL" -s "${progName} Date:${BillDate} Normal" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} Date:${BillDate} Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a ${LogFile}
else
mailx -r "HGB_UBL" -s "${progName} Date:${BillDate} Abnormal" -a ${LogFile} ${maillist}  << EOF
Dears,
   ${progName} Date:${BillDate} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a ${LogFile}
exit 0;
fi
}

########################################################################################
# Main
########################################################################################

cd ${home}
startDate=`date +%Y%m%d_%H%M%S`
echo $startDate > ${LogFile}

## get files as FTP
echo "get files as FTP" | tee -a ${LogFile}
getFile
Pause

## check file exists
[ -f $dataFile_HGB_BMEX -a -f $dataFile_HGBN_BMEX -a -f $dataFile_HGB_RETN -a -f $dataFile_HGBN_RETN ] && echo "all files exists" | tee -a ${LogFile} || sendMail 0
Pause

## truncate table HGB_BMEX, HGBN_BMEX, HGB_RETN, HGBN_RETN
[ -f truncate_BMEX_RETN.sql ] && echo "truncate SQL file exists" | tee -a ${LogFile} || sendMail 0
truncateDB
Pause

## preparing HGB_BMEX insert data into sql file
IFS="," #改變DATA FILE分隔符號從預設空白改為逗號
cat ${dataFile_HGB_BMEX}|while read NAME ACCT_ID EFF_DATE
do
echo "INSERT INTO fet_tb_bl_bmex_list VALUE
   (SELECT '${NAME}' "NAME", ${ACCT_ID} "ACCT_ID", 50 "CYCLE",
           TO_DATE (${EFF_DATE}, 'yyyymmdd') "EFF_DATE", SYSDATE create_date,
           'UBL' create_user, SYSDATE update_date, 'UBL' update_user
      FROM DUAL);" >> ${home}/data/HGB_BMEX_RETN_$BillDate.sql
#echo "IID[${PRIM_RESOURCE_VAL}] COUNT[${COUNT}]" | tee -a ${logFile}
done < $dataFile_HGB_BMEX
Pause

## preparing HGBN_BMEX insert data into sql file
cat ${dataFile_HGBN_BMEX}|while read NAME ACCT_ID EFF_DATE
do
echo "INSERT INTO fet_tb_bl_bmex_list VALUE
   (SELECT '${NAME}' "NAME", ${ACCT_ID} "ACCT_ID", 10 "CYCLE",
           TO_DATE (${EFF_DATE}, 'yyyymmdd') "EFF_DATE", SYSDATE create_date,
           'UBL' create_user, SYSDATE update_date, 'UBL' update_user
      FROM DUAL);" >> ${home}/data/HGB_BMEX_RETN_$BillDate.sql
#echo "IID[${PRIM_RESOURCE_VAL}] COUNT[${COUNT}]" | tee -a ${logFile}
done < $dataFile_HGBN_BMEX
Pause

## preparing HGB_RETN insert data into sql file
cat ${dataFile_HGB_RETN}|while read ACCT_ID SYS_IND CYCLE PRINT_IND
do
echo "INSERT INTO fet_tb_bl_retn_list VALUE
   (SELECT ${ACCT_ID} "ACCT_ID", 50 "CYCLE", '${SYS_IND}' "SYS_IND", '${PRINT_IND}' "PRINT_IND", 
           SYSDATE create_date,
           'UBL' create_user, SYSDATE update_date, 'UBL' update_user
      FROM DUAL);" >> ${home}/data/HGB_BMEX_RETN_$BillDate.sql
done < $dataFile_HGB_RETN
Pause

## preparing HGBN_RETN insert data into sql file
cat ${dataFile_HGBN_RETN}|while read ACCT_ID SYS_IND CYCLE PRINT_IND
do
echo "INSERT INTO fet_tb_bl_retn_list VALUE
   (SELECT ${ACCT_ID} "ACCT_ID", 10 "CYCLE", '${SYS_IND}' "SYS_IND", '${PRINT_IND}' "PRINT_IND", 
           SYSDATE create_date,
           'UBL' create_user, SYSDATE update_date, 'UBL' update_user
      FROM DUAL);" >> ${home}/data/HGB_BMEX_RETN_$BillDate.sql
done < $dataFile_HGBN_RETN
Pause

## insert data to db
echo "Connect to ${DBID}@${DB}" | tee -a ${LogFile}
insertDB
Pause

echo "Move file to bak" | tee -a ${LogFile}
mv ${dataFolder}/*$BillDate* ${dataFolder}/bak
mv ${dataFile_HGB_BMEX} ${dataFolder}/bak/${ftpFILE_HGB_BMEX}_$BillDate
mv ${dataFile_HGBN_BMEX} ${dataFolder}/bak/${ftpFILE_HGBN_BMEX}_$BillDate
mv ${dataFile_HGB_RETN} ${dataFolder}/bak/${ftpFILE_HGB_RETN}_$BillDate
mv ${dataFile_HGBN_RETN} ${dataFolder}/bak/${ftpFILE_HGBN_RETN}_$BillDate

endDate=`date +%Y%m%d_%H%M%S`
echo $endDate | tee -a ${LogFile}

sendMail 1

```

## UBL\BL\Surrounding\BMEX_RETN\truncate_BMEX_RETN.sql
```sql
truncate table FET_TB_BL_BMEX_LIST;
truncate table FET_TB_BL_RETN_LIST;
```

## UBL\BL\Surrounding\Immediately_Charge\bin\HGB_Immediately_Charge.sql
```sql
SET serveroutput ON SIZE 1000000
set verify off
DECLARE
   PI_ACCT_ID           NUMBER       := '&1'; 
   PI_BILL_DATE         VARCHAR(8)   := '&2';  --�p�O�I���(���Ѥ���ANULL=SYSDATE)
   PI_USER              VARCHAR(10)  := 'UBL_TST';
   CH_ERR_CDE           VARCHAR2(4);
   CH_ERR_MSG           VARCHAR2(250);
   NU_BILL_SEQ          NUMBER;
   DT_BILL_FROM_DATE    DATE;
   DT_BILL_END_DATE     DATE;
   DT_BILL_DATE         DATE;
   On_Err               EXCEPTION;
   CURSOR C_CYC IS
      SELECT C.CYCLE,
             C.NAME,
             C.BILLING_DAY,
             C.FROM_DAY,
             C.END_DAY,
             C.DUE_DAY,
             C.LBC_DATE,
             C.CURRECT_PERIOD BILL_PERIOD,
             TO_NUMBER(SUBSTR(C.CURRECT_PERIOD,-2)) CYCLE_MONTH
        FROM FY_TB_BL_ACCOUNT A,
             FY_TB_BL_CYCLE C
       WHERE A.ACCT_ID=PI_ACCT_ID
         AND A.CYCLE=C.CYCLE;
      R_CYC       C_CYC%ROWTYPE;    
   
BEGIN
   ----CHECK CYCLE���T��
   OPEN C_CYC;
   FETCH C_CYC INTO R_CYC;
   IF C_CYC%NOTFOUND THEN
      CH_ERR_CDE := '9999';
      CH_ERR_MSG := 'CHECK CYCLE.ACCT_ID='||TO_CHAR(PI_ACCT_ID)||':NO DATA FOUND';
      RAISE ON_ERR;
   END IF;
   CLOSE C_CYC;
   --DATA �B�z
   CH_ERR_MSG := 'GET BILL_SEQ :';
   SELECT FY_SQ_BL_BILL_CNTRL.NEXTVAL
     INTO NU_BILL_SEQ
     FROM DUAL; 
   IF R_CYC.FROM_DAY=1 THEN
      DT_BILL_FROM_DATE := TO_DATE(R_CYC.BILL_PERIOD||TO_CHAR(R_CYC.FROM_DAY),'YYYYMMDD');
      DT_BILL_END_DATE  := TO_DATE(R_CYC.BILL_PERIOD||TO_CHAR(Last_Day(DT_BILL_FROM_DATE),'DD'),'YYYYMMDD');
   ELSE    
      DT_BILL_END_DATE  := TO_DATE(R_CYC.BILL_PERIOD||TO_CHAR(R_CYC.END_DAY),'YYYYMMDD');
      DT_BILL_FROM_DATE := ADD_MONTHS(DT_BILL_END_DATE,-1)+1;
   END IF;  
   DT_BILL_DATE := DT_BILL_END_DATE+1; 
   
   --GET UC
   CH_ERR_MSG := 'GET UC:';
   INSERT INTO FY_TB_BL_BILL_CI_TEST
                           (CI_SEQ,
                            ACCT_ID,
                            ACCT_KEY,
                            SUBSCR_ID,
                            CUST_ID,
                            OU_ID,
                            CHRG_ID,
                            CHARGE_TYPE,
                            AMOUNT,
                            OFFER_SEQ,
                            OFFER_ID,
                            OFFER_INSTANCE_ID,
                            PKG_ID,
                            CHRG_DATE,
                            CHRG_FROM_DATE,
                            CHRG_END_DATE,
                            CHARGE_CODE,
                            BILL_SEQ,
                            CYCLE,
                            CYCLE_MONTH,
                            TRX_ID,
                            TX_REASON,
                            AMT_DAY,
                            SOURCE,
                            SOURCE_CI_SEQ,
                            SOURCE_OFFER_ID,
                            BI_SEQ,
                            SERVICE_RECEIVER_TYPE,
                            CORRECT_SEQ,
                            CORRECT_CI_SEQ,
                            SERVICE_FILTER,
                            POINT_CLASS,
                            CDR_QTY,
                            CDR_ORG_AMT,
                            CET,
                            OVERWRITE,
                            DYNAMIC_ATTRIBUTE,
                            CREATE_DATE,
                            CREATE_USER,
                            UPDATE_DATE,
                            UPDATE_USER)
                     SELECT FY_SQ_BL_BILL_CI_TEST.NEXTVAL,
                            RT.ACCT_ID,
                            MOD(RT.ACCT_ID,100),
                            RT.SUBSCR_ID,
                            RT.CUST_ID,
                            NULL,   --OU_ID,
                            RT.ITEM_ID, --CHRG_ID,
                            'DBT',  --CHARGE_TYPE, ��DBT�B�tCRD
                            ROUND(RT.CHRG_AMT,2),
                            NULL,   --OFFER_SEQ,
                            RT.OFFER_ID,
                            NULL,   --OFFER_INSTANCE_ID,
                            NULL,   --PKG_ID,
                            RT.CREATE_DATE,   --CHRG_DATE,
                            NULL,   --CHRG_FROM_DATE,
                            NULL,   --CHRG_END_DATE,
                            RT.CHARGE_CODE,
                            NU_BILL_SEQ,
                            RT.CYCLE,
                            RT.CYCLE_MONTH,
                            NULL,   --TRX_ID,
                            NULL,   --TX_REASON,
                            NULL,   --AMT_DAY,
                            'UC',   --SOURCE,
                            NULL,   --SOURCE_CI_SEQ,
                            NULL,   --SOURCE_OFFER_ID,
                            NULL,   --BI_SEQ,
                            'S',    --SERVICE_RECEIVER_TYPE,
                            NULL,   --CORRECT_SEQ,
                            NULL,   --CORRECT_CI_SEQ,
                            RT.SERVICE_FILTER,
                            RT.POINT_CLASS,
                            RT.QTY,
                            round(RT.ORG_AMT,2),
                            RT.CET,
                            NULL,   --OVERWRITE,
                            NULL,   --DYNAMIC_ATTRIBUTE,
                            SYSDATE,
                            PI_USER,
                            SYSDATE,
                            PI_USER
                       FROM FY_TB_RAT_SUMMARY RT
                      WHERE BILL_PERIOD=R_CYC.BILL_PERIOD
                        AND CYCLE      =R_CYC.CYCLE
                        AND CYCLE_MONTH=R_CYC.CYCLE_MONTH
                        AND ACCT_ID    =PI_ACCT_ID
                        AND ACCT_KEY   =MOD(PI_ACCT_ID,100); 
   --OC
   CH_ERR_MSG := 'GET OC:';
   INSERT INTO FY_TB_BL_BILL_CI_TEST
              (CI_SEQ,
               ACCT_ID,
               ACCT_KEY,
               SUBSCR_ID,
               CUST_ID,
               OU_ID,
               CHRG_ID,
               CHARGE_TYPE,
               AMOUNT,
               OFFER_SEQ,
               OFFER_ID,
               OFFER_INSTANCE_ID,
               PKG_ID,
               CHRG_DATE,
               CHRG_FROM_DATE,
               CHRG_END_DATE,
               CHARGE_CODE,
               BILL_SEQ,
               CYCLE,
               CYCLE_MONTH,
               TRX_ID,
               TX_REASON,
               AMT_DAY,
               SOURCE,
               SOURCE_CI_SEQ,
               SOURCE_OFFER_ID,
               BI_SEQ,
               SERVICE_RECEIVER_TYPE,
               CORRECT_SEQ,
               CORRECT_CI_SEQ,
               SERVICE_FILTER,
               POINT_CLASS,
               CDR_QTY,
               CDR_ORG_AMT,
               CET,
               OVERWRITE,
               DYNAMIC_ATTRIBUTE,
               CREATE_DATE,
               CREATE_USER,
               UPDATE_DATE,
               UPDATE_USER)
        SELECT FY_SQ_BL_BILL_CI_TEST.NEXTVAL,
               ACCT_ID,
               MOD(ACCT_ID,100),
               SUBSCR_ID,
               CUST_ID,
               OU_ID,
               CHRG_ID,
               CHARGE_TYPE,
               ROUND(AMOUNT,2),
               OFFER_SEQ,
               OFFER_ID,
               OFFER_INSTANCE_ID,
               PKG_ID,
               CHRG_DATE,
               CHRG_FROM_DATE,
               CHRG_END_DATE,
               CHARGE_CODE,
               NU_BILL_SEQ,
               CYCLE,
               CYCLE_MONTH,
               TRX_ID,
               TX_REASON,
               AMT_DAY,
               SOURCE,
               SOURCE_CI_SEQ,
               SOURCE_OFFER_ID,
               BI_SEQ,
               SERVICE_RECEIVER_TYPE,
               CORRECT_SEQ,
               CORRECT_CI_SEQ,
               SERVICE_FILTER,
               POINT_CLASS,
               CDR_QTY,
               ROUND(CDR_ORG_AMT,2),
               CET,
               OVERWRITE,
               DYNAMIC_ATTRIBUTE,
               CREATE_DATE,
               CREATE_USER,
               UPDATE_DATE,
               UPDATE_USER
           FROM FY_TB_BL_BILL_CI CI
          WHERE CYCLE      =R_CYC.CYCLE
            AND CYCLE_MONTH=R_CYC.CYCLE_MONTH  
            AND ACCT_ID    =PI_ACCT_ID 
            AND ACCT_KEY   =MOD(PI_ACCT_ID,100)
            AND SOURCE     ='OC'
            AND BILL_SEQ IS NULL;  
   --RC
   CH_ERR_MSG := 'DO_RECUR:';
   FY_PG_BL_BILL_UTIL.DO_RECUR(PI_ACCT_ID  ,
                               NU_BILL_SEQ ,
                               R_CYC.CYCLE ,
                               R_CYC.CYCLE_MONTH,
                               DT_BILL_FROM_DATE,
                               DT_BILL_END_DATE ,
                               DT_BILL_DATE     ,
                               R_CYC.FROM_DAY   ,
                               TO_DATE(NVL(PI_BILL_DATE,TO_CHAR(SYSDATE,'YYYYMMDD')),'YYYYMMDD')-1,
                               CH_ERR_CDE       ,
                               CH_ERR_MSG       ); 
   IF CH_ERR_CDE<>'0000' THEN
      CH_ERR_MSG := 'DO_RECUR:'||CH_ERR_MSG;
      RAISE ON_ERR; 
   END IF;
   CH_ERR_MSG := 'LIST_DTL:';
   INSERT INTO FY_TB_BL_ACCT_LIST_DTL
                          (BILL_SEQ ,
                           ACCT_ID,
                           TYPE,
                           CI_ID,
                           OFFER_SEQ,
                           Create_Date,
                           Create_User,
                           Update_Date,
                           Update_User)
                    SELECT BILL_SEQ,
                           ACCT_ID,
                           SOURCE,
                           ROUND(SUM(AMOUNT)),
                           NULL,
                           SYSDATE,
                           'UBL',
                           SYSDATE,
                           'UBL'
                      FROM FY_TB_BL_BILL_CI_TEST A
                     WHERE A.CYCLE      =R_CYC.CYCLE
                       AND A.CYCLE_MONTH=R_CYC.CYCLE_MONTH
                       AND A.ACCT_KEY   =MOD(PI_ACCT_ID,100)
                       AND A.BILL_SEQ   =NU_BILL_SEQ
                       AND A.ACCT_ID    =PI_ACCT_ID
                    GROUP BY A.BILL_SEQ, A.ACCT_ID, A.SOURCE ;
                    
   CH_ERR_MSG := 'LIST:';
   INSERT INTO FY_TB_BL_ACCT_LIST
                          (BILL_SEQ ,
                           CYCLE,
                           CYCLE_MONTH,
                           ACCT_ID,
                           BILL_START_PERIOD,
                           BILL_END_PERIOD,
                           BILL_END_DATE,
                           TYPE,
                           HOLD_DESC,
                           UC_FLAG,
                         --  ERR_MSG,
                           Create_Date,
                           Create_User,
                           Update_Date,
                           Update_User)
                     VALUES
                          (NU_BILL_SEQ,
                           R_CYC.CYCLE,
                           R_CYC.CYCLE_MONTH,
                           PI_ACCT_ID,
                           R_CYC.BILL_PERIOD,
                           R_CYC.BILL_PERIOD,
                           DT_BILL_END_DATE,
                           'BILL',
                           NULL,
                           'Y',
                        --   'Immediately Bill',
                           SYSDATE,
                           'UBL',
                           SYSDATE,
                           'UBL'); 
   COMMIT;
   DBMS_OUTPUT.Put_Line('BILL_SEQ='||TO_CHAR(NU_BILL_SEQ));                        
EXCEPTION
    WHEN On_Err THEN
        ROLLBACK;
        DBMS_OUTPUT.Put_Line(CH_ERR_CDE||CH_ERR_MSG);
    WHEN OTHERS THEN
        ROLLBACK;
        DBMS_OUTPUT.Put_Line(SUBSTR(CH_ERR_MSG||SQLERRM,1,250));    
END ;    
      
                                                 
             
```

## UBL\BL\Surrounding\Insert_Multiple_Account\bin\HGB_Insert_Multiple_Account.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_Insert_Multiple_Account.sh
# Path : /extsoft/UBL/BL/Surrounding/Insert_Multiple_Account/bin
#
# Date : 2018/09/28 Created by Mike Kuan
# Description : HGB Insert Multiple Account
########################################################################################
# Date : 
# Description : 
########################################################################################
# Date : 2018/11/26 Modify by Mike Kuan
# Description : add MPC
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_Insert_Multiple_Account"
sysdt=`date +%Y%m%d%H%M%S`
BillDate=$1
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/Insert_Multiple_Account/bin
LogDir=$HomeDir/Surrounding/Insert_Multiple_Account/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_HGB_Insert_Multiple_Account.log
MailList=$HomeDir/MailList.txt
#DB info (TEST06) (PT)
#--DB="HGBBLDEV"
#DB info (TEST15) (SIT)
#--DB="HGBBLSIT"
#DB info (TEST02) (UAT)
#--DB="HGBBLUAT"
#DB info (PROD)
DB="HGBBL"

DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 3`;
do
echo "$i" | tee -a $LogFile
sleep 1
done
}

function HGB_Insert_Multiple_Account
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_Insert_Multiple_Account.sql $1
exit
EOF`
Pause
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   echo "Send Mail (Failed)" | tee -a $LogFile
   sendMail 0
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Successed)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   echo "Send Mail (Successed)" | tee -a $LogFile
   sendMail 1
fi

exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

echo '' | tee -a $LogFile
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
mailx -r "HGB" -s "HGB_Insert_Multiple_Account $BillDate Normal" -a ${LogFile} ${maillist} << EOF
Dears,
   HGB_Insert_Multiple_Account $BillDate Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB" -s "HGB_Insert_Multiple_Account $BillDate Abnormal" -a ${LogFile} ${maillist}  << EOF
Dears,
   HGB_Insert_Multiple_Account $BillDate Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
fi
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BillDate>"
	echo ""
    echo "For example: $0 20181201"
	echo ""
}

if [[ $# -lt 1 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "ENV : ${DB}" | tee -a $LogFile
echo '' | tee -a $LogFile
cd ${WorkDir}

#----------------------------------------------------------------------------------------------------
#------------執行Insert_Multiple_Account
	echo "----------Step 1. Run Insert_Multiple_Account Process (Start...)" | tee -a $LogFile
	HGB_Insert_Multiple_Account $1
	checkcode=`cat ${LogFile}|grep 'Insert_Multiple_Account Process RETURN_CODE = 9999'|wc -l`
		if [[ $checkcode -eq 1 ]]; then
			echo "----------Step 1. Run Insert_Multiple_Account Process (End...Failed)" | tee -a $LogFile
			AutoWatch 1
		else
			echo "----------Step 1. Run Insert_Multiple_Account Process (End... Successed)" | tee -a $LogFile
		fi	
echo '' | tee -a $LogFile

AutoWatch 0

```

## UBL\BL\Surrounding\Insert_Multiple_Account\bin\HGB_Insert_Multiple_Account.sql
```sql
SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE       VARCHAR2(8)      := '&1'; 
NU_CYCLE          NUMBER(2);
CH_BILL_PERIOD    VARCHAR2(6);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
NU_CNT            NUMBER;
CH_USER           VARCHAR2(8)  :='UBL';
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);

  CURSOR C_CT(iBILL_SEQ NUMBER) IS
     SELECT DISTINCT TYPE
       FROM FY_TB_BL_ACCT_LIST
      WHERE BILL_SEQ=iBILL_SEQ;
       
  CURSOR C1(iBILL_SEQ NUMBER, iTYPE VARCHAR2) IS
     SELECT A.ACCT_ID, A.BILL_START_PERIOD, A.BILL_END_PERIOD, A.BILL_END_DATE, A.TYPE, A.UC_FLAG,
            B.CUST_ID, B.ACCT_GROUP
       FROM FY_TB_BL_ACCT_LIST A,
            FY_TB_BL_BILL_ACCT B
      WHERE A.BILL_SEQ=iBILL_SEQ
        AND A.TYPE    =iTYPE
        AND B.BILL_SEQ=A.BILL_SEQ
        AND B.ACCT_ID =A.ACCT_ID
        AND ((B.ACCT_GROUP='MV') OR 
             (EXISTS (SELECT 1 FROM FY_TB_BL_BILL_ACCT BA
                              WHERE BILL_SEQ=B.BILL_SEQ
                                AND CUST_ID =B.CUST_ID
                                AND NOT EXISTS (SELECT 1 FROM FY_TB_BL_ACCT_LIST
                                                        WHERE BILL_SEQ=BA.BILL_SEQ
                                                          AND ACCT_ID =BA.ACCT_ID
                                                          AND TYPE    =iTYPE))
              ));
begin
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':Insert Multiple Account BEGIN'); 
   SELECT CYCLE, BILL_PERIOD, BILL_SEQ, CYCLE_MONTH
     INTO NU_CYCLE, CH_BILL_PERIOD, NU_BILL_SEQ, NU_CYCLE_MONTH
     FROM FY_TB_BL_BILL_CNTRL
    WHERE TO_CHAR(BILL_DATE,'YYYYMMDD')=v_BILL_DATE; 
   --LOOP
   FOR R_CT IN C_CT(NU_BILL_SEQ) LOOP        
      FOR R1 IN C1(NU_BILL_SEQ, R_CT.TYPE) LOOP
         IF R1.ACCT_GROUP='MV' THEN
            --INSERT 
            INSERT INTO FY_TB_BL_ACCT_LIST
                          (BILL_SEQ,
                           CYCLE,
                           CYCLE_MONTH,
                           ACCT_ID,
                           BILL_START_PERIOD,
                           BILL_END_PERIOD,
                           BILL_END_DATE,
                           TYPE,
                           HOLD_DESC,
                           UC_FLAG,
                           cust_id,
                           CREATE_DATE,
                           CREATE_USER,
                           UPDATE_DATE,
                           UPDATE_USER)        
                    SELECT NU_BILL_SEQ,
                           NU_CYCLE,
                           NU_CYCLE_MONTH,
                           ACCT_ID,
                           R1.BILL_START_PERIOD,
                           R1.BILL_END_PERIOD,
                           R1.BILL_END_DATE,
                           R1.TYPE,
                           'MUTIL_ACCT', --HOLD_DESC,
                           R1.UC_FLAG,
                           r1.cust_id,
                           SYSDATE,
                           CH_USER,
                           SYSDATE,
                           CH_USER
                      FROM (select BILL_SEQ,ACCT_ID from (select BILL_SEQ, ACCT_ID,PRE_ACCT_ID 
                                                            from FY_TB_BL_BILL_MV_SUB 
                                                           where bill_seq   =NU_BILL_SEQ
                                                             AND CYCLE      =NU_CYCLE
                                                             AND CYCLE_MONTH=NU_CYCLE_MONTH) 
                                 start WITH acct_id=R1.ACCT_ID
                               CONNECT BY PRIOR acct_ID=pre_acct_id
                            UNION
                            select BILL_SEQ,acct_id from (select BILL_SEQ, ACCT_ID,PRE_ACCT_ID 
                                                            from FY_TB_BL_BILL_MV_SUB 
                                                           where bill_seq   =NU_BILL_SEQ
                                                             AND CYCLE      =NU_CYCLE
                                                             AND CYCLE_MONTH=NU_CYCLE_MONTH) 
                                 start WITH acct_id=R1.ACCT_ID
                               CONNECT BY PRIOR PRE_acct_ID=acct_id) MV
                     WHERE NOT EXISTS (SELECT 1 FROM FY_TB_BL_ACCT_LIST
                                               WHERE BILL_SEQ=MV.BILL_SEQ
                                                 AND ACCT_ID =MV.ACCT_ID
                                                 AND TYPE    =R_CT.TYPE);  
            NU_CNT := NVL(NU_CNT,0)+SQL%ROWCOUNT;                                     
         END IF; ---MV
         INSERT INTO FY_TB_BL_ACCT_LIST
                          (BILL_SEQ,
                           CYCLE,
                           CYCLE_MONTH,
                           ACCT_ID,
                           BILL_START_PERIOD,
                           BILL_END_PERIOD,
                           BILL_END_DATE,
                           TYPE,
                           HOLD_DESC,
                           UC_FLAG,
                           cust_id,
                           CREATE_DATE,
                           CREATE_USER,
                           UPDATE_DATE,
                           UPDATE_USER)        
                    SELECT NU_BILL_SEQ,
                           NU_CYCLE,
                           NU_CYCLE_MONTH,
                           ACCT_ID,
                           R1.BILL_START_PERIOD,
                           R1.BILL_END_PERIOD,
                           R1.BILL_END_DATE,
                           R1.TYPE,
                           'MUTIL_ACCT', --HOLD_DESC,
                           R1.UC_FLAG,
                           r1.cust_id,
                           SYSDATE,
                           CH_USER,
                           SYSDATE,
                           CH_USER
                      FROM FY_TB_BL_BILL_ACCT BA
                     WHERE BILL_SEQ    =NU_BILL_SEQ
                       AND CYCLE       =NU_CYCLE
                       AND CYCLE_MONTH =NU_CYCLE_MONTH
                       AND CUST_ID     =R1.CUST_ID
                       AND BILL_STATUS<>'CN'
                       AND NOT EXISTS (SELECT 1 FROM FY_TB_BL_ACCT_LIST
                                               WHERE BILL_SEQ=BA.BILL_SEQ
                                                 AND ACCT_ID =BA.ACCT_ID
                                                 AND TYPE    =R_CT.TYPE);  
         NU_CNT := NVL(NU_CNT,0)+SQL%ROWCOUNT;                                                                                              
      END LOOP;
   END LOOP;   
   commit;
   DBMS_OUTPUT.Put_Line('CNT='||TO_CHAR(NU_CNT));
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':Insert Multiple Account END');
EXCEPTION 
   WHEN OTHERS THEN
   DBMS_OUTPUT.Put_Line('Insert Multiple Account RETURN_CODE = 9999');    
end;
/  

```

## UBL\BL\Surrounding\RPT\SR213344_NPEP_Settlement_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR213344_NPEP_Settlement_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2019/05/23 Modify by Mike Kuan
# Description : new
########################################################################################
# Date : 2019/06/24 Modify by Mike Kuan
# Description : add ftp information
########################################################################################
# Date : 2019/08/07 Modify by Mike Kuan
# Description : modify processCycle for cronjob
########################################################################################
# Date : 2019/08/27 Modify by Mike Kuan
# Description : modify date format
########################################################################################
# Date : 2019/09/17 Modify by Mike Kuan
# Description : modify CI condition
########################################################################################
# Date : 2019/10/17 Modify by Mike Kuan
# Description : add GCPID & GCPname
########################################################################################
# Date : 2023/09/15 Modify by Mike Kuan
# Description : add Azure, change FTP IP address
########################################################################################
# Date : 2023/12/22 Modify by Mike Kuan
# Description : adj report format
########################################################################################
export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
WorkDir="/extsoft/UBL/BL/Surrounding/RPT"
logDir=${WorkDir}/log
ReportDir=${WorkDir}/report
ReportDirBak=${ReportDir}/bak
cycleInfoDir=${WorkDir}/cycleInfos
progName=$(basename $0 .sh)
echo "Program Name is:${progName}"
sysd=`date "+%Y%m%d"`
logFile=${logDir}/"${progName}_${sysd}.log"
processCycle=`date +%Y%m01`
#processCycle=$1
utilDir="/cb/BCM/util"
ftpProg="${utilDir}/Ftp2Remote.sh"
tempFile1=${logDir}/"${progName}_tmp_${sysd}.log"
reportFileName1="NPEP_Settlement_Report"
sysdate=$(date +"%Y%m%d%H%M%S")
#DB info (TEST06) (PT)
#--DB="HGBBLDEV"
#--DB="HGBDEV2"
#DB info (TEST15) (SIT)
#--DB="HGBBLSIT"
#--RPTDB_SID="HGBBLSIT"
#DB info (TEST02) (UAT)
#--DB="HGBBLUAT"
#--RPTDB_SID="HGBBLUAT"
#DB info (PROD)
DB="HGBBL"
RPTDB_SID="HGBBLRPT"
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
#Ftp 
#putip1='10.68.57.184'
putip1='10.68.158.197'
putuser1=hgftp
putpass1=hgftp123
putpath1=/HomeGrown
#MAIL
mailList="mikekuan@fareastone.com.tw PeterChen1@fareastone.com.tw"

function genSettlementReport
{
`sqlplus -s ${DBID}/${DBPWD}@${RPTDB_SID} > ${tempFile1} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool output.dat

select 'CI_SEQ','RESOURCE_VALUE','ACCOUNT_NAME','OFFER_ID','MSISDN','AGREEMENT_NO','ACCOUNT_ID','INVOICE_ID','BILLING_INVOICE_NUMBER','INVOICE_CREATION_DATE','CHARGE_CODE','CHARGE_TYPE','AMOUNT','COVERAGE_PERIOD_START_DATE','COVERAGE_PERIOD_END_DATE','CYCLE_SEQ_NO','CYCLE_START_DATE','CYCLE_END_DATE','CYCLE_YEAR','CYCLE_MONTH','CYCLE_CODE' from dual;

SELECT DISTINCT to_char(f.ci_seq)||','|| d.resource_value||','''||to_char(d1.param_value)||''','||f.offer_id||','||
                d.resource_value||','||f.subscr_id||','||
                b.acct_id||','||b.mast_seq||','||
                to_char(b.bill_nbr)||','||
                TO_CHAR (b.create_date, 'yyyymmdd')||','||
                f.charge_code||','||f.charge_type||','||f.amount||','||
                CASE
                   WHEN f.SOURCE = 'RC'
                      THEN TO_CHAR (f.chrg_from_date, 'yyyymmdd')
                   WHEN f.SOURCE = 'OC'
                      THEN TO_CHAR (f.create_date, 'yyyymmdd')
                   WHEN f.SOURCE = 'UC'
                      THEN REGEXP_SUBSTR (f.dynamic_attribute,
                                             '.*First_Event_Date=([^#]*).*',
                                             1,
                                             1,
                                             NULL,
                                             1
                                            )
                END||','||
                CASE
                   WHEN f.SOURCE = 'RC'
                      THEN TO_CHAR (f.chrg_end_date, 'yyyymmdd')
                   WHEN f.SOURCE = 'OC'
                      THEN TO_CHAR (f.create_date, 'yyyymmdd')
                   WHEN f.SOURCE = 'UC'
                      THEN REGEXP_SUBSTR (f.dynamic_attribute,
                                             '.*Last_Event_Date=([^#]*).*',
                                             1,
                                             1,
                                             NULL,
                                             1)
                END||','||
                a.bill_seq||','||
                TO_CHAR (a.bill_from_date, 'yyyymmdd')||','||
                TO_CHAR (a.bill_end_date, 'yyyymmdd')||','||
                SUBSTR (a.bill_period, 1, 4)||','||
                SUBSTR (a.bill_period, 5, 3)||','||a.CYCLE
           FROM fy_tb_bl_bill_cntrl a,
                fy_tb_bl_bill_mast b,
                fy_tb_cm_subscr c,
                fy_tb_cm_resource d,
                (SELECT DISTINCT subscr_id, offer_seq, acct_id,
                FIRST_VALUE (param_value) OVER (PARTITION BY subscr_id ORDER BY seq_no DESC)
                                                                       AS param_value
           FROM fy_tb_cm_offer_param
          WHERE param_name in ('AWSname','NAME')) d1,
                fy_tb_bl_bill_ci f
          WHERE a.CYCLE = b.CYCLE
            AND a.bill_period = b.bill_period
            AND a.bill_seq = b.bill_seq
            and a.bill_seq = f.bill_seq
            AND b.acct_id = c.acct_id
            AND c.subscr_id = d.subscr_id
            and c.subscr_id = d1.subscr_id(+)
            AND c.subscr_id(+) = f.subscr_id
            and b.acct_id = f.acct_id
            AND d.resource_prm_cd in ('AWSID','GCPID')
            AND a.CYCLE = 10
            AND a.bill_date = TO_DATE ($1, 'yyyymmdd')
union all
SELECT DISTINCT to_char(f.ci_seq)||','|| d.resource_value||','||to_char(d.resource_value)||','||f.offer_id||','||
                d.resource_value||','||f.subscr_id||','||
                b.acct_id||','||b.mast_seq||','||
                to_char(b.bill_nbr)||','||
                TO_CHAR (b.create_date, 'yyyymmdd')||','||
                f.charge_code||','||f.charge_type||','||f.amount||','||
                CASE
                   WHEN f.SOURCE = 'RC'
                      THEN TO_CHAR (f.chrg_from_date, 'yyyymmdd')
                   WHEN f.SOURCE = 'OC'
                      THEN TO_CHAR (f.create_date, 'yyyymmdd')
                   WHEN f.SOURCE = 'UC'
                      THEN REGEXP_SUBSTR (f.dynamic_attribute,
                                             '.*First_Event_Date=([^#]*).*',
                                             1,
                                             1,
                                             NULL,
                                             1
                                            )
                END||','||
                CASE
                   WHEN f.SOURCE = 'RC'
                      THEN TO_CHAR (f.chrg_end_date, 'yyyymmdd')
                   WHEN f.SOURCE = 'OC'
                      THEN TO_CHAR (f.create_date, 'yyyymmdd')
                   WHEN f.SOURCE = 'UC'
                      THEN REGEXP_SUBSTR (f.dynamic_attribute,
                                             '.*Last_Event_Date=([^#]*).*',
                                             1,
                                             1,
                                             NULL,
                                             1)
                END||','||
                a.bill_seq||','||
                TO_CHAR (a.bill_from_date, 'yyyymmdd')||','||
                TO_CHAR (a.bill_end_date, 'yyyymmdd')||','||
                SUBSTR (a.bill_period, 1, 4)||','||
                SUBSTR (a.bill_period, 5, 3)||','||a.CYCLE
           FROM fy_tb_bl_bill_cntrl a,
                fy_tb_bl_bill_mast b,
                fy_tb_cm_subscr c,
                                fy_tb_cm_subscr_offer c2,
                fy_tb_cm_resource d,
                fy_tb_bl_bill_ci f
          WHERE a.CYCLE = b.CYCLE
            AND a.bill_period = b.bill_period
            AND a.bill_seq = b.bill_seq
            and a.bill_seq = f.bill_seq
            AND b.acct_id = c.acct_id
            AND c.subscr_id = d.subscr_id
            and c.subscr_id = c2.subscr_id
            AND c.subscr_id(+) = f.subscr_id
            and b.acct_id = f.acct_id
            AND d.resource_prm_cd in ('HAID')
            and c2.OFFER_ID = 203763
            AND a.CYCLE = 15
            AND a.bill_date = TO_DATE ($1, 'yyyymmdd')
;

spool off

exit;

EOF`

echo "Gen Settlement Report End"|tee -a ${logFile}
}

function formatterSettlementReport
{
grep -v '^$' output.dat > ${ReportDir}/${reportFileName1}_${processCycle}.csv
}

function sendFinalMail
{
mailx -s "[${processCycle}]${progName} Finished " ${mailList} <<EOF
Dear All,
  
  Please check SR213344_NPEP_Settlement_Report at ${WorkDir}/report/bak !!!
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

function sendGenTempErrorMail
{
mailx -s "[${processCycle}]${progName} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  Please check ${progName} Flow !!!
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

###########################################################
#      main
###########################################################
echo "Gen SR213344_NPEP_Settlement_Report Start" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

#Step1. split param
cycleYear=$(echo $processCycle | cut -c1-4)
cycleMonth=$(echo $processCycle | cut -c5-6)
cycleDate=$(echo $processCycle | cut -c7-8)
echo "CycleYear:"${cycleYear} "CycleMonth:"${cycleMonth} | tee -a ${logFile}

#Step 5.chek genTempData if have Error
grep -E 'ERROR|error|ORA|ora' ${logFile} | wc -l | read ora_err_cnt
if [[ ${ora_err_cnt} -eq 0 ]] ; then
	echo "database check success" | tee -a ${logFile}
	#Step 5.1 gen Report 1&2&3
	echo "Generate Real Settlement Report" | tee -a ${logFile} 
	cd $ReportDir
	 genSettlementReport $processCycle
else 
	#Step 5.2 send genTmep error message
	echo "Send GenTempDate Abnormal message"| tee -a ${logFile} 
	sendGenTempErrorMail
	exit 0
fi

#Step 6.formatter Report 
echo "Formatter formatterSettlementReport"|tee -a ${logFile}
formatterSettlementReport

echo "Check Generate Report"|tee -a ${logFile}

#Step 7.check gen report
filecnt1=`ls ${ReportDir}/${reportFileName1}_${processCycle}.csv|wc -l`
file1=${ReportDir}/${reportFileName1}_${processCycle}.csv

if [[ (${filecnt1} = 0 ) ]] ; then
	echo "${progName} Generated Report Have Abnormal"|tee -a ${logFile}
	sendGenTempErrorMail
	exit 0
else
	echo "FTP Report"|tee -a ${logFile}
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName1}_${processCycle}.csv 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName1}_${processCycle}.csv 0
	echo "send SR213344_NPEP_Settlement_Report"|tee -a ${logFile}

	echo "Move Report TO Bak"|tee -a ${logFile}
	mv ${ReportDir}/"${reportFileName1}_${processCycle}.csv" ${ReportDirBak}
fi

#Step 8. send final mail
sendFinalMail
echo "Gen SR213344_NPEP_Settlement_Report End"|tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR223576_Cloud_Service_Report.sh
```bash
#!/usr/bin/env bash
####################################################
# Generate SR223576_Cloud_Service_Report
#
# Created by Sharon Lin
# Date by 2020-03-24
####################################################
home="/extsoft/UBL/BL/Surrounding/RPT"
logfolder="${home}/log"
progName=$(basename $0 .sh)
pid=$$
echo "Program Name is:${progName}"
sendmail="/usr/sbin/sendmail"
#DB info (TEST06) (PT)
#--DB_SID="HGBBLDEV"
#DB info (TEST15) (SIT)
DB_SID="HGBBLSIT"
#DB info (TEST02) (UAT)
#--DB_SID="HGBBLUAT"
#DB info (PROD)
#DB_SID="HGBBL"
DB_USER=$(/cb/CRYPT/GetId.sh ${DB_SID})
DB_PASSWD=$(/cb/CRYPT/GetPw.sh ${DB_SID})
sysdt=`date "+%Y-%m-%d %H:%M:%S"`
echo "sysdt:${sysdt}"
sysd=`date "+%Y%m%d"`
sysdtV=`date "+%Y%m%d%H%M%S"`
tmpl="${home}/template/template_SR223576_Cloud_Service_Report.html"
tmplTmp="${home}/log/SR223576_Cloud_Service_Report_template_tmp_${sysd}_${pid}.html"
sqlLogFile="${home}/log/SR223576_Cloud_Service_Report_SqlLog_${sysd}_${pid}.log"
htmlFile="${home}/log/SR223576_Cloud_Service_Report_html_${sysd}_${pid}.html"
logFile="${home}/log/${progName}_${sysd}_${pid}.log"
sqlDataFile="${home}/log/SR223576_Cloud_Service_Report_Count__${sysd}_${pid}.dat"

function executeSqlCnt
{
g1sqlsyntax=$1
echo "g1sqlsyntax:${g1sqlsyntax}"
`sqlplus -s ${DB_USER}/${DB_PASSWD}@${DB_SID} > ${sqlDataFile} <<EOF
set heading off;
set pagesize 0;
set feedback off;
set serveroutput on;

${g1sqlsyntax};
exit;
EOF`

#cat ${sqlDataFile}
read count < ${sqlDataFile}														
}

function generateReport
{
echo "Call generateReport"
g2tablename=$1
g2sqlsyntax=$2
echo "g2sqlsyntax:${g2sqlsyntax}"

#echo "<h4>${g2tablename}</h4>" >> ${sqlLogFile}
#echo "<p>語法：</p>" >> ${sqlLogFile}
#echo "<blockquote>${g2sqlsyntax}</blockquote>" >> ${sqlLogFile}
#echo "<p>&nbsp;</p>" >> ${sqlLogFile}

NLS_LANG="TRADITIONAL CHINESE_TAIWAN.AL32UTF8"

export NLS_LANG
`sqlplus -s ${DB_USER}/${DB_PASSWD}@${DB_SID} >> ${sqlLogFile} <<EOF
set tab off
SET ECHO OFF
set termout off
SET PAGESIZE 32766
SET LINESIZE 32766
SET FEEDBACK OFF
-- set NULL 'NO ROWS SELECTED'
set linesize 1024
SET TRIMSPOOL ON

spool ${htmlFile}

-- TTITLE LEFT '<h4>${g2tablename}</h4>'
set markup html on spool on TABLE "class=tb-wd-1" entmap off
column type format a10 heading 'TYPE'
${g2sqlsyntax}
/

SET MARKUP HTML OFF
spool off
exit;
EOF`
echo "<p>&nbsp;</p>" >> ${sqlLogFile}
}

function sendMail
{
echo "sender:${sender}"
echo "recipient:${recipientHJ}"

cp -p ${tmpl} ${tmplTmp}

sed -i 's|%sender%|'"${sender}"'|g' ${tmplTmp}
sed -i 's|%recipient%|'"${recipientHJ}"'|g' ${tmplTmp}
subsidiary="${subsidiaryHJ// /}"
if [ ${#subsidiary} -gt 0 ]; then
	echo "Add subsidiary"
	sed -i 's|%subsidiary%|'"Cc: ${subsidiaryHJ}"'|g' ${tmplTmp}
else
	echo "Remove subsidiary"
	sed -i '/%subsidiary%/d' ${tmplTmp}
fi
sed -i 's|%sysdt%|'"${sysdt}"'|g' ${tmplTmp}
sed -i 's|%reportTime%|'"${sysdt}"'|g' ${tmplTmp}
#sed -i 's|%BillDate%|'"${BillDate}"'|g' ${tmplTmp}
sed -i 's|%reportStartTime%|'"${reportStartTime}"'|g' ${tmplTmp}
sed -i 's|%reportEndTime%|'"${reportEndTime}"'|g' ${tmplTmp}
sed -i 's|%reportDiffTime%|'"${reportDiffTime}"'|g' ${tmplTmp}
sed -i 's|%hostname%|'"${hostname}"'|g' ${tmplTmp}
echo "sed -i '/%tablecontent%/r ${sqlLogFile}' ${tmplTmp}"
sed -i '/%tablecontent%/r '"${sqlLogFile}"'' ${tmplTmp}
sed -i '/%tablecontent%/d' ${tmplTmp}
sed -i '/%tablecontentRt%/r '"${sqlLogFileRt}"'' ${tmplTmp}
sed -i '/%tablecontentRt%/d' ${tmplTmp}
sed -i ':a;N;$!ba;s/<table class=tb-wd-1>\n<\/table>//g' ${tmplTmp}
sed -i ':a;N;$!ba;s/<table class=tb-wd-2>\n<\/table>//g' ${tmplTmp}
sed -i ':a;N;$!ba;s/<table class=tb-wd-3>\n<\/table>//g' ${tmplTmp}
sed -i ':a;N;$!ba;s/<table class=tb-wd-4>\n<\/table>//g' ${tmplTmp}
sed -i 's/width="90%"/width="90%" border="0" style="border-width:0px;"/g' ${tmplTmp}

file ${tmplTmp}

cat ${tmplTmp} | ${sendmail} -t
}

####################################################
# Main
####################################################

cd ${home}
## Initial variables
hostname="HGBBL"

echo "Connect to ${DB_USER}@${DB_SID}"

## Initial variables
startDate="`date -d "1 hour ago" +"%Y-%m-%d %H:"`00:00"
echo "Start Date is ${startDate}"
#BillDate=$1
#BillDate='20190501'
reportStartTime=${startDate}
reportEndTime=`date +"%Y-%m-%d %H:%M:%S"`
D1=$(date -d "${reportStartTime}" '+%s')
D2=$(date -d "${reportEndTime}" '+%s')
reportDiffTime=$(((D2-D1)/86400))日$(date -u -d@$((D2-D1)) +%H時%M分%S秒)
echo "reportDiffTime:${reportDiffTime}"
#exit
## Load source files
source "${home}/conf/SR223576_Cloud_Service_Report_SQL.conf"
source "${home}/conf/SR223576_Cloud_Service_Report_mail.conf"

#----------------------------------------------------------------------------------------------
isGenRpt="N"
echo "startDate:${startDate}"
IFS=',' read -ra monitorArr <<< "${monitorlist}"
for i in "${monitorArr[@]}"; do
    echo "${i}"
	var1="sqlsyntaxCnt${i}"
	sqlsyntaxCnt="${!var1}"
	var2="sqlsyntax${i}"
	sqlsyntax="${!var2}"
	var3="sqlsyntaxTb${i}"
	sqlsyntaxTb="${!var3}"
	#echo "sqlsyntaxCnt:${sqlsyntaxCnt}"
	#echo "sqlsyntax:${sqlsyntax}"
	#echo "sqlsyntaxTb:${sqlsyntaxTb}"
	unset count
	executeSqlCnt "${sqlsyntaxCnt}"
	echo "count:${count}"
	if [[ "${count}" -ne "0" ]]; then
		isGenRpt="Y"
		generateReport "${sqlsyntaxTb}" "${sqlsyntax}"
	else 
		generateReportEmpty "${sqlsyntaxTb}" "${sqlsyntaxCnt}"
	fi
done

isMail="Y"
if [[ "${isMail:=Y}" == "Y" && "${isGenRpt}" == "Y" ]]; then
	echo "Send Mail..."
	sendMail
	echo "Send Mail completed at $(date +"%Y-%m-%d %H:%M:%S")." | tee -a ${logFile}
else 
	echo "Do not need to send mail at $(date +"%Y-%m-%d %H:%M:%S")" | tee -a ${logFile}
fi

```

## UBL\BL\Surrounding\RPT\SR225879_HGB_MPBL_Unbill_OC_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR225879_HGB_MPBL_Unbill_OC_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2021/01/29 Create by Mike Kuan
# Description : SR225879_因應MPBS Migrate To HGB Project之財務報表需求
########################################################################################
# Date : 2021/02/24 Modify by Mike Kuan
# Description : add prod ftp
########################################################################################
# Date : 2023/07/12 Modify by Mike Kuan
# Description : 因CUSDATE後無法抓取未出帳OC，故修改AND (bbc.bill_seq IS NULL or bbc.bi_seq is null)，同時濾除HGBN
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
ReportDirBak=$ReportDir/bak
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="HGB_Unbill_OC_`date +%Y%m%d`_`date +%Y%m%d%H%M%S`"
utilDir=/cb/BCM/util
ftpProg=${utilDir}/Ftp2Remote.sh
#mailList="keroh@fareastone.com.tw mikekuan@fareastone.com.tw"
mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
putip1=10.64.16.58
putpass1=unix11
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
putip1=10.64.18.122
putpass1=unix11
;;
"pet-hgbap01p"|"pet-hgbap02p") #(PET)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.64.18.123
putpass1=unix11
;;
"idc-hgbap01p"|"idc-hgbap02p") #(PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.68.59.130
putpass1=`/cb/CRYPT/GetPw.sh UBL_UAR_FTP`
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
#FTP
putuser1=ublftp
putpath1=/AR/payment/ARBATCH90/HGB_UnbillOC/work

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool ${reportFileName}.dat

select 'Cycle_Code'||';'||'Charge_Code'||';'||'Charge_Type'||';'||'Charge_Amount'||';'||'Tax_Amount'||';'||'Tax_Rate'||';'||'Subscriber_Id'||';'||'Subscriber_Type'||';'||'Account_Id'||';'||'Account_Category'||';'||'Customer_Type'||';'||'Customer_Sub_Type' from dual;

--SELECT bbc.CYCLE "Cycle_Code", bbc.charge_code "Charge_Code",
--       bbc.charge_type "Charge_Type", to_char(amount-ROUND(bbc.amount/1.05*slc.num1,2)) "Charge_Amount",
--       ROUND (bbc.amount / 1.05 * slc.num1, 2) "Tax_Amount",
--       slc.num1 "Tax_Rate", bbc.subscr_id "Subscriber_Id",
--       cs.subscr_type "Subscriber_Type", bbc.acct_id "Account_Id",
--       ca.acct_category "Account_Category", cc.cust_type "Customer_Type", cc.cust_sub_type "Customer_Sub_Type"
--  FROM fy_tb_bl_bill_ci bbc,
--       fy_tb_pbk_charge_code pcc,
--       fy_tb_sys_lookup_code slc,
--       fy_tb_cm_subscr cs,
--       fy_tb_cm_account ca,
--       fy_tb_cm_customer cc
-- WHERE bbc.SOURCE = 'OC'
--   AND slc.lookup_type = 'TAX_TYPE'
--   AND bbc.bill_seq IS NULL
--   AND bbc.charge_code = pcc.charge_code
--   AND pcc.tax_rate = slc.lookup_code
--   AND bbc.subscr_id = cs.subscr_id
--   AND bbc.acct_id = ca.acct_id
--   AND bbc.cust_id = cc.cust_id
--;

SELECT bbc.CYCLE||';'||bbc.charge_code||';'||
       bbc.charge_type||';'||to_char(amount-ROUND(bbc.amount/1.05*slc.num1,2))||';'||
       ROUND (bbc.amount / 1.05 * slc.num1, 2)||';'||
       slc.num1||';'||bbc.subscr_id||';'||
       cs.subscr_type||';'||bbc.acct_id||';'||
       ca.acct_category||';'||cc.cust_type||';'||cc.cust_sub_type
  FROM fy_tb_bl_bill_ci bbc,
       fy_tb_pbk_charge_code pcc,
       fy_tb_sys_lookup_code slc,
       fy_tb_cm_subscr cs,
       fy_tb_cm_account ca,
       fy_tb_cm_customer cc
 WHERE bbc.SOURCE = 'OC'
   AND slc.lookup_type = 'TAX_TYPE'
   AND (bbc.bill_seq IS NULL or bbc.bi_seq is null)
   AND bbc.cycle not in (10,15,20)
   AND bbc.charge_code = pcc.charge_code
   AND pcc.tax_rate = slc.lookup_code
   AND bbc.subscr_id = cs.subscr_id
   AND bbc.acct_id = ca.acct_id
   AND bbc.cust_id = cc.cust_id
;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function ftpReport2
{
ftp -i -n -v $1<<EOF
user $2 $3
pass
cd $4
mput $5
bye
EOF
}

function formatterReport
{
grep -v '^$' ${reportFileName}.dat > ${ReportDir}/${reportFileName}.txt
rm ${reportFileName}.dat
}

function sendFinalMail
{
send_msg="<SR225879_HGB_MPBL_Unbill_OC_Report> $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${reportFileName}.txt ${mailList} <<EOF
Dears,

   SR225879_HGB_MPBL_Unbill_OC_Report已產出。
   檔名：
   ${reportFileName}.txt
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

function sendGenTempErrorMail
{
send_msg="<SR225879_HGB_MPBL_Unbill_OC_Report> $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR225879_HGB_MPBL_Unbill_OC_Report未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName1} Start" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}
cd $ReportDir
genReport
sleep 5
#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}


#check gen report
filecnt1=`ls ${ReportDir}/${reportFileName}.txt|wc -l`
sleep 5
if [[ (${filecnt1} = 0 ) ]] ; then
	echo "${progName} Generated Report Have Abnormal"|tee -a ${logFile}
	sendGenTempErrorMail
	exit 0
else
	echo "FTP Report"|tee -a ${logFile}
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName}.txt 0" | tee -a ${logFile}
		#${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${ReportDir}/${reportFileName}.txt 0
		
		cd ${ReportDir}
	ftpReport2 ${putip1} ${putuser1} ${putpass1} ${putpath1} "${reportFileName}.txt"
		
	echo "send SR225879_HGB_MPBL_Unbill_OC_Report"|tee -a ${logFile}

	echo "Move Report TO Bak"|tee -a ${logFile}
	mv "${reportFileName}.txt" ${ReportDirBak}
	#send final mail
	sendFinalMail
fi
sleep 5

echo "Gen ${reportFileName1} End" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR226434_BDE_Remaining_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR226434_HGB_BDE_Remaining_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2020/06/10 Modify by Mike Kuan
# Description : 新增HGB預繳餘額報表含IOT、MPBL
########################################################################################
# Date : 2020/10/16 Modify by Mike Kuan
# Description : SR230767 - HGB設定IoT企業專網折扣for ICT專案扣抵 (新增ACCT_NAME)
########################################################################################
# Date : 2021/11/05 Modify by Mike Kuan
# Description : 修改本期折扣金額抓取方式
########################################################################################
# Date : 2022/04/11 Modify by Mike Kuan
# Description : 修改mail收件人
########################################################################################
# Date : 2022/12/05 Modify by Mike Kuan
# Description : 修改已過期資料不顯示
########################################################################################
export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="SR226434_HGB_BDE_Remaining_Report"
mailList="melichen@fareastone.com.tw abbychen4@fareastone.com.tw mikekuan@fareastone.com.tw"
#mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${RPTDB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool SR226434_HGB_BDE_Remaining_Report.dat

select 'CYCLE','CUST','ACCT','ACCT_NAME','門號','門號類型','SUB','SUB狀態','OFFER','OFFER名稱','OFFER生效日期','BDE安裝金額','BDE當期使用金額','BDE總使用金額','BDE剩餘金額','OFFER_RSN_CODE','OFFER狀態','CATEGORY' from dual;

SELECT DECODE (d.CYCLE,
               10, 'N_Cloud05',
               15, 'N_Cloud15',
               20, 'NCIC01',
               50, 'M01',
               51, 'M03',
               52, 'M05',
               53, 'M08',
               54, 'M11',
               55, 'M14',
               56, 'M17',
               57, 'M20',
               58, 'M23',
               59, 'M25',
               60, 'M27'
              )||','||
       a.cust_id||','||a.acct_id||','||f.elem2||','||to_char(b.prim_resource_val)||','||
       b.prim_res_param_cd||','||b.subscr_id||','||b.status||','||
       a.offer_id||','||to_char(c.offer_name)||','||TO_CHAR (a.eff_date, 'YYYY/MM/DD')||','||
       DECODE (init_pkg_qty,
               0, (SELECT param_value
                     FROM fy_tb_bl_offer_param
                    WHERE param_name = 'BD_QUOTA_0001'
                      AND acct_id = a.acct_id
                      AND offer_instance_id = a.offer_instance_id),
               init_pkg_qty
              )||','||
       --NVL ((SELECT SUM (bb.amount) * -1
       --        FROM fy_tb_bl_bill_cntrl aa, fy_tb_bl_bill_ci bb
       --       WHERE aa.bill_period =
       --                            TO_CHAR (ADD_MONTHS (SYSDATE, -1),
       --                                     'yyyymm')
       --         AND aa.bill_seq = bb.bill_seq
       --         AND bb.SOURCE = 'DE'
       --         AND bb.subscr_id = a.offer_level_id
       --         AND bb.offer_id = a.offer_id
       --         AND bb.offer_instance_id = a.offer_instance_id),
       --     0
       --    )||','||
       NVL(NVL (a.bill_use_qty,
            a.cur_use_qty
           ),0)||','||
       a.total_disc_amt||','||a.cur_bal_qty||','||
       e.offer_rsn_code||','||DECODE (e.end_date, NULL, 'A', 'C')||','||DECODE(d.cust_type,'D','I','N',DECODE(d.CYCLE,20,'D','A'),'M')
  FROM fy_tb_bl_acct_pkg a,
       fy_tb_cm_subscr b,
       fy_tb_pbk_offer c,
       fy_tb_cm_customer d,
       fy_tb_cm_subscr_offer e,
       (SELECT *
            FROM fy_tb_cm_prof_link
           WHERE link_type = 'A' AND prof_type = 'NAME') f
 WHERE a.offer_level = 'S'
   AND d.cust_type != 'N'
   AND a.prepayment IS NOT NULL
   AND a.offer_level_id = b.subscr_id
   AND a.offer_level_id = e.subscr_id
   AND a.acct_id = f.entity_id
   AND a.offer_id = c.offer_id
   AND a.offer_id = e.offer_id
   AND a.offer_instance_id = e.offer_instance_id
   AND a.cust_id = d.cust_id
   and add_months(a.cur_billed,2) >= sysdate --2022/12/05過期資料不顯示
;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function formatterReport
{
grep -v '^$' ${reportFileName}.dat > ${ReportDir}/${reportFileName}.csv
rm ${reportFileName}.dat
}

function sendFinalMail
{
send_msg="<SR226434_HGB_BDE_Remaining_Report> $sysd"
	iconv -f utf8 -t big5 -c ${reportFileName}.csv > ${reportFileName}.big5
	mv ${reportFileName}.big5 ${reportFileName}_$sysd.csv
	rm ${reportFileName}.csv
mailx -s "${send_msg}" -a ${reportFileName}_$sysd.csv "${mailList}" <<EOF
Dears,

   SR226434_HGB_BDE_Remaining_Report已產出。
   檔名：
   ${reportFileName}.csv

EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName1} Start" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}
cd $ReportDir
genReport

#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}

#send final mail
sendFinalMail
echo "Gen ${reportFileName1} End" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR239730_AWS_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR239730_HGBN_AWS_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2021/08/09 Created by Mike Kuan
# Description : SR239730_AWS_Report
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="SR239730_HGBN_AWS_Report"
mailList="EBU-SIPMD-CLDITSM-HBDCLD@local.fareastone.com.tw mikekuan@fareastone.com.tw"
#mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${tempFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool SR239730_HGBN_AWS_Report.dat

select '客戶名稱'||','||'用戶編號'||','||'比例/百分比%'||','||'統一編號'||','||'Account_ID'||','||'服務類型'||','||'業務員'||','||'出帳年月'||','||'營收(含稅)'||','||'出帳起'||','||'出帳迄'||','||'HSR起'||','||'HSR迄'||','||'BILLING用戶編號' from dual;

--SELECT   e.elem2 AS "客戶名稱", TO_CHAR (h.subscr_id) AS "用戶編號",
--         h.fee_percent AS "比例/百分比%", e.elem6 AS "統一編號",
--         to_char(d.RESOURCE_VALUE) AS "AWS_Account ID", h.po_name AS "服務類型",
--         h.sales AS "業務員", g.bill_period AS "出帳年月",
--         g.tot_amt AS "營收(含稅)", a.bill_from_date AS "出帳起", a.bill_end_date AS "出帳迄",
--         h.hsr_from_date AS "HSR起", h.hsr_end_date AS "HSR迄", c.subscr_id AS "BILLING用戶編號"
--    FROM fy_tb_bl_bill_cntrl a,
--         fy_tb_cm_subscr c,
--         fy_tb_cm_resource d,
--         fy_tb_cm_prof_link e,
--         fy_tb_bl_bill_mast g,
--         (SELECT   distinct TO_NUMBER (vsub.billing_subscr_id) AS "BILLING_SUBSCR_ID",
--         TO_CHAR (vsub.subscr_id) AS "SUBSCR_ID",
--         TO_CHAR (vsub.sales_id || '-' || vsub.sales_name_cht) AS "SALES",
--         vaws.po_name, vaws.fee_percent,
--         MAX (TRUNC (vaws.start_date)) AS "HSR_FROM_DATE",
--         TRUNC (vaws.stop_date) AS "HSR_END_DATE"
--    FROM v_subscr_info vsub, (select * from (
--select a.*,row_number() over (PARTITION BY subscr_id order by start_date desc) sn from v_aws_info a) R
--where r.sn=1
--order by r.subscr_id) vaws
--   WHERE vsub.subscr_id = vaws.subscr_id
--GROUP BY vsub.billing_subscr_id,
--         vsub.subscr_id,
--         TO_CHAR (vsub.sales_id || '-' || vsub.sales_name_cht),
--         vaws.po_name,
--         vaws.fee_percent,
--         vaws.stop_date) h
--   WHERE c.acct_id = e.entity_id
--     AND e.entity_type = 'A'
--     AND e.prof_type = 'NAME'
--     AND e.link_type = 'A'
--     AND c.subscr_id = d.subscr_id
--     AND c.acct_id = g.acct_id
--     AND d.resource_prm_cd IN ('AWSID')
--     AND g.CYCLE = 10
--     AND a.CYCLE = g.CYCLE
--     AND a.bill_seq = g.bill_seq
--     AND h.hsr_from_date(+) <= a.bill_end_date
--     AND DECODE (h.hsr_end_date(+), NULL, a.bill_end_date, h.hsr_end_date(+))
--            > a.bill_from_date
--     AND c.subscr_id = h.billing_subscr_id(+)
--     AND g.bill_period = to_char(add_months(trunc(sysdate,'mm'),-1),'yyyymm')
----AND TO_NUMBER (c.subscr_id) = 300001147
--ORDER BY e.elem2,c.subscr_id

--SELECT   e.elem2 AS "客戶名稱", TO_CHAR (h.subscr_id) AS "用戶編號",
--         h.fee_percent AS "比例/百分比%", e.elem6 AS "統一編號",
--         to_char(d.RESOURCE_VALUE) AS "AWS_Account ID", h.po_name AS "服務類型",
--         h.sales AS "業務員", a.bill_period AS "出帳年月",
--         g.amount AS "營收(含稅)", a.bill_from_date AS "出帳起", a.bill_end_date AS "出帳迄",
--         h.hsr_from_date AS "HSR起", h.hsr_end_date AS "HSR迄", c.subscr_id AS "BILLING用戶編號"
--    FROM fy_tb_bl_bill_cntrl a,
--         fy_tb_cm_subscr c,
--         fy_tb_cm_resource d,
--         fy_tb_cm_prof_link e,
--         (select bill_seq,cycle,sum(amount) amount,subscr_id from fy_tb_bl_bill_ci where source='UC' group by bill_seq,cycle,subscr_id) g,
--         (SELECT   distinct TO_NUMBER (vsub.billing_subscr_id) AS "BILLING_SUBSCR_ID",
--         TO_CHAR (vsub.subscr_id) AS "SUBSCR_ID",
--         TO_CHAR (vsub.sales_id || '-' || vsub.sales_name_cht) AS "SALES",
--         vaws.po_name, vaws.fee_percent,
--         MAX (TRUNC (vaws.start_date)) AS "HSR_FROM_DATE",
--         TRUNC (vaws.stop_date) AS "HSR_END_DATE"
--    FROM v_subscr_info vsub, (select * from (
--select a.*,row_number() over (PARTITION BY subscr_id order by start_date desc) sn from v_aws_info a) R
--where r.sn=1
--order by r.subscr_id) vaws
--   WHERE vsub.subscr_id = vaws.subscr_id
--GROUP BY vsub.billing_subscr_id,
--         vsub.subscr_id,
--         TO_CHAR (vsub.sales_id || '-' || vsub.sales_name_cht),
--         vaws.po_name,
--         vaws.fee_percent,
--         vaws.stop_date) h
--   WHERE c.acct_id = e.entity_id
--     AND e.entity_type = 'A'
--     AND e.prof_type = 'NAME'
--     AND e.link_type = 'A'
--     AND c.subscr_id = d.subscr_id
--     AND c.subscr_id = g.subscr_id
--     AND d.resource_prm_cd IN ('AWSID')
--     AND g.CYCLE = 10
--     AND a.CYCLE = g.CYCLE
--     AND a.bill_seq = g.bill_seq
--     --and g.source='UC'
--     AND h.hsr_from_date(+) <= a.bill_end_date
--     AND DECODE (h.hsr_end_date(+), NULL, a.bill_end_date, h.hsr_end_date(+))
--            > a.bill_from_date
--     AND c.subscr_id = h.billing_subscr_id(+)
--     AND a.bill_period = to_char(add_months(trunc(sysdate,'mm'),-1),'yyyymm')
----AND TO_NUMBER (c.subscr_id) = 300001147
----group by e.elem2 , TO_CHAR (h.subscr_id),
----         h.fee_percent , e.elem6 ,
----         d.RESOURCE_VALUE , h.po_name ,
----         h.sales, a.bill_period,
----         a.bill_from_date, a.bill_end_date ,
----         h.hsr_from_date, h.hsr_end_date , c.subscr_id 
--ORDER BY e.elem2,c.subscr_id

SELECT      e.elem2
         || ','
         || TO_CHAR (h.subscr_id)
         || ','
         || h.fee_percent
         || ','
         || '="'||to_char(e.elem6)||'"'
         || ','
         || '="'||to_char(d.RESOURCE_VALUE)||'"'
         || ','
         || h.po_name
         || ','
         || h.sales
         || ','
         || a.bill_period
         || ','
         || g.amount
         || ','
         || a.bill_from_date
         || ','
         || a.bill_end_date
         || ','
         || h.hsr_from_date
         || ','
         || h.hsr_end_date
         || ','
         || c.subscr_id
    FROM fy_tb_bl_bill_cntrl a,
         fy_tb_cm_subscr c,
         fy_tb_cm_resource d,
         fy_tb_cm_prof_link e,
         (select bill_seq,cycle,sum(amount) amount,subscr_id from fy_tb_bl_bill_ci where source='UC' group by bill_seq,cycle,subscr_id) g,
         (SELECT   distinct TO_NUMBER (vsub.billing_subscr_id) AS "BILLING_SUBSCR_ID",
         TO_CHAR (vsub.subscr_id) AS "SUBSCR_ID",
         TO_CHAR (vsub.sales_id || '-' || vsub.sales_name_cht) AS "SALES",
         vaws.po_name, vaws.fee_percent,
         MAX (TRUNC (vaws.start_date)) AS "HSR_FROM_DATE",
         TRUNC (vaws.stop_date) AS "HSR_END_DATE"
    FROM v_subscr_info vsub, (select * from (
select a.*,row_number() over (PARTITION BY subscr_id order by start_date desc) sn from v_aws_info a) R
where r.sn=1
order by r.subscr_id) vaws
   WHERE vsub.subscr_id = vaws.subscr_id
GROUP BY vsub.billing_subscr_id,
         vsub.subscr_id,
         TO_CHAR (vsub.sales_id || '-' || vsub.sales_name_cht),
         vaws.po_name,
         vaws.fee_percent,
         vaws.stop_date) h
   WHERE c.acct_id = e.entity_id
     AND e.entity_type = 'A'
     AND e.prof_type = 'NAME'
     AND e.link_type = 'A'
     AND c.subscr_id = d.subscr_id
     AND c.subscr_id = g.subscr_id
     AND d.resource_prm_cd IN ('AWSID')
     AND g.CYCLE = 10
     AND a.CYCLE = g.CYCLE
     AND a.bill_seq = g.bill_seq
     AND h.hsr_from_date(+) <= a.bill_end_date
     AND DECODE (h.hsr_end_date(+), NULL, a.bill_end_date, h.hsr_end_date(+))
            > a.bill_from_date
     AND c.subscr_id = h.billing_subscr_id(+)
     AND a.bill_period = to_char(add_months(trunc(sysdate,'mm'),-1),'yyyymm')
ORDER BY e.elem2,c.subscr_id
;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function formatterReport
{
grep -v '^$' ${reportFileName}.dat > ${ReportDir}/${reportFileName}.csv
rm ${reportFileName}.dat
}

function sendFinalMail
{
send_msg="<SR239730_HGBN_AWS_Report> $sysd"
	iconv -f utf8 -t big5 -c ${reportFileName}.csv > ${reportFileName}.big5
	mv ${reportFileName}.big5 ${reportFileName}_$sysd.csv
	rm ${reportFileName}.csv
mailx -s "${send_msg}" -a ${reportFileName}_$sysd.csv "${mailList}" <<EOF
Dears,

   SR239730_HGBN_AWS_Report已產出。
   檔名：
   ${reportFileName}.csv

EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName} Start" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}
cd $ReportDir
genReport

#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}

#send final mail
sendFinalMail
echo "Gen ${reportFileName} End" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR241657_BDE_Remaining_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR241657_HGB_BDE_Remaining_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2021/09/08 add by Mike Kuan
# Description : 新增HGBN Billing discount餘額報表
########################################################################################
# Date : 2023/04/17 Modify by Mike Kuan
# Description : SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
#               SR260229_Project-M Fixed line Phase I_新增CUST_TYPE='P'
########################################################################################
export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m`
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="SR241657_HGB_BDE_Remaining_Report"
mailList="emmachuang@fareastone.com.tw mikekuan@fareastone.com.tw"
#mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${RPTDB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool SR241657_HGB_BDE_Remaining_Report.dat

select 'CYCLE','CUST','ACCT','門號','門號類型','SUB','SUB狀態','OFFER','OFFER名稱','OFFER生效日期','BDE安裝金額','BDE當期使用金額','BDE總使用金額','BDE剩餘金額','OFFER_RSN_CODE','OFFER狀態','CATEGORY' from dual;

SELECT DECODE (d.CYCLE,
               10, 'N_Cloud05',
               15, 'N_Cloud15',
               20, 'NCIC01',
               50, 'M01',
               51, 'M03',
               52, 'M05',
               53, 'M08',
               54, 'M11',
               55, 'M14',
               56, 'M17',
               57, 'M20',
               58, 'M23',
               59, 'M25',
               60, 'M27'
              )||','||
       a.cust_id||','||a.acct_id||','||to_char(b.prim_resource_val)||','||
       b.prim_res_param_cd||','||b.subscr_id||','||b.status||','||
       a.offer_id||','||to_char(c.offer_name)||','||TO_CHAR (a.eff_date, 'YYYY/MM/DD')||','||
       DECODE (init_pkg_qty,
               0, (SELECT param_value
                     FROM fy_tb_bl_offer_param
                    WHERE param_name = 'BD_QUOTA_0001'
                      AND acct_id = a.acct_id
                      AND offer_instance_id = a.offer_instance_id),
               init_pkg_qty
              )||','||
       NVL ((SELECT SUM (bb.amount) * -1
               FROM fy_tb_bl_bill_cntrl aa, fy_tb_bl_bill_ci bb
              WHERE aa.bill_period =
                                   TO_CHAR (ADD_MONTHS (SYSDATE, -1),
                                            'yyyymm')
                AND aa.bill_seq = bb.bill_seq
                AND bb.SOURCE = 'DE'
                AND bb.subscr_id = a.offer_level_id
                AND bb.offer_id = a.offer_id
                AND bb.offer_instance_id = a.offer_instance_id),
            0
           )||','||
       a.total_disc_amt||','||a.cur_bal_qty||','||
       e.offer_rsn_code||','||DECODE (e.end_date, NULL, 'A', 'C')||','||DECODE(d.cust_type,'D','I','N',DECODE(d.CYCLE,20,'D','A'),'M')
  FROM fy_tb_bl_acct_pkg a,
       fy_tb_cm_subscr b,
       fy_tb_pbk_offer c,
       fy_tb_cm_customer d,
       fy_tb_cm_subscr_offer e
 WHERE a.offer_level = 'S'
   AND d.cust_type = 'N'
   AND a.prepayment IS NOT NULL
   AND a.offer_level_id = b.subscr_id
   AND a.offer_level_id = e.subscr_id
   AND a.offer_id = c.offer_id
   AND a.offer_id = e.offer_id
   AND a.offer_instance_id = e.offer_instance_id
   AND a.cust_id = d.cust_id
;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function formatterReport
{
grep -v '^$' ${reportFileName}.dat > ${ReportDir}/${reportFileName}.csv
rm ${reportFileName}.dat
}

function sendFinalMail
{
send_msg="<SR241657_HGB_BDE_Remaining_Report> $sysd"
	iconv -f utf8 -t big5 -c ${reportFileName}.csv > ${reportFileName}.big5
	mv ${reportFileName}.big5 ${reportFileName}_$sysd.csv
	rm ${reportFileName}.csv
mailx -s "${send_msg}" -a ${reportFileName}_$sysd.csv "${mailList}" <<EOF
Dears,

   SR241657_HGB_BDE_Remaining_Report已產出。
   檔名：
   ${reportFileName}.csv

EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName1} Start" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}
cd $ReportDir
genReport

#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}

#send final mail
sendFinalMail
echo "Gen ${reportFileName1} End" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR250171_HGB_UBL_ESDP_UNBILL_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR250171_HGB_UBL_ESDP_UNBILL_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2022/06/22 Create by Mike Kuan
# Description : SR250171_ESDP Migraion估計報表、未實現報表
########################################################################################
# Date : 2022/07/18 Create by Mike Kuan
# Description : 修改檔名月份
########################################################################################
# Date : 2022/11/18 Create by Mike Kuan
# Description : 修改sysd日期，每月產生前月資料
########################################################################################
# Date : 2023/05/02 Create by Mike Kuan
# Description : 修改月份進位從無條件捨去改為小數兩位
########################################################################################
# Date : 2023/04/24 Modify by Mike Kuan
# Description : SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
########################################################################################
# Date : 2024/10/28 Modify by Mike Kuan
# Description : 修改estimate_costs為0
########################################################################################
# Date : 2025/04/16 Modify by Mike Kuan
# Description : SR277291_在HGBN與MIB系統提供遠距診療billing功能，新增CYCLE=50 and SUBSCR_TYPE='Z'
########################################################################################
# Date : 2025/10/27 Modify by Mike Kuan
# Description : 修正ORA-01476 錯誤
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
#sysd=202303
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
ReportDirBak=$ReportDir/bak
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="ESDP_`date +%Y%m --date="-0 month"`_`date +%Y%m%d%H%M%S`"
reportFileName2="HGB_ESDP_UNBILL2_`date +%Y%m --date="-0 month"`_`date +%Y%m%d%H%M%S`"
utilDir=/cb/BCM/util
ftpProg=${utilDir}/Ftp2Remote.sh
#mailList="keroh@fareastone.com.tw mikekuan@fareastone.com.tw"
mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
putip1=10.64.16.58
putpass1=unix11
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
putip1=10.64.18.122
putpass1=unix11
;;
"pet-hgbap01p"|"pet-hgbap02p") #(PET)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.64.18.123
putpass1=unix11
;;
"idc-hgbap01p"|"idc-hgbap02p") #(PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.68.59.130
putpass1=`/cb/CRYPT/GetPw.sh UBL_UAR_FTP`
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
#FTP
putuser1=ublftp
putpath1=/AR/payment/ARBATCH90/Batch_ESDP_FSS_RPT/DIO_INPUT

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool ${reportFileName}.dat

select 'CUSTOMER_ID'||';'||'SUBSCRIBER_NO'||';'||'ACCOUNT_ID'||';'||'CYCLE_CODE'||';'||'CYCLE_MONTH'||';'||'CYCLE_YEAR'||';'||'BILLINVNUM'||';'||'CHARGE_TYPE'||';'||'CHARGE_CODE'||';'||'CHARGEAMT'||';'||'TAX_AMOUNT'||';'||'TAX_RATE'||';'||'TAX_CODE'||';'||'SERVICE_RECEIVER_TYPE'||';'||'SUBSCRIBER_TYPE'||';'||'CYCLE_ST_DT'||';'||'CYCLE_ED_DT'||';'||'CHARGE_ST_DT'||';'||'CHARGE_ED_DT'||';'||'GUI'||';'||'END_DATE'||';'||'estimate_days'||';'||'estimate_costs' from dual;

--/* Formatted on 2022/07/08 11:21 (Formatter Plus v4.8.8) */
--SELECT bi_seq, charge_org, subscr.cust_id, bi.subscr_id, bi.acct_id, bi.CYCLE,
--       bi.cycle_month, SUBSTR (cntrl.bill_period, 1, 4), mast.bill_nbr,
--       bi.charge_type, bi.charge_code, (bi.amount - bi.tax_amt), bi.tax_amt,
--       DECODE (bi.tax_type, 'TX1', 5, 0) tax_rate, bi.tax_type,
--       bi.service_receiver_type, subscr.subscr_type, cntrl.bill_from_date,
--       cntrl.bill_end_date,
--       TO_CHAR
--          (TO_DATE (DECODE (bi.charge_org,
--                            'RA', REGEXP_SUBSTR
--                                              (bi.dynamic_attribute,
--                                               '.*First_Event_Date=([^#]*).*',
--                                               1,
--                                               1,
--                                               NULL,
--                                               1
--                                              ),
--                            NVL (TO_CHAR (bi.chrg_from_date, 'yyyy/mm/dd'),
--                                 TO_CHAR (cntrl.bill_from_date, 'yyyy/mm/dd')
--                                )
--                           ),
--                    'yyyy/mm/dd'
--                   ),
--           'yyyy/mm/dd'
--          ) chrg_from_date,
--       TO_CHAR
--          (TO_DATE (DECODE (bi.charge_org,
--                            'RA', REGEXP_SUBSTR
--                                               (bi.dynamic_attribute,
--                                                '.*Last_Event_Date=([^#]*).*',
--                                                1,
--                                                1,
--                                                NULL,
--                                                1
--                                               ),
--                            NVL (TO_CHAR (bi.chrg_end_date, 'yyyy/mm/dd'),
--                                 TO_CHAR (cntrl.bill_end_date, 'yyyy/mm/dd')
--                                )
--                           ),
--                    'yyyy/mm/dd'
--                   ),
--           'yyyy/mm/dd'
--          ) chrg_end_date,
--       LINK.elem6, pkg.end_date,
--       CASE
--          WHEN pkg.end_date IS NOT NULL
--             THEN (pkg.end_date - 1 - bi.chrg_end_date)
--          WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)
--               ) IN ('01', '03', '05', '07', '08', '10', '12')
--             THEN 31             ---(bi.chrg_from_date - cntrl.bill_from_date)
--          WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)) IN
--                                                                       ('02')
--             THEN 28             ---(bi.chrg_from_date - cntrl.bill_from_date)
--          ELSE 30                ---(bi.chrg_from_date - cntrl.bill_from_date)
--       END AS estimate_days,
--       ROUND
--          (  (  (bi.amount - bi.tax_amt)
--              / (  TO_DATE
--                      (DECODE (bi.charge_org,
--                               'RA', REGEXP_SUBSTR
--                                               (bi.dynamic_attribute,
--                                                '.*Last_Event_Date=([^#]*).*',
--                                                1,
--                                                1,
--                                                NULL,
--                                                1
--                                               ),
--                               NVL (TO_CHAR (bi.chrg_end_date, 'yyyy/mm/dd'),
--                                    TO_CHAR (cntrl.bill_end_date,
--                                             'yyyy/mm/dd')
--                                   )
--                              ),
--                       'yyyy/mm/dd'
--                      )
--                 - TO_DATE
--                      (DECODE (bi.charge_org,
--                               'RA', REGEXP_SUBSTR
--                                              (bi.dynamic_attribute,
--                                               '.*First_Event_Date=([^#]*).*',
--                                               1,
--                                               1,
--                                               NULL,
--                                               1
--                                              ),
--                               NVL (TO_CHAR (bi.chrg_from_date, 'yyyy/mm/dd'),
--                                    TO_CHAR (cntrl.bill_from_date,
--                                             'yyyy/mm/dd'
--                                            )
--                                   )
--                              ),
--                       'yyyy/mm/dd'
--                      )
--                 + 1
--                )          --* (cntrl.bill_end_date - cntrl.bill_end_date + 1)
--             )
--           * CASE
--                WHEN pkg.end_date IS NOT NULL
--                   THEN (pkg.end_date - 1 - bi.chrg_end_date)
--                WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)
--                     ) IN ('01', '03', '05', '07', '08', '10', '12')
--                   THEN 31       ---(bi.chrg_from_date - cntrl.bill_from_date)
--                WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)
--                     ) IN ('02')
--                   THEN 28       ---(bi.chrg_from_date - cntrl.bill_from_date)
--                ELSE 30          ---(bi.chrg_from_date - cntrl.bill_from_date)
--             END
--          ) estimate_costs
--  FROM fy_tb_bl_bill_bi bi,
--       fy_tb_bl_acct_pkg pkg,
--       fy_tb_bl_bill_mast mast,
--       fy_tb_cm_subscr subscr,
--       fy_tb_bl_bill_cntrl cntrl,
--       (SELECT entity_id, elem6
--          FROM fy_tb_cm_prof_link
--         WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
--                                                                           --and elem5=2
--       ) LINK
-- WHERE bi.bill_seq = cntrl.bill_seq
--   AND bi.bill_seq = mast.bill_seq
--   AND bi.CYCLE = cntrl.CYCLE
--   AND bi.CYCLE = mast.CYCLE
--   AND bi.acct_id = mast.acct_id
--   AND bi.acct_id = pkg.acct_id(+)
--   AND bi.acct_id = subscr.acct_id
--   AND bi.acct_id = LINK.entity_id
--   AND bi.subscr_id = subscr.subscr_id
--   AND bi.subscr_id = pkg.offer_level_id(+)
--   AND bi.offer_id = pkg.offer_id(+)
--   AND bi.offer_seq = pkg.offer_seq(+)
--   AND cntrl.bill_period = 202205
--   AND cntrl.CYCLE = 10
--   --and bi.BILL_SEQ=150053
--   AND bi.charge_org NOT IN ('IN', 'NN')
--   AND NVL (bi.chrg_end_date, cntrl.bill_end_date) <= cntrl.bill_end_date;

/* Formatted on 2022/07/08 11:20 (Formatter Plus v4.8.8) */
SELECT    subscr.cust_id
       || ';'
       || bi.subscr_id
       || ';'
       || bi.acct_id
       || ';'
       || bi.CYCLE
       || ';'
       || bi.cycle_month
       || ';'
       || SUBSTR (cntrl.bill_period, 1, 4)
       || ';'
       || mast.bill_nbr
       || ';'
       || bi.charge_type
       || ';'
       || bi.charge_code
       || ';'
       || (bi.amount - bi.tax_amt)
       || ';'
       || bi.tax_amt
       || ';'
       || DECODE (bi.tax_type, 'TX1', 5, 0)
       || ';'
       || bi.tax_type
       || ';'
       || bi.service_receiver_type
       || ';'
       || subscr.subscr_type
       || ';'
       || TO_CHAR (cntrl.bill_from_date, 'YYYY/MM/DD')
       || ';'
       || TO_CHAR (cntrl.bill_end_date, 'YYYY/MM/DD')
       || ';'
       || TO_CHAR
             (TO_DATE
                     (DECODE (bi.charge_org,
                              'RA', REGEXP_SUBSTR
                                              (bi.dynamic_attribute,
                                               '.*First_Event_Date=([^#]*).*',
                                               1,
                                               1,
                                               NULL,
                                               1
                                              ),
                              NVL (TO_CHAR (bi.chrg_from_date, 'yyyy/mm/dd'),
                                   TO_CHAR (cntrl.bill_from_date,
                                            'yyyy/mm/dd')
                                  )
                             ),
                      'yyyy/mm/dd'
                     ),
              'yyyy/mm/dd'
             )
       || ';'
       || TO_CHAR
             (TO_DATE (DECODE (bi.charge_org,
                               'RA', REGEXP_SUBSTR
                                               (bi.dynamic_attribute,
                                                '.*Last_Event_Date=([^#]*).*',
                                                1,
                                                1,
                                                NULL,
                                                1
                                               ),
                               NVL (TO_CHAR (bi.chrg_end_date, 'yyyy/mm/dd'),
                                    TO_CHAR (cntrl.bill_end_date,
                                             'yyyy/mm/dd')
                                   )
                              ),
                       'yyyy/mm/dd'
                      ),
              'yyyy/mm/dd'
             )
       || ';'
       || LINK.elem6
       || ';'
       || TO_CHAR (pkg.end_date, 'YYYY/MM/DD')
       || ';'
       || CASE
             WHEN pkg.end_date IS NOT NULL
                THEN (pkg.end_date - 1 - bi.chrg_end_date)
             WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)) IN
                                   ('01', '03', '05', '07', '08', '10', '12')
                THEN 31          ---(bi.chrg_from_date - cntrl.bill_from_date)
             WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)) IN
                                                                       ('02')
                THEN 28          ---(bi.chrg_from_date - cntrl.bill_from_date)
             ELSE 30             ---(bi.chrg_from_date - cntrl.bill_from_date)
          END
       || ';'
       || 0
  FROM fy_tb_bl_bill_bi bi,
       fy_tb_bl_acct_pkg pkg,
       fy_tb_bl_bill_mast mast,
       fy_tb_cm_subscr subscr,
       fy_tb_bl_bill_cntrl cntrl,
       (SELECT entity_id, elem6
          FROM fy_tb_cm_prof_link
         WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
                                                                           --and elem5=2
       ) LINK
 WHERE bi.bill_seq = cntrl.bill_seq
   AND bi.bill_seq = mast.bill_seq
   AND bi.CYCLE = cntrl.CYCLE
   AND bi.CYCLE = mast.CYCLE
   AND bi.acct_id = mast.acct_id
   AND bi.acct_id = pkg.acct_id(+)
   AND bi.acct_id = subscr.acct_id
   AND bi.acct_id = LINK.entity_id
   AND bi.subscr_id = subscr.subscr_id
   AND bi.subscr_id = pkg.offer_level_id(+)
   AND bi.offer_id = pkg.offer_id(+)
   AND bi.offer_seq = pkg.offer_seq(+)
   AND cntrl.bill_period = ${sysd}
   AND (cntrl.CYCLE IN (10, 15, 20) or (cntrl.cycle in (50) and subscr.SUBSCR_TYPE = 'Z')) --SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20) --SR277291_在HGBN與MIB系統提供遠距診療billing功能
   --and bi.BILL_SEQ=150053
   AND bi.charge_org NOT IN ('IN', 'NN')
   AND NVL (bi.chrg_end_date, cntrl.bill_end_date) <= cntrl.bill_end_date;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function genReport2
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool ${reportFileName2}.dat

select 'CUSTOMER_ID'||';'||'SUBSCRIBER_NO'||';'||'ACCOUNT_ID'||';'||'CYCLE_CODE'||';'||'CYCLE_MONTH'||';'||'CYCLE_YEAR'||';'||'BILLINVNUM'||';'||'CHARGE_TYPE'||';'||'CHARGE_CODE'||';'||'CHARGEAMT'||';'||'TAX_AMOUNT'||';'||'TAX_RATE'||';'||'TAX_CODE'||';'||'SERVICE_RECEIVER_TYPE'||';'||'SUBSCRIBER_TYPE'||';'||'CYCLE_ST_DT'||';'||'CYCLE_ED_DT'||';'||'CHARGE_ST_DT'||';'||'CHARGE_ED_DT'||';'||'GUI'||';'||'END_DATE'||';'||'months_diff'||';'||'months_diff2'||';'||'months_diff3'||';'||'m1'||';'||'m2' from dual;

--/* Formatted on 2022/06/23 14:52 (Formatter Plus v4.8.8) */
--SELECT subscr.cust_id, bi.subscr_id, bi.acct_id, bi.CYCLE, bi.cycle_month,
--       SUBSTR (cntrl.bill_period, 1, 4), mast.bill_nbr, bi.charge_type,
--       bi.charge_code, (bi.amount - bi.tax_amt), bi.tax_amt,
--       DECODE (bi.tax_type, 'TX1', 5, 0) tax_rate, bi.tax_type,
--       bi.service_receiver_type, subscr.subscr_type, cntrl.bill_from_date,
--       cntrl.bill_end_date, bi.chrg_from_date, bi.chrg_end_date, LINK.elem6,
--       pkg.end_date,
--       CASE
--          WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--               ) >= 0.5
--             THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                           bi.chrg_from_date)
--                          )
--                  + 1
--          ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--       END AS months_diff,
--       CASE
--          WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                  bi.chrg_from_date
--                                 )
--                - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                         bi.chrg_from_date
--                                        )
--                        )
--               ) >= 0.5
--             THEN   TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                           bi.chrg_from_date
--                                          )
--                          )
--                  + 1
--          ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                      bi.chrg_from_date
--                                     )
--                     )
--       END AS months_diff2,
--       (  CASE
--             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                              bi.chrg_from_date
--                                             )
--                             )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--          END
--        - CASE
--             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                     bi.chrg_from_date
--                                    )
--                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                        1),
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC
--                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                         1
--                                                        ),
--                                             bi.chrg_from_date
--                                            )
--                            )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                         bi.chrg_from_date
--                                        )
--                        )
--          END
--       ) AS months_diff3,
--       ROUND
--          (  (bi.amount - bi.tax_amt)
--           / CASE
--                WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                      - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                               bi.chrg_from_date
--                                              )
--                              )
--                     ) >= 0.5
--                   THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                                 bi.chrg_from_date
--                                                )
--                                )
--                        + 1
--                ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--             END
--          ) m1,
--       ROUND
--          (  (bi.amount - bi.tax_amt)
--           / CASE
--                WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                      - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                               bi.chrg_from_date
--                                              )
--                              )
--                     ) >= 0.5
--                   THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                                 bi.chrg_from_date
--                                                )
--                                )
--                        + 1
--                ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--             END
--          )
--           *        (  CASE
--             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                              bi.chrg_from_date
--                                             )
--                             )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--          END
--        - CASE
--             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                     bi.chrg_from_date
--                                    )
--                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                        1),
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC
--                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                         1
--                                                        ),
--                                             bi.chrg_from_date
--                                            )
--                            )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                         bi.chrg_from_date
--                                        )
--                        )
--          END
--       ) m2
--  FROM fy_tb_bl_bill_bi bi,
--       fy_tb_bl_acct_pkg pkg,
--       fy_tb_bl_bill_mast mast,
--       fy_tb_cm_subscr subscr,
--       fy_tb_bl_bill_cntrl cntrl,
--       (SELECT entity_id, elem6
--          FROM fy_tb_cm_prof_link
--         WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
--                                                                           --and elem5=2
--       ) LINK
-- WHERE bi.bill_seq = cntrl.bill_seq
--   AND bi.bill_seq = mast.bill_seq
--   AND bi.CYCLE = cntrl.CYCLE
--   AND bi.CYCLE = mast.CYCLE
--   AND bi.acct_id = mast.acct_id
--   AND bi.acct_id = pkg.acct_id(+)
--   AND bi.acct_id = subscr.acct_id
--   AND bi.acct_id = LINK.entity_id
--   AND bi.subscr_id = subscr.subscr_id
--   AND bi.subscr_id = pkg.offer_level_id(+)
--   AND bi.offer_id = pkg.offer_id(+)
--   AND bi.offer_seq = pkg.offer_seq(+)
--   AND cntrl.bill_period = 202005
--   AND cntrl.CYCLE = 10
--   --and bi.BILL_SEQ=150053
--   AND bi.charge_org NOT IN ('IN', 'NN')
--   AND NVL (bi.chrg_end_date, cntrl.bill_end_date) > cntrl.bill_end_date;

/* Formatted on 2022/06/23 14:52 (Formatter Plus v4.8.8) */
SELECT subscr.cust_id||';'||bi.subscr_id||';'||bi.acct_id||';'||bi.CYCLE||';'||bi.cycle_month||';'||
       SUBSTR(cntrl.bill_period, 1, 4)||';'||mast.bill_nbr||';'||bi.charge_type||';'||
       bi.charge_code||';'||(bi.amount - bi.tax_amt)||';'||bi.tax_amt||';'||
       DECODE(bi.tax_type, 'TX1', 5, 0)||';'||bi.tax_type||';'||
       bi.service_receiver_type||';'||subscr.subscr_type||';'||TO_CHAR(cntrl.bill_from_date, 'YYYY/MM/DD')||';'||
       TO_CHAR(cntrl.bill_end_date, 'YYYY/MM/DD')||';'||TO_CHAR(bi.chrg_from_date, 'YYYY/MM/DD')||';'||TO_CHAR(bi.chrg_end_date, 'YYYY/MM/DD')||';'||LINK.elem6||';'||
       TO_CHAR(pkg.end_date, 'YYYY/MM/DD')||';'||
       -- 計算 charge 月數
       CASE
          WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
             THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
          ELSE TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))
       END||';'||
       -- 計算 billing 月數
       CASE
          WHEN (MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))) >= 0.5
             THEN TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date)) + 1
          ELSE TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))
       END||';'||
       -- 差異月數的比例計算（避免除以零）
       decode(sign(  CASE
             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                              bi.chrg_from_date
                                             )
                             )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
          END
        - CASE
             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                     bi.chrg_from_date
                                    )
                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                        1),
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC
                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                         1
                                                        ),
                                             bi.chrg_from_date
                                            )
                            )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                         bi.chrg_from_date
                                        )
                        )
          END
       ),1,(  CASE
             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                              bi.chrg_from_date
                                             )
                             )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
          END
        - CASE
             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                     bi.chrg_from_date
                                    )
                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                        1),
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC
                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                         1
                                                        ),
                                             bi.chrg_from_date
                                            )
                            )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                         bi.chrg_from_date
                                        )
                        )
          END
       ),0)||';'||
       -- 單月金額（進位到整數）
       ROUND(
         (bi.amount - bi.tax_amt) /
         NULLIF(
           CASE
             WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
               THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
             ELSE ROUND(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date), 2)
           END,
           0
         ),
         0
       )||';'||
       -- 差異月數 * 單月金額（進位到整數）
       ROUND(
         ROUND(
           (bi.amount - bi.tax_amt) /
           NULLIF(
             CASE
               WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
               ELSE ROUND(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date), 2)
             END,
             0
           ),
           0
         )
         *
         DECODE(
           SIGN(
             CASE
               WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
               ELSE TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))
             END
             -
             CASE
               WHEN (MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date)) + 1
               ELSE TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))
             END
           ),
           1,
           (
             CASE
               WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
               ELSE TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))
             END
             -
             CASE
               WHEN (MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date)) + 1
               ELSE TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))
             END
           )
         ),
         0
       )
FROM fy_tb_bl_bill_bi bi,
     fy_tb_bl_acct_pkg pkg,
     fy_tb_bl_bill_mast mast,
     fy_tb_cm_subscr subscr,
     fy_tb_bl_bill_cntrl cntrl,
     (SELECT entity_id, elem6
        FROM fy_tb_cm_prof_link
       WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
     ) LINK
WHERE bi.bill_seq = cntrl.bill_seq
  AND bi.bill_seq = mast.bill_seq
  AND bi.CYCLE = cntrl.CYCLE
  AND bi.CYCLE = mast.CYCLE
  AND bi.acct_id = mast.acct_id
  AND bi.acct_id = pkg.acct_id(+)
  AND bi.acct_id = subscr.acct_id
  AND bi.acct_id = LINK.entity_id
  AND bi.subscr_id = subscr.subscr_id
  AND bi.subscr_id = pkg.offer_level_id(+)
  AND bi.offer_id = pkg.offer_id(+)
  AND bi.offer_seq = pkg.offer_seq(+)
  AND cntrl.bill_period = ${sysd}
  AND (cntrl.CYCLE IN (10, 15, 20) OR (cntrl.cycle IN (50) AND subscr.SUBSCR_TYPE = 'Z'))
  AND bi.charge_org NOT IN ('IN', 'NN')
  AND NVL(bi.chrg_end_date, cntrl.bill_end_date) > cntrl.bill_end_date;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function ftpReport2
{
ftp -i -n -v $1<<EOF
user $2 $3
pass
cd $4
mput $5
bye
EOF
}

function formatterReport
{
grep -v '^$' ${reportFileName}.dat > ${ReportDir}/${reportFileName}.csv
rm ${reportFileName}.dat
sleep 5
grep -v '^$' ${reportFileName2}.dat > ${ReportDir}/${reportFileName2}.csv
rm ${reportFileName2}.dat
}

function sendFinalMail
{
send_msg="<SR250171_HGB_ESDP_UNBILL_Report> $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${ReportDirBak}/${reportFileName}.csv ${mailList} <<EOF
Dears,

   SR250171_HGB_ESDP_UNBILL_Report已產出。
   檔名：
   ${reportFileName}.csv
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF

send_msg="<SR250171_HGB_ESDP_UNBILL2_Report> $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${ReportDirBak}/${reportFileName2}.csv ${mailList} <<EOF
Dears,

   SR250171_HGB_ESDP_UNBILL2_Report已產出。
   檔名：
   ${reportFileName2}.csv
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

function sendGenTempErrorMail
{
send_msg="<SR250171_HGB_ESDP_UNBILL_Report> $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR250171_HGB_ESDP_UNBILL_Report未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF

send_msg="<SR250171_HGB_ESDP_UNBILL2_Report> $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR250171_HGB_ESDP_UNBILL2_Report未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName} Start" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}
cd $ReportDir
genReport
sleep 5
echo "Gen ${reportFileName2} Start" | tee -a ${logFile}
genReport2
sleep 5
#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}


#check gen report
filecnt1=`ls ${ReportDir}/${reportFileName}.csv|wc -l`
sleep 5
if [[ (${filecnt1} = 0 ) ]] ; then
	echo "${progName} Generated Report Have Abnormal"|tee -a ${logFile}
	sendGenTempErrorMail
	exit 0
else
cd ${ReportDir}
	echo "FTP Report"|tee -a ${logFile}
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName}.csv 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName}.csv 0
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName2}.csv 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName2}.csv 0
	
		#cd ${ReportDir}
	#ftpReport2 ${putip1} ${putuser1} ${putpass1} ${putpath1} "${reportFileName}.txt"
		
	echo "send SR250171_HGB_ESDP_UNBILL_Report"|tee -a ${logFile}

	echo "Move Report TO Bak"|tee -a ${logFile}
	mv "${reportFileName}.csv" ${ReportDirBak}
	mv "${reportFileName2}.csv" ${ReportDirBak}
	#send final mail
	sendFinalMail
fi
sleep 5

echo "Gen ${reportFileName} End" | tee -a ${logFile}
echo "Gen ${reportFileName2} End" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR250171_HGB_UBL_ESDP_UNBILL_Report.sh.bak
```text
#!/usr/bin/env bash
########################################################################################
# Program name : SR250171_HGB_UBL_ESDP_UNBILL_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2022/06/22 Create by Mike Kuan
# Description : SR250171_ESDP Migraion估計報表、未實現報表
########################################################################################
# Date : 2022/07/18 Create by Mike Kuan
# Description : 修改檔名月份
########################################################################################
# Date : 2022/11/18 Create by Mike Kuan
# Description : 修改sysd日期，每月產生前月資料
########################################################################################
# Date : 2023/05/02 Create by Mike Kuan
# Description : 修改月份進位從無條件捨去改為小數兩位
########################################################################################
# Date : 2023/04/24 Modify by Mike Kuan
# Description : SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
########################################################################################
# Date : 2024/10/28 Modify by Mike Kuan
# Description : 修改estimate_costs為0
########################################################################################
# Date : 2025/04/16 Modify by Mike Kuan
# Description : SR277291_在HGBN與MIB系統提供遠距診療billing功能，新增CYCLE=50 and SUBSCR_TYPE='Z'
########################################################################################
# Date : 2025/10/27 Modify by Mike Kuan
# Description : 修正ORA-01476 錯誤
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
#sysd=202303
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
ReportDirBak=$ReportDir/bak
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="ESDP_`date +%Y%m --date="-0 month"`_`date +%Y%m%d%H%M%S`"
reportFileName2="HGB_ESDP_UNBILL2_`date +%Y%m --date="-0 month"`_`date +%Y%m%d%H%M%S`"
utilDir=/cb/BCM/util
ftpProg=${utilDir}/Ftp2Remote.sh
#mailList="keroh@fareastone.com.tw mikekuan@fareastone.com.tw"
mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
putip1=10.64.16.58
putpass1=unix11
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
putip1=10.64.18.122
putpass1=unix11
;;
"pet-hgbap01p"|"pet-hgbap02p") #(PET)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.64.18.123
putpass1=unix11
;;
"idc-hgbap01p"|"idc-hgbap02p") #(PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.68.59.130
putpass1=`/cb/CRYPT/GetPw.sh UBL_UAR_FTP`
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
#FTP
putuser1=ublftp
putpath1=/AR/payment/ARBATCH90/Batch_ESDP_FSS_RPT/DIO_INPUT

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool ${reportFileName}.dat

select 'CUSTOMER_ID'||';'||'SUBSCRIBER_NO'||';'||'ACCOUNT_ID'||';'||'CYCLE_CODE'||';'||'CYCLE_MONTH'||';'||'CYCLE_YEAR'||';'||'BILLINVNUM'||';'||'CHARGE_TYPE'||';'||'CHARGE_CODE'||';'||'CHARGEAMT'||';'||'TAX_AMOUNT'||';'||'TAX_RATE'||';'||'TAX_CODE'||';'||'SERVICE_RECEIVER_TYPE'||';'||'SUBSCRIBER_TYPE'||';'||'CYCLE_ST_DT'||';'||'CYCLE_ED_DT'||';'||'CHARGE_ST_DT'||';'||'CHARGE_ED_DT'||';'||'GUI'||';'||'END_DATE'||';'||'estimate_days'||';'||'estimate_costs' from dual;

--/* Formatted on 2022/07/08 11:21 (Formatter Plus v4.8.8) */
--SELECT bi_seq, charge_org, subscr.cust_id, bi.subscr_id, bi.acct_id, bi.CYCLE,
--       bi.cycle_month, SUBSTR (cntrl.bill_period, 1, 4), mast.bill_nbr,
--       bi.charge_type, bi.charge_code, (bi.amount - bi.tax_amt), bi.tax_amt,
--       DECODE (bi.tax_type, 'TX1', 5, 0) tax_rate, bi.tax_type,
--       bi.service_receiver_type, subscr.subscr_type, cntrl.bill_from_date,
--       cntrl.bill_end_date,
--       TO_CHAR
--          (TO_DATE (DECODE (bi.charge_org,
--                            'RA', REGEXP_SUBSTR
--                                              (bi.dynamic_attribute,
--                                               '.*First_Event_Date=([^#]*).*',
--                                               1,
--                                               1,
--                                               NULL,
--                                               1
--                                              ),
--                            NVL (TO_CHAR (bi.chrg_from_date, 'yyyy/mm/dd'),
--                                 TO_CHAR (cntrl.bill_from_date, 'yyyy/mm/dd')
--                                )
--                           ),
--                    'yyyy/mm/dd'
--                   ),
--           'yyyy/mm/dd'
--          ) chrg_from_date,
--       TO_CHAR
--          (TO_DATE (DECODE (bi.charge_org,
--                            'RA', REGEXP_SUBSTR
--                                               (bi.dynamic_attribute,
--                                                '.*Last_Event_Date=([^#]*).*',
--                                                1,
--                                                1,
--                                                NULL,
--                                                1
--                                               ),
--                            NVL (TO_CHAR (bi.chrg_end_date, 'yyyy/mm/dd'),
--                                 TO_CHAR (cntrl.bill_end_date, 'yyyy/mm/dd')
--                                )
--                           ),
--                    'yyyy/mm/dd'
--                   ),
--           'yyyy/mm/dd'
--          ) chrg_end_date,
--       LINK.elem6, pkg.end_date,
--       CASE
--          WHEN pkg.end_date IS NOT NULL
--             THEN (pkg.end_date - 1 - bi.chrg_end_date)
--          WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)
--               ) IN ('01', '03', '05', '07', '08', '10', '12')
--             THEN 31             ---(bi.chrg_from_date - cntrl.bill_from_date)
--          WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)) IN
--                                                                       ('02')
--             THEN 28             ---(bi.chrg_from_date - cntrl.bill_from_date)
--          ELSE 30                ---(bi.chrg_from_date - cntrl.bill_from_date)
--       END AS estimate_days,
--       ROUND
--          (  (  (bi.amount - bi.tax_amt)
--              / (  TO_DATE
--                      (DECODE (bi.charge_org,
--                               'RA', REGEXP_SUBSTR
--                                               (bi.dynamic_attribute,
--                                                '.*Last_Event_Date=([^#]*).*',
--                                                1,
--                                                1,
--                                                NULL,
--                                                1
--                                               ),
--                               NVL (TO_CHAR (bi.chrg_end_date, 'yyyy/mm/dd'),
--                                    TO_CHAR (cntrl.bill_end_date,
--                                             'yyyy/mm/dd')
--                                   )
--                              ),
--                       'yyyy/mm/dd'
--                      )
--                 - TO_DATE
--                      (DECODE (bi.charge_org,
--                               'RA', REGEXP_SUBSTR
--                                              (bi.dynamic_attribute,
--                                               '.*First_Event_Date=([^#]*).*',
--                                               1,
--                                               1,
--                                               NULL,
--                                               1
--                                              ),
--                               NVL (TO_CHAR (bi.chrg_from_date, 'yyyy/mm/dd'),
--                                    TO_CHAR (cntrl.bill_from_date,
--                                             'yyyy/mm/dd'
--                                            )
--                                   )
--                              ),
--                       'yyyy/mm/dd'
--                      )
--                 + 1
--                )          --* (cntrl.bill_end_date - cntrl.bill_end_date + 1)
--             )
--           * CASE
--                WHEN pkg.end_date IS NOT NULL
--                   THEN (pkg.end_date - 1 - bi.chrg_end_date)
--                WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)
--                     ) IN ('01', '03', '05', '07', '08', '10', '12')
--                   THEN 31       ---(bi.chrg_from_date - cntrl.bill_from_date)
--                WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)
--                     ) IN ('02')
--                   THEN 28       ---(bi.chrg_from_date - cntrl.bill_from_date)
--                ELSE 30          ---(bi.chrg_from_date - cntrl.bill_from_date)
--             END
--          ) estimate_costs
--  FROM fy_tb_bl_bill_bi bi,
--       fy_tb_bl_acct_pkg pkg,
--       fy_tb_bl_bill_mast mast,
--       fy_tb_cm_subscr subscr,
--       fy_tb_bl_bill_cntrl cntrl,
--       (SELECT entity_id, elem6
--          FROM fy_tb_cm_prof_link
--         WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
--                                                                           --and elem5=2
--       ) LINK
-- WHERE bi.bill_seq = cntrl.bill_seq
--   AND bi.bill_seq = mast.bill_seq
--   AND bi.CYCLE = cntrl.CYCLE
--   AND bi.CYCLE = mast.CYCLE
--   AND bi.acct_id = mast.acct_id
--   AND bi.acct_id = pkg.acct_id(+)
--   AND bi.acct_id = subscr.acct_id
--   AND bi.acct_id = LINK.entity_id
--   AND bi.subscr_id = subscr.subscr_id
--   AND bi.subscr_id = pkg.offer_level_id(+)
--   AND bi.offer_id = pkg.offer_id(+)
--   AND bi.offer_seq = pkg.offer_seq(+)
--   AND cntrl.bill_period = 202205
--   AND cntrl.CYCLE = 10
--   --and bi.BILL_SEQ=150053
--   AND bi.charge_org NOT IN ('IN', 'NN')
--   AND NVL (bi.chrg_end_date, cntrl.bill_end_date) <= cntrl.bill_end_date;

/* Formatted on 2022/07/08 11:20 (Formatter Plus v4.8.8) */
SELECT    subscr.cust_id
       || ';'
       || bi.subscr_id
       || ';'
       || bi.acct_id
       || ';'
       || bi.CYCLE
       || ';'
       || bi.cycle_month
       || ';'
       || SUBSTR (cntrl.bill_period, 1, 4)
       || ';'
       || mast.bill_nbr
       || ';'
       || bi.charge_type
       || ';'
       || bi.charge_code
       || ';'
       || (bi.amount - bi.tax_amt)
       || ';'
       || bi.tax_amt
       || ';'
       || DECODE (bi.tax_type, 'TX1', 5, 0)
       || ';'
       || bi.tax_type
       || ';'
       || bi.service_receiver_type
       || ';'
       || subscr.subscr_type
       || ';'
       || TO_CHAR (cntrl.bill_from_date, 'YYYY/MM/DD')
       || ';'
       || TO_CHAR (cntrl.bill_end_date, 'YYYY/MM/DD')
       || ';'
       || TO_CHAR
             (TO_DATE
                     (DECODE (bi.charge_org,
                              'RA', REGEXP_SUBSTR
                                              (bi.dynamic_attribute,
                                               '.*First_Event_Date=([^#]*).*',
                                               1,
                                               1,
                                               NULL,
                                               1
                                              ),
                              NVL (TO_CHAR (bi.chrg_from_date, 'yyyy/mm/dd'),
                                   TO_CHAR (cntrl.bill_from_date,
                                            'yyyy/mm/dd')
                                  )
                             ),
                      'yyyy/mm/dd'
                     ),
              'yyyy/mm/dd'
             )
       || ';'
       || TO_CHAR
             (TO_DATE (DECODE (bi.charge_org,
                               'RA', REGEXP_SUBSTR
                                               (bi.dynamic_attribute,
                                                '.*Last_Event_Date=([^#]*).*',
                                                1,
                                                1,
                                                NULL,
                                                1
                                               ),
                               NVL (TO_CHAR (bi.chrg_end_date, 'yyyy/mm/dd'),
                                    TO_CHAR (cntrl.bill_end_date,
                                             'yyyy/mm/dd')
                                   )
                              ),
                       'yyyy/mm/dd'
                      ),
              'yyyy/mm/dd'
             )
       || ';'
       || LINK.elem6
       || ';'
       || TO_CHAR (pkg.end_date, 'YYYY/MM/DD')
       || ';'
       || CASE
             WHEN pkg.end_date IS NOT NULL
                THEN (pkg.end_date - 1 - bi.chrg_end_date)
             WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)) IN
                                   ('01', '03', '05', '07', '08', '10', '12')
                THEN 31          ---(bi.chrg_from_date - cntrl.bill_from_date)
             WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)) IN
                                                                       ('02')
                THEN 28          ---(bi.chrg_from_date - cntrl.bill_from_date)
             ELSE 30             ---(bi.chrg_from_date - cntrl.bill_from_date)
          END
       || ';'
       || 0
  FROM fy_tb_bl_bill_bi bi,
       fy_tb_bl_acct_pkg pkg,
       fy_tb_bl_bill_mast mast,
       fy_tb_cm_subscr subscr,
       fy_tb_bl_bill_cntrl cntrl,
       (SELECT entity_id, elem6
          FROM fy_tb_cm_prof_link
         WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
                                                                           --and elem5=2
       ) LINK
 WHERE bi.bill_seq = cntrl.bill_seq
   AND bi.bill_seq = mast.bill_seq
   AND bi.CYCLE = cntrl.CYCLE
   AND bi.CYCLE = mast.CYCLE
   AND bi.acct_id = mast.acct_id
   AND bi.acct_id = pkg.acct_id(+)
   AND bi.acct_id = subscr.acct_id
   AND bi.acct_id = LINK.entity_id
   AND bi.subscr_id = subscr.subscr_id
   AND bi.subscr_id = pkg.offer_level_id(+)
   AND bi.offer_id = pkg.offer_id(+)
   AND bi.offer_seq = pkg.offer_seq(+)
   AND cntrl.bill_period = ${sysd}
   AND (cntrl.CYCLE IN (10, 15, 20) or (cntrl.cycle in (50) and subscr.SUBSCR_TYPE = 'Z')) --SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20) --SR277291_在HGBN與MIB系統提供遠距診療billing功能
   --and bi.BILL_SEQ=150053
   AND bi.charge_org NOT IN ('IN', 'NN')
   AND NVL (bi.chrg_end_date, cntrl.bill_end_date) <= cntrl.bill_end_date;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function genReport2
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool ${reportFileName2}.dat

select 'CUSTOMER_ID'||';'||'SUBSCRIBER_NO'||';'||'ACCOUNT_ID'||';'||'CYCLE_CODE'||';'||'CYCLE_MONTH'||';'||'CYCLE_YEAR'||';'||'BILLINVNUM'||';'||'CHARGE_TYPE'||';'||'CHARGE_CODE'||';'||'CHARGEAMT'||';'||'TAX_AMOUNT'||';'||'TAX_RATE'||';'||'TAX_CODE'||';'||'SERVICE_RECEIVER_TYPE'||';'||'SUBSCRIBER_TYPE'||';'||'CYCLE_ST_DT'||';'||'CYCLE_ED_DT'||';'||'CHARGE_ST_DT'||';'||'CHARGE_ED_DT'||';'||'GUI'||';'||'END_DATE'||';'||'months_diff'||';'||'months_diff2'||';'||'months_diff3'||';'||'m1'||';'||'m2' from dual;

--/* Formatted on 2022/06/23 14:52 (Formatter Plus v4.8.8) */
--SELECT subscr.cust_id, bi.subscr_id, bi.acct_id, bi.CYCLE, bi.cycle_month,
--       SUBSTR (cntrl.bill_period, 1, 4), mast.bill_nbr, bi.charge_type,
--       bi.charge_code, (bi.amount - bi.tax_amt), bi.tax_amt,
--       DECODE (bi.tax_type, 'TX1', 5, 0) tax_rate, bi.tax_type,
--       bi.service_receiver_type, subscr.subscr_type, cntrl.bill_from_date,
--       cntrl.bill_end_date, bi.chrg_from_date, bi.chrg_end_date, LINK.elem6,
--       pkg.end_date,
--       CASE
--          WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--               ) >= 0.5
--             THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                           bi.chrg_from_date)
--                          )
--                  + 1
--          ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--       END AS months_diff,
--       CASE
--          WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                  bi.chrg_from_date
--                                 )
--                - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                         bi.chrg_from_date
--                                        )
--                        )
--               ) >= 0.5
--             THEN   TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                           bi.chrg_from_date
--                                          )
--                          )
--                  + 1
--          ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                      bi.chrg_from_date
--                                     )
--                     )
--       END AS months_diff2,
--       (  CASE
--             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                              bi.chrg_from_date
--                                             )
--                             )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--          END
--        - CASE
--             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                     bi.chrg_from_date
--                                    )
--                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                        1),
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC
--                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                         1
--                                                        ),
--                                             bi.chrg_from_date
--                                            )
--                            )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                         bi.chrg_from_date
--                                        )
--                        )
--          END
--       ) AS months_diff3,
--       ROUND
--          (  (bi.amount - bi.tax_amt)
--           / CASE
--                WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                      - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                               bi.chrg_from_date
--                                              )
--                              )
--                     ) >= 0.5
--                   THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                                 bi.chrg_from_date
--                                                )
--                                )
--                        + 1
--                ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--             END
--          ) m1,
--       ROUND
--          (  (bi.amount - bi.tax_amt)
--           / CASE
--                WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                      - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                               bi.chrg_from_date
--                                              )
--                              )
--                     ) >= 0.5
--                   THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                                 bi.chrg_from_date
--                                                )
--                                )
--                        + 1
--                ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--             END
--          )
--           *        (  CASE
--             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                              bi.chrg_from_date
--                                             )
--                             )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--          END
--        - CASE
--             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                     bi.chrg_from_date
--                                    )
--                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                        1),
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC
--                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                         1
--                                                        ),
--                                             bi.chrg_from_date
--                                            )
--                            )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                         bi.chrg_from_date
--                                        )
--                        )
--          END
--       ) m2
--  FROM fy_tb_bl_bill_bi bi,
--       fy_tb_bl_acct_pkg pkg,
--       fy_tb_bl_bill_mast mast,
--       fy_tb_cm_subscr subscr,
--       fy_tb_bl_bill_cntrl cntrl,
--       (SELECT entity_id, elem6
--          FROM fy_tb_cm_prof_link
--         WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
--                                                                           --and elem5=2
--       ) LINK
-- WHERE bi.bill_seq = cntrl.bill_seq
--   AND bi.bill_seq = mast.bill_seq
--   AND bi.CYCLE = cntrl.CYCLE
--   AND bi.CYCLE = mast.CYCLE
--   AND bi.acct_id = mast.acct_id
--   AND bi.acct_id = pkg.acct_id(+)
--   AND bi.acct_id = subscr.acct_id
--   AND bi.acct_id = LINK.entity_id
--   AND bi.subscr_id = subscr.subscr_id
--   AND bi.subscr_id = pkg.offer_level_id(+)
--   AND bi.offer_id = pkg.offer_id(+)
--   AND bi.offer_seq = pkg.offer_seq(+)
--   AND cntrl.bill_period = 202005
--   AND cntrl.CYCLE = 10
--   --and bi.BILL_SEQ=150053
--   AND bi.charge_org NOT IN ('IN', 'NN')
--   AND NVL (bi.chrg_end_date, cntrl.bill_end_date) > cntrl.bill_end_date;

/* Formatted on 2022/06/23 14:52 (Formatter Plus v4.8.8) */
SELECT subscr.cust_id||';'||bi.subscr_id||';'||bi.acct_id||';'||bi.CYCLE||';'||bi.cycle_month||';'||
       SUBSTR(cntrl.bill_period, 1, 4)||';'||mast.bill_nbr||';'||bi.charge_type||';'||
       bi.charge_code||';'||(bi.amount - bi.tax_amt)||';'||bi.tax_amt||';'||
       DECODE(bi.tax_type, 'TX1', 5, 0)||';'||bi.tax_type||';'||
       bi.service_receiver_type||';'||subscr.subscr_type||';'||TO_CHAR(cntrl.bill_from_date, 'YYYY/MM/DD')||';'||
       TO_CHAR(cntrl.bill_end_date, 'YYYY/MM/DD')||';'||TO_CHAR(bi.chrg_from_date, 'YYYY/MM/DD')||';'||TO_CHAR(bi.chrg_end_date, 'YYYY/MM/DD')||';'||LINK.elem6||';'||
       TO_CHAR(pkg.end_date, 'YYYY/MM/DD')||';'||
       -- 計算 charge 月數
       CASE
          WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
             THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
          ELSE TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))
       END||';'||
       -- 計算 billing 月數
       CASE
          WHEN (MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))) >= 0.5
             THEN TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date)) + 1
          ELSE TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))
       END||';'||
       -- 差異月數的比例計算（避免除以零）
       DECODE(
         SIGN(
           CASE
             WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
               THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
             ELSE TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))
           END
           -
           CASE
             WHEN (MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))) >= 0.5
               THEN TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date)) + 1
             ELSE TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))
           END
         ),
         1,
         ROUND(
           (bi.amount - bi.tax_amt) /
           NULLIF(
             CASE
               WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
               ELSE TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))
             END
             -
             CASE
               WHEN (MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date)) + 1
               ELSE TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))
             END,
             0
           ),
           0
         ),
         0
       )||';'||
       -- 單月金額（進位到整數）
       ROUND(
         (bi.amount - bi.tax_amt) /
         NULLIF(
           CASE
             WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
               THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
             ELSE ROUND(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date), 2)
           END,
           0
         ),
         0
       )||';'||
       -- 差異月數 * 單月金額（進位到整數）
       ROUND(
         ROUND(
           (bi.amount - bi.tax_amt) /
           NULLIF(
             CASE
               WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
               ELSE ROUND(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date), 2)
             END,
             0
           ),
           0
         )
         *
         DECODE(
           SIGN(
             CASE
               WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
               ELSE TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))
             END
             -
             CASE
               WHEN (MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date)) + 1
               ELSE TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))
             END
           ),
           1,
           (
             CASE
               WHEN (MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date)) + 1
               ELSE TRUNC(MONTHS_BETWEEN(bi.chrg_end_date, bi.chrg_from_date))
             END
             -
             CASE
               WHEN (MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date) - TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))) >= 0.5
                 THEN TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date)) + 1
               ELSE TRUNC(MONTHS_BETWEEN(ADD_MONTHS(cntrl.bill_end_date, 1), bi.chrg_from_date))
             END
           )
         ),
         0
       )
FROM fy_tb_bl_bill_bi bi,
     fy_tb_bl_acct_pkg pkg,
     fy_tb_bl_bill_mast mast,
     fy_tb_cm_subscr subscr,
     fy_tb_bl_bill_cntrl cntrl,
     (SELECT entity_id, elem6
        FROM fy_tb_cm_prof_link
       WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
     ) LINK
WHERE bi.bill_seq = cntrl.bill_seq
  AND bi.bill_seq = mast.bill_seq
  AND bi.CYCLE = cntrl.CYCLE
  AND bi.CYCLE = mast.CYCLE
  AND bi.acct_id = mast.acct_id
  AND bi.acct_id = pkg.acct_id(+)
  AND bi.acct_id = subscr.acct_id
  AND bi.acct_id = LINK.entity_id
  AND bi.subscr_id = subscr.subscr_id
  AND bi.subscr_id = pkg.offer_level_id(+)
  AND bi.offer_id = pkg.offer_id(+)
  AND bi.offer_seq = pkg.offer_seq(+)
  AND cntrl.bill_period = ${sysd}
  AND (cntrl.CYCLE IN (10, 15, 20) OR (cntrl.cycle IN (50) AND subscr.SUBSCR_TYPE = 'Z'))
  AND bi.charge_org NOT IN ('IN', 'NN')
  AND NVL(bi.chrg_end_date, cntrl.bill_end_date) > cntrl.bill_end_date;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function ftpReport2
{
ftp -i -n -v $1<<EOF
user $2 $3
pass
cd $4
mput $5
bye
EOF
}

function formatterReport
{
grep -v '^$' ${reportFileName}.dat > ${ReportDir}/${reportFileName}.csv
rm ${reportFileName}.dat
sleep 5
grep -v '^$' ${reportFileName2}.dat > ${ReportDir}/${reportFileName2}.csv
rm ${reportFileName2}.dat
}

function sendFinalMail
{
send_msg="<SR250171_HGB_ESDP_UNBILL_Report> $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${ReportDirBak}/${reportFileName}.csv ${mailList} <<EOF
Dears,

   SR250171_HGB_ESDP_UNBILL_Report已產出。
   檔名：
   ${reportFileName}.csv
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF

send_msg="<SR250171_HGB_ESDP_UNBILL2_Report> $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${ReportDirBak}/${reportFileName2}.csv ${mailList} <<EOF
Dears,

   SR250171_HGB_ESDP_UNBILL2_Report已產出。
   檔名：
   ${reportFileName2}.csv
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

function sendGenTempErrorMail
{
send_msg="<SR250171_HGB_ESDP_UNBILL_Report> $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR250171_HGB_ESDP_UNBILL_Report未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF

send_msg="<SR250171_HGB_ESDP_UNBILL2_Report> $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR250171_HGB_ESDP_UNBILL2_Report未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName} Start" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}
cd $ReportDir
genReport
sleep 5
echo "Gen ${reportFileName2} Start" | tee -a ${logFile}
genReport2
sleep 5
#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}


#check gen report
filecnt1=`ls ${ReportDir}/${reportFileName}.csv|wc -l`
sleep 5
if [[ (${filecnt1} = 0 ) ]] ; then
	echo "${progName} Generated Report Have Abnormal"|tee -a ${logFile}
	sendGenTempErrorMail
	exit 0
else
cd ${ReportDir}
	echo "FTP Report"|tee -a ${logFile}
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName}.csv 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName}.csv 0
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName2}.csv 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName2}.csv 0
	
		#cd ${ReportDir}
	#ftpReport2 ${putip1} ${putuser1} ${putpass1} ${putpath1} "${reportFileName}.txt"
		
	echo "send SR250171_HGB_ESDP_UNBILL_Report"|tee -a ${logFile}

	echo "Move Report TO Bak"|tee -a ${logFile}
	mv "${reportFileName}.csv" ${ReportDirBak}
	mv "${reportFileName2}.csv" ${ReportDirBak}
	#send final mail
	sendFinalMail
fi
sleep 5

echo "Gen ${reportFileName} End" | tee -a ${logFile}
echo "Gen ${reportFileName2} End" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR250171_HGB_UBL_ESDP_UNBILL_Report.sh.org
```text
#!/usr/bin/env bash
########################################################################################
# Program name : SR250171_HGB_UBL_ESDP_UNBILL_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2022/06/22 Create by Mike Kuan
# Description : SR250171_ESDP Migraion估計報表、未實現報表
########################################################################################
# Date : 2022/07/18 Create by Mike Kuan
# Description : 修改檔名月份
########################################################################################
# Date : 2022/11/18 Create by Mike Kuan
# Description : 修改sysd日期，每月產生前月資料
########################################################################################
# Date : 2023/05/02 Create by Mike Kuan
# Description : 修改月份進位從無條件捨去改為小數兩位
########################################################################################
# Date : 2023/04/24 Modify by Mike Kuan
# Description : SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
########################################################################################
# Date : 2024/10/28 Modify by Mike Kuan
# Description : 修改estimate_costs為0
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
#sysd=202303
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
ReportDirBak=$ReportDir/bak
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="ESDP_`date +%Y%m --date="-0 month"`_`date +%Y%m%d%H%M%S`"
reportFileName2="HGB_ESDP_UNBILL2_`date +%Y%m --date="-0 month"`_`date +%Y%m%d%H%M%S`"
utilDir=/cb/BCM/util
ftpProg=${utilDir}/Ftp2Remote.sh
#mailList="keroh@fareastone.com.tw mikekuan@fareastone.com.tw"
mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
putip1=10.64.16.58
putpass1=unix11
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
putip1=10.64.18.122
putpass1=unix11
;;
"pet-hgbap01p"|"pet-hgbap02p") #(PET)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.64.18.123
putpass1=unix11
;;
"idc-hgbap01p"|"idc-hgbap02p") #(PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.68.59.130
putpass1=`/cb/CRYPT/GetPw.sh UBL_UAR_FTP`
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
#FTP
putuser1=ublftp
putpath1=/AR/payment/ARBATCH90/Batch_ESDP_FSS_RPT/DIO_INPUT

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool ${reportFileName}.dat

select 'CUSTOMER_ID'||';'||'SUBSCRIBER_NO'||';'||'ACCOUNT_ID'||';'||'CYCLE_CODE'||';'||'CYCLE_MONTH'||';'||'CYCLE_YEAR'||';'||'BILLINVNUM'||';'||'CHARGE_TYPE'||';'||'CHARGE_CODE'||';'||'CHARGEAMT'||';'||'TAX_AMOUNT'||';'||'TAX_RATE'||';'||'TAX_CODE'||';'||'SERVICE_RECEIVER_TYPE'||';'||'SUBSCRIBER_TYPE'||';'||'CYCLE_ST_DT'||';'||'CYCLE_ED_DT'||';'||'CHARGE_ST_DT'||';'||'CHARGE_ED_DT'||';'||'GUI'||';'||'END_DATE'||';'||'estimate_days'||';'||'estimate_costs' from dual;

--/* Formatted on 2022/07/08 11:21 (Formatter Plus v4.8.8) */
--SELECT bi_seq, charge_org, subscr.cust_id, bi.subscr_id, bi.acct_id, bi.CYCLE,
--       bi.cycle_month, SUBSTR (cntrl.bill_period, 1, 4), mast.bill_nbr,
--       bi.charge_type, bi.charge_code, (bi.amount - bi.tax_amt), bi.tax_amt,
--       DECODE (bi.tax_type, 'TX1', 5, 0) tax_rate, bi.tax_type,
--       bi.service_receiver_type, subscr.subscr_type, cntrl.bill_from_date,
--       cntrl.bill_end_date,
--       TO_CHAR
--          (TO_DATE (DECODE (bi.charge_org,
--                            'RA', REGEXP_SUBSTR
--                                              (bi.dynamic_attribute,
--                                               '.*First_Event_Date=([^#]*).*',
--                                               1,
--                                               1,
--                                               NULL,
--                                               1
--                                              ),
--                            NVL (TO_CHAR (bi.chrg_from_date, 'yyyy/mm/dd'),
--                                 TO_CHAR (cntrl.bill_from_date, 'yyyy/mm/dd')
--                                )
--                           ),
--                    'yyyy/mm/dd'
--                   ),
--           'yyyy/mm/dd'
--          ) chrg_from_date,
--       TO_CHAR
--          (TO_DATE (DECODE (bi.charge_org,
--                            'RA', REGEXP_SUBSTR
--                                               (bi.dynamic_attribute,
--                                                '.*Last_Event_Date=([^#]*).*',
--                                                1,
--                                                1,
--                                                NULL,
--                                                1
--                                               ),
--                            NVL (TO_CHAR (bi.chrg_end_date, 'yyyy/mm/dd'),
--                                 TO_CHAR (cntrl.bill_end_date, 'yyyy/mm/dd')
--                                )
--                           ),
--                    'yyyy/mm/dd'
--                   ),
--           'yyyy/mm/dd'
--          ) chrg_end_date,
--       LINK.elem6, pkg.end_date,
--       CASE
--          WHEN pkg.end_date IS NOT NULL
--             THEN (pkg.end_date - 1 - bi.chrg_end_date)
--          WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)
--               ) IN ('01', '03', '05', '07', '08', '10', '12')
--             THEN 31             ---(bi.chrg_from_date - cntrl.bill_from_date)
--          WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)) IN
--                                                                       ('02')
--             THEN 28             ---(bi.chrg_from_date - cntrl.bill_from_date)
--          ELSE 30                ---(bi.chrg_from_date - cntrl.bill_from_date)
--       END AS estimate_days,
--       ROUND
--          (  (  (bi.amount - bi.tax_amt)
--              / (  TO_DATE
--                      (DECODE (bi.charge_org,
--                               'RA', REGEXP_SUBSTR
--                                               (bi.dynamic_attribute,
--                                                '.*Last_Event_Date=([^#]*).*',
--                                                1,
--                                                1,
--                                                NULL,
--                                                1
--                                               ),
--                               NVL (TO_CHAR (bi.chrg_end_date, 'yyyy/mm/dd'),
--                                    TO_CHAR (cntrl.bill_end_date,
--                                             'yyyy/mm/dd')
--                                   )
--                              ),
--                       'yyyy/mm/dd'
--                      )
--                 - TO_DATE
--                      (DECODE (bi.charge_org,
--                               'RA', REGEXP_SUBSTR
--                                              (bi.dynamic_attribute,
--                                               '.*First_Event_Date=([^#]*).*',
--                                               1,
--                                               1,
--                                               NULL,
--                                               1
--                                              ),
--                               NVL (TO_CHAR (bi.chrg_from_date, 'yyyy/mm/dd'),
--                                    TO_CHAR (cntrl.bill_from_date,
--                                             'yyyy/mm/dd'
--                                            )
--                                   )
--                              ),
--                       'yyyy/mm/dd'
--                      )
--                 + 1
--                )          --* (cntrl.bill_end_date - cntrl.bill_end_date + 1)
--             )
--           * CASE
--                WHEN pkg.end_date IS NOT NULL
--                   THEN (pkg.end_date - 1 - bi.chrg_end_date)
--                WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)
--                     ) IN ('01', '03', '05', '07', '08', '10', '12')
--                   THEN 31       ---(bi.chrg_from_date - cntrl.bill_from_date)
--                WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)
--                     ) IN ('02')
--                   THEN 28       ---(bi.chrg_from_date - cntrl.bill_from_date)
--                ELSE 30          ---(bi.chrg_from_date - cntrl.bill_from_date)
--             END
--          ) estimate_costs
--  FROM fy_tb_bl_bill_bi bi,
--       fy_tb_bl_acct_pkg pkg,
--       fy_tb_bl_bill_mast mast,
--       fy_tb_cm_subscr subscr,
--       fy_tb_bl_bill_cntrl cntrl,
--       (SELECT entity_id, elem6
--          FROM fy_tb_cm_prof_link
--         WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
--                                                                           --and elem5=2
--       ) LINK
-- WHERE bi.bill_seq = cntrl.bill_seq
--   AND bi.bill_seq = mast.bill_seq
--   AND bi.CYCLE = cntrl.CYCLE
--   AND bi.CYCLE = mast.CYCLE
--   AND bi.acct_id = mast.acct_id
--   AND bi.acct_id = pkg.acct_id(+)
--   AND bi.acct_id = subscr.acct_id
--   AND bi.acct_id = LINK.entity_id
--   AND bi.subscr_id = subscr.subscr_id
--   AND bi.subscr_id = pkg.offer_level_id(+)
--   AND bi.offer_id = pkg.offer_id(+)
--   AND bi.offer_seq = pkg.offer_seq(+)
--   AND cntrl.bill_period = 202205
--   AND cntrl.CYCLE = 10
--   --and bi.BILL_SEQ=150053
--   AND bi.charge_org NOT IN ('IN', 'NN')
--   AND NVL (bi.chrg_end_date, cntrl.bill_end_date) <= cntrl.bill_end_date;

/* Formatted on 2022/07/08 11:20 (Formatter Plus v4.8.8) */
SELECT    subscr.cust_id
       || ';'
       || bi.subscr_id
       || ';'
       || bi.acct_id
       || ';'
       || bi.CYCLE
       || ';'
       || bi.cycle_month
       || ';'
       || SUBSTR (cntrl.bill_period, 1, 4)
       || ';'
       || mast.bill_nbr
       || ';'
       || bi.charge_type
       || ';'
       || bi.charge_code
       || ';'
       || (bi.amount - bi.tax_amt)
       || ';'
       || bi.tax_amt
       || ';'
       || DECODE (bi.tax_type, 'TX1', 5, 0)
       || ';'
       || bi.tax_type
       || ';'
       || bi.service_receiver_type
       || ';'
       || subscr.subscr_type
       || ';'
       || TO_CHAR (cntrl.bill_from_date, 'YYYY/MM/DD')
       || ';'
       || TO_CHAR (cntrl.bill_end_date, 'YYYY/MM/DD')
       || ';'
       || TO_CHAR
             (TO_DATE
                     (DECODE (bi.charge_org,
                              'RA', REGEXP_SUBSTR
                                              (bi.dynamic_attribute,
                                               '.*First_Event_Date=([^#]*).*',
                                               1,
                                               1,
                                               NULL,
                                               1
                                              ),
                              NVL (TO_CHAR (bi.chrg_from_date, 'yyyy/mm/dd'),
                                   TO_CHAR (cntrl.bill_from_date,
                                            'yyyy/mm/dd')
                                  )
                             ),
                      'yyyy/mm/dd'
                     ),
              'yyyy/mm/dd'
             )
       || ';'
       || TO_CHAR
             (TO_DATE (DECODE (bi.charge_org,
                               'RA', REGEXP_SUBSTR
                                               (bi.dynamic_attribute,
                                                '.*Last_Event_Date=([^#]*).*',
                                                1,
                                                1,
                                                NULL,
                                                1
                                               ),
                               NVL (TO_CHAR (bi.chrg_end_date, 'yyyy/mm/dd'),
                                    TO_CHAR (cntrl.bill_end_date,
                                             'yyyy/mm/dd')
                                   )
                              ),
                       'yyyy/mm/dd'
                      ),
              'yyyy/mm/dd'
             )
       || ';'
       || LINK.elem6
       || ';'
       || TO_CHAR (pkg.end_date, 'YYYY/MM/DD')
       || ';'
       || CASE
             WHEN pkg.end_date IS NOT NULL
                THEN (pkg.end_date - 1 - bi.chrg_end_date)
             WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)) IN
                                   ('01', '03', '05', '07', '08', '10', '12')
                THEN 31          ---(bi.chrg_from_date - cntrl.bill_from_date)
             WHEN (SUBSTR (TO_CHAR (cntrl.bill_end_date, 'yyyymmdd'), 5, 2)) IN
                                                                       ('02')
                THEN 28          ---(bi.chrg_from_date - cntrl.bill_from_date)
             ELSE 30             ---(bi.chrg_from_date - cntrl.bill_from_date)
          END
       || ';'
       || 0
  FROM fy_tb_bl_bill_bi bi,
       fy_tb_bl_acct_pkg pkg,
       fy_tb_bl_bill_mast mast,
       fy_tb_cm_subscr subscr,
       fy_tb_bl_bill_cntrl cntrl,
       (SELECT entity_id, elem6
          FROM fy_tb_cm_prof_link
         WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
                                                                           --and elem5=2
       ) LINK
 WHERE bi.bill_seq = cntrl.bill_seq
   AND bi.bill_seq = mast.bill_seq
   AND bi.CYCLE = cntrl.CYCLE
   AND bi.CYCLE = mast.CYCLE
   AND bi.acct_id = mast.acct_id
   AND bi.acct_id = pkg.acct_id(+)
   AND bi.acct_id = subscr.acct_id
   AND bi.acct_id = LINK.entity_id
   AND bi.subscr_id = subscr.subscr_id
   AND bi.subscr_id = pkg.offer_level_id(+)
   AND bi.offer_id = pkg.offer_id(+)
   AND bi.offer_seq = pkg.offer_seq(+)
   AND cntrl.bill_period = ${sysd}
   AND cntrl.CYCLE IN (10, 15, 20) --SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
   --and bi.BILL_SEQ=150053
   AND bi.charge_org NOT IN ('IN', 'NN')
   AND NVL (bi.chrg_end_date, cntrl.bill_end_date) <= cntrl.bill_end_date;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function genReport2
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool ${reportFileName2}.dat

select 'CUSTOMER_ID'||';'||'SUBSCRIBER_NO'||';'||'ACCOUNT_ID'||';'||'CYCLE_CODE'||';'||'CYCLE_MONTH'||';'||'CYCLE_YEAR'||';'||'BILLINVNUM'||';'||'CHARGE_TYPE'||';'||'CHARGE_CODE'||';'||'CHARGEAMT'||';'||'TAX_AMOUNT'||';'||'TAX_RATE'||';'||'TAX_CODE'||';'||'SERVICE_RECEIVER_TYPE'||';'||'SUBSCRIBER_TYPE'||';'||'CYCLE_ST_DT'||';'||'CYCLE_ED_DT'||';'||'CHARGE_ST_DT'||';'||'CHARGE_ED_DT'||';'||'GUI'||';'||'END_DATE'||';'||'months_diff'||';'||'months_diff2'||';'||'months_diff3'||';'||'m1'||';'||'m2' from dual;

--/* Formatted on 2022/06/23 14:52 (Formatter Plus v4.8.8) */
--SELECT subscr.cust_id, bi.subscr_id, bi.acct_id, bi.CYCLE, bi.cycle_month,
--       SUBSTR (cntrl.bill_period, 1, 4), mast.bill_nbr, bi.charge_type,
--       bi.charge_code, (bi.amount - bi.tax_amt), bi.tax_amt,
--       DECODE (bi.tax_type, 'TX1', 5, 0) tax_rate, bi.tax_type,
--       bi.service_receiver_type, subscr.subscr_type, cntrl.bill_from_date,
--       cntrl.bill_end_date, bi.chrg_from_date, bi.chrg_end_date, LINK.elem6,
--       pkg.end_date,
--       CASE
--          WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--               ) >= 0.5
--             THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                           bi.chrg_from_date)
--                          )
--                  + 1
--          ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--       END AS months_diff,
--       CASE
--          WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                  bi.chrg_from_date
--                                 )
--                - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                         bi.chrg_from_date
--                                        )
--                        )
--               ) >= 0.5
--             THEN   TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                           bi.chrg_from_date
--                                          )
--                          )
--                  + 1
--          ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                      bi.chrg_from_date
--                                     )
--                     )
--       END AS months_diff2,
--       (  CASE
--             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                              bi.chrg_from_date
--                                             )
--                             )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--          END
--        - CASE
--             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                     bi.chrg_from_date
--                                    )
--                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                        1),
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC
--                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                         1
--                                                        ),
--                                             bi.chrg_from_date
--                                            )
--                            )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                         bi.chrg_from_date
--                                        )
--                        )
--          END
--       ) AS months_diff3,
--       ROUND
--          (  (bi.amount - bi.tax_amt)
--           / CASE
--                WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                      - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                               bi.chrg_from_date
--                                              )
--                              )
--                     ) >= 0.5
--                   THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                                 bi.chrg_from_date
--                                                )
--                                )
--                        + 1
--                ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--             END
--          ) m1,
--       ROUND
--          (  (bi.amount - bi.tax_amt)
--           / CASE
--                WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                      - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                               bi.chrg_from_date
--                                              )
--                              )
--                     ) >= 0.5
--                   THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                                 bi.chrg_from_date
--                                                )
--                                )
--                        + 1
--                ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--             END
--          )
--           *        (  CASE
--             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
--                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
--                                              bi.chrg_from_date
--                                             )
--                             )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
--          END
--        - CASE
--             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                     bi.chrg_from_date
--                                    )
--                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                        1),
--                                            bi.chrg_from_date
--                                           )
--                           )
--                  ) >= 0.5
--                THEN   TRUNC
--                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
--                                                         1
--                                                        ),
--                                             bi.chrg_from_date
--                                            )
--                            )
--                     + 1
--             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
--                                         bi.chrg_from_date
--                                        )
--                        )
--          END
--       ) m2
--  FROM fy_tb_bl_bill_bi bi,
--       fy_tb_bl_acct_pkg pkg,
--       fy_tb_bl_bill_mast mast,
--       fy_tb_cm_subscr subscr,
--       fy_tb_bl_bill_cntrl cntrl,
--       (SELECT entity_id, elem6
--          FROM fy_tb_cm_prof_link
--         WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
--                                                                           --and elem5=2
--       ) LINK
-- WHERE bi.bill_seq = cntrl.bill_seq
--   AND bi.bill_seq = mast.bill_seq
--   AND bi.CYCLE = cntrl.CYCLE
--   AND bi.CYCLE = mast.CYCLE
--   AND bi.acct_id = mast.acct_id
--   AND bi.acct_id = pkg.acct_id(+)
--   AND bi.acct_id = subscr.acct_id
--   AND bi.acct_id = LINK.entity_id
--   AND bi.subscr_id = subscr.subscr_id
--   AND bi.subscr_id = pkg.offer_level_id(+)
--   AND bi.offer_id = pkg.offer_id(+)
--   AND bi.offer_seq = pkg.offer_seq(+)
--   AND cntrl.bill_period = 202005
--   AND cntrl.CYCLE = 10
--   --and bi.BILL_SEQ=150053
--   AND bi.charge_org NOT IN ('IN', 'NN')
--   AND NVL (bi.chrg_end_date, cntrl.bill_end_date) > cntrl.bill_end_date;

/* Formatted on 2022/06/23 14:52 (Formatter Plus v4.8.8) */
SELECT subscr.cust_id||';'||bi.subscr_id||';'||bi.acct_id||';'||bi.CYCLE||';'||bi.cycle_month||';'||
       SUBSTR (cntrl.bill_period, 1, 4)||';'||mast.bill_nbr||';'||bi.charge_type||';'||
       bi.charge_code||';'||(bi.amount - bi.tax_amt)||';'||bi.tax_amt||';'||
       DECODE (bi.tax_type, 'TX1', 5, 0)||';'||bi.tax_type||';'||
       bi.service_receiver_type||';'||subscr.subscr_type||';'||TO_CHAR (cntrl.bill_from_date, 'YYYY/MM/DD')||';'||
       TO_CHAR (cntrl.bill_end_date, 'YYYY/MM/DD')||';'||TO_CHAR (bi.chrg_from_date, 'YYYY/MM/DD')||';'||TO_CHAR (bi.chrg_end_date, 'YYYY/MM/DD')||';'||LINK.elem6||';'||
       TO_CHAR (pkg.end_date, 'YYYY/MM/DD')||';'||
       CASE
          WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
               ) >= 0.5
             THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                           bi.chrg_from_date)
                          )
                  + 1
          ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
       END||';'||
       CASE
          WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                  bi.chrg_from_date
                                 )
                - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                         bi.chrg_from_date
                                        )
                        )
               ) >= 0.5
             THEN   TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                           bi.chrg_from_date
                                          )
                          )
                  + 1
          ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                      bi.chrg_from_date
                                     )
                     )
       END||';'||
       decode(sign(  CASE
             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                              bi.chrg_from_date
                                             )
                             )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
          END
        - CASE
             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                     bi.chrg_from_date
                                    )
                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                        1),
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC
                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                         1
                                                        ),
                                             bi.chrg_from_date
                                            )
                            )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                         bi.chrg_from_date
                                        )
                        )
          END
       ),1,(  CASE
             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                              bi.chrg_from_date
                                             )
                             )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
          END
        - CASE
             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                     bi.chrg_from_date
                                    )
                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                        1),
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC
                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                         1
                                                        ),
                                             bi.chrg_from_date
                                            )
                            )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                         bi.chrg_from_date
                                        )
                        )
          END
       ),0)||';'||
       decode(sign(decode(sign(  CASE
             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                              bi.chrg_from_date
                                             )
                             )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
          END
        - CASE
             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                     bi.chrg_from_date
                                    )
                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                        1),
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC
                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                         1
                                                        ),
                                             bi.chrg_from_date
                                            )
                            )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                         bi.chrg_from_date
                                        )
                        )
          END
       ),1,(  CASE
             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                              bi.chrg_from_date
                                             )
                             )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
          END
        - CASE
             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                     bi.chrg_from_date
                                    )
                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                        1),
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC
                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                         1
                                                        ),
                                             bi.chrg_from_date
                                            )
                            )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                         bi.chrg_from_date
                                        )
                        )
          END
       ),0)),0,ROUND((bi.amount - bi.tax_amt),0),ROUND
          (  (bi.amount - bi.tax_amt)
           / CASE
                WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                      - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                               bi.chrg_from_date
                                              )
                              )
                     ) >= 0.5
                   THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                                 bi.chrg_from_date
                                                )
                                )
                        + 1
                ELSE ROUND (MONTHS_BETWEEN (bi.chrg_end_date,
                                            bi.chrg_from_date
                                           )
                           ,2)
             END
          ))||';'||
       ROUND(ROUND
          (  (bi.amount - bi.tax_amt)
           / CASE
                WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                      - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                               bi.chrg_from_date
                                              )
                              )
                     ) >= 0.5
                   THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                                 bi.chrg_from_date
                                                )
                                )
                        + 1
                ELSE ROUND (MONTHS_BETWEEN (bi.chrg_end_date,
                                            bi.chrg_from_date
                                           )
                           ,2)
             END
          )
           *        decode(sign(  CASE
             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                              bi.chrg_from_date
                                             )
                             )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
          END
        - CASE
             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                     bi.chrg_from_date
                                    )
                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                        1),
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC
                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                         1
                                                        ),
                                             bi.chrg_from_date
                                            )
                            )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                         bi.chrg_from_date
                                        )
                        )
          END
       ),1,(  CASE
             WHEN (  MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date)
                   - TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC (MONTHS_BETWEEN (bi.chrg_end_date,
                                              bi.chrg_from_date
                                             )
                             )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (bi.chrg_end_date, bi.chrg_from_date))
          END
        - CASE
             WHEN (  MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                     bi.chrg_from_date
                                    )
                   - TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                        1),
                                            bi.chrg_from_date
                                           )
                           )
                  ) >= 0.5
                THEN   TRUNC
                            (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date,
                                                         1
                                                        ),
                                             bi.chrg_from_date
                                            )
                            )
                     + 1
             ELSE TRUNC (MONTHS_BETWEEN (ADD_MONTHS (cntrl.bill_end_date, 1),
                                         bi.chrg_from_date
                                        )
                        )
          END
       ),0),0)
  FROM fy_tb_bl_bill_bi bi,
       fy_tb_bl_acct_pkg pkg,
       fy_tb_bl_bill_mast mast,
       fy_tb_cm_subscr subscr,
       fy_tb_bl_bill_cntrl cntrl,
       (SELECT entity_id, elem6
          FROM fy_tb_cm_prof_link
         WHERE entity_type = 'A' AND link_type = 'A' AND prof_type = 'NAME'
                                                                           --and elem5=2
       ) LINK
 WHERE bi.bill_seq = cntrl.bill_seq
   AND bi.bill_seq = mast.bill_seq
   AND bi.CYCLE = cntrl.CYCLE
   AND bi.CYCLE = mast.CYCLE
   AND bi.acct_id = mast.acct_id
   AND bi.acct_id = pkg.acct_id(+)
   AND bi.acct_id = subscr.acct_id
   AND bi.acct_id = LINK.entity_id
   AND bi.subscr_id = subscr.subscr_id
   AND bi.subscr_id = pkg.offer_level_id(+)
   AND bi.offer_id = pkg.offer_id(+)
   AND bi.offer_seq = pkg.offer_seq(+)
   AND cntrl.bill_period = ${sysd}
   AND cntrl.CYCLE IN (10, 15, 20) --SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
   --and bi.BILL_SEQ=150053
   AND bi.charge_org NOT IN ('IN', 'NN')
   AND NVL (bi.chrg_end_date, cntrl.bill_end_date) > cntrl.bill_end_date;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function ftpReport2
{
ftp -i -n -v $1<<EOF
user $2 $3
pass
cd $4
mput $5
bye
EOF
}

function formatterReport
{
grep -v '^$' ${reportFileName}.dat > ${ReportDir}/${reportFileName}.csv
rm ${reportFileName}.dat
sleep 5
grep -v '^$' ${reportFileName2}.dat > ${ReportDir}/${reportFileName2}.csv
rm ${reportFileName2}.dat
}

function sendFinalMail
{
send_msg="<SR250171_HGB_ESDP_UNBILL_Report> $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${ReportDirBak}/${reportFileName}.csv ${mailList} <<EOF
Dears,

   SR250171_HGB_ESDP_UNBILL_Report已產出。
   檔名：
   ${reportFileName}.csv
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF

send_msg="<SR250171_HGB_ESDP_UNBILL2_Report> $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${ReportDirBak}/${reportFileName2}.csv ${mailList} <<EOF
Dears,

   SR250171_HGB_ESDP_UNBILL2_Report已產出。
   檔名：
   ${reportFileName2}.csv
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

function sendGenTempErrorMail
{
send_msg="<SR250171_HGB_ESDP_UNBILL_Report> $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR250171_HGB_ESDP_UNBILL_Report未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF

send_msg="<SR250171_HGB_ESDP_UNBILL2_Report> $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR250171_HGB_ESDP_UNBILL2_Report未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName} Start" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}
cd $ReportDir
genReport
sleep 5
echo "Gen ${reportFileName2} Start" | tee -a ${logFile}
genReport2
sleep 5
#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}


#check gen report
filecnt1=`ls ${ReportDir}/${reportFileName}.csv|wc -l`
sleep 5
if [[ (${filecnt1} = 0 ) ]] ; then
	echo "${progName} Generated Report Have Abnormal"|tee -a ${logFile}
	sendGenTempErrorMail
	exit 0
else
cd ${ReportDir}
	echo "FTP Report"|tee -a ${logFile}
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName}.csv 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName}.csv 0
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName2}.csv 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName2}.csv 0
	
		#cd ${ReportDir}
	#ftpReport2 ${putip1} ${putuser1} ${putpass1} ${putpath1} "${reportFileName}.txt"
		
	echo "send SR250171_HGB_ESDP_UNBILL_Report"|tee -a ${logFile}

	echo "Move Report TO Bak"|tee -a ${logFile}
	mv "${reportFileName}.csv" ${ReportDirBak}
	mv "${reportFileName2}.csv" ${ReportDirBak}
	#send final mail
	sendFinalMail
fi
sleep 5

echo "Gen ${reportFileName} End" | tee -a ${logFile}
echo "Gen ${reportFileName2} End" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR259699_FSS_RPT_Non-monthlyPayment_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR259699_ESDP_FSS_RPT_Non-monthlyPayment_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2023/02/24 Create by Mike Kuan
# Description : SR259699_ESDP Migration非月繳續約報表
########################################################################################
# Date : 2023/04/18 Modify by Mike Kuan
# Description : SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
ReportDirBak=$ReportDir/bak
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="FSS_RPT_Non-monthlyPayment_`date +%Y%m --date="-0 month"`_`date +%Y%m%d%H%M%S`"
utilDir=/cb/BCM/util
ftpProg=${utilDir}/Ftp2Remote.sh
#mailList="keroh@fareastone.com.tw mikekuan@fareastone.com.tw"
mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
putip1=10.64.16.58
putpass1=unix11
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
putip1=10.64.18.122
putpass1=unix11
;;
"pet-hgbap01p"|"pet-hgbap02p") #(PET)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.64.18.123
putpass1=unix11
;;
"idc-hgbap01p"|"idc-hgbap02p") #(PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.68.59.130
putpass1=`/cb/CRYPT/GetPw.sh UBL_UAR_FTP`
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
#FTP
putuser1=ublftp
putpath1=/AR/payment/ARBATCH90/Batch_ESDP_FSS_RPT/DIO_INPUT

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool ${reportFileName}.dat

select 'ACCOUNT_ID'||';'||'SUBSCRIBER_NO'||';'||'SUBSCRIBER_TYPE'||';'||'CHARGE_CODE'||';'||'CHARGE_TYPE'||';'||'REVENUE_CODE'||';'||'EFF_DATE'||';'||'END_DATE'||';'||'BILL_END_DATE'||';'||'BILL_AMOUNT'||';'||'ACCRUAL'||';'||'MONTHLY_AMOUNT' from dual;

--SELECT   a.acct_id "ACCOUNT_ID", a.offer_level_id "SUBSCRIBER_NO", cs.subscr_type "SUBSCRIBER_TYPE", rc_charge.charge_code, 'DBT' "CHARGE_TYPE", rc_charge.dscr "ChargeCodeDesc", a.pkg_type_dtl "REVENUE_CODE", cpl.elem2 "AcctName",
--         TO_CHAR (a.eff_date, 'YYYY/MM/DD') "EFF_DATE",TO_CHAR (a.end_date, 'YYYY/MM/DD') "END_DATE", TO_CHAR (add_months(a.eff_date,12)-1, 'YYYY/MM/DD') "BILL_END_DATE",
--         decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
--         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0) "BILL_AMOUNT",
--         DECODE(SIGN(nvl(a.end_date,a.eff_date) - a.eff_date - 15), -1, 'Y', 'N') "ACCRUAL",
--         round(decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
--         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0)/12,0) "MONTHLY_AMOUNT"
--    FROM fy_tb_bl_acct_pkg a, fy_Tb_pbk_package_rc prc,fy_tb_pbk_offer offer,fy_tb_bl_bill_cntrl cntrl, fy_Tb_cm_prof_link cpl, fy_tb_cm_subscr cs,
--         (SELECT *
--            FROM fy_tb_bl_offer_param
--           WHERE param_name LIKE 'RC_RATE1%') rc_rate,
--         (SELECT *
--            FROM fy_tb_bl_offer_param
--           WHERE param_name = 'DEVICE_COUNT') device_count,
--         (SELECT rc.frequency, rc.pkg_id, rc.rate1, code.charge_code, code.dscr
--            FROM fy_tb_pbk_package_rc rc, fy_tb_pbk_charge_code code
--           WHERE rc.charge_code = code.charge_code) rc_charge
--   WHERE   cntrl.bill_period = ${sysd} --202302
--   AND cntrl.CYCLE in (10, 15, 20) --SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
--   and a.eff_date >= cntrl.bill_from_date --to_date(20230201,'yyyymmdd')
--   and a.eff_date <= cntrl.bill_end_date --to_date(20230228,'yyyymmdd')
--   and a.cur_billed is null
--   and a.first_bill_date is null
--   and a.future_exp_date >= add_months(a.eff_date,12)
--   and add_months(a.future_exp_date,-12) > a.eff_date
--   --and a.end_rsn != 'DFC'
--   --and offer.offer_type != 'PP'
--   and prc.payment_timing='D'
--     AND a.acct_id = rc_rate.acct_id(+)
--     AND a.offer_instance_id = rc_rate.offer_instance_id(+)
--     AND a.acct_id = device_count.acct_id(+)
--     AND a.offer_instance_id = device_count.offer_instance_id(+)
--     AND a.pkg_id = rc_charge.pkg_id(+)
--     and a.pkg_id = prc.pkg_id
--     and a.offer_id=offer.offer_id
--     and a.acct_id = cpl.entity_id
--     and a.offer_level_id = cs.subscr_id
--     and cpl.entity_type='A'
--     and cpl.prof_type='NAME'
--     and cpl.link_type='A'
--union all
--SELECT   a.acct_id "ACCOUNT_ID", a.offer_level_id "SUBSCRIBER_NO", cs.subscr_type "SUBSCRIBER_TYPE", rc_charge.charge_code, 'DBT' "CHARGE_TYPE", rc_charge.dscr "ChargeCodeDesc", a.pkg_type_dtl "REVENUE_CODE", cpl.elem2 "AcctName",
--         TO_CHAR (a.eff_date, 'YYYY/MM/DD') "EFF_DATE",TO_CHAR (a.end_date, 'YYYY/MM/DD') "END_DATE", TO_CHAR (add_months(a.eff_date,12)-1, 'YYYY/MM/DD') "BILL_END_DATE",
--         decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
--         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0) "BILL_AMOUNT",
--         DECODE(SIGN(nvl(a.end_date,a.eff_date) - a.eff_date - 15), -1, 'Y', 'N') "ACCRUAL",
--         round(decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
--         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0)/12,0) "MONTHLY_AMOUNT"
--    FROM fy_tb_bl_acct_pkg a, fy_Tb_pbk_package_rc prc,fy_tb_pbk_offer offer,fy_tb_bl_bill_cntrl cntrl, fy_Tb_cm_prof_link cpl, fy_tb_cm_subscr cs,
--         (SELECT *
--            FROM fy_tb_bl_offer_param
--           WHERE param_name LIKE 'RC_RATE1%') rc_rate,
--         (SELECT *
--            FROM fy_tb_bl_offer_param
--           WHERE param_name = 'DEVICE_COUNT') device_count,
--         (SELECT rc.frequency, rc.pkg_id, rc.rate1, code.charge_code, code.dscr
--            FROM fy_tb_pbk_package_rc rc, fy_tb_pbk_charge_code code
--           WHERE rc.charge_code = code.charge_code) rc_charge
--   WHERE   cntrl.bill_period = ${sysd} --202302
--   AND cntrl.CYCLE in (10, 15, 20) --SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
--   and a.eff_date < cntrl.bill_from_date --to_date(20230201,'yyyymmdd')
--   --and a.eff_date <= cntrl.bill_end_date --to_date(20230228,'yyyymmdd')
--   and a.cur_billed between to_date(20230201,'yyyymmdd') and to_date(20230228,'yyyymmdd')
--   and a.first_bill_date is not null
--   and a.future_exp_date >= add_months(a.eff_date,12)
--   and add_months(a.future_exp_date,-12) > a.eff_date
--   --and a.end_rsn != 'DFC'
--   --and offer.offer_type != 'PP'
--   and prc.payment_timing='D'
--     AND a.acct_id = rc_rate.acct_id(+)
--     AND a.offer_instance_id = rc_rate.offer_instance_id(+)
--     AND a.acct_id = device_count.acct_id(+)
--     AND a.offer_instance_id = device_count.offer_instance_id(+)
--     AND a.pkg_id = rc_charge.pkg_id(+)
--     and a.pkg_id = prc.pkg_id
--     and a.offer_id=offer.offer_id
--     and a.acct_id = cpl.entity_id
--	 and a.offer_level_id = cs.subscr_id
--     and cpl.entity_type='A'
--     and cpl.prof_type='NAME'
--     and cpl.link_type='A';

SELECT   a.acct_id|| ';' ||a.offer_level_id|| ';' ||cs.subscr_type|| ';' ||rc_charge.charge_code|| ';' ||'DBT'|| ';' ||a.pkg_type_dtl|| ';' ||TO_CHAR (a.eff_date, 'YYYY/MM/DD')|| ';' ||TO_CHAR (a.end_date, 'YYYY/MM/DD')|| ';' ||TO_CHAR (add_months(a.eff_date,12)-1, 'YYYY/MM/DD')|| ';' ||
         decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0)|| ';' ||
         DECODE(SIGN(nvl(a.end_date,a.eff_date) - a.eff_date - 15), -1, 'Y', 'N')|| ';' ||
         round(decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0)/12,0)
    FROM fy_tb_bl_acct_pkg a, fy_Tb_pbk_package_rc prc,fy_tb_pbk_offer offer,fy_tb_bl_bill_cntrl cntrl, fy_Tb_cm_prof_link cpl, fy_tb_cm_subscr cs,
         (SELECT *
            FROM fy_tb_bl_offer_param
           WHERE param_name LIKE 'RC_RATE1%') rc_rate,
         (SELECT *
            FROM fy_tb_bl_offer_param
           WHERE param_name = 'DEVICE_COUNT') device_count,
         (SELECT rc.frequency, rc.pkg_id, rc.rate1, code.charge_code, code.dscr
            FROM fy_tb_pbk_package_rc rc, fy_tb_pbk_charge_code code
           WHERE rc.charge_code = code.charge_code) rc_charge
   WHERE   cntrl.bill_period = ${sysd} --202301
   AND cntrl.CYCLE in (10, 15, 20) --SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
   and a.eff_date >= cntrl.bill_from_date --to_date(20230201,'yyyymmdd')
   and a.eff_date <= cntrl.bill_end_date --to_date(20230228,'yyyymmdd')
   and a.cur_billed is null
   and a.first_bill_date is null
   and a.future_exp_date >= add_months(a.eff_date,12)
   and add_months(a.future_exp_date,-12) > a.eff_date
   --and a.end_rsn != 'DFC'
   --and offer.offer_type != 'PP'
   and prc.payment_timing='D'
     AND a.acct_id = rc_rate.acct_id(+)
     AND a.offer_instance_id = rc_rate.offer_instance_id(+)
     AND a.acct_id = device_count.acct_id(+)
     AND a.offer_instance_id = device_count.offer_instance_id(+)
     AND a.pkg_id = rc_charge.pkg_id(+)
     and a.pkg_id = prc.pkg_id
     and a.offer_id=offer.offer_id
     and a.acct_id = cpl.entity_id
     and a.offer_level_id = cs.subscr_id
     and cpl.entity_type='A'
     and cpl.prof_type='NAME'
     and cpl.link_type='A' 
union all
SELECT   a.acct_id|| ';' ||a.offer_level_id|| ';' ||cs.subscr_type|| ';' ||rc_charge.charge_code|| ';' ||'DBT'|| ';' ||a.pkg_type_dtl|| ';' ||TO_CHAR (a.eff_date, 'YYYY/MM/DD')|| ';' ||TO_CHAR (a.end_date, 'YYYY/MM/DD')|| ';' ||TO_CHAR (add_months(a.eff_date,12)-1, 'YYYY/MM/DD')|| ';' ||
         decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0)|| ';' ||
         DECODE(SIGN(nvl(a.end_date,a.eff_date) - a.eff_date - 15), -1, 'Y', 'N')|| ';' ||
         round(decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0)/12,0)
    FROM fy_tb_bl_acct_pkg a, fy_Tb_pbk_package_rc prc,fy_tb_pbk_offer offer,fy_tb_bl_bill_cntrl cntrl, fy_Tb_cm_prof_link cpl, fy_tb_cm_subscr cs,
         (SELECT *
            FROM fy_tb_bl_offer_param
           WHERE param_name LIKE 'RC_RATE1%') rc_rate,
         (SELECT *
            FROM fy_tb_bl_offer_param
           WHERE param_name = 'DEVICE_COUNT') device_count,
         (SELECT rc.frequency, rc.pkg_id, rc.rate1, code.charge_code, code.dscr
            FROM fy_tb_pbk_package_rc rc, fy_tb_pbk_charge_code code
           WHERE rc.charge_code = code.charge_code) rc_charge
   WHERE   cntrl.bill_period = ${sysd} --202301
   AND cntrl.CYCLE in (10, 15, 20) --SR260229_Project-M Fixed line Phase I_新增CYCLE(15,20)
   and a.eff_date < cntrl.bill_from_date --to_date(20230201,'yyyymmdd')
   --and a.eff_date <= cntrl.bill_end_date --to_date(20230228,'yyyymmdd')
   and a.cur_billed between cntrl.bill_from_date and cntrl.bill_end_date --to_date(20230201,'yyyymmdd') and to_date(20230228,'yyyymmdd')
   and a.first_bill_date is not null
   and a.future_exp_date >= add_months(a.eff_date,12)
   and add_months(a.future_exp_date,-12) > a.eff_date
   --and a.end_rsn != 'DFC'
   --and offer.offer_type != 'PP'
   and prc.payment_timing='D'
     AND a.acct_id = rc_rate.acct_id(+)
     AND a.offer_instance_id = rc_rate.offer_instance_id(+)
     AND a.acct_id = device_count.acct_id(+)
     AND a.offer_instance_id = device_count.offer_instance_id(+)
     AND a.pkg_id = rc_charge.pkg_id(+)
     and a.pkg_id = prc.pkg_id
     and a.offer_id=offer.offer_id
     and a.acct_id = cpl.entity_id
	 and a.offer_level_id = cs.subscr_id
     and cpl.entity_type='A'
     and cpl.prof_type='NAME'
     and cpl.link_type='A';

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function formatterReport
{
iconv -f utf8 -t big5 -c ${reportFileName}.dat > ${reportFileName}.big5
mv ${reportFileName}.big5 ${reportFileName}.dat
grep -v '^$' ${reportFileName}.dat > ${ReportDir}/${reportFileName}.csv
rm ${reportFileName}.dat

#iconv -f utf8 -t big5 -c ${ReportDir}/${reportFileName}.csv > ${ReportDir}/${reportFileName}.big5
}

function sendFinalMail
{
send_msg="<SR259699_FSS_RPT_Non-monthlyPayment_Report> $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${ReportDirBak}/${reportFileName}.csv ${mailList} <<EOF
Dears,

   SR259699_FSS_RPT_Non-monthlyPayment_Report已產出。
   檔名：
   ${reportFileName}.csv
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

function sendGenTempErrorMail
{
send_msg="<SR259699_FSS_RPT_Non-monthlyPayment_Report> $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR259699_FSS_RPT_Non-monthlyPayment_Report未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName} Start" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}
cd $ReportDir
genReport
sleep 5
#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}


#check gen report
filecnt1=`ls ${ReportDir}/${reportFileName}.csv|wc -l`
sleep 5
if [[ (${filecnt1} = 0 ) ]] ; then
	echo "${progName} Generated Report Have Abnormal"|tee -a ${logFile}
	sendGenTempErrorMail
	exit 0
else
cd ${ReportDir}
	echo "FTP Report"|tee -a ${logFile}
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName}.csv 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName}.csv 0
	
		#cd ${ReportDir}
	#ftpReport2 ${putip1} ${putuser1} ${putpass1} ${putpath1} "${reportFileName}.txt"
		
	echo "send SR259699_FSS_RPT_Non-monthlyPayment_Report"|tee -a ${logFile}

	echo "Move Report TO Bak"|tee -a ${logFile}
	mv "${reportFileName}.csv" ${ReportDirBak}
	#send final mail
	sendFinalMail
fi
sleep 5

echo "Gen ${reportFileName} End" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR260229_HGBN_ACT-014_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR260229_HGBN_ACT-014_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2023/05/09 Created by Mike Kuan
# Description : SR260229_Project-M Fixed line Phase I_ACT-014_新增線路明細
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="SR260229_HGBN_ACT-014_Report"
#mailList="emmachuang@fareastone.com.tw mikekuan@fareastone.com.tw"
mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${tempFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool SR260229_HGBN_ACT-014_Report.dat

select 'OFFER_SEQ'||','||'BI_SEQ'||','||'用戶名稱'||','||'用戶帳號'||','||'ACCOUNT_NO'||','||'帳單號碼'||','||'帳單日期'||','||'繳款截止日'||','||'服務號碼'||','||'服務項目'||','||'服務啟用日期'||','||'CHARGE_TYPE'||','||'CHARGE_ORG'||','||'CHARGE_AMT'||','||'帳單金額(含稅)' from dual;

/* Formatted on 2023/05/08 13:43 (Formatter Plus v4.8.8) */
--SELECT   distinct so.offer_seq, bi.bi_seq, g.bill_seq, e.elem2 AS "用戶名稱",
--         c.subscr_id AS "用戶帳號", g.acct_id "ACCOUNT_NO",
--         g.bill_nbr "帳單號碼", a.bill_date "帳單日期",
--         g.due_date "繳款截止日",
--                                 TO_CHAR (d.resource_value) AS "服務號碼",
--         bi.charge_descr "服務項目", so.eff_date "服務啟用日期", bi.charge_type "CHARGE_TYPE",decode(bi.charge_org,'RA','UC','CC','RC','DE') CHARGE_ORG,
--         bi.amount "CHARGE_AMT",
--         g.tot_amt AS "帳單金額(含稅)"
--    FROM fy_tb_bl_bill_cntrl a,
--         fy_tb_cm_subscr c,
--         fy_tb_cm_resource d,
--         fy_tb_cm_subscr_offer so,
--         fy_tb_cm_prof_link e,
--         fy_tb_bl_bill_mast g,
--         fy_tb_bl_bill_bi bi
--   WHERE c.acct_id = e.entity_id
--     AND e.entity_type = 'A'
--     AND e.prof_type = 'NAME'
--     AND e.link_type = 'A'
--     AND c.subscr_id = d.subscr_id
--     AND c.subscr_id = bi.subscr_id
--     AND c.subscr_id = so.subscr_id
--     AND c.acct_id = g.acct_id
--     AND c.acct_id = bi.acct_id(+)
--     AND bi.offer_id = so.offer_id
--     AND (bi.offer_seq is null or bi.offer_seq = so.offer_seq)
--     --AND d.resource_prm_cd IN ('AWSID','HAID')
--     AND bi.charge_code NOT IN ('ROUNDCHG5', 'ROUNDCHG0')
--     AND g.CYCLE IN (10, 15, 20)
--     AND a.CYCLE = g.CYCLE
--     AND a.CYCLE = bi.CYCLE(+)
--     AND a.bill_seq = g.bill_seq
--     AND a.bill_seq = bi.bill_seq(+)
--     AND so.eff_date >= TO_CHAR (ADD_MONTHS (TRUNC (SYSDATE, 'mm'), -2))
--     AND so.eff_date < TO_CHAR (ADD_MONTHS (TRUNC (SYSDATE, 'mm'), -1))
--     AND g.bill_period =
--                     TO_CHAR (ADD_MONTHS (TRUNC (SYSDATE, 'mm'), -2),
--                              'yyyymm')
----AND g.acct_id in (864835746)
--ORDER BY g.acct_id, e.elem2, c.subscr_id

SELECT DISTINCT    so.offer_seq
                || ','
                || g.bill_seq
                || ','
                || e.elem2
                || ','
                || c.subscr_id
                || ','
                || g.acct_id
                || ','
                || TO_NUMBER (g.bill_nbr)
                || ','
                || TO_CHAR (a.bill_date, 'yyyy/mm/dd')
                || ','
                || TO_CHAR (g.due_date, 'yyyy/mm/dd')
                || ','
                || TO_CHAR (d.resource_value)
                || ',"'
                || TO_CHAR (bi.charge_descr)
                || '",'
                || TO_CHAR (so.eff_date, 'yyyy/mm/dd')
                || ','
                || bi.charge_type
                || ','
                || DECODE (bi.charge_org, 'RA', 'UC', 'CC', 'RC', 'DE')
                || ','
                || bi.amount
                || ','
                || g.tot_amt
           FROM fy_tb_bl_bill_cntrl a,
                fy_tb_cm_subscr c,
                fy_tb_cm_resource d,
                fy_tb_cm_subscr_offer so,
                fy_tb_cm_prof_link e,
                fy_tb_bl_bill_mast g,
                fy_tb_bl_bill_bi bi
          WHERE c.acct_id = e.entity_id
            AND e.entity_type = 'A'
            AND e.prof_type = 'NAME'
            AND e.link_type = 'A'
            AND c.subscr_id = d.subscr_id
            AND c.subscr_id = bi.subscr_id
            AND c.subscr_id = so.subscr_id
            AND c.acct_id = g.acct_id
            AND c.acct_id = bi.acct_id(+)
            AND bi.offer_id = so.offer_id
            AND (bi.offer_seq IS NULL OR bi.offer_seq = so.offer_seq)
            --AND d.resource_prm_cd IN ('AWSID','HAID')
            AND bi.charge_code NOT IN ('ROUNDCHG5', 'ROUNDCHG0')
            AND g.CYCLE IN (10, 15, 20)
            AND a.CYCLE = g.CYCLE
            AND a.CYCLE = bi.CYCLE(+)
            AND a.bill_seq = g.bill_seq
            AND a.bill_seq = bi.bill_seq(+)
            AND so.eff_date >= TO_CHAR (ADD_MONTHS (TRUNC (SYSDATE, 'mm'), -2))
            AND so.eff_date < TO_CHAR (ADD_MONTHS (TRUNC (SYSDATE, 'mm'), -1))
            AND g.bill_period =
                     TO_CHAR (ADD_MONTHS (TRUNC (SYSDATE, 'mm'), -2),
                              'yyyymm');

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function formatterReport
{
grep -v '^$' ${reportFileName}.dat > ${ReportDir}/${reportFileName}.csv
rm ${reportFileName}.dat
}

function sendFinalMail
{
send_msg="<SR260229_HGBN_ACT-014_Report> $sysd"
	iconv -f utf8 -t big5 -c ${reportFileName}.csv > ${reportFileName}.big5
	mv ${reportFileName}.big5 ${reportFileName}_$sysd.csv
	rm ${reportFileName}.csv
mailx -s "${send_msg}" -a ${reportFileName}_$sysd.csv "${mailList}" <<EOF
Dears,

   SR260229_HGBN_ACT-014_Report已產出。
   檔名：
   ${reportFileName}.csv

EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName} Start" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}
cd $ReportDir
genReport

#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}

#send final mail
sendFinalMail
echo "Gen ${reportFileName} End" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR260229_HGBN_Bill_Monthly_Check_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR260229_HGBN_Bill_Monthly_Check_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2023/05/16 Created by Mike Kuan
# Description : SR260229_HGBN_Bill_Monthly_Check_Report
########################################################################################
# Date : 2023/08/22 Created by Mike Kuan
# Description : 移除CM/RAT
########################################################################################
# Date : 2025/01/07 Created by Mike Kuan
# Description : SR277291_遠距診療轉F，union 50 cycle遠距客戶
########################################################################################
# Date : 2025/08/22 Created by Mike Kuan
# Description : SR273784_[6240]_Project M Fixed Line Phase II 整合專案，調整NCIC05, NCIC15
########################################################################################
# Date : 2025/09/05 Created by Mike Kuan
# Description : SR282268_立帳開發票_增加InvMethod欄位
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName_BL="SR260229_HGBN_Bill_Monthly_Check_Report_BL"
reportFileName_CM="SR260229_HGBN_Bill_Monthly_Check_Report_CM"
reportFileName_RAT="SR260229_HGBN_Bill_Monthly_Check_Report_RAT"
#mailList="mikekuan@fareastone.com.tw"
mailList="mikekuan@fareastone.com.tw raetsai@fareastone.com.tw susu@fareastone.com.tw wehschiu@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport_BLCM
{
echo "Gen Report_BL/CM Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${tempFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool SR260229_HGBN_Bill_Monthly_Check_Report_BL.dat

select 'CYCLE'||','||'客戶帳號'||','||'CA編號'||','||'費用名稱'||','||'牌價'||','||'議價數量'||','||'議價金額'||','||'計費方式'||','||'預估出帳金額'||','||'生效日'||','||'失效日'||','||'下次出帳區間'||','||'未來失效日'||','||'首次出帳日'||','||'已出帳至'||','||'charge_code'||','||'offer_level_id'||','||'offer_id'||','||'offer_seq'||','||'offer_instance_id'||','||'offer_name'||','||'recur_billed'||','||'InvMethod' from dual;

--SELECT   decode(cc.cycle,10,'N_Cloud05',15,'N_Cloud15',20,'NCIC01',cc.cycle) "CYCLE", a.acct_id "客戶帳號", b.resource_value "CA編號",
--         rc_charge.dscr "費用名稱", rc_charge.rate1 "牌價",
--         device_count.param_value "議價數量", rc_rate.param_value "議價金額",decode(prc.qty_condition,'D','單價*數量',decode(offer.offer_type,'PP','PP','總額')) "計費方式", 
--         decode(a.cur_billed,null,null,
--         decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
--         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0)) "預估出帳金額",
--         a.eff_date "生效日", a.end_date "失效日",
--         decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
--         decode(rc_charge.frequency,1,'月繳',
--         decode(cur_billed,null,to_char(a.eff_date,'yyyy/mm/dd')||'~'||to_char(decode(sign(add_months(a.future_exp_date,-12)-add_months(a.eff_date,12)),1,add_months(a.eff_date,12)-1,a.future_exp_date-1),'yyyy/mm/dd'),
--         to_char(a.cur_billed+1,'yyyy/mm/dd')||'~'||to_char(decode(sign(add_months(a.future_exp_date,-12)-add_months(a.cur_billed,12)),1,add_months(a.cur_billed,12),a.future_exp_date-1),'yyyy/mm/dd'))),null) "下次出帳區間",
--         a.future_exp_date "未來失效日", a.first_bill_date "首次出帳日",
--         a.cur_billed "已出帳至", rc_charge.charge_code, a.offer_level_id,
--         a.offer_id, a.offer_seq, a.offer_instance_id, a.offer_name,
--         a.recur_billed
--    FROM fy_tb_bl_acct_pkg a,fy_Tb_cm_customer cc,
--         fy_tb_cm_resource b,fy_Tb_pbk_package_rc prc,fy_tb_pbk_offer offer,
--         (SELECT *
--            FROM fy_tb_bl_offer_param
--           WHERE param_name LIKE 'RC_RATE1%') rc_rate,
--         (SELECT *
--            FROM fy_tb_bl_offer_param
--           WHERE param_name = 'DEVICE_COUNT') device_count,
--         (SELECT rc.frequency, rc.pkg_id, rc.rate1, code.charge_code, code.dscr
--            FROM fy_tb_pbk_package_rc rc, fy_tb_pbk_charge_code code
--           WHERE rc.charge_code = code.charge_code) rc_charge
--   WHERE cc.cycle in (10,15,20) and cc.cust_id = a.cust_id
--     AND a.acct_id = rc_rate.acct_id(+)
--     AND a.offer_instance_id = rc_rate.offer_instance_id(+)
--     AND a.acct_id = device_count.acct_id(+)
--     AND a.offer_instance_id = device_count.offer_instance_id(+)
--     AND a.pkg_id = rc_charge.pkg_id(+)
--     and a.pkg_id = prc.pkg_id
--     and a.offer_id=offer.offer_id
--     AND a.offer_level_id = b.subscr_id
--union
--SELECT   decode(cc.cycle,50,'遠距',cc.cycle) "CYCLE", a.acct_id "客戶帳號", b.resource_value "CA編號",
--         rc_charge.dscr "費用名稱", rc_charge.rate1 "牌價",
--         device_count.param_value "議價數量", rc_rate.param_value "議價金額",decode(prc.qty_condition,'D','單價*數量',decode(offer.offer_type,'PP','PP','總額')) "計費方式", 
--         decode(a.cur_billed,null,null,
--         decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
--         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0)) "預估出帳金額",
--         a.eff_date "生效日", a.end_date "失效日",
--         decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
--         decode(rc_charge.frequency,1,'月繳',
--         decode(cur_billed,null,to_char(a.eff_date,'yyyy/mm/dd')||'~'||to_char(decode(sign(add_months(a.future_exp_date,-12)-add_months(a.eff_date,12)),1,add_months(a.eff_date,12)-1,a.future_exp_date-1),'yyyy/mm/dd'),
--         to_char(a.cur_billed+1,'yyyy/mm/dd')||'~'||to_char(decode(sign(add_months(a.future_exp_date,-12)-add_months(a.cur_billed,12)),1,add_months(a.cur_billed,12),a.future_exp_date-1),'yyyy/mm/dd'))),null) "下次出帳區間",
--         a.future_exp_date "未來失效日", a.first_bill_date "首次出帳日",
--         a.cur_billed "已出帳至", rc_charge.charge_code, a.offer_level_id,
--         a.offer_id, a.offer_seq, a.offer_instance_id, a.offer_name,
--         a.recur_billed
--    FROM fy_tb_bl_acct_pkg a,fy_Tb_cm_customer cc, fy_tb_cm_subscr cms,
--         fy_tb_cm_resource b,fy_Tb_pbk_package_rc prc,fy_tb_pbk_offer offer,
--         (SELECT *
--            FROM fy_tb_bl_offer_param
--           WHERE param_name LIKE 'RC_RATE1%') rc_rate,
--         (SELECT *
--            FROM fy_tb_bl_offer_param
--           WHERE param_name = 'DEVICE_COUNT') device_count,
--         (SELECT rc.frequency, rc.pkg_id, rc.rate1, code.charge_code, code.dscr
--            FROM fy_tb_pbk_package_rc rc, fy_tb_pbk_charge_code code
--           WHERE rc.charge_code = code.charge_code) rc_charge
--   WHERE cc.cycle in (50) and cc.cust_id = a.cust_id and cc.cust_id = cms.cust_id and cc.CUST_TYPE = 'D' and cms.SUBSCR_TYPE = 'Z'
--     AND a.acct_id = rc_rate.acct_id(+)
--     AND a.offer_instance_id = rc_rate.offer_instance_id(+)
--     AND a.acct_id = device_count.acct_id(+)
--     AND a.offer_instance_id = device_count.offer_instance_id(+)
--     AND a.pkg_id = rc_charge.pkg_id(+)
--     and a.pkg_id = prc.pkg_id
--     and a.offer_id=offer.offer_id
--     AND a.offer_level_id = b.subscr_id
--     and a.offer_level_id = cms.subscr_id
--ORDER BY 1, 2, 3, 4;

SELECT   decode(cc.cycle,10,'NCIC10',15,'NCIC15',20,'NCIC01',cc.cycle) || ','
                || a.acct_id|| ','
                || b.resource_value|| ',"'
                || to_char(rc_charge.dscr)|| '",'
                || rc_charge.rate1|| ','
                || device_count.param_value|| ','
                || rc_rate.param_value|| ','
                || decode(prc.qty_condition,'D','單價*數量',decode(offer.offer_type,'PP','PP','總額'))|| ','
                ||  
         decode(a.cur_billed,null,null,
         decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0))|| ','
                || to_char(a.eff_date,'yyyymmdd')|| ','
                || to_char(a.end_date,'yyyymmdd')|| ','
                || decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
         decode(rc_charge.frequency,1,'月繳',
         decode(cur_billed,null,to_char(a.eff_date,'yyyy/mm/dd')||'~'||to_char(decode(sign(add_months(a.future_exp_date,-12)-add_months(a.eff_date,12)),1,add_months(a.eff_date,12)-1,a.future_exp_date-1),'yyyy/mm/dd'),
         to_char(a.cur_billed+1,'yyyy/mm/dd')||'~'||to_char(decode(sign(add_months(a.future_exp_date,-12)-add_months(a.cur_billed,12)),1,add_months(a.cur_billed,12),a.future_exp_date-1),'yyyy/mm/dd'))),null)|| ','
                || to_char(a.future_exp_date,'yyyymmdd')|| ','
                || to_char(a.first_bill_date,'yyyymmdd')|| ','
                || to_char(a.cur_billed,'yyyymmdd')|| ','
                || rc_charge.charge_code|| ','
                || a.offer_level_id|| ','
                || a.offer_id|| ','
                || a.offer_seq|| ','
                || a.offer_instance_id|| ',"'
                || a.offer_name|| '",'
                || to_char(a.recur_billed,'yyyymmdd')|| ','
                || decode((SELECT 'Y'
                  FROM fy_tb_cm_attribute_param attr
                 WHERE attribute_name = 'EINV_FLAG'
                   and entity_type = 'A'
                   and entity_id = a.acct_id
                   AND attr.eff_date =
                       (SELECT MIN (eff_date)
                          FROM fy_tb_cm_attribute_param
                         WHERE attribute_name = 'EINV_FLAG'
                           AND attribute_value LIKE 'Y%'
                           and entity_type = 'A'
                           and entity_id = a.acct_id)),'Y','立帳開立','繳款開立')
    FROM fy_tb_bl_acct_pkg a,fy_Tb_cm_customer cc,
         fy_tb_cm_resource b,fy_Tb_pbk_package_rc prc,fy_tb_pbk_offer offer,
         (SELECT *
            FROM fy_tb_bl_offer_param
           WHERE param_name LIKE 'RC_RATE1%') rc_rate,
         (SELECT *
            FROM fy_tb_bl_offer_param
           WHERE param_name = 'DEVICE_COUNT') device_count,
         (SELECT rc.frequency, rc.pkg_id, rc.rate1, code.charge_code, code.dscr
            FROM fy_tb_pbk_package_rc rc, fy_tb_pbk_charge_code code
           WHERE rc.charge_code = code.charge_code) rc_charge
   WHERE cc.cycle in (10,15,20) and cc.cust_id = a.cust_id
     AND a.acct_id = rc_rate.acct_id(+)
     AND a.offer_instance_id = rc_rate.offer_instance_id(+)
     AND a.acct_id = device_count.acct_id(+)
     AND a.offer_instance_id = device_count.offer_instance_id(+)
     AND a.pkg_id = rc_charge.pkg_id(+)
     and a.pkg_id = prc.pkg_id
     and a.offer_id=offer.offer_id
     AND a.offer_level_id = b.subscr_id
	 union all
SELECT   distinct decode(cc.cycle,50,'FET01',cc.cycle) || ','
                || a.acct_id|| ','
                || b.resource_value|| ',"'
                || to_char(rc_charge.dscr)|| '",'
                || rc_charge.rate1|| ','
                || device_count.param_value|| ','
                || rc_rate.param_value|| ','
                || decode(prc.qty_condition,'D','單價*數量',decode(offer.offer_type,'PP','PP','總額'))|| ','
                ||  
         decode(a.cur_billed,null,null,
         decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
         decode(prc.qty_condition,'D',nvl(device_count.param_value,1)*nvl(rc_rate.param_value,rc_charge.rate1),nvl(rc_rate.param_value,rc_charge.rate1)),0))|| ','
                || to_char(a.eff_date,'yyyymmdd')|| ','
                || to_char(a.end_date,'yyyymmdd')|| ','
                || decode(decode(SIGN(trunc(a.cur_billed)+1-trunc(a.future_exp_date)),0,0,1),1,
         decode(rc_charge.frequency,1,'月繳',
         decode(cur_billed,null,to_char(a.eff_date,'yyyy/mm/dd')||'~'||to_char(decode(sign(add_months(a.future_exp_date,-12)-add_months(a.eff_date,12)),1,add_months(a.eff_date,12)-1,a.future_exp_date-1),'yyyy/mm/dd'),
         to_char(a.cur_billed+1,'yyyy/mm/dd')||'~'||to_char(decode(sign(add_months(a.future_exp_date,-12)-add_months(a.cur_billed,12)),1,add_months(a.cur_billed,12),a.future_exp_date-1),'yyyy/mm/dd'))),null)|| ','
                || to_char(a.future_exp_date,'yyyymmdd')|| ','
                || to_char(a.first_bill_date,'yyyymmdd')|| ','
                || to_char(a.cur_billed,'yyyymmdd')|| ','
                || rc_charge.charge_code|| ','
                || a.offer_level_id|| ','
                || a.offer_id|| ','
                || a.offer_seq|| ','
                || a.offer_instance_id|| ',"'
                || a.offer_name|| '",'
                || to_char(a.recur_billed,'yyyymmdd')|| ','
                || decode((SELECT attribute_value
                  FROM fy_tb_cm_attribute_param attr
                 WHERE attribute_name = 'EINV_FLAG'
                   and entity_type = 'A'
                   and entity_id = a.acct_id
                   AND attr.eff_date =
                       (SELECT MIN (eff_date)
                          FROM fy_tb_cm_attribute_param
                         WHERE attribute_name = 'EINV_FLAG'
                           AND attribute_value LIKE 'Y%'
                           and entity_type = 'A'
                           and entity_id = a.acct_id)),'Y','立帳開立','繳款開立')
    FROM fy_tb_bl_acct_pkg a,fy_Tb_cm_customer cc, fy_tb_cm_subscr cms,
         fy_tb_cm_resource b,fy_Tb_pbk_package_rc prc,fy_tb_pbk_offer offer,
         (SELECT *
            FROM fy_tb_bl_offer_param
           WHERE param_name LIKE 'RC_RATE1%') rc_rate,
         (SELECT *
            FROM fy_tb_bl_offer_param
           WHERE param_name = 'DEVICE_COUNT') device_count,
         (SELECT rc.frequency, rc.pkg_id, rc.rate1, code.charge_code, code.dscr
            FROM fy_tb_pbk_package_rc rc, fy_tb_pbk_charge_code code
           WHERE rc.charge_code = code.charge_code) rc_charge
   WHERE cc.cycle in (50) and cc.cust_id = a.cust_id and cc.cust_id = cms.cust_id and cc.CUST_TYPE = 'D' and cms.SUBSCR_TYPE = 'Z'
     AND a.acct_id = rc_rate.acct_id(+)
     AND a.offer_instance_id = rc_rate.offer_instance_id(+)
     AND a.acct_id = device_count.acct_id(+)
     AND a.offer_instance_id = device_count.offer_instance_id(+)
     AND a.pkg_id = rc_charge.pkg_id(+)
     and a.pkg_id = prc.pkg_id
     and a.offer_id=offer.offer_id
     AND a.offer_level_id = b.subscr_id;
spool off

spool SR260229_HGBN_Bill_Monthly_Check_Report_CM.dat

--select 'account'||','||'CompanyName'||','||'Name'||','||'tax_ID'||','||'address'||','||'ID_Type'||','||'Bill_Delivery_Method'||','||'email_address' from dual;

select 'account'||','||'CompanyName'||','||'ID_Type'||','||'Bill_Delivery_Method' from dual;

--select name.entity_id as account,addr.elem13 as CompanyName,name.elem2 as Name,name.elem6 as tax_ID,addr.elem1||addr.elem2||addr.elem3 as address
--,decode (name.elem5,'1','國民身分證','2','統一編號','3','稅籍編號','0','外籍人士證照號碼','19','NCIC聯絡人編號','20','EBU編號',name.elem5)as ID_Type 
--,decode (addr.elem7,'1','書面帳單','2','列印書面帳款及電子帳單','3','電子帳單(過渡期)','4','電子帳單','無')as Bill_Delivery_Method
--,addr.elem6 as email_address
--from (select * from fy_tb_cm_prof_link
--        where prof_type='ADDR') addr 
--      ,(select * from fy_tb_cm_prof_link
--       where prof_type='NAME') name
--where addr.entity_type='A'
--and name.entity_type=addr.entity_type
--and addr.link_type='B'
--and name.link_type=addr.link_type
--and name.entity_id=addr.entity_id
----and addr.entity_id=843738897
--and EXISTS (select 1 from fy_Tb_cm_customer cc, fy_tb_cm_account ca where cc.cycle=10 and cc.cust_type='N' and cc.cust_id=ca.cust_id and ca.acct_id=addr.entity_id) 
--;

select name.entity_id|| ','
                || addr.elem13|| ','
                || name.elem6|| ','
                || decode (addr.elem7,'1','書面帳單','2','列印書面帳款及電子帳單','3','電子帳單(過渡期)','4','電子帳單','無')
from (select * from fy_tb_cm_prof_link
        where prof_type='ADDR') addr 
      ,(select * from fy_tb_cm_prof_link
       where prof_type='NAME') name
where addr.entity_type='A'
and name.entity_type=addr.entity_type
and addr.link_type='B'
and name.link_type=addr.link_type
and name.entity_id=addr.entity_id
--and addr.entity_id=843738897
and EXISTS (select 1 from fy_Tb_cm_customer cc, fy_tb_cm_account ca where cc.cycle=10 and cc.cust_type='N' and cc.cust_id=ca.cust_id and ca.acct_id=addr.entity_id) 
;
spool off
exit;
EOF`
echo "Gen Report_BL/CM End"|tee -a ${logFile}
}


function genReport_RAT
{
echo "Gen Report_RAT Start"|tee -a ${logFile}
`sqlplus -s hgbrtappc/hgbrtappc_#@HGBRT1 > ${tempFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool SR260229_HGBN_Bill_Monthly_Check_Report_RAT.dat

select 'CA編號'||','||'客戶帳號'||','||'費用名稱'||','||'牌價'||','||'0001'||','||'起1'||','||'迄1'||','||'金1'||','||'0002'||','||'起2'||','||'迄2'||','||'金2'||','||'0003'||','||'起3'||','||'迄3'||','||'金3'||','||'0004'||','||'起4'||','||'迄4'||','||'金4'||','||'0005'||','||'起5'||','||'迄5'||','||'金5'||','||'生效日'||','||'失效日'||','||'charge_code'||','||'offer_level_id'||','||'offer_id'||','||'offer_seq'||','||'offer_instance_id'||','||'offer_name' from dual;

--SELECT   b.resource_value "CA編號",a.acct_id "客戶帳號",
--         uc_charge.dscr "費用名稱", uc_charge.rate1||','||uc_charge.rate2||','||uc_charge.rate3||','||uc_charge.rate4||','||uc_charge.rate5 "牌價",
--         uc_qtys1.param_name "0001",  uc_qtys1.param_value "起1",  uc_qtye1.param_value "迄1", uc_rate1.param_value "金1",
--         uc_qtys2.param_name "0002",  uc_qtys2.param_value "起2",  uc_qtye2.param_value "迄2", uc_rate2.param_value "金2",
--         uc_qtys3.param_name "0003",  uc_qtys3.param_value "起3",  uc_qtye3.param_value "迄3", uc_rate3.param_value "金3",
--         uc_qtys4.param_name "0004",  uc_qtys4.param_value "起4",  uc_qtye4.param_value "迄4", uc_rate4.param_value "金4",
--         uc_qtys5.param_name "0005",  uc_qtys5.param_value "起5",  uc_qtye5.param_value "迄5", uc_rate5.param_value "金5",
--         a.eff_date "生效日", a.end_date "失效日",
--         uc_charge.charge_code, a.offer_level_id,
--         a.offer_id, a.offer_seq, a.offer_instance_id, a.offer_name
--    FROM fy_tb_rat_acct_pkg a, fy_tb_cm_resource b,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_RATE1%') uc_rate1,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_QTYS1%') uc_qtys1,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_QTYE1%') uc_qtye1,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_RATE2%') uc_rate2,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_QTYS2%') uc_qtys2,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_QTYE2%') uc_qtye2,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_RATE3%') uc_rate3,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_QTYS3%') uc_qtys3,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_QTYE3%') uc_qtye3,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_RATE4%') uc_rate4,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_QTYS4%') uc_qtys4,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_QTYE4%') uc_qtye4,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_RATE5%') uc_rate5,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_QTYS5%') uc_qtys5,
--         (SELECT *
--            FROM fy_tb_rat_offer_param
--            where param_name LIKE 'UC_QTYE5%') uc_qtye5,
--         (SELECT uc.pkg_id, uc_dtl.rate1, uc_dtl.rate2, uc_dtl.rate3, uc_dtl.rate4, uc_dtl.rate5, code.charge_code, code.dscr
--  FROM fy_tb_pbk_package_uc uc,
--       fy_tb_pbk_package_uc_dtl uc_dtl,
--       fy_tb_pbk_charge_code code
-- WHERE uc.pkg_id = uc_dtl.pkg_id AND uc.charge_code = code.charge_code) uc_charge
--   WHERE a.acct_id = uc_rate1.acct_id(+)
--     AND a.offer_level_id = uc_rate1.subscr_id(+)
--     and a.offer_seq=uc_rate1.offer_seq(+)
--          AND a.acct_id = uc_qtys1.acct_id(+)
--     AND a.offer_level_id = uc_qtys1.subscr_id(+)
--     and a.offer_seq=uc_qtys1.offer_seq(+)
--          AND a.acct_id = uc_qtye1.acct_id(+)
--     AND a.offer_level_id = uc_qtye1.subscr_id(+)
--     and a.offer_seq=uc_qtye1.offer_seq(+)
--     and a.acct_id = uc_rate2.acct_id(+)
--     AND a.offer_level_id = uc_rate2.subscr_id(+)
--     and a.offer_seq=uc_rate2.offer_seq(+)
--          AND a.acct_id = uc_qtys2.acct_id(+)
--     AND a.offer_level_id = uc_qtys2.subscr_id(+)
--     and a.offer_seq=uc_qtys2.offer_seq(+)
--          AND a.acct_id = uc_qtye2.acct_id(+)
--     AND a.offer_level_id = uc_qtye2.subscr_id(+)
--     and a.offer_seq=uc_qtye2.offer_seq(+)
--     AND a.pkg_id = uc_charge.pkg_id(+)
--          and a.acct_id = uc_rate3.acct_id(+)
--     AND a.offer_level_id = uc_rate3.subscr_id(+)
--     and a.offer_seq=uc_rate3.offer_seq(+)
--          AND a.acct_id = uc_qtys3.acct_id(+)
--     AND a.offer_level_id = uc_qtys3.subscr_id(+)
--     and a.offer_seq=uc_qtys3.offer_seq(+)
--          AND a.acct_id = uc_qtye3.acct_id(+)
--     AND a.offer_level_id = uc_qtye3.subscr_id(+)
--     and a.offer_seq=uc_qtye3.offer_seq(+)
--          and a.acct_id = uc_rate4.acct_id(+)
--     AND a.offer_level_id = uc_rate4.subscr_id(+)
--     and a.offer_seq=uc_rate4.offer_seq(+)
--          AND a.acct_id = uc_qtys4.acct_id(+)
--     AND a.offer_level_id = uc_qtys4.subscr_id(+)
--     and a.offer_seq=uc_qtys4.offer_seq(+)
--          AND a.acct_id = uc_qtye4.acct_id(+)
--     AND a.offer_level_id = uc_qtye4.subscr_id(+)
--     and a.offer_seq=uc_qtye4.offer_seq(+)
--          and a.acct_id = uc_rate5.acct_id(+)
--     AND a.offer_level_id = uc_rate5.subscr_id(+)
--     and a.offer_seq=uc_rate5.offer_seq(+)
--          AND a.acct_id = uc_qtys5.acct_id(+)
--     AND a.offer_level_id = uc_qtys5.subscr_id(+)
--     and a.offer_seq=uc_qtys5.offer_seq(+)
--          AND a.acct_id = uc_qtye5.acct_id(+)
--     AND a.offer_level_id = uc_qtye5.subscr_id(+)
--     and a.offer_seq=uc_qtye5.offer_seq(+)
--     and a.cust_id in (select cust_id from fy_Tb_cm_customer cc where cc.cycle=10 and cc.cust_type='N')
--     and a.offer_level_id=b.subscr_id
--ORDER BY a.acct_id, offer_level_id, offer_id;

SELECT   b.resource_value|| ','
                || a.acct_id|| ',"'
                || uc_charge.dscr|| '","'
                || uc_charge.rate1||','||uc_charge.rate2||','||uc_charge.rate3||','||uc_charge.rate4||','||uc_charge.rate5|| '",'
                || 
         uc_qtys1.param_name|| ','
                || uc_qtys1.param_value|| ','
                || uc_qtye1.param_value|| ','
                || uc_rate1.param_value|| ','
                || 
         uc_qtys2.param_name|| ','
                || uc_qtys2.param_value|| ','
                || uc_qtye2.param_value|| ','
                || uc_rate2.param_value|| ','
                || 
         uc_qtys3.param_name|| ','
                || uc_qtys3.param_value|| ','
                || uc_qtye3.param_value|| ','
                || uc_rate3.param_value|| ','
                || 
         uc_qtys4.param_name|| ','
                || uc_qtys4.param_value|| ','
                || uc_qtye4.param_value|| ','
                || uc_rate4.param_value|| ','
                || 
         uc_qtys5.param_name|| ','
                || uc_qtys5.param_value|| ','
                || uc_qtye5.param_value|| ','
                || uc_rate5.param_value|| ','
                || 
         to_char(a.eff_date)|| ','
                || to_char(a.end_date)|| ','
                || 
         uc_charge.charge_code|| ','
                || a.offer_level_id|| ','
                || 
         a.offer_id|| ','
                || a.offer_seq|| ','
                || a.offer_instance_id|| ','
                || a.offer_name
    FROM fy_tb_rat_acct_pkg a, fy_tb_cm_resource b,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_RATE1%') uc_rate1,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_QTYS1%') uc_qtys1,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_QTYE1%') uc_qtye1,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_RATE2%') uc_rate2,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_QTYS2%') uc_qtys2,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_QTYE2%') uc_qtye2,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_RATE3%') uc_rate3,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_QTYS3%') uc_qtys3,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_QTYE3%') uc_qtye3,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_RATE4%') uc_rate4,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_QTYS4%') uc_qtys4,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_QTYE4%') uc_qtye4,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_RATE5%') uc_rate5,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_QTYS5%') uc_qtys5,
         (SELECT *
            FROM fy_tb_rat_offer_param
            where param_name LIKE 'UC_QTYE5%') uc_qtye5,
         (SELECT uc.pkg_id, uc_dtl.rate1, uc_dtl.rate2, uc_dtl.rate3, uc_dtl.rate4, uc_dtl.rate5, code.charge_code, code.dscr
  FROM fy_tb_pbk_package_uc uc,
       fy_tb_pbk_package_uc_dtl uc_dtl,
       fy_tb_pbk_charge_code code
 WHERE uc.pkg_id = uc_dtl.pkg_id AND uc.charge_code = code.charge_code) uc_charge
   WHERE a.acct_id = uc_rate1.acct_id(+)
     AND a.offer_level_id = uc_rate1.subscr_id(+)
     and a.offer_seq=uc_rate1.offer_seq(+)
          AND a.acct_id = uc_qtys1.acct_id(+)
     AND a.offer_level_id = uc_qtys1.subscr_id(+)
     and a.offer_seq=uc_qtys1.offer_seq(+)
          AND a.acct_id = uc_qtye1.acct_id(+)
     AND a.offer_level_id = uc_qtye1.subscr_id(+)
     and a.offer_seq=uc_qtye1.offer_seq(+)
     and a.acct_id = uc_rate2.acct_id(+)
     AND a.offer_level_id = uc_rate2.subscr_id(+)
     and a.offer_seq=uc_rate2.offer_seq(+)
          AND a.acct_id = uc_qtys2.acct_id(+)
     AND a.offer_level_id = uc_qtys2.subscr_id(+)
     and a.offer_seq=uc_qtys2.offer_seq(+)
          AND a.acct_id = uc_qtye2.acct_id(+)
     AND a.offer_level_id = uc_qtye2.subscr_id(+)
     and a.offer_seq=uc_qtye2.offer_seq(+)
     AND a.pkg_id = uc_charge.pkg_id(+)
          and a.acct_id = uc_rate3.acct_id(+)
     AND a.offer_level_id = uc_rate3.subscr_id(+)
     and a.offer_seq=uc_rate3.offer_seq(+)
          AND a.acct_id = uc_qtys3.acct_id(+)
     AND a.offer_level_id = uc_qtys3.subscr_id(+)
     and a.offer_seq=uc_qtys3.offer_seq(+)
          AND a.acct_id = uc_qtye3.acct_id(+)
     AND a.offer_level_id = uc_qtye3.subscr_id(+)
     and a.offer_seq=uc_qtye3.offer_seq(+)
          and a.acct_id = uc_rate4.acct_id(+)
     AND a.offer_level_id = uc_rate4.subscr_id(+)
     and a.offer_seq=uc_rate4.offer_seq(+)
          AND a.acct_id = uc_qtys4.acct_id(+)
     AND a.offer_level_id = uc_qtys4.subscr_id(+)
     and a.offer_seq=uc_qtys4.offer_seq(+)
          AND a.acct_id = uc_qtye4.acct_id(+)
     AND a.offer_level_id = uc_qtye4.subscr_id(+)
     and a.offer_seq=uc_qtye4.offer_seq(+)
          and a.acct_id = uc_rate5.acct_id(+)
     AND a.offer_level_id = uc_rate5.subscr_id(+)
     and a.offer_seq=uc_rate5.offer_seq(+)
          AND a.acct_id = uc_qtys5.acct_id(+)
     AND a.offer_level_id = uc_qtys5.subscr_id(+)
     and a.offer_seq=uc_qtys5.offer_seq(+)
          AND a.acct_id = uc_qtye5.acct_id(+)
     AND a.offer_level_id = uc_qtye5.subscr_id(+)
     and a.offer_seq=uc_qtye5.offer_seq(+)
     and a.cust_id in (select cust_id from fy_Tb_cm_customer cc where cc.cycle=10 and cc.cust_type='N')
     and a.offer_level_id=b.subscr_id
ORDER BY a.acct_id, offer_level_id, offer_id;
spool off
exit;
EOF`
echo "Gen Report_RAT End"|tee -a ${logFile}
}



function formatterReport_BL
{
grep -v '^$' ${reportFileName_BL}.dat > ${ReportDir}/${reportFileName_BL}.csv
rm ${reportFileName_BL}.dat
}

function formatterReport_CM
{
grep -v '^$' ${reportFileName_CM}.dat > ${ReportDir}/${reportFileName_CM}.csv
rm ${reportFileName_CM}.dat
}

function formatterReport_RAT
{
grep -v '^$' ${reportFileName_RAT}.dat > ${ReportDir}/${reportFileName_RAT}.csv
rm ${reportFileName_RAT}.dat
}

function sendFinalMail
{
send_msg="<SR260229_HGBN_Bill_Monthly_Check_Report> $sysd"
	iconv -f utf8 -t big5 -c ${reportFileName_BL}.csv > ${reportFileName_BL}.big5
	mv ${reportFileName_BL}.big5 ${reportFileName_BL}_$sysd.csv
	rm ${reportFileName_BL}.csv
	#iconv -f utf8 -t big5 -c ${reportFileName_CM}.csv > ${reportFileName_CM}.big5
	#mv ${reportFileName_CM}.big5 ${reportFileName_CM}_$sysd.csv
	#rm ${reportFileName_CM}.csv
	#iconv -f utf8 -t big5 -c ${reportFileName_RAT}.csv > ${reportFileName_RAT}.big5
	#mv ${reportFileName_RAT}.big5 ${reportFileName_RAT}_$sysd.csv
	#rm ${reportFileName_RAT}.csv

mailx -s "${send_msg}" -a ${reportFileName_BL}_$sysd.csv "${mailList}" <<EOF
Dears,

   SR260229_HGBN_Bill_Monthly_Check_Report已產出。
   檔名：
   ${reportFileName_BL}.csv

EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName_BL} Start" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}
cd $ReportDir
genReport_BLCM
#genReport_RAT

#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport_BL
#formatterReport_CM
#formatterReport_RAT
echo "Formatter Report End"|tee -a ${logFile}

#send final mail
sendFinalMail
echo "Gen ${reportFileName_BL} End" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR264001_HGBN_o365_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR264001_HGBN_o365_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2023/08/24 Created by Mike Kuan
# Description : SR264001_客戶o365 產品數量暨到期日資訊報表
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName_BL="SR264001_HGBN_o365_Report"
mailList="mikekuan@fareastone.com.tw rayyang2@fareastone.com.tw"
#mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport_BL
{
echo "Gen Report_BL Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${tempFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool SR264001_HGBN_o365_Report.dat

select '客戶編號'||','||'客戶名稱'||','||'統編'||','||'微軟租戶帳號'||','||'負責業務員'||','||'產品品項'||','||'產品ChargeStartDate'||','||'產品ChargeEndDate'||','||'週期性收費月份'||','||'產品數量'||','||'收入單價'||','||'收入總金額'||','||'bill_Seq'||','||'acct_id'||','||'subscr_id'||','||'offer_seq' from dual;

--SELECT distinct
--    TO_CHAR(h.subscr_id) AS "客戶編號",
--    e.elem2 AS "客戶名稱",
--    e.elem6 AS "統編",
--    f.param_value AS "微軟租戶帳號",
--    h.sales AS "負責業務員",
--    offer.offer_name AS "產品品項",
--    to_char(a.bill_from_date,'yyyymmdd') AS "產品ChargeStartDate",
--    to_char(a.bill_end_date,'yyyymmdd') AS "產品ChargeEndDate",
--    a.bill_period AS "週期性收費月份",
--    device_count.param_value AS "產品數量",
--    rc_rate.param_value AS "收入單價",
--    g.amount AS "收入總金額",
--    a.bill_Seq,
--    c.acct_id,
--    c.subscr_id,
--    g.offer_seq
--FROM
--    fy_tb_bl_bill_cntrl a
--JOIN
--    fy_tb_cm_subscr c ON a.CYCLE in (10,15,20) and a.CREATE_USER = 'UBL' and a.bill_period = to_char(trunc(add_months(sysdate,-1)),'yyyymm')
--JOIN
--    fy_tb_cm_prof_link e ON c.acct_id = e.entity_id AND e.entity_type = 'A' AND e.prof_type = 'NAME' AND e.link_type = 'A'
--JOIN
--    fy_Tb_cm_offer_param f ON c.acct_id = f.acct_id and c.subscr_id = f.subscr_id and f.param_name = 'NAME'
--JOIN
--    (
--        SELECT
--            bill_seq,
--            cycle,
--            SUM(amount) amount,
--            subscr_id,
--            offer_id,
--            offer_seq
--        FROM
--            fy_tb_bl_bill_ci
--        WHERE
--            source = 'RC'
--        GROUP BY
--            bill_seq,
--            cycle,
--            subscr_id,
--            offer_id,
--            offer_seq
--    ) g ON a.bill_seq = g.bill_seq AND a.CYCLE = g.CYCLE and c.subscr_id = g.subscr_id
--JOIN
--    fy_tb_bl_bill_offer_param rc_rate ON c.acct_id = rc_rate.acct_id and g.offer_seq = rc_rate.offer_seq and rc_rate.param_name LIKE 'RC_RATE1%'
--JOIN
--    fy_tb_bl_bill_offer_param device_count ON c.acct_id = device_count.acct_id and g.offer_seq = device_count.offer_seq and device_count.param_name = 'DEVICE_COUNT'
--JOIN
--    fy_tb_pbk_offer offer ON g.offer_id = offer.offer_id
--LEFT JOIN
--    (
--        SELECT
--            TO_NUMBER(vsub.billing_subscr_id) AS "BILLING_SUBSCR_ID",
--            TO_CHAR(vsub.subscr_id) AS "SUBSCR_ID",
--            TO_CHAR(vsub.sales_id || '-' || vsub.sales_name_cht) AS "SALES",
--            vsub.prod_name
--        FROM
--            v_subscr_info vsub
--        WHERE
--            vsub.prod_name LIKE '%365%'
--        GROUP BY
--            vsub.billing_subscr_id,
--            vsub.subscr_id,
--            TO_CHAR(vsub.sales_id || '-' || vsub.sales_name_cht),
--            vsub.prod_name
--    ) h ON c.subscr_id = h.billing_subscr_id
--ORDER BY
--    e.elem2,
--    c.subscr_id;

SELECT distinct
    TO_CHAR(h.subscr_id) || ',' ||
    e.elem2 || ',' ||
    e.elem6 || ',' ||
    f.param_value || ',' ||
    h.sales || ',"' ||
    offer.offer_name || '",' ||
    to_char(a.bill_from_date,'yyyymmdd') || ',' ||
    to_char(a.bill_end_date,'yyyymmdd') || ',' ||
    a.bill_period || ',' ||
    device_count.param_value || ',' ||
    rc_rate.param_value || ',' ||
    g.amount || ',' ||
    a.bill_Seq || ',' ||
    c.acct_id || ',' ||
    c.subscr_id || ',' ||
    g.offer_seq
FROM
    fy_tb_bl_bill_cntrl a
JOIN
    fy_tb_cm_subscr c ON a.CYCLE in (10,15,20) and a.CREATE_USER = 'UBL' and a.bill_period = to_char(trunc(add_months(sysdate,-1)),'yyyymm')
JOIN
    fy_tb_cm_prof_link e ON c.acct_id = e.entity_id AND e.entity_type = 'A' AND e.prof_type = 'NAME' AND e.link_type = 'A'
JOIN
    fy_Tb_cm_offer_param f ON c.acct_id = f.acct_id and c.subscr_id = f.subscr_id and f.param_name = 'NAME'
JOIN
    (
        SELECT
            bill_seq,
            cycle,
            SUM(amount) amount,
            subscr_id,
            offer_id,
            offer_seq
        FROM
            fy_tb_bl_bill_ci
        WHERE
            source = 'RC'
        GROUP BY
            bill_seq,
            cycle,
            subscr_id,
            offer_id,
            offer_seq
    ) g ON a.bill_seq = g.bill_seq AND a.CYCLE = g.CYCLE and c.subscr_id = g.subscr_id
JOIN
    fy_tb_bl_bill_offer_param rc_rate ON c.acct_id = rc_rate.acct_id and g.offer_seq = rc_rate.offer_seq and rc_rate.param_name LIKE 'RC_RATE1%'
JOIN
    fy_tb_bl_bill_offer_param device_count ON c.acct_id = device_count.acct_id and g.offer_seq = device_count.offer_seq and device_count.param_name = 'DEVICE_COUNT'
JOIN
    fy_tb_pbk_offer offer ON g.offer_id = offer.offer_id
LEFT JOIN
    (
        SELECT
            TO_NUMBER(vsub.billing_subscr_id) AS "BILLING_SUBSCR_ID",
            TO_CHAR(vsub.subscr_id) AS "SUBSCR_ID",
            TO_CHAR(vsub.sales_id || '-' || vsub.sales_name_cht) AS "SALES",
            vsub.prod_name
        FROM
            v_subscr_info vsub
        WHERE
            vsub.prod_name LIKE '%365%'
        GROUP BY
            vsub.billing_subscr_id,
            vsub.subscr_id,
            TO_CHAR(vsub.sales_id || '-' || vsub.sales_name_cht),
            vsub.prod_name
    ) h ON c.subscr_id = h.billing_subscr_id
;

spool off

exit;
EOF`
echo "Gen Report_BL End"|tee -a ${logFile}
}


function formatterReport_BL
{
grep -v '^$' ${reportFileName_BL}.dat > ${ReportDir}/${reportFileName_BL}.csv
rm ${reportFileName_BL}.dat
}

function sendFinalMail
{
send_msg="<SR264001_HGBN_o365_Report> $sysd"
	iconv -f utf8 -t big5 -c ${reportFileName_BL}.csv > ${reportFileName_BL}.big5
	mv ${reportFileName_BL}.big5 ${reportFileName_BL}_$sysd.csv
	rm ${reportFileName_BL}.csv

mailx -s "${send_msg}" -a ${reportFileName_BL}_$sysd.csv "${mailList}" <<EOF
Dears,

   SR264001_客戶o365產品數量暨到期日資訊報表已產出。
   檔名：
   ${reportFileName_BL}.csv

EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName_BL} Start" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}
cd $ReportDir
genReport_BL

#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport_BL
echo "Formatter Report End"|tee -a ${logFile}

#send final mail
sendFinalMail
echo "Gen ${reportFileName_BL} End" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR265840_Azure_Product_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR265840_Azure_Product_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2023/12/22 Modify by Mike Kuan
# Description : new

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
WorkDir="/extsoft/UBL/BL/Surrounding/RPT"
logDir=${WorkDir}/log
ReportDir=${WorkDir}/report
ReportDirBak=${ReportDir}/bak
cycleInfoDir=${WorkDir}/cycleInfos
progName=$(basename $0 .sh)
echo "Program Name is:${progName}"
sysd=`date "+%Y%m%d"`
logFile=${logDir}/"${progName}_${sysd}.log"
processCycle=`date +%Y%m15`
#processCycle=$1
utilDir="/cb/BCM/util"
ftpProg="${utilDir}/Ftp2Remote.sh"
tempFile1=${logDir}/"${progName}_tmp_${sysd}.log"
reportFileName1="SR265840_Azure_Product_Report"
sysdate=$(date +"%Y%m%d%H%M%S")
#DB info (TEST06) (PT)
#--DB="HGBBLDEV"
#--DB="HGBDEV2"
#DB info (TEST15) (SIT)
#--DB="HGBBLSIT"
#--RPTDB_SID="HGBBLSIT"
#DB info (TEST02) (UAT)
#--DB="HGBBLUAT"
#--RPTDB_SID="HGBBLUAT"
#DB info (PROD)
DB="HGBBL"
RPTDB_SID="HGBBLRPT"
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
#Ftp 
#putip1='10.68.57.184'
putip1='10.68.158.197'
putuser1=hgftp
putpass1=hgftp123
putpath1=/HomeGrown
#MAIL
mailList="mikekuan@fareastone.com.tw PeterChen1@fareastone.com.tw ceciliawang@fareastone.com.tw"
#mailList="mikekuan@fareastone.com.tw"

function genSettlementReport
{
`sqlplus -s ${DBID}/${DBPWD}@${RPTDB_SID} > ${tempFile1} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool output.dat

select 'ACCT_ID','HAID','SUBSCR_ID','客戶名稱','統編','產品品項','產品ChargeStartDate','產品ChargeEndDate','週期性收費月份','產品數量','收入單價','BILL_NBR','收入總金額','上期已繳款' from dual;

--SELECT distinct
--    c.acct_id,
--    to_char(re.RESOURCE_VALUE) AS "HAID",
--    c.subscr_id,
--    --g.offer_seq,
--    e.elem6 AS "統編",
--    --h.sales AS "負責業務員",
--    offer.offer_name AS "產品品項",
--    to_char(a.bill_from_date,'yyyymmdd') AS "產品ChargeStartDate",
--    to_char(a.bill_end_date,'yyyymmdd') AS "產品ChargeEndDate",
--    a.bill_period AS "週期性收費月份",
--    device_count.param_value AS "產品數量",
--    rc_rate.param_value AS "收入單價",
--    ma.bill_nbr,
--    g.amount AS "收入總金額",
--    decode(ma.paid_amt,0,'N','Y') "上期已繳款"
--    --a.bill_Seq
--FROM
--    fy_tb_bl_bill_cntrl a
--JOIN
--    fy_tb_cm_subscr c ON a.CYCLE in (15) and a.CREATE_USER = 'UBL' and a.bill_period = to_char(trunc(add_months(sysdate,-1)),'yyyymm')
--JOIN    
--    fy_tb_cm_resource re ON c.subscr_id = re.subscr_id
--JOIN
--    fy_tb_cm_prof_link e ON c.acct_id = e.entity_id AND e.entity_type = 'A' AND e.prof_type = 'NAME' AND e.link_type = 'A'
--JOIN
--    fy_tb_bl_bill_mast ma ON c.acct_id = ma.acct_id AND a.bill_seq = ma.bill_seq AND a.CYCLE = ma.CYCLE    
--JOIN
--    (
--        SELECT
--            bill_seq,
--            cycle,
--            amount,
--            subscr_id,
--            offer_id,
--            offer_seq
--        FROM
--            fy_tb_bl_bill_ci
--    ) g ON a.bill_seq = g.bill_seq AND a.CYCLE = g.CYCLE and c.subscr_id = g.subscr_id
--LEFT JOIN
--    fy_tb_bl_bill_offer_param rc_rate ON c.acct_id = rc_rate.acct_id and g.offer_seq = rc_rate.offer_seq and rc_rate.param_name LIKE 'RC_RATE1%'
--LEFT JOIN
--    fy_tb_bl_bill_offer_param device_count ON c.acct_id = device_count.acct_id and g.offer_seq = device_count.offer_seq and device_count.param_name = 'DEVICE_COUNT'
--JOIN
--    fy_tb_pbk_offer offer ON g.offer_id = offer.offer_id and offer_name like '%Azure%'
--ORDER BY
--    e.elem2,
--    c.subscr_id;

SELECT distinct
    TO_CHAR(c.acct_id) || ',' ||
    TO_CHAR(re.RESOURCE_VALUE) || ',' ||
    TO_CHAR(c.subscr_id) || ',''' ||
    e.elem2 || ''',' ||
    e.elem6 || ',''' ||
    offer.offer_name || ''',' ||
    to_char(a.bill_from_date,'yyyymmdd') || ',' ||
    to_char(a.bill_end_date,'yyyymmdd') || ',' ||
    TO_CHAR(a.bill_period) || ',' ||
    TO_CHAR(device_count.param_value) || ',' ||
    TO_CHAR(rc_rate.param_value) || ',' ||
    ma.bill_nbr || ',' ||
    TO_CHAR(g.amount) || ',' ||
    decode(ma.paid_amt,0,'N','Y')
FROM
    fy_tb_bl_bill_cntrl a
JOIN
    fy_tb_cm_subscr c ON a.CYCLE in (15) and a.CREATE_USER = 'UBL' and a.bill_period = to_char(trunc(add_months(sysdate,-1)),'yyyymm')
JOIN    
    fy_tb_cm_resource re ON c.subscr_id = re.subscr_id
JOIN
    fy_tb_cm_prof_link e ON c.acct_id = e.entity_id AND e.entity_type = 'A' AND e.prof_type = 'NAME' AND e.link_type = 'A'
JOIN
    fy_tb_bl_bill_mast ma ON c.acct_id = ma.acct_id AND a.bill_seq = ma.bill_seq AND a.CYCLE = ma.CYCLE    
JOIN
    (
        SELECT
            bill_seq,
            cycle,
            amount,
            subscr_id,
            offer_id,
            offer_seq
        FROM
            fy_tb_bl_bill_ci
    ) g ON a.bill_seq = g.bill_seq AND a.CYCLE = g.CYCLE and c.subscr_id = g.subscr_id
LEFT JOIN
    fy_tb_bl_bill_offer_param rc_rate ON c.acct_id = rc_rate.acct_id and g.offer_seq = rc_rate.offer_seq and rc_rate.param_name LIKE 'RC_RATE1%'
LEFT JOIN
    fy_tb_bl_bill_offer_param device_count ON c.acct_id = device_count.acct_id and g.offer_seq = device_count.offer_seq and device_count.param_name = 'DEVICE_COUNT'
JOIN
    fy_tb_pbk_offer offer ON g.offer_id = offer.offer_id and offer_name like '%Azure%'
;

spool off

exit;

EOF`

echo "Gen Azure_Product_Report SQL End"|tee -a ${logFile}
}

function formatterSettlementReport
{
grep -v '^$' output.dat > ${ReportDir}/${reportFileName1}_${processCycle}.csv
}

#function sendFinalMail
#{
#mailx -s "[${processCycle}]${progName} Finished " ${mailList} <<EOF
#Dear All,
#  
#  Please check SR265840_Azure_Product_Report at ${WorkDir}/report/bak !!!
#  
#(請注意：此郵件為系統自動傳送，請勿直接回覆！)
#(Note: Please do not reply to messages sent automatically.)
#EOF
#}

function sendFinalMail
{
send_msg="<SR265840_Azure_Product_Report> $sysd"
	iconv -f utf8 -t big5 -c ${ReportDir}/${reportFileName1}_${processCycle}.csv > ${ReportDir}/${reportFileName1}_${processCycle}.big5
	mv ${ReportDir}/${reportFileName1}_${processCycle}.big5 ${ReportDir}/${reportFileName1}_${processCycle}_$sysd.csv
	rm ${ReportDir}/${reportFileName1}_${processCycle}.csv

mailx -s "${send_msg}" -a ${ReportDir}/${reportFileName1}_${processCycle}_$sysd.csv "${mailList}" <<EOF
Dears,

   SR265840_Azure_Product_Report已產出。
   檔名：
   ${reportFileName_BL}.csv

EOF
}

function sendGenTempErrorMail
{
mailx -s "[${processCycle}]${progName} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  Please check ${progName} Flow !!!
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

###########################################################
#      main
###########################################################
echo "Gen SR265840_Azure_Product_Report Start" | tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

#Step1. split param
cycleYear=$(echo $processCycle | cut -c1-4)
cycleMonth=$(echo $processCycle | cut -c5-6)
cycleDate=$(echo $processCycle | cut -c7-8)
echo "CycleYear:"${cycleYear} "CycleMonth:"${cycleMonth} | tee -a ${logFile}

#Step 5.chek genTempData if have Error
grep -E 'ERROR|error|ORA|ora' ${logFile} | wc -l | read ora_err_cnt
if [[ ${ora_err_cnt} -eq 0 ]] ; then
	echo "database check success" | tee -a ${logFile}
	#Step 5.1 gen Report 1&2&3
	echo "Generate Real SR265840_Azure_Product_Report Report" | tee -a ${logFile} 
	cd $ReportDir
	 genSettlementReport $processCycle
else 
	#Step 5.2 send genTmep error message
	echo "Send GenTempDate Abnormal message"| tee -a ${logFile} 
	sendGenTempErrorMail
	exit 0
fi

#Step 6.formatter Report 
echo "Formatter formatterSettlementReport"|tee -a ${logFile}
formatterSettlementReport

echo "Check Generate Report"|tee -a ${logFile}

#Step 7.check gen report
filecnt1=`ls ${ReportDir}/${reportFileName1}_${processCycle}.csv|wc -l`
file1=${ReportDir}/${reportFileName1}_${processCycle}.csv

if [[ (${filecnt1} = 0 ) ]] ; then
	echo "${progName} Generated Report Have Abnormal"|tee -a ${logFile}
	sendGenTempErrorMail
	exit 0
else
	echo "FTP Report"|tee -a ${logFile}
	#echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName1}_${processCycle}.csv 0" | tee -a ${logFile}
	#	${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName1}_${processCycle}.csv 0
	echo "send SR213344_NPEP_Settlement_Report"|tee -a ${logFile}
	#Step 8. send final mail
	sendFinalMail
	echo "Move Report TO Bak"|tee -a ${logFile}
	mv ${ReportDir}/"${reportFileName1}_${processCycle}_$sysd.csv" ${ReportDirBak}
fi

echo "Gen SR265840_Azure_Product_Report End"|tee -a ${logFile}
echo $sysdate|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR266082_HGBN_UBL_ICT_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR266082_HGBN_UBL_ICT_Report.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2024/03/05 Create by Mike Kuan
# Description : SR266082_P266082 專案結束額度結餘報表、P266082-1 當月扣抵額度之ICT折扣動支明細表
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
#sysd=202303
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
ReportDirBak=$ReportDir/bak
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="P266082_ICT_Project_balance_of_own_service_`date +%Y%m%d`_HGBN"
reportFileName2="P266082-1_Own_service_changes_in_ICT_Project_`date +%Y%m%d`_HGBN"
utilDir=/cb/BCM/util
ftpProg=${utilDir}/Ftp2Remote.sh
#mailList="keroh@fareastone.com.tw mikekuan@fareastone.com.tw"
mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
putip1=10.64.16.58
#putpass1=unix11
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
putip1=10.64.18.122
#putpass1=unix11
;;
"pet-hgbap01p"|"pet-hgbap02p") #(PET)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.64.18.123
#putpass1=unix11
;;
"idc-hgbap01p"|"idc-hgbap02p") #(PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
putip1=10.64.16.102
#putpass1=`/cb/CRYPT/GetPw.sh UBL_UAR_FTP`
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
#FTP
putuser1=fareastone/cabsftp
putpass1=CabsQAws!!22
putpath1=/FTPService/Accounting/P266082

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool P266082.dat

select '系統別'||','||'Proposal ID'||','||'客戶名稱'||','||'Account ID'||','||'Service Type訖日'||','||'總信用額度'||','||'已使用信用額度'||','||'剩餘額度' from dual;

--/* Formatted on 2024/03/05 15:07 (Formatter Plus v4.8.8) */
--SELECT DECODE (d.CYCLE, 10, 'HGBN', 15, 'HGBN', 20, 'HGBN') "系統別",
--       va.proposal_id "Proposal ID", f.elem2 "客戶名稱", a.acct_id "Account ID",
--       DECODE (a.cur_bal_qty,
--               0, NVL (TO_CHAR (a.end_date, 'YYYY/MM/DD'),
--                       TO_CHAR (a.update_date, 'YYYY/MM/DD')
--                      ),
--               TO_CHAR (a.end_date, 'YYYY/MM/DD')
--              ) "Service Type訖日",
--       DECODE (init_pkg_qty,
--               0, (SELECT param_value
--                     FROM fy_tb_bl_offer_param
--                    WHERE param_name = 'BD_QUOTA_0001'
--                      AND acct_id = a.acct_id
--                      AND offer_instance_id = a.offer_instance_id),
--               init_pkg_qty
--              ) "總信用額度",
--       NVL (a.total_disc_amt, 0) "已使用信用額度",
--       NVL (a.cur_bal_qty,
--              DECODE (init_pkg_qty,
--                      0, (SELECT param_value
--                            FROM fy_tb_bl_offer_param
--                           WHERE param_name = 'BD_QUOTA_0001'
--                             AND acct_id = a.acct_id
--                             AND offer_instance_id = a.offer_instance_id),
--                      init_pkg_qty
--                     )
--            - NVL (a.total_disc_amt, 0)
--           ) "剩餘額度"
--  FROM fy_tb_bl_acct_pkg a,
--       fy_tb_cm_subscr b,
--       fy_tb_pbk_offer c,
--       fy_tb_cm_customer d,
--       (SELECT *
--          FROM fy_tb_cm_prof_link
--         WHERE link_type = 'A' AND prof_type = 'NAME') f,
--       (SELECT   CYCLE, MAX (bill_from_date) bill_from_date
--            FROM fy_tb_bl_bill_cntrl
--           WHERE CYCLE IN (10, 15, 20)
--        GROUP BY CYCLE) cntrl,
--       v_account va
-- WHERE a.offer_level = 'S'
--   AND d.CYCLE IN (10, 15, 20)
--   AND a.prepayment IS NOT NULL
--   AND a.offer_level_id = b.subscr_id
--   AND a.offer_id = c.offer_id
--   AND a.cust_id = d.cust_id
--   AND a.acct_id = f.entity_id
--   AND a.acct_id = va.account_id(+)
--   AND d.CYCLE = cntrl.CYCLE
----and (a.end_date >= cntrl.bill_from_date or a.end_date is null)
--;

SELECT    DECODE (d.CYCLE, 10, 'HGBN', 15, 'HGBN', 20, 'HGBN')
       || ','
       || va.proposal_id
       || ','
       || f.elem2
       || ','
       || a.acct_id
       || ','
       || DECODE (a.cur_bal_qty,
                  0, NVL (TO_CHAR (a.end_date, 'YYYY/MM/DD'),
                          TO_CHAR (a.update_date, 'YYYY/MM/DD')
                         ),
                  TO_CHAR (a.end_date, 'YYYY/MM/DD')
                 )
       || ','
       || DECODE (init_pkg_qty,
                  0, (SELECT param_value
                        FROM fy_tb_bl_offer_param
                       WHERE param_name = 'BD_QUOTA_0001'
                         AND acct_id = a.acct_id
                         AND offer_instance_id = a.offer_instance_id),
                  init_pkg_qty
                 )
       || ','
       || NVL (a.total_disc_amt, 0)
       || ','
       || NVL (a.cur_bal_qty,
                 DECODE (init_pkg_qty,
                         0, (SELECT param_value
                               FROM fy_tb_bl_offer_param
                              WHERE param_name = 'BD_QUOTA_0001'
                                AND acct_id = a.acct_id
                                AND offer_instance_id = a.offer_instance_id),
                         init_pkg_qty
                        )
               - NVL (a.total_disc_amt, 0)
              )
  FROM fy_tb_bl_acct_pkg a,
       fy_tb_cm_subscr b,
       fy_tb_pbk_offer c,
       fy_tb_cm_customer d,
       (SELECT *
          FROM fy_tb_cm_prof_link
         WHERE link_type = 'A' AND prof_type = 'NAME') f,
       (SELECT   CYCLE, MAX (bill_from_date) bill_from_date
            FROM fy_tb_bl_bill_cntrl
           WHERE CYCLE IN (10, 15, 20)
        GROUP BY CYCLE) cntrl,
       v_account va
 WHERE a.offer_level = 'S'
   AND d.CYCLE IN (10, 15, 20)
   AND a.prepayment IS NOT NULL
   AND a.offer_level_id = b.subscr_id
   AND a.offer_id = c.offer_id
   AND a.cust_id = d.cust_id
   AND a.acct_id = f.entity_id
   AND a.acct_id = va.account_id(+)
   AND d.CYCLE = cntrl.CYCLE;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function genReport2
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool P266082-1.dat

select '系統別'||','||'Proposal ID'||','||'客戶名稱'||','||'Account ID'||','||'跑帳日'||','||'折抵信用額度' from dual;

--/* Formatted on 2024/03/05 15:17 (Formatter Plus v4.8.8) */
--SELECT DECODE (d.CYCLE, 10, 'HGBN', 15, 'HGBN', 20, 'HGBN') "系統別",
--       va.proposal_id "Proposal ID", f.elem2 "客戶名稱", a.acct_id "Account ID",
--       TO_CHAR (cntrl.bill_date, 'YYYY/MM/DD') "跑帳日",
--       NVL ((SELECT SUM (bb.amount) * -1
--               FROM fy_tb_bl_bill_cntrl aa, fy_tb_bl_bill_ci bb
--              WHERE aa.bill_period =
--                                   TO_CHAR (ADD_MONTHS (SYSDATE, -2),
--                                            'yyyymm')
--                AND aa.bill_seq = bb.bill_seq
--                AND bb.SOURCE = 'DE'
--                AND bb.subscr_id = a.offer_level_id
--                AND bb.offer_id = a.offer_id
--                AND bb.offer_instance_id = a.offer_instance_id),
--            0
--           ) "折抵信用額度"
--  FROM fy_tb_bl_acct_pkg a,
--       fy_tb_cm_subscr b,
--       fy_tb_pbk_offer c,
--       fy_tb_cm_customer d,
--       (SELECT *
--          FROM fy_tb_cm_prof_link
--         WHERE link_type = 'A' AND prof_type = 'NAME') f,
--       (SELECT   CYCLE, ADD_MONTHS (MAX (bill_date), -2) bill_date
--            FROM fy_tb_bl_bill_cntrl
--           WHERE CYCLE IN (10, 15, 20)
--        GROUP BY CYCLE) cntrl,
--       v_account va
-- WHERE a.offer_level = 'S'
--   AND d.CYCLE IN (10, 15, 20)
--   AND a.prepayment IS NOT NULL
--   AND a.offer_level_id = b.subscr_id
--   AND a.offer_id = c.offer_id
--   AND a.cust_id = d.cust_id
--   AND a.acct_id = f.entity_id
--   AND a.acct_id = va.account_id(+)
--   AND d.CYCLE = cntrl.CYCLE;

/* Formatted on 2024/03/05 15:17 (Formatter Plus v4.8.8) */
SELECT    DECODE (d.CYCLE, 10, 'HGBN', 15, 'HGBN', 20, 'HGBN')
       || ','
       || va.proposal_id
       || ','
       || f.elem2
       || ','
       || a.acct_id
       || ','
       || TO_CHAR (cntrl.bill_date, 'YYYY/MM/DD')
       || ','
       || NVL ((SELECT SUM (bb.amount) * -1
                  FROM fy_tb_bl_bill_cntrl aa, fy_tb_bl_bill_ci bb
                 WHERE aa.bill_period =
                                   TO_CHAR (ADD_MONTHS (SYSDATE, -2),
                                            'yyyymm')
                   AND aa.bill_seq = bb.bill_seq
                   AND bb.SOURCE = 'DE'
                   AND bb.subscr_id = a.offer_level_id
                   AND bb.offer_id = a.offer_id
                   AND bb.offer_instance_id = a.offer_instance_id),
               0
              )
  FROM fy_tb_bl_acct_pkg a,
       fy_tb_cm_subscr b,
       fy_tb_pbk_offer c,
       fy_tb_cm_customer d,
       (SELECT *
          FROM fy_tb_cm_prof_link
         WHERE link_type = 'A' AND prof_type = 'NAME') f,
       (SELECT   CYCLE, ADD_MONTHS (MAX (bill_date), -2) bill_date
            FROM fy_tb_bl_bill_cntrl
           WHERE CYCLE IN (10, 15, 20)
        GROUP BY CYCLE) cntrl,
       v_account va
 WHERE a.offer_level = 'S'
   AND d.CYCLE IN (10, 15, 20)
   AND a.prepayment IS NOT NULL
   AND a.offer_level_id = b.subscr_id
   AND a.offer_id = c.offer_id
   AND a.cust_id = d.cust_id
   AND a.acct_id = f.entity_id
   AND a.acct_id = va.account_id(+)
   AND d.CYCLE = cntrl.CYCLE;

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function ftpReport2
{
ftp -i -n -v $1<<EOF
user $2 $3
pass
cd $4
mput $5
bye
EOF
}

function formatterReport
{
grep -v '^$' P266082.dat > ${ReportDir}/${reportFileName}.csv
rm P266082.dat
iconv -f utf8 -t big5 -c ${ReportDir}/${reportFileName}.csv > ${ReportDir}/${reportFileName}.big5
mv ${ReportDir}/${reportFileName}.big5 ${ReportDir}/${reportFileName}.csv
sleep 5
grep -v '^$' P266082-1.dat > ${ReportDir}/${reportFileName2}.csv
rm P266082-1.dat
iconv -f utf8 -t big5 -c ${ReportDir}/${reportFileName2}.csv > ${ReportDir}/${reportFileName2}.big5
mv ${ReportDir}/${reportFileName2}.big5 ${ReportDir}/${reportFileName2}.csv
}

function sendFinalMail
{
send_msg="<SR266082_HGBN_UBL_ICT_Report_P266082> $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${ReportDirBak}/${reportFileName}.csv ${mailList} <<EOF
Dears,

   SR266082_HGBN_UBL_ICT_Report_P266082已產出。
   檔名：
   ${reportFileName}.csv
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF

send_msg="<SR266082_HGBN_UBL_ICT_Report_P266082-1> $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${ReportDirBak}/${reportFileName2}.csv ${mailList} <<EOF
Dears,

   SR266082_HGBN_UBL_ICT_Report_P266082-1已產出。
   檔名：
   ${reportFileName2}.csv
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

function sendGenTempErrorMail
{
send_msg="<SR266082_HGBN_UBL_ICT_Report_P266082> $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR266082_HGBN_UBL_ICT_Report_P266082未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF

send_msg="<SR266082_HGBN_UBL_ICT_Report_P266082-1> $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR266082_HGBN_UBL_ICT_Report_P266082-1未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName} Start" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}
cd $ReportDir
genReport
sleep 5
echo "Gen ${reportFileName2} Start" | tee -a ${logFile}
genReport2
sleep 5
#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}


#check gen report
filecnt1=`ls ${ReportDir}/${reportFileName}.csv|wc -l`
sleep 5
if [[ (${filecnt1} = 0 ) ]] ; then
	echo "${progName} Generated Report Have Abnormal"|tee -a ${logFile}
	sendGenTempErrorMail
	exit 0
else
cd ${ReportDir}
	echo "FTP Report"|tee -a ${logFile}
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName}.csv 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName}.csv 0
	echo "Run Command: ${ftpProg} ${putip1} ${putuser1} ******** ${ReportDir} ${putpath1} ${reportFileName2}.csv 0" | tee -a ${logFile}
		${ftpProg} ${putip1} ${putuser1} ${putpass1} ${ReportDir} ${putpath1} ${reportFileName2}.csv 0
	
		#cd ${ReportDir}
	#ftpReport2 ${putip1} ${putuser1} ${putpass1} ${putpath1} "${reportFileName}.txt"
		
	echo "send SR250171_HGB_ESDP_UNBILL_Report"|tee -a ${logFile}

	echo "Move Report TO Bak"|tee -a ${logFile}
	mv "${reportFileName}.csv" ${ReportDirBak}
	mv "${reportFileName2}.csv" ${ReportDirBak}
	#send final mail
	sendFinalMail
fi
sleep 5

echo "Gen ${reportFileName} End" | tee -a ${logFile}
echo "Gen ${reportFileName2} End" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\SR276169_HGBN_BA_Close_Report.sh
```bash
#!/usr/bin/env bash
########################################################################################
# Program name : SR276169.sh
# Path : /extsoft/UBL/BL/Surrounding/RPT
#
# Date : 2024/10/23 Create by Mike Kuan
# Description : SR276169_HGBN_BA_Close_Report
########################################################################################

export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
progName=$(basename $0 .sh)
sysdt=`date +%Y%m%d%H%M%S`
sysd=`date +%Y%m --date="-1 month"`
#sysd=202303
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Surrounding/RPT
ReportDir=$WorkDir/report
ReportDirBak=$ReportDir/bak
LogDir=$WorkDir/log
logFile=$LogDir/${progName}_${sysdt}.log
tempFile=$LogDir/${progName}_tmp_${sysdt}.log
reportFileName="P276169_HGBN_BA_Close_Report_`date +%Y%m%d`"
utilDir=/cb/BCM/util
ftpProg=${utilDir}/Ftp2Remote.sh
mailList="huwechang@fareastone.com.tw chimihsu@fareastone.com.tw esung@fareastone.com.tw mikekuan@fareastone.com.tw"
#mailList="mikekuan@fareastone.com.tw"

#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
RPTDB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
RPTDB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
RPTDB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
RPTDB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p") #(PET)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
;;
"idc-hgbap01p"|"idc-hgbap02p") #(PROD)
DB="HGBBL"
RPTDB="HGBBLRPT"
OCS_AP="prdbl2"
#putpass1=`/cb/CRYPT/GetPw.sh UBL_UAR_FTP`
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function genReport
{
echo "Gen Report Start"|tee -a ${logFile}
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${logFile} <<EOF
set colsep ','
set echo off
set feedback off
set linesize 9999
set pagesize 50000
set sqlprompt ''
set trimspool on
set trimout on
set headsep off
set heading off

spool ${reportFileName}.dat

select 'CYCLE'||','||'ACCT_ID'||','||'AR_BALANCE'||','||'CREDIT_DATE'||','||'AMOUNT'||','||'CHARGE_CODE'||','||'CREDIT_REASON'||','||'CREDIT_ID' from dual;

--SELECT DISTINCT ba.cycle, ba.acct_id, fet1_account.ar_balance,
--                TO_CHAR (fet1_customer_credit.credit_date, 'YYYY/MM/DD'),
--                decode(fet1_customer_credit.tax_rate,0.05,round(fet1_customer_credit.amount*1.05,2),fet1_customer_credit.amount) AS amount,
--                fet1_customer_credit.charge_code AS charge_code,
--                fet1_customer_credit.credit_reason AS credit_reason,
--                TO_CHAR(fet1_customer_credit.credit_id) AS credit_id
--FROM (
--    SELECT * 
--    FROM fy_tb_bl_account ba
--    WHERE ba.BL_STATUS = 'CLOSE'
--) ba
--JOIN fy_Tb_bl_cycle bc ON bc.CYCLE = ba.CYCLE
--JOIN fet1_account ON ba.acct_id = fet1_account.account_id
--JOIN fet1_customer_credit ON fet1_account.partition_id = fet1_customer_credit.partition_id
--                         AND fet1_account.account_id = fet1_customer_credit.account_id
--JOIN fet1_credit_reason ON fet1_customer_credit.credit_reason = fet1_credit_reason.credit_reason_code
--WHERE bc.cycle IN (10, 15, 20)
--  AND fet1_customer_credit.credit_reason IS NOT NULL
--  AND fet1_customer_credit.credit_reason NOT IN (
--      SELECT refund_reason_code
--      FROM fet1_refund_reason
--      WHERE reversal_indicator = 'Y'
--  )
--  AND (
--      (fet1_credit_reason.category_code = 'D' AND fet1_customer_credit.credit_reason IN ('DP-0', 'DP-8'))
--      OR fet1_credit_reason.category_code != 'D'
--  )
--  AND fet1_customer_credit.credit_date >= trunc(add_months(sysdate, -1), 'MM')
--  AND fet1_customer_credit.charge_code not like 'ROUND%'
--UNION
--SELECT DISTINCT ba.cycle, ba.acct_id, fet1_account.ar_balance, TO_CHAR (ci.chrg_date, 'YYYY/MM/DD'), ci.amount, ci.charge_code,
--                'OC' credit_reason, 'N/A' credit_id
--           FROM (
--    SELECT * 
--    FROM fy_tb_bl_account ba
--    WHERE ba.BL_STATUS = 'CLOSE'
--) ba
--JOIN fy_Tb_bl_cycle bc ON bc.CYCLE = ba.CYCLE
--JOIN fy_tb_bl_bill_ci ci ON ba.acct_id = ci.acct_id
--JOIN fet1_account ON ba.acct_id = fet1_account.account_id
--            AND ci.bill_seq IS NULL
--            AND ci.chrg_date >= trunc(add_months(sysdate, -1), 'MM');

SELECT DISTINCT ba.cycle || ',' || ba.acct_id || ',' || fet1_account.ar_balance || ',' ||
                TO_CHAR (fet1_customer_credit.credit_date, 'YYYY/MM/DD') || ',' ||
                decode(fet1_customer_credit.tax_rate,0.05,round(fet1_customer_credit.amount*1.05,2),fet1_customer_credit.amount) || ',' ||
                fet1_customer_credit.charge_code || ',' ||
                fet1_customer_credit.credit_reason || ',' ||
                TO_CHAR(fet1_customer_credit.credit_id) xx
FROM (
    SELECT * 
    FROM fy_tb_bl_account ba
    WHERE ba.BL_STATUS = 'CLOSE'
) ba
JOIN fy_Tb_bl_cycle bc ON bc.CYCLE = ba.CYCLE
JOIN fet1_account ON ba.acct_id = fet1_account.account_id
JOIN fet1_customer_credit ON fet1_account.partition_id = fet1_customer_credit.partition_id
                         AND fet1_account.account_id = fet1_customer_credit.account_id
JOIN fet1_credit_reason ON fet1_customer_credit.credit_reason = fet1_credit_reason.credit_reason_code
WHERE bc.cycle IN (10, 15, 20)
  AND fet1_customer_credit.credit_reason IS NOT NULL
  AND fet1_customer_credit.credit_reason NOT IN (
      SELECT refund_reason_code
      FROM fet1_refund_reason
      WHERE reversal_indicator = 'Y'
  )
  AND (
      (fet1_credit_reason.category_code = 'D' AND fet1_customer_credit.credit_reason IN ('DP-0', 'DP-8'))
      OR fet1_credit_reason.category_code != 'D'
  )
  AND fet1_customer_credit.credit_date >= trunc(add_months(sysdate, -1), 'MM')
  AND fet1_customer_credit.charge_code not like 'ROUND%'
UNION
SELECT DISTINCT ba.cycle || ',' || ba.acct_id || ',' || fet1_account.ar_balance || ',' || TO_CHAR (ci.chrg_date, 'YYYY/MM/DD') || ',' || ci.amount || ',' || ci.charge_code || ',' || 'OC' || ',' || 'N/A' xx
           FROM (
    SELECT * 
    FROM fy_tb_bl_account ba
    WHERE ba.BL_STATUS = 'CLOSE'
) ba
JOIN fy_Tb_bl_cycle bc ON bc.CYCLE = ba.CYCLE
JOIN fy_tb_bl_bill_ci ci ON ba.acct_id = ci.acct_id
JOIN fet1_account ON ba.acct_id = fet1_account.account_id
            AND ci.bill_seq IS NULL
            AND ci.chrg_date >= trunc(add_months(sysdate, -1), 'MM');

spool off

exit;

EOF`

echo "Gen Report End"|tee -a ${logFile}
}

function formatterReport
{
grep -v '^$' ${reportFileName}.dat > ${ReportDir}/${reportFileName}.csv
rm ${reportFileName}.dat
}

function sendFinalMail
{
send_msg="<SR276169>HGBN_BA_Close_Report $sysd"
	#iconv -f utf8 -t big5 -c ${reportFileName}.txt > ${reportFileName}.big5
	#mv ${reportFileName}.big5 ${reportFileName}.txt
	#rm ${reportFileName}.dat
mailx -s "${send_msg}" -a ${ReportDirBak}/${reportFileName}.csv ${mailList} <<EOF
Dears,

   SR276169已產出。
   檔名：
   ${reportFileName}.csv
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

function sendGenTempErrorMail
{
send_msg="<SR276169>HGBN_BA_Close_Report $sysd"
mailx -s "${send_msg} Gen Data Have Abnormal " ${mailList} <<EOF
Dear All,
  
  SR276169未產出。
  
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
(Note: Please do not reply to messages sent automatically.)
EOF
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
echo "Gen ${reportFileName} Start" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}
cd $ReportDir
genReport
sleep 5
#formatter Report 
echo "Formatter Report Start"|tee -a ${logFile}
formatterReport
echo "Formatter Report End"|tee -a ${logFile}


#check gen report
filecnt1=`ls ${ReportDir}/${reportFileName}.csv|wc -l`
sleep 5
if [[ (${filecnt1} = 0 ) ]] ; then
	echo "${progName} Generated Report Have Abnormal"|tee -a ${logFile}
	sendGenTempErrorMail
	exit 0
else
	echo "Move Report TO Bak"|tee -a ${logFile}
	mv "${reportFileName}.csv" ${ReportDirBak}
	sendFinalMail
fi
sleep 5

echo "Gen ${reportFileName} End" | tee -a ${logFile}
echo $sysdt|tee -a ${logFile}

```

## UBL\BL\Surrounding\RPT\conf\SR223576_Cloud_Service_Report_mail.conf
```text
sender="HGB"
#######################################
## SR223576_Cloud_Service_Report
## Test
#recipientHJ="sharonlin@fareastone.com.tw"
#subsidiaryHJ=""
## Prod
recipientHJ="sharonlin@fareastone.com.tw"
subsidiaryHJ="sharonlin@fareastone.com.tw"

```

## UBL\BL\Surrounding\RPT\conf\SR223576_Cloud_Service_Report_SQL.conf
```text
#monitorlist="01,02"
monitorlist="01"
#
#
#
## SUMMARY
sqlsyntaxTb01="SR223576_Cloud_Service_Report"
sqlsyntaxCnt01="select 1 from dual"
sqlsyntax01="SELECT H.PROD_NAME \"產品名稱\",
        G.OFFER_NAME, 
        F.CHARGE_DESCR, 
        E.ELEM6 \"統一編號\",
        A.BILL_PERIOD \"出帳年月\",
        F.AMOUNT||'    ' \"營收(含稅)\",
        E.elem2 \"客戶名稱\",
         D.RESOURCE_VALUE \"AWS_ID/GCP_ID\", 
         H.SALES_ID||'-'||H.SALES_NAME_CHT \"業務員\",
         TO_CHAR(H.SUBSCR_ID)||'  ' "客戶編號",
         H.CHRG_DT \"開通日\",
         TO_CHAR(H.DAAB_DT)||'          ' \"停用/暫斷日\"
           FROM FY_TB_BL_BILL_CNTRL A,
                FY_TB_CM_SUBSCR C,
                FY_TB_CM_RESOURCE D,
                FY_TB_CM_PROF_LINK E,
                (SELECT DISTINCT SUBSCR_ID, OFFER_SEQ, ACCT_ID,
                                 FIRST_VALUE (PARAM_VALUE) OVER (PARTITION BY SUBSCR_ID ORDER BY SEQ_NO DESC)
                                                               AS PARAM_VALUE
                            FROM FY_TB_CM_OFFER_PARAM
                           WHERE PARAM_NAME IN ('AWSNAME','NAME')) D1,
                FY_TB_BL_BILL_BI F,
                FY_TB_PBK_OFFER G,
                V_SUBSCR_INFO H
   WHERE C.ACCT_ID = E.ENTITY_ID
     AND F.CHARGE_CODE NOT LIKE 'ROUND%'
     AND E.ENTITY_TYPE = 'A'
     AND E.PROF_TYPE = 'NAME'
     AND E.LINK_TYPE = 'A'
     AND C.SUBSCR_ID = D.SUBSCR_ID
     AND C.SUBSCR_ID = D1.SUBSCR_ID(+)
     AND C.SUBSCR_ID(+) = F.SUBSCR_ID
     AND C.ACCT_ID = F.ACCT_ID
     AND D.RESOURCE_PRM_CD IN ('AWSID','GCPID')
     AND A.CYCLE = 10
     AND A.BILL_SEQ = F.BILL_SEQ
     AND F.OFFER_ID = G.OFFER_ID
     AND F.SUBSCR_ID = H.BILLING_SUBSCR_ID(+)
	 AND A.BILL_PERIOD = TO_CHAR(ADD_MONTHS(SYSDATE,-1),'YYYYMM')
GROUP BY H.PROD_NAME,
         H.BILLING_SUBSCR_ID,
         C.SUBSCR_ID,
         A.BILL_PERIOD,
         G.OFFER_NAME,
         F.CHARGE_DESCR,
         E.ELEM6,
         F.CYCLE_MONTH,
         F.AMOUNT,
         D.RESOURCE_VALUE,
         E.ELEM2,
		 H.SALES_ID,
         H.SALES_NAME_CHT,
         H.SUBSCR_ID,
         H.CHRG_DT,
         H.DAAB_DT
ORDER BY A.BILL_PERIOD, E.ELEM2"
#
### DETAIL
sqlsyntaxTb02="DETAIL"
##sqlsyntaxCnt02="select count(1) as cnt from fy_tb_cm_account where (create_date between to_date('${reportStartTime}', 'YYYY-MM-DD HH24:MI:SS') and to_date('${reportEndTime}', 'YYYY-MM-DD HH24:MI:SS')) or (update_date between to_date('${reportStartTime}', 'YYYY-MM-DD HH24:MI:SS') and to_date('${reportEndTime}', 'YYYY-MM-DD HH24:MI:SS'))"
sqlsyntax02="SELECT   to_char(a.bill_date,'yyyymmdd') Bill_Date, a.CYCLE, a.bill_seq, substr(a.bill_period,1,4) as "BILL_YEAR", substr(a.bill_period,5,6) as "BILL_MONTH",
         e.prim_resource_val as "CID", b.acct_id as "ACCT", to_char(c.eff_date,'YYYY/MM/DD HH24:MI:SS') as "ACCT_EFF_DATE",
         f.elem2 as "NAME", NVL (e.COUNT, 0) as "DEVICE_COUNT", b.chrg_amt as "CHARGE_AMOUNT"
    FROM fy_tb_bl_bill_cntrl a,
         fy_tb_bl_bill_mast b,
         fy_tb_cm_account c,
         fy_tb_cm_subscr d,
         fet_tb_bl_device_count e,
         (SELECT *
            FROM fy_tb_cm_prof_link
           WHERE link_type = 'S' AND prof_type = 'NAME') f
   WHERE a.bill_seq = b.bill_seq
     AND a.bill_seq = e.bill_seq(+)
     AND b.acct_id = c.acct_id
     AND b.acct_id = d.acct_id
     AND b.CYCLE = e.CYCLE(+)
     AND d.prim_resource_val = e.prim_resource_val(+)
     AND d.subscr_id = f.entity_id
	 and a.cycle = 50
	 and a.bill_date = TO_DATE ('${BillDate}', 'yyyymmdd')
ORDER BY b.acct_id, e.COUNT"

```

## UBL\BL\Surrounding\RPT\template\template_SR223576_Cloud_Service_Report.html
```text
From: %sender%
To: %recipient%
%subsidiary%
Subject: [HGB]SR223576_Cloud_Service_Report (%sysdt%)
X-Priority: 3
Mime-Version: 1.0
Content-Type: text/html; charset="UTF-8";

<!doctype html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html charset=TRADITIONAL CHINESE_TAIWAN.AL32UTF8" />
<title>HGB_Summary_Report</title>
<!-- Required meta tags -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
<style>
body {
	font-family: "儷黑 Pro", "微軟正黑體", "標楷體", "新細明體", Helvetica, Arial, 'lucida grande', tahoma, verdana, sans-serif;
	font-size: 11px;
}

table {
	border-collapse: collapse;
	width: 100%;
}

table td, table th {
	/* border: 1px solid #ddd; */
	padding: 2px;
}

table tr:nth-child(even){background-color: #f2f2f2;}

table tr:hover {background-color: #ddd;}

table th {
	padding-top: 1px;
	padding-bottom: 1px;
	text-align: center;
	background-color: #3b7ec4;
	color: white;
}

table td {
	margin: 0 1px 0 1px;
}

.tb-wd-1 {
	width:100%;
}
.tb-wd-2 {
	width:100%;
}
.tb-wd-3 {
	width:100%;
}
.tb-wd-4 {
	width:100%;
}
.tb-wd-5 {
	width:100%;
}
.tb-wd-6 {
	width:100%;
}
.tb-wd-7 {
	width:100%;
}
.tb-wd-8 {
	width:100%;
}
.tb-wd-9 {
	width:100%;
}
.tb-wd-10 {
	width:100%;
}
.tb-wd-11 {
	width:100%;
}
.tb-wd-12 {
	width:100%;
}

.tb-wd-1 td, .tb-wd-2 td, .tb-wd-3 td, .tb-wd-4 td, .tb-wd-5 td, .tb-wd-6 td, .tb-wd-7 td, .tb-wd-8 td, .tb-wd-9 td, .tb-wd-10 td, .tb-wd-11 td, .tb-wd-12 td,
.tb-wd-1 th, .tb-wd-2 th, .tb-wd-3 th, .tb-wd-4 th, .tb-wd-5 th, .tb-wd-6 th, .tb-wd-7 th, .tb-wd-8 th, .tb-wd-9 th, .tb-wd-10 th, .tb-wd-11 th, .tb-wd-12 th {
	border: 1px solid #ddd;
}

p {
	margin: 0;
}

blockquote {
	margin: 20px;padding: 10px;
	background-color: #eeeeee;
	border-left: 5px solid #00aae1;
	margin: 15px 30px 0 10px;
	padding-left: 20px;border-radius: 6px;
}
</style>
</head>
<body>
<h3>[HGB]SR223576_Cloud_Service_Report</h3>
<p> </p>
<!--%tablecontent%-->
<p>&nbsp;</p>
%tablecontentRt%
</body>
</html>
```

## UBL\BL\Undo\bin\HGB_UBL_Undo_STATUS_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Undo.sh
--# Path : /extsoft/UBL/BL/Undo/bin
--# SQL name : HGB_UBL_Undo_STATUS_Check.sql
--#
--# Date : 2018/09/19 Created by Mike Kuan
--# Description : HGB UBL Undo
--########################################################################################
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := '&4'; 
  CH_USER          VARCHAR2(8)  := 'UBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1(ibill_seq number, iacct_group varchar2) IS
     select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_acct_list a,
			fy_tb_bl_bill_acct b
	  where a.bill_seq=ibill_seq
	    and a.type    =iacct_group
	    and b.bill_seq=a.bill_seq
	    and b.acct_id =a.acct_id
		and v_PROCESS_NO=999
	  group by b.bill_status
	union
      select distinct bill_status status, count(1) cnt
	   from fy_tb_bl_bill_acct b
	  where b.bill_seq   =ibill_seq
	    and b.acct_group =iacct_group
		and v_PROCESS_NO<>999
	  group by b.bill_status;	
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date =to_date(v_BILL_DATE,'yyyymmdd')
   and a.cycle=v_CYCLE
   AND A.CREATE_USER =CH_USER;
  FOR R1 IN C1(nu_bill_seq,CH_ACCT_GROUP) LOOP
     DBMS_OUTPUT.Put_Line('Undo_STATUS_Check Status='||r1.status||', Cnt='||to_char(r1.cnt));  
  end loop; 
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Undo_STATUS_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## UBL\BL\Undo\bin\HGB_UBL_Undo_STEP_Check.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Undo.sh
--# Path : /extsoft/UBL/BL/Undo/bin
--# SQL name : HGB_UBL_Undo_STEP_Check.sql
--#
--# Date : 2018/09/19 Created by Mike Kuan
--# Description : HGB UBL Undo
--########################################################################################
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off

declare
  v_BILL_DATE      VARCHAR2(8)  := '&1';
  v_CYCLE          NUMBER(2)    := '&2';
  v_PROCESS_NO     NUMBER(3)    := '&3';
  v_PROC_TYPE      VARCHAR2(1)  := '&4';
  CH_USER          VARCHAR2(8)  := 'UBL';
  nu_bill_seq      number;
  CH_ACCT_GROUP    FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
  CH_STEP          VARCHAR2(4);
  CURSOR C1 IS
     SELECT DECODE(STATUS,'CL','CI',
                   'CI','BI',
                   'BI','MAST',
                   'MAST','CN',
                   'CN','END',STATUS) STEP                            
       FROM FY_TB_BL_BILL_PROCESS_LOG BL 
      WHERE BILL_SEQ  = nu_BILL_SEQ
        AND PROCESS_NO= v_PROCESS_NO
        AND ACCT_GROUP= CH_ACCT_GROUP
        AND PROC_TYPE = v_PROC_TYPE
        AND BEGIN_TIME= (SELECT MAX(BEGIN_TIME) from FY_TB_BL_BILL_PROCESS_LOG 
                                           WHERE BILL_SEQ  = BL.BILL_SEQ
                                             AND PROCESS_No= BL.PROCESS_NO
                                             AND ACCT_GROUP= BL.ACCT_GROUP
                                             AND PROC_TYPE = BL.PROC_TYPE)
     order by DECODE(STATUS,'CL',1,'CI',2,'BI',3,'MAST',4,'CN',5,0) DESC; 
     R1     C1%ROWTYPE;
begin
  select bill_SEQ,
        (CASE WHEN v_PROCESS_NO<>999 THEN 
              (SELECT ACCT_GROUP
                   FROM FY_TB_BL_CYCLE_PROCESS
                  WHERE CYCLE     =v_CYCLE
                    AND PROCESS_NO=v_PROCESS_NO)
         ELSE
            (SELECT DECODE(v_PROC_TYPE,'B','HOLD','QA')
                FROM DUAL)           
         END) ACCT_GROUP
    into nu_bill_seq, CH_ACCT_GROUP
    from fy_tb_bl_bill_cntrl A
   where A.bill_date=to_date(v_BILL_DATE,'yyyymmdd')
   and a.cycle=v_CYCLE
   and A.CREATE_USER=CH_USER;
  OPEN C1;
  FETCH C1 INTO R1;
  IF C1%NOTFOUND THEN  
     CH_STEP :='CI';
  ELSE
     CH_STEP := R1.STEP;
  END IF;
  CLOSE C1;
  IF CH_STEP NOT IN ('CI','BI','MAST','CN') THEN
     IF v_PROCESS_NO=999 AND v_PROC_TYPE='B' AND CH_STEP='END' THEN
        DBMS_OUTPUT.Put_Line(CH_STEP);
     ELSE   
        DBMS_OUTPUT.Put_Line('Undo_STEP_Check Process RETURN_CODE = 9999'); 
     END IF;   
  ELSE   
     DBMS_OUTPUT.Put_Line(CH_STEP);
  END IF;   
EXCEPTION 
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Undo_STEP_Check Process RETURN_CODE = 9999'); 
end;
/  

```

## UBL\BL\Undo\bin\HGB_UBL_Undo.sh
```bash
#!/usr/bin/ksh
########################################################################################
# Program name : HGB_UBL_Undo.sh
# Path : /extsoft/UBL/BL/Undo/bin
#
# Date : 2018/09/19 Created by Mike Kuan
# Description : HGB UBL Undo
########################################################################################
# Date : 2018/09/28 Modify by Mike Kuan
# Description : add Status Check
########################################################################################
# Date : 2018/11/06 Modify by Mike Kuan
# Description : add grep condiation
########################################################################################
# Date : 2018/11/26 Modify by Mike Kuan
# Description : add MPC
########################################################################################
# Date : 2019/06/30 Modify by Mike Kuan
# Description : SR213344_NPEP add cycle parameter
########################################################################################
# Date : 2021/02/20 Modify by Mike Kuan
# Description : SR222460_MPBS migrate to HGB
########################################################################################

#---------------------------------------------------------------------------------------#
#      env
#---------------------------------------------------------------------------------------#
progName="HGB_UBL_Undo"
sysdt=`date +%Y%m%d%H%M%S`
BillDate=$1
ProcType=$2
ProcessNo=$3
Cycle=$4
HomeDir=/extsoft/UBL/BL
WorkDir=$HomeDir/Undo/bin
LogDir=$HomeDir/Undo/log
LogFile=$LogDir/${progName}_${sysdt}.log
AutoWatchDir=$LogDir/joblog
AutoWatchFile=$AutoWatchDir/${BillDate}_${progName}.log
MailList=$HomeDir/MailList.txt
smsList=$HomeDir/smsList.txt
smsProg=/cb/BCM/util/SendSms.sh
#---------------------------------------------------------------------------------------#
#      MPC info
#---------------------------------------------------------------------------------------#
hostname=`hostname`
case ${hostname} in
"pc-hgbap01t") #(TEST06) (PT)
DB="HGBDEV2"
OCS_AP="fetwrk26"
;;
"hgbdev01t") #(TEST06) (PT)
DB="HGBDEV3"
OCS_AP="fetwrk26"
;;
"pc-hgbap11t") #(TEST15) (SIT)
DB="HGBBLSIT"
OCS_AP="fetwrk15"
;;
"pc-hgbap21t") #(TEST02) (UAT)
DB="HGBBLUAT"
OCS_AP="fetwrk21"
;;
"pet-hgbap01p"|"pet-hgbap02p"|"idc-hgbap01p"|"idc-hgbap02p") #(PET) (PROD)
DB="HGBBL"
OCS_AP="prdbl2"
;;
*)
echo "Unknown AP Server"
exit 0
esac
DBID=`/cb/CRYPT/GetId.sh $DB`
DBPWD=`/cb/CRYPT/GetPw.sh $DB`
OCSID=`/cb/CRYPT/GetId.sh $OCS_AP`
OCSPWD=`/cb/CRYPT/GetPw.sh $OCS_AP`

#---------------------------------------------------------------------------------------#
#      function
#---------------------------------------------------------------------------------------#
function Pause #讀秒
{
for i in `seq 1 1 5`;
do
echo "." | tee -a $LogFile
sleep 1
done
}

function HGB_UBL_Undo_STEP_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STEP.data <<EOF
@HGB_UBL_Undo_STEP_Check.sql $1 $2 $3 $4
EOF`
cat ${LogDir}/${progName}_STEP.data |read STEP
echo "Step or Message: ${STEP}" | tee -a ${LogFile}
}

function HGB_UBL_Undo_STATUS_Check
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} > ${LogDir}/${progName}_STATUS.data <<EOF
@HGB_UBL_Undo_STATUS_Check.sql $1 $2 $3 $4
EOF`
cat ${LogDir}/${progName}_STATUS.data | tee -a ${LogFile}
}

function HGB_UBL_Undo
{
`sqlplus -s ${DBID}/${DBPWD}@${DB} >> ${LogFile} <<EOF
@HGB_UBL_Undo.sql $1 $2 $3 $4
exit
EOF`
}

function AutoWatch
{
checksum=$1
AutoWatchDate=`date '+%Y/%m/%d-%H:%M:%S'`
touch $AutoWatchFile
if [[ $checksum -eq 1 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Failed)" | tee -a $LogFile
   echo "${progName},Abnormal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   sendMail 0
   echo "Send Mail (Failed)" | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
		sendSMS 0
		echo "Send SMS (Failed)" | tee -a $LogFile
   fi
elif [[ $checksum -eq 0 ]]; then
   echo '' | tee -a $LogFile
   echo "Send AutoWatch (Successed)" | tee -a $LogFile
   echo "${progName},Normal,${AutoWatchDate}" >> $AutoWatchFile
   echo '' | tee -a $LogFile
   sendMail 1
   echo "Send Mail (Successed)" | tee -a $LogFile
   if [[ $DB = "HGBBL" ]]; then
		sendSMS 1
		echo "Send SMS (Successed)" | tee -a $LogFile
   fi
fi

#if [[ $DB = "HGBBL" ]]; then
#ftp -nv 10.68.8.37 <<EOF
#user $OCSID $OCSPW
#prompt off
#ascii
#cd /cb/AutoWatch/log/joblog
#put $AutoWatchFile
#bye
#EOF
#fi

exit 0;
}

function sendMail
{
type=$1
cd ${LogDir}
iconv -f utf8 -t big5 -c ${LogFile} > ${LogFile}.big5
mv ${LogFile}.big5 ${LogFile}
maillist=`cat $MailList`

if [[ $type -eq 1 ]]; then
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Normal" -a ${LogFile} ${maillist} << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Successed.
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
else
mailx -r "HGB_UBL" -s "${progName} Bill_Date:${BillDate} CYCLE:${Cycle} ProcessNo:${ProcessNo} Abnormal" -a ${LogFile} ${maillist}  << EOF
Dears,
   ${progName} CYCLE:${Cycle} Bill_Date:${BillDate} ProcessNo:${ProcessNo} Failed, Please check!!!
   
(請注意：此郵件為系統自動傳送，請勿直接回覆！)
EOF
fi
}

function sendSMS
{
type=$1
	errorMessage=" Abnormal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	okMessage=" Normal! ${BillDate} ${Cycle} ${ProcessNo} ${progName}"
	smslist=`cat $smsList`
	
echo '' | tee -a $LogFile
sysdt_END=`date '+%Y/%m/%d-%H:%M:%S'`
echo "${sysdt_END} ------------------------------END ${progName}------------------------------" | tee -a $LogFile
echo '' | tee -a $LogFile

if [[ $type -eq 1 ]]; then
	${smsProg} "${okMessage}" "${smsList}"
else
	${smsProg} "${errorMessage}" "${smsList}"
fi
}

#---------------------------------------------------------------------------------------#
#      main
#---------------------------------------------------------------------------------------#
usage()
{
	echo "Usage:"
	echo " $0 <BILL_DATE> <PROC_TYPE> <PROCESS_NO> <CYCLE>"
	echo ""
    echo "For QA example: $0 20190701 T 999 50"
    echo "For PROD example: $0 20190701 B 001 50"
    echo "For PROD example: $0 20190701 B 002 50"
    echo "For PROD example: $0 20190701 B 003 50"
    echo "For PROD example: $0 20190701 B 004 50"
    echo "For PROD example: $0 20190701 B 005 50"
    echo "For PROD example: $0 20190701 B 006 50"
    echo "For PROD example: $0 20190701 B 007 50"
    echo "For PROD example: $0 20190701 B 008 50"
    echo "For PROD example: $0 20190701 B 009 50"
    echo "For PROD example: $0 20190701 B 010 50"
    echo "For PROD_MV example: $0 20190701 B 888 50"
    echo "For HOLD example: $0 20190701 B 999 50"
	echo ""
}

if [[ $# -lt 4 ]]; then
  usage
  exit 0
fi

sysdt_BEGIN=`date '+%Y/%m/%d-%H:%M:%S'`
echo '' | tee -a $LogFile
echo "${sysdt_BEGIN} ------------------------------BEGIN ${progName}------------------------------" | tee -a $LogFile
echo "HGB_DB_ENV : ${DB}" | tee -a $LogFile
echo "OCS_AP_ENV : ${OCS_AP}" | tee -a $LogFile
echo "BILL_DATE : ${BillDate}" | tee -a $LogFile
echo "CYCLE : ${Cycle}" | tee -a $LogFile
echo "PROC_TYPE : ${ProcType}" | tee -a $LogFile
echo "PROCESS_NO : ${ProcessNo}" | tee -a $LogFile
echo '' | tee -a $LogFile
cd ${WorkDir}
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Undo Step Check
echo "----->>>>>-----Step 1. Run Undo Step Check Process (Start...)" | tee -a $LogFile
HGB_UBL_Undo_STEP_Check $BillDate $Cycle $ProcessNo $ProcType
checkcode=`cat ${LogDir}/${progName}_STEP.data|grep -E 'ORA|ora|Undo_STEP_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 1. Run Undo Step Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 1. Run Undo Step Check Process (End... Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Undo STATUS Check
echo "----->>>>>-----Step 2. Run Undo STATUS Check Process (Start...)" | tee -a $LogFile
HGB_UBL_Undo_STATUS_Check $BillDate $Cycle $ProcessNo $ProcType
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Undo_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 2. Run Undo STATUS Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 2. Run Undo STATUS Check Process (End... Successed)" | tee -a $LogFile
Pause
#----------------------------------------------------------------------------------------------------
#if [[ ${STEP} == 'CN' || ${STEP} == 'MAST' || ${STEP} == 'BI' ]]; then
#------------執行Undo
	echo "----->>>>>-----Step 3. Run Undo Process (Start...)" | tee -a $LogFile
	HGB_UBL_Undo $BillDate $Cycle $ProcessNo $ProcType
	checkcode=`cat ${LogFile}|grep -E 'ORA|ora|Process RETURN_CODE = 9999'|wc -l`
		if [[ $checkcode -ge 1 ]]; then
			echo "-----<<<<<-----Step 3. Run Undo Process (End...Failed)" | tee -a $LogFile
			AutoWatch 1
		else
			echo '' | tee -a $LogFile
			echo "-----<<<<<-----Step 3. Run Undo Process (End... Successed)" | tee -a $LogFile
		fi
Pause
#----------------------------------------------------------------------------------------------------
#------------執行Undo STATUS Check
echo "----->>>>>-----Step 4. Run Undo STATUS Check Process (Start...)" | tee -a $LogFile
HGB_UBL_Undo_STATUS_Check $BillDate $Cycle $ProcessNo $ProcType
checkcode=`cat ${LogDir}/${progName}_STATUS.data|grep -E 'ORA|ora|Undo_STATUS_Check Process RETURN_CODE = 9999'|wc -l`
if [[ $checkcode -ge 1 ]]; then
  echo "-----<<<<<-----Step 4. Run Undo STATUS Check Process (End...Failed)" | tee -a $LogFile
  AutoWatch 1
fi
echo "-----<<<<<-----Step 4. Run Undo STATUS Check Process (End... Successed)" | tee -a $LogFile

AutoWatch 0

```

## UBL\BL\Undo\bin\HGB_UBL_Undo.sql
```sql
--########################################################################################
--# Program name : HGB_UBL_Undo.sh
--# Path : /extsoft/UBL/BL/Undo/bin
--# SQL name : HGB_UBL_Undo.sql
--#
--# Date : 2018/09/19 Created by Mike Kuan
--# Description : HGB UBL Undo
--########################################################################################
--# Date : 2019/06/30 Modify by Mike Kuan
--# Description : SR213344_NPEP add cycle parameter
--########################################################################################
--# Date : 2021/02/20 Modify by Mike Kuan
--# Description : SR222460_MPBS migrate to HGB
--########################################################################################

SET serveroutput ON SIZE 1000000
set verify off
declare 
v_BILL_DATE 	  VARCHAR2(8)  := '&1';
v_CYCLE           NUMBER(2)    := '&2';
v_PROCESS_NO      NUMBER(3)    := '&3';
v_PROC_TYPE       VARCHAR2(1)  := '&4';
CH_USER           VARCHAR2(8)  := 'UBL';
NU_CYCLE          NUMBER(2);
CH_BILL_PERIOD    VARCHAR2(6);
NU_CYCLE_MONTH    NUMBER(2);
NU_BILL_SEQ       NUMBER;
CH_ACCT_GROUP     FY_TB_BL_CYCLE_PROCESS.ACCT_GROUP%TYPE;
CH_ERR_CDE        VARCHAR2(10);
CH_ERR_MSG        VARCHAR2(300);
On_Err            EXCEPTION;
begin 
	 CH_ERR_MSG := 'GET BILL_CNTRL:';
   SELECT A.CYCLE, A.BILL_PERIOD, A.BILL_SEQ, A.CYCLE_MONTH, DECODE(V_PROCESS_NO,999,DECODE(V_PROC_TYPE,'T','QA',B.ACCT_GROUP),B.ACCT_GROUP)
     INTO NU_CYCLE, CH_BILL_PERIOD, NU_BILL_SEQ, NU_CYCLE_MONTH, CH_ACCT_GROUP
     FROM FY_TB_BL_BILL_CNTRL A,
          FY_TB_BL_CYCLE_PROCESS B
    WHERE TO_CHAR(A.BILL_DATE,'YYYYMMDD')=v_BILL_DATE
	  AND A.CREATE_USER=CH_USER
	  --AND A.CREATE_USER=B.CREATE_USER
      AND B.cycle=v_CYCLE
	  AND B.CYCLE=A.CYCLE
      AND B.PROCESS_NO=v_PROCESS_NO;
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':UNDO BEGIN');
   --update fy_tb_bl_bill_acct										
   FY_PG_BL_BILL_UNDO.MAIN(NU_BILL_SEQ,
                           v_PROCESS_NO,
                           CH_ACCT_GROUP,
                           v_PROC_TYPE,
                           CH_USER, 
                           CH_ERR_CDE, 
                           CH_ERR_MSG); 
   IF CH_ERR_CDE<>'0000' THEN
      CH_ERR_MSG := 'FY_PG_BL_BILL_CI:'||CH_ERR_MSG;
      RAISE ON_ERR;
   END IF;
   if v_PROCESS_NO=999 and v_PROC_TYPE='B' then
      update fy_tb_bl_bill_acct a set acct_group='HOLD'
	                    where bill_seq   =nu_bill_seq
						  and cycle      =nu_cycle
						  and cycle_month=nu_cycle_month
						  and acct_key   =mod(acct_id,100)
						  and bill_status <>'CN'
						  and exists (select 1 from fy_tb_bl_acct_list
						                  where bill_seq=nu_bill_seq
										    and type=ch_acct_group
											and acct_id=a.acct_id);
   commit;
   end if;	
   DBMS_OUTPUT.Put_Line(TO_CHAR(SYSDATE,'YYYY-MM-DD HH:MI:SS')||':UNDO END');   
	 DBMS_OUTPUT.Put_Line(CH_ERR_CDE||CH_ERR_MSG);  
EXCEPTION 
   WHEN ON_ERR THEN
       DBMS_OUTPUT.Put_Line('Undo Process RETURN_CODE = 9999');
   WHEN OTHERS THEN
       DBMS_OUTPUT.Put_Line('Undo Process RETURN_CODE = 9999'); 
end;
/

exit;
```

