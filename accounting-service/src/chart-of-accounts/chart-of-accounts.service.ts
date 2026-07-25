import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ChartOfAccountsService {
  constructor(private readonly dataSource: DataSource) {}

  accounts() {
    return this.dataSource.query(
      `SELECT account_code AS "accountCode",account_name AS "accountName",
              account_type AS "accountType",normal_balance AS "normalBalance",
              statement_section AS "statementSection",
              parent_account_code AS "parentAccountCode",display_order AS "displayOrder",
              is_control_account AS "isControlAccount",is_active AS "isActive"
       FROM public.sw_tbl_gl_account ORDER BY display_order,account_code`,
    );
  }

  mappings() {
    return this.dataSource.query(
      `SELECT mapping.wallet_code AS "walletCode",wallet."Wallet_Name" AS "walletName",
              wallet."Wallet_Type" AS "walletClass",mapping.gl_account_code AS "glAccountCode",
              account.account_name AS "glAccountName",
              mapping.is_safeguarded AS "isSafeguarded",mapping.is_active AS "isActive"
       FROM public.sw_tbl_wallet_gl_mapping mapping
       JOIN public."SW_TBL_WALLET_TYPE" wallet ON wallet."Wallet_ID"=mapping.wallet_code
       JOIN public.sw_tbl_gl_account account ON account.account_code=mapping.gl_account_code
       ORDER BY mapping.wallet_code`,
    );
  }
}
