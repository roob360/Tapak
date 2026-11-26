// Memilih banyak lembar dengan cepat: rentang, semua, balik, sapu, dan Shift+klik.

/** "1-5, 8" -> Set indeks mulai 0. Nomor di luar 1..n diabaikan; null bila tidak ada yang terbaca. */
export function parseRange(text, n) {
  const out = new Set();
  for (const part of String(text).split(/[,;]+/)) {
    const m = /^\s*(\d+)\s*(?:(?:-|–|sd|s\/d)\s*(\d+))?\s*$/i.exec(part);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    for (let i = Math.max(1, Math.min(a, b)); i <= Math.min(n, Math.max(a, b)); i++) out.add(i - 1);
  }
  return out.size ? out : null;
}

export function setRange(chosen, from, to, on) {
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) if (on) chosen.add(i); else chosen.delete(i);
}

/** Geser semua yang terpilih satu langkah; urutan di antara mereka tetap. Return { order, chosen }. */
export function moveChosen(count, chosen, direction) {
  const order = Array.from({ length: count }, (_, i) => i);
  const picked = new Set(chosen);
  const seq = direction < 0 ? order.keys() : [...order.keys()].reverse();
  for (const i of seq) {
    const to = i + direction;
    if (picked.has(order[i]) && to >= 0 && to < count && !picked.has(order[to])) [order[i], order[to]] = [order[to], order[i]];
  }
  return { order, chosen: new Set(order.map((old, i) => (picked.has(old) ? i : -1)).filter((i) => i >= 0)) };
}

/** Baris alat di atas kisi pilihan. */
export const toolbar = () => `<div class="picker"><button type="button" class="soft" data-pick="all">Semua</button><button type="button" class="soft" data-pick="none">Kosongkan</button><button type="button" class="soft" data-pick="invert">Balik</button><input data-pick-range placeholder="Rentang, mis. 1-5, 8" inputmode="text" autocomplete="off" aria-label="Pilih rentang halaman"></div>
  <p class="hint">Seret mouse melintasi beberapa kartu, Shift+klik untuk rentang, atau tahan kartu (jari atau pen) untuk memilih sampai kartu itu.</p>`;

/**
 * Pasang perilaku memilih pada kisi `[data-i]` di dalam `root`.
 * `onTap(i, event)` boleh mengembalikan true bila ketukan sudah ditangani sendiri.
 */
export function selectable(root, { chosen, count, onChange, onTap }) {
  let last = 0, sweep = null, held = null, skip = false;
  const paint = () => {
    for (const b of root.querySelectorAll('[data-i]')) {
      const on = chosen.has(+b.dataset.i);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    }
    onChange?.();
  };
  const card = (e) => e.target.closest?.('[data-i]');
  root.addEventListener('pointerdown', (e) => {
    skip = false; // sapuan atau tahan yang tidak diikuti klik tidak boleh menelan ketukan berikutnya
    const b = card(e);
    if (!b) return;
    const i = +b.dataset.i;
    if (e.pointerType !== 'mouse') {
      // sentuh dan pen: menggulir tetap jalan; tahan sebentar = pilih rentang sampai kartu ini
      held = setTimeout(() => { setRange(chosen, last, i, true); last = i; skip = true; navigator.vibrate?.(15); paint(); }, 450);
    } else if (e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey) sweep = { from: i, on: !chosen.has(i), moved: false };
  });
  root.addEventListener('pointermove', (e) => {
    if (!sweep) return;
    const b = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-i]');
    if (!b || !root.contains(b)) return;
    const i = +b.dataset.i;
    if (i === sweep.from && !sweep.moved) return;
    sweep.moved = true;
    setRange(chosen, sweep.from, i, sweep.on);
    last = i;
    paint();
  });
  const end = () => {
    clearTimeout(held);
    if (sweep?.moved) skip = true;
    sweep = null;
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('pointerleave', end);
  root.addEventListener('dragstart', (e) => e.preventDefault());
  root.addEventListener('click', (e) => {
    const action = e.target.closest('[data-pick]')?.dataset.pick;
    if (action) {
      for (let i = 0; i < count(); i++) {
        if (action === 'all') chosen.add(i);
        else if (action === 'none') chosen.delete(i);
        else if (chosen.has(i)) chosen.delete(i); else chosen.add(i);
      }
      return paint();
    }
    const b = card(e);
    if (!b) return;
    if (skip) { skip = false; return; }
    const i = +b.dataset.i;
    if (e.shiftKey) setRange(chosen, last, i, true);
    else if (!onTap?.(i, e)) { if (chosen.has(i)) chosen.delete(i); else chosen.add(i); }
    last = i;
    paint();
  });
  root.addEventListener('change', (e) => {
    if (!e.target.matches('[data-pick-range]')) return;
    const found = parseRange(e.target.value, count());
    if (!found) return;
    chosen.clear();
    for (const i of found) chosen.add(i);
    paint();
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-pick-range]')) { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); } });
  return paint;
}
