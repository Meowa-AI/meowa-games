import { expect, test, type Page } from '@playwright/test';

async function finishDialogue(page: Page, maxPresses = 10): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    if (!(await page.locator('.emerald-dialogue--visible').isVisible())) return;
    await page.keyboard.press('Space');
    // 等待真实主循环消费这个按键，避免软件渲染低帧率时多次输入被合并。
    await page.waitForFunction(() => !(window as unknown as {
      __game: { input: { actionQueued: boolean } };
    }).__game.input.actionQueued);
  }
  await expect(page.locator('.emerald-dialogue--visible')).toBeHidden();
}

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

async function walkOneTile(page: Page, key: ArrowKey): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForFunction(() => (window as unknown as {
    __game: { player: { movement: { moving: boolean } } };
  }).__game.player.movement.moving);
  await page.keyboard.up(key);
  await page.waitForFunction(() => !(window as unknown as {
    __game: { player: { movement: { moving: boolean } } };
  }).__game.player.movement.moving);
}

async function faceDirection(page: Page, key: ArrowKey, facing: string): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForFunction((expected) => (window as unknown as {
    __game: { player: { movement: { facing: string } } };
  }).__game.player.movement.facing === expected, facing);
  await page.keyboard.up(key);
}

async function advanceBattleUntilChoiceOrVictory(page: Page): Promise<void> {
  // 第二阶段的攻击、受击、HP 和镜头演出由主循环按顺序播放，
  // 软件 WebGL 下允许更充足的动画帧数再寻找下一个交互点。
  for (let i = 0; i < 60; i++) {
    if (await page.getByRole('button', { name: '战斗' }).isVisible().catch(() => false)) return;
    if (await page.getByText(/战胜了野生的蛇纹熊/).isVisible().catch(() => false)) return;
    const continueButton = page.getByRole('button', { name: /继续/ });
    if (await continueButton.isVisible().catch(() => false)) {
      // 消息可能恰好在查询与点击之间切换，短超时后由下一轮重试即可。
      await continueButton.click({ timeout: 1_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(160);
  }
  throw new Error('战斗消息在预期步数内没有回到指令菜单或胜利结算');
}

test('opening story reaches the starter battle and persists the received partner', async ({ page }) => {
  // 完整序章含多次地图装配和软件 WebGL 战斗演出；共享机器负载下保留足够预算。
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('.story-objective')).toContainText('听妈妈介绍新家');
  await expect(page.locator('.emerald-dialogue--visible')).toBeVisible();
  await finishDialogue(page);
  await expect(page.locator('.story-objective')).toContainText('调查墙上的时钟');

  // 跳过纯步行距离，地图仍走真实装配和淡入淡出。
  await page.evaluate(() => (window as unknown as { __story: { warp(map: string, x: number, y: number, facing: string): Promise<void> } }).__story.warp('player-house-2f', 5, 2, 'up'));
  await page.keyboard.press('Space');
  await expect(page.locator('.emerald-dialogue--visible')).toBeVisible();
  await finishDialogue(page);
  await page.getByRole('button', { name: '设置' }).click();
  await finishDialogue(page);
  await expect(page.locator('.story-objective')).toContainText('一起看电视');

  // 从楼梯口实际走到电视正前方，验证家具碰撞和整段电视交互区域。
  await page.evaluate(() => (window as unknown as { __story: { warp(map: string, x: number, y: number, facing: string): Promise<void> } }).__story.warp('player-house-1f', 8, 3, 'down'));
  await walkOneTile(page, 'ArrowLeft');
  await walkOneTile(page, 'ArrowLeft');
  await walkOneTile(page, 'ArrowDown');
  await walkOneTile(page, 'ArrowDown');
  await walkOneTile(page, 'ArrowLeft');
  await walkOneTile(page, 'ArrowLeft');
  await walkOneTile(page, 'ArrowLeft');
  // 电视占据北侧格，只转向调查，不会穿进家具。
  await faceDirection(page, 'ArrowUp', 'up');
  const tvPosition = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: { player: { movement: { tileX: number; tileY: number; facing: string } } };
    }).__game;
    return {
      x: game.player.movement.tileX,
      y: game.player.movement.tileY,
      facing: game.player.movement.facing,
    };
  });
  expect(tvPosition).toEqual({ x: 3, y: 5, facing: 'up' });
  await page.keyboard.press('Space');
  await expect(page.locator('.emerald-dialogue--visible')).toBeVisible();
  await finishDialogue(page);
  await expect(page.locator('.story-objective')).toContainText('拜访新邻居');
  expect(await page.evaluate(() => (window as unknown as {
    __game: { world: { root: { getObjectByName(name: string): { visible: boolean } | undefined } } };
  }).__game.world.root.getObjectByName('npc-mom')?.visible)).toBe(true);

  // 2F 与劲敌交谈。
  await page.evaluate(() => (window as unknown as { __story: { warp(map: string, x: number, y: number, facing: string): Promise<void> } }).__story.warp('rival-house-2f', 4, 3, 'right'));
  await page.keyboard.press('Space');
  await expect(page.locator('.emerald-dialogue--visible')).toBeVisible();
  await finishDialogue(page);
  // 对话结束后小遥仍可见，并自行走向二楼楼梯；演出结束前玩家不能移动。
  await expect(page.locator('.story-objective')).toContainText('拜访新邻居');
  await expect.poll(() => page.evaluate(() => {
    const actor = (window as unknown as {
      __game: { world: { root: { getObjectByName(name: string): {
        visible: boolean; position: { x: number; z: number };
      } | undefined } } };
    }).__game.world.root.getObjectByName('npc-rival');
    return {
      visible: actor?.visible,
      leftStartingTile: actor ? actor.position.x < 5.5 : false,
    };
  })).toEqual({ visible: true, leftStartingTile: true });
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowDown');
  expect(await page.evaluate(() => {
    const movement = (window as unknown as {
      __game: { player: { movement: { tileX: number; tileY: number; moving: boolean } } };
    }).__game.player.movement;
    return { x: movement.tileX, y: movement.tileY, moving: movement.moving };
  })).toEqual({ x: 4, y: 3, moving: false });
  await expect.poll(() => page.evaluate(() => {
    const actor = (window as unknown as {
      __game: { world: { root: { getObjectByName(name: string): {
        visible: boolean; position: { x: number; z: number };
      } | undefined } } };
    }).__game.world.root.getObjectByName('npc-rival');
    return { visible: actor?.visible, x: actor?.position.x, z: actor?.position.z };
  }), { timeout: 10_000 }).toEqual({ visible: false, x: 1.5, z: 2 });
  await expect(page.locator('.story-objective')).toContainText('101 号道路');
  await walkOneTile(page, 'ArrowDown');

  // 从镇内沿女孩右侧的正常通道进入道路，验证 x=11 入口同样触发求救。
  await page.evaluate(() => (window as unknown as { __story: { warp(map: string, x: number, y: number, facing: string): Promise<void> } }).__story.warp('littleroot', 11, 42, 'up'));
  await walkOneTile(page, 'ArrowUp');
  await walkOneTile(page, 'ArrowUp');
  await walkOneTile(page, 'ArrowUp');
  await expect(page.locator('.emerald-dialogue--visible')).toBeVisible();
  await finishDialogue(page);
  await expect(page.locator('.story-objective')).toContainText('博士右下方的背包');

  // 原版博士、蛇纹熊和背包必须已进入真实运行时；博士和蛇纹熊会一前一后持续奔跑。
  const firstStoryScene = await page.evaluate(() => {
    const root = (window as unknown as {
      __game: { world: { root: { getObjectByName(name: string): { visible: boolean; position: { x: number; z: number } } | undefined } } };
    }).__game.world.root;
    const birch = root.getObjectByName('npc-birch-field');
    const zigzagoon = root.getObjectByName('npc-zigzagoon-field');
    return {
      birchVisible: birch?.visible,
      birchPosition: birch ? [birch.position.x, birch.position.z] : undefined,
      bagVisible: root.getObjectByName('npc-starter-bag')?.visible,
      zigzagoonVisible: zigzagoon?.visible,
      zigzagoonPosition: zigzagoon ? [zigzagoon.position.x, zigzagoon.position.z] : undefined,
    };
  });
  await page.waitForFunction((initial) => {
    const root = (window as unknown as {
      __game: { world: { root: { getObjectByName(name: string): { position: { x: number; z: number } } | undefined } } };
    }).__game.world.root;
    const birch = root.getObjectByName('npc-birch-field');
    const zigzagoon = root.getObjectByName('npc-zigzagoon-field');
    if (!birch || !zigzagoon || !initial.birch || !initial.zigzagoon) return false;
    const birchMoved = Math.hypot(birch.position.x - initial.birch[0], birch.position.z - initial.birch[1]);
    const zigzagoonMoved = Math.hypot(zigzagoon.position.x - initial.zigzagoon[0], zigzagoon.position.z - initial.zigzagoon[1]);
    return birchMoved > 0.08 && zigzagoonMoved > 0.08;
  }, { birch: firstStoryScene.birchPosition, zigzagoon: firstStoryScene.zigzagoonPosition });
  const secondChasePositions = await page.evaluate(() => {
    const root = (window as unknown as {
      __game: { world: { root: { getObjectByName(name: string): { position: { x: number; z: number } } | undefined } } };
    }).__game.world.root;
    const birch = root.getObjectByName('npc-birch-field');
    const zigzagoon = root.getObjectByName('npc-zigzagoon-field');
    return {
      birch: birch ? [birch.position.x, birch.position.z] : undefined,
      zigzagoon: zigzagoon ? [zigzagoon.position.x, zigzagoon.position.z] : undefined,
    };
  });
  expect(firstStoryScene.birchVisible).toBe(true);
  expect(firstStoryScene.bagVisible).toBe(true);
  expect(firstStoryScene.zigzagoonVisible).toBe(true);
  expect(secondChasePositions.birch).not.toEqual(firstStoryScene.birchPosition);
  expect(secondChasePositions.zigzagoon).not.toEqual(firstStoryScene.zigzagoonPosition);
  expect(Math.hypot(
    secondChasePositions.birch![0] - secondChasePositions.zigzagoon![0],
    secondChasePositions.birch![1] - secondChasePositions.zigzagoon![1],
  )).toBeGreaterThan(0.7);
  const storyAssetUrls = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
  expect(storyAssetUrls.some((url) => url.endsWith('/assets/sprites/story/prof-birch.png'))).toBe(true);
  expect(storyAssetUrls.some((url) => url.endsWith('/assets/sprites/story/enemy-zigzagoon.png'))).toBe(true);
  expect(storyAssetUrls.some((url) => url.endsWith('/assets/sprites/story/birchs-bag.png'))).toBe(true);
  await page.screenshot({ path: 'test-results/birch-rescue.png', fullPage: true });

  // 沿正常道路走到背包右侧，面向左调查并选择木守宫。
  await walkOneTile(page, 'ArrowUp');
  await walkOneTile(page, 'ArrowUp');
  await walkOneTile(page, 'ArrowUp');
  await faceDirection(page, 'ArrowLeft', 'left');
  await page.keyboard.press('Space');
  await expect(page.locator('.emerald-dialogue--visible')).toBeVisible();
  await finishDialogue(page);
  await expect(page.getByRole('button', { name: '木守宫' })).toBeVisible();
  const starterChoiceSprites = await page.locator('.choice-image').evaluateAll((images) =>
    images.map((image) => ({
      source: (image as HTMLElement).style.backgroundImage,
      position: (image as HTMLElement).style.backgroundPosition,
      size: (image as HTMLElement).style.backgroundSize,
    })),
  );
  expect(starterChoiceSprites).toHaveLength(3);
  expect(starterChoiceSprites.map((sprite) => sprite.position)).toEqual(['0% 0%', '50% 0%', '100% 0%']);
  for (const sprite of starterChoiceSprites) {
    expect(sprite.source).toContain('assets/sprites/pokemon/pokeemerald-front-atlas.png');
    expect(sprite.size).toBe('300% 200%');
  }
  await page.screenshot({ path: 'test-results/starter-choice.png', fullPage: true });
  await page.getByRole('button', { name: '木守宫' }).click();

  // 首战：确认登场文字，反复使用第一招直至胜利。
  await expect(page.getByRole('img', { name: '敌方宝可梦' }))
    .toHaveCSS('background-position', '0% 100%', { timeout: 15_000 });
  await expect(page.getByRole('img', { name: '玩家的宝可梦' }))
    .toHaveCSS('background-position', '0% 0%');
  // 进入战斗新增闪屏+漩涡转场，软件渲染并行跑测试时开场台词可能晚于默认 5s。
  await expect(page.getByText('野生的蛇纹熊出现了！')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.battle-screen')).toHaveAttribute('data-quality', 'full');
  await expect(page.locator('.battle-status.enemy .battle-type-badge')).toContainText('一般');
  await expect(page.locator('.battle-status.player .battle-type-badge')).toContainText('草');
  const fullPresentation = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: {
        scene: { getObjectByName(name: string): unknown };
        postfx: { enabled: boolean; tiltShift: { clearArea: number }; bloom: { intensity: number } };
      };
    }).__game;
    return {
      environment: Boolean(game.scene.getObjectByName('battle-environment')),
      motes: Boolean(game.scene.getObjectByName('battle-air-motes')),
      shafts: Boolean(game.scene.getObjectByName('battle-sun-shafts')),
      foreground: Boolean(game.scene.getObjectByName('battle-reference-foreground-grass')),
      playerPlatform: Boolean(game.scene.getObjectByName('battle-platform-player')),
      enemyPlatform: Boolean(game.scene.getObjectByName('battle-platform-enemy')),
      postfx: {
        enabled: game.postfx.enabled,
        clearArea: game.postfx.tiltShift.clearArea,
        bloom: game.postfx.bloom.intensity,
      },
    };
  });
  expect(fullPresentation).toMatchObject({
    environment: true,
    motes: true,
    shafts: true,
    foreground: true,
    playerPlatform: true,
    enemyPlatform: true,
    postfx: { enabled: true, clearArea: 0.46, bloom: 0.42 },
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
  await page.screenshot({ path: 'test-results/starter-battle.png', fullPage: true });
  await advanceBattleUntilChoiceOrVictory(page);
  await expect(page.getByRole('button', { name: '背包' })).toBeDisabled();
  for (let turn = 0; turn < 5; turn++) {
    if (await page.getByText(/战胜了野生的蛇纹熊/).isVisible().catch(() => false)) break;
    await page.getByRole('button', { name: '战斗' }).click();
    await page.getByRole('button', { name: /拍击/ }).click();
    await advanceBattleUntilChoiceOrVictory(page);
  }
  await expect(page.getByText(/战胜了野生的蛇纹熊/)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('.emerald-dialogue--visible')).toBeVisible();
  await finishDialogue(page, 6);
  await expect(page.locator('.emerald-dialogue--visible')).toBeVisible();
  await finishDialogue(page, 8);
  await page.getByRole('button', { name: '否' }).click();
  await expect(page.locator('.emerald-dialogue--visible')).toBeVisible();
  await finishDialogue(page, 8);
  const labBirchTexture = await page.evaluate(() => {
    const birch = (window as unknown as {
      __game: { world: { root: { getObjectByName(name: string): { material?: { map?: { image?: HTMLImageElement } } } | undefined } } };
    }).__game.world.root.getObjectByName('npc-birch-lab');
    return birch?.material?.map?.image?.getAttribute('src');
  });
  expect(labBirchTexture).toBe('assets/sprites/story/prof-birch.png');
  const restoredPresentation = await page.evaluate(() => {
    const game = (window as unknown as {
      __game: {
        scene: { getObjectByName(name: string): unknown };
        postfx: { enabled: boolean; tiltShift: { clearArea: number }; bloom: { intensity: number } };
      };
    }).__game;
    return {
      environment: Boolean(game.scene.getObjectByName('battle-environment')),
      postfxEnabled: game.postfx.enabled,
      clearArea: game.postfx.tiltShift.clearArea,
      bloom: game.postfx.bloom.intensity,
    };
  });
  expect(restoredPresentation).toEqual({
    environment: false, postfxEnabled: true, clearArea: 0.54, bloom: 0.3,
  });
  await page.screenshot({ path: 'test-results/opening-final.png', fullPage: true });

  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('hd2d-pokemon-opening-v1') ?? '{}'));
  expect(save.phase).toBe('free_roam');
  expect(save.party).toHaveLength(1);
  expect(save.party[0].species).toBe('treecko');
  expect(errors).toEqual([]);
});
