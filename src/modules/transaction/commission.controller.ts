import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../middleware/guards';
import { CommissionService } from './commission.service';
import { CalculateCommissionDto } from './dto/commission.dto';

@Controller('commissions')
@UseGuards(JwtAuthGuard)
export class CommissionController {
  constructor(private readonly service: CommissionService) {}
  @Post('calculate') calculate(@Body() dto: CalculateCommissionDto) { return this.service.calculate(dto); }
  @Get() list() { return this.service.listCommissions(); }
  @Get('mappings') mappings() { return this.service.listMappings(); }
  @Get('keyword-configs') keywordConfigs() { return this.service.listKeywordCommissions(); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.service.getCommission(id); }
}
