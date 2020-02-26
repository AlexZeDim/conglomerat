const battleNetWrapper = require('battlenet-api-wrapper');

const clientId = '530992311c714425a0de2c21fcf61c7d';
const clientSecret = 'HolXvWePoc5Xk8N28IhBTw54Yf8u2qfP';

async function getGuild (realmSlug, nameSlug, token = '') {
    try {
        const bnw = new battleNetWrapper();
        await bnw.init(clientId, clientSecret, token, 'eu', 'en_GB');
        const [{id, name, faction, achievement_points, member_count, realm, crest, created_timestamp }, {members}] = await Promise.all([
            bnw.WowProfileData.getGuildSummary(realmSlug, nameSlug),
            bnw.WowProfileData.getGuildRoster(realmSlug, nameSlug),
        ]);
        return ({
            _id: `${nameSlug}@${realmSlug}`,
            id: id,
            name: name,
            slug: nameSlug,
            faction: faction.name,
            achievement_points: achievement_points,
            member_count: member_count,
            realm: realm.name,
            realm_slug: realmSlug,
            crest: crest,
            created_timestamp: created_timestamp,
            members: members
        });
    } catch (error) {
        console.error(error);
        return {_id: `${nameSlug}@${realmSlug}`, slug: nameSlug, realm_slug: realmSlug}
    }

}

module.exports = getGuild;