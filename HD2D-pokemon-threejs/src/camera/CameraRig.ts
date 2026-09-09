import * as THREE from 'three';
import { CONFIG } from '../config';
import type { MapData } from '../map/MapData';

/**
 * HD-2D 机位：透视相机环绕主角，平滑跟随，注视点钳制在地图边界内。
 * 默认锁定；仅在 F9 调试模式下允许拖拽环绕、调整俯仰与滚轮缩放。
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** 水平环绕角（弧度，0 = 从南向北看），植被公告牌与主角朝向共用 */
  yaw = 0;
  private pitchDeg: number = CONFIG.camera.pitch;
  private distance: number = CONFIG.camera.distance;
  private interactive = false;
  private readonly target = new THREE.Vector3();
  private bounds!: { minX: number; maxX: number; minZ: number; maxZ: number };
  private tour?: {
    elapsed: number;
    entry: CameraPose;
    frames: CameraTourFrame[];
    paused: boolean;
  };

  constructor(map: MapData) {
    const c = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(
      c.fov,
      window.innerWidth / window.innerHeight,
      c.near,
      c.far,
    );
    this.setMap(map);
  }

  /** 切地图时重算注视点边界与相机距离（小房间边界会收敛到中心）。 */
  setMap(map: MapData): void {
    this.tour = undefined;
    // 注视点活动范围：留出边距避免看到地图外
    const margin = 5.5;
    this.bounds = {
      minX: Math.min(margin, map.width / 2),
      maxX: Math.max(map.width - margin, map.width / 2),
      minZ: Math.min(margin, map.height / 2),
      maxZ: Math.max(map.height - margin + 1.5, map.height / 2),
    };
    this.distance = map.cameraDistance ?? CONFIG.camera.distance;
  }

  /** 绑定鼠标交互；事件只会在调试交互开启时生效。 */
  attach(dom: HTMLElement): void {
    const c = CONFIG.camera;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    dom.addEventListener('pointerdown', (e) => {
      if (!this.interactive || e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.interactive || !dragging) return;
      this.yaw -= (e.clientX - lastX) * c.rotateSpeed;
      this.pitchDeg = THREE.MathUtils.clamp(
        this.pitchDeg + (e.clientY - lastY) * c.pitchSpeed,
        c.minPitch,
        c.maxPitch,
      );
      lastX = e.clientX;
      lastY = e.clientY;
      this.place();
    });
    const stop = (e: PointerEvent) => {
      dragging = false;
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    };
    dom.addEventListener('pointerup', stop);
    dom.addEventListener('pointercancel', stop);
    dom.addEventListener(
      'wheel',
      (e) => {
        if (!this.interactive) return;
        e.preventDefault();
        this.distance = THREE.MathUtils.clamp(
          this.distance * (1 + e.deltaY * c.zoomSpeed),
          c.minDistance,
          c.maxDistance,
        );
        this.place();
      },
      { passive: false },
    );
  }

  /** F9 调试模式开启时才允许玩家改变机位。 */
  setInteractive(on: boolean): void {
    this.interactive = on;
  }

  get touring(): boolean {
    return this.tour !== undefined;
  }

  /**
   * 开始自适应场景尺寸的循环运镜。进入前保存完整机位，退出后原样恢复。
   * 路线节奏：南侧建立镜头 -> 低空穿行 -> 进入道路 -> 收紧到草丛玩家。
   */
  startTour(map: MapData): void {
    if (this.tour) return;
    this.tour = {
      elapsed: -TOUR_ENTRY_SECONDS,
      entry: this.currentPose(),
      frames: buildCameraTour(map),
      paused: false,
    };
    this.interactive = false;
  }

  stopTour(): void {
    if (!this.tour) return;
    const { entry } = this.tour;
    this.tour = undefined;
    this.applyPose(entry);
  }

  /** 每帧推进运镜；返回 true 表示当前由运镜接管相机。 */
  updateTour(dt: number): boolean {
    const tour = this.tour;
    if (!tour) return false;
    if (tour.paused) return true;
    tour.elapsed += dt;

    if (tour.elapsed < 0) {
      const t = smootherstep(1 + tour.elapsed / TOUR_ENTRY_SECONDS);
      this.applyPose(lerpPose(tour.entry, tour.frames[0].pose, t));
      return true;
    }

    const total = tour.frames.reduce((sum, frame) => sum + frame.duration, 0);
    let cursor = tour.elapsed % total;
    for (let i = 0; i < tour.frames.length; i++) {
      const from = tour.frames[i];
      if (cursor <= from.duration) {
        const to = tour.frames[(i + 1) % tour.frames.length];
        this.applyPose(lerpPose(from.pose, to.pose, smootherstep(cursor / from.duration)));
        return true;
      }
      cursor -= from.duration;
    }
    return true;
  }

  /** 冻结当前宣传片构图；保留 entry，整段结束时仍可恢复原机位。 */
  pauseTour(): void {
    if (this.tour) this.tour.paused = true;
  }

  /** 立即对准目标（初始化用） */
  snapTo(x: number, z: number): void {
    this.target.set(this.clampX(x), 0, this.clampZ(z));
    this.place();
  }

  follow(x: number, z: number, dt: number): void {
    const k = 1 - Math.exp(-CONFIG.camera.followLerp * dt);
    this.target.x += (this.clampX(x) - this.target.x) * k;
    this.target.z += (this.clampZ(z) - this.target.z) * k;
    this.place();
  }

  private clampX(v: number): number {
    return THREE.MathUtils.clamp(v, this.bounds.minX, this.bounds.maxX);
  }

  private clampZ(v: number): number {
    return THREE.MathUtils.clamp(v, this.bounds.minZ, this.bounds.maxZ);
  }

  private place(): void {
    const pitch = THREE.MathUtils.degToRad(this.pitchDeg);
    const horiz = this.distance * Math.cos(pitch);
    this.camera.position.set(
      this.target.x + horiz * Math.sin(this.yaw),
      this.target.y + this.distance * Math.sin(pitch),
      this.target.z + horiz * Math.cos(this.yaw),
    );
    this.camera.lookAt(this.target.x, this.target.y + 1, this.target.z);
  }

  private currentPose(): CameraPose {
    return {
      x: this.target.x,
      z: this.target.z,
      yaw: this.yaw,
      pitch: this.pitchDeg,
      distance: this.distance,
    };
  }

  private applyPose(pose: CameraPose): void {
    this.target.set(pose.x, 0, pose.z);
    this.yaw = pose.yaw;
    this.pitchDeg = pose.pitch;
    this.distance = pose.distance;
    this.place();
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}

interface CameraPose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  distance: number;
}

interface CameraTourFrame {
  /** 从当前机位运行到下一机位所需秒数。 */
  duration: number;
  pose: CameraPose;
}

const TOUR_ENTRY_SECONDS = 3;

/** 长镜头宣传巡游：从白天镇区缓慢推进到 101 号道路，最终收紧到草丛中的玩家。 */
export function buildCameraTour(map: Pick<MapData, 'width' | 'height' | 'cameraDistance'>): CameraTourFrame[] {
  const x = (ratio: number) => THREE.MathUtils.lerp(1, map.width - 1, ratio);
  const z = (ratio: number) => THREE.MathUtils.lerp(1, map.height - 1, ratio);
  const normalDistance = map.cameraDistance ?? CONFIG.camera.distance;
  const sceneDistance = THREE.MathUtils.clamp(
    Math.max(normalDistance, Math.hypot(map.width, map.height) * 0.36),
    normalDistance,
    34,
  );
  const glideDistance = THREE.MathUtils.clamp(sceneDistance * 0.62, normalDistance, 18);

  return [
    { duration: 4, pose: {
      x: x(0.42), z: z(0.84), yaw: -0.22, pitch: 28, distance: sceneDistance * 0.72,
    } },
    { duration: 4, pose: {
      x: x(0.55), z: z(0.68), yaw: 0.03, pitch: 25, distance: glideDistance * 1.04,
    } },
    { duration: 3, pose: {
      x: x(0.58), z: z(0.54), yaw: 0.18, pitch: 23, distance: glideDistance,
    } },
    { duration: 4, pose: {
      x: x(0.68), z: z(0.52), yaw: 0.08, pitch: 21, distance: normalDistance * 0.70,
    } },
  ];
}

function smootherstep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerpPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const yawDelta = THREE.MathUtils.euclideanModulo(to.yaw - from.yaw + Math.PI, Math.PI * 2) - Math.PI;
  return {
    x: THREE.MathUtils.lerp(from.x, to.x, t),
    z: THREE.MathUtils.lerp(from.z, to.z, t),
    yaw: from.yaw + yawDelta * t,
    pitch: THREE.MathUtils.lerp(from.pitch, to.pitch, t),
    distance: THREE.MathUtils.lerp(from.distance, to.distance, t),
  };
}
