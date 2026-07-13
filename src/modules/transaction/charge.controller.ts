import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../middleware/guards';
import { ChargeService } from './charge.service';
import {
  ApproveChargeConfigDto,
  CalculateChargeDto,
  CreateChargeDetailDto,
  CreateChargeDto,
  CreateChargeMappingDto,
  CreateKeywordChargeDto,
  DeactivateChargeConfigDto,
  UpdateChargeDetailDto,
  UpdateChargeDto,
  UpdateChargeMappingDto,
  UpdateKeywordChargeDto,
} from './dto/charge.dto';

@Controller('charges')
@UseGuards(JwtAuthGuard)
export class ChargeController {
  constructor(private readonly chargeService: ChargeService) {}

  @Post('calculate') calculate(@Body() dto: CalculateChargeDto) { return this.chargeService.calculate(dto); }

  @Get() listCharges() { return this.chargeService.listCharges(); }
  @Get(':id') getCharge(@Param('id', ParseIntPipe) id: number) { return this.chargeService.getCharge(id); }
  @Post() createCharge(@Body() dto: CreateChargeDto) { return this.chargeService.createCharge(dto); }
  @Patch(':id') updateCharge(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateChargeDto) { return this.chargeService.updateCharge(id, dto); }
  @Post(':id/approve') approveCharge(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveChargeConfigDto) { return this.chargeService.approveCharge(id, dto.checker); }
  @Post(':id/deactivate') deactivateCharge(@Param('id', ParseIntPipe) id: number, @Body() dto: DeactivateChargeConfigDto) { return this.chargeService.deactivateCharge(id, dto.maker); }
  @Delete(':id') deleteCharge(@Param('id', ParseIntPipe) id: number) { return this.chargeService.deleteCharge(id); }

  @Get('details/all/list') listDetails(@Query('chargeId') chargeId?: string) { return this.chargeService.listDetails(chargeId ? Number(chargeId) : undefined); }
  @Get('details/:rowId') getDetail(@Param('rowId', ParseIntPipe) rowId: number) { return this.chargeService.getDetail(rowId); }
  @Post('details') createDetail(@Body() dto: CreateChargeDetailDto) { return this.chargeService.createDetail(dto); }
  @Patch('details/:rowId') updateDetail(@Param('rowId', ParseIntPipe) rowId: number, @Body() dto: UpdateChargeDetailDto) { return this.chargeService.updateDetail(rowId, dto); }
  @Delete('details/:rowId') deleteDetail(@Param('rowId', ParseIntPipe) rowId: number, @Body() dto: DeactivateChargeConfigDto) { return this.chargeService.deleteDetail(rowId, dto.maker); }

  @Get('mappings/all/list') listMappings() { return this.chargeService.listMappings(); }
  @Get('mappings/:rowId') getMapping(@Param('rowId', ParseIntPipe) rowId: number) { return this.chargeService.getMapping(rowId); }
  @Post('mappings') createMapping(@Body() dto: CreateChargeMappingDto) { return this.chargeService.createMapping(dto); }
  @Patch('mappings/:rowId') updateMapping(@Param('rowId', ParseIntPipe) rowId: number, @Body() dto: UpdateChargeMappingDto) { return this.chargeService.updateMapping(rowId, dto); }
  @Post('mappings/:rowId/approve') approveMapping(@Param('rowId', ParseIntPipe) rowId: number, @Body() dto: ApproveChargeConfigDto) { return this.chargeService.approveMapping(rowId, dto.checker); }
  @Post('mappings/:rowId/deactivate') deactivateMapping(@Param('rowId', ParseIntPipe) rowId: number, @Body() dto: DeactivateChargeConfigDto) { return this.chargeService.deactivateMapping(rowId, dto.maker); }
  @Delete('mappings/:rowId') deleteMapping(@Param('rowId', ParseIntPipe) rowId: number) { return this.chargeService.deleteMapping(rowId); }

  @Get('keyword-configs/all/list') listKeywordCharges() { return this.chargeService.listKeywordCharges(); }
  @Get('keyword-configs/:rowId') getKeywordCharge(@Param('rowId', ParseIntPipe) rowId: number) { return this.chargeService.getKeywordCharge(rowId); }
  @Post('keyword-configs') createKeywordCharge(@Body() dto: CreateKeywordChargeDto) { return this.chargeService.createKeywordCharge(dto); }
  @Patch('keyword-configs/:rowId') updateKeywordCharge(@Param('rowId', ParseIntPipe) rowId: number, @Body() dto: UpdateKeywordChargeDto) { return this.chargeService.updateKeywordCharge(rowId, dto); }
  @Post('keyword-configs/:rowId/approve') approveKeywordCharge(@Param('rowId', ParseIntPipe) rowId: number, @Body() dto: ApproveChargeConfigDto) { return this.chargeService.approveKeywordCharge(rowId, dto.checker); }
  @Post('keyword-configs/:rowId/deactivate') deactivateKeywordCharge(@Param('rowId', ParseIntPipe) rowId: number, @Body() dto: DeactivateChargeConfigDto) { return this.chargeService.deactivateKeywordCharge(rowId, dto.maker); }
  @Delete('keyword-configs/:rowId') deleteKeywordCharge(@Param('rowId', ParseIntPipe) rowId: number) { return this.chargeService.deleteKeywordCharge(rowId); }
}
