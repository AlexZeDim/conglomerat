import { getModelForClass } from '@typegoose/typegoose';
import { Account } from "./schemas/accounts.schema";
import { Realm } from "./schemas/realms.schema";
import { Auction } from "./schemas/auctions.schema";
import { Character } from "./schemas/characters.schema";
import { Guild } from "./schemas/guilds.schema";
import { Key } from "./schemas/keys.schema";
import { Log } from "./schemas/logs.schema";
import { Gold } from "./schemas/golds.schema";

const AccountModel = getModelForClass(Account);
const RealmModel = getModelForClass(Realm);
const AuctionsModel = getModelForClass(Auction);
const CharacterModel = getModelForClass(Character);
const GuildModel = getModelForClass(Guild);
const KeysModel = getModelForClass(Key);
const LogModel = getModelForClass(Log);
const GoldModel = getModelForClass(Gold);

export {
  AccountModel,
  RealmModel,
  AuctionsModel,
  CharacterModel,
  GuildModel,
  KeysModel,
  LogModel,
  GoldModel
}
