import {Injectable,UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {JsonWebTokenError} from 'jsonwebtoken'
import {UNAUTHORIZED} from '../../helpers/responseHelper'
import { assertCookieCsrf, CUSTOMER_ACCESS_COOKIE, CUSTOMER_CSRF_COOKIE } from '../../helpers/session-cookie';


@Injectable()
export  class JwtAuthGuard extends AuthGuard('jwt') {
    private context
  canActivate(context: ExecutionContext) {
    // Add your custom authentication logic here
    // for example, call super.logIn(request) to establish a session.
     this.context = context
    assertCookieCsrf(
      context.switchToHttp().getRequest(),
      CUSTOMER_ACCESS_COOKIE,
      CUSTOMER_CSRF_COOKIE,
    );
    return super.canActivate(context);
  }
  handleRequest(err: any, user: any, info: any, context: any, status: any) {

   // console.log('user ',user)
    if (!user || info instanceof JsonWebTokenError) {
        
        const req = this.context.switchToHttp().getRequest();
        throw new UnauthorizedException(UNAUTHORIZED(null,req))
      }

    return super.handleRequest(err, user, info, context, status);
  }
}


@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {

 private context
  canActivate(context: ExecutionContext) {
    // Add your custom authentication logic here
    // for example, call super.logIn(request) to establish a session.
     this.context = context
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
     // console.log('userrrrr ', user)
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
     const req = this.context.switchToHttp().getRequest();
      throw err || new  UnauthorizedException(UNAUTHORIZED(null,req))
    }

    return user;
  }
}
