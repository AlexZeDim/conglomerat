const battleNetWrapper = require('battlenet-api-wrapper');
const pricing_methods = require("../../db/pricing_methods_db");
const keys_db = require("../../db/keys_db");
const {connection} = require('mongoose');

/**
 * This function is based on Blizzard API or skilllineability.csv file
 *
 * @returns {Promise<void>}
 */

async function indexProfessions () {
    try {
        console.time(`DMA-${indexProfessions.name}`);
        const professionsTicker = new Map([
            [164, 'BSMT'],
            [165, 'LTHR'],
            [171, 'ALCH'],
            [182, 'HRBS'],
            [185, 'COOK'],
            [186, 'ORE'],
            [197, 'CLTH'],
            [202, 'ENGR'],
            [333, 'ENCH'],
            [356, 'FISH'],
            [393, 'SKIN'],
            [755, 'JWLC'],
            [773, 'INSC'],
            [794, 'ARCH'],
        ]);
        const expansionTicker = new Map([
            ['Kul', 'BFA'],
            ['Zandalari', 'BFA'],
            ['Legion', 'LGN'],
            ['Draenor', 'WOD'],
            ['Pandaria', 'MOP'],
            ['Cataclysm', 'CATA'],
            ['Northrend', 'WOTLK'],
            ['Outland', 'TBC']
        ]);
        const { _id, secret, token } = await keys_db.findOne({ tags: `Depo` });
        const bnw = new battleNetWrapper();
        await bnw.init(_id, secret, token, 'eu', '');
        let {professions} = await bnw.WowGameData.getProfessionsIndex();
        for (let profession of professions) {
            let {skill_tiers} = await bnw.WowGameData.getProfession(profession.id);
            if (skill_tiers) {
                for (let tier of skill_tiers) {
                    let expansion_ticker = 'CLSC';
                    [...expansionTicker.entries()].some(([k,v]) => {
                        (tier.name.en_GB.includes(k)) ? (expansion_ticker = v) : ('')
                    });
                    let {categories} = await bnw.WowGameData.getProfessionSkillTier(profession.id, tier.id);
                    if (categories) {
                        for (let category of categories) {
                            /***
                             * IDEA category.name => ticker for item
                             * IDEA ENC fix quantity
                             */
                            let {recipes} = category;
                            let result = {};
                            result.type = `primary`;
                            result.createdBy = `DMA-${indexProfessions.name}`;
                            result.updatedBy = `DMA-${indexProfessions.name}`;
                            for (let recipe of recipes) {
                                await Promise.all([
                                    bnw.WowGameData.getRecipe(recipe.id).then(({alliance_crafted_item, description, crafted_item, horde_crafted_item, id, name, rank, reagents}) => {
                                        result._id = `P${id}`;
                                        result.recipe_id = parseInt(id);
                                        result.name = name;
                                        if (description) {
                                            result.description = description;
                                        }
                                        if (alliance_crafted_item) {
                                            result.alliance_item_id = parseInt(alliance_crafted_item.id)
                                        }
                                        if (horde_crafted_item) {
                                            result.horde_item_id = parseInt(horde_crafted_item.id)
                                        }
                                        if (crafted_item) {
                                            result.item_id = parseInt(crafted_item.id)
                                        }
                                        if (professionsTicker.has(profession.id)) {
                                            result.profession = professionsTicker.get(profession.id)
                                        }
                                        if (expansion_ticker) {
                                            result.expansion = expansion_ticker;
                                        }
                                        if (rank) {
                                            result.rank = rank;
                                        }
                                        result.reagents = reagents.map(({reagent, quantity}) => {return {_id: parseInt(reagent.id) , quantity: parseInt(quantity)}});
                                    }).catch(e=>e),
                                    bnw.WowGameData.getRecipeMedia(recipe.id).then(({assets}) => {
                                        result.media = assets[0].value
                                    }).catch(e=>e)
                                ]);
                                if (result) {
                                    await pricing_methods.findByIdAndUpdate(
                                    {
                                        _id: result._id
                                    },
                                    result,
                                    {
                                        upsert: true,
                                        new: true,
                                        lean: true
                                    })
                                    .then(({_id, name, profession, expansion}) => console.info(`F:U,${expansion}:${profession}:${_id},${name.en_GB}`))
                                    .catch(e => console.error(e));
                                }
                            }
                        }
                    }
                }
            }
        }
        connection.close();
        console.timeEnd(`DMA-${indexProfessions.name}`);
    } catch (error) {
        console.error(`DMA-${indexProfessions.name}`, error)
    }
}

indexProfessions();