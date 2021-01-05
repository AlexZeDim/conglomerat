const { groupBy, differenceBy } = require('lodash')
const { MessageEmbed } = require('discord.js');
const { capitalCase }  = require("capital-case");
const discord_db = require('../../db/models/discord_db');
const auctions_db = require('../../db/models/auctions_db');
const characters_db = require('../../db/models/characters_db');

async function subscription ({ _id, type, filters }, channel) {
  try {

    switch (type) {
      case 'recruiting':

        if (!filters.realms.length) return await channel.send("No realms were found, please use \`-subscription\` command to try again");

        const query = { 'lfg.status': true, 'lfg.new': true };
        if (filters.faction) Object.assign(query, { 'lfg.faction': filters.faction });
        if (filters.item_level) Object.assign(query, { average_item_level: { '$gte': filters.item_level } });
        if (filters.rio) Object.assign(query, { 'lfg.rio': { '$gte': filters.rio } });
        if (filters.days_from) Object.assign(query, { 'lfg.days_from': { '$gte': filters.days_from } });
        if (filters.days_to) Object.assign(query, { 'lfg.days_to': { '$lte': filters.days_to } });
        if (filters.wcl_percentile) Object.assign(query, { 'lfg.wcl_percentile': { '$gte': filters.wcl_percentile } });
        if (filters.languages) Object.assign(query, { 'lfg.languages': { '$elemMatch': filters.languages } });
        Object.assign(query, { 'realm.slug': { '$in': [...new Set(filters.realms.map(realm => realm.connected_realm))] } } )

        const characters = await characters_db.find(query).lean().limit(50)

        await Promise.all(characters.map(async character => {
          const embed = new MessageEmbed();
          embed.setDescription(`:page_with_curl: [WCL](https://www.warcraftlogs.com/character/eu/${character.realm.slug}/${character.name}) :speech_left: [WP](https://www.wowprogress.com/character/eu/${character.realm.slug}/${character.name}) :key: [RIO](https://raider.io/characters/eu/${character.realm.slug}/${character.name})\n`)
          embed.setFooter(`WOWPROGRESS | OSINT-LFG | Сакросантус & Форжспирит`);
          if (character.guild) {
            const guild = {};
            guild._id = character.guild._id;
            guild.name = character.guild.name.toString().toUpperCase();
            if (typeof character.guild.rank !== 'undefined') {
              if (parseInt(character.guild.rank) === 0) {
                guild.rank = ' // GM';
              } else {
                guild.rank = ` // R${character.guild.rank}`;
              }
            }
            embed.setTitle(`${guild.name}${(guild.rank) ? (guild.rank) : ('')}`)
            embed.setURL(encodeURI(`https://${process.env.domain}/guild/${guild._id}`));
          }

          if (character.media && character.media.avatar_url) embed.setThumbnail(character.media.avatar_url.toString());

          if (character.faction) {
            if (character.faction === 'Alliance') {
              embed.setColor('#006aff');
            } else if (character.faction === 'Horde') {
              embed.setColor('#ff0000');
            }
          }
          if (character.lastModified) embed.setTimestamp(character.lastModified);
          if (character.ilvl) embed.addField('Item Level', character.ilvl.avg, true);
          if (character.character_class) embed.addField('Class', character.character_class, true);
          if (character.active_spec) embed.addField('Spec', character.active_spec, true);
          if (character.hash_a) embed.addField('Hash A', `[${character.hash_a}](https://${process.env.domain}/hash/a@${character.hash_a})`, true);
          if (character.hash_b) embed.addField('Hash B', `[${character.hash_b}](https://${process.env.domain}/hash/b@${character.hash_b})`, true);
          if (character.hash_f) embed.addField('Hash F', `[${character.hash_f}](https://${process.env.domain}/hash/f@${character.hash_f})`, true);
          if (character.lfg) {
            if (character.lfg.rio) embed.addField('RIO', character.lfg.rio, true);
            if (character.lfg.language) embed.addField('Language', character.lfg.language.join(','), true);
            if (character.lfg.wcl_percentile) embed.addField('WCL Best.Perf.Avg', `${character.lfg.wcl_percentile} Mythic`, true);
            if (character.lfg.role) embed.addField('Role', character.lfg.role.toString().toUpperCase(), true);
            if (character.lfg.days_from && character.lfg.days_to) embed.addField('RT days', `${character.lfg.days_from} - ${character.lfg.days_to}`, true);
            if (character.lfg.battle_tag) embed.addField('Battle.tag', character.lfg.battle_tag, true);
            if (character.lfg.transfer) {
              embed.addField('Transfer', `:white_check_mark:`, true);
            } else {
              embed.addField('Transfer', `:x:`, true);
            }
            if (character.lfg.progress) {
              Object.entries(character.lfg.progress).map(([key, value]) => {
                embed.addField(capitalCase(key), value, true);
              })
            }
          }
          await channel.send(embed);
        }))
        await discord_db.findByIdAndUpdate(_id, { message_sent: Date.now() } );
        break;
      case 't&s':
      case 'orders':

        if (!filters.realms.length || !filters.items.length) return await channel.send("No realms or items found, please use \`-subscription\` command to try again");

        const connected_realms = groupBy(filters.realms, 'connected_realm_id')

        const requests = []
        let index = 0;

        for (const [connected_realm_id, connected_realm] of Object.entries(connected_realms)) {
          const timestamps = {
            m: Number.MAX_SAFE_INTEGER
          }

          const auction_timestamps = await auctions_db.find({ 'connected_realm_id': connected_realm_id }).distinct('last_modified')
          if (auction_timestamps.length < 2) {
            await channel.send(`DMA has not found T+0 or T-1 timestamps for Auction House: ${connected_realm.map(({name}) => name).join(',')}`)
            continue
          }
          auction_timestamps.sort((a, b) => b - a)
          const [ t0, t1 ] = auction_timestamps;

          timestamps.t0 = t0
          timestamps.t1 = t1

          const message_timestamp = filters.timestamps.find(realm => realm._id === parseInt(connected_realm_id))

          if (message_timestamp) timestamps.m = message_timestamp.auctions

          if (!message_timestamp) await discord_db.findByIdAndUpdate(_id, { $addToSet: { 'filters.timestamps' : { _id: parseInt(connected_realm_id), auctions: timestamps.t1 } } } )

          if (timestamps.t0 <= timestamps.m) continue

          for (const item of filters.items) {
            requests.push({
              query: auctions_db.aggregate([
                {
                  $match: {
                    'connected_realm_id': parseInt(connected_realm_id),
                    'item.id': item._id,
                    'last_modified': { '$in': [timestamps.t0, timestamps.t1] }
                  }
                },
                {
                  $group: {
                    _id: {
                      item_id: '$item.id',
                      connected_realm_id: '$connected_realm_id'
                    },
                    orders_t0: {
                      $push: {
                        $cond: {
                          if: {
                            $eq: [ "$last_modified", timestamps.t0 ]
                          },
                          then: {
                            id: "$id",
                            quantity: "$quantity",
                            unit_price: "$unit_price",
                            bid: "$bid",
                            buyout: "$buyout",
                          },
                          else: "$$REMOVE"
                        }
                      }
                    },
                    orders_t1: {
                      $push: {
                        $cond: {
                          if: {
                            $eq: [ "$last_modified", timestamps.t1 ]
                          },
                          then: {
                            id: "$id",
                            quantity: "$quantity",
                            unit_price: "$unit_price",
                            bid: "$bid",
                            buyout: "$buyout",
                          },
                          else: "$$REMOVE"
                        }
                      }
                    }
                  }
                }
              ]).allowDiskUse(true),
              index: index++,
              item: item,
              connected_realm_id: connected_realm_id,
              connected_realms: connected_realm,
              t0: timestamps.t0
            })
            if (requests.length >= 5 || index === (Object.entries(connected_realms).length * filters.items.length)) {
              await Promise.all(requests.map(async request => {
                const [orders] = await request.query
                const [created, removed] = await Promise.all([
                  differenceBy(orders.orders_t0, orders.orders_t1, 'id'),
                  differenceBy(orders.orders_t1, orders.orders_t0, 'id')
                ])

                if (type === 't&s') {
                  const message_text = {
                    message: '',
                    line: '',
                    realm: `${request.connected_realms[0].connected_realm.join(',')}`.toString().padEnd(15)
                  }
                  if (created && created.length) {
                    created.map(order => {
                      if (request.item.ticker) {
                        order._name = request.item.ticker
                      } else if (request.item.name['en_GB']) {
                        order._name = request.item.name['en_GB']
                      } else {
                        order._name = request.item._id
                      }
                      order._quantity = `x${order.quantity}`.toString().padEnd(7)
                      order._quote = `${(order.unit_price || (order.buyout || order.bid)).toLocaleString('ru-RU').replace(',', '.')}g`.padEnd(16)
                      message_text.line = `\`| C | ${message_text.realm} | ${order._quantity} | ${order._quote} | ${order._name}\`\n`
                      if (message_text.message.length + message_text.line.length > 1999) {
                        channel.send(message_text.message)
                        message_text.message = '';
                      } else {
                        message_text.message = message_text.message + message_text.line
                      }
                    })
                  }
                  if (removed && removed.length) {
                    removed.map(order => {
                      if (request.item.ticker) {
                        order._name = request.item.ticker
                      } else if (request.item.name['en_GB']) {
                        order._name = request.item.name['en_GB']
                      } else {
                        order._name = request.item._id
                      }
                      order._quantity = `x${order.quantity}`.toString().padEnd(7)
                      order._quote = `${(order.unit_price || (order.buyout || order.bid)).toLocaleString('ru-RU').replace(',', '.')}g`.padEnd(16)
                      message_text.line = `\`| R | ${message_text.realm} | ${order._quantity} | ${order._quote} | ${order._name}\`\n`
                      if (message_text.message.length + message_text.line.length > 1999) {
                        channel.send(message_text.message)
                        message_text.message = '';
                      } else {
                        message_text.message = message_text.message + message_text.line
                      }
                    })
                  }
                  if (message_text.message.length) await channel.send(message_text.message)
                }
                if (type === 'orders') {
                  const data = {
                    created_quantity: 0,
                    created_oi: 0,
                    removed_quantity: 0,
                    removed_oi: 0
                  }
                  const message_embed = new MessageEmbed()
                    .setTitle(`${request.item.ticker || request.item.name['en_GB'].toUpperCase() || request.item._id}@${request.connected_realm_id}`)
                    .setURL(encodeURI(`https://${process.env.domain}/item/${request.item._id}@${request.connected_realm_id}`))
                    .setTimestamp(request.t0 * 1000)
                    .setFooter(`TDMA`)
                  if (request.item.icon) message_embed.setThumbnail(request.item.icon)
                  /**
                   * Only if created orders are exist
                   * we add CREATED block to the message
                   */
                  if (created && created.length) {
                    created.map(order => {
                      data.created_quantity += order.quantity
                      if (order.unit_price) data.created_oi += order.quantity * order.unit_price
                      if (order.buyout) {
                        data.created_oi += order.buyout
                      } else if (order.bid) {
                        data.created_oi += order.bid
                      }
                    })
                    message_embed.addField(
                      '────── CREATED ──────',
                      `Orders: ${created.length}\nQuantity: ${data.created_quantity}\nOpen Interest: ${data.created_oi.toFixed(2)}g\n───────────────────`,
                      false
                    )
                  }
                  if (removed && removed.length) {
                    removed.map(order => {
                      data.removed_quantity += order.quantity
                      if (order.unit_price) data.removed_oi += order.quantity * order.unit_price
                      if (order.buyout) {
                        data.removed_oi += order.buyout
                      } else if (order.bid) {
                        data.removed_oi += order.bid
                      }
                    })
                    message_embed.addField(
                      '── SOLD OR CANCELLED ──',
                      `Orders: ${removed.length}\nQuantity: ${data.removed_quantity}\nInterest Closed: ${data.removed_oi.toFixed(2)}g\n───────────────────`,
                      false
                    )
                  }
                  if (data.created_quantity && data.removed_quantity) {
                    message_embed.addField(
                      '────── CHANGED ──────',
                      `Orders: ${created.length - removed.length}\nQuantity: ${data.created_quantity - data.removed_quantity}\nInterest Diff: ${(data.created_oi - data.removed_quantity).toFixed(2)}g\n───────────────────`,
                      false
                    )
                  }
                  await channel.send(message_embed)
                }
              }))
              requests.length = 0
            }
          }
          await discord_db.findOneAndUpdate({ _id: _id, 'filters.timestamps._id': parseInt(connected_realm_id) }, { 'filters.timestamps.$.auctions': t0 } )
        }
        break
      default:
        return;
    }
  } catch (error) {
    console.error(error)
  }
}

module.exports = subscription;
