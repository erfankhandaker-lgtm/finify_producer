import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { LocalStrategy } from './local.strategy';
import { JwtStrategy } from './jwt.strategy';
import { decrypt } from '@helpers/cipher';
import { PasswordService } from '@modules/transaction/password.service';
import { TransactionModule } from '@modules/transaction/transaction.module';

const IS_CRD_PLAIN = process.env.IS_CRD_PLAIN == 'true' ? true : false
const JWTKEY = IS_CRD_PLAIN ? process.env.JWTKEY : decrypt(process.env.JWTKEY)

@Module({
    imports: [
        PassportModule,
        JwtModule.register({
            secret: JWTKEY,
            signOptions: { expiresIn: process.env.TOKEN_EXPIRATION },
        }),
        TransactionModule
    ],
    providers: [
        AuthService,
        LocalStrategy,
        JwtStrategy,
     
    ],
    controllers: [AuthController],
    
})
export class AuthModule { }