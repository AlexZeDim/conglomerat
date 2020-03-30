const characters_db = require("../../db/characters_db");
const keys_db = require("../../db/keys_db");
const getCharacter = require('../getCharacter');
const {connection} = require('mongoose');

/***
 *
 * TODO eachAsync()
 *
 * @param queryFind
 * @param queryKeys
 * @param bulkSize
 * @returns {Promise<void>}
 */

async function indexCharacters (queryFind = '', queryKeys = {tags: `VOLUSPA-${indexCharacters.name}`}, bulkSize = 10) {
    try {
        console.time(`VOLUSPA-${indexCharacters.name}`);
        let documentBulk = [];
        const cursor = characters_db.find(queryFind).lean().cursor({batchSize: bulkSize});
        cursor.on('data', async (documentData) => {
            documentBulk.push(documentData);
            if (documentBulk.length >= bulkSize) {
                cursor.pause();
                console.time(`========================`);
                const { token } = await keys_db.findOne(queryKeys);
                const promises = documentBulk.map(async (req) => {
                    try {
                        let upd_char = await getCharacter((req._id).split('@')[1], (req._id).split('@')[0], token);
                        upd_char.updatedBy = `VOLUSPA-${indexCharacters.name}`;
                        await characters_db.findByIdAndUpdate(
                            {
                                _id: req._id
                            },
                            upd_char,
                            {
                                upsert : true,
                                new: true,
                                setDefaultsOnInsert: true,
                                lean: true
                            }
                        ).then(({_id, statusCode}) => console.info(`U,${_id}:${statusCode}`));
                    } catch (error) {
                        console.log(error)
                    }
                });
                await Promise.all(promises);
                documentBulk = [];
                cursor.resume();
                console.timeEnd(`========================`);
            }
        });
        cursor.on('close', async () => {
            await new Promise(resolve => setTimeout(resolve, 60000));
            connection.close();
            console.timeEnd(`VOLUSPA-${indexCharacters.name}`);
        });
    } catch (err) {
        console.error(`${indexCharacters.name},${err}`);
    }
}

indexCharacters();