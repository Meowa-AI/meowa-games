import { POKEMON_CATALOG, type SpeciesId } from '../battle/PokemonCatalog';
import { createPokemon } from '../battle/BattleData';
import {
  createDefaultInventory, sanitizeInventory, type BattleInventory,
} from '../battle/BattleItems';
export type { SpeciesId } from '../battle/PokemonCatalog';

export type StoryPhase =
  | 'intro_mom'
  | 'set_clock'
  | 'watch_tv'
  | 'visit_rival'
  | 'go_route101'
  | 'rescue_birch'
  | 'choose_starter'
  | 'first_battle'
  | 'starter_received'
  | 'free_roam';

export interface PokemonInstance {
  species: SpeciesId;
  nickname: string;
  level: number;
  experience: number;
  hp: number;
  maxHp: number;
  moves: Array<{ id: string; pp: number }>;
}

interface SaveData {
  schemaVersion: 1;
  phase: StoryPhase;
  party: PokemonInstance[];
  storage: PokemonInstance[];
  inventory: BattleInventory;
  currentMap: string;
  player: { x: number; y: number; facing: 'down' | 'up' | 'left' | 'right' };
}

const SAVE_KEY = 'hd2d-pokemon-opening-v1';
const ROSTER_BACKUP_KEY = `${SAVE_KEY}-before-six-species`;
const SPECIES_NAMES = new Map(
  POKEMON_CATALOG.map(({ id, name, legacyName }) => [id, { name, legacyName }]),
);

/** 只迁移旧版本自动生成的英文名，不覆盖玩家自己输入的昵称。 */
export function localizeDefaultPokemonNames(pokemon: PokemonInstance[]): PokemonInstance[] {
  for (const mon of pokemon) {
    const species = SPECIES_NAMES.get(mon.species);
    if (species && mon.nickname === species.legacyName) mon.nickname = species.name;
  }
  return pokemon;
}

export class GameSession {
  phase: StoryPhase = 'intro_mom';
  party: PokemonInstance[] = [];
  storage: PokemonInstance[] = [];
  inventory: BattleInventory = createDefaultInventory();
  currentMap = 'player-house-1f';
  player: SaveData['player'] = { x: 8, y: 7, facing: 'up' };

  static load(): GameSession {
    const session = new GameSession();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return session;
      const save = JSON.parse(raw) as Partial<SaveData>;
      if (save.schemaVersion !== 1 || !save.phase || !save.currentMap || !save.player) {
        return session;
      }
      session.phase = save.phase;
      session.party = localizeDefaultPokemonNames(Array.isArray(save.party) ? save.party : []);
      session.storage = localizeDefaultPokemonNames(Array.isArray(save.storage) ? save.storage : []);
      session.inventory = sanitizeInventory(save.inventory);
      session.currentMap = save.currentMap;
      session.player = save.player;
      const previousPartySize = session.party.length;
      const previousStorageSize = session.storage.length;
      session.party = session.party.filter((mon) => SPECIES_NAMES.has(mon.species));
      session.storage = session.storage.filter((mon) => SPECIES_NAMES.has(mon.species));
      if (previousPartySize !== session.party.length || previousStorageSize !== session.storage.length) {
        // 保留完整原始存档，精简名单时不丢失旧版收集记录。
        if (localStorage.getItem(ROSTER_BACKUP_KEY) === null) {
          localStorage.setItem(ROSTER_BACKUP_KEY, raw);
        }
        if (previousPartySize > 0 && session.party.length === 0) {
          session.party.push(session.storage.shift() ?? createPokemon('treecko', 5));
        }
        session.save();
      }
    } catch {
      // 损坏的本地存档不阻止新游戏启动。
    }
    return session;
  }

  save(): void {
    const data: SaveData = {
      schemaVersion: 1,
      phase: this.phase,
      party: this.party,
      storage: this.storage,
      inventory: this.inventory,
      currentMap: this.currentMap,
      player: this.player,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  setPhase(phase: StoryPhase): void {
    this.phase = phase;
    this.save();
  }

  reset(): void {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }
}
