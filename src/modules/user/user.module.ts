import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import {DatabaseModule} from '../../config/database/database.module'
import { RedisModule } from '../../config/redis/redis.module'
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModel } from '../../models';

@Module({
  providers: [UserService], 
  imports:[DatabaseModule, RedisModule, TypeOrmModule.forFeature([UserModel])],
  exports: [UserService],
  controllers: [UserController]
})
export class UserModule {}
