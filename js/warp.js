// Koreksi perspektif foto: empat sudut kertas dipetakan menjadi persegi. Murni.

function solve(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-9) throw new Error('Keempat sudut tidak boleh segaris');
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

/** Matriks yang memetakan titik `from` ke `to` (masing-masing 4 titik). */
export function homography(from, to) {
  const A = [], b = [];
  from.forEach(([x, y], i) => {
    const [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  });
  return [...solve(A, b), 1];
}

export const apply = (h, x, y) => {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
};

/** Ukuran hasil dari panjang sisi: sudut urut kiri atas, kanan atas, kanan bawah, kiri bawah. */
export function outputSize(c, max = 4000) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const w = Math.max(d(c[0], c[1]), d(c[3], c[2])), h = Math.max(d(c[0], c[3]), d(c[1], c[2]));
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

/** src = { data (RGBA), width, height }; corners = 4 titik piksel sumber. */
export function warp(src, corners, out) {
  const { width: W, height: H, data } = out;
  const h = homography([[0, 0], [W, 0], [W, H], [0, H]], corners);
  const at = (i, j, c) => src.data[(Math.max(0, Math.min(src.height - 1, j)) * src.width + Math.max(0, Math.min(src.width - 1, i))) * 4 + c];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [sx, sy] = apply(h, x + 0.5, y + 0.5);
      const x0 = Math.floor(sx - 0.5), y0 = Math.floor(sy - 0.5), fx = sx - 0.5 - x0, fy = sy - 0.5 - y0;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = at(x0, y0, c) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, c) * fx * (1 - fy) + at(x0, y0 + 1, c) * (1 - fx) * fy + at(x0 + 1, y0 + 1, c) * fx * fy;
      data[o + 3] = 255;
    }
  }
  return out;
}

/** Peta titik: putar sebesar derajat (searah jarum jam di layar) terhadap (cx, cy). */
export function rotation(degrees, cx, cy) {
  const a = (degrees * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return ([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

/**
 * Kemiringan gambar dalam derajat (positif = miring searah jarum jam), dari data RGBA.
 * Sudut yang benar membuat piksel gelap menumpuk di sedikit baris dan kolom.
 */
export function skewAngle(rgba, w, h, range = 15) {
  const all = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11 < 128) all.push(x, y);
  }
  const n = all.length / 2;
  if (n < 50 || n > w * h * 0.5) return 0;
  const step = Math.max(1, Math.floor(n / 24000));
  const size = w + h;
  const rows = new Float64Array(size * 2), cols = new Float64Array(size * 2);
  const score = (deg) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    rows.fill(0);
    cols.fill(0);
    for (let i = 0; i < n; i += step) {
      const x = all[i * 2], y = all[i * 2 + 1];
      rows[Math.round(y * c - x * s) + size]++;
      cols[Math.round(x * c + y * s) + size]++;
    }
    let sum = 0;
    for (let i = 0; i < rows.length; i++) sum += rows[i] * rows[i] + cols[i] * cols[i];
    return sum;
  };
  let best = 0, top = score(0);
  const sweep = (from, to, by) => { for (let d = from; d <= to + 1e-9; d += by) { const v = score(d); if (v > top * 1.002) { top = v; best = d; } } };
  sweep(-range, range, 0.5);
  sweep(best - 0.5, best + 0.5, 0.05);
  return Math.round(best * 100) / 100;
}
