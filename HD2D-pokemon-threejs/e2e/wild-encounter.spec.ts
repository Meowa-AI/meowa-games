import { expect, test, type Page } from '@playwright/test';

async function walkOneTile(page: Page, key: 'ArrowLeft' | 'ArrowRight'): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForFunction(() => (window as unknown as {
    __game: { player: { movement: { moving: boolean } } };
  }).__game.player.movement.moving);
  await page.keyboard.up(key);
  await page.waitForFunction(() => !(window as unknown as {
    __game: { player: { movement: { moving: boolean } } };
  }).__game.player.movement.moving);
}

async function advanceBattleUntilCommand(page: Page): Promise<void> {
  for (let index = 0; index < 50; index++) {
    if (await page.locator('.battle-action.fight').isVisible().catch(() => false)) return;
    const button = page.getByRole('button', { name: '继续' });
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 1_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(100);
  }
  throw new Error('战斗没有回到指令菜单');
}

test('free-roam tall grass starts a wild battle and returns to the same route position', async ({ page }) => {
  const errors: string[] = [];
  const audioResponses = new Map<string, number>();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith('/assets/audio/')) audioResponses.set(pathname, response.status());
  });

  await page.addInitScript(() => {
    localStorage.setItem('hd2d-pokemon-opening-v1', JSON.stringify({
      schemaVersion: 1,
      phase: 'free_roam',
      currentMap: 'littleroot',
      player: { x: 2, y: 22, facing: 'right' },
      party: [{
        species: 'treecko', nickname: '木守宫', level: 5, experience: 0,
        hp: 10, maxHp: 19,
        moves: [{ id: 'pound', pp: 35 }, { id: 'leer', pp: 30 }],
      }, {
        species: 'mudkip', nickname: '水跃鱼', level: 5, experience: 0,
        hp: 20, maxHp: 20,
        moves: [{ id: 'tackle', pp: 35 }, { id: 'growl', pp: 40 }],
      }],
      inventory: { potion: 3, superPotion: 1, maxPotion: 0 },
    }));
  });
  await page.goto('/?battleQuality=reduced&battleArena=special');
  await expect(page.locator('.story-objective')).toContainText('和宝可梦一起开始冒险');

  // 固定到开局常见精灵，验证精简名单仍支持遭遇、换宠和捕获。
  await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { world: { map: { wildEncounters: { entries: unknown[] } } } };
    }).__game;
    game.world.map.wildEncounters.entries = [
      { species: 'wurmple', minLevel: 5, maxLevel: 5, weight: 1 },
    ];
    Math.random = () => 0;
  });
  await walkOneTile(page, 'ArrowRight');
  await expect(page.getByText('野生的刺尾虫出现了！')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => [
    audioResponses.get('/assets/audio/music/wild-battle-intro.wav'),
    audioResponses.get('/assets/audio/music/wild-battle-loop.wav'),
    audioResponses.get('/assets/audio/cries/wurmple.wav'),
  ]).toEqual([200, 200, 200]);
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    __game: { bgm: { context: { state: string } } };
  }).__game.bgm.context.state)).toBe('running');
  await expect(page.locator('.battle-screen')).toHaveAttribute('data-quality', 'reduced');
  await expect(page.locator('.battle-screen')).toHaveAttribute('data-arena', 'special');
  const reducedPresentation = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: {
        scene: { getObjectByName(name: string): unknown };
        postfx: { enabled: boolean };
      };
    }).__game;
    return {
      motes: Boolean(game.scene.getObjectByName('battle-air-motes')),
      shafts: Boolean(game.scene.getObjectByName('battle-sun-shafts')),
      postfxEnabled: game.postfx.enabled,
      special: Boolean(game.scene.getObjectByName('battle-environment-special')),
    };
  });
  expect(reducedPresentation).toEqual({
    motes: false, shafts: false, postfxEnabled: false, special: true,
  });
  const readPlayerAnimation = () => page.evaluate(() => {
    const sprite = (window as unknown as {
      __game: { scene: { getObjectByName(name: string): {
        material?: { map?: { image?: HTMLImageElement; offset: { x: number; y: number } } };
      } | undefined } };
    }).__game.scene.getObjectByName('battle-sprite-player');
    return {
      src: sprite?.material?.map?.image?.src ?? '',
      offset: {
        x: sprite?.material?.map?.offset.x ?? 0,
        y: sprite?.material?.map?.offset.y ?? 0,
      },
    };
  });
  const playerFrameBefore = await readPlayerAnimation();
  expect(playerFrameBefore.src).toContain('/assets/sprites/pokemon-animated/treecko/back-');
  await expect.poll(async () => (await readPlayerAnimation()).offset, {
    timeout: 5_000, intervals: [50, 100, 200],
  }).not.toEqual(playerFrameBefore.offset);
  await page.screenshot({ path: 'test-results/opening-roster-wild-encounter.png', fullPage: true });

  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '背包' })).toBeEnabled();
  await page.getByRole('button', { name: '背包' }).click();
  await page.getByRole('button', { name: /^伤药 持有 3$/ }).click();
  await expect(page.getByText(/回复了9点体力/)).toBeVisible();
  await advanceBattleUntilCommand(page);

  await page.getByRole('button', { name: '宝可梦' }).click();
  await page.getByRole('button', { name: '水跃鱼' }).click();
  await expect(page.getByText(/就决定是你了，水跃鱼/)).toBeVisible();
  await advanceBattleUntilCommand(page);
  await expect(page.getByRole('img', { name: '玩家的宝可梦' }))
    .toHaveCSS('background-position', '100% 0%');

  await page.getByRole('button', { name: '背包' }).click();
  await page.getByRole('button', { name: /^精灵球 持有 5$/ }).click();
  await expect(page.getByText('使用了精灵球！')).toBeVisible();
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as {
    __game: { scene: { getObjectByName(name: string): unknown } };
  }).__game.scene.getObjectByName('battle-capture-ball')))).toBe(true);
  await expect(page.getByText('抓到了刺尾虫！')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => [
    audioResponses.get('/assets/audio/sfx/battle/throw-ball.wav'),
    audioResponses.get('/assets/audio/sfx/battle/ball-hit.wav'),
    audioResponses.get('/assets/audio/sfx/battle/ball-drop.wav'),
    audioResponses.get('/assets/audio/sfx/battle/ball-click.wav'),
    audioResponses.get('/assets/audio/sfx/battle/capture-success.wav'),
    audioResponses.get('/assets/audio/music/caught.wav'),
  ]).toEqual([200, 200, 200, 200, 200, 200]);
  await page.screenshot({ path: 'test-results/capture-success.png', fullPage: true });
  await page.keyboard.press('Space');
  await expect(page.getByText('刺尾虫加入了队伍！')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('.battle-screen')).toBeHidden();
  const reducedRestored = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: {
        scene: { getObjectByName(name: string): unknown };
        postfx: { enabled: boolean };
      };
    }).__game;
    return {
      environment: Boolean(game.scene.getObjectByName('battle-environment')),
      postfxEnabled: game.postfx.enabled,
    };
  });
  expect(reducedRestored).toEqual({ environment: false, postfxEnabled: true });

  const saved = await page.evaluate(() => JSON.parse(
    localStorage.getItem('hd2d-pokemon-opening-v1') ?? '{}',
  ));
  expect(saved).toMatchObject({
    phase: 'free_roam',
    currentMap: 'littleroot',
    player: { x: 3, y: 22, facing: 'right' },
    inventory: { potion: 2 },
  });
  expect(saved.inventory.pokeBall).toBe(4);
  expect(saved.party).toHaveLength(3);
  expect(saved.party[2]).toMatchObject({ species: 'wurmple', level: 5 });

  // 冷却期内即使概率必定命中，下一格草丛也不会连续开战。
  await walkOneTile(page, 'ArrowRight');
  await page.waitForTimeout(500);
  await expect(page.locator('.battle-screen')).toBeHidden();
  expect(errors).toEqual([]);
});

for (const arena of ['interior', 'cave'] as const) {
  test(`${arena} battle arena renders and restores cleanly`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hd2d-pokemon-opening-v1', JSON.stringify({
      schemaVersion: 1,
      phase: 'free_roam',
      currentMap: 'littleroot',
      player: { x: 2, y: 22, facing: 'right' },
      party: [{
        species: 'treecko', nickname: '木守宫', level: 5, experience: 0,
        hp: 19, maxHp: 19, moves: [{ id: 'pound', pp: 35 }, { id: 'leer', pp: 30 }],
      }],
      inventory: { potion: 3, superPotion: 1, maxPotion: 0 },
    })));
    await page.goto(`/?battleQuality=reduced&battleArena=${arena}`);
    await page.evaluate(() => { Math.random = () => 0; });
    await walkOneTile(page, 'ArrowRight');
    await expect(page.locator('.battle-screen')).toHaveAttribute('data-arena', arena, { timeout: 15_000 });
    await expect.poll(() => page.evaluate((name) => Boolean((window as unknown as {
      __game: { scene: { getObjectByName(value: string): unknown } };
    }).__game.scene.getObjectByName(`battle-environment-${name}`)), arena)).toBe(true);
    await page.screenshot({ path: `test-results/battle-arena-${arena}.png`, fullPage: true });
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: '逃跑' }).click();
    await expect(page.getByText('成功逃走了！')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.locator('.battle-screen')).toBeHidden();
  });
}

test('a capture with a full party is persisted to storage', async ({ page }) => {
  const party = Array.from({ length: 6 }, (_, index) => ({
    species: 'treecko', nickname: `木守宫${index + 1}`, level: 5, experience: 0,
    hp: 19, maxHp: 19, moves: [{ id: 'pound', pp: 35 }, { id: 'leer', pp: 30 }],
  }));
  await page.addInitScript((savedParty) => localStorage.setItem(
    'hd2d-pokemon-opening-v1',
    JSON.stringify({
      schemaVersion: 1, phase: 'free_roam', currentMap: 'littleroot',
      player: { x: 2, y: 22, facing: 'right' }, party: savedParty, storage: [],
      inventory: {
        potion: 3, superPotion: 1, maxPotion: 0,
        pokeBall: 1, greatBall: 0, ultraBall: 0,
      },
    }),
  ), party);
  await page.goto('/?battleQuality=reduced');
  await page.evaluate(() => { Math.random = () => 0; });
  await walkOneTile(page, 'ArrowRight');
  // 进入战斗新增转场动画，软件渲染并行跑测试时战斗界面可能晚于默认 5s。
  await expect(page.locator('.battle-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.battle-message p')).toContainText('野生的', { timeout: 15_000 });
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.locator('.battle-message p')).toContainText('去吧');
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByRole('button', { name: '背包' })).toBeVisible();
  await page.getByRole('button', { name: '背包' }).click();
  await page.getByRole('button', { name: /^精灵球 持有 1$/ }).click();
  await page.keyboard.press('Space');
  await expect(page.getByText(/抓到了/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Space');
  await expect(page.getByText(/被送到了宝可梦存储盒/)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('.battle-screen')).toBeHidden();
  const save = await page.evaluate(() => JSON.parse(
    localStorage.getItem('hd2d-pokemon-opening-v1') ?? '{}',
  ));
  expect(save.party).toHaveLength(6);
  expect(save.storage).toHaveLength(1);
  expect(save.inventory.pokeBall).toBe(0);
});
