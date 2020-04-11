const items_db = require("../../db/items_db");
const pricing_db = require("../../db/pricing_db");
const auctions_db = require("../../db/auctions_db");

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
    profession_class: 'ALCH',
    asset_class: 'VANILLA',
    expansion: 'BFA',
    ticker: 'POTION.HP'
    }, connected_realm_id = 1602) {
    try {
        let lastModified;
        let evaArrayPromise = [];

        if (typeof item !== 'object') {
            new Error(`no`)
            //TODO throw error, checks etc
        }
        let {_id, is_auctionable, asset_class, expansion} = item;
        //TODO check asset_class as REQUEST VALUATION OR NOT

        let valuation_query = {item_id: _id};
        evaArrayPromise.push(pricing_db.find(valuation_query).lean());

        if (is_auctionable) {
            ({lastModified} = await auctions_db.findOne({ "item.id": _id, connected_realm_id: connected_realm_id}).sort({lastModified: -1}));
            evaArrayPromise.push(
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
                ]).then(([data]) => {return data})
            );
        }

        let result = {
            _id: `${_id}@${connected_realm_id}`,
            item_id: _id,
            connected_realm_id: connected_realm_id,
        };

        let [pricing, auctions_data] = await Promise.all(evaArrayPromise);

        if (is_auctionable) {
            result.market = {
                lastModified: auctions_data._id,
                price: auctions_data.price,
                price_size: auctions_data.price_size
            };
        }

        let valuations = [];
        if (pricing) {
            for (let {reagents, quantity, rank, item_quantity, spell_id} of pricing) {
                if (reagents.length === quantity.length) {
                    let valuation = {
                        name: spell_id,
                        pricing_method_id: spell_id
                    };

                    //TODO maybe all we need is right aggregation?
                    let reagentsArray = reagents.map((id, i) => items_db.findById(id).lean().then(async item => {
                        let {_id, name, ticker, asset_class, profession_class, is_auctionable, sell_price} = item;
                        let pricing_method = {};
                        pricing_method.id = _id;
                        (ticker) ? (pricing_method.name = ticker) : (pricing_method.name = name.en_GB);
                        pricing_method.quality = quantity[i];
                        pricing_method.asset_class = asset_class;

                        /**
                         *
                         * TODO =(item)=> (VANILLA) => Cheapest-to-Delivery // (Market)
                         *
                         * TODO check every asset_class and if VANILLA+ OR INDEX RECOURSE IT
                         *
                         * TODO rework (if up)
                         */
                        if (is_auctionable) {

                            if (!lastModified) {
                                (lastModified = await auctions_db.findOne({ "item.id": _id, connected_realm_id: connected_realm_id}).sort({lastModified: -1}).lean().then(({lastModified}) => lastModified));
                            }

                            if (asset_class && asset_class !== 'CONST') {
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
                                                price: {$ifNull: ["$buyout", {$ifNull: ["$bid", "$unit_price"]}]},
                                            }
                                        },
                                        {
                                            $group: {
                                                _id: "$_id",
                                                price: {$min: "$price"},
                                                price_size: {$min: {$cond: [{$gte: ["$quantity", 200]}, "$price", {$min: "$price"}]}},
                                            }
                                        }
                                    ]).then(([{price, price_size}]) => {
                                        if (price_size) {
                                            pricing_method.price = price_size;
                                            pricing_method.value = parseFloat((price_size * quantity[i]).toFixed(2))
                                        } else {
                                            pricing_method.price = price;
                                            pricing_method.value = parseFloat((price * quantity[i]).toFixed(2))
                                        }
                                        return pricing_method;
                                    })
                            } else {
                                pricing_method.price = sell_price;
                                pricing_method.value = parseFloat((sell_price * quantity[i]).toFixed(2));
                                return pricing_method
                            }
                        } else {
                            pricing_method.price = 0;
                            pricing_method.value = 0;
                            return pricing_method;
                        }
                    }));
                    /** MAP END **/
                    let valuationsArray = await Promise.all(reagentsArray);
                    console.log(valuationsArray);
                    let quene_cost = valuationsArray.reduce((a, {value}) => a + value, 0);
                    valuation.pricing_method = valuationsArray;
                    valuation.quene_quantity = item_quantity;
                    valuation.quene_cost = parseFloat(quene_cost.toFixed(2));
                    valuation.underlying = parseFloat((quene_cost / item_quantity).toFixed(2));
                    /**
                     * TODO (quene_cost - underlying)/INDEX QNTY
                     *
                     * FIXME IF MANY PREMIUM AGGREGATE LOOKUP BY ASSSET_CLASS PREMIUM
                     *
                     * (is_auctionable) ? (valuation.nominal_value = parseFloat((auctions_data.price / quene_cost).toFixed(2))) : ('');
                     *
                     * **/
                    (is_auctionable) ? (valuation.nominal_value = parseFloat((auctions_data.price / (quene_cost / item_quantity)).toFixed(2))) : ('');
                    valuations.push(valuation);
                }
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