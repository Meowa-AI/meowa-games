# HD-2D 未白镇与 101 号道路（宝可梦绿宝石）

用 Three.js 构建《宝可梦绿宝石》初始小镇未白镇（Littleroot Town）及其北侧 101 号道路，
《八方旅人》式 HD-2D 质感：像素精灵立在 3D 场景中 + 移轴景深 + 泛光 + 实时光影。

**本项目仅供个人学习使用，与 Nintendo、Game Freak 或 Creatures 无官方关联。图片已全部完成 Meowa 替换，来源与验收见 `assets/provenance/`，音频仍保留原版来源。**

## 运行

```bash
npm install
npm run dev
```

- 方向键 / WASD 移动（可组合斜向移动；轻点转向、按住行走；方向跟随相机），按住 Shift 跑步
- 鼠标左键拖拽：水平环绕 + 俯仰调整；滚轮：缩放距离
- `N` 快进昼夜时段（正午 → 黄昏 → 午夜 → 黎明；默认 2 分钟一整轮自动循环）
- `B` 正午↔午夜快速往返（调试昼夜过渡用）
- `P` 切换后期处理前后对比
- `F9` 切换 debug 模式：显示/隐藏左上角时间 HUD + lil-gui 调参面板
- `F8` 或 F9 面板的“播放宣传片”：低平视角一镜到底展示白天→黑夜，随后聚焦草丛中的玩家并进入木守宫对战蛇纹熊的树林战斗；战斗 UI 会演出红血、黄血、低血量警报以及慢节奏三次晃球捕获，最终淡入黑场；再按 `F8` 或 `Esc` 可提前退出
- URL 加 `?debug`：自由相机（OrbitControls），并默认开启 debug UI

## 精灵与素材

仅保留木守宫、火稚鸡、水跃鱼、蛇纹熊、土狼犬和刺尾虫。御三家选择保持三选一；101 号道路只出现后三种常见精灵，保留原遭遇频率。宣传演出使用木守宫和蛇纹熊。

当前共有 214 张 Meowa 图片（95 张已有素材、119 张本次替换或补充素材）、38 个原音频和 1 份动画配置，待替换图片为 0。替换保留原素材的尺寸、布局、动画帧数和播放速度，并逐帧对比外观；少量像素与明暗细节仍有差异。

旧存档首次迁移时会在浏览器的 `hd2d-pokemon-opening-v1-before-six-species` 保存原始副本，随后移除名单外精灵，保留剧情、物品、现有伙伴及昵称。若旧队伍全部被移除，优先补入仓库中的保留伙伴；没有可补入的伙伴时提供一只 5 级木守宫。

- `assets/runtime-source/`：游戏使用的最终素材源文件。
- `assets/runtime-manifest.json`：发布白名单；不会重新提取或恢复已经删除的素材。
- `public/assets/`：浏览器加载的成品，与最终源文件逐字节一致。
- `assets/provenance/`：素材来源、Meowa 任务编号和验收记录。
- 选择御三家和战斗头像共用一张 3×2 正面图集，不再保存三张重复小图。
- 六种精灵的背面显示共用各自的待机动画图集；动画清单请求失败时使用随游戏打包的定义，不再保留重复的静态背面图集。

```bash
python3 scripts/prepare_assets.py          # 发布白名单内的最终素材
python3 scripts/prepare_assets.py --check  # 检查缺失、差异和多余文件
node scripts/audit_runtime_assets.mjs     # 检查实际代码、地图与动画清单的引用
python3 scripts/audit_asset_provenance.py # 检查图片来源、Meowa 任务记录及原音频哈希
npm test
npm run build
PLAYWRIGHT_PORT=5176 npx playwright test  # 使用独立端口验收完整流程
```

原始参考、废弃生成结果和未使用的素材已从项目目录移出，保存在项目外的本地备份中。音频仍使用 6 个叫声、25 个音效和 7 个音乐文件；音频按用户要求保持原样，不纳入 Meowa 替换范围。

## 结构

- `src/config.ts` — 所有可调参数（手感、相机、光照、后期）
- `src/map/littleroot.ts` — 手写地图数据（树/建筑坐标、碰撞网格、出生点）
- `src/map/BuildingBuilder.ts` — 3D 建筑建模（sprite 分层拆解：墙体盒 + 三角山墙屋顶 +
  二层窗带；研究所单层大坡顶 + 3D 圆盘天线；贴图来自 Meowa 编辑后的原创三视图）
- `src/map/` — 地面、props、碰撞
- `src/player/` — 网格移动状态机、行走图 UV 动画
- `src/camera/CameraRig.ts` — HD-2D 机位跟随
- `src/fx/` — 光照阴影、后期栈（DoF/Bloom/ACES/暗角）、树木风摆

后续扩展预留：NPC（`SpriteAnimator` 通用、`CollisionMap.addBlocker` 动态阻挡）、
Tiled 地图（替换 `littleroot.ts` 为 .tmj 解析器，接口见 `MapData.ts`）。
