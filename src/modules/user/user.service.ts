import { Injectable, Inject } from '@nestjs/common';
import { UserModel } from '../../models';
import { UserDto } from '../../dto';
import { REDIS_CONNECTION } from '../../config/constants';
import { DataSource, DeepPartial, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable() 
export class UserService { 
    constructor(
        @InjectRepository(UserModel) private readonly userRepository: Repository<UserModel>,
        private DB: DataSource,
        @Inject(REDIS_CONNECTION) private redisClient: any


    ) { }

    async create(user: unknown): Promise<UserModel> {

        const entity = this.userRepository.create(user as DeepPartial<UserModel>);
        return await this.userRepository.save(entity);
    }

    async findOneByEmail(email: string): Promise<UserModel> {

        return await this.userRepository.findOne({ where: { email } });
    }

    async callStoreProcedure(the_input_paramenters_required: string) : Promise<any>{
        
        // return await this.DB.query(`EXEC SW_PROC_CURRENCY @Flag = 'GetActiveList'`)
        // this.redisClient.setEx(`roblll`,3600, JSON.stringify({ll: 222}))

        const f = await this.redisClient.get('roblll')
        const fs = await this.redisClient.get('roblllex')

        // this.redisClient.set('roblll', JSON.stringify({ll: 2233332}))
        // this.redisClient.setEx(`roblllex`,3600, JSON.stringify({ll: 222}))

        console.log('f => ',f, ' fs => ', fs)
    }
}
