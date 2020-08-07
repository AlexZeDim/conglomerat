const { MessageEmbed } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

/***
 * TODO refactor for Object.keys
 * @type {{args: boolean, name: string, description: string, execute(*, *): Promise<void>}}
 */
module.exports = {
    name: 'char',
    description: 'Return information about specific character. Example usage: \`char блюрателла@гордунни\`',
    aliases: ['character', 'CHAR', 'CHARACTER'],
    args: true,
    async execute(message, args) {
        const [name, realm] = args.split('@');
        let embed = new MessageEmbed();
        let character = await axios.get(encodeURI(`http://${process.env.localhost}:3030/api/characters/character/${name}@${realm}`)).then(({data}) => {
            let {
                _id,
                id,
                lastModified,
                guild,
                character_class,
                level,
                realm,
                ilvl,
                spec,
                gender,
                faction,
                hash,
                createdBy,
                race,
                media,
                statusCode,
            } = data;
            if (guild) {
                let guild_string = guild.name.toString().toUpperCase()
                if (guild.rank) {
                    guild_string = guild_string.concat(` // ${guild.rank === 0 ? 'GM' : 'R' + guild.rank}`)
                }
                embed.setTitle(guild_string);
            }
            embed.setAuthor(_id.toUpperCase(), '', encodeURI(`https://${process.env.domain}/character/${realm.slug}/${name}`))
            embed.setURL(encodeURI(`https://${process.env.domain}/guild/${realm.slug}/${guild.name}`));
            if (media) {
                embed.setThumbnail(media.avatar_url);
            }
            if (statusCode === 200) embed.addField('LVL', level, true);
            if (ilvl) {
                embed.addField('Equipped', ilvl.avg, true);
                embed.addField('Actual', ilvl.eq, true);
            }
            if (faction === "Alliance") {
                embed.setColor('#006aff');
            }
            if (faction === "Horde") {
                embed.setColor('#ff0000');
            }
            if (statusCode === 200) {
                embed.addField('Class', character_class, true);
                embed.addField('Spec', spec, true);
                embed.addField('Race', `${race}, ${gender[0]}`, true);
            }
            if (hash.a && hash.b && hash.ex) {
                embed.addField('ID', id, true);
                embed.addField('Hash A', hash.a, true);
                embed.addField('Hash B', hash.b, true);
                embed.addField('Hash EX', hash.ex, true);
            }
            embed.setTimestamp(lastModified);
            embed.setFooter(`${createdBy} | Gonikon`);
            return embed
        });
        await message.channel.send(character);
    },
};
