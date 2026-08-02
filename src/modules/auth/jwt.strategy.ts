import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { decrypt } from '@helpers/cipher';
import { CUSTOMER_ACCESS_COOKIE, cookieToken } from '../../helpers/session-cookie';

const JWT_KEY = process.env.IS_CRD_PLAIN === 'true'
  ? process.env.JWTKEY
  : decrypt(process.env.JWTKEY);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
             jwtFromRequest: ExtractJwt.fromExtractors([
               ExtractJwt.fromAuthHeaderAsBearerToken(),
               (request) => cookieToken(request, CUSTOMER_ACCESS_COOKIE),
             ]),
           //  ignoreExpiration: false,
             ignoreExpiration: false,
             secretOrKey: JWT_KEY,
        });
    }

    async validate(payload: any) {
        
        return payload;
    }

}
