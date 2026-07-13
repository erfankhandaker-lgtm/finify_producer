import { Injectable } from '@nestjs/common';
import 'dotenv/config';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { winstonLog } from '../../config/winstonLog';
@Injectable()
export class PasswordService {
  constructor(private DB: DataSource) {}
  private readonly secret = process.env.AUTH_MODULE;

  async encryptPassword(password: string, MSISDN: string): Promise<string> {
    const hash = crypto
      .createHmac('sha256', this.secret)
      .update(password)
      .digest('hex');
    await this.DB.query(
      "select * from walletpindetail ($1, 'UpdateWalletPin', $2)",
      [MSISDN, hash],
    );

    return hash;
  }
  async PINVerify(PIN: string, MSISDN: string) {
    const walletinfo = await this.DB.query(
      "select * from walletpindetail ($1, 'CheckWalletPin')",
      [MSISDN],
    );
    const wallet = walletinfo[0];
    let match = false;
    winstonLog.log(
      'debug',
      'OUTPUT WALLET INFO STORE PROCEDURE: %s',
      wallet,
    );
    if (!wallet || wallet.pin_out == null || wallet.failed_attempt_out > 2) {
      match = false;
    } else {
      winstonLog.log('info', 'CHECKING PASSWORD');
      match = await this.verifyPassword(PIN, wallet.pin_out, MSISDN);
    }

    const result = {
      Passwordmatch: match,
      AccountStatus: wallet ? +wallet.account_status_out : 0,
    };

    winstonLog.log('info', 'PASSWORD VERIFICATION RESULT %s', result, {
      lable: 'JSONRX_PINVARIFICATION',
    });
    return result;
  }
  async verifyPassword(
    password: string,
    hashedPassword: string,
    MSISDN: string,
  ): Promise<boolean> {
    const hash = crypto
      .createHmac('sha256', this.secret)
      .update(password)
      .digest('hex');
    const result = hash === hashedPassword;
    if (result === false) {
      await this.DB.query(
        "select * from walletpindetail ($1, 'FailedWalletPin')",
        [MSISDN],
      );
      winstonLog.log('info', 'Failed password attempt recorded for MSISDN %s', MSISDN);
    }
    else {
      await this.DB.query(
        "select * from walletpindetail ($1, 'FailAttemptReset')",
        [MSISDN],
      );
      winstonLog.log('info', 'Password verification succeeded for MSISDN %s', MSISDN);
    }

    return result;
  }
}
