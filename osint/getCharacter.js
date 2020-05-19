const battleNetWrapper = require('battlenet-api-wrapper');
const characters_db = require("../db/characters_db");
const crc32 = require('fast-crc32c');
const moment = require('moment');

const clientId = '530992311c714425a0de2c21fcf61c7d';
const clientSecret = 'HolXvWePoc5Xk8N28IhBTw54Yf8u2qfP';

/**
 *
 * @param realmSlug
 * @param characterName
 * @param characterObject
 * @param token
 * @param updatedBy
 * @param guildRank
 */

async function getCharacter (realmSlug, characterName, characterObject = {}, token= '', updatedBy = 'DMA-getCharacter', guildRank = false) {
    try {
        const bnw = new battleNetWrapper();
        await bnw.init(clientId, clientSecret, token, 'eu', 'en_GB');
        let character;
        character = new characters_db({
            _id: `${characterName}@${realmSlug}`,
            statusCode: 400,
            updatedBy: updatedBy,
            isWatched: false
        });
        await Promise.all([
            bnw.WowProfileData.getCharacterSummary(realmSlug, characterName).then(async (
                { id, name, gender, faction, race, character_class, active_spec, realm, guild, level, last_login_timestamp, average_item_level, equipped_item_level, lastModified, statusCode }) => {
                    character.id = id;
                    character.name = name;
                    character.gender = gender.name;
                    character.faction = faction.name;
                    character.race = race.name;
                    character.character_class = character_class.name;
                    character.spec = active_spec.name;
                    character.realm = realm.name;
                    character.realm_slug = realm.slug;
                    character.level = level;
                    character.lastOnline = moment(last_login_timestamp).toISOString(true);
                    character.lastModified = moment(lastModified).toISOString(true);
                    character.statusCode = statusCode;
                    character.ilvl = {
                        eq: average_item_level,
                        avg: equipped_item_level
                    };
                    if (guild) {
                        character.guild = guild.name;
                        if (guildRank) {
                            const {members} = await bnw.WowProfileData.getGuildRoster(guild.realm.slug, (guild.name).toLowerCase().replace(/\s/g,"-"));
                            const {rank} = members.find(({ character }) => character.name === name );
                            character.guild_rank = rank;
                        }
                    } else {
                        delete character.guild;
                        delete character.guild_rank;
                    }
                }
            ).catch(e => {
                if (/\d/g.test(e.toString())) character.statusCode = parseFloat(e.toString().match(/[0-9]+/g)[0]);
            }),
            bnw.WowProfileData.getCharacterPetsCollection(realmSlug, characterName).then(({pets})=> { //TODO unlocked_battle_pet_slots
                let pets_array = [];
                if (pets.length) {
                    for (let pet of pets) {
                        if ("is_active" in pet) {
                            character.hash.petSlots.push(pet);
                        }
                        if ("name" in pet) {
                            pets_array.push(pet.name)
                        } else {
                            pets_array.push(pet.species.name)
                        }
                    }
                    character.hash.a = crc32.calculate(Buffer.from(pets_array)).toString(16);
                }
            }).catch(e =>(e)),
            bnw.WowProfileData.getCharacterMountsCollection(realmSlug, characterName).then( ({mounts}) => {
                let mount_array = [];
                for (let mount of mounts) {
                    mount_array.push(mount.id)
                }
                character.hash.b = crc32.calculate(Buffer.from(mount_array)).toString(16);
            }).catch(e =>(e)),
            bnw.WowProfileData.getCharacterMedia(realmSlug, characterName).then(({avatar_url, bust_url, render_url}) => {
                character.media = {
                    avatar_url: avatar_url,
                    bust_url: bust_url,
                    render_url: render_url
                };
            }).catch(e =>(e)),
        ]);
        //TODO status code 200, else hui sosi
        if (character.statusCode === 200) {
            /**
             * Detective:IndexDB
             */
            let character_check = await characters_db.findOne({id: character.id, character_class: character.character_class}).lean();
            if (character_check) {
                if (character_check.name !== character.name) {
                    character_check.history.push({
                        action: 'rename',
                        before: character.lastModified,
                        after: character_check.lastModified
                    })
                }
                if (character_check.realm !== character.realm) {
                    character_check.history.push({
                        action: 'transfer',
                        before: character.lastModified,
                        after: character_check.lastModified
                    })
                }
                if (character_check.race !== character.race) {
                    character_check.history.push({
                        action: 'race',
                        before: character.lastModified,
                        after: character_check.lastModified
                    })
                }
                if (character_check.faction !== character.faction) {
                    character_check.history.push({
                        action: 'faction',
                        before: character.lastModified,
                        after: character_check.lastModified
                    })
                }
            }
            /**
             * isCreated and createdBy
             */
        } else {
            if (Object.keys(characterObject).length) {
                /**
                 * All values from key to original char and write, if 4o3 error!
                 */

            }
        }
        let isCreated = await characters_db.findById(`${characterName}@${realmSlug}`).lean();
        if (!isCreated) {
            character.createdBy = updatedBy;
        }
        return await characters_db.findByIdAndUpdate({
                _id: character._id
            },
            character.toObject(),
            {
                upsert : true,
                new: true,
                lean: true
            });
    } catch (error) {
        console.error(`E,${getCharacter.name},${characterName}@${realmSlug},${error}`);
    }
}

getCharacter('howling-fjord', 'зефирбриз', {}, 'EUUFsZ2i2A1Lrp2fMWdCO24Sk9q1Hr3cP5', null, true).then(c => console.log(c))

module.exports = getCharacter;