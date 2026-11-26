// Kursor mouse / pen-melayang per alat, supaya alat yang aktif terbaca tanpa melihat rel.
import { icon } from './ui.js';

const pathOf = (name) => /d="([^"]*)"/.exec(icon(name))?.[1] ?? '';
const url = (svg, x, y, fallback) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;
const wrap = (size, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
// garis putih di bawah garis gelap supaya terlihat di latar apa pun
const halo = (d, extra = '') => `<path d="${d}" stroke="#fff" stroke-width="4" ${extra}/><path d="${d}" stroke="#1c1c1e" stroke-width="1.8" ${extra}/>`;
const badge = (name, x, y, k = 0.75) => `<g transform="translate(${x} ${y}) scale(${k})">${halo(pathOf(name))}</g>`;
const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

/** Bidik silang dengan lambang alat di kanan bawah. Titik aktif = pusat silang. */
const aim = (name) => memo(`aim:${name}`, () => url(wrap(32, `${halo('M10 1v6M10 13v6M1 10h6M13 10h6')}<circle cx="10" cy="10" r="1.2" fill="#1c1c1e"/>${badge(name, 13, 13)}`), 10, 10, 'crosshair'));
/** Lambang alat dengan ujung di kiri bawah (pena, kuas). */
const tip = (name, x, y) => memo(`tip:${name}`, () => url(wrap(28, badge(name, 2, 2, 1)), x, y, 'crosshair'));
const ring = (d, color, dashed) => memo(`ring:${d}:${color}:${dashed}`, () => {
  const size = Math.ceil(d) + 6, c = size / 2;
  return url(wrap(size, `<circle cx="${c}" cy="${c}" r="${d / 2}" stroke="#fff" stroke-width="3"/><circle cx="${c}" cy="${c}" r="${d / 2}" stroke="${color}" stroke-width="1.5" ${dashed ? 'stroke-dasharray="3 3"' : `fill="${color}55"`}/>`), Math.round(c), Math.round(c), 'crosshair');
});

/**
 * @param o { mode, tool, brush, color, size (px layar), over: 'legend' | 'size' | 'element' | null, found }
 */
export function cursorFor(o) {
  if (o.over === 'size') return 'nwse-resize';
  if (o.over === 'legend') return 'move';
  if (o.found) return o.over === 'element' ? 'pointer' : aim('cari');
  const { mode, tool } = o;
  if (mode === 'gambar') {
    if (tool === 'hapus') return ring(18, '#1c1c1e', true);
    if (tool === 'catatan') return aim('catatan');
    if (tool === 'stempel') return aim('stempel');
    if (tool === 'awan') return aim('awan');
    if (['garis', 'panah', 'kotakgambar'].includes(o.brush)) return aim({ garis: 'garis', panah: 'panah', kotakgambar: 'kotak' }[o.brush]);
    // pena: bulatan sebesar dan sewarna goresan
    return ring(Math.max(5, Math.min(56, Math.round(o.size))), o.color, false);
  }
  if (tool === 'pilih') return o.over === 'element' ? 'pointer' : 'default';
  if (tool === 'kuas') return tip('kuas', 6, 24);
  if (tool === 'bebas') return tip('pulpen', 4, 24);
  const names = { titik: 'titik', garis: 'garis', area: 'area', kotak: 'kotak', bulat: 'bulat', cari: 'cari', ruang: 'ruang', skala: 'skala' };
  return names[tool] ? aim(names[tool]) : 'grab';
}
