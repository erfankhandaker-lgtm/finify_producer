import { Controller, UseGuards, Post, Request, Body, Get } from '@nestjs/common';
import {ApifetchService} from './apifetch.service'
import { JwtAuthGuard } from '../../middleware/guards';
import { AuthGuard } from '@nestjs/passport';

@Controller('apifetch')
@UseGuards(JwtAuthGuard)

export class ApifetchController {
    constructor(private apifetchService: ApifetchService) {}

    @Post('v1/fetch3partyapi')
    async fetch3partyapi(@Request() req, @Body() requestbody :any) {

        return await this.apifetchService.fetch3partyapi(requestbody);
        
    }

    @Get('v1/getQuote')
    async getQuote(@Body() requestbody :any) {

        return await this.apifetchService.getQuotes();
        
    }

    @Post('v1/submitQuote')
    async submitQuote(@Request() req,@Body() requestbody :any) {
      console.log('requestbody ', req.user)
        return await this.apifetchService.submitQuotes(requestbody);
        
    }
}

