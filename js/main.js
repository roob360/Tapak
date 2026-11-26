// Tapak: layar daftar berkas, berkas baru, buka .pkp.
import * as db from './store.js';
import { decodePkp, emptyProject } from './pkp.js';
import { openPdf, imageToPdf, arrangePages, toBlob } from './pdf.js';
import { pickFiles } from './pick.js';
import { straighten } from './crop.js';
import * as W from './work.js';
import { $, $$, esc, icon, sheet, ask, choose, form, toast, move, stagger } from './ui.js';

const app = $('#app');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const isPdf = (f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);

function backupText(f) {
  if (!f.summary?.elements) return '';
  if (!f.backupAt) return 'Belum dicadangkan';
  if ((f.changedAt ?? 0) <= f.backupAt) return 'Cadangan terbaru';
  const days = Math.floor((Date.now() - f.backupAt) / 864e5);
  return days ? `Ada perubahan sejak cadangan ${days} hari lalu` : 'Ada perubahan sejak cadangan hari ini';
}

async function showHome() {
  const files = (await db.listFiles()).sort((a, b) => b.updated - a.updated);
  const groups = new Map();
  for (const f of files) groups.set(f.building || 'Lainnya', [...(groups.get(f.building || 'Lainnya') ?? []), f]);
  app.innerHTML = `<main id="home">
    <header><div><h1>Tapak</h1><p>Satu berkas: satu pekerjaan, satu gedung</p></div><div class="line"><button class="soft" data-a="open">Buka proyek .pkp</button><button class="solid" data-a="new">Berkas baru</button></div></header>
    ${[...groups].map(([building, list]) => `<h2>${esc(building)}</h2><div class="cards">${list.map((f) => `<div class="card"><button data-open="${f.id}"><span class="thumb">${f.thumb ? `<img src="${f.thumb}" alt="">` : icon('berkas')}</span><b>${esc(f.name.replace(/\.pkp$/i, ''))}</b><small>${f.summary?.sheets ?? 0} lembar · ${f.summary?.elements ?? 0} elemen</small><span class="meter"><i style="width:${f.summary?.percent ?? 0}%"></i></span><em>${f.summary?.percent ?? 0}%</em><small class="backup">${backupText(f)}</small></button><button class="round soft menu" data-menu="${f.id}" aria-label="Pilihan berkas">${icon('more')}</button></div>`).join('')}</div>`).join('')
      || '<div class="empty"><p>Belum ada berkas.</p><p>Buat dari PDF denah atau foto gambar, atau buka proyek <b>.pkp</b> dari PDFKill.</p></div>'}
    <p class="note">Data tersimpan di perangkat ini. Simpan .pkp secara berkala sebagai cadangan.</p>
  </main>`;
  stagger($$('.card'), 340, 40);
  $$('.meter i').forEach((i) => move(i, [{ width: '0%' }, { width: i.style.width }], 340, { delay: 150, fill: 'backwards' }));
  $('#home').addEventListener('click', onHome);
}

async function onHome(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  try {
    if (d.open) return await open(d.open, b);
    if (d.a === 'new') return await newFile(await pickFiles('application/pdf,.pdf,image/*', true));
    if (d.a === 'open') return await openProject((await pickFiles('.pkp'))[0]);
    if (d.menu) {
      const file = await db.getFile(d.menu);
      const act = await choose(file.name, [{ id: 'rename', label: 'Ganti nama', icon: 'pulpen' }, { id: 'delete', label: 'Hapus dari perangkat', icon: 'trash', danger: true }]);
      if (act === 'rename') {
        const v = await form('Ganti nama', [{ key: 'name', label: 'Nama berkas', value: file.name.replace(/\.pkp$/i, '') }]);
        if (v?.name.trim()) { await db.putFile({ ...file, name: `${v.name.trim()}.pkp` }); await showHome(); }
      }
      if (act === 'delete' && (await ask('Hapus berkas?', `${file.name} dihapus permanen dari perangkat ini. Pastikan sudah menyimpan .pkp bila masih perlu.`, 'Hapus', true))) {
        await db.removeFile(d.menu);
        await showHome();
      }
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'Terjadi kesalahan');
  }
}

async function open(id, from) {
  const [file, pdf] = await Promise.all([db.getFile(id), db.getPdf(id)]);
  if (!file || !pdf) return toast('Data berkas tidak ditemukan');
  const r = from?.getBoundingClientRect();
  await W.openWork(file, pdf, showHome);
  if (r) {
    // kartu membesar menjadi papan kerja
    const t = `translate(${r.x + r.width / 2 - innerWidth / 2}px, ${r.y + r.height / 2 - innerHeight / 2}px) scale(${r.width / innerWidth}, ${r.height / innerHeight})`;
    move($('#work'), [{ transform: t, opacity: 0.2 }, { transform: 'none', opacity: 1 }], 340);
  }
}

async function create(name, building, pdf, project) {
  const view = await openPdf(pdf);
  const thumb = (await view.render(0, 240)).toDataURL('image/jpeg', 0.7);
  const sheets = view.pages;
  await view.close();
  const file = { id: uid(), name, building, project, thumb, updated: Date.now(), createdAt: Date.now(), summary: { sheets, elements: project.progress.items.length, percent: 0 } };
  await db.putBoth(file, pdf);
  navigator.storage?.persist?.();
  await open(file.id);
}

async function openProject(f) {
  if (!f) return;
  const { project, pdf } = decodePkp(new Uint8Array(await f.arrayBuffer()));
  const parts = f.name.replace(/\.pkp$/i, '').split('_');
  await create(f.name, parts.length > 2 ? parts.slice(2).join(' ') : '', pdf, project);
}

/** Berkas baru: pilih halaman, luruskan foto, lalu beri nama. */
async function newFile(files) {
  if (!files.length) return;
  const sources = [];
  for (const f of files) {
    if (isPdf(f)) sources.push({ bytes: new Uint8Array(await f.arrayBuffer()), name: f.name });
    else {
      const canvas = await straighten(f);
      if (canvas) sources.push({ bytes: await imageToPdf(await toBlob(canvas, 'image/jpeg', 0.92)), name: f.name.replace(/\.[^.]+$/, '.pdf'), image: true });
    }
  }
  if (!sources.length) return;
  toast('Membaca halaman…');
  const pages = [];
  for (const [s, src] of sources.entries()) {
    const view = await openPdf(src.bytes);
    for (let i = 0; i < view.pages; i++) pages.push({ s, i, on: true, thumb: (await view.render(i, 220)).toDataURL('image/jpeg', 0.7) });
    await view.close();
  }
  const v = await newDialog(pages);
  if (!v) return;
  const chosen = pages.filter((p) => p.on);
  const name = [v.discipline, v.work, v.building].map((x) => x.trim().replace(/[\\/:*?"<>|_]+/g, ' ')).filter(Boolean).join('_') || 'Berkas';
  // satu PDF utuh dipakai apa adanya, tanpa disusun ulang
  const intact = sources.length === 1 && chosen.length === pages.length;
  const names = chosen.map((_, k) => `Lantai ${k + 1}`);
  toast('Menyiapkan lembar…');
  const pdf = intact ? sources[0].bytes : await arrangePages(sources[0].bytes, chosen.map((p) => (p.s === 0 ? { from: p.i } : { pdf: sources[p.s].bytes, from: p.i })), chosen.length > 1 ? names : [null]);
  const project = emptyProject(`${name}.pdf`, chosen.length);
  await create(`${name}.pkp`, v.building.trim(), pdf, project);
}

const newDialog = (pages) => new Promise((resolve) => {
  const s = sheet({
    title: 'Berkas baru', sub: 'Nama: disiplin_pekerjaan_gedung', wide: true,
    body: `<div class="grid3"><label class="field">Disiplin<input name="discipline" placeholder="STR"></label><label class="field">Pekerjaan<input name="work" placeholder="Kolom"></label><label class="field">Gedung<input name="building" placeholder="Gedung A"></label></div>
      <p class="label">${pages.length} halaman. Ketuk untuk menyertakan atau membuang.</p>
      <div class="sheets">${pages.map((p, k) => `<button data-k="${k}" class="on"><img src="${p.thumb}" alt=""><b>Halaman ${k + 1}</b></button>`).join('')}</div>
      <div class="pair"><button class="soft" data-no>Batal</button><button class="solid" data-make>Buat ${pages.length} lembar</button></div>`,
    onClose: (v) => resolve(v ?? null),
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k !== undefined) {
      const p = pages[+b.dataset.k];
      p.on = !p.on;
      b.classList.toggle('on', p.on);
      const n = pages.filter((x) => x.on).length;
      const make = $('[data-make]', s.el);
      make.textContent = `Buat ${n} lembar`;
      make.disabled = !n;
    }
    if ('no' in b.dataset) s.close();
    if ('make' in b.dataset) s.close(Object.fromEntries($$('input', s.el).map((i) => [i.name, i.value])));
  });
});

W.applyTheme();
addEventListener('keydown', W.key);
addEventListener('keyup', W.keyUp);
addEventListener('resize', () => requestAnimationFrame(W.relayout));
// aplikasi latar bisa ditutup sistem tanpa pemberitahuan: simpan segera
addEventListener('visibilitychange', () => { if (document.hidden) W.flush(); W.getBoard()?.reset(); });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  const files = [...e.dataTransfer.files];
  if (!$('#home') || !files.length) return;
  try { if (/\.pkp$/i.test(files[0].name)) await openProject(files[0]); else await newFile(files); } catch (err) { console.error(err); toast(err.message); }
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
showHome().catch((e) => { app.textContent = `Tidak bisa membuka penyimpanan: ${e?.message ?? e}`; });
