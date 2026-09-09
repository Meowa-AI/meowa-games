import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession, localizeDefaultPokemonNames, type PokemonInstance } from './GameSession';

function pokemon(species: PokemonInstance['species'], nickname: string): PokemonInstance {
  return { species, nickname, level: 5, experience: 0, hp: 20, maxHp: 20, moves: [] };
}

describe('存档中的宝可梦名称', () => {
  it('把旧版自动生成的英文名迁移为中文名', () => {
    const party = [pokemon('treecko', 'TREECKO'), pokemon('mudkip', 'MUDKIP')];
    localizeDefaultPokemonNames(party);
    expect(party.map(({ nickname }) => nickname)).toEqual(['木守宫', '水跃鱼']);
  });

  it('保留玩家自己输入的昵称', () => {
    const party = [pokemon('torchic', '小火鸡'), pokemon('treecko', 'LEAFY')];
    localizeDefaultPokemonNames(party);
    expect(party.map(({ nickname }) => nickname)).toEqual(['小火鸡', 'LEAFY']);
  });
});

describe('六种精灵名单的存档迁移', () => {
  const key = 'hd2d-pokemon-opening-v1';
  afterEach(() => vi.unstubAllGlobals());

  function oldSave(party: unknown[], storage: unknown[]) {
    const raw = JSON.stringify({
      schemaVersion: 1, phase: 'free_roam', party, storage,
      currentMap: 'route101', player: { x: 5, y: 8, facing: 'down' },
    });
    const data = new Map([[key, raw]]);
    vi.stubGlobal('localStorage', {
      getItem: (name: string) => data.get(name) ?? null,
      setItem: (name: string, value: string) => data.set(name, value),
    });
    return { data, raw };
  }

  it('备份旧存档，移除不支持的精灵并保留昵称与剧情进度', () => {
    const { data, raw } = oldSave([
      { ...pokemon('treecko', '旧伙伴'), species: 'mewtwo' },
      pokemon('mudkip', '小水'),
    ], [pokemon('torchic', 'TORCHIC')]);
    const session = GameSession.load();
    expect(session.party.map((mon) => mon.nickname)).toEqual(['小水']);
    expect(session.storage[0].nickname).toBe('火稚鸡');
    expect(session.phase).toBe('free_roam');
    expect(session.currentMap).toBe('route101');
    expect(data.get(`${key}-before-six-species`)).toBe(raw);
    expect(JSON.parse(data.get(key)!).party).toHaveLength(1);
    GameSession.load();
    expect(data.get(`${key}-before-six-species`)).toBe(raw);
  });

  it('队伍被清空时优先从仓库补入仍保留的伙伴', () => {
    oldSave([{ species: 'mewtwo' }], [pokemon('wurmple', '毛毛')]);
    const session = GameSession.load();
    expect(session.party[0].nickname).toBe('毛毛');
    expect(session.storage).toEqual([]);
  });

  it('旧队伍全为已移除精灵时提供可战斗的初始伙伴', () => {
    oldSave([{ species: 'mewtwo' }], []);
    const session = GameSession.load();
    expect(session.party[0].species).toBe('treecko');
    expect(session.party[0].moves.length).toBeGreaterThan(0);
    expect(session.phase).toBe('free_roam');
  });

  it('开局尚未选伙伴时保持空队伍', () => {
    oldSave([], []);
    expect(GameSession.load().party).toEqual([]);
  });
});
