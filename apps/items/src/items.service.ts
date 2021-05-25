import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Item, Key } from '@app/mongo';
import { Model } from "mongoose";
import { BullQueueInject } from '@anchan828/nest-bullmq';
import { EXPANSION_TICKER, GLOBAL_KEY, itemsQueue } from '@app/core';
import { Queue } from 'bullmq';
import fs from 'fs-extra';
import path from 'path';
import csv from 'async-csv';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(
    ItemsService.name, true,
  );

  constructor(
    @InjectModel(Key.name)
    private readonly KeyModel: Model<Key>,
    @InjectModel(Item.name)
    private readonly ItemModel: Model<Item>,
    @BullQueueInject(itemsQueue.name)
    private readonly queue: Queue,
  ) {
    this.indexItems(GLOBAL_KEY, 0, 200000, false, false);
    this.buildItems(false)
  }

  @Cron(CronExpression.EVERY_WEEK)
  async indexItems(clearance: string = GLOBAL_KEY, min: number = 0, max: number = 200000, updateForce: boolean = true, init: boolean = true): Promise<void> {
    try {
      if (!init) {
        this.logger.log(`indexItems: init: ${init}`);
        return;
      }

      const key = await this.KeyModel.findOne({ tags: clearance });
      if (!key || !key.token) {
        this.logger.error(`indexItems: clearance: ${clearance} key not found`);
        return
      }
      if (updateForce) {
        for (let i = min; i <= max; i++) {
          await this.queue.add(
            `${i}`,
            {
              _id: i,
              region: 'eu',
              clientId: key._id,
              clientSecret: key.secret,
              accessToken: key.token },
            {
              jobId: `${i}`
            }
          )
        }
      } else {
        await this.ItemModel
          .find()
          .lean()
          .cursor({ batchSize: 1 })
          .eachAsync(async (item: Item) => {
            await this.queue.add(
              `${item._id}`,
              {
                _id: item._id,
                region: 'eu',
                clientId: key._id,
                clientSecret: key.secret,
                accessToken: key.token
              },
              {
                jobId: `${item._id}`
              }
            )
          })
      }
    } catch (e) {
      this.logger.error(`indexItems: ${e}`)
    }
  }

  async buildItems(init: boolean): Promise<void> {
    try {
      if (!init) {
        this.logger.log(`buildItems: init: ${init}`);
        return;
      }

      const dir = path.join(__dirname, '..', '..', '..', 'files');
      await fs.ensureDir(dir);
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file === 'taxonomy.csv' || file === 'itemsparse.csv') {
          const csvString = await fs.readFile(path.join(dir, file), 'utf-8');

          const rows: any[] = await csv.parse(csvString, {
            columns: true,
            skip_empty_lines: true,
            cast: value => (!isNaN(value as any)) ? parseInt(value) : value
          });
          switch (file) {
            case 'taxonomy.csv':
              for (const row of rows) {
                const item = await this.ItemModel.findById(row._id);
                if (item) {
                  if (row.ticker) item.ticker = row.ticker;
                  if (row.profession_class) item.profession_class = row.profession_class;
                  if (row.asset_class) {
                    if (row.asset_class.includes('.')) {
                      const asset_classes = row.asset_class.split('.');
                      for (const asset_class of asset_classes) {
                        item.asset_class.addToSet(asset_class.toLowerCase());
                      }
                    } else {
                      item.asset_class.addToSet(row.asset_class.toLowerCase());
                    }
                  }
                  if (row.tags) {
                    if (row.tags.includes('.')) {
                      const tags = row.tags.split('.');
                      for (const tag of tags) {
                        item.tags.addToSet(tag);
                      }
                    } else {
                      item.tags.addToSet(row.tags);
                    }
                  }
                  await item.save();
                }
              }
              break;
            case 'itemsparse.csv':
              for (const row of rows) {
                await this.ItemModel.findByIdAndUpdate(row.ID, { stackable: row.Stackable, expansion: EXPANSION_TICKER.get(row.ExpansionID) })
              }
              break;
          }
        }
      }
    } catch (e) {
      this.logger.error(`buildItems: ${e}`)
    }
  }
}
