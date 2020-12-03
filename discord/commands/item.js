const { MessageEmbed } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
  name: 'item',
  description: `This command shows the 20 cheapest valuations for any item available in the game. Item can be queried via it's ID (*number*), or via a name (any string, any locale, case-insensitive) or even TICKER (**FLASK.INT**). So does for the realm argument. Please notice that item should have an asset class for being valuated. And if it doesn't, the command will return nothing. Usage: \`eva flask.int@gordunni\``,
  aliases: ['EVA', 'IVA', 'iva', 'ITEM', 'Item', 'eva'],
  args: true,
  async execute(message, args) {
    const id = args;
    const embed = new MessageEmbed();
    await axios.post('http://localhost:4000/graphql', {
      query: `query Item($id: ID!) {
        item(id: $id, extended: false) {
          _id
          name {
            en_GB
          }
          realms {
            name
            slug
            auctions
            ticker
          }
          icon
          valuations {
            name
            item_id
            connected_realm_id
            type
            last_modified
            value
            flag
            details {
              quotation
              swap_type
              description
              price_size
              quantity
              open_interest
              orders
            }
          }
        }      
      }`,
      variables: { id },
    }).then(({ data: { data: { item } } }) => {

        let title_name = '';

        const { realms, valuations } = item;

        if (item.ticker) {
          title_name += item.ticker
        } else {
          title_name += item.name.en_GB
        }

        if (realms.length === 1) {
          if (realms[0].ticker) {
            title_name += `@${realms[0].ticker}`;
          } else {
            title_name += `@${realms[0].name}`;
          }
        }

        title_name = title_name.toUpperCase()

        const realms_string = realms.map(realm => realm.slug).join(';')

        embed.setAuthor(
          `${title_name}`,
          '',
          encodeURI(`https://${process.env.domain}/item/${item._id}@${realms_string}`),
        );

        let descriptionString = '';
        let market_counter = 0;
        let derivative_counter = 0;
        let premium_counter = 0;

        embed.setURL(encodeURI(`https://${process.env.domain}/item/${item._id}@${realms_string}`));

        if ('icon' in item) {
          embed.setThumbnail(item.icon);
        }

        for (let i = 0; i < valuations.length; i++) {
          if (i === 19) {
            embed.addField(
        `─────────────`,
        `
                Full
                Pricing
                Available
                At
                [Conglomerat](https://${process.env.domain}/item/${item._id}@${realms_string})
                ─────────────`,
          true,
            );
            break;
          }
          if (valuations[i].type === 'MARKET') {
            if (
              valuations[i].details &&
              valuations[i].details.orders &&
              valuations[i].details.orders.length
            ) {
              market_counter = valuations[i].details.orders.length;
            }
          }
          if (valuations[i].type === 'DERIVATIVE') derivative_counter += 1;

          if (valuations[i].type === 'PREMIUM')  premium_counter += 1;

          embed.addField(
      `─────────────`,
      `
              ${valuations[i].name}
              Type: ${valuations[i].type}
              Realm: @${valuations[i].connected_realm_id}
              Value: ${valuations[i].value}
              ─────────────
              `,
      true,
          );
        }

        if (derivative_counter) {
          descriptionString = descriptionString.concat(
            `*Derivative pricing is based on ${derivative_counter} ${
              derivative_counter === 1 ? 'method' : 'methods'
            }*\n _ _`,
          );
        }

        if (premium_counter) {
          descriptionString = descriptionString.concat(
            `*Premium pricing is based on ${premium_counter} ${
              premium_counter === 1 ? 'method' : 'methods'
            }*\n _ _`,
          );
        }

        if (market_counter) {
          descriptionString = descriptionString.concat(
            `*Market pricing is based on ${market_counter} ${
              market_counter === 1 ? 'order' : 'orders'
            }*\n _ _`,
          );
        }

        embed.setDescription(descriptionString);
        embed.setTimestamp(realms[0].auctions * 1000);
        embed.setFooter(`DMA-EVA`);
      });
    await message.channel.send(embed);
  },
};
