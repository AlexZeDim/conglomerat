import { Module } from '@nestjs/common';
import { CharactersService } from './characters.service';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@anchan828/nest-bullmq';
import { charactersQueue } from '@app/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersEntity, KeysEntity } from '@app/pg';
import {
  mongoConfig,
  mongoOptionsConfig,
  postgresConfig,
  redisConfig,
} from '@app/configuration';

import {
  Character,
  CharactersSchema,
  Key,
  KeysSchema,
  Log,
  LogsSchema,
  Realm,
  RealmsSchema,
} from '@app/mongo';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(postgresConfig),
    TypeOrmModule.forFeature([KeysEntity, CharactersEntity]),
    MongooseModule.forRoot(mongoConfig.connectionString, mongoOptionsConfig),
    MongooseModule.forFeature([
      { name: Log.name, schema: LogsSchema },
      { name: Key.name, schema: KeysSchema },
      { name: Realm.name, schema: RealmsSchema },
      { name: Character.name, schema: CharactersSchema },
    ]),
    BullModule.forRoot({
      options: {
        connection: {
          host: redisConfig.host,
          port: redisConfig.port,
          password: redisConfig.password,
        },
      },
    }),
    BullModule.registerQueue({
      queueName: charactersQueue.name,
      options: charactersQueue.options,
    }),
  ],
  controllers: [],
  providers: [CharactersService],
})
export class CharactersModule {}
