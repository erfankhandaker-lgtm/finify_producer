import { Injectable } from '@nestjs/common';
import 'dotenv/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { winstonLog } from '../../config/winstonLog';
@Injectable()
export class PasswordService {
  constructor(private DB: DataSource) {}
  private readonly secret = process.env.AUTH_MODULE;

  async encryptPassword(password: string, MSISDN: string): Promise<string> {
    const hash = await bcrypt.hash(password, 12);
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
    if (!wallet || wallet.pin_out == null || wallet.failed_attempt_out > 2) {
      match = false;
    } else {
      match = await this.verifyPassword(PIN, wallet.pin_out, MSISDN);
    }

    const result = {
      Passwordmatch: match,
      AccountStatus: wallet ? +wallet.account_status_out : 0,
    };

    winstonLog.log('info', 'Wallet PIN verification completed', {
      label: 'JSONRX_PIN_VERIFICATION',
      matched: match,
      accountAvailable: Boolean(wallet),
    });
    return result;
  }
  async verifyPassword(
    password: string,
    hashedPassword: string,
    MSISDN: string,
  ): Promise<boolean> {
    let result: boolean;
    if (/^\$2[aby]\$/.test(hashedPassword)) {
      result = await bcrypt.compare(password, hashedPassword);
    } else {
      if (!this.secret) throw new Error('AUTH_MODULE is required to verify a legacy wallet PIN');
      const actual = Buffer.from(
        crypto.createHmac('sha256', this.secret).update(password).digest('hex'),
        'utf8',
      );
      const expected = Buffer.from(hashedPassword, 'utf8');
      result = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
      if (result) await this.encryptPassword(password, MSISDN);
    }
    if (result === false) {
      await this.DB.query(
        "select * from walletpindetail ($1, 'FailedWalletPin')",
        [MSISDN],
      );
      winstonLog.log('info', 'Failed wallet PIN attempt recorded');
    }
    else {
      await this.DB.query(
        "select * from walletpindetail ($1, 'FailAttemptReset')",
        [MSISDN],
      );
      winstonLog.log('info', 'Wallet PIN verification succeeded');
    }

    return result;
  }
}
