import { Controller, Body, Post, UseGuards, Request, Injectable,UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import {LoginAuthDto} from '../../dto'
import {UNAUTHORIZED} from '../../helpers/responseHelper'

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) {}
    
    @Post('login')
    async login(@Request() req, @Body() login :LoginAuthDto) {
        const user = await this.authService.validateUser(login.username,login.password);
        if (!user) {
         throw new UnauthorizedException(UNAUTHORIZED(req.i18n.__('invalidusercredentials'),req));
        }
        return await this.authService.login(user);
        
    }

}