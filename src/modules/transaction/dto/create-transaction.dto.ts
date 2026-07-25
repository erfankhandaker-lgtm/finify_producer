import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches } from "class-validator";

export class CreateTransactionDto {
    @IsOptional()
    readonly transactionId: string;
    @IsNumber()
    @IsPositive()
    readonly amount: number;
    @IsString()
    @IsNotEmpty()
    readonly pin: string;
    @IsString()
    @IsNotEmpty()
    readonly keyword: string;
    @IsString()
    @Matches(/^\d+$/)
    readonly sourceAccount: string;
    @IsString()
    @Matches(/^\d+$/)
    readonly destinationAccount: string;
    @IsString()
    @Matches(/^\d+$/)
    readonly mobileNumber: string;
    @IsOptional()
    readonly referenceId?: string;
    @IsOptional()
    readonly feePayer?: bigint;
    @IsOptional()
    readonly commissionReceiver?: bigint;
    @IsOptional()
    @IsNumber()
    readonly payment_type?: number;
    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z]{3}$/)
    readonly currency?: string;
    @IsOptional()
    readonly lang?: string;
    @IsOptional()
    readonly lat?: string;
    @IsOptional()
    readonly long?: string;

}
export class BalanceCheckDto {
    @IsOptional()
    readonly accountId?: string;
    @IsOptional()
    readonly userId?: string;
    @IsOptional()
    readonly currency?: string;
}
export class TransactionHistoryDto {
    @IsOptional()
    readonly userId?: string;
    @IsOptional()
    readonly accountId?: string;
    @IsOptional()
    readonly startDate?: Date;
    @IsOptional()
    readonly endDate?: Date;
}
export class NotificationDto {
    @IsOptional()
    readonly userId?: string;
    @IsOptional()
    readonly accountId?: string;
  
}

export class RefundDto {
    @IsOptional()
    readonly transactionId?: string;
    @IsOptional()
    readonly accountId?: string;
    @IsOptional()
    readonly amount?: number;
    @IsOptional()
    readonly reason?: string;
}
