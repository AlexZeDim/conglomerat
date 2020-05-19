const items_db = require("../../../db/items_db");
const itemValuationAdjustment = require('./IVA');
const {connection} = require('mongoose');


async function XVA (connected_realm_id = 1602) {
    try {
        /**
         * Asset Class hierarchy map
         * @type {{expansion: string}}
         */
        let query = {expansion: "BFA"};

        const assetClassMap = new Map([
            [0, ['VENDOR','REAGENT','ITEM']],
            [1, ['CONST','REAGENT','ITEM']],
            [2, ['PREMIUM','REAGENT','DERIVATIVE']],
            [3, ['PREMIUM','MARKET','ITEM']],
            [4, ['PREMIUM','REAGENT','ITEM']],
            [5, ['REAGENT','MARKET','ITEM']],
            [6, ['REAGENT','MARKET','DERIVATIVE']],
            [7, ['CAP','MARKET','DERIVATIVE']],
            [8, ['CAP','PREMIUM','DERIVATIVE']],
        ]);

        for (let [k, v] of assetClassMap) {
            let allowCap = false
            console.time(`DMA-${XVA.name}-${k}:${v.toString()}`); //v_class: ['REAGENT', 'MARKET', 'DERIVATIVE'], profession_class: "INSC",
            if (k === 2 ||k === 3 || k === 4) {
                allowCap = true
            }
            Object.assign(query, {v_class: v})
            let cursor = await items_db.find(query).cursor({batchSize: 10});
            for (let item = await cursor.next(); item != null; item = await cursor.next()) {
                console.time(`DMA-${item._id}:${item.name.en_GB}`)
                await itemValuationAdjustment(item, connected_realm_id, 0 , 0, 0, allowCap)
                console.timeEnd(`DMA-${item._id}:${item.name.en_GB}`)
            }
            console.timeEnd(`DMA-${XVA.name}-${k}:${v.toString()}`);
        }
        connection.close();
    } catch (err) {
        console.error(`${XVA.name},${err}`);
    }
}

XVA(1602);

module.exports = XVA;