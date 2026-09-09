/**
 * 运行时调试模式：F9 切换。
 * 控制调试 UI（时间 HUD、lil-gui 调参面板）的显隐；
 * 默认关闭，必须按 F9 才会开启。
 */
type Listener = (on: boolean) => void;

class DebugModeImpl {
  enabled = false;
  private readonly listeners: Listener[] = [];

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F9') {
        e.preventDefault();
        this.set(!this.enabled);
      }
    });
  }

  set(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    for (const l of this.listeners) l(on);
  }

  /** 注册监听并立即以当前状态回调一次 */
  onChange(l: Listener): void {
    this.listeners.push(l);
    l(this.enabled);
  }
}

export const DebugMode = new DebugModeImpl();
