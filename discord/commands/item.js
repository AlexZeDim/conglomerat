const { MessageEmbed } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
    name: 'item',
    description: `This command shows the 20 cheapest valuations for any item available in the game. Item can be queried via it's ID (*number*), or via a name (any string, any locale, case-insensitive) or even TICKER (**FLASK.INT**). So does for the realm argument. Please notice that item should have an asset class for being valuated. And if it doesn't, the command will return nothing. Usage: \`eva flask.int@gordunni\``,
    aliases: ['EVA', 'IVA', 'iva', 'ITEM', 'Item', 'eva'],
    args: true,
    async execute(message, args) {
        const [item, realm] = args.split('@');
        let embed = new MessageEmbed();
        let valuation = await axios.get(encodeURI(`http://${process.env.localhost}:3030/api/items/eva/${item}@${realm}`)).then(({data}) => {
            let {
                item,
                realm,
                valuations
            } = data;
            embed.setAuthor(`${item.name.en_GB}@${realm.name}`.toUpperCase(), '', encodeURI(`https://${process.env.domain}/item/${realm.slug}/${item._id}`));

            let descriptionString = '';
            let market_counter = 0;
            let derivative_counter = 0;
            let premium_counter = 0;

            embed.setURL(encodeURI(`https://${process.env.domain}/item/${realm.slug}/${item._id}`));
            if ("icon" in item) {
                embed.setThumbnail(item.icon);
            }

            for (let i = 0; i < valuations.length; i++) {
                if (i === 19 ) {
                    embed.addField(`─────────────`, `
                        Full Log Avaliable
                        Pricing
                        Available
                        At
                        [Conglomerat](https://${process.env.domain}/item/${realm.slug}/${item._id})
                        ─────────────
                        `, true);
                    break
                }
                if (valuations[i].type === "MARKET") {
                    if (valuations[i].details && valuations[i].details.orders && valuations[i].details.orders.length) {
                        market_counter = valuations[i].details.orders.length
                    }
                }
                if (valuations[i].type === "DERIVATIVE") {
                    derivative_counter += 1;
                }

                if (valuations[i].type === "PREMIUM") {
                    premium_counter += 1;
                }

                embed.addField(`─────────────`, `
                    Name: ${valuations[i].name}
                    Type: ${valuations[i].type}
                    Value: ${valuations[i].value}
                    ─────────────
                    `, true);
            }

            if (derivative_counter) {
                descriptionString = descriptionString.concat(`*Derivative pricing is based on ${derivative_counter} ${derivative_counter === 1 ? 'method' : 'methods'}*\n _ _`)
            }

            if (premium_counter) {
                descriptionString = descriptionString.concat(`*Premium pricing is based on ${premium_counter} ${premium_counter === 1 ? 'method' : 'methods'}*\n _ _`)
            }

            if (market_counter) {
                descriptionString = descriptionString.concat(`*Market pricing is based on ${market_counter} ${market_counter === 1 ? 'order' : 'orders'}*\n _ _`)
            }

            embed.setDescription(descriptionString);
            embed.setTimestamp(realm.auctions*1000);
            embed.setFooter(`DMA-EVA`);
            return embed
        });
        await message.channel.send(valuation);
    },
};