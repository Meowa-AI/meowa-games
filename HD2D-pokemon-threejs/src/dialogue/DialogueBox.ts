const CHARACTERS_PER_SECOND = 30;

/**
 * pokeemerald 风格的野外对话框：底部双行窗口、逐字显示、下箭头翻页。
 */
export class DialogueBox {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLParagraphElement;
  private readonly arrow: HTMLSpanElement;
  private pages: string[] = [];
  private pageIndex = 0;
  private visibleCharacters = 0;
  private onClose?: () => void;
  private resolveClose?: () => void;

  constructor() {
    DialogueBox.installStyles();
    this.root = document.createElement('div');
    this.root.className = 'emerald-dialogue';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', '人物对话');
    this.root.innerHTML = `
      <div class="emerald-dialogue__frame">
        <div class="emerald-dialogue__panel">
          <p class="emerald-dialogue__text" aria-live="polite"></p>
          <span class="emerald-dialogue__arrow" aria-hidden="true"></span>
        </div>
      </div>`;
    this.text = this.root.querySelector('.emerald-dialogue__text')!;
    this.arrow = this.root.querySelector('.emerald-dialogue__arrow')!;
    document.body.appendChild(this.root);
  }

  get active(): boolean {
    return this.pages.length > 0;
  }

  show(speaker: string, pages: string[], onClose: () => void): void {
    if (pages.length === 0) return;
    this.pages = pages;
    this.pageIndex = 0;
    this.visibleCharacters = 0;
    this.onClose = onClose;
    this.root.setAttribute('aria-label', `${speaker}的对话`);
    this.root.classList.add('emerald-dialogue--visible');
    this.render();
  }

  showAsync(speaker: string, pages: string[]): Promise<void> {
    return new Promise((resolve) => {
      this.resolveClose = resolve;
      this.show(speaker, pages, () => {});
    });
  }

  update(dt: number): void {
    if (!this.active || this.isPageComplete()) return;
    this.visibleCharacters = Math.min(
      this.currentCharacters().length,
      this.visibleCharacters + dt * CHARACTERS_PER_SECOND,
    );
    this.render();
  }

  /** 打印中补全当前页；页末则翻页，最后一页关闭。 */
  advance(): void {
    if (!this.active) return;
    if (!this.isPageComplete()) {
      this.visibleCharacters = this.currentCharacters().length;
      this.render();
      return;
    }
    if (this.pageIndex < this.pages.length - 1) {
      this.pageIndex++;
      this.visibleCharacters = 0;
      this.render();
      return;
    }
    this.close();
  }

  private close(): void {
    this.pages = [];
    this.root.classList.remove('emerald-dialogue--visible');
    this.text.textContent = '';
    const onClose = this.onClose;
    this.onClose = undefined;
    onClose?.();
    const resolveClose = this.resolveClose;
    this.resolveClose = undefined;
    resolveClose?.();
  }

  private currentCharacters(): string[] {
    return Array.from(this.pages[this.pageIndex] ?? '');
  }

  private isPageComplete(): boolean {
    return this.visibleCharacters >= this.currentCharacters().length;
  }

  private render(): void {
    this.text.textContent = this.currentCharacters()
      .slice(0, Math.floor(this.visibleCharacters))
      .join('');
    this.arrow.classList.toggle('emerald-dialogue__arrow--visible', this.isPageComplete());
  }

  private static installStyles(): void {
    if (document.querySelector('#emerald-dialogue-styles')) return;
    const style = document.createElement('style');
    style.id = 'emerald-dialogue-styles';
    style.textContent = `
      .emerald-dialogue {
        position: fixed;
        inset: 0;
        z-index: 15;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 0 5.5vw clamp(22px, 4.2vh, 48px);
        box-sizing: border-box;
        pointer-events: none;
        visibility: hidden;
        opacity: 0;
      }
      .emerald-dialogue--visible {
        visibility: visible;
        opacity: 1;
      }
      .emerald-dialogue__frame {
        width: min(100%, 960px);
        padding: 5px;
        background: #00c8b8;
        box-shadow:
          0 0 0 4px #70c8a0,
          0 0 0 8px #00f898,
          0 0 0 12px rgba(30, 55, 65, 0.78),
          0 10px 26px rgba(0, 0, 0, 0.34);
        clip-path: polygon(
          8px 0, calc(100% - 8px) 0, calc(100% - 8px) 4px,
          100% 4px, 100% calc(100% - 4px), calc(100% - 8px) calc(100% - 4px),
          calc(100% - 8px) 100%, 8px 100%, 8px calc(100% - 4px),
          0 calc(100% - 4px), 0 4px, 8px 4px
        );
      }
      .emerald-dialogue__panel {
        position: relative;
        min-height: clamp(88px, 13vh, 126px);
        padding: clamp(18px, 2.6vh, 26px) clamp(34px, 4vw, 54px);
        box-sizing: border-box;
        border: 4px solid #e0e8e0;
        background: #f8f8f8;
      }
      .emerald-dialogue__text {
        margin: 0;
        white-space: pre-wrap;
        color: #303838;
        font-family: "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
        font-size: clamp(21px, 2.25vw, 30px);
        font-weight: 700;
        line-height: 1.65;
        letter-spacing: 0.04em;
        text-shadow: 2px 2px 0 #d0d0c8;
      }
      .emerald-dialogue__arrow {
        position: absolute;
        right: clamp(18px, 2.3vw, 30px);
        bottom: 12px;
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-top: 11px solid #3050c8;
        opacity: 0;
      }
      .emerald-dialogue__arrow--visible {
        opacity: 1;
        animation: emerald-dialogue-bob 0.55s steps(2, end) infinite;
      }
      @keyframes emerald-dialogue-bob {
        50% { transform: translateY(4px); }
      }
      @media (max-width: 560px) {
        .emerald-dialogue { padding-inline: 22px; }
        .emerald-dialogue__panel { padding-inline: 24px; }
      }
    `;
    document.head.appendChild(style);
  }
}
