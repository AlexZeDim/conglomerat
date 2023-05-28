import { Injectable, Logger } from '@nestjs/common';
import { BlizzAPI } from 'blizzapi';
import { GLOBAL_DMA_KEY, round } from '@app/core';
import { InjectModel } from '@nestjs/mongoose';
import { Key, Token } from '@app/mongo';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class WowtokenService {
  private readonly logger = new Logger(
    WowtokenService.name, { timestamp: true },
  );

  private BNet: BlizzAPI;

  constructor(
    @InjectModel(Token.name)
    private readonly TokenModel: Model<Token>,
    @InjectModel(Key.name)
    private readonly KeysModel: Model<Key>,
  ) { }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async indexTokens(clearance: string = GLOBAL_DMA_KEY): Promise<void> {
    try {
      const key = await this.KeysModel.findOne({ tags: clearance });
      if (!key || !key.token) {
        this.logger.error(`indexTokens: clearance: ${clearance} key not found`);
        return;
      }

      this.BNet = new BlizzAPI({
        region: 'eu',
        clientId: key._id,
        clientSecret: key.secret,
        accessToken: key.token,
      });

      // TODO it is capable to implement if-modified-since header
      const { last_updated_timestamp, price, lastModified } = await this.BNet.query('/data/wow/token/index', {
        timeout: 10000,
        params: { locale: 'en_GB' },
        headers: { 'Battlenet-Namespace': 'dynamic-eu' },
      });

      const wowToken = await this.TokenModel.findById(last_updated_timestamp);

      if (!wowToken) {
        await this.TokenModel.create({
          _id: last_updated_timestamp,
          region: 'eu',
          price: round(price / 10000),
          last_modified: lastModified,
        });
      }
    } catch (errorException) {
      this.logger.error(`${WowtokenService.name}: ${errorException}`);
    }
  }
}
