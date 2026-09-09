import * as THREE from 'three';
import type { CollisionMap } from '../map/CollisionMap';
import type { BattleArenaKind, MapData } from '../map/MapData';

export interface BattleArenaProfile {
  kind: BattleArenaKind;
  center: THREE.Vector3;
  cameraOffset: THREE.Vector3;
  lookAtOffset: THREE.Vector3;
  fogColor: number;
  fogDensity: number;
  background: number;
  platformTopTint: number;
  platformSideTint: number;
}

const PROFILE_VALUES: Record<BattleArenaKind, Omit<BattleArenaProfile, 'center'>> = {
  forest: {
    kind: 'forest', cameraOffset: new THREE.Vector3(0.35, 5.15, 11.8),
    lookAtOffset: new THREE.Vector3(0, 1.35, -0.35), fogColor: 0x6f9078,
    fogDensity: 0.012, background: 0x91bec7, platformTopTint: 0xffffff,
    platformSideTint: 0x75512c,
  },
  interior: {
    kind: 'interior', cameraOffset: new THREE.Vector3(0.25, 4.45, 10.4),
    lookAtOffset: new THREE.Vector3(0, 1.2, -0.25), fogColor: 0x5e5148,
    fogDensity: 0.009, background: 0x28242a, platformTopTint: 0xd8c4a2,
    platformSideTint: 0x654b3e,
  },
  cave: {
    kind: 'cave', cameraOffset: new THREE.Vector3(0.2, 4.8, 10.8),
    lookAtOffset: new THREE.Vector3(0, 1.28, -0.42), fogColor: 0x263446,
    fogDensity: 0.026, background: 0x101722, platformTopTint: 0x9ba6af,
    platformSideTint: 0x4b5058,
  },
  special: {
    kind: 'special', cameraOffset: new THREE.Vector3(0, 5.35, 12.2),
    lookAtOffset: new THREE.Vector3(0, 1.45, -0.55), fogColor: 0x342858,
    fogDensity: 0.016, background: 0x0d0920, platformTopTint: 0xc7b9ff,
    platformSideTint: 0x514478,
  },
};

export function isBattleArenaKind(value: unknown): value is BattleArenaKind {
  return value === 'forest' || value === 'interior' || value === 'cave' || value === 'special';
}

export function selectBattleArena(
  map: MapData,
  collision: CollisionMap,
  playerPosition: THREE.Vector3,
  override?: BattleArenaKind,
): BattleArenaProfile {
  const kind = override ?? map.battle?.kind ?? (map.interior ? 'interior' : 'forest');
  const authored = map.battle?.centers?.[0];
  const center = authored
    ? new THREE.Vector3(authored[0], 0, authored[1])
    : findOpenCenter(map, collision, playerPosition, kind === 'interior' ? 1 : 2);
  const values = PROFILE_VALUES[kind];
  return {
    ...values,
    center,
    cameraOffset: values.cameraOffset.clone(),
    lookAtOffset: values.lookAtOffset.clone(),
  };
}

function findOpenCenter(
  map: MapData,
  collision: CollisionMap,
  playerPosition: THREE.Vector3,
  clearance: number,
): THREE.Vector3 {
  if (map.interior) {
    const floor = map.interior.floor;
    const tileX = Math.floor(floor.x + floor.width / 2);
    const tileY = Math.floor(floor.y + floor.height / 2);
    if (isAreaClear(collision, tileX, tileY, clearance)) {
      return new THREE.Vector3(tileX + 0.5, 0, tileY + 0.5);
    }
  }

  const originX = THREE.MathUtils.clamp(Math.floor(playerPosition.x), 0, map.width - 1);
  const originY = THREE.MathUtils.clamp(Math.floor(playerPosition.z), 0, map.height - 1);
  const limit = Math.max(map.width, map.height);
  for (let radius = 0; radius <= limit; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = originX + dx;
        const y = originY + dy;
        if (isAreaClear(collision, x, y, clearance)) {
          return new THREE.Vector3(x + 0.5, 0, y + 0.5);
        }
      }
    }
  }
  return new THREE.Vector3(
    THREE.MathUtils.clamp(playerPosition.x, 0.5, Math.max(0.5, map.width - 0.5)),
    0,
    THREE.MathUtils.clamp(playerPosition.z, 0.5, Math.max(0.5, map.height - 0.5)),
  );
}

function isAreaClear(
  collision: CollisionMap,
  centerX: number,
  centerY: number,
  clearance: number,
): boolean {
  for (let y = centerY - clearance; y <= centerY + clearance; y++) {
    for (let x = centerX - clearance; x <= centerX + clearance; x++) {
      if (collision.isBlocked(x, y)) return false;
    }
  }
  return true;
}
