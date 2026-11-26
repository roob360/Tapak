// Papan kerja: lembar, mode, alat, gambar, petakan, otomatis, progres.
import * as M from './model.js';
import * as G from './geom.js';
import * as db from './store.js';
import { openPdf } from './pdf.js';
import { createBoard } from './board.js';
import { drawMarks, drawAnnotation, drawLegend, STAMPS } from './draw.js';
import { nextId } from './pkp.js';
import * as P from './panels.js';
import { cursorFor } from './cursor.js';
import { straightenDialog } from './deskew.js';
import { $, $$, icon, esc, toast, form, choose, move, finished, wheel, closeWheel, closeTop, closeAll, isOpen, panelOpen, dialogOpen } from './ui.js';

const MODES = [['gambar', 'Gambar'], ['petakan', 'Petakan'], ['otomatis', 'Otomatis'], ['progres', 'Progres']];
const TOOLS = {
  gambar: [['fav0'], ['fav1'], ['fav2'], ['awan', 'Awan', 'drag'], ['catatan', 'Nota', 'place'], ['stempel', 'Cap', 'place'], ['hapus', 'Hapus', 'erase'], ['kuasset', 'Semua', 'action']],
  petakan: [['pilih', 'Pilih', 'drag'], ['titik', 'Titik', 'place'], ['garis', 'Garis', 'place'], ['area', 'Area', 'place'], ['kotak', 'Kotak', 'drag'], ['bulat', 'Bulat', 'drag'], ['bebas', 'Bebas', 'draw'], ['salin', 'Salin', 'action']],
  otomatis: [['cari', 'Cari', 'drag'], ['ruang', 'Ruang', 'place'], ['nomor', 'Nomor', 'action'], ['skala', 'Skala', 'place'], ['sisi', 'Sisi', 'action'], ['lurus', 'Lurus', 'action']],
  progres: [['pilih', 'Pilih', 'drag'], ['kuas', 'Kuas', 'paint'], ['elemen', 'Elemen', 'action'], ['hingga', 'Hingga', 'action'], ['legenda', 'Legenda', 'action'], ['rekap', 'Rekap', 'action']],
};
const KEYS = { v: ['progres', 'pilih'], t: ['petakan', 'titik'], g: ['petakan', 'garis'], a: ['petakan', 'area'], k: ['petakan', 'kotak'], r: ['otomatis', 'ruang'], s: ['otomatis', 'cari'], c: ['gambar', 'fav0'], b: ['progres', 'kuas'] };
const HINT = {
  titik: 'Ketuk untuk menaruh titik. Tahan lalu geser untuk membidik.', garis: 'Ketuk tiap sudut, lalu Selesai.', area: 'Ketuk tiap sudut, ketuk titik awal atau Selesai.',
  kotak: 'Tarik dari sudut ke sudut.', bulat: 'Tarik dari pusat ke tepi.', bebas: 'Gambar mengikuti elemen. Tahan di akhir untuk merapikan.', pilih: 'Ketuk elemen atau tarik kotak.', ubah: 'Pilih elemen, lalu geser badannya atau tarik sudutnya.',
  kuas: 'Pilih tahap di atas, lalu ketuk atau sapu elemen.', cari: 'Tarik kotak di sekeliling SATU contoh.', ruang: 'Ketuk bagian kosong di dalam ruangan.', skala: 'Ketuk dua titik yang jaraknya diketahui.',
  catatan: 'Ketuk untuk menaruh catatan.', stempel: 'Ketuk untuk menaruh stempel.', awan: 'Tarik kotak mengelilingi bagian yang direvisi.',
};

const PREFS_KEY = 'tapak.prefs';
export const prefs = {
  alpha: 0.35, cross: true, loupe: true, ortho: false, polar: false, autoProps: true, lineW: 0, names: true, labelTop: true, author: '', leftHand: false, finger: false, straighten: true, wheel: true, snap: true, theme: 'sistem', strip: true, sequential: false,
  colorMode: 'tahap', dates: true, pct: true, similarity: 80,
  favorites: [
    { name: 'Revisi', brush: 'pulpen', color: '#ff383c', size: 2.5, op: 1, pressure: 0.7, smooth: 0.35 },
    { name: 'Catat', brush: 'pensil', color: '#1c1c1e', size: 1.5, op: 0.8, pressure: 0.7, smooth: 0.25 },
    { name: 'Sorot', brush: 'stabilo', color: '#ffd60a', size: 14, op: 0.4, pressure: 0, smooth: 0.4 },
  ],
  ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'),
};
export const savePrefs = () => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
export function applyTheme() { document.documentElement.dataset.theme = prefs.theme; }

/** Keadaan lembar kerja yang sedang terbuka. */
export const S = {
  file: null, pdf: null, view: null, names: [], page: 0, mode: 'progres', tool: 'pilih', fav: 0, stage: null, selected: new Set(),
  filter: null, until: null, lastMade: null, dismissed: '', period: null, legendDrag: null, editDrag: null, vertex: null, panel: null, draft: [], cursor: null, drag: null, stroke: null, found: null, pop: new Map(), legendBox: null,
};
const history = M.createHistory();
let hintTimer = 0;
let board = null, bitmap = null, saveTimer = 0, pdfDirty = false, home = () => {};
let worker = null, ready = null, ka = 1, seq = 0;
const waiting = new Map();
const bitmaps = new Map();

export const project = () => S.file.project;
export const stages = () => M.stagesOf(project(), S.page);
export const elements = () => M.allElements(project(), S.page);
export const selected = () => elements().filter((e) => S.selected.has(e.id));
export const sheetName = (i) => S.names[i] || `Lembar ${i + 1}`;
export const getBoard = () => board;

/* ---------- data, urungkan, simpan ---------- */
const snap = () => ({ json: JSON.stringify(S.file.project), pdf: S.pdf });
function save() {
  if (S.file) S.file.changedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
export async function flush() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!S.file) return;
  S.file.updated = Date.now();
  S.file.summary = fileSummary();
  try {
    if (pdfDirty) { pdfDirty = false; await db.putBoth(S.file, S.pdf); } else await db.putFile(S.file);
  } catch { toast('Gagal menyimpan: penyimpanan perangkat penuh?'); }
}
function fileSummary() {
  let n = 0, done = 0, total = 0;
  for (let i = 0; i < S.view.pages; i++) {
    const sum = M.summary(project(), i);
    n += sum.n;
    done += sum.counts.reduce((a, b) => a + b, 0);
    total += sum.n * sum.stages.length;
  }
  return { sheets: S.view.pages, elements: n, percent: total ? Math.round((done / total) * 100) : 0 };
}
/** Satu-satunya jalan mengubah data proyek: bisa diurungkan, tersimpan, tergambar. */
export function change(fn) {
  const before = snap();
  fn();
  if (JSON.stringify(S.file.project) !== before.json) { history.push(before); save(); }
  refresh();
}
/** Perubahan yang juga mengganti PDF (kelola lembar). */
export async function changePdf(pdf, nextProject) {
  history.push(snap());
  S.file.changedAt = Date.now();
  S.file.project = nextProject;
  await usePdf(pdf);
  pdfDirty = true;
  await flush();
  await showPage(Math.min(S.page, S.view.pages - 1));
}
async function restore(s) {
  if (!s) return;
  S.file.project = JSON.parse(s.json);
  S.selected.clear();
  if (s.pdf !== S.pdf) { await usePdf(s.pdf); pdfDirty = true; await showPage(Math.min(S.page, S.view.pages - 1)); }
  save();
  move($('#plan'), [{ opacity: 0.4, translate: '-12px 0' }, { opacity: 1, translate: '0 0' }]);
  refresh();
}
export function undo() {
  if (S.draft.length) { S.draft.pop(); return refresh(); }
  if (!history.canUndo) return toast('Tidak ada yang diurungkan');
  return restore(history.undo(snap()));
}
export function redo() { return restore(history.redo(snap())); }

/* ---------- PDF dan lembar ---------- */
async function usePdf(bytes) {
  await S.view?.close();
  S.pdf = bytes;
  S.view = await openPdf(bytes);
  S.names = await S.view.names();
  bitmaps.clear();
}
async function bitmapOf(i) {
  if (!bitmaps.has(i)) {
    if (bitmaps.size >= 3) bitmaps.delete(bitmaps.keys().next().value); // hemat memori di tablet
    bitmaps.set(i, await S.view.render(i));
  }
  return bitmaps.get(i);
}
const thumbs = new Map();
export async function thumb(i) {
  const key = `${S.file.id}:${S.pdf.length}:${i}`;
  if (!thumbs.has(key)) thumbs.set(key, (await S.view.render(i, 220)).toDataURL('image/jpeg', 0.7));
  return thumbs.get(key);
}
export async function showPage(i, direction = 0) {
  S.page = Math.max(0, Math.min(S.view.pages - 1, i));
  S.selected.clear();
  S.draft = []; S.found = null; S.cursor = null; S.drag = null;
  const page = S.page, bmp = await bitmapOf(page);
  if (!S.file || page !== S.page) return;
  bitmap = bmp;
  board.setPage(bmp, S.view.sizes[page]);
  if (direction) move($('#plan'), [{ opacity: 0, translate: `0 ${direction * 90}px` }, { opacity: 1, translate: '0 0' }]);
  if (!stages().some((s) => s.id === S.stage)) S.stage = stages()[0]?.id ?? null;
  startWorker();
  renderStrip();
  refresh();
}

/* ---------- pekerja citra ---------- */
function call(op, args, transfer) {
  return new Promise((res, rej) => {
    waiting.set(++seq, { res, rej });
    worker.postMessage({ id: seq, op, args }, transfer ?? []);
  });
}
function startWorker() {
  stopWorker();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const w = waiting.get(data.id);
    if (!w) return;
    waiting.delete(data.id);
    if (data.error) w.rej(new Error(data.error)); else w.res(data.result);
  };
  worker.onerror = () => toast('Alat otomatis gagal dimuat');
  ready = null;
}
function stopWorker() {
  worker?.terminate();
  worker = null;
  for (const w of waiting.values()) w.rej(new Error('dibatalkan'));
  waiting.clear();
}
async function loadImage(canvas, pageWidth) {
  const k = Math.min(1, 2400 / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k);
  c.height = Math.round(canvas.height * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, c.width, c.height);
  const { data } = g.getImageData(0, 0, c.width, c.height);
  await call('load', { rgba: data, w: c.width, h: c.height }, [data.buffer]);
  return c.width / pageWidth; // piksel analisis per titik
}
const analysis = () => (ready ??= loadImage(bitmap, S.view.sizes[S.page][0]).then((k) => (ka = k)));

/* ---------- alat aktif ---------- */
export const favorite = () => prefs.favorites[S.fav];
function toolInput() {
  if (S.found) return 'drag';
  if (S.mode === 'gambar' && S.tool.startsWith('fav')) return favorite().brush === 'garis' || favorite().brush === 'kotakgambar' || favorite().brush === 'panah' ? 'drag' : 'draw';
  return TOOLS[S.mode].find((t) => t[0] === S.tool)?.[2] ?? 'pan';
}
export function setMode(mode, tool) {
  S.mode = mode;
  S.tool = tool ?? { gambar: `fav${S.fav}`, petakan: 'titik', otomatis: 'cari', progres: 'pilih' }[mode];
  resetTool();
  renderRail(true);
  refresh();
}
function resetTool() { S.vertex = null; S.panel = null; S.draft = []; S.found = null; S.cursor = null; S.drag = null; closeWheel(); }
export async function setTool(id) {
  // mengetuk alat yang sedang aktif = selesai, kembali ke Pilih (pengganti Esc di tablet)
  if (id === S.tool && id !== 'pilih' && S.mode !== 'gambar' && TOOLS[S.mode].find((t) => t[0] === id)?.[2] !== 'action') return selectTool();
  const action = TOOLS[S.mode].find((t) => t[0] === id)?.[2] === 'action';
  if (action) {
    S.panel = id;
    renderRail();
    const open = ({ kuasset: P.brushes, elemen: P.elementsPanel, hingga: () => P.viewPanel('hingga'), legenda: P.viewPanel, rekap: P.recap, nomor: P.autoNumber, sisi: P.splitSides, lurus: straightenDialog, salin: P.copyDialog })[id];
    const result = await open();
    await result?.closed;
    if (S.panel === id) { S.panel = null; if (S.file) renderRail(); }
    return;
  }
  S.tool = id;
  if (id.startsWith('fav')) S.fav = +id.slice(3);
  if (id !== 'pilih') S.selected.clear();
  resetTool();
  renderRail();
  refresh();
}

/* ---------- gambar ---------- */
const tol = (type) => (type === 'touch' ? 18 : 9) / board.view.k;
const hit = (p, type = 'touch') => G.pickElement(elements(), p, tol(type));
const markDate = () => M.today();
let lastPop = 0;
export function pop(ids) {
  const t0 = performance.now();
  lastPop = t0;
  const step = (t) => {
    let alive = false;
    ids.forEach((id, i) => {
      const p = (t - t0 - Math.min(i, 20) * 35) / 300;
      if (p < 0) alive = true;
      else if (p < 1) { S.pop.set(id, Math.sin(p * Math.PI)); alive = true; } else S.pop.delete(id);
    });
    board?.redraw();
    if (alive && lastPop === t0) requestAnimationFrame(step); else ids.forEach((id) => S.pop.delete(id));
  };
  requestAnimationFrame(step);
}
function brushElement(el) {
  if (!S.stage || !stages().length) return;
  const real = M.realize(project(), el);
  if (real.st?.[S.stage] === markDate() && S.paint.single) M.clearStages(stages(), real, S.stage);
  else M.mark(stages(), real, S.stage, markDate(), prefs.sequential);
  return real;
}
function paintAt(p) {
  const el = hit(p, 'pen');
  if (!el || S.paint.seen.has(el.id)) return;
  const real = brushElement(el);
  S.paint.seen.add(el.id);
  if (real) { S.paint.seen.add(real.id); pop([real.id]); }
}

const newElement = (shape, pts, extra = {}) => ({ page: S.page, shape, pts: pts.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]), ...extra });
const pointRadius = () => {
  const same = M.elementsOn(project(), S.page).filter((e) => e.shape === 'point' && e.r);
  return same.length ? same.at(-1).r : Math.max(4, Math.min(30, Math.max(...S.view.sizes[S.page]) / 200));
};
function add(shape, pts, extra) {
  let made;
  if (shape === 'line' && prefs.lineW) extra = { w: prefs.lineW, ...extra };
  change(() => { made = M.addElement(project(), newElement(shape, pts, extra)); });
  S.lastMade = made.id;
  pop([made.id]);
}
function annotate(a) {
  change(() => { project().annotations.items.push({ id: nextId(project().annotations.items), page: S.page, ...a }); });
}
export function finishDraft() {
  const need = S.tool === 'area' ? 3 : 2;
  if (S.draft.length < need) return toast(`Perlu minimal ${need} titik`);
  const pts = S.draft;
  S.draft = []; S.cursor = null;
  add(S.tool === 'area' ? 'poly' : 'line', pts);
}
async function snapped(p) {
  if (!prefs.snap) return p;
  try {
    await analysis();
    const s = await call('snap', { p: [p[0] * ka, p[1] * ka], r: Math.max(3, Math.min(30, Math.round((14 / board.view.k) * ka))) });
    return s ? [s[0] / ka, s[1] / ka] : p;
  } catch { return p; }
}
function circle(c, edge) {
  const r = G.dist(c, edge);
  return Array.from({ length: 48 }, (_, i) => [c[0] + r * Math.cos((i / 48) * Math.PI * 2), c[1] + r * Math.sin((i / 48) * Math.PI * 2)]);
}
const rect = (a, b) => [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];

/** Tahan di akhir goresan: rapikan jadi garis, persegi, atau lingkaran. */
function tidy(pts) {
  const len = G.pathLength(pts), a = pts[0], b = pts.at(-1);
  if (G.dist(a, b) > len * 0.92) return { closed: false, pts: [a, b] };
  if (G.dist(a, b) > len * 0.22) return { closed: false, pts: G.simplify(pts, len * 0.025) };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys), c = [(x1 + x2) / 2, (y1 + y2) / 2];
  const radii = pts.map((p) => G.dist(p, c)), r = radii.reduce((s, v) => s + v, 0) / radii.length;
  const spread = Math.sqrt(radii.reduce((s, v) => s + (v - r) ** 2, 0) / radii.length) / r;
  const fill = G.polyArea(pts) / ((x2 - x1) * (y2 - y1) || 1);
  if (spread < 0.12 && fill < 0.86) return { closed: true, pts: circle(c, [c[0] + r, c[1]]) };
  return { closed: true, pts: rect([x1, y1], [x2, y2]) };
}

/* ---------- penerjemah gerakan papan ---------- */
let erasing = null;
let pointerAt = null;
function overWhat(p) {
  if (!p) return null;
  const L = S.legendBox, reach = 12 / board.view.k;
  if (L && S.mode !== 'gambar' && !S.found && !S.draft.length) {
    if (S.mode === 'progres' && Math.hypot(p[0] - L.x - L.w, p[1] - L.y - L.h) <= reach) return 'size';
    if (p[0] >= L.x && p[0] <= L.x + L.w && p[1] >= L.y && p[1] <= L.y + L.h) return 'legend';
  }
  const shape = editing() && single();
  if (shape && shape.shape !== 'point' && [...shape.pts, ...midpoints(shape)].some((q) => G.dist(p, q) <= reach)) return 'handle';
  if (S.found) return S.found.list.some((c) => c.page === S.page && p[0] >= c.x && p[0] <= c.x + c.w && p[1] >= c.y && p[1] <= c.y + c.h) ? 'element' : null;
  return (S.tool === 'pilih' || S.tool === 'kuas') && hit(p, 'mouse') ? 'element' : null;
}
export function updateCursor() {
  const canvas = $('#plan');
  if (!canvas || !board || !S.file) return;
  const f = favorite();
  const next = cursorFor({ mode: S.mode, tool: S.tool, brush: f.brush, color: f.color, size: f.size * board.view.k, over: overWhat(pointerAt), found: !!S.found, movable: editing() && !!pointerAt && S.selected.has(hit(pointerAt, 'mouse')?.id) });
  if (canvas.dataset.cursor !== next) { canvas.dataset.cursor = next; canvas.style.cursor = next; }
}

export const editing = () => S.mode === 'petakan' && S.tool === 'pilih';
const single = () => (S.selected.size === 1 ? selected()[0] : null);
const midpoints = (el) => el.pts.slice(0, el.shape === 'poly' ? el.pts.length : -1).map((a, i) => { const b = el.pts[(i + 1) % el.pts.length]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });

function grabElement(p, type) {
  const direct = hit(p, type);
  if (direct && direct.shape !== 'poly' && !S.selected.has(direct.id) && !board.state.add) {
    S.selected = new Set([direct.id]);
    S.vertex = null;
    S.editDrag = { kind: 'move', last: p, before: snap(), realized: false, fresh: true };
    return true;
  }
  if (!S.selected.size) return false;
  const reach = (type === 'touch' ? 20 : 10) / board.view.k;
  const one = single();
  const before = snap();
  if (one && one.shape !== 'point') {
    let index = one.pts.findIndex((q) => G.dist(p, q) <= reach);
    if (index >= 0) { S.editDrag = { kind: 'vertex', id: one.id, index, before }; return true; }
    index = midpoints(one).findIndex((q) => G.dist(p, q) <= reach);
    if (index >= 0) {
      const real = M.realize(project(), one);
      M.insertVertex(real, index, p);
      S.selected = new Set([real.id]);
      S.editDrag = { kind: 'vertex', id: real.id, index: index + 1, before };
      return true;
    }
  }
  const under = hit(p, type);
  if (!under || !S.selected.has(under.id)) return false;
  S.editDrag = { kind: 'move', last: p, before, realized: false };
  return true;
}
function moveGrabbed(p) {
  const d = S.editDrag;
  if (d.kind === 'vertex') {
    const el = elements().find((e) => e.id === d.id);
    if (!el) return;
    S.vertex = d.index;
    M.moveVertex(el, d.index, constrain(p, el.pts[(d.index - 1 + el.pts.length) % el.pts.length]));
  } else {
    if (!d.realized) { // kandidat yang digeser menjadi penanda nyata
      S.selected = new Set(selected().map((e) => M.realize(project(), e).id));
      d.realized = true;
    }
    for (const el of selected()) M.moveElement(el, p[0] - d.last[0], p[1] - d.last[1]);
    d.last = p;
  }
  board.redraw();
}
export function removeSelectedVertex() {
  const el = single();
  if (!el || S.vertex === null) return;
  if (el.pts.length <= (el.shape === 'poly' ? 3 : 2)) return toast('Sudut sudah paling sedikit');
  change(() => { M.removeVertex(elements().find((e) => e.id === el.id), S.vertex); S.vertex = null; });
}

/** Alat Pilih pada mode yang punya (Progres atau Petakan). */
export function selectTool() {
  const last = S.lastMade;
  S.lastMade = null;
  setMode(S.mode === 'progres' ? 'progres' : 'petakan', 'pilih');
  if (last !== null && elements().some((e) => e.id === last)) { S.selected = new Set([last]); pop([last]); }
  refresh();
}
/** Esc: tutup yang paling atas, selesaikan gambar, kembali ke Pilih, lalu lepas pilihan. */
export function escape() {
  if (closeWheel()) return;
  if (dialogOpen()) return closeTop();
  if (S.found) { closeAll(); return cancelFound(); }
  const drawing = !['pilih', 'kuas'].includes(S.tool);
  if (S.draft.length) {
    if (S.tool !== 'skala' && S.draft.length >= (S.tool === 'area' ? 3 : 2)) finishDraft();
    else { S.draft = []; S.cursor = null; }
    return selectTool();
  }
  if (drawing || S.tool === 'kuas') return selectTool();
  S.selected.clear();
  S.vertex = null;
  closeAll();
  refresh();
}
/** Properti elemen terbuka sendiri saat dipilih, dan tertutup saat pilihan dilepas. */
let autoPanel = null;
function syncProps() {
  const signature = [...S.selected].join();
  if (signature !== S.dismissed) S.dismissed = '';
  if (autoPanel && !autoPanel.el.isConnected) autoPanel = null;
  const want = prefs.autoProps && S.tool === 'pilih' && ['petakan', 'progres'].includes(S.mode) && S.selected.size > 0 && innerWidth > 800 && !S.dismissed && !S.draft.length;
  if (want && !autoPanel && !isOpen()) {
    const panel = P.elementsPanel({ quiet: true });
    autoPanel = panel;
    panel.closed.then(() => { if (autoPanel === panel) { autoPanel = null; S.dismissed = [...S.selected].join(); } });
    const el = selected()[0];
    if (el) board.uncover([Math.max(...el.pts.map((q) => q[0])), el.pts[0][1]], innerWidth - 400);
  } else if (!want && autoPanel) {
    const panel = autoPanel;
    autoPanel = null;
    panel.close();
  }
}

const AIMING = { petakan: ['titik', 'garis', 'area', 'kotak', 'bulat'], otomatis: ['skala', 'cari', 'ruang'] };
const aiming = () => !!S.found || (AIMING[S.mode] ?? []).includes(S.tool) || (editing() && !!S.editDrag);
let shift = false;
/** Kunci arah dari titik sebelumnya: Ortho (datar/tegak; Shift membalik sesaat) atau Polar (tiap 15 derajat). */
function constrain(p, from) {
  if (!from) return p;
  if (prefs.ortho !== shift) return Math.abs(p[0] - from[0]) >= Math.abs(p[1] - from[1]) ? [p[0], from[1]] : [from[0], p[1]];
  return prefs.polar ? G.lockAngle(from, p, 15) : p;
}
const locked = () => prefs.ortho !== shift || prefs.polar;
const anchor = () => (['garis', 'area', 'skala'].includes(S.tool) ? S.draft.at(-1) : null);
export function toggleAid(name) {
  prefs[name] = !prefs[name];
  if (prefs[name] && name === 'ortho') prefs.polar = false;
  if (prefs[name] && name === 'polar') prefs.ortho = false;
  savePrefs();
  renderAids();
  board.redraw();
}
function renderAids() {
  const bar = $('#aids');
  if (!bar) return;
  bar.hidden = !aiming();
  for (const b of $$('button', bar)) b.setAttribute('aria-pressed', String(!!prefs[b.dataset.aid]));
}

const handlers = {
  guides: () => (aiming() ? { cross: prefs.cross, loupe: prefs.loupe } : null),
  aimPoint: (p) => constrain(p, anchor()),
  insets: () => {
    const narrow = innerWidth <= 800;
    const side = (prefs.strip && !narrow ? 92 : 0) + (narrow ? 70 : 86);
    const panel = innerWidth > 1100 && panelOpen() ? 386 : 0; // panel kanan tidak menutupi gambar
    return { top: narrow ? 128 : 84, bottom: 96, left: prefs.leftHand ? 16 : side, right: Math.max(prefs.leftHand ? side : 16, panel) };
  },
  tool: () => ({ input: toolInput() }),
  zoomed: (z) => { const b = $('#zoom [data-a="zfit"]'); if (b) b.textContent = `${Math.round(z * 100)}%`; updateCursor(); },
  cursor: () => updateCursor(),
  penSeen: () => { prefs.finger = false; board.state.finger = false; toast('Pen terdeteksi: pen menggambar, jari menggeser. Ubah di Pengaturan.'); },
  touched: () => closeWheel(),
  multiTap: (n) => { if (n === 2) undo(); else redo(); },
  menu(screen, world, type) {
    if (type === 'mouse') {
      if (S.draft.length) return escape();
      const under = (S.tool === 'pilih') && hit(world, type);
      if (under) { if (!S.selected.has(under.id)) { S.selected = new Set([under.id]); refresh(); } return P.elementMenu(); }
    }
    if (!prefs.wheel) return;
    const r = $('#plan').getBoundingClientRect();
    navigator.vibrate?.(12);
    wheel(screen[0] + r.left, screen[1] + r.top, [
      { icon: favorite().brush === 'stabilo' ? 'stabilo' : 'pulpen', label: favorite().name, go: () => setMode('gambar', `fav${S.fav}`) },
      { icon: 'stabilo', label: prefs.favorites[2].name, go: () => { S.fav = 2; setMode('gambar', 'fav2'); } },
      { icon: 'hapus', label: 'Hapus', go: () => setMode('gambar', 'hapus') },
      { icon: 'pilih', label: 'Pilih', go: () => setMode('progres', 'pilih') },
      { icon: 'kuas', label: 'Kuas tahap', go: () => setMode('progres', 'kuas') },
      { icon: 'titik', label: 'Titik', go: () => setMode('petakan', 'titik') },
      { icon: 'area', label: 'Area', go: () => setMode('petakan', 'area') },
      { icon: 'undo', label: 'Urungkan', go: undo },
    ], (it) => it.go());
  },
  paint(g, zoom) {
    const p = project(), px = 1 / zoom, st = stages();
    const shown = p.progress.show === false ? [] : elements();
    drawMarks(g, p, shown, st, { px, until: S.until, mode: prefs.colorMode, dates: prefs.dates, pct: prefs.pct, names: prefs.names, alpha: prefs.alpha, labelTop: prefs.labelTop, period: S.period, selected: S.selected, filter: S.filter, pop: S.pop });
    if (p.annotations.show !== false) for (const a of p.annotations.items) if (a.page === S.page && a.pts.length) drawAnnotation(g, a);
    const shape = editing() && single();
    if (shape && shape.shape !== 'point') {
      const dot = ([x, y], r, fill) => { g.beginPath(); g.arc(x, y, r * px, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = 2 * px; g.strokeStyle = '#1c1c1e'; g.stroke(); };
      for (const [i, q] of shape.pts.entries()) dot(q, 7, i === S.vertex ? '#ff8d28' : '#fff');
      for (const mid of midpoints(shape)) dot(mid, 4, '#34c759');
    }
    S.legendBox = drawLegend(g, p, S.page, M.summary(p, S.page, S.until), { unit: legendUnit(), mode: prefs.colorMode, until: S.until, elements: shown, page: S.view.sizes[S.page], handle: S.mode === 'progres' ? px : 0 });
    for (const c of S.found?.list ?? []) {
      if (c.page !== S.page) continue;
      g.save();
      g.strokeStyle = c.on ? '#c2410c' : '#8e8e93';
      g.fillStyle = '#ff8d2833';
      g.lineWidth = 2.5 * px;
      g.setLineDash(c.on ? [6 * px, 4 * px] : [2 * px, 5 * px]);
      if (c.on) g.fillRect(c.x, c.y, c.w, c.h);
      g.strokeRect(c.x, c.y, c.w, c.h);
      g.restore();
    }
  },
  live(g, zoom) {
    const px = 1 / zoom;
    g.save();
    g.lineJoin = g.lineCap = 'round';
    const line = (pts, close) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); g.stroke(); };
    g.strokeStyle = '#ff8d28';
    g.lineWidth = 2.5 * px;
    const draft = S.cursor && S.draft.length ? [...S.draft, S.cursor] : S.draft;
    if (draft.length) {
      line(draft, false);
      for (const [x, y] of S.draft) { g.beginPath(); g.arc(x, y, 5 * px, 0, 7); g.fillStyle = '#fff'; g.fill(); g.stroke(); }
    }
    if (S.stroke) {
      if (S.mode === 'gambar') drawAnnotation(g, S.stroke);
      else line(S.stroke.pts, false);
    }
    if (S.drag) {
      const { a, b } = S.drag, brush = S.mode === 'gambar' && S.tool.startsWith('fav') ? favorite() : null;
      if (S.tool === 'bulat') line(circle(a, b), true);
      else if (S.tool === 'awan') drawAnnotation(g, { type: 'cloud', pts: [a, b], color: favorite().color, size: 2 });
      else if (brush?.brush === 'garis' || brush?.brush === 'panah') { g.strokeStyle = brush.color; g.lineWidth = brush.size; line(shapeStroke(brush, a, b), false); }
      else {
        g.setLineDash(S.tool === 'pilih' || S.tool === 'cari' || S.found ? [7 * px, 5 * px] : []);
        g.strokeStyle = '#1c1c1e';
        line(rect(a, b), true);
      }
    }
    g.restore();
  },
  /** Pegangan: sudut atau badan elemen (alat Ubah), dan legenda. */
  grab(p, type, may) {
    if (may && editing() && grabElement(p, type)) return true;
    const L = S.legendBox;
    if (!L || S.found || S.draft.length || S.mode === 'gambar') return false;
    const reach = (type === 'touch' ? 22 : 12) / board.view.k;
    const size = S.mode === 'progres' && Math.hypot(p[0] - L.x - L.w, p[1] - L.y - L.h) <= reach;
    if (!size && !(p[0] >= L.x && p[0] <= L.x + L.w && p[1] >= L.y && p[1] <= L.y + L.h)) return false;
    S.legendDrag = { a: p, box: { ...L }, size, scale: project().progress.legend.scale ?? 1, before: snap() };
    return true;
  },
  grabMove(p) {
    if (S.editDrag) return moveGrabbed(p);
    const d = S.legendDrag;
    if (!d) return;
    const legend = project().progress.legend;
    if (d.size) {
      const grow = Math.max((p[0] - d.box.x) / d.box.w, (p[1] - d.box.y) / d.box.h);
      legend.scale = Math.round(Math.max(0.5, Math.min(4, d.scale * grow)) * 100) / 100;
      legend.pos[S.page] = [d.box.x, d.box.y];
    } else legend.pos[S.page] = [d.box.x + p[0] - d.a[0], d.box.y + p[1] - d.a[1]];
    board.redraw();
  },
  grabEnd(moved, p, type) {
    if (S.editDrag) {
      const d = S.editDrag;
      S.editDrag = null;
      if (moved) { history.push(d.before); save(); return refresh(); }
      // ketukan tanpa geser: sudut dipilih (untuk dibuang), atau pilihan elemen diubah seperti biasa
      S.file.project = JSON.parse(d.before.json);
      if (d.kind === 'vertex') { S.vertex = d.index; return refresh(); }
      if (d.fresh) return refresh();
      return handlers.tap(p, type);
    }
    const d = S.legendDrag;
    S.legendDrag = null;
    if (d && moved) { history.push(d.before); save(); }
    refresh();
  },
  start(p, pressure) {
    if (toolInput() === 'draw') {
      if (S.mode === 'gambar') {
        const f = favorite();
        S.stroke = { type: 'pen', brush: f.brush, color: f.color, size: f.size, op: f.op, pts: [p], pr: f.pressure ? [0.5 + (pressure - 0.5) * f.pressure] : undefined };
      } else S.stroke = { pts: [p] };
    } else S.drag = { a: p, b: p };
  },
  move(p, pressure) {
    if (S.stroke) {
      const last = S.stroke.pts.at(-1), smooth = S.mode === 'gambar' ? favorite().smooth : 0.2;
      const q = [last[0] + (p[0] - last[0]) * (1 - smooth * 0.75), last[1] + (p[1] - last[1]) * (1 - smooth * 0.75)];
      if (G.dist(q, last) < 0.4 / board.view.k) return;
      S.stroke.pts.push(q);
      S.stroke.pr?.push(0.5 + (pressure - 0.5) * favorite().pressure);
    } else if (S.drag) {
      S.drag.b = p;
    }
  },
  straighten() {
    if (!prefs.straighten || !S.stroke || S.stroke.pts.length < 8 || S.stroke.brush === 'stabilo') return false;
    const shape = tidy(S.stroke.pts);
    S.stroke.shape = shape;
    S.stroke.pts = shape.closed ? [...shape.pts, shape.pts[0]] : shape.pts;
    delete S.stroke.pr;
    return true;
  },
  end(p, moved, type) {
    if (S.stroke) {
      const s = S.stroke;
      S.stroke = null;
      if (S.mode === 'gambar') {
        if (s.pts.length === 1) s.pts.push([s.pts[0][0] + 0.1, s.pts[0][1]]);
        const { shape, ...a } = s;
        annotate({ ...a, pts: a.pts.map((q) => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]), ...(a.pr ? { pr: a.pr.map((v) => Math.round(v * 100) / 100) } : {}) });
        void shape;
      } else if (G.pathLength(s.pts) > 8 / board.view.k) {
        add(s.shape?.closed ? 'poly' : 'line', s.shape ? s.shape.pts : G.simplify(s.pts, 2 / board.view.k));
      }
      return;
    }
    const d = S.drag;
    S.drag = null;
    if (!d) return;
    if (!moved) return handlers.tap(d.a, type);
    const a = d.a, box = [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.abs(p[0] - a[0]), Math.abs(p[1] - a[1])];
    const [x, y, w, h] = box;
    if (S.found || S.tool === 'cari') return search(box);
    if (S.tool === 'pilih') {
      for (const el of elements()) { const [cx, cy] = G.center(el); if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) S.selected.add(el.id); }
      return refresh();
    }
    if (S.mode === 'gambar') {
      const f = favorite();
      if (S.tool === 'awan') return annotate({ type: 'cloud', pts: [a, p], color: f.color, size: 2 });
      return annotate({ type: 'pen', brush: f.brush, color: f.color, size: f.size, op: f.op, pts: shapeStroke(f, a, p) });
    }
    if (w < 3 && h < 3) return;
    if (S.tool === 'kotak') add('poly', rect(a, p));
    else if (S.tool === 'bulat') add('poly', circle(a, p));
  },
  erase(p, first) {
    if (first) erasing = snap();
    const list = project().annotations.items;
    const r = 8 / board.view.k;
    const i = list.findLastIndex((a) => a.page === S.page && touches(a, p, r));
    if (i < 0) return;
    list.splice(i, 1);
    board.redraw();
  },
  eraseEnd() {
    if (erasing && JSON.stringify(project()) !== erasing.json) { history.push(erasing); save(); }
    erasing = null;
    refresh();
  },
  paintStart(p) {
    if (!stages().length) return toast('Atur tahap dulu (tombol + di atas)');
    S.paint = { before: snap(), seen: new Set(), start: p, last: p, single: false };
    const el = hit(p, 'pen');
    S.paint.single = !!el?.st?.[S.stage] && el.st[S.stage] === markDate();
    paintAt(p);
  },
  paintMove(p) {
    if (!S.paint) return;
    const steps = Math.max(1, Math.ceil(G.dist(S.paint.last, p) / (6 / board.view.k)));
    for (let i = 1; i <= steps; i++) paintAt([S.paint.last[0] + ((p[0] - S.paint.last[0]) * i) / steps, S.paint.last[1] + ((p[1] - S.paint.last[1]) * i) / steps]);
    if (G.dist(S.paint.start, p) > 10 / board.view.k) S.paint.single = false;
  },
  paintEnd() {
    if (!S.paint) return;
    if (JSON.stringify(project()) !== S.paint.before.json) { history.push(S.paint.before); save(); navigator.vibrate?.(8); }
    S.paint = null;
    refresh();
  },
  cancel() {
    if (S.paint) { S.file.project = JSON.parse(S.paint.before.json); S.paint = null; }
    if (S.legendDrag) { S.file.project = JSON.parse(S.legendDrag.before.json); S.legendDrag = null; }
    if (S.editDrag) { S.file.project = JSON.parse(S.editDrag.before.json); S.editDrag = null; }
    if (erasing) { S.file.project = JSON.parse(erasing.json); erasing = null; }
    S.stroke = null; S.drag = null; S.cursor = null;
    board?.redraw();
  },
  preview(p) { S.cursor = constrain(p, anchor()); return S.cursor; },
  hover(p) { pointerAt = p; updateCursor(); if (S.draft.length) { S.cursor = constrain(p, anchor()); board.redraw(); } },
  double() { if (S.draft.length > 1) finishDraft(); },
  async tap(p, type) {
    if (S.found) {
      const c = S.found.list.find((k) => k.page === S.page && p[0] >= k.x && p[0] <= k.x + k.w && p[1] >= k.y && p[1] <= k.y + k.h);
      if (c) { c.on = !c.on; P.found(); board.redraw(); }
      return;
    }
    const t = S.tool;
    if (t === 'pilih') {
      S.vertex = null;
      const el = hit(p, type);
      if (!el) S.selected.clear();
      else if (type === 'mouse' && !board.state.add) { S.selected = new Set([el.id]); pop([el.id]); }
      else if (S.selected.has(el.id)) S.selected.delete(el.id);
      else { S.selected.add(el.id); pop([el.id]); }
      refresh();
    } else if (t === 'kuas') {
      if (!stages().length) return toast('Atur tahap dulu (tombol + di atas)');
      const el = hit(p, type);
      if (!el) return;
      const single = el.st?.[S.stage] === markDate();
      let made;
      change(() => { S.paint = { single }; made = brushElement(el); S.paint = null; });
      if (made) pop([made.id]);
      navigator.vibrate?.(8);
    } else if (t === 'titik') add('point', [p], { r: pointRadius(), style: 'kotak' });
    else if (t === 'ruang') autoRoom(p);
    else if (t === 'catatan') {
      const v = await form('Catatan', [{ key: 'text', label: 'Isi catatan', value: '', type: 'area' }]);
      if (v?.text.trim()) annotate({ type: 'note', pts: [p], text: v.text.trim(), color: '#ffd60a' });
    } else if (t === 'stempel') {
      const pick = await choose('Stempel', [...STAMPS.map((s) => ({ id: s, label: s, icon: 'stempel' })), { id: 'lain', label: 'Teks sendiri…', icon: 'pulpen' }]);
      const text = pick === 'lain' ? (await form('Teks stempel', [{ key: 'text', label: 'Teks', value: '' }]))?.text.trim().toUpperCase() : pick;
      if (text) annotate({ type: 'stamp', pts: [p], text, color: '#ff383c', size: Math.max(12, Math.max(...S.view.sizes[S.page]) / 60) });
    } else if (t === 'garis' || t === 'area' || t === 'skala') {
      // arah yang dikunci tidak ditimpa tempel-ke-garis, supaya tetap sejajar
      const aimed = constrain(p, anchor());
      const q = locked() && S.draft.length ? aimed : await snapped(aimed);
      S.cursor = null;
      if (!S.file) return;
      if (t === 'area' && S.draft.length > 2 && G.dist(q, S.draft[0]) <= tol(type) * 1.5) return finishDraft();
      if (S.draft.length && G.dist(q, S.draft.at(-1)) < 2 / board.view.k) return;
      S.draft.push(q);
      if (t === 'skala' && S.draft.length === 2) return calibrate();
      refresh();
    }
  },
};

export const legendUnit = () => Math.max(...S.view.sizes[S.page]) / 1100;
/** Taruh legenda di salah satu sudut; `all` = semua lembar. */
export function placeLegend(corner, all = false) {
  change(() => {
    const legend = project().progress.legend;
    for (const page of all ? [...Array(S.view.pages).keys()] : [S.page]) {
      const [pw, ph] = S.view.sizes[page];
      const unit = Math.max(pw, ph) / 1100;
      const k = unit / legendUnit();
      const w = (S.legendBox?.w ?? 200 * unit) * k, h = (S.legendBox?.h ?? 140 * unit) * k, m = 10 * unit;
      legend.pos[page] = [corner.endsWith('kanan') ? pw - w - m : m, corner.startsWith('bawah') ? ph - h - m : m];
    }
  });
}

function shapeStroke(f, a, b) {
  if (f.brush === 'kotakgambar') return [...rect(a, b), a];
  if (f.brush !== 'panah') return [a, b];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), head = Math.max(10, f.size * 5);
  const wing = (s) => [b[0] - head * Math.cos(ang + s), b[1] - head * Math.sin(ang + s)];
  return [a, b, wing(0.45), b, wing(-0.45)];
}
function touches(a, p, r) {
  if (a.type === 'pen') {
    const reach = r + (a.size ?? 2);
    return a.pts.length === 1 ? G.dist(p, a.pts[0]) <= reach : a.pts.some((q, i) => i && G.segDist(p, a.pts[i - 1], q) <= reach);
  }
  const xs = a.pts.map((q) => q[0]), ys = a.pts.map((q) => q[1]);
  const pad = a.type === 'cloud' ? r : 60;
  return p[0] >= Math.min(...xs) - r && p[0] <= Math.max(...xs) + pad && p[1] >= Math.min(...ys) - r && p[1] <= Math.max(...ys) + (a.type === 'cloud' ? r : 30);
}

async function calibrate() {
  const px = G.dist(S.draft[0], S.draft[1]);
  const v = await form('Skala lembar ini', [{ key: 'm', label: 'Jarak sebenarnya antara dua titik (meter)', value: '', type: 'number' }]);
  S.draft = [];
  const m = Number(String(v?.m ?? '').replace(',', '.'));
  if (m > 0) { change(() => { project().takeoff.scales[S.page] = m / px; }); toast('Skala tersimpan'); } else refresh();
}

/* ---------- alat otomatis ---------- */
let busy = false;
async function job(label, fn) {
  if (busy) return toast('Tunggu proses sebelumnya selesai');
  busy = true;
  toast(label);
  const id = S.file.id;
  try { const done = await fn(); if (S.file?.id === id) done?.(); } catch (e) { if (e.message !== 'dibatalkan') toast(e.message); } finally { busy = false; }
}
const autoRoom = (p) => job('Mencari tepi ruangan…', async () => {
  await analysis();
  const r = await call('room', { seed: [p[0] * ka, p[1] * ka], gap: 3 });
  return () => {
    if (r.error) return toast(r.error);
    add('poly', r.pts.map((q) => [q[0] / ka, q[1] / ka]));
    toast('Ruang ditambahkan', { label: 'Urungkan', run: undo });
  };
});

/** Cari simbol: kotak contoh -> daftar hasil yang bisa diterima atau dibuang. */
export function search(box) {
  const found = S.found ?? { list: [], samples: [], all: false, similarity: prefs.similarity };
  if (box) {
    if (box[2] * board.view.k < 8 || box[3] * board.view.k < 8) return;
    found.samples.push({ page: S.page, box });
  }
  S.found = found;
  return job('Mencari bentuk serupa…', async () => {
    ready = null; // citra di pekerja akan diganti
    const results = [];
    const templates = [];
    for (const s of found.samples) {
      const bmp = await bitmapOf(s.page);
      const k = await loadImage(bmp, S.view.sizes[s.page][0]);
      templates.push({ k, ...(await call('sample', { box: s.box.map((v) => v * k) })) });
    }
    const pages = found.all ? [...Array(S.view.pages).keys()] : [...new Set(found.samples.map((s) => s.page))];
    for (const page of pages) {
      const bmp = await bitmapOf(page);
      const k = await loadImage(bmp, S.view.sizes[page][0]);
      const marks = M.allElements(project(), page);
      for (const t of templates) {
        const hits = await call('similar', { box: [0, 0, t.w, t.h], sample: { g: t.g, w: t.w, h: t.h }, threshold: found.similarity / 100, rotations: true });
        for (const f of hits) {
          const c = { page, x: f.x / k, y: f.y / k, w: f.w / k, h: f.h / k, on: true };
          const mid = [c.x + c.w / 2, c.y + c.h / 2];
          const near = (o) => Math.abs(o.x + o.w / 2 - mid[0]) < c.w * 0.6 && Math.abs(o.y + o.h / 2 - mid[1]) < c.h * 0.6;
          if (results.some((o) => o.page === page && near(o)) || marks.some((e) => { const [x, y] = G.center(e); return Math.abs(x - mid[0]) < c.w / 2 && Math.abs(y - mid[1]) < c.h / 2; })) continue;
          const before = found.list.find((o) => o.page === page && near(o));
          results.push({ ...c, on: before ? before.on : true });
        }
      }
    }
    return () => {
      if (S.found !== found) return;
      found.list = results;
      P.found();
      board.redraw();
      toast(results.length ? `${results.length} ditemukan` : 'Tidak ditemukan. Turunkan kemiripan atau tambah contoh.');
    };
  });
}
export function acceptFound() {
  const found = S.found;
  const chosen = found.list.filter((c) => c.on);
  S.found = null;
  change(() => { for (const page of new Set(chosen.map((c) => c.page))) M.addCandidates(project(), page, chosen.filter((c) => c.page === page)); });
  closeAll();
  setMode('progres', 'pilih');
  toast(`${chosen.length} kandidat ditambahkan. Beri tanggal agar masuk rekap.`, { label: 'Urungkan', run: undo });
}
export function cancelFound() { S.found = null; board.redraw(); refresh(); }

/* ---------- tampilan ---------- */
function toolMeta(id, label) {
  if (!id.startsWith('fav')) return { label, svg: icon(id === 'kuasset' ? 'more' : id === 'pilih' ? 'panah-pilih' : id) };
  const f = prefs.favorites[+id.slice(3)];
  return { label: f.name, svg: `<svg class="i" viewBox="0 0 24 24"><path d="M3 15c4-8 7 4 11-1s4-6 7-5" style="stroke:${f.color === '#1c1c1e' ? 'currentColor' : f.color};stroke-width:${f.brush === 'stabilo' ? 7 : 2.5};opacity:${f.brush === 'stabilo' ? 0.7 : 1}"/></svg>` };
}
function lens(box) {
  const l = $('.lens', box), on = $('.on', box);
  if (!l) return;
  l.hidden = !on;
  if (!on) return;
  l.style.width = `${on.offsetWidth}px`;
  l.style.height = `${on.offsetHeight}px`;
  l.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
}
function renderRail(animate) {
  const rail = $('#rail');
  if (rail.dataset.mode !== S.mode) {
    rail.dataset.mode = S.mode;
    rail.innerHTML = `<div class="lens"></div>${TOOLS[S.mode].map(([id]) => `<button data-tool="${id}"></button>`).join('')}`;
  }
  for (const [id, label] of TOOLS[S.mode]) {
    const b = $(`[data-tool="${id}"]`, rail), m = toolMeta(id, label);
    b.innerHTML = `${m.svg}<span>${esc(m.label)}</span>`;
    b.title = m.label;
    // alat panel menyala selama panelnya terbuka; Hingga tetap bertitik selama tanggal dibatasi
    b.classList.toggle('on', id === (S.panel ?? S.tool));
    b.classList.toggle('flag', (id === 'hingga' && !!S.until) || (id === 'rekap' && !!S.period));
  }
  lens(rail);
  if (animate) { move(rail, [{ opacity: 0, translate: `${prefs.leftHand ? 16 : -16}px -50%` }, { opacity: 1, translate: '0 -50%' }]); $$('button', rail).forEach((b, i) => move(b, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'none' }], 250, { delay: i * 28, fill: 'backwards' })); }
}
function renderDock() {
  const dock = $('#dock');
  for (const b of $$('button', dock)) b.classList.toggle('on', b.dataset.mode === S.mode);
  lens(dock);
}
async function renderStrip() {
  const strip = $('#strip');
  strip.innerHTML = `<div class="lens soft"></div>${Array.from({ length: S.view.pages }, (_, i) => `<button data-page="${i}" class="${i === S.page ? 'on' : ''}" title="${esc(sheetName(i))}"><img alt=""><b>${esc(sheetName(i))}</b><small></small></button>`).join('')}<button data-a="sheets" class="manage">${icon('plus')}<small>Kelola</small></button>`;
  updatePercents();
  lens(strip);
  $('.on', strip)?.scrollIntoView({ block: 'nearest' });
  $('#stages .on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  for (let i = 0; i < S.view.pages; i++) {
    const url = await thumb(i);
    const img = $(`[data-page="${i}"] img`, strip);
    if (img) img.src = url;
  }
}
function updatePercents() {
  for (const b of $$('#strip [data-page]')) $('small', b).textContent = `${M.summary(project(), +b.dataset.page).percent}%`;
}
const counters = new WeakMap();
function countUp(node, to, render) {
  const from = counters.get(node) ?? to;
  counters.set(node, to);
  if (from === to) { node.textContent = render(to); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, Math.max(0, (t - t0) / 340)); node.textContent = render(Math.round(from + (to - from) * (1 - (1 - k) ** 3))); if (k < 1 && counters.get(node) === to) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function renderStages() {
  const bar = $('#stages');
  const list = stages();
  bar.innerHTML = `${list.map((s) => `<button data-stage="${esc(s.id)}" class="${s.id === S.stage ? 'on' : ''}" style="--c:${s.color}"><i style="background:${s.color}"></i><span>${esc(s.name)}</span></button>`).join('')}<button data-a="stages" aria-label="Atur tahap" title="Atur tahap">${icon('plus')}${list.length ? '' : '<span>Atur tahap</span>'}</button>`;
}
function renderFloat() {
  const bar = $('#selbar');
  let html = '';
  if (S.period && !S.selected.size && !S.draft.length) html = `<b>Disorot: ${M.shortDate(S.period.from)} – ${M.shortDate(S.period.to)}</b><button class="solid" data-a="period-off">Matikan sorot</button>`;
  else if (S.draft.length && S.tool !== 'skala') html = `<button data-a="draft-cancel">Batal</button><button data-a="draft-back">Hapus titik</button><button class="solid" data-a="draft-ok">${icon('check')}Selesai</button>`;
  else if (editing() && S.selected.size) html = `<b>${S.selected.size} terpilih</b>${S.vertex !== null && S.selected.size === 1 ? '<button class="solid" data-a="vertex-del">Buang sudut</button>' : ''}<button class="soft" data-a="props">Atur</button><button class="soft" data-a="copy">Salin ke lembar</button><button data-a="element-menu" aria-label="Lainnya">${icon('more')}</button><button data-a="delete" class="warn" aria-label="Hapus">${icon('trash')}</button><button data-a="unselect" aria-label="Batal pilih">${icon('close')}</button>`;
  else if (S.selected.size) html = `<b>${S.selected.size} terpilih</b><button class="solid" data-a="date">Beri tanggal</button><button class="soft" data-a="undate">Hapus tgl</button><button data-a="element-menu" aria-label="Lainnya">${icon('more')}</button><button data-a="delete" class="warn" aria-label="Hapus">${icon('trash')}</button><button data-a="unselect" aria-label="Batal pilih">${icon('close')}</button>`;
  const was = !bar.hidden;
  if (!html) {
    if (was && !bar.dataset.leaving) { bar.dataset.leaving = '1'; finished(move(bar, [{ opacity: 1 }, { opacity: 0, translate: '-50% 14px' }], 170, { fill: 'forwards' })).then(() => { if (bar.dataset.leaving) { bar.hidden = true; delete bar.dataset.leaving; bar.getAnimations().forEach((a) => a.cancel()); } }); }
    return;
  }
  delete bar.dataset.leaving;
  bar.getAnimations().forEach((a) => a.cancel());
  bar.innerHTML = html;
  bar.hidden = false;
  if (!was) move(bar, [{ opacity: 0, translate: '-50% 18px', scale: '.85' }, { opacity: 1, translate: '-50% 0', scale: '1' }]);
}
export function refresh() {
  if (!S.file || !$('#work')) return;
  const sum = M.summary(project(), S.page);
  $('#title b').textContent = S.file.name.replace(/\.pkp$/i, '').replaceAll('_', ' · ');
  countUp($('#title small'), sum.percent, (v) => `${v}% · ${sheetName(S.page)}`);
  if (!stages().some((s) => s.id === S.stage)) S.stage = stages()[0]?.id ?? null;
  const ids = new Set(elements().map((e) => e.id));
  for (const id of S.selected) if (!ids.has(id)) S.selected.delete(id);
  renderStages();
  renderDock();
  renderRail();
  renderFloat();
  renderAids();
  updatePercents();
  $('[data-a="redo"]').disabled = !history.canRedo;
  const hint = $('#hint'), text = S.found ? 'Ketuk kotak untuk membuang atau menyertakan. Tarik kotak untuk menambah contoh.' : (editing() ? HINT.ubah : HINT[S.tool] ?? '');
  if (hint.textContent !== text) { hint.textContent = text; hint.hidden = !text; clearTimeout(hintTimer); if (text) { move(hint, [{ opacity: 0, translate: '-50% -6px' }, { opacity: 1, translate: '-50% 0' }]); hintTimer = setTimeout(() => finished(move(hint, [{ opacity: 1 }, { opacity: 0 }], 340)).then(() => { hint.hidden = true; }), 5000); } }
  syncProps();
  P.refresh();
  board.redraw();
  updateCursor();
}

/** Lensa pilihan mengikuti tombolnya setelah layar berubah ukuran atau diputar. */
export function relayout() {
  if (!S.file || !$('#work')) return;
  for (const sel of ['#dock', '#rail', '#strip']) lens($(sel));
}

addEventListener('panelchange', () => { if (S.file) board?.refit(); });

export function layout() {
  const w = $('#work');
  w.classList.toggle('lefty', prefs.leftHand);
  w.classList.toggle('nostrip', !prefs.strip);
  board.state.finger = prefs.finger;
  $('#strip-toggle').setAttribute('aria-pressed', String(prefs.strip));
  lens($('#rail'));
  board.reveal();
}

/* ---------- layar ---------- */
export async function openWork(file, pdf, onHome) {
  home = onHome;
  S.file = file;
  autoPanel = null;
  S.lastMade = null;
  S.page = 0; S.mode = 'progres'; S.tool = 'pilih'; S.selected.clear(); S.until = null; S.period = null; S.filter = null; S.found = null; S.draft = [];
  history.clear();
  await usePdf(pdf);
  const app = $('#app');
  app.innerHTML = `
    <div id="work">
      <canvas id="plan" aria-label="Gambar lembar"></canvas>
      <div id="title" class="glass top"><button data-a="home" aria-label="Kembali">${icon('back')}</button><button data-a="sheets" class="name" title="Kelola lembar"><b></b><small></small></button><button data-a="share" aria-label="Simpan dan bagikan">${icon('share')}</button></div>
      <div id="stages" class="glass top"></div>
      <div id="actions" class="glass top"><button data-a="undo" aria-label="Urungkan">${icon('undo')}</button><button data-a="redo" aria-label="Ulangi">${icon('redo')}</button><button data-a="view" aria-label="Tampilan">${icon('view')}</button><button data-a="settings" aria-label="Pengaturan">${icon('more')}</button></div>
      <div id="strip" class="glass"></div>
      <button id="strip-toggle" class="glass" data-a="strip" aria-label="Tampilkan atau sembunyikan daftar lembar" title="Daftar lembar">${icon('panel')}</button>
      <div id="rail" class="glass"></div>
      <div id="hint" hidden></div>
      <div id="selbar" class="glass" hidden></div>
      <div id="dock" class="glass"><div class="lens"></div>${MODES.map(([id, label]) => `<button data-mode="${id}">${icon(id)}<span>${label}</span></button>`).join('')}</div>
      <div id="aids" class="glass" hidden>${[['cross', 'silang', 'Garis silang'], ['loupe', 'lup', 'Kaca pembesar'], ['ortho', 'ortho', 'Ortho: datar atau tegak (F8)'], ['polar', 'polar', 'Polar: tiap 15 derajat (F10)']].map(([k, i, t]) => `<button data-aid="${k}" aria-pressed="false" aria-label="${t}" title="${t}">${icon(i)}</button>`).join('')}</div>
      <div id="zoom" class="glass"><button data-a="zout" aria-label="Perkecil">−</button><button data-a="zfit" aria-label="Pas layar">100%</button><button data-a="zin" aria-label="Perbesar">+</button></div>
    </div>`;
  board = createBoard($('#plan'), handlers);
  $('#work').addEventListener('click', onClick);
  layout();
  S.stage = null;
  await showPage(0);
  if (!history.canUndo && !elements().length) S.mode = 'petakan', (S.tool = 'titik');
  renderRail(true);
  refresh();
  for (const [sel, from] of [['#title', '-24px 0'], ['#stages', '0 -24px'], ['#actions', '24px 0'], ['#strip', '-24px 0'], ['#dock', '0 24px'], ['#zoom', '24px 0']]) {
    move($(sel), [{ opacity: 0, translate: from }, { opacity: 1, translate: getComputedStyle($(sel)).translate === 'none' ? '0 0' : getComputedStyle($(sel)).translate }], 340, { fill: 'none' });
  }
  if (!stages().length) P.stagesDialog(true);
  else remindBackup();
}

/** Data hanya ada di perangkat: ingatkan bila sudah lama tidak disimpan sebagai .pkp. */
function remindBackup() {
  const f = S.file;
  if (!f.summary?.elements || (f.changedAt ?? 0) <= (f.backupAt ?? 0)) return;
  const days = Math.floor((Date.now() - (f.backupAt ?? f.createdAt ?? Date.now())) / 864e5);
  if (days >= 3) toast(f.backupAt ? `Belum dicadangkan ${days} hari` : 'Berkas ini belum pernah dicadangkan', { label: 'Simpan .pkp', run: P.savePkp });
}

export async function closeWork() {
  closeAll();
  closeWheel();
  if (saveTimer || pdfDirty) await flush();
  stopWorker();
  board?.setPage(null, [1, 1]);
  await S.view?.close();
  S.view = null; S.file = null; S.pdf = null; board = null; bitmap = null;
  bitmaps.clear();
}

async function onClick(e) {
  const b = e.target.closest('button');
  if (!b || !S.file) return;
  const d = b.dataset;
  if (d.aid) return toggleAid(d.aid);
  if (d.mode) return setMode(d.mode);
  if (d.tool) return setTool(d.tool);
  if (d.stage) { S.stage = d.stage; move(b, [{ transform: 'scale(.9)' }, { transform: 'scale(1.06)' }, { transform: 'none' }]); renderStages(); if (S.tool !== 'kuas' && !S.selected.size) setMode('progres', 'kuas'); return; }
  if (d.page !== undefined) { const to = +d.page; if (to !== S.page) await showPage(to, Math.sign(to - S.page)); return; }
  const actions = {
    home: async () => { await finished(move($('#work'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], 170, { fill: 'forwards' })); await closeWork(); home(); },
    sheets: P.sheetsDialog, share: P.recap, stages: () => P.stagesDialog(false), view: P.viewPanel, settings: P.settings,
    undo, redo,
    strip: () => { prefs.strip = !prefs.strip; savePrefs(); layout(); },
    zin: () => board.zoomBy(1.5), zout: () => board.zoomBy(1 / 1.5), zfit: () => board.fit(),
    date: P.dateDialog,
    copy: P.copyDialog,
    props: () => { closeAll(); P.elementsPanel({ quiet: true }); },
    'period-off': () => { S.period = null; refresh(); },
    'vertex-del': removeSelectedVertex,
    undate: P.undateDialog,
    'element-menu': P.elementMenu,
    delete: () => deleteSelected(),
    unselect: () => { S.selected.clear(); refresh(); },
    'draft-ok': finishDraft,
    'draft-back': () => { S.draft.pop(); S.cursor = null; refresh(); },
    'draft-cancel': () => { S.draft = []; S.cursor = null; refresh(); },
  };
  actions[d.a]?.();
}
/** Ubah rupa elemen terpilih (tebal garis, ukuran titik, bentuk titik). `record` false = pratinjau saat digeser. */
export function restyle(patch, record = true) {
  const apply = () => {
    const real = selected().map((e) => M.realize(project(), e));
    for (const el of real) {
      if (patch.w !== undefined && el.shape === 'line') el.w = patch.w;
      if (patch.r !== undefined && el.shape === 'point') el.r = patch.r;
      if (patch.style && el.shape === 'point') el.style = patch.style;
    }
    S.selected = new Set(real.map((e) => e.id));
  };
  if (record) { if (patch.w !== undefined) { prefs.lineW = patch.w; savePrefs(); } change(apply); } else { apply(); board.redraw(); }
}
export function deleteSelected() {
  const list = selected();
  if (!list.length) return;
  S.selected.clear();
  change(() => M.removeElements(project(), list));
  toast(`${list.length} elemen dihapus`, { label: 'Urungkan', run: undo });
}

export function keyUp(e) {
  if (e.key === 'Shift' && shift) { shift = false; board?.retrack(); }
  if (e.key === ' ' && board) { board.state.space = false; $('#plan').style.cursor = $('#plan').dataset.cursor ?? ''; }
}
export function key(e) {
  if (!S.file) return;
  const k = e.key.toLowerCase();
  if (e.target.closest?.('input, textarea, select')) { if (k === 'escape') e.target.blur(); return; }
  if (k === 'shift') { shift = true; board.retrack(); return; }
  if (k === 'f8' || k === 'f10') { e.preventDefault(); return toggleAid(k === 'f8' ? 'ortho' : 'polar'); }
  // tahan spasi: geser gambar tanpa ganti alat
  if (k === ' ') { if (e.target.closest?.('button')) return; e.preventDefault(); board.state.space = true; $('#plan').style.cursor = 'grab'; return; }
  if ((e.ctrlKey || e.metaKey) && k === 'a' && !dialogOpen()) { e.preventDefault(); if (S.tool !== 'pilih') selectTool(); S.selected = new Set(elements().map((x) => x.id)); return refresh(); }
  if (k.startsWith('arrow') && editing() && S.selected.size && !dialogOpen()) {
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) / board.view.k;
    const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
    return change(() => { const real = selected().map((x) => M.realize(project(), x)); for (const el of real) M.moveElement(el, dx, dy); S.selected = new Set(real.map((x) => x.id)); });
  }
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); return redo(); }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); return P.savePkp(); }
  if (e.ctrlKey || e.metaKey) return;
  if (k === 'escape') { e.preventDefault(); return escape(); }
  if (dialogOpen()) return;
  if (k === 'enter') { e.preventDefault(); if (S.draft.length) finishDraft(); else if (S.selected.size) P.dateDialog(); }
  else if ((k === 'delete' || k === 'backspace') && S.draft.length) { S.draft.pop(); refresh(); }
  else if (k === 'delete') { if (editing() && S.vertex !== null && S.selected.size === 1) removeSelectedVertex(); else deleteSelected(); }
  else if (k === 'pageup') showPage(S.page - 1, -1);
  else if (k === 'pagedown') showPage(S.page + 1, 1);
  else if (KEYS[k]) setMode(...KEYS[k]);
}
