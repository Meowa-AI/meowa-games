/**
 * 全部可调参数集中在此，便于对照原作调手感/调画面。
 * 世界约定：1 tile = 1 世界单位；地面在 XZ 平面，+Y 向上；
 * tile (x, y) → world (x + 0.5, 0, y + 0.5)（tile 中心）。
 */
export const CONFIG = {
  /** 原版 GBA 每 tile 像素数 */
  tilePixels: 16,

  player: {
    /** 每格移动耗时（秒）。绿宝石步行 16px/16帧 ≈ 0.266s */
    moveDuration: 0.25,
    /** 按住 Shift 时的移动与行走动画速度倍率 */
    runSpeedMultiplier: 2,
    /** 轻点转向判定阈值（秒）：按键短于该值且方向不同则只转向不移动 */
    tapThreshold: 0.08,
    /** 精灵面片尺寸（世界单位）。绿宝石人物 16x32px = 1x2 tile */
    spriteWidth: 1,
    spriteHeight: 2,
    /** 面片底部距地面的抬升，防止与地面 z-fighting/脚部被裁 */
    yOffset: 0.02,
  },

  camera: {
    fov: 45,
    /** 默认俯仰角（度）：相机从水平线向下俯视约 30° */
    pitch: 30,
    /** 默认相机到注视点的距离（世界单位） */
    distance: 14,
    /** 跟随平滑系数（越大跟得越紧） */
    followLerp: 6,
    near: 0.1,
    far: 100,
    /** 交互限制：拖拽调 yaw/pitch，滚轮调距离 */
    minPitch: 20,
    maxPitch: 80,
    minDistance: 7,
    maxDistance: 24,
    /** 水平拖拽灵敏度（弧度/像素） */
    rotateSpeed: 0.005,
    /** 垂直拖拽灵敏度（度/像素） */
    pitchSpeed: 0.25,
    /** 滚轮缩放灵敏度 */
    zoomSpeed: 0.0012,
  },

  light: {
    /** 暖色午后阳光 */
    sunColor: 0xfff2d8,
    sunIntensity: 2.6,
    /** 太阳方位（相对场景中心的方向向量）。从东南上方照射：
     *  立面（朝南，面向相机）受光，影子往西北落，画面上可见 */
    sunDirection: { x: 0.45, y: 1.0, z: 0.6 },
    ambientColor: 0xbcd4ff,
    ambientIntensity: 1.1,
    shadowMapSize: 2048,
    shadowBias: -0.0004,
    shadowNormalBias: 0.02,
  },

  fx: {
    enabled: true,
    /** 屏幕空间移轴：只模糊画面上下边缘带，游戏区保持像素锐利 */
    tiltShift: {
      clearArea: 0.54,
      feather: 0.4,
      offset: 0.0,
    },
    bloom: {
      enabled: true,
      intensity: 0.3,
      luminanceThreshold: 0.85,
      luminanceSmoothing: 0.15,
    },
    vignette: {
      enabled: true,
      darkness: 0.42,
      offset: 0.28,
    },
    /** 轻微暖色 grading */
    hueSaturation: { saturation: 0.12 },
    brightnessContrast: { brightness: 0.02, contrast: 0.05 },
    /** 昼夜循环：一整轮的真实时长（秒）；t=0 正午、0.25 黄昏、0.5 午夜、0.75 黎明 */
    dayNight: {
      cycleSeconds: 120,
      /** 初始时刻（0..1） */
      start: 0,
    },
    /** 体积光柱（白天可见，夜晚消失） */
    lightShafts: {
      count: 8,
      opacity: 0.42,
    },
    /** 萤火虫粒子 */
    fireflies: {
      count: 150,
      /** 点大小基准（世界距离衰减前） */
      size: 13,
      /** 漂浮活动高度范围 */
      minY: 0.3,
      maxY: 3.0,
    },
  },

  clearColor: 0x87b5e0,
} as const;
