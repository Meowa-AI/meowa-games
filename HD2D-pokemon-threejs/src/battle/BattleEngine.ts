import type { PokemonInstance } from '../story/GameSession';
import { battleStats, MOVES, SPECIES } from './BattleData';

export interface BattleMessage {
  text: string;
  kind?: 'move' | 'damage' | 'miss' | 'faint' | 'status';
  actor?: 'player' | 'enemy';
  target?: 'player' | 'enemy';
  moveId?: string;
  damage?: number;
  hp?: number;
}

export interface EscapeAttempt {
  escaped: boolean;
  message: BattleMessage;
}

export class BattleEngine {
  constructor(
    readonly player: PokemonInstance,
    readonly enemy: PokemonInstance,
    private readonly random: () => number = Math.random,
  ) {}

  get finished(): boolean {
    return this.player.hp <= 0 || this.enemy.hp <= 0;
  }

  runTurn(playerMoveIndex: number): BattleMessage[] {
    if (this.finished) return [];
    const enemyMoveIndex = this.enemy.moves.findIndex((move) => MOVES[move.id].power > 0);
    const playerSpeed = battleStats(this.player).speed;
    const enemySpeed = battleStats(this.enemy).speed;
    const actions = playerSpeed >= enemySpeed
      ? [() => this.attack(this.player, this.enemy, playerMoveIndex, 'enemy'),
        () => this.attack(this.enemy, this.player, Math.max(0, enemyMoveIndex), 'player')]
      : [() => this.attack(this.enemy, this.player, Math.max(0, enemyMoveIndex), 'player'),
        () => this.attack(this.player, this.enemy, playerMoveIndex, 'enemy')];

    const messages: BattleMessage[] = [];
    for (const action of actions) {
      if (this.finished) break;
      messages.push(...action());
    }
    return messages;
  }

  runEnemyTurn(): BattleMessage[] {
    if (this.player.hp <= 0 || this.enemy.hp <= 0) return [];
    const moveIndex = this.enemy.moves.findIndex((move) => MOVES[move.id].power > 0);
    return this.attack(this.enemy, this.player, Math.max(0, moveIndex), 'player');
  }

  tryEscape(attempt: number): EscapeAttempt {
    const playerSpeed = battleStats(this.player).speed;
    const enemySpeed = Math.max(1, battleStats(this.enemy).speed);
    const threshold = playerSpeed >= enemySpeed
      ? 256
      : Math.floor(playerSpeed * 128 / enemySpeed) + Math.max(1, attempt) * 30;
    const escaped = threshold >= 256 || Math.floor(this.random() * 256) < threshold;
    return {
      escaped,
      message: {
        kind: 'status',
        text: escaped ? '成功逃走了！' : '没能逃走！',
        actor: 'player',
        target: 'enemy',
      },
    };
  }

  private attack(
    attacker: PokemonInstance,
    defender: PokemonInstance,
    moveIndex: number,
    target: 'player' | 'enemy',
  ): BattleMessage[] {
    const actor = target === 'player' ? 'enemy' : 'player';
    const moveSlot = attacker.moves[moveIndex] ?? attacker.moves[0];
    const move = MOVES[moveSlot.id];
    const attackerName = attacker.nickname;
    if (moveSlot.pp <= 0) return [{ text: `${attackerName}没有可用的${move.name}了！` }];
    moveSlot.pp--;
    const messages: BattleMessage[] = [{
      text: `${attackerName}使出了${move.name}！`, kind: 'move', actor, target,
      moveId: move.id,
    }];
    if (this.random() * 100 >= move.accuracy) {
      messages.push({ text: '但是没有命中！', kind: 'miss', actor, target });
      return messages;
    }
    if (move.power === 0) {
      messages.push({ text: '没有造成伤害。', kind: 'status', actor, target });
      return messages;
    }

    const attack = battleStats(attacker).attack;
    const defense = Math.max(1, battleStats(defender).defense);
    const stab = SPECIES[attacker.species].type === move.type ? 1.5 : 1;
    const variance = 0.85 + this.random() * 0.15;
    const base = Math.floor(Math.floor((2 * attacker.level) / 5 + 2) * move.power * attack / defense / 50) + 2;
    const damage = Math.max(1, Math.floor(base * stab * variance));
    defender.hp = Math.max(0, defender.hp - damage);
    messages.push({
      text: `${defender.nickname}受到了伤害！`, kind: 'damage', actor, target,
      damage, hp: defender.hp,
    });
    if (defender.hp === 0) {
      messages.push({ text: `${defender.nickname}倒下了！`, kind: 'faint', target, hp: 0 });
    }
    return messages;
  }
}
