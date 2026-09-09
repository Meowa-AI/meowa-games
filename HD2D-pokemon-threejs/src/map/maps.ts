import type { MapData } from './MapData';
import { LITTLEROOT } from './littleroot';
import { PLAYER_HOUSE_1F, PLAYER_HOUSE_2F } from './interiors/playerHouse';
import { RIVAL_HOUSE_1F, RIVAL_HOUSE_2F } from './interiors/rivalHouse';
import { OPENING_BIRCH_LAB } from './interiors/openingLab';

/** 全部地图注册表：warp 以 id 寻址目标地图。 */
export const MAPS: Record<string, MapData> = {
  [LITTLEROOT.id]: LITTLEROOT,
  [PLAYER_HOUSE_1F.id]: PLAYER_HOUSE_1F,
  [PLAYER_HOUSE_2F.id]: PLAYER_HOUSE_2F,
  [RIVAL_HOUSE_1F.id]: RIVAL_HOUSE_1F,
  [RIVAL_HOUSE_2F.id]: RIVAL_HOUSE_2F,
  [OPENING_BIRCH_LAB.id]: OPENING_BIRCH_LAB,
};

export function getMap(id: string): MapData {
  const map = MAPS[id];
  if (!map) throw new Error(`未注册的地图 id: ${id}`);
  return map;
}
