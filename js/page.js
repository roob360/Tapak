// Halaman laporan yang digambar di kanvas: rekap untuk PDF, dan gambar satu lembar untuk dibagikan.
import { canvasOf } from './pdf.js';
import { drawMarks, drawAnnotation, drawLegend } from './draw.js';
import { elementsOn, stagesOf, summary, fmtDate } from './model.js';

const FONT = 'Inter, -apple-system, "Segoe UI", system-ui, sans-serif';
const W = 842, H = 595, M = 40; // A4 mendatar, titik

/** Satu atau beberapa halaman rekap. data: { title, author, period, rows, summary, volumes } -> [{ canvas, size }] */
export function recapPages(data) {
  const pages = [];
  let g, y;
  const open = () => {
    const [canvas, ctx] = canvasOf(W * 2, H * 2);
    ctx.scale(2, 2);
    ctx.textBaseline = 'alphabetic';
    pages.push({ canvas, size: [W, H] });
    g = ctx;
    y = M;
  };
  const text = (s, x, size = 10, weight = 400, color = '#000', align = 'left', max) => {
    g.font = `${weight} ${size}px ${FONT}`;
    g.fillStyle = color;
    g.textAlign = align;
    let t = String(s);
    if (max) while (t.length > 1 && g.measureText(t).width > max) t = `${t.slice(0, -2)}…`;
    g.fillText(t, x, y);
  };
  const rule = () => { g.fillStyle = '#d1d1d6'; g.fillRect(M, y + 6, W - M * 2, 0.7); };
  const table = (head, widths, rows, textLast = false) => {
    const line = (cells, weight, color) => {
      let x = M;
      cells.forEach((c, i) => { const left = !i || (textLast && i === cells.length - 1); text(c, left ? x + (i ? 18 : 0) : x + widths[i] - 6, 10, weight, color, left ? 'left' : 'right', widths[i] - (left && i ? 20 : 8)); x += widths[i]; });
      rule();
      y += 20;
    };
    const header = () => line(head, 700, '#66666b');
    header();
    for (const row of rows) {
      if (y > H - M) { open(); header(); }
      line(row.cells ?? row, row.bold ? 700 : 400, '#000');
    }
  };
  const heading = (s) => { if (y > H - M - 60) open(); y += 16; text(s, M, 13, 700); y += 20; };

  open();
  y += 8;
  text(data.title, M, 20, 700, '#000', 'left', W - M * 2);
  y += 18;
  text([data.author && `Disusun oleh ${data.author}`, `Periode ${fmtDate(data.period.from)} sampai ${fmtDate(data.period.to)}`].filter(Boolean).join('  ·  '), M, 10, 400, '#66666b');
  y += 38;
  const { before, after, total } = data.report;
  text(`${after}%`, M, 32, 700);
  text(`progres keseluruhan  ·  sebelumnya ${before}%  ·  bertambah ${after - before} poin  ·  ${total} tahap selesai pada periode ini`, M + 90, 10, 400, '#66666b');
  y += 14;
  heading('Per lembar');
  table(['Lembar', 'Elemen', 'Sebelum', 'Sekarang', 'Bertambah', 'Tahap selesai periode ini'], [180, 60, 70, 70, 70, 312],
    data.report.rows.map((r) => [data.names[r.page], r.n, `${r.before}%`, `${r.after}%`, `${r.after - r.before}`, r.stages.map((s, i) => (r.added[i] ? `${s.name} ${r.added[i]}` : '')).filter(Boolean).join(', ') || '-']), true);
  if (data.volumes.rows.length) {
    heading('Volume selesai (kumulatif)');
    const n = (v) => (v ? v.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '-');
    table(['Tahap', 'Elemen', 'Panjang (m)', 'Luas (m²)'], [320, 110, 166, 166], data.volumes.rows.map((r) => [r.name, r.count, n(r.length), n(r.area)]));
    if (data.volumes.unscaled) { text('Elemen di lembar yang belum diskala tidak masuk hitungan panjang dan luas.', M, 9, 400, '#66666b'); y += 16; }
  }
  return pages;
}

/** Lukis penanda, coretan, dan legenda satu lembar di atas kanvas gambar (koordinat titik halaman). */
export function paintSheet(g, project, page, size, o) {
  const els = elementsOn(project, page).filter((x) => x.date && (!o.until || x.date <= o.until));
  const unit = Math.max(...size) / 1100;
  drawMarks(g, project, els, stagesOf(project, page), { px: unit, ...o });
  if (o.notes) for (const a of project.annotations.items) if (a.page === page && a.pts.length) drawAnnotation(g, a);
  drawLegend(g, project, page, summary(project, page, o.until), { unit, mode: o.mode, until: o.until, elements: els, page: size });
}

/** Gambar satu lembar dengan kepala berisi nama dan progres -> kanvas siap dibagikan. */
export async function sheetImage(view, project, page, title, o) {
  const source = await view.render(page, 2600);
  const size = view.sizes[page];
  const head = Math.round(source.width * 0.055);
  const [canvas, g] = canvasOf(source.width, source.height + head);
  g.fillStyle = '#1c1c1e';
  g.textBaseline = 'middle';
  g.font = `700 ${head * 0.42}px ${FONT}`;
  g.fillText(title, head * 0.4, head / 2, canvas.width - head);
  g.translate(0, head);
  g.drawImage(source, 0, 0);
  g.scale(source.width / size[0], source.width / size[0]);
  paintSheet(g, project, page, size, o);
  source.width = source.height = 0;
  return canvas;
}
