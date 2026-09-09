import GUI from 'lil-gui';
import type * as THREE from 'three';
import { BATTLE_TUNING } from '../battle/BattleTuning';
import type { DayNight } from './DayNight';
import type { PostFX } from './PostFX';

export interface CameraModeControls {
  readonly active: boolean;
  toggle: () => void;
  onChange: (listener: (active: boolean) => void) => void;
}

/**
 * ?debug 模式的调参面板：后期、光照与昼夜的关键参数实时可调。
 */
export function createDebugPanel(
  postfx: PostFX,
  lights: THREE.Group | undefined,
  dayNight: DayNight | undefined,
  resetGame: () => void,
  cameraMode: CameraModeControls,
): GUI {
  const gui = new GUI({ title: 'HD-2D 调参' });

  const game = gui.addFolder('游戏');
  const cameraAction = { toggleCamera: () => cameraMode.toggle() };
  const cameraController = game.add(cameraAction, 'toggleCamera');
  cameraMode.onChange((active) => {
    cameraController.name(active ? '退出摄像机模式 (F8 / Esc)' : '播放宣传片 (F8)');
  });
  game.add({
    reset: () => {
      if (window.confirm('确定删除全部存档并重新开始游戏吗？此操作无法撤销。')) {
        resetGame();
      }
    },
  }, 'reset').name('删档并重新开始');

  if (dayNight) {
    const dn = gui.addFolder('昼夜');
    dn.add(dayNight, 'running').name('自动流逝');
    dn.add(dayNight, 'timeScale', 0.1, 20, 0.1).name('时间流逝速度 (x)').listen();
    dn.add(dayNight, 'time', 0, 1, 0.001).name('时刻 (0=正午)').listen();
  }

  const fx = gui.addFolder('后期');
  fx.add(postfx, 'enabled').name('启用后期 (P)');
  fx.add(postfx.tiltShift, 'clearArea', 0, 0.8, 0.01).name('中央完全清晰宽度').listen();
  fx.add(postfx.tiltShift, 'feather', 0, 0.8, 0.01).name('前后景渐变带宽').listen();
  fx.add(postfx.tiltShift, 'offset', -0.5, 0.5, 0.01).name('移轴带偏移');
  fx.add(postfx.bloom, 'intensity', 0, 2, 0.05).name('Bloom 强度');
  fx.add(postfx.bloom.luminanceMaterial, 'threshold', 0, 1, 0.01).name('Bloom 阈值');
  fx.add(postfx.vignette, 'darkness', 0, 1, 0.01).name('暗角强度');

  const battle = gui.addFolder('战斗');
  battle.add(BATTLE_TUNING, 'playerFootOffset', -0.5, 0.8, 0.01)
    .name('我方脚底高度微调')
    .listen();
  battle.add(BATTLE_TUNING, 'enemyFootOffset', -0.5, 0.8, 0.01)
    .name('敌方脚底高度微调')
    .listen();

  const sun = lights?.children.find(
    (c) => (c as THREE.Light).isLight,
  ) as THREE.DirectionalLight | undefined;
  if (sun) {
    const light = gui.addFolder('光照');
    light.add(sun, 'intensity', 0, 5, 0.05).name('阳光强度');
  }
  return gui;
}
