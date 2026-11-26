// Baca, render, dan ubah PDF. pdf.js untuk menampilkan, pdf-lib untuk mengubah halaman.

const base = new URL('../vendor/pdfjs/', import.meta.url);
let pdfjs = null, lib = null;
const loadJs = async () => {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
  }
  return pdfjs;
};
const loadLib = async () => (lib ??= await import('../vendor/pdflib/pdf-lib.esm.min.js'));

const MAX_PIXELS = 14e6;

export const canvasOf = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  return [c, g];
};
export const toBlob = (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Gambar terlalu besar untuk perangkat ini'))), type, q));

/** Dokumen untuk ditampilkan: ukuran halaman dalam titik PDF dan render ke kanvas. */
export async function openPdf(bytes) {
  const js = await loadJs();
  const task = js.getDocument({ data: bytes.slice(), wasmUrl: new URL('wasm/', base).href });
  const doc = await task.promise;
  const sizes = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const v = (await doc.getPage(i)).getViewport({ scale: 1 });
    sizes.push([v.width, v.height]);
  }
  return {
    pages: doc.numPages,
    sizes,
    /** Render halaman (mulai 0) dengan sisi panjang `long` piksel. */
    async render(i, long = 3200) {
      const page = await doc.getPage(i + 1);
      const [w, h] = sizes[i];
      const scale = Math.min(long / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
      const viewport = page.getViewport({ scale });
      const [c, g] = canvasOf(viewport.width, viewport.height);
      await page.render({ canvasContext: g, canvas: c, viewport }).promise;
      return c;
    },
    /** Nama lembar disimpan sebagai bookmark PDF. */
    async names() {
      const out = new Array(doc.numPages).fill(null);
      for (const item of (await doc.getOutline()) ?? []) {
        try {
          const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
          const at = dest ? await doc.getPageIndex(dest[0]) : -1;
          if (at >= 0 && !out[at]) out[at] = item.title;
        } catch { /* bookmark rusak diabaikan */ }
      }
      return out;
    },
    close: () => task.destroy(),
  };
}

const LONG = 1684; // sisi panjang halaman gambar (pt), setara A2

/** Gambar (Blob PNG/JPG) -> PDF satu halaman. `size` = ukuran halaman (titik) bila harus dipertahankan. */
export async function imageToPdf(blob, size) {
  const { PDFDocument } = await loadLib();
  const doc = await PDFDocument.create();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pic = blob.type === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  const k = LONG / Math.max(pic.width, pic.height);
  const [width, height] = size ?? [pic.width * k, pic.height * k];
  doc.addPage([width, height]).drawImage(pic, { x: 0, y: 0, width, height });
  return doc.save();
}

/** Foto/gambar apa pun -> kanvas (orientasi EXIF diterapkan, ukuran dibatasi). */
export async function readImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 4600 / Math.max(bmp.width, bmp.height), Math.sqrt(MAX_PIXELS / (bmp.width * bmp.height)));
  const [c, g] = canvasOf(bmp.width * k, bmp.height * k);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

const load = async (bytes) => (await loadLib()).PDFDocument.load(bytes, { ignoreEncryption: true });

/**
 * Susun ulang halaman. `plan` tiap isi: { from: nomorLama } | { blank: [w, h] } | { pdf: bytes, from }.
 * `rotate` = kumpulan posisi baru yang diputar 90 derajat.
 */
export async function arrangePages(bytes, plan, names, rotate = new Set()) {
  const { PDFDocument, degrees, PDFName, PDFHexString } = await loadLib();
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const others = new Map();
  for (const [i, step] of plan.entries()) {
    let page;
    if (step.blank) page = out.addPage(step.blank);
    else {
      let from = src;
      if (step.pdf) { if (!others.has(step.pdf)) others.set(step.pdf, await load(step.pdf)); from = others.get(step.pdf); }
      [page] = await out.copyPages(from, [step.from]);
      out.addPage(page);
    }
    if (rotate.has(i)) page.setRotation(degrees((page.getRotation().angle + 90) % 360));
  }
  setOutline(out, names, { PDFName, PDFHexString });
  return out.save();
}

export async function renamePages(bytes, names) {
  const { PDFName, PDFHexString } = await loadLib();
  const doc = await load(bytes);
  setOutline(doc, names, { PDFName, PDFHexString });
  return doc.save();
}

function setOutline(doc, names, { PDFName, PDFHexString }) {
  const pages = doc.getPages();
  const list = names.map((title, i) => ({ title, i })).filter((x) => x.title && pages[x.i]);
  if (!list.length) { doc.catalog.delete(PDFName.of('Outlines')); return; }
  const ctx = doc.context;
  const root = ctx.nextRef();
  const refs = list.map(() => ctx.nextRef());
  list.forEach(({ title, i }, k) => {
    ctx.assign(refs[k], ctx.obj({
      Title: PDFHexString.fromText(title), Parent: root, Dest: [pages[i].ref, PDFName.of('Fit')],
      ...(k ? { Prev: refs[k - 1] } : {}), ...(k < list.length - 1 ? { Next: refs[k + 1] } : {}),
    }));
  });
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs.at(-1), Count: list.length }));
  doc.catalog.set(PDFName.of('Outlines'), root);
}

/** PDF laporan: tiap halaman terpilih dirender lalu diberi tanda oleh `paint(i, g, skala)`. */
export async function reportPdf(view, pages, paint, front = []) {
  const { PDFDocument } = await loadLib();
  const doc = await PDFDocument.create();
  for (const { canvas, size } of front) {
    const pic = await doc.embedPng(new Uint8Array(await (await toBlob(canvas)).arrayBuffer()));
    doc.addPage([...size]).drawImage(pic, { x: 0, y: 0, width: size[0], height: size[1] });
    canvas.width = canvas.height = 0;
  }
  for (const i of pages) {
    const canvas = await view.render(i, 2600);
    const [w, h] = view.sizes[i];
    const g = canvas.getContext('2d');
    const k = canvas.width / w;
    g.save();
    g.scale(k, k);
    paint(i, g, k);
    g.restore();
    const pic = await doc.embedJpg(new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.9)).arrayBuffer()));
    doc.addPage([w, h]).drawImage(pic, { x: 0, y: 0, width: w, height: h });
    canvas.width = canvas.height = 0;
  }
  return doc.save();
}
