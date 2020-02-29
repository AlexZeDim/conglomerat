const logs_db = require("../../db/logs_db");
const realms_db = require("../../db/realms_db");
const characters_db = require("../../db/characters_db");
const axios = require('axios');

const pub_key = '71255109b6687eb1afa4d23f39f2fa76';
const private_key = '71255109b6687eb1afa4d23f39f2fa76';

async function indexLogs (queryInput = {isIndexed:false}, bulkSize = 1) {
    try {
        console.time(`VOLUSPA-${indexLogs.name}`);
        let documentBulk = [];
        const cursor = logs_db.find(queryInput).lean().cursor({batchSize: bulkSize});
        cursor.on('data', async (documentData) => {
            documentBulk.push(documentData);
            if (documentBulk.length === bulkSize) {
                console.time(`================`);
                cursor.pause();
                const promises = documentBulk.map(async (req) => {
                    try {
                        let { _id } = req;
                        let { exportedCharacters } = await axios.get(`https://www.warcraftlogs.com:443/v1/report/fights/${_id}?api_key=${pub_key}`).then(res => {
                            return res.data;
                        });
                        //FIXME for of
                        exportedCharacters.map(async ({name, server}) => {
                            let {slug} = await realms_db.findOne({$or:
                                    [
                                        { 'name_locale': server },
                                        { 'name': server },
                                        { 'slug': server }
                                    ]
                            }).lean().exec();
                            return await characters_db.findByIdAndUpdate(
                                {
                                    _id: `${name.toLowerCase()}@${slug}`
                                },
                                {
                                    _id: `${name.toLowerCase()}@${slug}`,
                                    name: name,
                                    realm_slug: slug,
                                    createdBy: `VOLUSPA-${indexLogs.name}`,
                                    updatedBy: `VOLUSPA-${indexLogs.name}`
                                },
                                {
                                    upsert : true,
                                    new: true,
                                    setDefaultsOnInsert: true,
                                    lean: true
                                }
                            ).then(ch => console.info(`C,${ch._id}`));
                        });
                        return await logs_db.findByIdAndUpdate(
                            {
                                _id: _id
                            },
                            {
                                isIndexed: true
                            },
                            {
                                upsert : true,
                                new: true,
                                setDefaultsOnInsert: true,
                                lean: true
                            }
                        ).then(lg => console.info(`U,${lg._id}`));
                    } catch (e) {
                        console.log(e)
                    }
                });
                await Promise.all(promises);
                documentBulk = [];
                cursor.resume();
                console.timeEnd(`================`);
            }
        });
        cursor.on('error', error => {
            console.error(`E,VOLUSPA-${indexLogs.name},${error}`);
            cursor.close();
        });
        cursor.on('close', async () => {
            await new Promise(resolve => setTimeout(resolve, 60000));
            console.timeEnd(`VOLUSPA-${indexLogs.name}`);
        });
    } catch (err) {
        console.error(`${indexLogs.name},${err}`);
    }
}

indexLogs();