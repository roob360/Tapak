// Luruskan lembar hasil scan: sudut otomatis / manual, atau empat sudut. Penanda yang sudah ada ikut berpindah.
import * as W from './work.js';
import { transformPage } from './pkp.js';
import { canvasOf, toBlob, imageToPdf, arrangePages } from './pdf.js';
import { skewAngle, rotation, homography, apply } from './warp.js';
import { cornersOf } from './crop.js';
import { $, sheet, toast } from './ui.js';

const copyOf = (canvas) => { const [c, g] = canvasOf(canvas.width, canvas.height); g.drawImage(canvas, 0, 0); return c; };

/** Putar isi halaman sebesar -derajat terhadap pusat; ukuran halaman tetap. */
function rotated(canvas, degrees) {
  const [c, g] = canvasOf(canvas.width, canvas.height);
  g.imageSmoothingQuality = 'high';
  g.translate(c.width / 2, c.height / 2);
  g.rotate((-degrees * Math.PI) / 180);
  g.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return c;
}

/** Perkiraan kemiringan (derajat) dari baris gambar. */
export function estimate(canvas) {
  const k = Math.min(1, 1400 / Math.max(canvas.width, canvas.height));
  const [c, g] = canvasOf(canvas.width * k, canvas.height * k);
  g.drawImage(canvas, 0, 0, c.width, c.height);
  const { data } = g.getImageData(0, 0, c.width, c.height);
  return skewAngle(data, c.width, c.height);
}

/** Ganti halaman-halaman dengan versi lurusnya dalam satu langkah urungkan. jobs: [{ page, canvas, size, map }] */
async function commit(jobs) {
  const { S } = W;
  toast('Menyimpan lembar lurus…');
  const made = new Map();
  let next = W.project();
  for (const job of jobs) {
    const blob = await toBlob(job.canvas, 'image/jpeg', 0.92);
    made.set(job.page, await imageToPdf(blob, job.size));
    next = transformPage(next, job.page, job.map);
  }
  const plan = Array.from({ length: S.view.pages }, (_, i) => (made.has(i) ? { pdf: made.get(i), from: 0 } : { from: i }));
  await W.changePdf(await arrangePages(S.pdf, plan, [...S.names]), next);
  toast(jobs.length > 1 ? `${jobs.length} lembar diluruskan` : 'Lembar diluruskan', { label: 'Urungkan', run: W.undo });
}

function turnJob(page, canvas, degrees) {
  const [w, h] = W.S.view.sizes[page];
  return { page, canvas: rotated(canvas, degrees), size: [w, h], map: rotation(-degrees, w / 2, h / 2) };
}

export async function straightenDialog() {
  const { S } = W;
  const page = S.page, source = await S.view.render(page, 3200);
  let angle = 0;
  const s = sheet({
    title: 'Luruskan lembar', sub: `${W.sheetName(page)} · halaman diubah menjadi gambar`, wide: true,
    body: `<canvas class="deskew"></canvas>
      <label class="range">Kemiringan<input type="range" min="-15" max="15" step="0.1" value="0"><output>0°</output></label>
      <div class="chips"><button class="soft" data-a="auto">Otomatis</button><button class="soft" data-a="corners">Empat sudut</button><button class="soft" data-a="all">Otomatis semua lembar</button></div>
      <p class="hint">Teks dan garis vektor asli menjadi gambar. Penanda dan coretan ikut berpindah.</p>
      <div class="pair"><button class="soft" data-a="cancel">Batal</button><button class="solid" data-a="apply" disabled>Terapkan</button></div>`,
  });
  const view = $('.deskew', s.el), slider = $('input', s.el);
  const small = canvasOf(900, (900 * source.height) / source.width)[0];
  small.getContext('2d').drawImage(source, 0, 0, small.width, small.height);
  const preview = () => {
    view.width = small.width;
    view.height = small.height;
    const g = view.getContext('2d');
    g.drawImage(rotated(small, angle), 0, 0);
    // garis bantu untuk menilai kelurusan
    g.strokeStyle = '#34c75999';
    g.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      g.beginPath(); g.moveTo(0, (view.height * i) / 8); g.lineTo(view.width, (view.height * i) / 8); g.stroke();
      g.beginPath(); g.moveTo((view.width * i) / 8, 0); g.lineTo((view.width * i) / 8, view.height); g.stroke();
    }
  };
  const set = (v) => {
    angle = Math.round(v * 100) / 100;
    slider.value = angle;
    slider.nextElementSibling.value = `${angle}°`;
    $('[data-a="apply"]', s.el).disabled = !angle;
    preview();
  };
  preview();
  slider.oninput = () => set(Number(slider.value));
  let busy = false;
  s.el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-a]')?.dataset.a;
    if (!act || busy) return;
    busy = true;
    try {
      if (act === 'cancel') s.close();
      else if (act === 'auto') {
        const found = estimate(source);
        set(found);
        toast(found ? `Kemiringan terdeteksi ${found}°` : 'Gambar sudah lurus, atau tidak ada garis yang jelas');
      } else if (act === 'apply') { s.close(); await commit([turnJob(page, source, angle)]); }
      else if (act === 'all') {
        s.close();
        const jobs = [];
        for (let i = 0; i < S.view.pages; i++) {
          toast(`Memeriksa lembar ${i + 1} dari ${S.view.pages}…`);
          const canvas = await S.view.render(i, 3200);
          const found = estimate(canvas);
          if (Math.abs(found) >= 0.15) jobs.push(turnJob(i, canvas, found));
        }
        if (jobs.length) await commit(jobs); else toast('Semua lembar sudah lurus');
      } else if (act === 'corners') {
        s.close();
        const picked = await cornersOf(copyOf(source), { simple: true });
        if (!picked) return;
        const [w, h] = S.view.sizes[page];
        const px = picked.corners.map(([u, v]) => [u * w, v * h]);
        const cw = picked.canvas.width, ch = picked.canvas.height;
        const k = Math.max(w, h) / Math.max(cw, ch); // sisi panjang halaman dipertahankan
        const size = [cw * k, ch * k];
        const hm = homography(px, [[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]]);
        await commit([{ page, canvas: picked.canvas, size, map: ([x, y]) => apply(hm, x, y) }]);
      }
    } catch (err) { console.error(err); toast(`Gagal meluruskan: ${err.message}`); } finally { busy = false; }
  });
  return s;
}
