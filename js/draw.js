// Menggambar penanda, coretan, dan legenda di kanvas. Koordinat = titik halaman PDF.
import { lastStage, percent, shortDate, dateColor } from './model.js';
import { center } from './geom.js';

const IDLE = '#c2410c';
export const STAMPS = ['DISETUJUI', 'DITOLAK', 'REVISI', 'UNTUK INFORMASI', 'SESUAI LAPANGAN', 'PERIKSA ULANG'];

const path = (g, pts, close) => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
};

export function colorOf(project, el, stages, o) {
  const st = lastStage(stages, el, o.until);
  if (!st) return null;
  return o.mode === 'tanggal' ? dateColor(project, el.page, el.st[st.id]) : st.color;
}

/** px = satu piksel layar dalam satuan halaman (supaya tebal garis dan huruf tetap terbaca di zoom apa pun). */
export function drawMarks(g, project, els, stages, o) {
  const px = o.px;
  for (const el of els) {
    const color = colorOf(project, el, stages, o);
    const sel = o.selected?.has(el.id);
    const pop = o.pop?.get(el.id) ?? 0; // denyut sesaat sesudah ditandai (0..1)
    g.save();
    const outside = o.period && !Object.values(el.st ?? {}).some((d) => d >= o.period.from && d <= o.period.to);
    g.globalAlpha = outside || (o.filter && !el.st?.[o.filter]) ? 0.15 : 1;
    g.lineJoin = g.lineCap = 'round';
    const [cx, cy] = center(el);
    if (pop) { const k = 1 + pop * 0.35; g.translate(cx, cy); g.scale(k, k); g.translate(-cx, -cy); }
    const r = el.r ?? 9;
    const trace = () => {
      if (el.shape !== 'point') return path(g, el.pts, el.shape === 'poly');
      g.beginPath();
      if (el.style === 'bulat') g.arc(el.pts[0][0], el.pts[0][1], r, 0, Math.PI * 2);
      else g.rect(el.pts[0][0] - r, el.pts[0][1] - r, r * 2, r * 2);
    };
    const width = el.shape === 'line' ? el.w ?? 6 * px : 2.5 * px; // tanpa w = otomatis: tebalnya tetap di layar pada zoom berapa pun
    trace();
    if (sel) {
      g.strokeStyle = '#1c1c1e'; g.lineWidth = width + 8 * px; g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = width + 4 * px; g.stroke();
    }
    const alpha = o.alpha ?? 0.35;
    if (el.shape !== 'line') {
      g.save();
      g.globalAlpha *= color ? alpha : Math.min(alpha, 0.2);
      g.fillStyle = color ?? '#ff8d28';
      g.fill();
      g.restore();
    }
    g.save();
    // garis elemen tidak punya isian: ia sendiri yang dibuat tembus pandang, tetapi tidak sampai hilang
    if (el.shape === 'line' && color) g.globalAlpha *= Math.max(0.3, Math.min(1, alpha + 0.3));
    g.setLineDash(color ? [] : [7 * px, 5 * px]);
    g.strokeStyle = color ?? IDLE;
    g.lineWidth = width;
    g.stroke();
    g.restore();
    if (color) {
      const last = lastStage(stages, el, o.until);
      const text = [o.names === false ? '' : el.label, o.dates ? shortDate(el.st[last.id]) : '', o.pct ? `${percent(stages, el, o.until)}%` : ''].filter(Boolean).join(' · ');
      const top = o.labelTop && el.shape === 'poly' ? Math.min(...el.pts.map((q) => q[1])) + 11 * px : cy; // tepi atas area agar nama ruangan di gambar tetap terbaca
      if (text) label(g, text, el.shape === 'point' ? cx + r + 3 * px : cx, el.shape === 'point' ? cy - r : el.shape === 'line' ? cy - 11 * px : top, px, el.shape === 'point' ? 'left' : 'center');
    } else if (el.label && o.names !== false) label(g, el.label, cx, cy, px, 'center');
    g.restore();
  }
}

function label(g, text, x, y, px, align) {
  g.font = `700 ${12 * px}px Inter, -apple-system, system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineWidth = 3.5 * px;
  g.strokeStyle = '#fff';
  g.strokeText(text, x, y);
  g.fillStyle = '#1c1c1e';
  g.fillText(text, x, y);
}

/** Coretan: pena (peka tekanan), stabilo, awan revisi, catatan, stempel. */
export function drawAnnotation(g, a) {
  g.save();
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = g.fillStyle = a.color ?? '#ff383c';
  if (a.type === 'pen') {
    const size = a.size ?? 2, pr = a.pr, pts = a.pts;
    g.globalAlpha = a.op ?? (a.brush === 'stabilo' ? 0.4 : a.brush === 'pensil' ? 0.75 : 1);
    if (a.brush === 'stabilo' || !pr || pts.length < 3) {
      path(g, pts, false);
      g.lineWidth = size;
      g.stroke();
    } else {
      let from = pts[0];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i], next = pts[i + 1];
        const to = next ? [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2] : p;
        g.lineWidth = size * (0.45 + 1.1 * (pr[i] ?? 0.5));
        g.beginPath();
        g.moveTo(from[0], from[1]);
        g.quadraticCurveTo(p[0], p[1], to[0], to[1]);
        g.stroke();
        from = to;
      }
    }
  } else if (a.type === 'cloud') {
    cloud(g, a.pts);
    g.lineWidth = a.size ?? 2;
    g.stroke();
  } else if (a.type === 'stamp') {
    const size = a.size ?? 20, [x, y] = a.pts[0];
    g.font = `800 ${size}px Inter, system-ui, sans-serif`;
    g.textBaseline = 'middle';
    const w = g.measureText(a.text ?? '').width + 16;
    g.lineWidth = Math.max(1.5, size / 9);
    g.strokeRect(x, y, w, size * 1.25 + 10);
    g.fillText(a.text ?? '', x + 8, y + (size * 1.25 + 10) / 2);
  } else if (a.type === 'note') {
    const [x, y] = a.pts[0];
    const lines = String(a.text ?? '').split('\n');
    g.font = '13px Inter, system-ui, sans-serif';
    const w = Math.max(70, ...lines.map((l) => g.measureText(l).width + 16));
    g.fillStyle = '#ffe566';
    g.fillRect(x, y, w, lines.length * 17 + 12);
    g.fillStyle = '#1c1c1e';
    g.textBaseline = 'top';
    lines.forEach((l, i) => g.fillText(l, x + 8, y + 8 + i * 17));
  }
  g.restore();
}

function cloud(g, pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const l = Math.min(...xs), t = Math.min(...ys), r = Math.max(...xs), b = Math.max(...ys);
  const R = 9;
  g.beginPath();
  const edge = (ax, ay, bx, by, out) => {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / (2 * R)));
    for (let k = 0; k < n; k++) {
      const mx = ax + ((bx - ax) * (k + 0.5)) / n, my = ay + ((by - ay) * (k + 0.5)) / n;
      g.arc(mx, my, len / n / 2, out + Math.PI, out + Math.PI * 2);
    }
  };
  edge(l, t, r, t, 0);
  edge(r, t, r, b, Math.PI / 2);
  edge(r, b, l, b, Math.PI);
  edge(l, b, l, t, -Math.PI / 2);
  g.closePath();
}

/** Legenda di gambar. Mengembalikan kotaknya { x, y, w, h }. */
export function drawLegend(g, project, page, sum, o) {
  const legend = project.progress.legend;
  if (legend.on === false || !sum.stages.length) return null;
  const s = (legend.scale ?? 1) * o.unit;
  const rows = o.mode === 'tanggal'
    ? [...new Set(o.elements.map((e) => e.date).filter(Boolean))].sort().map((d) => [dateColor(project, page, d), `${d.split('-').reverse().join('-')} (${o.elements.filter((e) => e.date === d).length})`])
    : sum.stages.map((st) => [st.color, `${st.name} (${o.elements.filter((e) => lastStage(sum.stages, e, o.until)?.id === st.id).length})`]);
  rows.push([null, `Belum bertahap (${sum.pending})`]);
  let [x, y] = legend.pos?.[page] ?? [10 * o.unit, 10 * o.unit];
  g.save();
  g.font = `700 ${12 * s}px Inter, system-ui, sans-serif`;
  const title = project.progress.sheets[page]?.work ?? 'Progres';
  const w = Math.max(g.measureText(title).width, ...rows.map((r) => g.measureText(r[1]).width + 20 * s)) + 20 * s;
  const h = (rows.length * 18 + 30) * s;
  if (o.page) { x = Math.max(0, Math.min(x, o.page[0] - w)); y = Math.max(0, Math.min(y, o.page[1] - h)); } // tetap di dalam lembar
  g.fillStyle = '#fffffff2';
  g.strokeStyle = '#c7c7cc';
  g.lineWidth = s;
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, 8 * s); else g.rect(x, y, w, h);
  g.fill();
  g.stroke();
  g.textBaseline = 'middle';
  g.fillStyle = '#1c1c1e';
  g.fillText(title, x + 10 * s, y + 14 * s);
  g.font = `500 ${11 * s}px Inter, system-ui, sans-serif`;
  rows.forEach(([color, text], i) => {
    const yy = y + (32 + i * 18) * s;
    g.fillStyle = color ?? '#ff8d2833';
    g.fillRect(x + 10 * s, yy - 6 * s, 12 * s, 12 * s);
    if (!color) { g.strokeStyle = IDLE; g.strokeRect(x + 10 * s, yy - 6 * s, 12 * s, 12 * s); }
    g.fillStyle = '#1c1c1e';
    g.fillText(text, x + 28 * s, yy);
  });
  if (o.handle) {
    g.beginPath();
    g.arc(x + w, y + h, 7 * o.handle, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = 2 * o.handle;
    g.strokeStyle = '#1c1c1e';
    g.stroke();
  }
  g.restore();
  return { x, y, w, h };
}
