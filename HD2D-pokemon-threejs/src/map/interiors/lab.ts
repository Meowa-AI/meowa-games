import type {
  FurnitureBox, FurnitureCylinder, InteriorFurniture, MapData, MapWarp,
} from '../MapData';

/**
 * 未白镇小田卷博士研究所（原版 13x13 单层布局）。
 *
 * 建模契约：原版像素只用于确定布局、轮廓和配色；每件可辨识物件都拆成
 * 独立实体零件。场景树名称采用 lab.<物件>.<实例>.<零件>，便于运行时审计。
 */

const BASE = 'assets/interiors/lab';

/**
 * 相邻实体之间保留约 1/8 个原作像素的真实几何间隔。
 * 这不是可见缝隙，而是避免装饰层与承载面落在同一深度平面。
 */
const SURFACE_GAP = 0.008;

function parseCollision(rows: string[]): number[][] {
  return rows.map((row) => [...row].map((cell) => (cell === '#' ? 1 : 0)));
}

const COLLISION = parseCollision([
  '#############',
  '#############',
  '#############',
  '#...#....##.#',
  '#........##..',
  '####.........',
  '####......###',
  '####......###',
  '.............',
  '##.........##',
  '###.......###',
  '##.........##',
  '...#.........',
]);

const WALL = {
  height: 3,
  thickness: 0.3,
  northZ: 3,
  northTexture: `${BASE}/wall.png`,
  sideTexture: `${BASE}/wall-side.png`,
  capColor: 0xf0efdc,
  baseColor: 0xc7c7ad,
};

const C = {
  ink: 0x25283a,
  navy: 0x343963,
  navyLight: 0x59618e,
  metalDark: 0x434957,
  metal: 0x777e8b,
  metalLight: 0xc8c9bf,
  white: 0xe7e6d4,
  paper: 0xf1e9b8,
  woodDark: 0x573d31,
  wood: 0x91603d,
  woodLight: 0xc89b57,
  goldDark: 0x725c12,
  gold: 0xc5a516,
  goldLight: 0xe4cf48,
  greenDark: 0x176d35,
  green: 0x42c948,
  greenLight: 0x75df55,
  blue: 0x6875c4,
  blueDark: 0x3f456d,
  red: 0xb9282f,
  redLight: 0xe24037,
  screen: 0x365d91,
  screenLight: 0x63a8b7,
  soil: 0x4b2d1b,
  pot: 0x8c4c24,
  potLight: 0xc47a29,
} as const;

type BoxOptions = Omit<FurnitureBox, 'x' | 'z' | 'w' | 'd' | 'h' | 'name'>;

function box(
  name: string,
  x: number, z: number, w: number, d: number, h: number,
  options: BoxOptions = {},
): FurnitureBox {
  return { name, x, z, w, d, h, ...options };
}

function cylinder(
  name: string,
  x: number, z: number, radius: number, h: number,
  options: Omit<FurnitureCylinder, 'kind' | 'x' | 'z' | 'radius' | 'h' | 'name'> = {},
): FurnitureCylinder {
  return { kind: 'cylinder', name, x, z, radius, h, ...options };
}

function bookshelf(
  id: string, x: number, z: number, w = 1.9, h = 1.65,
): InteriorFurniture[] {
  const name = `lab.bookshelf.${id}`;
  const d = 0.58;
  const pieces: InteriorFurniture[] = [
    box(`${name}.back`, x + 0.1, z, w - 0.2, 0.1, h - 0.08, { color: C.navy }),
    box(`${name}.left-post`, x, z, 0.13, d, h, { color: C.ink }),
    box(`${name}.right-post`, x + w - 0.13, z, 0.13, d, h, { color: C.ink }),
    box(`${name}.top-cap`, x - 0.03, z - 0.03, w + 0.06, d + 0.06, 0.12, {
      y: h - 0.12 + SURFACE_GAP, color: C.white,
    }),
    box(`${name}.base`, x - 0.02, z, w + 0.04, d + 0.05, 0.14, { color: C.metalDark }),
  ];

  const shelfY = [0.38, 0.86, 1.32];
  shelfY.forEach((y, index) => pieces.push(
    box(`${name}.shelf-${index}`, x + 0.1 + SURFACE_GAP, z + 0.06,
      w - 0.2 - SURFACE_GAP * 2, d - 0.03, 0.08, {
      y, color: C.metalLight,
    }),
  ));

  const bookColors = [C.blue, C.green, C.red, C.paper, C.navyLight, C.woodLight];
  for (let row = 0; row < 2; row++) {
    let cursor = x + 0.18;
    for (let index = 0; index < 9; index++) {
      const width = 0.09 + (index % 3) * 0.025;
      const height = 0.25 + ((index + row) % 3) * 0.045;
      pieces.push(box(
        `${name}.book-${row}-${index}`,
        cursor, z + d - 0.14, width, 0.11, height,
        { y: shelfY[row] + 0.08, color: bookColors[(index + row * 2) % bookColors.length] },
      ));
      cursor += width + 0.045;
      if (cursor > x + w - 0.18) break;
    }
  }

  for (let index = 0; index < 2; index++) {
    const panelW = (w - 0.34) / 2;
    const px = x + 0.14 + index * panelW;
    pieces.push(
      box(`${name}.drawer-${index}`, px, z + d - 0.035, panelW - 0.03, 0.04, 0.22, {
        y: 0.12, color: C.navyLight,
      }),
      box(`${name}.drawer-handle-${index}`, px + panelW / 2 - 0.08, z + d + 0.008, 0.16, 0.035, 0.035, {
        y: 0.22, color: C.metalLight,
      }),
    );
  }
  return pieces;
}

function workTable(
  id: string, x: number, z: number, w: number, d = 0.82,
): InteriorFurniture[] {
  const name = `lab.table.${id}`;
  const topY = 0.7;
  const pieces: InteriorFurniture[] = [
    box(`${name}.top`, x, z, w, d, 0.12, { y: topY, color: C.woodLight }),
    box(`${name}.front-apron`, x + 0.08 + SURFACE_GAP, z + d - 0.12,
      w - 0.16 - SURFACE_GAP * 2, 0.1, 0.2 - SURFACE_GAP * 2, {
      y: 0.5, color: C.woodDark,
    }),
  ];
  for (const [suffix, lx, lz] of [
    ['nw', x + 0.08, z + 0.08],
    ['ne', x + w - 0.2, z + 0.08],
    ['sw', x + 0.08, z + d - 0.2],
    ['se', x + w - 0.2, z + d - 0.2],
  ] as const) {
    pieces.push(box(`${name}.leg-${suffix}`, lx, lz, 0.12, 0.12, topY - SURFACE_GAP, {
      color: C.woodDark,
    }));
  }
  return pieces;
}

function monitor(
  id: string, x: number, z: number, y = 0.82, scale = 1,
): InteriorFurniture[] {
  const name = `lab.computer.${id}`;
  const w = 0.9 * scale;
  const h = 0.72 * scale;
  const d = 0.2 * scale;
  return [
    box(`${name}.monitor-body`, x, z, w, d, h, { y, color: C.metalLight }),
    box(`${name}.bezel`, x + 0.08 * scale, z + d - 0.005, w - 0.16 * scale, 0.035, h - 0.16 * scale, {
      y: y + 0.08 * scale, color: C.ink,
    }),
    box(`${name}.screen`, x + 0.14 * scale, z + d + 0.032, w - 0.28 * scale, 0.025, h - 0.28 * scale, {
      y: y + 0.14 * scale, color: C.screen,
    }),
    box(`${name}.screen-glint`, x + 0.19 * scale, z + d + 0.061, 0.12 * scale, 0.012, 0.08 * scale, {
      y: y + h - 0.2 * scale, color: C.screenLight,
    }),
    box(`${name}.stand`, x + w / 2 - 0.06 * scale, z + 0.06 * scale, 0.12 * scale, 0.12 * scale, 0.18 * scale - SURFACE_GAP, {
      y: y - 0.18 * scale, color: C.metalDark,
    }),
    box(`${name}.base`, x + w / 2 - 0.22 * scale, z, 0.44 * scale, 0.3 * scale, 0.06 * scale, {
      y: y - 0.06 * scale + SURFACE_GAP, color: C.metalDark,
    }),
  ];
}

function keyboard(
  id: string, x: number, z: number, y: number, w = 0.72,
): InteriorFurniture[] {
  const name = `lab.keyboard.${id}`;
  const pieces: InteriorFurniture[] = [
    box(`${name}.body`, x, z, w, 0.3, 0.06, { y, color: C.metalLight }),
  ];
  for (let row = 0; row < 2; row++) {
    for (let key = 0; key < 6; key++) {
      pieces.push(box(`${name}.key-${row}-${key}`, x + 0.06 + key * 0.1, z + 0.05 + row * 0.1, 0.07, 0.065, 0.018, {
        y: y + 0.06, color: (row + key) % 4 === 0 ? C.blue : C.ink,
      }));
    }
  }
  return pieces;
}

function workstation(
  id: string, x: number, z: number, w = 1.55, d = 1.28,
): InteriorFurniture[] {
  const pieces = workTable(`workstation-${id}`, x, z, w, d);
  pieces.push(
    ...monitor(`workstation-${id}`, x + 0.28, z + 0.1, 0.82, 0.95),
    ...keyboard(`workstation-${id}`, x + 0.36, z + d - 0.42, 0.83, 0.68),
    box(`lab.computer.workstation-${id}.tower`, x + 0.08 + SURFACE_GAP, z + 0.18, 0.28, 0.42, 0.62, {
      y: 0.05, color: C.metalLight,
    }),
    box(`lab.computer.workstation-${id}.tower-slot`, x + 0.13, z + 0.602, 0.18, 0.025, 0.04, {
      y: 0.45, color: C.ink,
    }),
    box(`lab.computer.workstation-${id}.tower-light`, x + 0.16, z + 0.63, 0.05, 0.018, 0.05, {
      y: 0.16, color: C.greenLight,
    }),
  );
  return pieces;
}

type Facing = 'north' | 'south' | 'east' | 'west';

function rotateBoxes(
  pieces: FurnitureBox[], centerX: number, centerZ: number, angle: number,
): FurnitureBox[] {
  if (angle === 0) return pieces;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return pieces.map((piece) => {
    const px = piece.x + piece.w / 2 - centerX;
    const pz = piece.z + piece.d / 2 - centerZ;
    const rotatedX = px * cosine + pz * sine + centerX;
    const rotatedZ = -px * sine + pz * cosine + centerZ;
    return {
      ...piece,
      x: rotatedX - piece.w / 2,
      z: rotatedZ - piece.d / 2,
      rotationY: (piece.rotationY ?? 0) + angle,
    };
  });
}

function chair(
  id: string, x: number, z: number, cushion: number, facing: Facing,
): InteriorFurniture[] {
  const name = `lab.chair.${id}`;
  const w = 0.72;
  const d = 0.72;
  const frame = cushion === C.green ? C.greenDark : C.blueDark;
  const pieces: FurnitureBox[] = [
    box(`${name}.seat-frame`, x, z, w, d, 0.12, { y: 0.42, color: frame }),
    box(`${name}.seat-cushion`, x + 0.06, z + 0.06, w - 0.12, d - 0.12, 0.12, {
      y: 0.54, color: cushion,
    }),
  ];
  for (const [suffix, lx, lz] of [
    ['nw', x + 0.04, z + 0.04], ['ne', x + w - 0.12, z + 0.04],
    ['sw', x + 0.04, z + d - 0.12], ['se', x + w - 0.12, z + d - 0.12],
  ] as const) {
    pieces.push(box(`${name}.leg-${suffix}`, lx, lz, 0.08, 0.08, 0.44, { color: frame }));
  }
  // 基准模型朝北：靠背在南侧；其余朝向围绕座面中心整体旋转。
  const backZ = z + d - 0.1;
  pieces.push(
    box(`${name}.back-post-left`, x + 0.04, backZ, 0.08, 0.08, 0.64, {
      y: 0.44, color: frame,
    }),
    box(`${name}.back-post-right`, x + w - 0.12, backZ, 0.08, 0.08, 0.64, {
      y: 0.44, color: frame,
    }),
    box(`${name}.back-pad`, x + 0.12, backZ - 0.015, w - 0.24, 0.11, 0.38, {
      y: 0.68, color: cushion,
    }),
  );
  const angle = facing === 'north' ? 0
    : facing === 'east' ? -Math.PI / 2
      : facing === 'west' ? Math.PI / 2
        : Math.PI;
  return rotateBoxes(pieces, x + w / 2, z + d / 2, angle);
}

function storageCabinet(
  id: string, x: number, z: number, columns = 1,
): InteriorFurniture[] {
  const name = `lab.storage.${id}`;
  const cell = 0.82;
  const w = columns * cell;
  const d = 0.72;
  const h = 1.3;
  const pieces: InteriorFurniture[] = [
    box(`${name}.body`, x, z, w, d, h, { color: C.goldDark }),
    box(`${name}.top`, x - 0.03, z - 0.03, w + 0.06, d + 0.06, 0.12, {
      y: h, color: C.goldLight,
    }),
    box(`${name}.base`, x - 0.02, z - SURFACE_GAP, w + 0.04,
      d + 0.04 + SURFACE_GAP, 0.1, { color: C.goldDark }),
  ];
  for (let column = 0; column < columns; column++) {
    const px = x + column * cell + 0.08;
    for (let row = 0; row < 2; row++) {
      const py = 0.13 + row * 0.54;
      pieces.push(
        box(`${name}.door-${column}-${row}`, px, z + d - 0.025, cell - 0.16, 0.04, 0.47, {
          y: py, color: row === 0 ? C.gold : C.goldLight,
        }),
        box(`${name}.door-frame-top-${column}-${row}`, px, z + d + 0.018, cell - 0.16, 0.025, 0.035, {
          y: py + 0.43, color: C.goldDark,
        }),
        box(`${name}.handle-${column}-${row}`, px + cell - 0.31, z + d + 0.045, 0.07, 0.025, 0.16, {
          y: py + 0.15, color: C.ink,
        }),
      );
    }
  }
  return pieces;
}

function book(
  id: string, x: number, z: number, y: number, color: number, rotationY = 0,
): InteriorFurniture[] {
  const name = `lab.book.${id}`;
  return [
    box(`${name}.pages`, x, z, 0.55, 0.36, 0.08, { y: y + 0.025, color: C.paper, rotationY }),
    box(`${name}.bottom-cover`, x - 0.02, z - 0.02, 0.59, 0.4, 0.025, { y, color, rotationY }),
    box(`${name}.top-cover`, x - 0.02, z - 0.02, 0.59, 0.4, 0.035, { y: y + 0.105, color, rotationY }),
    box(`${name}.spine`, x - 0.035, z, 0.04, 0.36, 0.13, { y, color, rotationY }),
  ];
}

function plant(id: string, x: number, z: number): InteriorFurniture[] {
  const name = `lab.plant.${id}`;
  const pieces: InteriorFurniture[] = [
    cylinder(`${name}.pot`, x, z, 0.3, 0.34, {
      radiusTop: 0.34, radiusBottom: 0.25, color: C.pot, segments: 8,
    }),
    cylinder(`${name}.pot-rim`, x, z, 0.36, 0.1, { y: 0.3, color: C.potLight, segments: 8 }),
    cylinder(`${name}.soil`, x, z, 0.29, 0.035, { y: 0.4, color: C.soil, segments: 8 }),
    box(`${name}.stem`, x - 0.045, z - 0.045, 0.09, 0.09, 0.64, { y: 0.39, color: C.greenDark }),
  ];
  for (let index = 0; index < 10; index++) {
    const angle = index * Math.PI * 2 / 10;
    const radius = index % 2 === 0 ? 0.18 : 0.1;
    const lx = x + Math.cos(angle) * radius - 0.08;
    const lz = z + Math.sin(angle) * radius - 0.055;
    pieces.push(box(`${name}.leaf-${index}`, lx, lz, 0.16, 0.11, 0.48, {
      y: 0.58 + (index % 3) * 0.08,
      color: index % 2 === 0 ? C.green : C.greenLight,
      rotationY: -angle,
      rotationZ: index % 2 === 0 ? 0.72 : -0.72,
    }));
  }
  return pieces;
}

function metalRack(id: string, x: number, z: number): InteriorFurniture[] {
  const name = `lab.rack.${id}`;
  const pieces: InteriorFurniture[] = [];
  for (const [suffix, lx, lz] of [
    ['nw', x, z], ['ne', x + 0.72, z], ['sw', x, z + 0.5], ['se', x + 0.72, z + 0.5],
  ] as const) {
    pieces.push(box(`${name}.post-${suffix}`, lx, lz, 0.08, 0.08, 1.48, { color: C.metalDark }));
  }
  for (let level = 0; level < 3; level++) {
    pieces.push(box(`${name}.shelf-${level}`, x + SURFACE_GAP, z + SURFACE_GAP,
      0.8 - SURFACE_GAP * 2, 0.58 - SURFACE_GAP * 2, 0.08, {
      y: 0.18 + level * 0.52, color: C.metalLight,
    }));
  }
  pieces.push(
    box(`${name}.vial-red`, x + 0.15, z + 0.12, 0.12, 0.12, 0.25, { y: 0.78, color: C.red }),
    box(`${name}.vial-blue`, x + 0.43, z + 0.12, 0.12, 0.12, 0.32, { y: 0.78, color: C.blue }),
  );
  return pieces;
}

function researchMachine(x: number, z: number): InteriorFurniture[] {
  const name = 'lab.machine.central';
  const pieces: InteriorFurniture[] = [
    cylinder(`${name}.foot`, x, z, 1.08, 0.16, { color: C.ink, segments: 16 }),
    cylinder(`${name}.lower-plinth`, x, z, 0.98, 0.22, { y: 0.16, color: C.metalDark, segments: 16 }),
    cylinder(`${name}.chamber`, x, z, 0.84, 0.78, { y: 0.38, color: C.metalLight, segments: 16 }),
    cylinder(`${name}.lower-band`, x, z, 0.88, 0.1, { y: 0.48, color: C.metalDark, segments: 16 }),
    cylinder(`${name}.middle-band`, x, z, 0.87, 0.08, { y: 0.72, color: C.navyLight, segments: 16 }),
    cylinder(`${name}.upper-band`, x, z, 0.88, 0.09, { y: 0.98, color: C.metalDark, segments: 16 }),
    cylinder(`${name}.top-rim`, x, z, 1.02, 0.15, { y: 1.16, color: C.metalLight, segments: 16 }),
    cylinder(`${name}.top-slope`, x, z, 0.78, 0.18, {
      y: 1.31, radiusTop: 0.62, radiusBottom: 0.84, color: C.white, segments: 16,
    }),
    cylinder(`${name}.red-cap`, x, z, 0.58, 0.13, {
      y: 1.49, radiusTop: 0.48, radiusBottom: 0.62, color: C.red, segments: 16,
    }),
    cylinder(`${name}.cap-highlight`, x - 0.13, z + 0.03, 0.18, 0.035, {
      y: 1.62, color: C.redLight, segments: 12,
    }),
  ];

  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI * 2 / 8;
    const radius = 0.82;
    pieces.push(box(`${name}.rib-${index}`,
      x + Math.cos(angle) * radius - 0.045,
      z + Math.sin(angle) * radius - 0.07,
      0.09, 0.14, 0.78 - SURFACE_GAP * 2,
      { y: 0.38 + SURFACE_GAP, color: C.metalDark, rotationY: -angle },
    ));
  }

  pieces.push(
    box(`${name}.console-body`, x - 0.42, z + 0.78, 0.84, 0.34, 0.32, {
      y: 0.28, color: C.metalDark, rotationX: -0.22,
    }),
    box(`${name}.console-screen`, x - 0.25, z + 1.105, 0.5, 0.025, 0.14, {
      y: 0.43, color: C.screen,
    }),
    box(`${name}.console-key-red`, x - 0.28, z + 1.135, 0.11, 0.025, 0.055, {
      y: 0.33, color: C.red,
    }),
    box(`${name}.console-key-green`, x - 0.11, z + 1.135, 0.11, 0.025, 0.055, {
      y: 0.33, color: C.green,
    }),
    box(`${name}.console-key-blue`, x + 0.06, z + 1.135, 0.11, 0.025, 0.055, {
      y: 0.33, color: C.blue,
    }),
    box(`${name}.indicator-left`, x - 0.83, z + 0.43, 0.12, 0.08, 0.09, { y: 0.18, color: C.red }),
    box(`${name}.indicator-right`, x + 0.71, z + 0.43, 0.12, 0.08, 0.09, { y: 0.18, color: C.red }),
  );
  return pieces;
}

function wallNotes(): InteriorFurniture[] {
  const pieces: InteriorFurniture[] = [];
  const notes = [
    [6.92, 2.13, 0.27, 0.38], [7.34, 2.2, 0.2, 0.32],
    [8.02, 2.12, 0.3, 0.4], [8.48, 2.19, 0.2, 0.32],
  ] as const;
  notes.forEach(([x, y, w, h], index) => {
    pieces.push(
      box(`lab.wall-note.${index}.paper`, x, 3.005, w, 0.025, h, { y, color: C.white }),
      box(`lab.wall-note.${index}.mark-top`, x + 0.06, 3.034, w - 0.12, 0.012, 0.045, {
        y: y + h - 0.12, color: C.screenLight,
      }),
      box(`lab.wall-note.${index}.mark-bottom`, x + 0.06, 3.034, w * 0.45, 0.012, 0.04, {
        y: y + 0.1, color: C.metal,
      }),
    );
  });
  return pieces;
}

const FURNITURE: InteriorFurniture[] = [
  ...wallNotes(),
  ...bookshelf('north-west', 0.08, 3.05),
  ...plant('north', 2.5, 3.42),
  ...workTable('north-computer', 3.05, 3.08, 1.82),
  ...monitor('north-computer', 3.48, 3.13, 0.82, 1.05),
  ...keyboard('north-computer', 3.56, 3.53, 0.83),
  box('lab.computer.north-computer.tower', 3.12, 3.17, 0.28, 0.38, 0.62, { y: 0.04, color: C.metalLight }),
  ...workTable('north-research-a', 6.05, 3.08, 1.82),
  ...workTable('north-research-b', 8.08, 3.08, 1.82),
  ...book('paper-stack', 6.32, 3.25, 0.83, C.paper, -0.08),
  ...book('red-reference-a', 7.18, 3.23, 0.83, C.red, 0.05),
  ...book('red-reference-b', 8.13, 3.23, 0.83, C.red, -0.12),
  ...monitor('north-terminal', 9.03, 3.13, 0.82, 0.72),
  ...keyboard('north-terminal', 9.06, 3.54, 0.83, 0.58),
  ...chair('north-green', 4.12, 3.95, C.green, 'north'),
  ...chair('north-blue-a', 11.08, 3.12, C.blue, 'west'),
  ...chair('north-blue-b', 12.08, 3.12, C.blue, 'west'),
  ...chair('east-blue', 12.08, 4.08, C.blue, 'west'),
  ...storageCabinet('west-upper', 0.08, 4.02),
  ...storageCabinet('north-east-a', 9.08, 4.02),
  ...storageCabinet('north-east-b', 10.0, 4.02),
  ...storageCabinet('west-bench-a', 0.08, 5.18, 2),
  ...storageCabinet('west-bench-b', 2.08, 5.18, 2),
  ...bookshelf('west-a', 0.08, 6.12),
  ...bookshelf('west-b', 2.08, 6.12),
  ...researchMachine(10.92, 7.1),
  ...metalRack('east', 12.08, 7.02),
  ...workstation('south-west', 0.72, 9.55, 1.25),
  ...chair('west-wall-a', 0.06, 10.08, C.blue, 'east'),
  ...chair('west-wall-b', 0.06, 11.06, C.blue, 'east'),
  ...chair('south-west', 2.08, 10.18, C.green, 'west'),
  ...workstation('south-east', 10.95, 9.55, 1.25),
  ...chair('south-east', 10.08, 10.18, C.green, 'east'),
  ...plant('south-east', 12.42, 9.3),
  ...storageCabinet('south-east-a', 12.08, 10.82),
  ...storageCabinet('south-east-b', 12.08, 11.62),
  ...plant('entrance', 3.5, 12.18),
];

/** 防止后续剧情地图复制/重构时把逐零件模型静默退回成大盒贴图。 */
function validateDetailedLabModel(parts: InteriorFurniture[]): void {
  const names = new Set<string>();
  for (const part of parts) {
    if (!part.name) throw new Error('Lab 精细模型存在无名零件');
    if (names.has(part.name)) throw new Error(`Lab 精细模型零件重名：${part.name}`);
    if (part.kind === 'sprite') throw new Error(`Lab 仍含平面替身：${part.name}`);
    names.add(part.name);
  }
  const requiredObjects = [
    'lab.bookshelf.north-west.', 'lab.bookshelf.west-a.', 'lab.bookshelf.west-b.',
    'lab.computer.north-computer.', 'lab.computer.north-terminal.',
    'lab.computer.workstation-south-west.', 'lab.computer.workstation-south-east.',
    'lab.plant.north.', 'lab.plant.south-east.', 'lab.plant.entrance.',
    'lab.machine.central.', 'lab.rack.east.',
    'lab.chair.west-wall-a.', 'lab.chair.west-wall-b.',
  ];
  for (const prefix of requiredObjects) {
    if (![...names].some((name) => name.startsWith(prefix))) {
      throw new Error(`Lab 缺少完整物件：${prefix}`);
    }
  }
  if (parts.length < 400) {
    throw new Error(`Lab 精细模型零件数异常：${parts.length}`);
  }
}

validateDetailedLabModel(FURNITURE);

const EXIT_TO_TOWN: Omit<MapWarp, 'x' | 'y'> = {
  dest: 'littleroot',
  destX: 7,
  destY: 57,
  destFacing: 'down',
};

export const BIRCH_LAB: MapData = {
  id: 'birch-lab',
  width: 13,
  height: 13,
  groundTexture: `${BASE}/floor.png`,
  collision: COLLISION,
  props: [],
  npcs: [{
    id: 'lab-aide',
    name: '研究员',
    texture: 'assets/sprites/npcs/scientist-1.png',
    dialogue: [
      '小田卷博士正在研究宝可梦的栖息地和分布。',
      '比起坐在桌前读资料，博士更喜欢亲自去野外观察。',
    ],
    x: 9,
    y: 8,
    facing: 'down',
    wander: {
      bounds: [8, 7, 10, 9],
      maxWalkSteps: 2,
      pauseSeconds: [1.2, 2.8],
    },
  }],
  spawn: { x: 6, y: 12, facing: 'up' },
  cameraDistance: 11,
  background: 0x17191a,
  interior: {
    floor: { x: 0, y: 2, width: 13, height: 11 },
    wall: WALL,
    furniture: FURNITURE,
  },
  warps: [
    { x: 6, y: 12, ...EXIT_TO_TOWN },
    { x: 7, y: 12, ...EXIT_TO_TOWN },
  ],
};
