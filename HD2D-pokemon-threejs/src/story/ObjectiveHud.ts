import type { StoryPhase } from './GameSession';

const OBJECTIVES: Record<StoryPhase, string> = {
  intro_mom: '听妈妈介绍新家', set_clock: '去二楼调查墙上的时钟',
  watch_tv: '回到一楼和妈妈一起看电视', visit_rival: '去镇东侧拜访新邻居',
  go_route101: '从未白镇北口前往 101 号道路',
  rescue_birch: '沿道路向北，调查博士右下方的背包',
  choose_starter: '从背包中选择一只宝可梦', first_battle: '帮助博士击退野生宝可梦',
  starter_received: '听小田卷博士说明', free_roam: '和宝可梦一起开始冒险',
};

export class ObjectiveHud {
  private readonly root = document.createElement('aside');

  constructor() {
    this.root.className = 'story-objective';
    this.root.hidden = true;
    ObjectiveHud.installStyles();
    document.body.appendChild(this.root);
  }

  set(phase: StoryPhase): void {
    this.root.textContent = `目标　${OBJECTIVES[phase]}`;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  private static installStyles(): void {
    if (document.querySelector('#story-objective-styles')) return;
    const style = document.createElement('style');
    style.id = 'story-objective-styles';
    style.textContent = `.story-objective[hidden]{display:none}.story-objective{position:fixed;z-index:12;left:20px;top:20px;max-width:min(470px,78vw);padding:10px 16px;border-left:5px solid #f0b84a;background:#173c49dc;color:#fff8df;box-shadow:4px 5px #0004;font:700 16px/1.5 "Noto Sans SC","Microsoft YaHei",sans-serif;pointer-events:none}`;
    document.head.appendChild(style);
  }
}
