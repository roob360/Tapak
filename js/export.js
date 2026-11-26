// Rekap Excel (.xlsx) dengan rumus hidup, ditulis tanpa pustaka. Murni.
import { allElements, stagesOf, doneStages, lastStage } from './model.js';
import { pathLength, polyArea } from './geom.js';

const enc = new TextEncoder();
const CRC = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const concat = (parts) => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const le = (values) => { const out = new Uint8Array(values.reduce((a, [, n]) => a + n, 0)); let at = 0; for (const [v, n] of values) for (let i = 0; i < n; i++) out[at++] = (v >>> (8 * i)) & 255; return out; };

/** ZIP tanpa kompresi. */
export function zip(files) {
  const body = [], dir = [];
  let offset = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const common = [[20, 2], [0x0800, 2], [0, 2], [0, 2], [0x21, 2], [crc, 4], [data.length, 4], [data.length, 4], [n.length, 2], [0, 2]];
    const local = concat([le([[0x04034b50, 4], ...common]), n, data]);
    dir.push(concat([le([[0x02014b50, 4], [20, 2], ...common, [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]]), n]));
    body.push(local);
    offset += local.length;
  }
  const central = concat(dir);
  return concat([...body, central, le([[0x06054b50, 4], [0, 2], [0, 2], [files.length, 2], [files.length, 2], [central.length, 4], [offset, 4], [0, 2]])]);
}

const xml = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const col = (i) => (i < 26 ? '' : col(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));
// gaya: 1 kepala, 2 isi, 3 tanggal, 4 angka, 5 persen. Tanpa warna.
const STYLES = '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="6"><xf/><xf fontId="1" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf borderId="1" applyBorder="1"/><xf numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="2" borderId="1" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="9" borderId="1" applyNumberFormat="1" applyBorder="1"/></cellXfs></styleSheet>';
const day = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000 + 25569;

function cell(c, ref) {
  if (c == null || c === '') return `<c r="${ref}" s="2"/>`;
  if (typeof c === 'number') return `<c r="${ref}" s="2"><v>${c}</v></c>`;
  if (typeof c === 'string') return `<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${xml(c)}</t></is></c>`;
  if (c.h != null) return `<c r="${ref}" s="1" t="inlineStr"><is><t>${xml(c.h)}</t></is></c>`;
  if (c.d) return `<c r="${ref}" s="3"><v>${day(c.d)}</v></c>`;
  if (c.f) return `<c r="${ref}" s="${c.s ?? 2}"><f>${xml(c.f)}</f></c>`;
  return `<c r="${ref}" s="${c.s ?? 2}"><v>${c.n}</v></c>`;
}
const sheetXml = (rows, widths) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((c, j) => cell(c, `${col(j)}${i + 1}`)).join('')}</row>`).join('')}</sheetData></worksheet>`;

const safeSheet = (name, used) => {
  const base = String(name).replace(/[\\/?*[\]:']/g, ' ').trim().slice(0, 28) || 'Lembar';
  let out = base, i = 2;
  while (used.has(out.toLowerCase())) out = `${base} ${i++}`;
  used.add(out.toLowerCase());
  return out;
};

/** Ringkasan (rumus), satu lembar per halaman (elemen x tahap), dan jumlah per tanggal (rumus). */
export function toXlsx(project, names, until = null) {
  const TYPE = { point: 'Titik', line: 'Garis', poly: 'Area' };
  const used = new Set(['ringkasan', 'volume', 'per tanggal']);
  const pages = names.map((name, page) => ({ page, name, stages: stagesOf(project, page), els: allElements(project, page) })).filter((p) => p.els.length);
  const parts = [], titles = [];
  const volume = [['Lembar', 'Tahap', 'Elemen selesai', 'Panjang (m)', 'Luas (m2)'].map((h) => ({ h }))];
  const summary = [['No', 'Lembar', 'Pekerjaan', 'Elemen', 'Pekerjaan selesai', 'Progres'].map((h) => ({ h }))];
  const dateRefs = [];
  pages.forEach((p, i) => {
    const title = safeSheet(p.name, used);
    const q = `'${title}'`;
    const n = p.els.length + 1, first = 5, last = first + p.stages.length - 1;
    const m = project.takeoff.scales?.[p.page];
    const rows = [['No', 'Nama', 'Jenis', 'Panjang (m)', 'Luas (m2)', ...p.stages.map((s) => s.name), 'Tahap terakhir', 'Progres'].map((h) => ({ h }))];
    p.els.forEach((el, k) => {
      const done = new Set(doneStages(p.stages, el, until).map((s) => s.id));
      rows.push([
        { f: 'ROW()-1' }, el.label ?? '', TYPE[el.shape],
        m && el.shape !== 'point' ? { n: pathLength(el.pts, el.shape === 'poly') * m, s: 4 } : null,
        m && el.shape === 'poly' ? { n: polyArea(el.pts) * m * m, s: 4 } : null,
        ...p.stages.map((s) => (done.has(s.id) ? { d: el.st[s.id] } : null)),
        lastStage(p.stages, el, until)?.name ?? '',
        p.stages.length ? { f: `COUNT(${col(first)}${k + 2}:${col(last)}${k + 2})/${p.stages.length}`, s: 5 } : null,
      ]);
    });
    parts.push(sheetXml(rows, [6, 16, 9, 13, 12, ...p.stages.map(() => 16), 18, 10]));
    titles.push(title);
    p.stages.forEach((s, k) => {
      const done = `${q}!${col(first + k)}2:${col(first + k)}${n}`;
      volume.push([p.name, s.name, { f: `COUNT(${done})` }, { f: `SUMIF(${done},">0",${q}!D2:D${n})`, s: 4 }, { f: `SUMIF(${done},">0",${q}!E2:E${n})`, s: 4 }]);
    });
    const range = p.stages.length ? `${q}!${col(first)}2:${col(last)}${n}` : null;
    if (range) dateRefs.push(range);
    summary.push([i + 1, p.name, project.progress.sheets[p.page]?.work ?? '', { f: `COUNTA(${q}!C2:C${n})` }, { f: range ? `COUNT(${range})` : '0' },
      { f: `IFERROR(E${i + 2}/(D${i + 2}*${Math.max(1, p.stages.length)}),0)`, s: 5 }]);
  });
  const dates = [...new Set(pages.flatMap((p) => p.els.flatMap((el) => doneStages(p.stages, el, until).map((s) => el.st[s.id]))))].sort();
  const daily = [['Tanggal', 'Jumlah pekerjaan'].map((h) => ({ h }))];
  dates.forEach((d, i) => daily.push([{ d }, { f: dateRefs.map((r) => `COUNTIF(${r},A${i + 2})`).join('+') || '0' }]));
  const all = [sheetXml(summary, [6, 22, 22, 10, 18, 10]), ...parts, sheetXml(volume, [22, 24, 16, 14, 14]), sheetXml(daily, [14, 18])];
  const sheetNames = ['Ringkasan', ...titles, 'Volume', 'Per tanggal'];
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
  return zip([
    ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/>${all.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets>${sheetNames.map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${all.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${all.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...all.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x]),
  ]);
}

/** Bagikan (tablet/HP) atau unduh. */
export async function deliver(bytes, name, type) {
  const blob = new Blob([bytes], { type });
  const file = new File([blob], name, { type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
export const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').trim() || 'berkas';
