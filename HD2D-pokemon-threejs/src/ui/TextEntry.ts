export class TextEntry {
  static ask(title: string, initialValue: string, maxLength = 10): Promise<string | undefined> {
    return new Promise((resolve) => {
      const root = document.createElement('div');
      root.className = 'text-entry-overlay';
      root.innerHTML = `<form class="text-entry-panel"><label></label><input type="text"><div>
        <button type="submit">确定</button><button type="button" data-cancel>取消</button></div></form>`;
      const form = root.querySelector('form')!;
      const input = root.querySelector('input')!;
      root.querySelector('label')!.textContent = title;
      input.value = initialValue;
      input.maxLength = maxLength;
      const finish = (value?: string) => { root.remove(); resolve(value); };
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (value) finish(value);
      });
      root.querySelector('[data-cancel]')!.addEventListener('click', () => finish());
      TextEntry.installStyles();
      document.body.appendChild(root);
      input.select();
      input.focus();
    });
  }

  private static installStyles(): void {
    if (document.querySelector('#text-entry-styles')) return;
    const style = document.createElement('style');
    style.id = 'text-entry-styles';
    style.textContent = `
      .text-entry-overlay{position:fixed;inset:0;z-index:70;display:grid;place-items:center;background:#07141a99;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif}
      .text-entry-panel{width:min(520px,85vw);padding:28px;border:6px solid #2f5f72;outline:5px solid #84d7bd;background:#fffbea;box-shadow:0 20px 60px #0008}
      .text-entry-panel label{display:block;margin-bottom:16px;font-size:26px;font-weight:800;color:#26343b}
      .text-entry-panel input{box-sizing:border-box;width:100%;padding:12px;border:4px solid #73968b;background:white;font:700 26px inherit;color:#26343b}
      .text-entry-panel div{display:flex;justify-content:flex-end;gap:12px;margin-top:18px}.text-entry-panel button{padding:8px 24px;font:700 18px inherit}
    `;
    document.head.appendChild(style);
  }
}
