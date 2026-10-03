/**
 * DOM scaffolding for the level editor: toolbar, outliner (with the piece
 * palette), inspector + links panel, status bar and the box-select
 * rectangle. Behaviour is wired up by LevelEditor.
 */
const CSS = `
#editor { position: fixed; inset: 0; pointer-events: none; z-index: 40; font: 12px/1.35 system-ui, sans-serif; color: #dde3ea; }
#editor .ed-panel { position: absolute; pointer-events: auto; background: rgba(18,20,26,0.92); border: 1px solid #3a4250; box-sizing: border-box; }
#editor .ed-toolbar { top: 0; left: 0; right: 0; height: 38px; display: flex; align-items: center; gap: 4px; padding: 0 8px; border-width: 0 0 1px 0; overflow-x: auto; overflow-y: hidden; }
#editor .ed-toolbar select { max-width: 200px; }
#editor .ed-toolbar .ed-sep { width: 1px; height: 22px; background: #3a4250; margin: 0 4px; }
#editor .ed-toolbar .ed-title { font-weight: 600; letter-spacing: 0.05em; margin-right: 6px; color: #e8c880; }
#editor button, #editor select { background: #262b35; color: #dde3ea; border: 1px solid #454e5e; border-radius: 3px; padding: 3px 7px; font: inherit; cursor: pointer; white-space: nowrap; }
#editor button:hover { border-color: #e8a040; }
#editor button.ed-on { background: #5a4220; border-color: #e8a040; color: #fff; }
#editor button:disabled { opacity: 0.4; cursor: default; }
#editor .ed-dirty { color: #ffb050; font-weight: 600; }
#editor .ed-left { top: 38px; left: 0; bottom: 26px; width: 230px; display: flex; flex-direction: column; border-width: 0 1px 0 0; }
#editor .ed-palette { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 6px; border-bottom: 1px solid #3a4250; }
#editor .ed-palette button { padding: 3px 2px; font-size: 11px; }
#editor .ed-outliner { overflow-y: auto; flex: 1; padding: 4px 0; }
#editor .ed-outliner .ed-grp { padding: 3px 8px; color: #e8c880; cursor: pointer; user-select: none; }
#editor .ed-outliner .ed-eye { float: right; padding: 0 5px; font-size: 10px; margin-left: 4px; }
#editor .ed-outliner .ed-row { padding: 2px 8px 2px 20px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#editor .ed-outliner .ed-row:hover { background: #2a303c; }
#editor .ed-outliner .ed-row.ed-sel { background: #5a4220; color: #fff; }
#editor .ed-outliner .ed-row .ed-t { color: #8a94a6; margin-left: 4px; }
#editor .ed-right { top: 38px; right: 0; bottom: 26px; width: 300px; overflow-y: auto; border-width: 0 0 0 1px; }
#editor .ed-right .lil-gui { --width: 100%; --background-color: transparent; --name-width: 38%; }
#editor .ed-right .lil-gui.root { width: 100% !important; }
#editor .ed-links { padding: 6px 8px; border-top: 1px solid #3a4250; }
#editor .ed-links h4 { margin: 4px 0 6px; color: #e8c880; font-weight: 600; }
#editor .ed-links .ed-lrow { display: flex; gap: 4px; align-items: center; padding: 2px 0; cursor: pointer; }
#editor .ed-links .ed-lrow:hover { background: #2a303c; }
#editor .ed-links .ed-lrow .ed-ok { color: #50e070; } #editor .ed-links .ed-lrow .ed-bad { color: #ff4050; } #editor .ed-links .ed-lrow .ed-sc { color: #40c8ff; }
#editor .ed-links .ed-lrow .ed-txt { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#editor .ed-links .ed-lrow button { padding: 0 5px; }
#editor .ed-links .ed-add { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
#editor .ed-status { left: 0; right: 0; bottom: 0; height: 26px; display: flex; align-items: center; gap: 14px; padding: 0 10px; border-width: 1px 0 0 0; color: #a8b2c2; }
#editor .ed-status .ed-msg { color: #e8c880; margin-left: auto; }
#editor .ed-marquee { position: absolute; border: 1px dashed #e8a040; background: rgba(232,160,64,0.08); display: none; pointer-events: none; }
#editor .ed-help { position: absolute; left: 240px; right: 310px; bottom: 32px; color: #8a94a6; pointer-events: none; text-shadow: 1px 1px 0 #000; }
`;

export interface EditorDom {
  root: HTMLDivElement;
  toolbar: HTMLDivElement;
  palette: HTMLDivElement;
  outliner: HTMLDivElement;
  inspector: HTMLDivElement;
  links: HTMLDivElement;
  status: HTMLDivElement;
  marquee: HTMLDivElement;
}

export function createEditorDom(): EditorDom {
  if (!document.getElementById('ashen-editor-css')) {
    const style = document.createElement('style');
    style.id = 'ashen-editor-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = document.createElement('div');
  root.id = 'editor';
  root.innerHTML = `
    <div class="ed-panel ed-toolbar"></div>
    <div class="ed-panel ed-left"><div class="ed-palette"></div><div class="ed-outliner"></div></div>
    <div class="ed-panel ed-right"><div class="ed-inspector"></div><div class="ed-links"></div></div>
    <div class="ed-panel ed-status"></div>
    <div class="ed-marquee"></div>
    <div class="ed-help">RMB + mouse: look · WASD fly · Q/E or C/Space down/up · Shift fast · wheel: speed · LMB select / drag box · 1 move · 2 rotate · 3 scale · F focus · F5 play · Shift+F5 play from camera · F2 exit</div>`;
  document.body.appendChild(root);
  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  return {
    root,
    toolbar: q('.ed-toolbar'),
    palette: q('.ed-palette'),
    outliner: q('.ed-outliner'),
    inspector: q('.ed-inspector'),
    links: q('.ed-links'),
    status: q('.ed-status'),
    marquee: q('.ed-marquee'),
  };
}

export function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
    b.blur();
  });
  return b;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
