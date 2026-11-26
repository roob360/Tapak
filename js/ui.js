// Ikon, elemen, lembar/dialog bergerak, toast, dan roda pen.

const I = {
  back: 'M15 4l-8 8 8 8', close: 'M6 6l12 12M18 6L6 18', plus: 'M12 4v16M4 12h16', check: 'M4 13l5 5L20 6', down: 'M5 9l7 7 7-7', up: 'M5 15l7-7 7 7',
  undo: 'M8 5L3 10l5 5M3 10h12l4 4v2l-4 4H9', redo: 'M16 5l5 5-5 5M21 10H9l-4 4v2l4 4h6', more: 'M5 11h2v2H5zM11 11h2v2h-2zM17 11h2v2h-2z',
  view: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2M14 4h4v4h-4zM8 10h4v4H8zM14 16h4v4h-4z', share: 'M12 3v12M7 8l5-5 5 5M5 13v8h14v-8',
  gambar: 'M4 20l2-6L15 5h2l2 2v2l-9 9zM13 7l4 4', petakan: 'M3 5l6-2 6 2 6-2v9M3 5v14l6-2 4 1.5M9 3v14M15 5v7M18 21v-6h4l-1.5 2L22 19h-4', otomatis: 'M4 20L14 10l2 2L6 22zM16 2v4M14 4h4M20 9v3M19 10.5h3', progres: 'M3 16h8v5H3zM13 16h8v5h-8zM8 10h8v5H8zM8 4h8v5H8z',
  pulpen: 'M4 20l2-6L15 5h2l2 2v2l-9 9zM13 7l4 4', spidol: 'M8 13l7-9h2l3 3v2l-9 7zM8 13l3 3-2 3H5v-2zM4 22h12', pensil: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3M4 20l3-1', stabilo: 'M7 11l7-8 7 7-8 7zM7 11l-2 5 3 3 5-2M3 22h8',
  awan: 'M6 18a3 3 0 01-1-6 4 4 0 013-5 4 4 0 017 0 4 4 0 014 5 3 3 0 01-2 6z', catatan: 'M4 4h16v11l-5 5H4zM15 20v-5h5M8 9h8M8 12h5', stempel: 'M9 4h6l-1 8h4l2 3v2H4v-2l2-3h4zM4 21h16', panah: 'M4 20L19 5M10 5h9v9', hapus: 'M3 15L13 5l7 7-8 8H8zM8 10l7 7M12 20h9',
  titik: 'M9 5h6l4 4v6l-4 4H9l-4-4V9zM12 2v5M12 17v5M2 12h5M17 12h5', garis: 'M3 18h4v4H3zM17 2h4v4h-4zM7 18L17 6', lengkung: 'M2 18h4v4H2zM18 18h4v4h-4zM4 18c0-9 4-13 8-13s8 4 8 13', area: 'M3 7l9-4 9 6-4 12H6z', kotak: 'M4 6h16v12H4zM2 4h4v4H2zM18 16h4v4h-4z', bulat: 'M9 3h6l6 6v6l-6 6H9l-6-6V9zM12 12h7', bebas: 'M3 18c3-12 7-12 8-6s5 6 10-6M2 22h20',
  cari: 'M3 3h7v7H3zM14 14h7v7h-7zM14 3h7v7h-7M3 14h7v7', ruang: 'M3 3h18v18h-6M9 21H3V3M9 3v8H3M9 15h6v-4', nomor: 'M3 4h18v16H3zM8 9l2-1v8M14 9h3v3l-3 4h4', skala: 'M2 9h20v7H2zM6 9v3M10 9v4M14 9v3M18 9v4M2 4v3M22 4v3M2 5.5h20', sisi: 'M3 7h18M3 17h18M12 9v6M10 11l2-2 2 2M10 13l2 2 2-2',
  pilih: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M10 3h4M10 21h4M3 10v4M21 10v4', kuas: 'M4 4h10l2 2v6M4 4v16h7M13 18l3 3 6-7', elemen: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1', hingga: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 14h3v3H8z', rekap: 'M5 2h10l4 4v16H5zM8 11h8v7H8zM8 14.5h8M12 11v7',
  legenda: 'M3 4h18v16H3zM7 9h2M12 9h5M7 15h2M12 15h5',
  lurus: 'M3 7l17-3 1 13-17 3zM7 12h10M12 9v6',
  ubah: 'M3 3h6v6H3zM15 15h6v6h-6zM9 6h6v9M6 9v9h9',
  'panah-pilih': 'M6 3l13 10h-6l3 7-3 1-3-7-4 4z',
  silang: 'M12 2v20M2 12h20', lup: 'M10 4a6 6 0 100 12 6 6 0 000-12zM15 15l6 6M10 7v6M7 10h6', ortho: 'M5 3v16h16M5 13h6v6', polar: 'M4 20h17M4 20L16 5M13 20a9 9 0 00-3-7',
  mata: 'M2 12l5-6h10l5 6-5 6H7zM10 9h4l1 2v2l-1 2h-4l-1-2v-2z', trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6', salin: 'M9 8h11v13H9zM4 16V3h11v2', putar: 'M19 8l-3-3H8l-4 4v7l4 4h8l3-3M19 3v5h-5', foto: 'M3 7h4l2-3h6l2 3h4v13H3zM12 10a4 4 0 100 8 4 4 0 000-8z', berkas: 'M5 2h10l4 4v16H5zM15 2v4h4', panel: 'M3 4h18v16H3zM9 4v16M5 8h2M5 11h2', geser: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3',
};
export const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${I[n] ?? ''}"/></svg>`;
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EASE = 'cubic-bezier(.3,.9,.3,1)';
export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function move(el, frames, ms = 250, opt = {}) {
  return el.animate(frames, { duration: calm() ? 0 : ms, easing: EASE, fill: opt.fill ?? 'none', delay: calm() ? 0 : opt.delay ?? 0 });
}
export const finished = (a) => a.finished.catch(() => {});
export const stagger = (els, ms = 250, step = 22) => els.slice(0, 24).forEach((el, i) => move(el, [{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], ms, { delay: i * step, fill: 'backwards' }));

/* ---------- lembar dan dialog ---------- */
const stack = [];
/** kind: 'dialog' (tengah; lembar bawah di HP) atau 'panel' (kanan; lembar bawah di layar sempit). */
export function sheet({ title, sub = '', body = '', kind = 'dialog', wide = false, quiet = false, onClose }) {
  if (kind === 'panel') stack.filter((s) => s.kind === 'panel').forEach((s) => s.close());
  const el = document.createElement('section');
  el.className = `sheet ${kind}${wide ? ' wide' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', title);
  el.innerHTML = `<button class="grip" aria-label="Seret turun untuk menutup"></button><header><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div><button class="soft round" data-close aria-label="Tutup">${icon('close')}</button></header><div class="body">${body}</div>`;
  let scrim = null;
  if (kind === 'dialog') {
    scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.appendChild(scrim);
    move(scrim, [{ opacity: 0 }, { opacity: 1 }]);
  }
  document.body.appendChild(el);
  const bottom = matchMedia('(max-width: 800px)').matches;
  const away = bottom ? 'translateY(105%)' : kind === 'panel' ? 'translateX(110%)' : 'translateY(24px) scale(.96)';
  move(el, [{ transform: away, opacity: kind === 'dialog' && !bottom ? 0 : 1 }, { transform: 'none', opacity: 1 }], kind === 'panel' || bottom ? 340 : 250);
  let closed = false, gone = () => {};
  const api = {
    el, kind, quiet, body: $('.body', el),
    closed: new Promise((resolve) => { gone = resolve; }),
    close(value) {
      if (closed) return;
      closed = true;
      stack.splice(stack.indexOf(api), 1);
      if (scrim) finished(move(scrim, [{ opacity: 1 }, { opacity: 0 }], 170, { fill: 'forwards' })).then(() => scrim.remove());
      finished(move(el, [{ transform: el.style.transform || 'none', opacity: 1 }, { transform: away, opacity: 0 }], 170, { fill: 'forwards' })).then(() => el.remove());
      onClose?.(value);
      if (kind === 'panel') queueMicrotask(() => dispatchEvent(new Event('panelchange')));
      gone();
    },
    update(html) { api.body.innerHTML = html; },
  };
  stack.push(api);
  if (kind === 'panel') dispatchEvent(new Event('panelchange'));
  $('[data-close]', el).onclick = () => api.close();
  if (scrim) scrim.onclick = () => api.close();
  drag(el, api);
  stagger($$('.body > *', el));
  return api;
}
// seret gagang ke bawah untuk menutup, efek karet ke atas
function drag(el, api) {
  const grip = $('.grip', el);
  let y0 = null, dy = 0, t0 = 0;
  grip.onpointerdown = (e) => { y0 = e.clientY; t0 = performance.now(); dy = 0; grip.setPointerCapture(e.pointerId); };
  grip.onpointermove = (e) => { if (y0 === null) return; dy = e.clientY - y0; el.style.transform = `translateY(${dy > 0 ? dy : dy / 5}px)`; };
  grip.onpointerup = grip.onpointercancel = () => {
    if (y0 === null) return;
    y0 = null;
    if (dy > 110 || dy / (performance.now() - t0) > 0.6) return api.close();
    const from = el.style.transform;
    el.style.transform = '';
    move(el, [{ transform: from }, { transform: 'none' }]);
  };
}
export const closeTop = () => { stack.at(-1)?.close(); };
export const closeAll = () => [...stack].forEach((s) => s.close());
export const isOpen = () => stack.length > 0;
export const panelOpen = () => stack.some((s) => s.kind === 'panel' && !s.quiet);
export const dialogOpen = () => stack.some((s) => s.kind === 'dialog');

export const ask = (title, message, confirm = 'Ya', danger = false) => new Promise((resolve) => {
  const s = sheet({ title, body: `<p class="msg">${esc(message)}</p><div class="pair"><button class="soft" data-no>Batal</button><button class="${danger ? 'danger' : 'solid'}" data-yes>${esc(confirm)}</button></div>`, onClose: (v) => resolve(v === true) });
  $('[data-no]', s.el).onclick = () => s.close();
  $('[data-yes]', s.el).onclick = () => s.close(true);
  $('[data-no]', s.el).focus();
});

/** fields: [{ key, label, value, type, list }] -> objek nilai atau null. */
export const form = (title, fields, confirm = 'Simpan', sub = '') => new Promise((resolve) => {
  const input = (f) => `<label class="field">${esc(f.label)}${f.type === 'area' ? `<textarea name="${f.key}" rows="3">${esc(f.value)}</textarea>` : `<input name="${f.key}" type="${f.type ?? 'text'}" value="${esc(f.value)}" ${f.type === 'number' ? 'step="any" inputmode="decimal"' : ''} ${f.list ? `list="dl-${f.key}"` : ''} autocomplete="off">`}${f.list ? `<datalist id="dl-${f.key}">${f.list.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>` : ''}</label>`;
  const s = sheet({ title, sub, body: `<form>${fields.map(input).join('')}<div class="pair"><button type="button" class="soft" data-no>Batal</button><button class="solid">${esc(confirm)}</button></div></form>`, onClose: (v) => resolve(v ?? null) });
  $('[data-no]', s.el).onclick = () => s.close();
  $('form', s.el).onsubmit = (e) => { e.preventDefault(); s.close(Object.fromEntries(new FormData(e.target))); };
});

export const choose = (title, items, sub = '') => new Promise((resolve) => {
  const s = sheet({ title, sub, body: `<div class="list">${items.map((i) => `<button data-id="${i.id}" class="${i.danger ? 'warn' : ''}">${i.icon ? icon(i.icon) : ''}<span>${esc(i.label)}</span></button>`).join('')}</div>`, onClose: (v) => resolve(v ?? null) });
  s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) s.close(b.dataset.id); });
});

/* ---------- toast ---------- */
let toastTimer = 0;
export function toast(message, action) {
  const t = $('#toast');
  clearTimeout(toastTimer);
  t.innerHTML = `<span>${esc(message)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) $('button', t).onclick = () => { t.hidden = true; action.run(); };
  t.getAnimations().forEach((a) => a.cancel());
  t.hidden = false;
  move(t, [{ opacity: 0, translate: '-50% 20px', scale: '.94' }, { opacity: 1, translate: '-50% 0', scale: '1' }]);
  toastTimer = setTimeout(async () => { const a = move(t, [{ opacity: 1 }, { opacity: 0, translate: '-50% 14px' }], 170, { fill: 'forwards' }); await finished(a); t.hidden = true; a.cancel(); }, Math.max(3000, message.length * 60));
}

/* ---------- roda pen ---------- */
let wheelEl = null;
export function wheel(x, y, items, onPick) {
  closeWheel();
  const el = (wheelEl = document.createElement('div'));
  el.id = 'wheel';
  el.className = 'glass';
  el.style.left = `${Math.max(126, Math.min(innerWidth - 126, x))}px`;
  el.style.top = `${Math.max(126, Math.min(innerHeight - 126, y))}px`;
  el.innerHTML = `<button class="mid" aria-label="Tutup">${icon('close')}</button>${items.map((it, k) => `<button data-k="${k}" aria-label="${esc(it.label)}" title="${esc(it.label)}" class="${it.on ? 'solid' : ''}">${icon(it.icon)}</button>`).join('')}`;
  document.body.appendChild(el);
  move(el, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], 150);
  $$('[data-k]', el).forEach((b, k) => {
    const a = (k / items.length) * Math.PI * 2 - Math.PI / 2, to = `translate(${Math.cos(a) * 88}px, ${Math.sin(a) * 88}px)`;
    b.style.transform = to;
    move(b, [{ transform: 'translate(0,0) scale(.3)' }, { transform: to }], 250, { delay: k * 15, fill: 'backwards' });
  });
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; closeWheel(); if (b.dataset.k !== undefined) onPick(items[+b.dataset.k]); };
}
export function closeWheel() {
  if (!wheelEl) return false;
  const el = wheelEl;
  wheelEl = null;
  finished(move(el, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.6)', opacity: 0 }], 150, { fill: 'forwards' })).then(() => el.remove());
  return true;
}
