// Alat otomatis pada citra denah. Murni (array piksel masuk, koordinat keluar); dijalankan di worker.
import { simplify } from './geom.js';

export function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
  return g;
}

/** Ambang Otsu. */
export function otsu(gray) {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sumB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = gray.length - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

/** 1 = garis (gelap), 0 = latar. */
export function binarize(gray) {
  const t = otsu(gray);
  const b = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) b[i] = gray[i] <= t ? 1 : 0;
  return b;
}

// Pelebaran kotak (separable) sejauh r piksel.
function dilate(src, w, h, r) {
  if (r <= 0) return src;
  const pass = (inp, len, lines, at) => {
    const out = new Uint8Array(inp.length);
    for (let l = 0; l < lines; l++) {
      let reach = -1;
      for (let i = 0; i < len; i++) if (inp[at(l, i)]) { for (let k = Math.max(reach + 1, i - r); k <= Math.min(len - 1, i + r); k++) out[at(l, k)] = 1; reach = Math.min(len - 1, i + r); }
    }
    return out;
  };
  return pass(pass(src, w, h, (y, x) => y * w + x), h, w, (x, y) => y * w + x);
}

function flood(wall, w, h, start) {
  const mask = new Uint8Array(w * h);
  const stack = [start];
  mask[start] = 1;
  let edge = false, count = 0;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    count++;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !mask[j] && !wall[j]) { mask[j] = 1; stack.push(j); }
    }
  }
  return { mask, edge, count };
}

// Telusur batas luar (Moore), searah jarum jam, dari piksel teratas-terkiri.
function trace(mask, w, h) {
  const start = mask.indexOf(1);
  if (start < 0) return [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const sx = start % w, sy = (start / w) | 0;
  const out = [[sx, sy]];
  let x = sx, y = sy, from = 6, first = -1;
  for (let step = 0; step < w * h * 4; step++) {
    let d = -1;
    for (let k = 1; k <= 8; k++) {
      const c = (from + k) % 8;
      if (on(x + dirs[c][0], y + dirs[c][1])) { d = c; break; }
    }
    if (d < 0) break;
    if (x === sx && y === sy) { if (first < 0) first = d; else if (d === first) break; }
    x += dirs[d][0];
    y += dirs[d][1];
    out.push([x, y]);
    from = (d + 4) % 8;
  }
  return out;
}

/**
 * Area otomatis: isi ruang di sekitar `seed` sampai garis. `gap` = celah (mis. bukaan pintu kecil) yang dianggap tertutup.
 * Return { pts } atau { error }.
 */
export function findRoom(bin, w, h, seed, gap = 2) {
  const x = Math.round(seed[0]), y = Math.round(seed[1]);
  if (x < 0 || y < 0 || x >= w || y >= h) return { error: 'Di luar gambar' };
  const wall = dilate(bin, w, h, gap);
  const at = y * w + x;
  if (wall[at]) return { error: 'Ketuk di bagian kosong ruangan, jangan di atas garis' };
  const { mask, edge, count } = flood(wall, w, h, at);
  if (edge) return { error: 'Ruangan tidak tertutup. Naikkan "tutup celah" atau gambar manual' };
  if (count < 40) return { error: 'Ruang terlalu kecil' };
  const grown = dilate(mask, w, h, gap); // kembalikan tepi yang termakan pelebaran garis
  const outline = trace(grown, w, h);
  const half = outline.length >> 1;
  const eps = Math.max(2, gap);
  const pts = [...simplify(outline.slice(0, half + 1), eps).slice(0, -1), ...simplify(outline.slice(half), eps).slice(0, -1)];
  return pts.length >= 3 ? { pts } : { error: 'Bentuk ruang tidak terbaca' };
}

function shrink(g, w, h, f) {
  if (f === 1) return { g, w, h };
  const W = Math.floor(w / f), H = Math.floor(h / f), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += g[(y * f + j) * w + x * f + i];
    out[y * W + x] = s / (f * f);
  }
  return { g: out, w: W, h: H };
}

function prepare(t) {
  let mean = 0;
  for (const v of t.g) mean += v;
  mean /= t.g.length;
  const d = Float32Array.from(t.g, (v) => v - mean);
  let ss = 0;
  for (const v of d) ss += v * v;
  return { d, norm: Math.sqrt(ss), w: t.w, h: t.h };
}

// Korelasi ternormalisasi satu posisi: 1 = identik.
function score(img, w, t, x, y) {
  let s = 0, s2 = 0, dot = 0;
  for (let j = 0, k = 0; j < t.h; j++) {
    let p = (y + j) * w + x;
    for (let i = 0; i < t.w; i++, k++, p++) { const v = img[p]; s += v; s2 += v * v; dot += v * t.d[k]; }
  }
  const variance = s2 - (s * s) / (t.w * t.h);
  return variance > 1 && t.norm > 0 ? dot / (Math.sqrt(variance) * t.norm) : 0;
}

function rotate90(t) {
  const out = new Uint8Array(t.w * t.h);
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) out[x * t.h + (t.h - 1 - y)] = t.g[y * t.w + x];
  return { g: out, w: t.h, h: t.w };
}

export function crop(g, w, [x, y, cw, ch]) {
  const out = new Uint8Array(cw * ch);
  for (let j = 0; j < ch; j++) out.set(g.subarray((y + j) * w + x, (y + j) * w + x + cw), j * cw);
  return { g: out, w: cw, h: ch };
}

/**
 * Cari serupa: `box` [x,y,w,h] = contoh. Pencarian kasar pada citra diperkecil, lalu diperhalus pada ukuran penuh.
 * Return [{ x, y, w, h, score }] (pojok kiri atas), tidak saling tumpang tindih.
 */
export function findSimilar(gray, w, h, box, { threshold = 0.75, rotations = true, sample: given = null, margin = 0.2 } = {}) {
  const [bx, by, bw, bh] = box.map(Math.round);
  if (!given && (bw < 6 || bh < 6 || bx < 0 || by < 0 || bx + bw > w || by + bh > h)) return [];
  const sample = given ?? crop(gray, w, [bx, by, bw, bh]);
  const variants = [sample];
  if (rotations) for (let i = 0; i < 3; i++) variants.push(rotate90(variants.at(-1)));
  const f = Math.max(1, Math.floor(Math.min(sample.w, sample.h) / 12));
  const small = shrink(gray, w, h, f);
  const found = [];
  for (const v of variants) {
    const coarse = prepare(shrink(v.g, v.w, v.h, f));
    const full = prepare(v);
    if (!full.norm) continue;
    for (let y = 0; y + coarse.h <= small.h; y++) for (let x = 0; x + coarse.w <= small.w; x++) {
      if (score(small.g, small.w, coarse, x, y) < threshold - margin) continue;
      // sudah ada hasil bagus di dekat sini: tidak perlu diperhalus lagi
      if (found.some((k) => k.w === v.w && k.score > 0.92 && Math.abs(k.x - x * f) < v.w * 0.4 && Math.abs(k.y - y * f) < v.h * 0.4)) continue;
      let best = null;
      for (let Y = Math.max(0, y * f - f); Y <= Math.min(h - v.h, y * f + f); Y++) for (let X = Math.max(0, x * f - f); X <= Math.min(w - v.w, x * f + f); X++) {
        const s = score(gray, w, full, X, Y);
        if (!best || s > best.score) best = { x: X, y: Y, w: v.w, h: v.h, score: s };
      }
      if (best && best.score >= threshold) found.push(best);
    }
  }
  found.sort((a, b) => b.score - a.score);
  const keep = [];
  for (const c of found) {
    if (!keep.some((k) => Math.abs(c.x + c.w / 2 - k.x - k.w / 2) < Math.min(c.w, k.w) * 0.6 && Math.abs(c.y + c.h / 2 - k.y - k.h / 2) < Math.min(c.h, k.h) * 0.6)) keep.push(c);
  }
  return keep;
}

/** Tempelkan titik ke garis terdekat dalam radius `r`; persilangan garis diutamakan. */
export function snapPoint(bin, w, h, p, r) {
  const [px, py] = p.map(Math.round);
  const run = (x, y, dx, dy) => {
    let n = 0;
    for (let k = 1; k <= 8; k++) { const X = x + dx * k, Y = y + dy * k; if (X < 0 || Y < 0 || X >= w || Y >= h || !bin[Y * w + X]) break; n++; }
    return n;
  };
  let best = null;
  for (let y = Math.max(0, py - r); y <= Math.min(h - 1, py + r); y++) for (let x = Math.max(0, px - r); x <= Math.min(w - 1, px + r); x++) {
    if (!bin[y * w + x]) continue;
    const d = Math.hypot(x - px, y - py);
    if (d > r) continue;
    const l = run(x, y, -1, 0), rt = run(x, y, 1, 0), u = run(x, y, 0, -1), dn = run(x, y, 0, 1);
    const corner = Math.max(l, rt) >= 6 && Math.max(u, dn) >= 6;
    // titik di tengah tebal garis lebih disukai daripada tepinya
    const cost = d - (corner ? r * 0.6 : 0) + Math.min(Math.abs(l - rt), Math.abs(u - dn)) * 0.3;
    if (!best || cost < best.cost) best = { cost, p: [x, y] };
  }
  return best ? best.p : null;
}
