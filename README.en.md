# Meowa Games

[简体中文](./README.md) | **English**

**Meowa Games is an open-source collection of games made with Meowa.**

We share game source code, assets, and development workflows so everyone can play, learn, and exchange ideas, while exploring what is possible when creating games with Meowa.

## Games

| Game | Description | Technology |
| --- | --- | --- |
| [HD2D Pokémon Three.js](./HD2D-pokemon-threejs/) | A browser-based HD2D game set in Pokémon's Littleroot Town and Route 101, combining pixel art, 3D scenes, a day–night cycle, and tilt-shift depth of field. | Three.js, TypeScript, Vite, Meowa |

More games made with Meowa will be added to this collection.

## Pokémon Littleroot Town HD2D Game Prototype

Explore Littleroot Town and Route 101, talk to NPCs to progress the story, and venture into tall grass for turn-based battles, using moves, items, and Poké Balls to recruit new companions. Pixel characters in a 3D world, a day–night cycle, tilt-shift depth of field, and dynamic lighting give the adventure a miniature-world feel.

## Gameplay screenshots

**Captured:** 2026-09-08 (Asia/Shanghai)

**Playable project:** [HD2D Pokémon Three.js](./HD2D-pokemon-threejs/)

All five images below were captured in a browser on September 8, 2026. Each is a 1440 × 810 PNG under 1.3 MB (well below 4 MB), served through a public HTTPS original-image URL with no login required; the Markdown can be reused in a submission.

**Littleroot Town — Day**

![Littleroot Town by day — 2026-09-08](https://raw.githubusercontent.com/Meowa-AI/meowa-games/main/docs/screenshots/hd2d-pokemon-threejs/2026-09-08/littleroot-day.png)

| Littleroot Town — Night | Route 101 exploration |
| :---: | :---: |
| ![Littleroot Town at night — 2026-09-08](https://raw.githubusercontent.com/Meowa-AI/meowa-games/main/docs/screenshots/hd2d-pokemon-threejs/2026-09-08/littleroot-night.png) | ![Route 101 — 2026-09-08](https://raw.githubusercontent.com/Meowa-AI/meowa-games/main/docs/screenshots/hd2d-pokemon-threejs/2026-09-08/route101.png) |
| **Professor Birch's Lab** | **Wild Pokémon Battle** |
| ![Professor Birch's Lab — 2026-09-08](https://raw.githubusercontent.com/Meowa-AI/meowa-games/main/docs/screenshots/hd2d-pokemon-threejs/2026-09-08/laboratory.png) | ![Treecko battles Zigzagoon — 2026-09-08](https://raw.githubusercontent.com/Meowa-AI/meowa-games/main/docs/screenshots/hd2d-pokemon-threejs/2026-09-08/wild-battle.png) |

## How Meowa and GPT-6 Astra were used

- **Meowa**: Used to generate and refine pixel-art assets such as characters, buildings, vegetation, and ground textures, which were cropped, packed, and processed for use in the Three.js game.
- **GPT-6 Astra**: Used as a programming collaborator to clarify gameplay and implementation plans, inspect code, validate builds and browser behavior, and prepare repository documentation and gameplay screenshots.

## Run HD2D Pokémon Three.js

1. Clone the repository:

   ```bash
   git clone https://github.com/Meowa-AI/meowa-games.git
   cd meowa-games/HD2D-pokemon-threejs
   ```

2. Install dependencies and start the development server:

   ```bash
   npm install
   npm run dev
   ```

3. Open the local address shown in your terminal. Move with **WASD** or the **arrow keys**, hold **Shift** to run, and drag the mouse to adjust the view.

For more controls and asset details, see the [game README](./HD2D-pokemon-threejs/README.md) (in Chinese).

## Repository structure

- `HD2D-pokemon-threejs/src/`: Gameplay logic, maps, characters, camera, and visual effects.
- `HD2D-pokemon-threejs/public/assets/`: Runtime assets loaded by the browser.
- `HD2D-pokemon-threejs/assets/runtime-source/`: Source files used by the asset preparation scripts.
- `HD2D-pokemon-threejs/scripts/`: Asset generation and preparation tools.
- `HD2D-pokemon-threejs/Docs/`: Project documentation.
- `HD2D-pokemon-threejs/e2e/`: Browser-based tests.

Share feedback and improvements through Issues and Pull Requests, and explore game creation with Meowa together.
