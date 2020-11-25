/**
 * Mongo Models
 */
require('../../db/connection')
const items_db = require('../../db/models/items_db');
const auctions_db = require('../../db/models/auctions_db');
const pricing_methods_db = require('../../db/models/pricing_methods_db');

/**
 * indexItems add is_auction, is_commdty and is_derivative properties to items
 * @param arg {string}
 * @returns {Promise<void>}
 */

const buildAssetClass = async (...arg) => {
  try {
    console.time(`DMA-${buildAssetClass.name}`);
    const bulkSize = 10;

    /**
     * This stage add asset_classes from pricing_methods
     * such as REAGENT / DERIVATIVE
     */
    if (args.includes('pricing_methods')) {
      console.info(`Stage: pricing methods`);
      console.time(`Stage: pricing methods`);
      await pricing_methods_db
        .find()
        .cursor({ batchSize: bulkSize })
        .eachAsync(
          async method => {
            try {
              /** Derivative Asset Class */
              if (method.item_id) {
                const item = await items_db.findById(method.item_id);
                if (item && item.asset_class) {
                  item.asset_class.addToSet('DERIVATIVE');
                  await item.save();
                  console.info(`${item._id},${item.asset_class.toString()}`);
                }
              }
              if (method.alliance_item_id) {
                const item = await items_db.findById(method.alliance_item_id);
                if (item && item.asset_class) {
                  item.asset_class.addToSet('DERIVATIVE');
                  await item.save();
                  console.info(`${item._id},${item.asset_class.toString()}`);
                }
              }
              if (method.horde_item_id) {
                const item = await items_db.findById(method.horde_item_id);
                if (item && item.asset_class) {
                  item.asset_class.addToSet('DERIVATIVE');
                  await item.save();
                  console.info(`${item._id},${item.asset_class.toString()}`);
                }
              }
              /** Reagent Asset Class */
              if (method.reagents && method.reagents.length) {
                for (let { _id } of method.reagents) {
                  const item = await items_db.findById(_id);
                  if (item && item.asset_class) {
                    item.asset_class.addToSet('REAGENT');
                    await item.save();
                    console.info(`${item._id},${item.asset_class.toString()}`);
                  }
                }
              }
            } catch (e) {
              console.error(e);
            }
          },
          { parallel: bulkSize },
        );
      console.timeEnd(`Stage: pricing methods`);
    }

    /**
     * This stage add asset_classes from auction_db
     * such as COMMDTY / ITEM and MARKET
     */
    if (args.includes('auctions')) {
      console.info(`Stage: auctions`);
      console.time(`Stage: auctions`);

      await auctions_db.aggregate([
        {
          $group: {
            _id: '$item.id',
            data: { $first: "$$ROOT"}
          }
        }
      ])
        .allowDiskUse(true)
        .cursor()
        .exec()
        .eachAsync(async ({ _id, data }) => {
          const item = await items_db.findById(_id)
          if (item) {
            if (data.unit_price) {
              item.asset_class.addToSet('COMMDTY');
              item.asset_class.addToSet('MARKET');
            } else if (data.buyout || data.bid) {
              item.asset_class.addToSet('ITEM');
              item.asset_class.addToSet('MARKET');
            }
            console.info(`${item._id},${item.asset_class.toString()}`);
            await item.save()
          }
        }, { parallel: bulkSize })
      console.timeEnd(`Stage: auctions`);
    }

    /**
     * This stage check does item suits the
     * contract criteria based on asset class
     */
    if (args.includes('contracts')) {
      console.info(`Stage: contracts`);
      console.time(`Stage: contracts`);
      await items_db.updateMany({}, { contracts: false });
      await items_db.updateMany(
        {
          $or: [
            { _id: 1 },
            {
              expansion: 'SHDW',
              asset_class: { $all: ['MARKET', 'COMMDTY'] },
              ticker: { $exists: true }
            },
          ],
        },
        { contracts: true },
      );
      console.timeEnd(`Stage: contracts`);
    }

    /**
     * This stage define to items a special asset_class called PREMIUM
     * based on loot_type and asset_class: REAGENT
     */
    if (args.includes('premium')) {
      console.info(`Stage: premium`);
      console.time(`Stage: premium`);
      await items_db.updateMany(
        { asset_class: 'REAGENT', loot_type: 'ON_ACQUIRE' },
        { $addToSet: { asset_class: 'PREMIUM' } },
      );
      console.timeEnd(`Stage: premium`);
    }

    /**
     * This stage define CURRENCY and WOWTOKEN asset classes to GOLD / WOWTOKEN
     */
    if (args.includes('currency')) {
      console.info(`Stage: currency`);
      console.time(`Stage: currency`);
      await items_db.updateOne(
        { _id: 122270 },
        { $addToSet: { asset_class: 'WOWTOKEN' } },
      );
      await items_db.updateOne(
        { _id: 122284 },
        { $addToSet: { asset_class: 'WOWTOKEN' } },
      );
      await items_db.updateOne(
        { _id: 1 },
        { $addToSet: { asset_class: 'GOLD' } },
      );
      console.timeEnd(`Stage: currency`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    console.timeEnd(`DMA-${buildAssetClass.name}`);
  }
}

//process.argv.slice(2)[0], process.argv.slice(2)[1]
buildAssetClass('pricing_methods', 'auctions', 'contracts', 'premium', 'currency');
