import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as P from '../js/pkp.js';
import * as M from '../js/model.js';
import { warp, homography, apply, rotation, skewAngle } from '../js/warp.js';
import { findRoom, findSimilar, binarize, crop } from '../js/auto.js';
import { toXlsx, col } from '../js/export.js';
import { week, shift, periodReport, volumes } from '../js/report.js';
import { DEFAULTS, values, buildName } from '../js/naming.js';

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

test('ubah bentuk dan salin ke lembar lain tanpa tanggal', () => {
  const p = sample();
  const line = p.progress.items[1];
  M.moveElement(line, 5, 5);
  assert.deepEqual(line.pts, [[5, 5], [55, 5]]);
  M.insertVertex(line, 0, [30, 20]);
  assert.equal(line.pts.length, 3);
  assert.equal(M.removeVertex(line, 1), true);
  assert.equal(M.removeVertex(line, 0), false);
  const sizes = [[100, 100], [100, 100], [200, 200]];
  const source = p.progress.items.filter((e) => e.page === 0);
  assert.equal(M.copyElements(p, source, [0, 2], sizes), 1);
  const copy = p.progress.items.at(-1);
  assert.equal(copy.page, 2);
  assert.deepEqual(copy.pts, [[20, 40]]);
  assert.equal(copy.date, null);
  assert.equal(copy.st, undefined);
  assert.equal(M.copyElements(p, source, [2], sizes), 0);
  assert.ok(p.progress.sheets[2]);
});

test('progres periode dan volume per tahap', () => {
  assert.deepEqual(week('2026-11-26'), { from: '2026-11-23', to: '2026-11-29' });
  assert.deepEqual(week('2026-11-29', 1), { from: '2026-11-16', to: '2026-11-22' });
  assert.equal(shift('2026-12-31', 1), '2027-01-01');
  const p = sample();
  const st = p.progress.sheets[0].stages;
  M.mark(st, p.progress.items[0], 's3', '2026-11-24');
  const r = periodReport(p, 3, '2026-11-23', '2026-11-29');
  assert.equal(r.rows[0].total, 1);
  assert.ok(r.rows[0].after > r.rows[0].before);
  p.progress.sheets[1] = { work: 'x', stages: M.makeStages(['Besi']) };
  M.mark(p.progress.sheets[1].stages, p.progress.items[1], 's1', '2026-11-24');
  p.takeoff.scales = { 1: 0.1 };
  const v = volumes(p, 3);
  assert.equal(v.rows.find((x) => x.name === 'Besi').length, 5);
  assert.equal(v.unscaled, false);
  assert.ok(new TextDecoder().decode(toXlsx(p, ['a', 'b', 'c'])).includes('SUMIF'));
});

test('scan ulang tidak menaruh titik dobel di tempat yang sama', () => {
  const p = P.emptyProject('a.pdf', 1);
  const box = (x, y) => ({ x, y, w: 20, h: 20 });
  assert.equal(M.addCandidates(p, 0, [box(10, 10), box(100, 10)]), 2);
  assert.equal(M.addCandidates(p, 0, [box(13, 12), box(100, 10), box(200, 10), box(202, 11)]), 1);
  assert.equal(M.candidates(p, 0).length, 3);
  M.addElement(p, { page: 0, shape: 'point', pts: [[310, 20]], r: 9 });
  assert.equal(M.addCandidates(p, 0, [box(302, 12)]), 0);
  M.addElement(p, { page: 0, shape: 'poly', pts: [[390, 0], [430, 0], [430, 40], [390, 40]] });
  assert.equal(M.addCandidates(p, 0, [box(400, 10)]), 1);
});

test('nama berkas ekspor dari bagian terpilih', () => {
  const v = values('pdf', { fileName: 'ARS_Dinding_Gedung A.pkp', period: { from: '2026-11-23', to: '2026-11-29' }, percent: 25, today: '2026-11-26', sheet: 'Lantai 1' });
  assert.equal(buildName(DEFAULTS.pdf, v), 'ARS_Dinding_Gedung A_Laporan_23-11 sd 29-11-2026');
  assert.equal(buildName(['tanggal', 'disiplin'], v), 'ARS_26-11-2026');
  assert.equal(buildName([], v), 'Dinding');
  const loose = values('pkp', { fileName: 'denah/1.pkp', today: '2026-11-26' });
  assert.equal(buildName(DEFAULTS.pkp, loose), 'denah-1');
});
