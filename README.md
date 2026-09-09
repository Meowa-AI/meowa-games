# Meowa Games

**简体中文** | [English](./README.en.md)

**Meowa Games 是一个开源游戏合集，里面的游戏都是使用 Meowa 制作的。**

这里分享游戏项目的源码、素材和制作过程，方便大家体验、学习和交流，也展示使用 Meowa 创作游戏的不同可能。

## 游戏列表

| 游戏 | 简介 | 技术 |
| --- | --- | --- |
| [HD2D Pokémon Three.js](./HD2D-pokemon-threejs/) | 以宝可梦未白镇和 101 号道路为主题的网页版 HD2D 游戏，结合像素素材、3D 场景、昼夜光影与移轴景深。 | Three.js、TypeScript、Vite、Meowa |

后续使用 Meowa 制作的游戏也会陆续加入这个合集。

## 宝可梦未白镇HD2D游戏原型

在未白镇与 101 号道路自由探索、和 NPC 交谈推进故事，获得伙伴后进入草丛触发回合制战斗，使用招式、道具和精灵球结识新伙伴。像素角色与 3D 场景结合，配合昼夜循环、移轴景深和动态光影，让熟悉的小镇呈现微缩世界的质感。

## 实机截图

**拍摄日期：** 2026-09-08（Asia/Shanghai）

**当前可玩项目：** [HD2D Pokémon Three.js](./HD2D-pokemon-threejs/)

以下 5 张均为 2026-09-08 在浏览器中拍摄的真实运行截图，统一为 1440 × 810 PNG，单张小于 1.3 MB（均低于 4 MB）。图片使用公开、免登录的 HTTPS 原图链接，可直接复制 Markdown 用于作品提交。

**未白镇 · 白天**

![未白镇白天 — 2026-09-08](https://raw.githubusercontent.com/Meowa-AI/meowa-games/main/docs/screenshots/hd2d-pokemon-threejs/2026-09-08/littleroot-day.png)

| 未白镇 · 夜晚 | 101 号道路探索 |
| :---: | :---: |
| ![未白镇夜景 — 2026-09-08](https://raw.githubusercontent.com/Meowa-AI/meowa-games/main/docs/screenshots/hd2d-pokemon-threejs/2026-09-08/littleroot-night.png) | ![101 号道路 — 2026-09-08](https://raw.githubusercontent.com/Meowa-AI/meowa-games/main/docs/screenshots/hd2d-pokemon-threejs/2026-09-08/route101.png) |
| **博士研究所** | **草丛遭遇战** |
| ![小田卷博士研究所 — 2026-09-08](https://raw.githubusercontent.com/Meowa-AI/meowa-games/main/docs/screenshots/hd2d-pokemon-threejs/2026-09-08/laboratory.png) | ![木守宫与蛇纹熊对战 — 2026-09-08](https://raw.githubusercontent.com/Meowa-AI/meowa-games/main/docs/screenshots/hd2d-pokemon-threejs/2026-09-08/wild-battle.png) |

## Meowa & GPT-6 Astra 参与了什么

- **Meowa**：用于生成和迭代角色、建筑、植被与地面纹理等像素美术素材；最终素材经过裁切、图集整理和预处理，接入 Three.js 游戏场景。
- **GPT-6 Astra**：作为编程协作者，参与玩法与实现方案梳理、代码检查、构建和浏览器运行验证，并整理开源仓库文档与实机截图。

## 运行 HD2D Pokémon Three.js

1. 克隆仓库：

   ```bash
   git clone https://github.com/Meowa-AI/meowa-games.git
   cd meowa-games/HD2D-pokemon-threejs
   ```

2. 安装依赖并启动开发服务器：

   ```bash
   npm install
   npm run dev
   ```

3. 在浏览器中打开终端显示的本地地址。使用 **WASD** 或 **方向键** 移动，按住 **Shift** 跑步，拖拽鼠标调整视角。

更多操作和素材说明见[游戏 README](./HD2D-pokemon-threejs/README.md)。

## 目录说明

- `HD2D-pokemon-threejs/src/`：游戏逻辑、地图、角色、相机与画面效果。
- `HD2D-pokemon-threejs/public/assets/`：浏览器运行时加载的素材。
- `HD2D-pokemon-threejs/assets/runtime-source/`：素材处理脚本使用的源文件。
- `HD2D-pokemon-threejs/scripts/`：素材生成与预处理工具。
- `HD2D-pokemon-threejs/Docs/`：项目文档。
- `HD2D-pokemon-threejs/e2e/`：浏览器端测试。

欢迎通过 Issues 和 Pull Requests 分享反馈、改进游戏，一起探索用 Meowa 做游戏。
