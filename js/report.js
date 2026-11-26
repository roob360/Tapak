// Angka untuk laporan: progres per periode dan volume per tahap. Murni.
import { allElements, stagesOf, percent, today } from './model.js';
import { pathLength, polyArea } from './geom.js';

const day = (iso) => new Date(`${iso}T12:00:00`);
export const shift = (iso, days) => { const d = day(iso); d.setDate(d.getDate() + days); return today(d); };

/** Minggu Senin sampai Minggu yang memuat `iso`; `back` = berapa minggu ke belakang. */
export function week(iso, back = 0) {
  const monday = shift(iso, -((day(iso).getDay() + 6) % 7) - back * 7);
  return { from: monday, to: shift(monday, 6) };
}

const average = (stages, els, until) => (els.length && stages.length ? Math.round(els.reduce((a, e) => a + percent(stages, e, until), 0) / els.length) : 0);

/** Tahap yang selesai di dalam periode, per elemen. */
export const inPeriod = (el, from, to) => Object.values(el.st ?? {}).some((d) => d >= from && d <= to);

/** Per lembar: progres sebelum periode, sesudahnya, dan tahap yang bertambah. */
export function periodReport(p, pages, from, to) {
  const rows = [];
  for (let page = 0; page < pages; page++) {
    const stages = stagesOf(p, page), els = allElements(p, page);
    if (!els.length) continue;
    const added = stages.map((s) => els.filter((e) => e.st?.[s.id] >= from && e.st[s.id] <= to).length);
    rows.push({
      page, stages, added,
      total: added.reduce((a, b) => a + b, 0),
      before: average(stages, els, shift(from, -1)),
      after: average(stages, els, to),
      n: els.length,
    });
  }
  const weight = rows.reduce((a, r) => a + r.n, 0);
  const mean = (key) => (weight ? Math.round(rows.reduce((a, r) => a + r[key] * r.n, 0) / weight) : 0);
  return { rows, before: mean('before'), after: mean('after'), total: rows.reduce((a, r) => a + r.total, 0) };
}

/**
 * Volume pekerjaan selesai per nama tahap, seluruh lembar: jumlah elemen, panjang (m), luas (m2).
 * Panjang dan luas hanya dari lembar yang sudah diskala; `unscaled` memberi tahu bila ada yang tidak terhitung.
 */
export function volumes(p, pages, until = null) {
  const out = new Map();
  let unscaled = false;
  for (let page = 0; page < pages; page++) {
    const m = p.takeoff.scales?.[page];
    for (const s of stagesOf(p, page)) {
      const row = out.get(s.name) ?? { name: s.name, color: s.color, count: 0, length: 0, area: 0 };
      for (const el of allElements(p, page)) {
        if (!el.st?.[s.id] || (until && el.st[s.id] > until)) continue;
        row.count++;
        if (el.shape === 'point') continue;
        if (!m) { unscaled = true; continue; }
        if (el.shape === 'line') row.length += pathLength(el.pts) * m;
        else row.area += polyArea(el.pts) * m * m;
      }
      out.set(s.name, row);
    }
  }
  return { rows: [...out.values()], unscaled };
}
