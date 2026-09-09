import { gameAudio, SFX } from '../audio/Bgm';
import type { PokemonInstance } from '../story/GameSession';
import { BattleEngine, type BattleMessage } from './BattleEngine';
import { MOVES, SPECIES, type ElementType } from './BattleData';
import { POKEMON_ATLAS } from './PokemonCatalog';
import type { BattleStage } from './BattleStage';
import {
  applyBattleItem, BATTLE_ITEMS, CAPTURE_ITEMS, isCaptureItem, isHealingItem,
  type BattleInventory, type BattleItemId,
} from './BattleItems';
import { attemptCapture, PARTY_LIMIT, storeCapturedPokemon } from './Capture';

export type BattleResult = 'victory' | 'defeat' | 'escaped' | 'captured';

export interface BattleOptions {
  canRun?: boolean;
  party?: PokemonInstance[];
  storage?: PokemonInstance[];
  inventory?: BattleInventory;
  canCapture?: boolean;
}

interface BattleChoice<T extends string> {
  label: string;
  value: T;
  description: string;
  meta?: string;
  tone?: 'fight' | 'party' | 'bag' | 'capture' | 'run' | 'move';
  elementType?: ElementType;
  disabled?: boolean;
}

const TYPE_UI: Record<ElementType, { label: string; glyph: string; color: string }> = {
  bug: { label: '虫', glyph: '虫', color: '#94a63a' },
  dark: { label: '恶', glyph: '月', color: '#66564b' },
  dragon: { label: '龙', glyph: '龙', color: '#7765d5' },
  electric: { label: '电', glyph: '闪', color: '#d9b72e' },
  fighting: { label: '格斗', glyph: '拳', color: '#ad4a3d' },
  fire: { label: '火', glyph: '火', color: '#df7443' },
  flying: { label: '飞行', glyph: '羽', color: '#7f9dcc' },
  ghost: { label: '幽灵', glyph: '幽', color: '#675c91' },
  grass: { label: '草', glyph: '叶', color: '#64a94e' },
  ground: { label: '地面', glyph: '地', color: '#bd9954' },
  ice: { label: '冰', glyph: '晶', color: '#74b9bd' },
  normal: { label: '一般', glyph: '星', color: '#918d80' },
  poison: { label: '毒', glyph: '毒', color: '#9b579c' },
  psychic: { label: '超能', glyph: '念', color: '#d35e82' },
  rock: { label: '岩石', glyph: '岩', color: '#a38d4e' },
  steel: { label: '钢', glyph: '钢', color: '#9297a5' },
  water: { label: '水', glyph: '滴', color: '#568ac8' },
};

/**
 * 战斗流程和 HUD。Three.js 舞台由 BattleStage 绘制，本层保持透明，
 * 只负责状态牌、消息、指令和招式选择。
 */
export class BattleScreen {
  private readonly root = document.createElement('div');
  private readonly message: HTMLParagraphElement;
  private readonly messagePanel: HTMLElement;
  private readonly actionPanel: HTMLElement;
  private readonly enemyHp: HTMLElement;
  private readonly playerHp: HTMLElement;
  private readonly enemyHpValue: HTMLElement;
  private readonly playerHpValue: HTMLElement;
  private readonly enemySprite: HTMLElement;
  private readonly playerSprite: HTMLElement;
  private readonly displayedHp = { player: 0, enemy: 0 };
  private lowHpWarned = false;

  constructor(private readonly stage: BattleStage) {
    BattleScreen.installStyles();
    this.root.className = 'battle-screen';
    this.root.dataset.quality = stage.quality;
    this.root.dataset.arena = stage.arenaKind;
    this.root.innerHTML = `
      <div class="battle-transition" aria-hidden="true"></div>
      <div class="battle-scene-grade" aria-hidden="true"></div>
      <section class="battle-status enemy" aria-label="敌方状态">
        <div class="battle-status-sprite" role="img" aria-label="敌方宝可梦"></div><div class="battle-status-copy">
          <header><strong></strong><span class="battle-type-badge"></span><span class="level"></span></header>
          <div class="hp-row"><b>HP</b><div class="hp"><i></i></div></div>
        </div>
        <span class="hp-value"></span>
      </section>
      <section class="battle-status player" aria-label="玩家状态">
        <div class="battle-status-sprite" role="img" aria-label="玩家的宝可梦"></div><div class="battle-status-copy">
          <header><strong></strong><span class="battle-type-badge"></span><span class="level"></span></header>
          <div class="hp-row"><b>HP</b><div class="hp"><i></i></div></div>
        </div>
        <span class="hp-value"></span>
      </section>
      <section class="battle-message" role="status" aria-live="polite">
        <span class="battle-message-kicker">BATTLE</span>
        <p></p>
        <button class="battle-continue" type="button">继续</button>
      </section>
      <section class="battle-actions" aria-label="战斗指令" hidden></section>`;
    this.message = this.root.querySelector('.battle-message p')!;
    this.messagePanel = this.root.querySelector('.battle-message')!;
    this.actionPanel = this.root.querySelector('.battle-actions')!;
    this.enemyHp = this.root.querySelector('.battle-status.enemy .hp i')!;
    this.playerHp = this.root.querySelector('.battle-status.player .hp i')!;
    this.enemyHpValue = this.root.querySelector('.battle-status.enemy .hp-value')!;
    this.playerHpValue = this.root.querySelector('.battle-status.player .hp-value')!;
    this.enemySprite = this.root.querySelector('.battle-status.enemy .battle-status-sprite')!;
    this.playerSprite = this.root.querySelector('.battle-status.player .battle-status-sprite')!;
  }

  async run(
    player: PokemonInstance,
    enemy: PokemonInstance,
    options: BattleOptions = {},
  ): Promise<BattleResult> {
    const party = options.party?.length ? options.party : [player];
    let activeIndex = Math.max(0, party.indexOf(player));
    let active = party[activeIndex];
    let engine = new BattleEngine(active, enemy);
    let escapeAttempts = 0;
    this.populate(active, enemy);
    document.body.classList.add('battle-active');
    document.body.appendChild(this.root);

    try {
      await this.playOpening();
      await this.showText(`野生的${enemy.nickname}出现了！`);
      await this.showText(`去吧，${active.nickname}！`);

      while (enemy.hp > 0 && party.some((pokemon) => pokemon.hp > 0)) {
        if (active.hp <= 0) {
          const nextIndex = await this.chooseParty(party, activeIndex, true);
          activeIndex = nextIndex;
          active = party[activeIndex];
          engine = new BattleEngine(active, enemy);
          await this.showText(`就决定是你了，${active.nickname}！`);
          await this.stage.switchPlayer(active);
          this.populatePlayer(active);
          continue;
        }
        const command = await this.choose('要做什么？', [
          { label: '战斗', value: 'fight', description: '选择一个招式攻击', tone: 'fight' },
          { label: '宝可梦', value: 'party', description: '查看或更换同行宝可梦', tone: 'party' },
          { label: '背包', value: 'bag', description: '使用回复道具', tone: 'bag', disabled: !options.inventory },
          {
            label: '逃跑',
            value: 'run',
            description: options.canRun ? '离开这场战斗' : '现在不能离开',
            tone: 'run',
            disabled: !options.canRun,
          },
        ] as const);
        if (command === 'run' && options.canRun) {
          const attempt = engine.tryEscape(++escapeAttempts);
          await this.showText(attempt.message.text);
          if (attempt.escaped) {
            gameAudio.playSfx(SFX.flee, 0.78);
            return 'escaped';
          }
          await this.showMessages(engine.runEnemyTurn(), active, enemy);
          continue;
        }
        if (command === 'party') {
          const nextIndex = await this.chooseParty(party, activeIndex, false);
          if (nextIndex === activeIndex) continue;
          activeIndex = nextIndex;
          active = party[activeIndex];
          engine = new BattleEngine(active, enemy);
          await this.showText(`回来吧！就决定是你了，${active.nickname}！`);
          await this.stage.switchPlayer(active);
          this.populatePlayer(active);
          await this.showMessages(engine.runEnemyTurn(), active, enemy);
          continue;
        }
        if (command === 'bag' && options.inventory) {
          const captureAvailable = Boolean(options.canCapture)
            && (party.length < PARTY_LIMIT || Boolean(options.storage));
          const item = await this.chooseItem(options.inventory, active, captureAvailable);
          if (!item) continue;
          options.inventory[item]--;
          if (isCaptureItem(item)) {
            const ball = CAPTURE_ITEMS[item];
            const attempt = attemptCapture(enemy, item);
            await this.showText(`使用了${ball.name}！`);
            await this.stage.captureAttempt(attempt.shakes, attempt.caught, ball.color);
            if (attempt.caught) {
              void gameAudio.playCaughtMusic().catch(() => {});
              const destination = storeCapturedPokemon(enemy, party, options.storage ?? []);
              this.root.classList.add('capture-success');
              await this.showText(`抓到了${enemy.nickname}！`);
              await this.showText(destination === 'party'
                ? `${enemy.nickname}加入了队伍！`
                : `队伍已满，${enemy.nickname}被送到了宝可梦存储盒。`);
              return 'captured';
            }
            const failedText = attempt.shakes === 0
              ? `${enemy.nickname}从球里跳了出来！`
              : attempt.shakes === 1
                ? '可惜！差一点就抓住了！'
                : attempt.shakes === 2
                  ? '非常可惜！眼看就要抓住了！'
                  : '太可惜了！明明已经抓住了！';
            await this.showText(failedText);
          } else if (isHealingItem(item)) {
            const restored = applyBattleItem(item, active);
            gameAudio.playSfx(SFX.heal, 0.72);
            if (active.hp / active.maxHp > 0.2) this.lowHpWarned = false;
            await Promise.all([
              this.animateHp('player', active.hp, active.maxHp),
              this.showText(`${active.nickname}回复了${restored}点体力！`),
            ]);
          }
          await this.showMessages(engine.runEnemyTurn(), active, enemy);
          continue;
        }
        if (command !== 'fight') continue;

        const moveOptions = active.moves.map((slot, index): BattleChoice<string> => {
          const move = MOVES[slot.id];
          return {
            label: move.name,
            value: String(index),
            description: `${move.type.toUpperCase()} · 威力 ${move.power || '—'}`,
            meta: `PP ${slot.pp}/${move.maxPp}`,
            tone: 'move',
            elementType: move.type,
            disabled: slot.pp <= 0,
          };
        });
        const selected = await this.choose('选择招式', moveOptions, 'cancel');
        if (selected === 'cancel') continue;
        await this.showMessages(engine.runTurn(Number(selected)), active, enemy);
      }

      const result: BattleResult = enemy.hp <= 0 ? 'victory' : 'defeat';
      if (result === 'victory') {
        void gameAudio.playWildVictoryMusic().catch(() => {});
      } else {
        gameAudio.playSfx(SFX.lost, 0.76);
      }
      await this.stage.victory(result === 'victory' ? 'player' : 'enemy');
      await this.showText(result === 'victory'
        ? `战胜了野生的${enemy.nickname}！`
        : '同行的宝可梦都失去了战斗能力……');
      return result;
    } finally {
      await this.playClosing();
      this.root.remove();
      document.body.classList.remove('battle-active');
    }
  }

  private populate(player: PokemonInstance, enemy: PokemonInstance): void {
    const enemyData = SPECIES[enemy.species];
    this.root.querySelector('.battle-status.enemy strong')!.textContent = enemy.nickname;
    this.root.querySelector('.battle-status.enemy .level')!.textContent = `Lv.${enemy.level}`;
    this.setTypeBadge(
      this.root.querySelector<HTMLElement>('.battle-status.enemy .battle-type-badge')!,
      enemyData.type,
    );
    this.setStatusSprite(this.enemySprite, enemyData.spriteIndex);
    // 保留既有 E2E/辅助技术读取的素材语义；实际像素由完整图集背景裁切显示。
    this.enemySprite.setAttribute('src', `assets/sprites/pokemon/${enemy.species}/front.png`);
    this.updateHp('enemy', enemy.hp, enemy.maxHp);
    this.populatePlayer(player);
  }

  private populatePlayer(player: PokemonInstance): void {
    const playerData = SPECIES[player.species];
    this.root.querySelector('.battle-status.player strong')!.textContent = player.nickname;
    this.root.querySelector('.battle-status.player .level')!.textContent = `Lv.${player.level}`;
    this.setTypeBadge(
      this.root.querySelector<HTMLElement>('.battle-status.player .battle-type-badge')!,
      playerData.type,
    );
    this.setStatusSprite(this.playerSprite, playerData.spriteIndex);
    this.playerSprite.setAttribute('src', `assets/sprites/pokemon/${player.species}/back.png`);
    this.updateHp('player', player.hp, player.maxHp);
    this.lowHpWarned = false;
  }

  private async chooseParty(
    party: readonly PokemonInstance[],
    activeIndex: number,
    forced: boolean,
  ): Promise<number> {
    const choices: BattleChoice<string>[] = party.map((pokemon, index) => ({
      label: pokemon.nickname,
      value: String(index),
      description: index === activeIndex ? '正在战斗' : pokemon.hp <= 0 ? '无法战斗' : '换上这只宝可梦',
      meta: `Lv.${pokemon.level} · HP ${pokemon.hp}/${pokemon.maxHp}`,
      tone: 'party',
      disabled: index === activeIndex || pokemon.hp <= 0,
    }));
    if (!forced) choices.push({ label: '返回', value: 'cancel', description: '返回战斗指令', tone: 'run' });
    const selected = await this.choose(forced ? '选择出战宝可梦' : '同行宝可梦', choices);
    return selected === 'cancel' ? activeIndex : Number(selected);
  }

  private async chooseItem(
    inventory: BattleInventory,
    target: PokemonInstance,
    canCapture: boolean,
  ): Promise<BattleItemId | undefined> {
    const choices: BattleChoice<string>[] = (Object.keys(BATTLE_ITEMS) as BattleItemId[]).map((id) => {
      const item = BATTLE_ITEMS[id];
      return {
        label: item.name,
        value: id,
        description: item.description,
        meta: `持有 ${inventory[id]}`,
        tone: item.kind === 'capture' ? 'capture' : 'bag',
        disabled: inventory[id] <= 0
          || (item.kind === 'healing' ? target.hp >= target.maxHp : !canCapture),
      };
    });
    choices.push({ label: '返回', value: 'cancel', description: '返回战斗指令', tone: 'run' });
    const selected = await this.choose('战斗背包', choices);
    return selected === 'cancel' ? undefined : selected as BattleItemId;
  }

  private setStatusSprite(element: HTMLElement, spriteIndex: number): void {
    const column = spriteIndex % POKEMON_ATLAS.columns;
    const row = Math.floor(spriteIndex / POKEMON_ATLAS.columns);
    element.style.backgroundImage = `url(${POKEMON_ATLAS.frontTexture})`;
    element.style.backgroundSize = `${POKEMON_ATLAS.columns * 100}% ${POKEMON_ATLAS.rows * 100}%`;
    element.style.backgroundPosition = `${column / (POKEMON_ATLAS.columns - 1) * 100}% ${row / (POKEMON_ATLAS.rows - 1) * 100}%`;
  }

  private setTypeBadge(element: HTMLElement, type: ElementType): void {
    const presentation = TYPE_UI[type];
    element.textContent = `${presentation.glyph} ${presentation.label}`;
    element.style.setProperty('--type-color', presentation.color);
    element.dataset.type = type;
  }

  private async showMessages(
    messages: BattleMessage[],
    player: PokemonInstance,
    enemy: PokemonInstance,
  ): Promise<void> {
    for (const entry of messages) {
      if (entry.kind === 'move' && entry.actor && entry.target) {
        await this.showText(entry.text);
        await this.stage.attack(entry.actor, entry.target, entry.moveId);
        continue;
      }
      if (entry.kind === 'damage' && entry.target) {
        if (entry.target === 'player' && !this.lowHpWarned
          && (entry.hp ?? 0) / player.maxHp <= 0.2 && (entry.hp ?? 0) > 0) {
          this.lowHpWarned = true;
          gameAudio.playSfx(SFX.lowHp, 0.72);
        }
        await Promise.all([
          this.stage.hit(entry.target),
          this.animateHp(
            entry.target,
            entry.hp ?? 0,
            entry.target === 'player' ? player.maxHp : enemy.maxHp,
          ),
        ]);
      } else if (entry.kind === 'faint' && entry.target) {
        await this.stage.faint(entry.target);
      }
      await this.showText(entry.text);
    }
  }

  private updateHp(target: 'player' | 'enemy', hp: number, maxHp: number): void {
    const bar = target === 'player' ? this.playerHp : this.enemyHp;
    const value = target === 'player' ? this.playerHpValue : this.enemyHpValue;
    const percent = Math.max(0, Math.min(100, hp / maxHp * 100));
    this.displayedHp[target] = hp;
    bar.style.width = `${percent}%`;
    bar.dataset.state = percent > 50 ? 'healthy' : percent > 20 ? 'warning' : 'danger';
    value.textContent = target === 'player' ? `${hp} / ${maxHp}` : '';
  }

  private animateHp(target: 'player' | 'enemy', hp: number, maxHp: number): Promise<void> {
    const from = this.displayedHp[target];
    const duration = 520;
    const startedAt = performance.now();
    const bar = target === 'player' ? this.playerHp : this.enemyHp;
    bar.classList.add('changing');
    return new Promise((resolve) => {
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        // 以离散台阶更新数值和宽度，保持像素 RPG 的节奏而非丝滑网页动画。
        const stepped = Math.floor(progress * 12) / 12;
        const current = progress >= 1 ? hp : Math.round(from + (hp - from) * stepped);
        this.updateHp(target, current, maxHp);
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          bar.classList.remove('changing');
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private async playOpening(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    this.root.classList.add('ready');
    await Promise.all([
      this.stage.playEntrance(),
      this.wait(this.stage.quality === 'reduced' ? 30 : 680),
    ]);
  }

  private async playClosing(): Promise<void> {
    this.root.classList.remove('ready');
    this.root.classList.add('closing');
    await Promise.all([
      this.stage.playExit(),
      this.wait(this.stage.quality === 'reduced' ? 30 : 480),
    ]);
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  private showText(text: string): Promise<void> {
    this.actionPanel.hidden = true;
    this.messagePanel.hidden = false;
    this.message.textContent = text;
    const continueButton = this.root.querySelector<HTMLButtonElement>('.battle-continue')!;
    return new Promise((resolve) => {
      const finish = (event?: Event) => {
        if (event instanceof KeyboardEvent && !['Space', 'Enter'].includes(event.code)) return;
        event?.preventDefault();
        gameAudio.playSfx(SFX.uiSelect, 0.46);
        window.removeEventListener('keydown', finish, true);
        continueButton.removeEventListener('click', finish);
        resolve();
      };
      window.addEventListener('keydown', finish, true);
      continueButton.addEventListener('click', finish);
    });
  }

  private choose<T extends string>(
    title: string,
    options: readonly BattleChoice<T>[],
    cancelValue?: T,
  ): Promise<T> {
    gameAudio.playSfx(SFX.menuOpen, 0.45);
    this.messagePanel.hidden = true;
    this.actionPanel.hidden = false;
    this.actionPanel.innerHTML = `<header><span>COMMAND</span><h2></h2></header><div class="battle-action-grid"></div><p class="battle-action-help"></p>`;
    this.actionPanel.querySelector('h2')!.textContent = title;
    const grid = this.actionPanel.querySelector<HTMLElement>('.battle-action-grid')!;
    const help = this.actionPanel.querySelector<HTMLElement>('.battle-action-help')!;
    let index = Math.max(0, options.findIndex((option) => !option.disabled));

    return new Promise((resolve) => {
      const buttons = options.map((option, optionIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `battle-action ${option.tone ?? 'move'}`;
        button.disabled = option.disabled ?? false;
        button.innerHTML = `${this.choiceIconMarkup(option)}<strong></strong><small></small>`;
        if (option.elementType) {
          button.dataset.type = option.elementType;
          button.style.setProperty('--type-color', TYPE_UI[option.elementType].color);
        }
        button.querySelector('strong')!.textContent = option.label;
        button.querySelector('small')!.textContent = option.meta ?? option.description;
        button.addEventListener('click', () => finish(option.value));
        button.addEventListener('mouseenter', () => {
          if (option.disabled) return;
          if (index !== optionIndex) gameAudio.playSfx(SFX.uiHover, 0.38);
          index = optionIndex;
          render();
        });
        grid.appendChild(button);
        return button;
      });

      const render = () => {
        buttons.forEach((button, buttonIndex) => {
          button.classList.toggle('selected', buttonIndex === index);
        });
        help.textContent = options[index]?.description ?? '';
      };
      const move = (delta: number) => {
        for (let attempts = 0; attempts < options.length; attempts++) {
          index = (index + delta + options.length) % options.length;
          if (!options[index]?.disabled) break;
        }
        render();
        gameAudio.playSfx(SFX.uiHover, 0.38);
        buttons[index]?.focus({ preventScroll: true });
      };
      const onKey = (event: KeyboardEvent) => {
        if (['ArrowLeft', 'KeyA'].includes(event.code)) {
          event.preventDefault(); move(-1);
        } else if (['ArrowRight', 'KeyD'].includes(event.code)) {
          event.preventDefault(); move(1);
        } else if (['ArrowUp', 'KeyW'].includes(event.code)) {
          event.preventDefault(); move(-2);
        } else if (['ArrowDown', 'KeyS'].includes(event.code)) {
          event.preventDefault(); move(2);
        } else if (['Space', 'Enter'].includes(event.code)) {
          event.preventDefault();
          const option = options[index];
          if (option && !option.disabled) finish(option.value);
        } else if (['Escape', 'KeyX'].includes(event.code) && cancelValue !== undefined) {
          event.preventDefault(); finish(cancelValue);
        }
      };
      const finish = (value: T) => {
        gameAudio.playSfx(value === cancelValue ? SFX.menuClose : SFX.uiSelect, 0.5);
        window.removeEventListener('keydown', onKey, true);
        this.actionPanel.hidden = true;
        resolve(value);
      };

      window.addEventListener('keydown', onKey, true);
      render();
      buttons[index]?.focus({ preventScroll: true });
    });
  }

  private choiceIconMarkup<T extends string>(option: BattleChoice<T>): string {
    if (option.elementType) {
      return `<span class="battle-action-mark type" aria-hidden="true">${TYPE_UI[option.elementType].glyph}</span>`;
    }
    const icons: Record<string, string> = {
      fight: 'assets/battle/ui/fight.png',
      party: 'assets/battle/ui/party.png',
      bag: 'assets/battle/ui/bag.png',
      capture: 'assets/battle/ui/party.png',
      run: 'assets/battle/ui/run.png',
      move: 'assets/battle/ui/move.png',
    };
    return `<span class="battle-action-mark" aria-hidden="true"><img src="${icons[option.tone ?? 'move']}" alt=""></span>`;
  }

  private static installStyles(): void {
    if (document.querySelector('#battle-screen-styles')) return;
    const style = document.createElement('style');
    style.id = 'battle-screen-styles';
    style.textContent = `
      .battle-active .story-objective{opacity:0;pointer-events:none}
      .battle-screen{position:fixed;inset:0;z-index:50;overflow:hidden;pointer-events:none;color:#f7f5df;font-family:"Courier New","Noto Sans SC",monospace;image-rendering:pixelated}
      .battle-transition{position:absolute;inset:0;z-index:12;background:linear-gradient(135deg,#07110f 0 48%,#193126 48% 52%,#07110f 52%);clip-path:inset(0 0 100% 0);transition:clip-path .64s steps(12);pointer-events:none}
      .battle-screen.ready .battle-transition{clip-path:inset(0 0 100% 0)}
      .battle-screen.closing .battle-transition{clip-path:inset(0)}
      .battle-scene-grade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,24,30,.02) 0%,transparent 42%,rgba(8,19,13,.18) 100%),radial-gradient(circle at 52% 43%,transparent 34%,rgba(2,16,15,.22) 100%);pointer-events:none}
      .battle-status{--edge:#243a39;position:absolute;display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:10px;width:min(31vw,390px);min-width:280px;padding:7px 13px 7px 7px;box-sizing:border-box;border:8px solid transparent;border-image:url("assets/battle/ui/frame.png") 6 fill/8px stretch;background:linear-gradient(135deg,rgba(18,34,34,.92),rgba(43,55,49,.9));box-shadow:10px 12px 0 rgba(5,17,14,.42),inset 0 1px rgba(255,255,255,.16);text-shadow:2px 2px #172221;pointer-events:none;opacity:0;transition:transform .38s steps(8),opacity .2s}
      .battle-screen.ready .battle-status{opacity:1;transform:translateX(0)}.battle-screen:not(.ready) .battle-status.player{transform:translateX(-36px)}.battle-screen:not(.ready) .battle-status.enemy{transform:translateX(36px)}
      .battle-screen.capture-success .battle-status.enemy{opacity:0;transform:translateX(36px)}
      .battle-status::after{content:"";position:absolute;bottom:-16px;width:26px;height:18px;background:var(--edge);clip-path:polygon(0 0,100% 0,50% 100%)}
      .battle-status.player{top:27vh;left:6vw}.battle-status.player::after{left:42%}
      .battle-status.enemy{top:8vh;right:6vw}.battle-status.enemy::after{right:34%}
      .battle-status-sprite{width:48px;height:48px;background-repeat:no-repeat;image-rendering:pixelated;filter:drop-shadow(2px 3px #0c1715)}
      .battle-status-copy{min-width:0}.battle-status header{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:7px}
      .battle-status strong{overflow:hidden;font-size:clamp(17px,1.55vw,23px);white-space:nowrap;text-overflow:ellipsis}.battle-status .level{font-size:clamp(13px,1.15vw,17px);color:#d7ddc8;font-weight:700}
      .battle-type-badge{--type-color:#71866e;display:inline-flex;align-items:center;padding:2px 6px;border:2px solid color-mix(in srgb,var(--type-color),white 38%);background:color-mix(in srgb,var(--type-color),#101817 38%);color:#fffbea;font:700 10px/1.15 monospace;text-shadow:1px 1px #16201c;white-space:nowrap}
      .hp-row{display:flex;align-items:center;gap:7px;margin-top:5px}.hp-row b{color:#65d6a2;font-size:12px;letter-spacing:1px}.hp{flex:1;height:10px;padding:2px;background:#101b19;border:2px solid #819187;box-shadow:inset 2px 2px #07100f}.hp i{display:block;height:100%;background:#52d16f;transition:background .15s}.hp i.changing{filter:brightness(1.35);box-shadow:0 0 8px currentColor}.hp i[data-state="warning"]{background:#f1c746}.hp i[data-state="danger"]{background:#ef5a4e;animation:battle-hp-danger .22s steps(2) 2}
      .hp-value{align-self:end;padding-bottom:1px;color:#d7ddc8;font:700 12px/1 monospace;white-space:nowrap}
      .battle-message,.battle-actions{position:absolute;right:max(4vw,env(safe-area-inset-right));bottom:max(4vh,env(safe-area-inset-bottom));width:min(43vw,660px);min-height:126px;box-sizing:border-box;border:8px solid transparent;border-image:url("assets/battle/ui/frame.png") 6 fill/8px stretch;background:linear-gradient(135deg,rgba(13,28,28,.91),rgba(23,35,31,.95));box-shadow:12px 14px 0 rgba(2,12,9,.38);pointer-events:auto;opacity:0;transform:translateY(24px);transition:transform .32s steps(7) .22s,opacity .2s .22s}
      .battle-screen.ready .battle-message,.battle-screen.ready .battle-actions{opacity:1;transform:translateY(0)}
      .battle-message{padding:20px 118px 18px 26px}.battle-message-kicker,.battle-actions>header>span{display:block;color:#73d99c;font:700 11px/1 monospace;letter-spacing:3px}.battle-message p{margin:11px 0 0;font-size:clamp(17px,1.7vw,25px);font-weight:700;line-height:1.45;text-shadow:2px 2px #081513}
      .battle-continue{position:absolute;right:22px;bottom:20px;padding:8px 14px;border:2px solid #6ea185;background:#233f35;color:#eff8de;font:700 14px monospace;cursor:pointer}.battle-continue::after{content:" ▾";color:#76e1a0}.battle-continue:focus-visible{outline:3px solid #f5d76e;outline-offset:2px}
      .battle-actions{padding:15px 17px 12px}.battle-actions[hidden],.battle-message[hidden]{display:none}.battle-actions>header{display:flex;align-items:baseline;justify-content:space-between;margin:0 5px 10px}.battle-actions h2{margin:0;font-size:clamp(16px,1.5vw,22px)}
      .battle-action-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.battle-action{--tone:#4f7e65;position:relative;display:grid;grid-template-columns:24px 1fr;grid-template-rows:auto auto;column-gap:8px;min-height:58px;padding:8px 12px;border:2px solid color-mix(in srgb,var(--tone),#dceacb 35%);background:linear-gradient(135deg,color-mix(in srgb,var(--tone),#172321 40%),color-mix(in srgb,var(--tone),#0e1716 68%));color:#fffbea;text-align:left;font-family:inherit;cursor:pointer}
      .battle-action.fight{--tone:#d8483e}.battle-action.party{--tone:#4f9a54}.battle-action.bag{--tone:#d58736}.battle-action.capture{--tone:#b44743}.battle-action.run{--tone:#426fc1}.battle-action.move{--tone:var(--type-color,#56866e)}
      .battle-action-mark{grid-row:1/3;align-self:center;display:grid;place-items:center;width:22px;height:22px;border:2px solid rgba(255,255,255,.68);background:#192622}.battle-action-mark img{width:18px;height:18px;image-rendering:pixelated}.battle-action-mark.type{border-color:color-mix(in srgb,var(--type-color),white 45%);background:color-mix(in srgb,var(--type-color),#101817 32%);color:#fff;font:700 11px monospace;text-shadow:1px 1px #101817}.battle-action strong{font-size:clamp(15px,1.35vw,20px)}.battle-action small{overflow:hidden;color:#d4ddce;font:700 11px/1.2 monospace;white-space:nowrap;text-overflow:ellipsis}
      .battle-action.selected,.battle-action:focus-visible{z-index:1;outline:3px solid #f8dc75;outline-offset:1px;filter:brightness(1.24);transform:translateY(-2px)}.battle-action:disabled{filter:grayscale(.75);opacity:.38;cursor:not-allowed;transform:none}.battle-action-help{min-height:1.25em;margin:8px 6px 0;color:#b9c8b9;font:700 12px/1.2 monospace}
      @keyframes battle-hp-danger{50%{filter:brightness(1.8)}}
      .battle-screen[data-quality="reduced"] *{animation:none!important;transition-duration:.01ms!important;transition-delay:0ms!important}
      @media(max-width:800px){.battle-status{min-width:240px;width:44vw}.battle-status.player{top:30vh}.battle-message,.battle-actions{left:max(3vw,env(safe-area-inset-left));right:max(3vw,env(safe-area-inset-right));bottom:max(3vh,env(safe-area-inset-bottom));width:auto}.battle-message{padding-right:100px}}
      @media(max-width:560px){.battle-status{grid-template-columns:36px 1fr;min-width:0;width:63vw;padding:4px}.battle-status-sprite{width:34px;height:34px}.battle-status.player{top:24vh;left:3vw}.battle-status.enemy{top:3vh;right:3vw}.battle-type-badge{padding:1px 4px;font-size:9px}.hp-value{display:none}.battle-action-grid{gap:5px}.battle-actions{padding:8px}.battle-action{min-height:54px;padding:6px 8px}.battle-message{min-height:105px;padding:12px 82px 12px 14px}}
      @media(max-height:620px) and (orientation:landscape){.battle-status.player{top:22vh;left:3vw}.battle-status.enemy{top:3vh;right:3vw}.battle-message,.battle-actions{bottom:3vh;min-height:104px}.battle-message{padding-top:13px;padding-bottom:12px}.battle-action{min-height:48px}}
    `;
    document.head.appendChild(style);
  }
}
