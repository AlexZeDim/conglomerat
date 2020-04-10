const items_db = require("../../db/items_db");
const pricing_db = require("../../db/pricing_db");
const auctions_db = require("../../db/auctions_db");
const {connection} = require('mongoose');

//TODO do it recursive?

async function getPricing (item = {
    _id: 169451,
    __v: 0,
    icon: 'https://render-eu.worldofwarcraft.com/icons/56/inv_misc_potionsetf.jpg',
    ilvl: 120,
    inventory_type: 'Non-equippable',
    is_equippable: false,
    is_stackable: true,
    item_class: 'Consumable',
    item_subclass: 'Potion',
    level: 100,
    name: {
        en_US: 'Abyssal Healing Potion',
        es_MX: 'Poción de sanación abisal',
        pt_BR: 'Poção de Cura Abissal',
        de_DE: 'Abyssischer Heiltrank',
        en_GB: 'Abyssal Healing Potion',
        es_ES: 'Poción de sanación abisal',
        fr_FR: 'Potion de soins abyssale',
        it_IT: 'Pozione di Cura Abissale',
        ru_RU: 'Глубоководное лечебное зелье'
    },
    quality: 'Common',
    sell_price: 0.12,
    is_commdty: true,
    is_auctionable: true,
    asset_class: 'ALCH',
    derivative: 'VANILLA',
    expansion: 'BFA',
    is_yield: true,
    ticker: 'POTION.HP'
    }, connected_realm_id = 1602) {
    try {
        if (typeof item !== 'object') {
            new Error(`no`)
            //TODO throw error, checks etc
        }
        let {_id, is_yield, is_auctionable, asset_class, expansion} = item;
        //TODO check asset_class as REQUEST VALUATION OR NOT
        if (!is_auctionable && !asset_class) {
            console.log('test')
        }
        let valuation_query = {item_id: _id};
        let result = {
            _id: `${_id}@${connected_realm_id}`,
            item_id: _id,
            connected_realm_id: connected_realm_id,
        };
        //TODO probably rework this in future
        const {lastModified} = await auctions_db.findOne({ "item.id": _id, connected_realm_id: connected_realm_id}).sort({lastModified: -1});
        /**
         * TODO if YLD then rank max else ;;;;;
         * if (is_yield) {
         *     query = `rank: {$exists: true, $eq: 3}`
         * }
         */
/*        if (is_yield) {
             Object.assign(valuation_query,{rank: {$exists: true, $eq: 3}})
        }*/
        let [pricing, auctions_data] = await Promise.all([
            pricing_db.find(valuation_query).lean(),
            auctions_db.aggregate([
            {
                $match: {
                    lastModified: lastModified,
                    "item.id": _id,
                    connected_realm_id: connected_realm_id,
                }
            },
            {
                $project: {
                    _id: "$lastModified",
                    id: "$id",
                    quantity: "$quantity",
                    price: { $ifNull: [ "$buyout", { $ifNull: [ "$bid", "$unit_price" ] } ] },
                }
            },
            {
                $group: {
                    _id: "$_id",
                    price: {$min: "$price"},
                    price_size: {$min: {$cond: [{$gte: ["$quantity", 200]}, "$price", {$min: "$price"}]}},
                }
            }
        ]).then(([data]) => {return data})]);
        result.market = {
            lastModified: auctions_data._id,
            price: auctions_data.price,
            price_size: auctions_data.price_size
        };
        let valuations = [];
        for (let {reagents, quantity, rank, item_quantity, spell_id} of pricing) {
            if (reagents.length === quantity.length) {
                let valuation = {
                    name: spell_id,
                    pricing_method_id: spell_id
                };
                //TODO check if reagent demands evaluation as array

                //TODO maybe all we need is right aggregation?
                let reagentsArray = reagents.map((id, i) => items_db.findById(id).lean().then(item => {
                    let {_id, name, ticker, asset_class, derivative, sell_price} = item;
                    let row = {};
                    row.id = _id;
                    (ticker) ? (row.name = ticker) : (row.name = name.en_GB);
                    row.quality = quantity[i];
                    row.asset_class = asset_class;
                    if (derivative !== 'CONST') {
                        return auctions_db.aggregate([
                            {
                                $match: {
                                    lastModified: lastModified,
                                    "item.id": _id,
                                    connected_realm_id: connected_realm_id,
                                }
                            },
                            {
                                $project: {
                                    _id: "$lastModified",
                                    id: "$id",
                                    quantity: "$quantity",
                                    price: { $ifNull: [ "$buyout", { $ifNull: [ "$bid", "$unit_price" ] } ] },
                                }
                            },
                            {
                                $group: {
                                    _id: "$_id",
                                    min: {$min: "$price"},
                                    min_size: {$min: {$cond: [{$gte: ["$quantity", 200]}, "$price", {$min: "$price"}]}},
                                }
                            }
                        ]).then(([{min, min_size}]) => {
                            if (min_size) {
                                row.price = min_size;
                                row.value = parseFloat((min_size * quantity[i]).toFixed(2))
                            } else {
                                row.price = min;
                                row.value = parseFloat((min * quantity[i]).toFixed(2))
                            }
                            return row;
                        })
                    } else {
                        row.price = sell_price;
                        row.value = parseFloat((sell_price * quantity[i]).toFixed(2));
                        return row
                    }
                }));
                /** MAP END **/
                let valuationsArray = await Promise.all(reagentsArray);
                let quene_cost = valuationsArray.reduce((a, { value }) => a + value, 0);
                valuation.pricing_method = valuationsArray;
                valuation.quene_quantity = item_quantity;
                valuation.quene_cost = quene_cost;
                valuation.underlying = parseFloat((quene_cost / item_quantity).toFixed(2));
                valuation.nominal_value = parseFloat((auctions_data.price / quene_cost).toFixed(2));
                valuations.push(valuation);
            }
        }
        result.valuations = valuations;
        result.cheapest_to_delivery = valuations.reduce((prev, curr) => prev.underlying < curr.underlying ? prev : curr);
        return result;
    } catch (err) {
        console.error(`${getPricing.name},${err}`);
    }
}

module.exports = getPricing;