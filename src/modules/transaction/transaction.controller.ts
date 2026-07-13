import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { BalanceCheckDto, CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PaginationDto } from './dto/transaction-request.dto';
import { JwtAuthGuard } from '../../middleware/guards';

@Controller('transaction')
@UseGuards(JwtAuthGuard)
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  // @Post()
  // create(@Body() createTransactionDto: CreateTransactionDto) {
  //   return this.transactionService.create(createTransactionDto);
  // }

  // @Get()
  // findAll() {
  //   return this.transactionService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.transactionService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateTransactionDto: UpdateTransactionDto) {
  //   return this.transactionService.update(+id, updateTransactionDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.transactionService.remove(+id);
  // }
  @Post('process')
  transactionprocess(@Body() createTransactionDto: CreateTransactionDto) {
    return this.transactionService.transactionprocess(createTransactionDto);
  }
  @Get('request/:id')
  getTransactionRequest(@Param('id') id: string) {
    return this.transactionService.getTransactionRequest(id);
  }
  @Post('balance')
  balanceCheck(@Body() balanceCheckDto: BalanceCheckDto) {
    return this.transactionService.balanceCheck(balanceCheckDto);
  }
  @Get('transactions')
  async getTransactions(@Query() paginationDto: PaginationDto) {
    // Call the service function to get paginated data
    return this.transactionService.findAllPaginated(paginationDto);
  }
}
