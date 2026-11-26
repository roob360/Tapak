import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as P from '../js/pkp.js';
import * as M from '../js/model.js';
import { warp, homography, apply, rotation, skewAngle } from '../js/warp.js';
import { findRoom, findSimilar, binarize, crop } from '../js/auto.js';
import { toXlsx, col } from '../js/export.js';

function sample() {
  const p = P.emptyProject('a.pdf', 3);
  p.progress.sheets = { 0: { work: 'Kolom', stages: M.makeStages(['Besi', 'Bekisting', 'Cor']) }, 1: { work: 'Kolom', stages: M.makeStages(['Besi']) } };
  const el = M.addElement(p, { page: 0, shape: 'point', pts: [[10, 20]], r: 6, style: 'kotak' });
  M.mark(p.progress.sheets[0].stages, el, 's2', '2026-11-10', true);
  M.addElement(p, { page: 1, shape: 'line', pts: [[0, 0], [50, 0]] });
  M.addCandidates(p, 0, [{ x: 100, y: 100, w: 12, h: 12 }]);
  p.annotations.items.push({ id: 1, type: 'pen', page: 1, pts: [[1, 2], [3, 4]], color: '#ff383c', size: 2, pr: [0.5, 0.6] });
  p.annotations.items.push({ id: 2, type: 'stamp', page: 0, pts: [[5, 5]], text: 'PERIKSA ULANG', color: '#ff383c', size: 20 });
  p.takeoff.scales = { 0: 0.01 };
  return p;
}

test('pkp bolak-balik, termasuk data yang tidak dikenal', () => {
  const p = sample();
  p.estimating = { rahasia: 1 };
  const bytes = P.encodePkp(P.finalize(p, 'a.pdf', 3, 'x'), new Uint8Array([1, 2, 3]));
  const back = P.decodePkp(bytes);
  assert.deepEqual([...back.pdf], [1, 2, 3]);
  assert.deepEqual(back.project.estimating, { rahasia: 1 });
  assert.equal(back.project.version, 6);
  assert.throws(() => P.decodePkp(new Uint8Array(30)), /bukan berkas/);
});

test('tanggal tahap: berurutan, date = tahap terakhir, hapus', () => {
  const p = sample();
  const el = p.progress.items[0], st = p.progress.sheets[0].stages;
  assert.deepEqual(el.st, { s1: '2026-11-10', s2: '2026-11-10' });
  M.mark(st, el, 's3', '2026-11-12');
  assert.equal(el.date, '2026-11-12');
  M.clearStages(st, el, 's3');
  assert.equal(el.date, '2026-11-10');
  M.clearStages(st, el);
  assert.equal(el.date, null);
  assert.equal(el.st, undefined);
});

test('kandidat dari takeoff, hilang setelah jadi penanda', () => {
  const p = sample();
  const [c] = M.candidates(p, 0);
  assert.equal(c.virtual > 0, true);
  const real = M.realize(p, c);
  assert.equal(M.candidates(p, 0).length, 0);
  M.removeElements(p, [real]);
  assert.equal(M.candidates(p, 0).length, 1);
});

test('susun lembar: semua data per halaman ikut pindah; duplikat tiga pilihan', () => {
  const p = sample();
  const moved = P.remapPages(p, [1, 0, 2]);
  assert.equal(moved.progress.items.find((e) => e.shape === 'point').page, 1);
  assert.equal(moved.takeoff.measures[0].page, 1);
  assert.equal(moved.takeoff.scales[1], 0.01);
  assert.equal(moved.annotations.items.find((a) => a.type === 'pen').page, 0);
  const gone = P.remapPages(p, [1, 2]);
  assert.equal(gone.progress.items.length, 1);
  assert.equal(gone.takeoff.measures.length, 0);
  const all = P.remapPages(p, [0, 0, 1, 2], 'all');
  assert.equal(new Set(all.progress.items.map((e) => e.id)).size, all.progress.items.length);
  assert.equal(all.progress.items.filter((e) => e.page === 1).length, 1);
  const stages = P.remapPages(p, [0, 0], 'stages');
  assert.ok(stages.progress.sheets[1]);
  assert.equal(stages.progress.items.filter((e) => e.page === 1).length, 0);
});

test('putar lembar: titik ikut berputar', () => {
  const turned = P.rotatePage(sample(), 0, 600);
  assert.deepEqual(turned.progress.items[0].pts, [[580, 10]]);
});

test('koreksi perspektif memetakan sudut dan meluruskan', () => {
  const h = homography([[0, 0], [10, 0], [10, 10], [0, 10]], [[2, 1], [12, 3], [11, 14], [1, 11]]);
  const [x, y] = apply(h, 10, 10);
  assert.ok(Math.abs(x - 11) < 1e-6 && Math.abs(y - 14) < 1e-6);
  const src = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(200) };
  const out = warp(src, [[0, 0], [4, 0], [4, 4], [0, 4]], { width: 2, height: 2, data: new Uint8ClampedArray(16) });
  assert.deepEqual([...out.data.slice(0, 4)], [200, 200, 200, 255]);
});

const W = 200, H = 160;
const blank = () => new Uint8Array(W * H).fill(255);
const fill = (g, x, y, w, h, v = 0) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j * W + i] = v; };

test('ruang otomatis dan cari simbol dengan contoh dari lembar lain', () => {
  const g = blank();
  fill(g, 20, 20, 101, 3); fill(g, 20, 100, 101, 3); fill(g, 20, 20, 3, 83); fill(g, 118, 20, 3, 83);
  assert.ok(findRoom(binarize(g), W, H, [70, 60], 2).pts);
  const a = blank();
  const column = (img, x, y) => { fill(img, x, y, 16, 16); fill(img, x + 5, y + 5, 6, 6, 255); };
  column(a, 10, 10);
  const tpl = crop(a, W, [8, 8, 20, 20]);
  const b = blank();
  column(b, 100, 30); column(b, 40, 110);
  assert.equal(findSimilar(b, W, H, [0, 0, 20, 20], { threshold: 0.85, sample: tpl }).length, 2);
});

test('Excel: zip valid dengan lembar ringkasan, per halaman, dan per tanggal', () => {
  const bytes = toXlsx(sample(), ['Lantai 1', 'Lantai 2', 'Lantai 3']);
  const text = new TextDecoder().decode(bytes);
  assert.equal(text.slice(0, 2), 'PK');
  for (const part of ['Ringkasan', 'Lantai 1', 'Lantai 2', 'Per tanggal', 'COUNTIF', 'IFERROR']) assert.ok(text.includes(part), part);
  assert.equal(col(27), 'AB');
});

// Uji kecocokan dengan pembaca asli PDFKill bila sumbernya ada di komputer ini.
const kill = fileURLToPath(new URL('../../../Aplikasi-Desktop/PDFKill/src/engineering/', import.meta.url));
test('berkas Tapak diterima pembaca .pkp PDFKill', { skip: !existsSync(`${kill}project.js`) }, async () => {
  const { decodePkp } = await import(pathToFileURL(`${kill}pkp.js`).href);
  const { parseProject } = await import(pathToFileURL(`${kill}project.js`).href);
  const bytes = P.encodePkp(P.finalize(sample(), 'a.pdf', 3, 'x'), new Uint8Array([9, 9]));
  const read = decodePkp(bytes);
  const d = parseProject(read.projectText);
  assert.equal(d.progress.items.length, 2);
  assert.equal(d.progress.sheets[0].stages.length, 3);
  assert.equal(d.takeoff.measures.length, 1);
  assert.equal(d.annotations.items.length, 2);
  assert.equal(d.takeoff.scales[0], 0.01);
});

test('kemiringan scan terdeteksi dan titik ikut berputar', () => {
  const w = 600, h = 420, tilt = 3.2;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  const turn = rotation(tilt, w / 2, h / 2);
  const dot = (x, y) => { const [u, v] = turn([x, y]).map(Math.round); if (u >= 0 && v >= 0 && u < w && v < h) rgba.set([0, 0, 0, 255], (v * w + u) * 4); };
  for (const y of [80, 160, 260, 340]) for (let x = 60; x < 540; x += 0.5) dot(x, y);
  for (const x of [60, 300, 540]) for (let y = 80; y < 340; y += 0.5) dot(x, y);
  const found = skewAngle(rgba, w, h);
  assert.ok(Math.abs(found - tilt) < 0.2, String(found));
  const p = sample();
  const back = P.transformPage(P.transformPage(p, 0, rotation(5, 100, 100)), 0, rotation(-5, 100, 100));
  assert.ok(Math.abs(back.progress.items[0].pts[0][0] - 10) < 0.05);
});
