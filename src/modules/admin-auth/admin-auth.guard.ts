import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ADMIN_ACCESS_COOKIE, ADMIN_CSRF_COOKIE, assertCookieCsrf } from '../../helpers/session-cookie';

@Injectable()
export class AdminAuthGuard extends AuthGuard('admin-jwt') {
  canActivate(context: ExecutionContext) {
    assertCookieCsrf(
      context.switchToHttp().getRequest(),
      ADMIN_ACCESS_COOKIE,
      ADMIN_CSRF_COOKIE,
    );
    return super.canActivate(context);
  }
}
