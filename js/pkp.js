// Berkas proyek .pkp (kompatibel dengan PDFKill desktop). Ditulis sendiri dari spesifikasi di KONSEP.md. Murni.
// Susunan: "PDFKILLP" · 1 byte versi wadah · 4 byte panjang JSON (little-endian) · JSON UTF-8 · byte PDF.

const MAGIC = [...'PDFKILLP'].map((c) => c.charCodeAt(0));
const HEAD = MAGIC.length + 5;
export const FORMAT = 'pdfkill-project';

export function encodePkp(project, pdf) {
  const json = new TextEncoder().encode(JSON.stringify(project));
  const out = new Uint8Array(HEAD + json.length + pdf.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = 1;
  new DataView(out.buffer).setUint32(MAGIC.length + 1, json.length, true);
  out.set(json, HEAD);
  out.set(pdf, HEAD + json.length);
  return out;
}

export function decodePkp(bytes) {
  const bad = (m) => new Error(m);
  if (!bytes || bytes.length < HEAD || !MAGIC.every((b, i) => bytes[i] === b)) throw bad('Ini bukan berkas proyek .pkp.');
  if (bytes[MAGIC.length] > 1) throw bad('Berkas dibuat oleh versi yang lebih baru.');
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(MAGIC.length + 1, true);
  if (HEAD + len >= bytes.length) throw bad('Berkas proyek rusak atau terpotong.');
  let project;
  try { project = JSON.parse(new TextDecoder().decode(bytes.subarray(HEAD, HEAD + len))); } catch { throw bad('Data proyek tidak terbaca.'); }
  return { project: normalize(project), pdf: bytes.slice(HEAD + len) };
}

export const emptyProject = (name, pages) => normalize({ format: FORMAT, version: 5, pdf: { name, pages }, takeoff: {} });

const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isPage = (p) => Number.isInteger(p) && p >= 0;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const MIN = { point: 1, line: 2, poly: 3 };

/** Lengkapi bidang yang wajib ada dan periksa data dari luar. Bidang yang tidak dikenal dibiarkan utuh. */
export function normalize(d) {
  const bad = (m) => new Error(m);
  if (d?.format !== FORMAT) throw bad('Ini bukan berkas proyek PDFKill.');
  if (typeof d.version !== 'number' || d.version > 6) throw bad('Berkas dibuat oleh versi yang lebih baru.');
  const t = (d.takeoff ??= {});
  for (const k of ['items', 'measures', 'dimensions', 'legends', 'regions', 'groups']) t[k] ??= [];
  for (const k of ['scales', 'axis', 'verified', 'raster']) t[k] ??= {};
  const a = (d.annotations ??= {});
  a.items ??= [];
  a.show ??= true;
  const p = (d.progress ??= {});
  p.items ??= [];
  p.sheets ??= {};
  p.show ??= true;
  p.legend ??= { on: true, scale: 1, pos: {} };
  d.pdf ??= {};
  if (![t.items, t.measures, a.items, p.items].every(Array.isArray)) throw bad('Isi proyek tidak lengkap.');
  for (const m of p.items) {
    if (!(m && Number.isInteger(m.id) && isPage(m.page) && m.shape in MIN && Array.isArray(m.pts) && m.pts.length >= MIN[m.shape] && m.pts.every(isPt))) throw bad('Ada penanda progres yang rusak.');
    if (m.date != null && !ISO.test(m.date)) throw bad('Ada tanggal penanda yang rusak.');
    if (m.st != null && !Object.values(m.st).every((v) => ISO.test(v))) throw bad('Ada tanggal tahap yang rusak.');
  }
  for (const s of Object.values(p.sheets)) {
    if (!(s && typeof s.work === 'string' && Array.isArray(s.stages) && s.stages.every((x) => typeof x.id === 'string' && typeof x.name === 'string' && HEX.test(x.color)))) throw bad('Ada pengaturan lembar yang rusak.');
  }
  for (const n of a.items) if (!(n && isPage(n.page) && Array.isArray(n.pts) && n.pts.every(isPt) && (n.color == null || HEX.test(n.color)))) throw bad('Ada coretan yang rusak.');
  for (const m of t.measures) if (!(m && isPage(m.page) && Array.isArray(m.pts) && m.pts.every(isPt))) throw bad('Ada titik takeoff yang rusak.');
  return d;
}

export const nextId = (list) => list.reduce((a, x) => Math.max(a, x.id || 0), 0) + 1;

/** Siapkan JSON untuk disimpan: nomor berikutnya dan versi format. */
export function finalize(project, pdfName, pages, sha256) {
  const d = structuredClone(project);
  d.version = Object.keys(d.progress.sheets).length ? 6 : 5;
  d.savedAt = new Date().toISOString();
  d.app = d.app ?? 'tapak';
  d.pdf = { ...d.pdf, name: pdfName, pages, ...(sha256 ? { sha256 } : {}) };
  d.progress.nextId = nextId(d.progress.items);
  d.annotations.nextId = nextId(d.annotations.items);
  const t = d.takeoff;
  t.nextId = Math.max(nextId(t.items), nextId(t.measures), nextId(t.dimensions), nextId(t.legends), nextId(t.regions), nextId(t.groups), t.nextId ?? 1);
  return d;
}

/**
 * Pindahkan semua data per halaman sesudah halaman diubah.
 * `order` = daftar halaman baru; tiap isi: nomor halaman lama (boleh berulang = duplikat) atau null (halaman baru).
 * `copyData`: halaman duplikat ikut membawa data ('all'), tahap saja ('stages'), atau gambar saja ('none').
 */
export function remapPages(project, order, copyData = 'all') {
  const d = structuredClone(project);
  const seen = new Set();
  const plan = order.map((old, to) => {
    const copy = old != null && seen.has(old);
    if (old != null) seen.add(old);
    return { old, to, copy };
  });
  const listed = (list, kind) => {
    let id = nextId(list);
    const out = [];
    for (const { old, to, copy } of plan) {
      if (old == null || (copy && copyData !== 'all')) continue;
      for (const x of list.filter((v) => v.page === old)) out.push({ ...structuredClone(x), page: to, ...(copy && kind ? { id: id++ } : {}) });
    }
    return out;
  };
  const keyed = (obj, stagesToo) => {
    const out = {};
    for (const { old, to, copy } of plan) {
      if (old == null || obj?.[old] === undefined) continue;
      if (copy && copyData !== 'all' && !(stagesToo && copyData === 'stages')) continue;
      out[to] = structuredClone(obj[old]);
    }
    return out;
  };
  d.progress.items = listed(d.progress.items, true);
  d.progress.sheets = keyed(d.progress.sheets, true);
  d.progress.legend = { ...d.progress.legend, pos: keyed(d.progress.legend.pos) };
  d.annotations.items = listed(d.annotations.items, true);
  const t = d.takeoff;
  for (const k of ['measures', 'dimensions', 'legends', 'regions']) t[k] = listed(t[k], true);
  for (const k of ['scales', 'axis', 'verified', 'raster']) t[k] = keyed(t[k], k === 'scales');
  if (t.coord?.pages) t.coord.pages = keyed(t.coord.pages);
  return d;
}

/** Putar data satu halaman 90 derajat searah jarum jam. `oldHeight` = tinggi halaman sebelum diputar (titik). */
export function rotatePage(project, page, oldHeight) {
  const d = structuredClone(project);
  const turn = ([x, y]) => [oldHeight - y, x];
  const t = d.takeoff;
  for (const list of [d.progress.items, d.annotations.items, t.measures, t.dimensions, t.legends, t.regions]) {
    for (const item of list) {
      if (item.page !== page) continue;
      if (Array.isArray(item.pts)) item.pts = item.pts.map(turn);
      if (Array.isArray(item.box) && item.box.length === 2) item.box = [item.box[1], item.box[0]];
    }
  }
  if (t.axis[page]) t.axis[page] = { x: t.axis[page].y, y: t.axis[page].x };
  delete t.raster[page];
  delete d.progress.legend.pos[page];
  return d;
}

/** Pindahkan semua titik pada satu halaman dengan fungsi `map` (pelurusan lembar). */
export function transformPage(project, page, map) {
  const d = structuredClone(project);
  const round = (p) => map(p).map((v) => Math.round(v * 100) / 100);
  const t = d.takeoff;
  for (const list of [d.progress.items, d.annotations.items, t.measures, t.dimensions, t.legends, t.regions]) {
    for (const item of list) if (item.page === page && Array.isArray(item.pts)) item.pts = item.pts.map(round);
  }
  delete t.raster[page];
  delete d.progress.legend.pos[page];
  return d;
}
