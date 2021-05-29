import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ItemCrossRealmDto, ItemFeedDto, ItemQuotesDto } from './dto';
import { InjectModel } from '@nestjs/mongoose';
import { Auction, Gold, Item, Realm } from '@app/mongo';
import { LeanDocument, Model } from 'mongoose';
import { VALUATION_TYPE } from '@app/core';
import { ChartOrderInterface, OrderQuotesInterface, OrderXrsInterface, RealmChartInterface } from '@app/core';
import { ItemChartDto } from './dto';
import { groupBy } from 'lodash';

@Injectable()
export class DmaService {
  private readonly logger = new Logger(
    DmaService.name, true,
  );

  constructor(
    @InjectModel(Realm.name)
    private readonly RealmModel: Model<Realm>,
    @InjectModel(Item.name)
    private readonly ItemModel: Model<Item>,
    @InjectModel(Gold.name)
    private readonly GoldModel: Model<Gold>,
    @InjectModel(Auction.name)
    private readonly AuctionModel: Model<Auction>,
  ) { }

  async getItem(input: ItemCrossRealmDto): Promise<LeanDocument<Item>> {
    // TODO what about realm? Probably here?
    const [ item ] = input._id.split('@');
    if (item) {
      if (isNaN(Number(item))) {
        return this.ItemModel
          .findOne(
            { $text: { $search: item } },
            { score: { $meta: 'textScore' } },
          )
          .sort({ score: { $meta: 'textScore' } })
          .lean();
      } else {
        return this.ItemModel
          .findById(parseInt(item))
          .lean();
      }
    }
  }

  async getItemValuations(input: ItemCrossRealmDto): Promise<string> {
    const { item , realm } = await this.validateTransformDmaQuery(input._id);
    if (!item || !realm || !realm.length) {
      throw new BadRequestException('Please provide correct item@realm;realm;realm in your query');
    }

    const connected_realms_id = [...new Set(realm.map(({ connected_realm_id }) => connected_realm_id))];
    const is_commdty = item.asset_class.includes(VALUATION_TYPE.COMMDTY) || (item.stackable && item.stackable > 1);
    const is_gold = item._id === 1;
    const is_xrs = connected_realms_id.length > 1;

    // TODO valuations of item from table

    return `${input._id}`
  }

  async getItemChart(input: ItemCrossRealmDto): Promise<ItemChartDto> {
    const { item , realm } = await this.validateTransformDmaQuery(input._id);
    if (!item || !realm || !realm.length) {
      throw new BadRequestException('Please provide correct item@realm;realm;realm in your query');
    }

    const connected_realms_id = [...new Set(realm.map(({ connected_realm_id }) => connected_realm_id))];
    const is_commdty = item.asset_class.includes(VALUATION_TYPE.COMMDTY) || (item.stackable && item.stackable > 1);
    const is_gold = item._id === 1;
    const is_xrs = connected_realms_id.length > 1;

    const yAxis = await this.buildYAxis(item._id, connected_realms_id, is_commdty, is_xrs, is_gold);
    const xAxis: (string | number | Date)[] = [];
    const dataset: ChartOrderInterface[] = [];

    await this.RealmModel
      .aggregate([
        {
          $match: { connected_realm_id: { $in: connected_realms_id } }
        },
        {
          $group: {
            _id: '$connected_realm_id',
            realms: { $addToSet: '$name_locale' },
            connected_realm_id: { $first: '$connected_realm_id' },
            slug: { $first: '$slug' },
            auctions: { $first: '$auctions' },
            golds: { $first: '$golds' },
            valuations: { $first: '$valuations' }
          }
        }
      ])
      .allowDiskUse(true)
      .cursor()
      .exec()
      .eachAsync(async (realm: RealmChartInterface, i: number) => {
        if (is_commdty) {
          if (is_xrs) {
            /** Build X axis */
            xAxis[i] = realm.realms.join(', ');
            /** Build Cluster from Orders */
            if (is_gold) {
              const orderDataset = await this.goldXRS(yAxis, realm.connected_realm_id, realm.golds, i);
              if (orderDataset && orderDataset.length) {
                dataset.push(...orderDataset);
              }
            }

            if (!is_gold) {
              const orderDataset = await this.commdtyXRS(yAxis, item._id, realm.connected_realm_id, realm.auctions, i);
              if (orderDataset && orderDataset.length) {
                dataset.push(...orderDataset);
              }
            }
          }

          if (!is_xrs) {
            /** Build Cluster by Timestamp */
            if (is_gold) {
              const { chart, timestamps } = await this.goldIntraDay(yAxis, realm.connected_realm_id);
              if (chart && timestamps) {
                dataset.push(...chart);
                xAxis.push(...timestamps);
              }
            }

            if (!is_gold) {
              const { chart, timestamps } = await this.commdtyIntraDay(yAxis, item._id, realm.connected_realm_id);
              if (chart && timestamps) {
                dataset.push(...chart);
                xAxis.push(...timestamps);
              }
            }
          }
        }
      });

    return { yAxis, xAxis, dataset };
  }

  priceRange(
    quotes: number[],
    blocks: number,
  ): number[] {
    if (!quotes.length) return [];
    const length = quotes.length > 3 ? quotes.length - 3 : quotes.length;
    const start = length === 1 ? 0 : 1;

    const cap = Math.round(quotes[Math.floor(length * 0.9)]);
    const floor = Math.round(quotes[start]);
    const price_range = cap - floor;
    /** Step represent 2.5% for each cluster */
    const tick = price_range / blocks;
    return Array(Math.ceil((cap + tick - floor) / tick))
      .fill(floor)
      .map((x, y) => parseFloat((x + y * tick).toFixed(4)));
  }

  async buildYAxis(
    item_id: number,
    connected_realms_id: number[],
    is_commdty: boolean = false,
    is_xrs: boolean = false,
    is_gold: boolean = false
  ): Promise<number[]> {
    /**
     * Control price level
     * if XRS => 40
     * else => 20
     */
    const blocks: number = is_xrs ? 40 : 20;

    /** Request oldest from latest timestamp */
    if (is_gold && is_xrs) {
      const { golds } = await this.RealmModel.findOne({ connected_realm_id: { $in: connected_realms_id } }).lean().select('golds').sort({ 'golds': 1 });
      const quotes: number[] = await this.GoldModel.find({ last_modified: { $gte: golds }, connected_realm_id: { $in: connected_realms_id } }, 'price').distinct('price');
      return this.priceRange(quotes, blocks);
    }

    if (is_gold && !is_xrs) {
      const quotes: number[] = await this.GoldModel.find({ connected_realm_id: { $in: connected_realms_id } }, 'price').distinct('price');
      return this.priceRange(quotes, blocks);
    }

    if (!is_gold && is_xrs) {
      const { auctions } = await this.RealmModel.findOne({ connected_realm_id: { $in: connected_realms_id } }).lean().select('auctions').sort({ 'auctions': 1 });
      /** Find distinct prices for each realm */
      const quotes: number[] = await this.AuctionModel
        .find({ connected_realm_id: { $in: connected_realms_id }, last_modified: { $gte: auctions }, 'item.id': item_id }, 'price')
        .hint({ 'connected_realm_id': -1, 'last_modified': -1, 'item_id': -1 })
        .distinct('price');
      return this.priceRange(quotes, blocks);
    }

    if (!is_gold && !is_xrs) {
      /** Find distinct prices for one */
      const quotes = await this.AuctionModel
        .find({ connected_realm_id: { $in: connected_realms_id }, 'item.id': item_id }, 'price')
        .hint({ 'connected_realm_id': -1, 'last_modified': -1, 'item_id': -1 })
        .distinct('price');
      return this.priceRange(quotes, blocks);
    }

    return [];
  }

  async goldXRS(
    yAxis: number[],
    connected_realm_id: number,
    golds: number,
    xIndex: number
  ): Promise<ChartOrderInterface[]> {
    if (!yAxis.length) return [];

    const orders: OrderXrsInterface[] = await this.GoldModel
      .aggregate([
        {
          $match: {
            status: 'Online',
            connected_realm_id: connected_realm_id,
            last_modified: { $eq: golds },
          },
        },
        {
          $bucket: {
            groupBy: '$price',
            boundaries: yAxis,
            default: 'Other',
            output: {
              orders: { $sum: 1 },
              value: { $sum: '$quantity' },
              price: { $first: '$price' },
              oi: {
                $sum: { $multiply: ['$price', { $divide: [ '$quantity', 1000 ] }] },
              }
            }
          }
        },
      ])
      .allowDiskUse(true);

    return this.buildDataset(yAxis, orders, xIndex);
  }

  async commdtyXRS(
    yAxis: number[],
    item_id: number,
    connected_realm_id: number,
    auctions: number,
    xIndex: number
  ): Promise<ChartOrderInterface[]> {
    if (!yAxis.length) return [];

    const orders: OrderXrsInterface[] = await this.AuctionModel
      .aggregate([
        {
          $match: {
            connected_realm_id: connected_realm_id,
            last_modified: { $eq: auctions },
            'item.id': item_id
          },
        },
        {
          $bucket: {
            groupBy: "$price",
            boundaries: yAxis,
            default: "Other",
            output: {
              orders: { $sum: 1 },
              value: { $sum: "$quantity" },
              price: { $first: '$price' },
              oi: {
                $sum: { $multiply: ['$price', '$quantity'] },
              }
            }
          }
        },
      ])
      .allowDiskUse(true);

    return this.buildDataset(yAxis, orders, xIndex);
  }

  async goldIntraDay(yAxis: number[], connected_realm_id: number) {
    const chart: ChartOrderInterface[] = [];
    if (!yAxis.length) return { chart };
    if (!connected_realm_id) return { chart };

    /** Find distinct timestamps for each realm */
    const timestamps: number[] = await this.AuctionModel
      .find({ connected_realm_id: connected_realm_id }, 'last_modified')
      .distinct('last_modified');

    timestamps.sort((a, b) => a - b);

    for (let i: number = 0; i < timestamps.length; i++) {
      await this.GoldModel
        .aggregate([
          {
            $match: {
              status: 'Online',
              connected_realm_id: connected_realm_id,
              last_modified: timestamps[i]
            }
          },
          {
            $bucket: {
              groupBy: '$price',
              boundaries: yAxis,
              default: 'Other',
              output: {
                orders: { $sum: 1 },
                value: { $sum: '$quantity' },
                price: { $first: '$price' },
                oi: {
                  $sum: { $multiply: ['$price', { $divide: [ '$quantity', 1000 ] } ] },
                }
              }
            }
          },
          {
            $addFields: { xIndex: i }
          }
        ])
        .allowDiskUse(true)
        .cursor()
        .exec()
        .eachAsync((order: OrderXrsInterface) => {
          const yIndex = yAxis.findIndex((pQ) => pQ === order._id)
          if (yIndex !== -1) {
            chart.push({
              x:  order.xIndex,
              y: yIndex,
              orders: order.orders,
              value: order.value,
              oi: parseInt(order.oi.toFixed(0), 10)
            });
          } else if (order._id === 'Other') {
            if (order.price > yAxis[yAxis.length-1]) {
              chart.push({
                x: order.xIndex,
                y: yAxis.length-1,
                orders: order.orders,
                value: order.value,
                oi: parseInt(order.oi.toFixed(0), 10)
              });
            } else {
              chart.push({
                x: order.xIndex,
                y: 0,
                orders: order.orders,
                value: order.value,
                oi: parseInt(order.oi.toFixed(0), 10)
              });
            }
          }
        }, { parallel: 20 })
    }

    return { chart, timestamps };
  }

  async commdtyIntraDay(yAxis: number[], item_id: number, connected_realm_id: number) {
    const chart: ChartOrderInterface[] = [];
    if (!yAxis.length) return { chart };
    if (!connected_realm_id) return { chart };
    /** Find distinct timestamps for each realm */
    const timestamps: number[] = await this.AuctionModel
      .find({ 'item.id': item_id, connected_realm_id: connected_realm_id }, 'last_modified')
      .hint({ 'item.id': -1, connected_realm_id: 1 })
      .distinct('last_modified');

    timestamps.sort((a, b) => a - b);

    await Promise.all(
      timestamps.map(
        async (timestamp, i) => {
          await this.AuctionModel
            .aggregate([
              {
                $match: {
                  connected_realm_id: connected_realm_id,
                  last_modified: timestamp,
                  'item.id': item_id,
                }
              },
              {
                $bucket: {
                  groupBy: '$price',
                  boundaries: yAxis,
                  default: 'Other',
                  output: {
                    orders: { $sum: 1 },
                    value: { $sum: '$quantity' },
                    price: { $first: '$price' },
                    oi: {
                      $sum: { $multiply: ['$price', '$quantity'] },
                    }
                  }
                }
              },
              {
                $addFields: { xIndex: i }
              }
            ])
            .allowDiskUse(true)
            .cursor()
            .exec()
            .eachAsync((order: OrderXrsInterface) => {
              const yIndex = yAxis.findIndex((pQ) => pQ === order._id)
              if (yIndex !== -1) {
                chart.push({
                  x: order.xIndex,
                  y: yIndex,
                  orders: order.orders,
                  value: order.value,
                  oi: order.oi
                })
              } else if (order._id === 'Other') {
                if (order.price > yAxis[yAxis.length-1]) {
                  chart.push({
                    x: order.xIndex,
                    y: yAxis.length-1,
                    orders: order.orders,
                    value: order.value,
                    oi: order.oi
                  });
                } else {
                  chart.push({
                    x: order.xIndex,
                    y: 0,
                    orders: order.orders,
                    value: order.value,
                    oi: order.oi
                  });
                }
              }
            }, { parallel: 20 })
        }
      )
    );

    return { chart, timestamps };
  }

  buildDataset(yAxis: number[], orders: OrderXrsInterface[], xIndex: number): ChartOrderInterface[] {
    return orders.map(order => {
      const yIndex = yAxis.findIndex((pQ) => pQ === order._id);
      if (yIndex !== -1) {
        return {
          x: xIndex,
          y: yIndex,
          orders: order.orders,
          value: order.value,
          oi: parseInt(order.oi.toFixed(0), 10)
        };
      } else if (order._id === 'Other') {
        if (order.price > yAxis[yAxis.length-1]) {
          return {
            x: xIndex,
            y: yAxis.length-1,
            orders: order.orders,
            value: order.value,
            oi: parseInt(order.oi.toFixed(0), 10)
          };
        } else {
          return {
            x: xIndex,
            y: 0,
            orders: order.orders,
            value: order.value,
            oi: parseInt(order.oi.toFixed(0), 10)
          };
        }
      }
    })
  }


  async getItemQuotes(input: ItemCrossRealmDto): Promise<ItemQuotesDto> {
    const { item , realm } = await this.validateTransformDmaQuery(input._id);
    if (!item || !realm || !realm.length) {
      throw new BadRequestException('Please provide correct item@realm;realm;realm in your query')
    }

    const connected_realms_id = groupBy(realm, 'connected_realm_id');
    const is_xrs = Object.keys(connected_realms_id).length > 1;
    const is_gold = item._id === 1;

    const quotes: OrderQuotesInterface[] = [];

    await Promise.all(
      Object.entries(connected_realms_id).map(
        async ([connected_realms_hub, realms]: [string, LeanDocument<Realm>[]]) => {
          if (!is_xrs) {
            /** NOT XRS && NOT GOLD */
            if (!is_gold) {
              const orderQuotes: OrderQuotesInterface[] = await this.AuctionModel.aggregate([
                {
                  $match: {
                    connected_realm_id: parseInt(connected_realms_hub),
                    last_modified: realms[0].auctions,
                    'item.id': item._id,
                  },
                },
                {
                  $project: {
                    id: '$id',
                    quantity: '$quantity',
                    price: {
                      $ifNull: ['$buyout', { $ifNull: ['$bid', '$price'] }],
                    },
                  },
                },
                {
                  $group: {
                    _id: '$price',
                    quantity: { $sum: '$quantity' },
                    open_interest: {
                      $sum: { $multiply: ['$price', '$quantity'] },
                    },
                    orders: { $addToSet: '$id' },
                  },
                },
                {
                  $sort: { _id: 1 },
                },
                {
                  $project: {
                    _id: 0,
                    price: '$_id',
                    quantity: '$quantity',
                    open_interest: { $trunc: ['$open_interest', 2] },
                    size: {
                      $cond: {
                        if: { $isArray: '$orders' },
                        then: { $size: '$orders' },
                        else: 0,
                      },
                    },
                  },
                },
              ]);
              // TODO possible eachAsync cursor
              quotes.push(...orderQuotes);
            }
            /** NOT XRS but GOLD */
            if (is_gold) {
              const orderQuotes: OrderQuotesInterface[] = await this.GoldModel.aggregate([
                {
                  $match: {
                    status: 'Online',
                    connected_realm_id: parseInt(connected_realms_hub),
                    last_modified: realm[0].golds,
                  },
                },
                {
                  $project: {
                    id: '$id',
                    quantity: '$quantity',
                    price: '$price',
                    owner: '$owner',
                  },
                },
                {
                  $group: {
                    _id: '$price',
                    quantity: { $sum: '$quantity' },
                    open_interest: {
                      $sum: {
                        $multiply: ['$price', { $divide: ['$quantity', 1000] }],
                      },
                    },
                    sellers: { $addToSet: '$owner' },
                  },
                },
                {
                  $sort: { _id: 1 },
                },
                {
                  $project: {
                    _id: 0,
                    price: '$_id',
                    quantity: '$quantity',
                    open_interest: { $trunc: ['$open_interest', 2] },
                    size: {
                      $cond: {
                        if: { $isArray: '$sellers' },
                        then: { $size: '$sellers' },
                        else: 0,
                      },
                    },
                  },
                },
              ]);
              // TODO possible eachAsync cursor
              quotes.push(...orderQuotes);
            }
          }
        }
      )
    );
    return { quotes };
  }

  async getItemFeed(input: ItemCrossRealmDto): Promise<ItemFeedDto> {
    const { item , realm } = await this.validateTransformDmaQuery(input._id);
    if (!item || !realm || !realm.length) {
      throw new BadRequestException('Please provide correct item@realm;realm;realm in your query')
    }
    /**
     * Item should be not commodity or XRS
     */
    const connected_realms_id = groupBy(realm, 'connected_realm_id');
    const is_commdty = item.asset_class.includes(VALUATION_TYPE.COMMDTY) || (item.stackable && item.stackable > 1);
    const is_xrs = Object.keys(connected_realms_id).length > 1;

    const feed: Auction[] = [];

    if (!is_xrs && !is_commdty) {
      await Promise.all(
        Object.entries(connected_realms_id).map(
          async ([connected_realms_hub, realms]: [string, LeanDocument<Realm>[]]) => {
            const orderFeed = await this.AuctionModel.find({
              connected_realm_id: parseInt(connected_realms_hub),
              last_modified: realms[0].auctions,
              'item.id': item._id,
            });
            // TODO possible eachAsync cursor;
            feed.push(...orderFeed);
          }
        )
      );
    }

    return { feed };
  }

  async validateTransformDmaQuery(input: string) {
    let
      item: LeanDocument<Item>,
      realm: LeanDocument<Realm>[];

    const [ queryItem, queryRealm ] = input.split('@');
    const realmArrayString = queryRealm
      .split(';')
      .filter(Boolean);

    if (queryItem) {
      if (isNaN(Number(queryItem))) {
        item = await this.ItemModel
          .findOne(
            { $text: { $search: queryItem } },
            { score: { $meta: 'textScore' } },
          )
          .sort({ score: { $meta: 'textScore' } })
          .lean();
      } else {
        item = await this.ItemModel
          .findById(parseInt(queryItem))
          .lean();
      }
    }

    if (realmArrayString.length === 1) {
      if (isNaN(Number(queryRealm))) {
        /** if string */
        realm = await this.RealmModel
          .find(
            { $text: { $search: queryRealm } },
            { score: { $meta: 'textScore' } },
          )
          .sort({ score: { $meta: 'textScore' } })
          .limit(1)
          .lean();
      } else {
        /** if number */
        realm = await this.RealmModel
          .find({ connected_realm_id: parseInt(queryRealm) })
          .limit(1)
          .lean();
      }
    } else {
      const realms = realmArrayString.toString().replace(';', ' ');
      realm = await this.RealmModel
        .find(
          { $text: { $search: realms } },
          { score: { $meta: 'textScore' } },
        )
        .sort({ score: { $meta: 'textScore' } })
        .lean();
    }

    return { item, realm };
  }

  getWowToken(region: string, limit: number): string {
    return `${region}@${limit}`
  }
}
