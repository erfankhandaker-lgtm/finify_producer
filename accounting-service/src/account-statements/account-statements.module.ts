import { Module } from '@nestjs/common';
import { AccountStatementController } from './account-statement.controller';
import { AccountStatementService } from './account-statement.service';

@Module({ controllers: [AccountStatementController], providers: [AccountStatementService] })
export class AccountStatementsModule {}
