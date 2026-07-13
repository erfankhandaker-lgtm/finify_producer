import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { decrypt } from '@helpers/cipher';

const JWT_KEY = process.env.IS_CRD_PLAIN === 'true'
  ? process.env.JWTKEY
  : decrypt(process.env.JWTKEY);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
             jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
           //  ignoreExpiration: false,
             ignoreExpiration: false,
             secretOrKey: JWT_KEY,
        });
    }

    async validate(payload: any) {
        
        return payload;
    }

}
