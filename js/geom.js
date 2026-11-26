// Geometri dasar. Murni. Titik = [x, y].

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const pathLength = (pts, closed = false) => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return closed && pts.length > 2 ? len + dist(pts.at(-1), pts[0]) : len;
};

export function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function pointInPoly([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Apakah titik p mengenai elemen (toleransi dalam piksel gambar). */
export function hitElement(el, p, tol) {
  if (el.shape === 'point') return dist(p, el.pts[0]) <= (el.r ?? 9) + tol;
  if (el.shape === 'poly' && pointInPoly(p, el.pts)) return true;
  const n = el.pts.length, last = el.shape === 'poly' ? n : n - 1;
  for (let i = 0; i < last; i++) if (segDist(p, el.pts[i], el.pts[(i + 1) % n]) <= tol) return true;
  return false;
}

/** Elemen teratas yang kena; titik dan garis menang atas area yang menaunginya. */
export function pickElement(elements, p, tol) {
  const hits = elements.filter((el) => hitElement(el, p, tol));
  return hits.findLast((el) => el.shape !== 'poly') ?? hits.sort((a, b) => polyArea(a.pts) - polyArea(b.pts))[0] ?? null;
}

export function center(el) {
  if (el.shape === 'line') {
    let half = pathLength(el.pts) / 2;
    for (let i = 1; i < el.pts.length; i++) {
      const d = dist(el.pts[i - 1], el.pts[i]);
      if (d >= half && d > 0) {
        const t = half / d;
        return [el.pts[i - 1][0] + (el.pts[i][0] - el.pts[i - 1][0]) * t, el.pts[i - 1][1] + (el.pts[i][1] - el.pts[i - 1][1]) * t];
      }
      half -= d;
    }
  }
  const n = el.pts.length;
  return [el.pts.reduce((a, p) => a + p[0], 0) / n, el.pts.reduce((a, p) => a + p[1], 0) / n];
}

/** Buang titik yang menyimpang kurang dari `tol` (Douglas-Peucker). */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts.at(-1));
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tol) return [pts[0], pts.at(-1)];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

/** Kunci arah ke kelipatan `step` derajat dari titik sebelumnya. */
export function lockAngle(from, to, step = 45) {
  const len = dist(from, to), s = (step * Math.PI) / 180;
  const a = Math.round(Math.atan2(to[1] - from[1], to[0] - from[0]) / s) * s;
  return [from[0] + len * Math.cos(a), from[1] + len * Math.sin(a)];
}

/** Urutan baca (atas ke bawah, kiri ke kanan) dengan toleransi baris, untuk penomoran otomatis. */
export function readingOrder(elements, rowTol) {
  const items = elements.map((el) => ({ el, c: center(el) })).sort((a, b) => a.c[1] - b.c[1]);
  const rows = [];
  for (const it of items) {
    const row = rows.at(-1);
    if (row && it.c[1] - row[0].c[1] <= rowTol) row.push(it); else rows.push([it]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.c[0] - b.c[0])).map((it) => it.el);
}

/** Garis sejajar sejauh d (positif = satu sisi). Sudut disambung miter terbatas. */
export function offsetPolyline(pts, d) {
  const normal = (a, b) => { const l = dist(a, b) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
  return pts.map((p, i) => {
    const n1 = i ? normal(pts[i - 1], p) : normal(p, pts[1]);
    const n2 = i < pts.length - 1 ? normal(p, pts[i + 1]) : n1;
    let x = n1[0] + n2[0], y = n1[1] + n2[1];
    const k = d / Math.max(0.4, (x * n1[0] + y * n1[1]));
    return [p[0] + x * k, p[1] + y * k];
  });
}
