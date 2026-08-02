import { Controller, Body, Get, Post, UseGuards, Request, Res, Injectable,UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import {LoginAuthDto} from '../../dto'
import {UNAUTHORIZED} from '../../helpers/responseHelper'
import { JwtAuthGuard } from '../../middleware/guards';
import { browserSessionResponse, clearCustomerSessionCookies, setCustomerSessionCookies } from '../../helpers/session-cookie';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}
    
    @Post('login')
    async login(@Request() req, @Res({ passthrough: true }) response: Response, @Body() login :LoginAuthDto) {
        const user = await this.authService.validateUser(login.username,login.password);
        if (!user) {
         throw new UnauthorizedException(UNAUTHORIZED(req.i18n.__('invalidusercredentials'),req));
        }
        const result = await this.authService.login(user);
        if (req.get('x-finify-token-transport') === 'bearer') return result;
        setCustomerSessionCookies(response, result.token);
        return browserSessionResponse(result);
        
    }

    @UseGuards(JwtAuthGuard)
    @Get('session')
    session(@Request() request) {
      return { authenticated: true, username: request.user.username };
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    logout(@Res({ passthrough: true }) response: Response) {
      clearCustomerSessionCookies(response);
      return { loggedOut: true };
    }

}
