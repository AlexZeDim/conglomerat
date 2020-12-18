/**
 * Mongo Models
 */
require('../../db/connection')
const characters_db = require('../../db/models/characters_db');
const keys_db = require('../../db/models/keys_db');

/**
 * Modules
 */

//const schedule = require('node-schedule');
const getCharacter = require('./get_character');

/***
 * Indexing every character in bulks from OSINT-DB for updated information
 * @param queryKeys - token access
 * @param bulkSize - block data per certain number
 * @returns {Promise<void>}
 */

(async function indexCharacters (
  queryKeys = `OSINT-indexCharacters`,
  bulkSize = 65,
) {
  try {
    console.time(`OSINT-indexCharacters`);
    const { token } = await keys_db.findOne({ tags: queryKeys });
    let i = 0;
    await characters_db
      .aggregate([
        {
          $match: {
            'hash': { $exists: true },
            'hash.a': { $ne: null }
          }
        },
        {
          $group: {
            _id: { hash_a: '$hash.a' },
            characters: {
              $addToSet: {
                _id: '$_id'
              }
            },
          }
        },
      ])
      .allowDiskUse(true)
      .cursor({ batchSize: 1000 })
      .exec()
      .addCursorFlag('noCursorTimeout',true)
      .eachAsync(async block => {
        if (block.characters.length) {
          for (const character of block.characters) {
            const [name, realm] = character._id.split('@')
            await getCharacter({
              name: name,
              realm: { slug: realm },
              updatedBy: `OSINT-indexCharacters`,
              token: token,
              guildRank: false,
              createOnlyUnique: false,
              iterations: i++,
              forceUpdate: true
            });
          }
        }
      }, { parallel: bulkSize })
  } catch (error) {
    console.error(error);
  } finally {
    console.timeEnd(`OSINT-indexCharacters`);
    process.exit(0)
  }
})();
