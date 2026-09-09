import { gameAudio, SFX } from '../audio/Bgm';

export interface ChoiceOption<T extends string> {
  label: string;
  value: T;
  description?: string;
  disabled?: boolean;
  image?: string;
  imageAtlas?: { columns: number; rows: number; index: number };
}

export class ChoiceMenu {
  static choose<T extends string>(
    title: string,
    options: ChoiceOption<T>[],
    cancelValue?: T,
  ): Promise<T> {
    gameAudio.playSfx(SFX.menuOpen, 0.52);
    return new Promise((resolve) => {
      let index = Math.max(0, options.findIndex((option) => !option.disabled));
      const root = document.createElement('div');
      root.className = 'choice-overlay';
      root.innerHTML = `<section class="choice-panel" role="dialog" aria-modal="true">
        <h2></h2><div class="choice-list"></div><p class="choice-help"></p></section>`;
      root.querySelector('h2')!.textContent = title;
      const list = root.querySelector('.choice-list')!;
      const help = root.querySelector('.choice-help')!;

      const buttons = options.map((option, optionIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.disabled = option.disabled ?? false;
        if (option.image && option.imageAtlas) {
          const image = document.createElement('span');
          const { columns, rows, index: spriteIndex } = option.imageAtlas;
          image.className = 'choice-image';
          image.setAttribute('aria-hidden', 'true');
          image.style.backgroundImage = `url(${option.image})`;
          image.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
          image.style.backgroundPosition = `${spriteIndex % columns / Math.max(1, columns - 1) * 100}% ${Math.floor(spriteIndex / columns) / Math.max(1, rows - 1) * 100}%`;
          button.append(image);
        } else if (option.image) {
          const image = document.createElement('img');
          image.src = option.image;
          image.alt = '';
          button.append(image);
        }
        const label = document.createElement('span');
        label.textContent = option.label;
        button.append(label);
        button.addEventListener('click', () => finish(option.value));
        button.addEventListener('mouseenter', () => {
          if (option.disabled) return;
          if (index !== optionIndex) gameAudio.playSfx(SFX.uiHover, 0.42);
          index = optionIndex;
          render();
        });
        list.appendChild(button);
        return button;
      });

      const render = () => {
        buttons.forEach((button, buttonIndex) => button.classList.toggle('selected', buttonIndex === index));
        help.textContent = options[index]?.description ?? '';
      };
      const move = (delta: number) => {
        for (let i = 0; i < options.length; i++) {
          index = (index + delta + options.length) % options.length;
          if (!options[index].disabled) break;
        }
        gameAudio.playSfx(SFX.uiHover, 0.42);
        render();
      };
      const onKey = (event: KeyboardEvent) => {
        if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(event.code)) {
          event.preventDefault(); move(-1);
        } else if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(event.code)) {
          event.preventDefault(); move(1);
        } else if (['Space', 'Enter'].includes(event.code)) {
          event.preventDefault();
          const option = options[index];
          if (option && !option.disabled) finish(option.value);
        } else if (['Escape', 'KeyX'].includes(event.code) && cancelValue !== undefined) {
          event.preventDefault(); finish(cancelValue);
        }
      };
      const finish = (value: T) => {
        gameAudio.playSfx(value === cancelValue ? SFX.menuClose : SFX.uiSelect, 0.58);
        window.removeEventListener('keydown', onKey, true);
        root.remove();
        resolve(value);
      };

      ChoiceMenu.installStyles();
      document.body.appendChild(root);
      window.addEventListener('keydown', onKey, true);
      render();
      buttons[index]?.focus();
    });
  }

  private static installStyles(): void {
    if (document.querySelector('#choice-menu-styles')) return;
    const style = document.createElement('style');
    style.id = 'choice-menu-styles';
    style.textContent = `
      .choice-overlay{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(10,20,25,.48)}
      .choice-panel{width:min(760px,88vw);padding:26px;border:6px solid #2f5f72;outline:5px solid #84d7bd;background:#f8f6e8;color:#26343b;box-shadow:0 18px 55px #0008;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif}
      .choice-panel h2{margin:0 0 20px;font-size:clamp(24px,4vw,38px)}
      .choice-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
      .choice-list button{min-height:72px;border:4px solid #9cb4a8;background:#fffdf4;color:#26343b;font:700 22px inherit;cursor:pointer;display:grid;place-items:center;gap:4px}
      .choice-list button img,.choice-image{width:96px;height:96px;object-fit:contain;image-rendering:pixelated}
      .choice-list button.selected,.choice-list button:focus-visible{border-color:#e96d45;outline:3px solid #ffd17a;transform:translateY(-3px)}
      .choice-list button:disabled{filter:grayscale(1);opacity:.45;cursor:not-allowed}
      .choice-help{min-height:1.6em;margin:18px 0 0;color:#53636b;font-size:17px}
    `;
    document.head.appendChild(style);
  }
}
