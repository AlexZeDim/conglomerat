import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ItemsEntity, MarketEntity, RealmsEntity } from '@app/pg';
import { ArrayContains, In, LessThan, Not, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { from, lastValueFrom } from 'rxjs';
import cheerio from 'cheerio';
import { HttpService } from '@nestjs/axios';
import { FACTION, findRealm, IGold, MARKET_TYPE, VALUATION_TYPE } from '@app/core';
import { mergeMap } from 'rxjs/operators';

@Injectable()
export class TestsBench implements OnApplicationBootstrap {
  private readonly logger = new Logger(TestsBench.name, { timestamp: true });

  constructor(
    private httpService: HttpService,
    @InjectRepository(RealmsEntity)
    private readonly realmsRepository: Repository<RealmsEntity>,
    @InjectRepository(MarketEntity)
    private readonly marketRepository: Repository<MarketEntity>,
    @InjectRepository(ItemsEntity)
    private readonly itemsRepository: Repository<ItemsEntity>,
  ) {}

  async onApplicationBootstrap() {
    await this.testAssetClassFromMarket();
  }

  async getUniqueRealms() {
    const offsetTime = DateTime.now().minus({ minutes: 30 }).toMillis();
    console.log(offsetTime);
    const realmsEntity = await this.realmsRepository
      .createQueryBuilder('realms')
      .where({ auctionsTimestamp: LessThan(offsetTime) })
      .distinctOn(['realms.connectedRealmId'])
      .getMany();

    console.log(realmsEntity, realmsEntity.length);
  }

  async getGold() {
    const response = await this.httpService.axiosRef.get<string>(
      'https://funpay.ru/chips/2/',
    );

    const exchangeListingPage = cheerio.load(response.data);
    const goldListingMarkup = exchangeListingPage.html('a.tc-item');

    const goldOrders: Array<Partial<IGold>> = [];
    const marketOrders: Array<MarketEntity> = [];
    const realmsEntity = new Map<string, RealmsEntity>([]);
    const timestamp = new Date().getTime();

    exchangeListingPage(goldListingMarkup).each((index, element) => {
      const orderId = exchangeListingPage(element).attr('href');
      const realm = exchangeListingPage(element).find('.tc-server').text();
      const faction = exchangeListingPage(element).find('.tc-side').text();
      const status = Boolean(exchangeListingPage(element).attr('data-online'));
      const quantity = exchangeListingPage(element).find('.tc-amount').text();
      const owner = exchangeListingPage(element).find('.media-user-name').text();
      const price = exchangeListingPage(element).find('.tc-price div').text();
      goldOrders.push({ orderId, realm, faction, status, quantity, owner, price });
    });

    await lastValueFrom(
      from(goldOrders).pipe(
        mergeMap(async (order) => {
          try {
            const realmEntity = realmsEntity.has(order.realm)
              ? realmsEntity.get(order.realm)
              : await findRealm(this.realmsRepository, order.realm);

            const connectedRealmId =
              !realmEntity && order.realm === 'Любой'
                ? 1
                : realmEntity
                ? realmEntity.connectedRealmId
                : 0;

            const isValid = Boolean(
              connectedRealmId && order.price && order.quantity,
            );
            if (!isValid) {
              this.logger.log(order.realm);
              return;
            }

            realmsEntity.set(order.realm, realmEntity);

            const [url, orderId] = order.orderId.split('=');
            const price = parseFloat(order.price.replace(/ ₽/g, ''));
            const quantity = parseInt(order.quantity.replace(/\s/g, ''));
            const counterparty = order.owner.replace('\n', '').trim();
            const isQuantityLimit = quantity > 15_000_000 && price;
            if (isQuantityLimit) {
              this.logger.log(quantity);
              return;
            }

            let faction: FACTION = FACTION.ANY;
            const isOnline = order.status;
            const isHorde = [FACTION.H, 'Орда'].includes(order.faction);
            const isAlliance = [FACTION.A, 'Альянсa', 'Альянс'].includes(
              order.faction,
            );

            if (isAlliance) faction = FACTION.A;
            if (isHorde) faction = FACTION.H;

            const marketEntity = this.marketRepository.create({
              connectedRealmId,
              itemId: 1,
              type: MARKET_TYPE.G,
              orderId,
              faction,
              quantity,
              isOnline,
              counterparty,
              price,
              timestamp,
            });

            marketOrders.push(marketEntity);
          } catch (error) {
            this.logger.error(`indexGold: error ${error}`);
          }
        }, 5),
      ),
    );

    await this.marketRepository.save(marketOrders);
  }

  async testWarcraftLogRealms(warcraftLogsId: number) {
    const response = await this.httpService.axiosRef.get<string>(
      `https://www.warcraftlogs.com/server/id/${warcraftLogsId}`,
    );
    const wclHTML = cheerio.load(response.data);
    console.log(wclHTML);
    const serverElement = wclHTML.html('.server-name');
    console.log(serverElement);
    const realmName = wclHTML(serverElement).text();
    console.log(realmName);

    const realmEntity = await findRealm(this.realmsRepository, realmName);
    console.log(realmEntity);
  }

  async testAssetClassFromMarket() {
    const t = await this.itemsRepository.find({
      where: {
        id: In([1, 2]),
        assetClass: Not(ArrayContains([VALUATION_TYPE.ITEM])),
      },
    });
    console.log(t);
  }
}
