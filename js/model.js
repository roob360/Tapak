// Aturan progres di atas data .pkp. Murni.
import { nextId } from './pkp.js';
import { center, dist, offsetPolyline } from './geom.js';

export const COLORS = ['#ff383c', '#ff8d28', '#a4c400', '#1f9d55', '#14b8a6', '#c026d3', '#7c3aed', '#78716c'];
export const PRESETS = {
  Dinding: ['Pasang bata', 'Plaster', 'Acian', 'Cat'],
  Kolom: ['Pembesian', 'Bekisting', 'Pengecoran', 'Bongkar bekisting'],
  Pelat: ['Bekisting', 'Pembesian', 'Pengecoran'],
  Lantai: ['Urugan dan lantai kerja', 'Screed', 'Keramik'],
};
export const makeStages = (names) => names.map((name, i) => ({ id: `s${i + 1}`, name, color: COLORS[i % COLORS.length] }));
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
export const shortDate = (iso) => (iso ? `${+iso.slice(8)}/${+iso.slice(5, 7)}` : '');

export const sheetOf = (p, page) => p.progress.sheets[page] ?? null;
export const stagesOf = (p, page) => sheetOf(p, page)?.stages ?? [];

/** Tahap selesai (menurut urutan), dibatasi tanggal `until`. */
export function doneStages(stages, el, until = null) {
  return stages.filter((s) => el.st?.[s.id] && (!until || el.st[s.id] <= until));
}
export const lastStage = (stages, el, until) => doneStages(stages, el, until).at(-1) ?? null;
export const percent = (stages, el, until) => (stages.length ? Math.round((doneStages(stages, el, until).length / stages.length) * 100) : el.date ? 100 : 0);

/** `date` = tanggal tahap terakhir; dipakai rekap dan PDFKill desktop. */
function sync(stages, el) {
  const last = stages.filter((s) => el.st?.[s.id]).at(-1);
  el.date = last ? el.st[last.id] : null;
  if (el.st && !Object.keys(el.st).length) delete el.st;
}
export function setStage(stages, el, stageId, date) {
  if (!stages.some((s) => s.id === stageId)) return;
  if (date) el.st = { ...el.st, [stageId]: date };
  else if (el.st) delete el.st[stageId];
  sync(stages, el);
}
/** Tandai tahap; tanggal tahap lain tidak disentuh. `sequential` mengisi tahap sebelumnya yang masih kosong. */
export function mark(stages, el, stageId, date, sequential = false) {
  const i = stages.findIndex((s) => s.id === stageId);
  if (i < 0) return;
  if (sequential) for (const s of stages.slice(0, i)) if (!el.st?.[s.id]) setStage(stages, el, s.id, date);
  setStage(stages, el, stageId, date);
}
export function clearStages(stages, el, stageId = null) {
  if (stageId) return setStage(stages, el, stageId, null);
  delete el.st;
  el.date = null;
}
/** Tahap berikutnya untuk sekumpulan elemen: yang pertama belum dimiliki semuanya. */
export const nextStage = (stages, els) => stages.find((s) => !els.every((e) => e.st?.[s.id])) ?? stages.at(-1) ?? null;

export const elementsOn = (p, page) => p.progress.items.filter((e) => e.page === page);

/** Kandidat: titik hitung takeoff (hasil Cari simbol) yang belum punya penanda progres di dekatnya. */
export function candidates(p, page) {
  const counts = new Set(p.takeoff.items.filter((i) => i.type === 'count').map((i) => i.id));
  const marks = elementsOn(p, page).filter((e) => e.shape === 'point');
  return p.takeoff.measures
    .filter((m) => m.page === page && m.pts.length === 1 && !m.deduct && counts.has(m.itemId))
    .map((m) => ({ id: `m${m.id}`, virtual: m.id, page, shape: 'point', pts: [[...m.pts[0]]], r: m.box ? Math.max(...m.box) / 2 : 6, style: 'kotak', date: null }))
    .filter((c) => !marks.some((e) => dist(e.pts[0], c.pts[0]) <= c.r * 1.2));
}
export const allElements = (p, page) => [...elementsOn(p, page), ...candidates(p, page)];

export function addElement(p, el) {
  const item = { id: nextId(p.progress.items), date: null, ...el };
  delete item.virtual;
  p.progress.items.push(item);
  return item;
}
/** Kandidat menjadi penanda nyata. */
export function realize(p, el) {
  if (!el.virtual) return el;
  return addElement(p, { page: el.page, shape: 'point', pts: el.pts, r: el.r, style: 'kotak' });
}
export function removeElements(p, els) {
  const ids = new Set(els.filter((e) => !e.virtual).map((e) => e.id));
  const measures = new Set(els.filter((e) => e.virtual).map((e) => e.virtual));
  p.progress.items = p.progress.items.filter((e) => !ids.has(e.id));
  p.takeoff.measures = p.takeoff.measures.filter((m) => !measures.has(m.id));
}

/** Sudah ada titik (penanda atau kandidat) di tempat ini? `size` = sisi terpanjang bentuk yang ditemukan. */
export function pointTaken(p, page, mid, size) {
  return allElements(p, page).some((e) => e.shape === 'point' && dist(e.pts[0], mid) <= Math.max(size * 0.6, e.r ?? 0));
}

/** Simpan hasil Cari simbol sebagai titik hitung takeoff, supaya PDFKill desktop melihatnya juga. Return jumlah yang ditambah. */
export function addCandidates(p, page, boxes) {
  let item = p.takeoff.items.find((i) => i.type === 'count' && i.name === 'Simbol (Tapak)');
  if (!item) {
    item = { id: Math.max(nextId(p.takeoff.items), nextId(p.takeoff.measures), p.takeoff.nextId ?? 1), type: 'count', name: 'Simbol (Tapak)', color: '#ff8d28' };
    p.takeoff.items.push(item);
  }
  let id = Math.max(item.id + 1, nextId(p.takeoff.measures), p.takeoff.nextId ?? 1);
  let added = 0;
  for (const b of boxes) {
    const mid = [b.x + b.w / 2, b.y + b.h / 2];
    if (pointTaken(p, page, mid, Math.max(b.w, b.h))) continue;
    p.takeoff.measures.push({ id: id++, itemId: item.id, page, pts: [mid], box: [b.w, b.h] });
    added++;
  }
  p.takeoff.nextId = id;
  return added;
}

/** Penomoran berurutan dalam urutan baca. */
export function numberElements(els, prefix, start, rowTol) {
  const items = els.map((el) => ({ el, c: center(el) })).sort((a, b) => a.c[1] - b.c[1]);
  const rows = [];
  for (const it of items) {
    const row = rows.at(-1);
    if (row && it.c[1] - row[0].c[1] <= rowTol) row.push(it); else rows.push([it]);
  }
  rows.flatMap((r) => r.sort((a, b) => a.c[0] - b.c[0])).forEach((it, i) => { it.el.label = `${prefix}${start + i}`; });
}

/** Pecah garis menjadi dua sisi sejajar berjarak `gap`. */
export function splitSides(p, el, gap) {
  if (el.shape !== 'line') return false;
  const base = structuredClone(el);
  removeElements(p, [el]);
  for (const side of [1, -1]) addElement(p, { ...base, id: undefined, pts: offsetPolyline(base.pts, (side * gap) / 2), label: base.label ? `${base.label} ${side > 0 ? 'A' : 'B'}` : undefined, id: nextId(p.progress.items) });
  return true;
}

export function summary(p, page, until = null) {
  const stages = stagesOf(p, page);
  const els = allElements(p, page);
  const counts = stages.map((s) => els.filter((e) => e.st?.[s.id] && (!until || e.st[s.id] <= until)).length);
  const total = counts.reduce((a, b) => a + b, 0);
  return {
    n: els.length, stages, counts,
    pending: els.filter((e) => !doneStages(stages, e, until).length).length,
    percent: els.length && stages.length ? Math.round((total / (els.length * stages.length)) * 100) : 0,
  };
}

/** Jumlah pekerjaan (elemen x tahap) per tanggal, seluruh lembar. */
export function byDate(p) {
  const out = new Map();
  for (const e of p.progress.items) for (const d of Object.values(e.st ?? (e.date ? { _: e.date } : {}))) out.set(d, (out.get(d) ?? 0) + 1);
  return [...out].sort(([a], [b]) => (a < b ? -1 : 1));
}

export const DATE_COLORS = ['#0e7490', '#b45309', '#4d7c0f', '#be123c', '#6d28d9', '#047857', '#a21caf', '#57534e'];
export function dateColor(p, page, iso) {
  const dates = [...new Set(elementsOn(p, page).map((e) => e.date).filter(Boolean))].sort();
  return DATE_COLORS[Math.max(0, dates.indexOf(iso)) % DATE_COLORS.length];
}

/** Riwayat urungkan berbasis foto keadaan. */
export function createHistory(limit = 60) {
  let past = [], future = [];
  return {
    push(s) { past.push(s); if (past.length > limit) past.shift(); future = []; },
    undo(now) { if (!past.length) return null; future.push(now); return past.pop(); },
    redo(now) { if (!future.length) return null; past.push(now); return future.pop(); },
    clear() { past = []; future = []; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}

const round2 = ([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
export function moveElement(el, dx, dy) { el.pts = el.pts.map(([x, y]) => round2([x + dx, y + dy])); }
export function moveVertex(el, i, p) { el.pts[i] = round2(p); }
/** Sudut baru di antara titik i dan i+1. */
export function insertVertex(el, i, p) { el.pts.splice(i + 1, 0, round2(p)); }
export function removeVertex(el, i) {
  if (el.pts.length <= (el.shape === 'poly' ? 3 : 2)) return false;
  el.pts.splice(i, 1);
  return true;
}

/**
 * Salin elemen ke lembar lain sebagai elemen baru tanpa tanggal. `sizes` menyesuaikan bila ukuran lembar berbeda.
 * Elemen yang sudah ada di tempat yang sama dilewati. Return jumlah yang dibuat.
 */
export function copyElements(p, els, pages, sizes) {
  let made = 0;
  for (const page of pages) {
    for (const el of els) {
      if (page === el.page) continue;
      const kx = sizes[page][0] / sizes[el.page][0], ky = sizes[page][1] / sizes[el.page][1];
      const pts = el.pts.map(([x, y]) => round2([x * kx, y * ky]));
      const [cx, cy] = center({ ...el, pts });
      const taken = allElements(p, page).some((o) => { const [x, y] = center(o); return o.shape === el.shape && Math.hypot(x - cx, y - cy) < 3; });
      if (taken) continue;
      addElement(p, {
        page, shape: el.shape, pts,
        ...(el.shape === 'point' ? { r: (el.r ?? 9) * kx, style: el.style ?? 'kotak' } : {}),
        ...(el.w ? { w: el.w } : {}), ...(el.label ? { label: el.label } : {}),
      });
      made++;
    }
    const from = els[0] && p.progress.sheets[els[0].page];
    if (from && !p.progress.sheets[page]) p.progress.sheets[page] = structuredClone(from);
  }
  return made;
}
