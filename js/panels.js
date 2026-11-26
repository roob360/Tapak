// Panel dan dialog papan kerja: elemen, tanggal, tahap, lembar, kuas, tampilan, rekap, pengaturan.
import * as M from './model.js';
import * as W from './work.js';
import { S, prefs, savePrefs, change, project } from './work.js'; // impor hidup: aman walau saling mengimpor
import { remapPages, rotatePage, encodePkp, finalize } from './pkp.js';
import { arrangePages, renamePages, reportPdf, imageToPdf, openPdf, toBlob } from './pdf.js';
import { toXlsx, deliver, safeName } from './export.js';
import { drawAnnotation } from './draw.js';
import { week, shift, periodReport, volumes } from './report.js';
import { recapPages, paintSheet, sheetImage } from './page.js';
import { pickFiles } from './pick.js';
import { straighten } from './crop.js';
import { straightenDialog } from './deskew.js';
import { $, $$, esc, icon, sheet, form, ask, choose, toast, move, stagger } from './ui.js';

let open = {}; // panel yang sedang tampil: nama -> api

const register = (name, api) => { open[name] = api; return api; };
export function refresh() {
  if (open.elements?.el.isConnected) renderElements(open.elements);
}

const pick = (list, attr, el) => list.forEach((x) => { const on = x === el; x.classList.toggle('solid', on); x.classList.toggle('soft', !on); });
const sw = (key, label, on) => `<div class="row"><span>${esc(label)}</span><button class="switch" data-sw="${key}" aria-pressed="${on}" aria-label="${esc(label)}"></button></div>`;

/* ---------- elemen ---------- */
let listFilter = 'semua', listAll = false;
export function elementsPanel() {
  const s = register('elements', sheet({ title: 'Elemen', kind: 'panel' }));
  renderElements(s);
  queueMicrotask(() => W.refresh());
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.filter) { listFilter = d.filter; renderElements(s); }
    else if (d.sw === 'all') { listAll = !listAll; renderElements(s); }
    else if (d.el) {
      const [page, raw] = d.el.split(':');
      const id = raw[0] === 'm' ? raw : +raw;
      if (+page !== S.page) await W.showPage(+page, Math.sign(+page - S.page));
      if (S.selected.has(id)) S.selected.delete(id); else { S.selected.add(id); W.pop([id]); }
      W.refresh();
    } else if (d.check) {
      const stage = d.check, list = W.selected(), all = list.every((x) => x.st?.[stage]);
      change(() => { for (const x of list) { const real = M.realize(project(), x); if (all) M.clearStages(W.stages(), real, stage); else if (!real.st?.[stage]) M.mark(W.stages(), real, stage, M.today(), prefs.sequential); S.selected.delete(x.id); S.selected.add(real.id); } });
      W.pop([...S.selected]);
    } else if (d.act === 'delete') W.deleteSelected();
    else if (d.act === 'date') dateDialog();
  });
  s.el.dataset.panel = 'elemen';
  s.el.addEventListener('change', (e) => {
    const t = e.target, list = W.selected();
    if (t.dataset.date) change(() => { for (const x of list) { const real = M.realize(project(), x); M.setStage(W.stages(), real, t.dataset.date, t.value || null); S.selected.delete(x.id); S.selected.add(real.id); } });
    if (t.dataset.name !== undefined) change(() => { const real = M.realize(project(), list[0]); if (t.value.trim()) real.label = t.value.trim(); else delete real.label; S.selected.clear(); S.selected.add(real.id); });
  });
  return s;
}
function renderElements(s) {
  if (document.activeElement && s.el.contains(document.activeElement) && document.activeElement.matches('input')) return;
  const p = project();
  const pages = listAll ? [...Array(S.view.pages).keys()] : [S.page];
  const rows = pages.flatMap((page) => M.allElements(p, page).map((el) => ({ page, el, stages: M.stagesOf(p, page) })))
    .filter((r) => listFilter === 'semua' || !M.doneStages(r.stages, r.el).length);
  const sel = W.selected(), st = W.stages(), sum = M.summary(p, S.page);
  const one = sel.length === 1 ? sel[0] : null;
  const name = (el, i) => el.label || (el.virtual ? 'Kandidat' : `${{ point: 'Titik', line: 'Garis', poly: 'Area' }[el.shape]} ${i + 1}`);
  const dots = (r) => r.stages.map((x) => `<i style="--c:${x.color}" class="dot${r.el.st?.[x.id] ? ' full' : ''}"></i>`).join('');
  const props = sel.length ? `<hr><h3>${one ? esc(one.label || 'Elemen terpilih') : `${sel.length} elemen terpilih`}<button class="link warn" data-act="delete">Hapus</button></h3>
    ${one ? `<label class="field">Nama<input data-name value="${esc(one.label ?? '')}"></label>${measure(one)}` : ''}
    ${st.map((x) => { const have = sel.filter((e) => e.st?.[x.id]).length; const date = sel.every((e) => e.st?.[x.id] === sel[0].st?.[x.id]) ? sel[0].st?.[x.id] ?? '' : ''; return `<div class="row"><button class="check" data-check="${esc(x.id)}" aria-pressed="${have === sel.length ? 'true' : have ? 'mixed' : 'false'}" aria-label="${esc(x.name)}">${icon('check')}</button><i class="dot full" style="--c:${x.color}"></i><span>${esc(x.name)}</span><input type="date" data-date="${esc(x.id)}" value="${date}" aria-label="Tanggal ${esc(x.name)}"></div>`; }).join('')}
    <button class="solid wide" data-act="date">Beri tanggal</button>` : '<p class="hint">Ketuk elemen di daftar atau di gambar.</p>';
  const top = s.body.scrollTop;
  s.update(`<p class="sub">${sum.n} elemen · ${sum.percent}% selesai · ${sum.pending} belum</p>
    <div class="line"><button class="${listFilter === 'semua' ? 'solid' : 'soft'}" data-filter="semua">Semua</button><button class="${listFilter === 'belum' ? 'solid' : 'soft'}" data-filter="belum">Belum</button><span class="grow">Semua lembar</span><button class="switch" data-sw="all" aria-pressed="${listAll}" aria-label="Semua lembar"></button></div>
    <div class="elements">${rows.slice(0, 200).map((r, i) => `<button data-el="${r.page}:${r.el.id}" class="${r.page === S.page && S.selected.has(r.el.id) ? 'on' : ''}${r.el.virtual ? ' ghost' : ''}"><b>${listAll ? `${r.page + 1} · ` : ''}${esc(name(r.el, i))}</b><span>${dots(r)}</span><em>${M.percent(r.stages, r.el)}%</em><em>${M.shortDate(r.el.date) || '—'}</em></button>`).join('') || '<p class="hint">Belum ada elemen.</p>'}</div>
    ${rows.length > 200 ? `<p class="hint">Ditampilkan 200 dari ${rows.length}.</p>` : ''}${props}`);
  s.body.scrollTop = top;
}
function measure(el) {
  const m = project().takeoff.scales?.[S.page];
  if (!m || el.shape === 'point') return '';
  const n = (v) => v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  let len = 0;
  for (let i = 1; i < el.pts.length; i++) len += Math.hypot(el.pts[i][0] - el.pts[i - 1][0], el.pts[i][1] - el.pts[i - 1][1]);
  if (el.shape === 'poly') len += Math.hypot(el.pts[0][0] - el.pts.at(-1)[0], el.pts[0][1] - el.pts.at(-1)[1]);
  const area = el.shape === 'poly' ? Math.abs(el.pts.reduce((a, q, i) => { const r = el.pts[(i + 1) % el.pts.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2 : 0;
  return `<p class="hint">Panjang ${n(len * m)} m${area ? ` · Luas ${n(area * m * m)} m²` : ''}</p>`;
}

/* ---------- beri dan hapus tanggal ---------- */
export function dateDialog() {
  const list = W.selected(), st = W.stages();
  if (!list.length) return toast('Pilih elemen dulu');
  if (!st.length) return stagesDialog(false);
  let stage = M.nextStage(st, list).id, date = M.today();
  const yesterday = M.today(new Date(Date.now() - 864e5));
  const s = sheet({
    title: 'Beri tanggal', sub: `${list.length} elemen terpilih di ${W.sheetName(S.page)}`,
    body: `<p class="label">Tahap (otomatis: yang berikutnya)</p><div class="grid2">${st.map((x) => `<button class="${x.id === stage ? 'solid' : 'soft'}" data-stage="${esc(x.id)}">${esc(x.name)}${list.every((e) => e.st?.[x.id]) ? ' ✓' : ''}</button>`).join('')}</div>
      <p class="label">Tanggal</p><div class="grid2"><button class="solid" data-day="${date}">Hari ini</button><button class="soft" data-day="${yesterday}">Kemarin</button></div>
      <label class="field">Tanggal lain<input type="date" value="${date}"></label>
      <div class="pair"><button class="soft" data-no>Batal</button><button class="solid" data-save>Simpan</button></div>`,
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.stage) { stage = b.dataset.stage; pick($$('[data-stage]', s.el), 'stage', b); }
    else if (b.dataset.day) { date = b.dataset.day; $('input[type=date]', s.el).value = date; pick($$('[data-day]', s.el), 'day', b); }
    else if ('no' in b.dataset) s.close();
    else if ('save' in b.dataset) {
      if (!date) return toast('Isi tanggalnya');
      const ids = [];
      change(() => { for (const x of list) { const real = M.realize(project(), x); M.mark(st, real, stage, date, prefs.sequential); ids.push(real.id); } });
      s.close();
      S.selected.clear();
      W.refresh();
      W.pop(ids);
      toast(`${ids.length} elemen diberi tanggal ${M.fmtDate(date)}`, { label: 'Urungkan', run: W.undo });
    }
  });
  $('input[type=date]', s.el).onchange = (e) => { date = e.target.value; pick($$('[data-day]', s.el), 'day', $(`[data-day="${date}"]`, s.el)); };
}
export async function undateDialog() {
  const list = W.selected(), st = W.stages();
  const stage = await choose('Hapus tanggal', [...st.map((x) => ({ id: x.id, label: x.name, icon: 'hingga' })), { id: '*', label: 'Semua tahap', icon: 'trash', danger: true }], `${list.length} elemen terpilih`);
  if (!stage) return;
  change(() => { for (const x of list) if (!x.virtual) M.clearStages(st, x, stage === '*' ? null : stage); });
}
export async function elementMenu() {
  const id = await choose('Elemen terpilih', [
    { id: 'copy', label: 'Salin ke lembar lain', icon: 'salin' }, { id: 'number', label: 'Nomori berurutan', icon: 'nomor' }, { id: 'split', label: 'Pecah jadi dua sisi', icon: 'sisi' },
    { id: 'undated', label: 'Pilih yang belum bertanggal', icon: 'pilih' }, { id: 'all', label: 'Pilih semua', icon: 'pilih' }, { id: 'list', label: 'Daftar dan rincian', icon: 'elemen' },
  ]);
  if (id === 'copy') copyDialog();
  if (id === 'number') autoNumber();
  if (id === 'split') splitSides();
  if (id === 'undated') selectWhere((e) => !e.date);
  if (id === 'all') selectWhere(() => true);
  if (id === 'list') elementsPanel();
}
function selectWhere(test) {
  S.selected = new Set(W.elements().filter(test).map((e) => e.id));
  W.refresh();
}
export async function autoNumber() {
  const list = S.selected.size ? W.selected() : W.elements();
  if (!list.length) return toast('Belum ada elemen');
  const v = await form(`Nomori ${list.length} elemen`, [{ key: 'prefix', label: 'Awalan (mis. K-)', value: '' }, { key: 'start', label: 'Mulai dari', value: '1', type: 'number' }], 'Nomori', 'Urutan: atas ke bawah, kiri ke kanan');
  if (!v) return;
  change(() => { const real = list.map((x) => M.realize(project(), x)); M.numberElements(real, v.prefix, Number(v.start) || 1, Math.max(...S.view.sizes[S.page]) / 60); S.selected.clear(); });
}
export async function splitSides() {
  const list = W.selected().filter((e) => e.shape === 'line');
  if (!list.length) return toast('Pilih satu atau beberapa elemen garis dulu');
  const m = project().takeoff.scales?.[S.page];
  const v = await form('Pecah jadi dua sisi', [{ key: 'gap', label: m ? 'Jarak antar sisi (cm)' : 'Jarak antar sisi (titik gambar)', value: m ? '15' : '12', type: 'number' }], 'Pecah');
  const gap = Number(v?.gap);
  if (!(gap > 0)) return;
  S.selected.clear();
  change(() => { for (const el of list) M.splitSides(project(), el, m ? gap / 100 / m : gap); });
}

/* ---------- salin ke lembar lain ---------- */
export function copyDialog() {
  const list = S.selected.size ? W.selected() : W.elements();
  if (!list.length) return toast('Lembar ini belum punya elemen');
  if (S.view.pages < 2) return toast('Berkas hanya punya satu lembar. Tambah lewat Kelola lembar.');
  const others = Array.from({ length: S.view.pages }, (_, i) => i).filter((i) => i !== S.page);
  const chosen = new Set();
  const s = sheet({
    title: 'Salin ke lembar lain', sub: `${list.length} elemen${S.selected.size ? ' terpilih' : ' (semua di lembar ini)'}, tanpa tanggal`,
    body: `<div class="chips">${others.map((i) => `<button class="soft" data-page="${i}" aria-pressed="false">${esc(W.sheetName(i))}</button>`).join('')}</div>
      <button class="link" data-all>Pilih semua lembar</button>
      <div class="pair"><button class="soft" data-no>Batal</button><button class="solid" data-go disabled>Salin</button></div>`,
  });
  const paint = () => {
    for (const b of $$('[data-page]', s.el)) {
      const on = chosen.has(+b.dataset.page);
      b.classList.toggle('solid', on);
      b.classList.toggle('soft', !on);
      b.setAttribute('aria-pressed', on);
    }
    const go = $('[data-go]', s.el);
    go.disabled = !chosen.size;
    go.textContent = chosen.size ? `Salin ke ${chosen.size} lembar` : 'Salin';
  };
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.page !== undefined) { const i = +b.dataset.page; if (chosen.has(i)) chosen.delete(i); else chosen.add(i); paint(); }
    if ('all' in b.dataset) { others.forEach((i) => chosen.add(i)); paint(); }
    if ('no' in b.dataset) s.close();
    if ('go' in b.dataset) {
      let made = 0;
      change(() => { made = M.copyElements(project(), list, [...chosen], S.view.sizes); });
      s.close();
      toast(made ? `${made} elemen disalin ke ${chosen.size} lembar` : 'Tidak ada yang disalin: elemen sudah ada di sana', made ? { label: 'Urungkan', run: W.undo } : undefined);
    }
  });
  return s;
}

/* ---------- tahap ---------- */
export function stagesDialog(first) {
  const p = project(), now = M.sheetOf(p, S.page) ?? Object.values(p.progress.sheets)[0];
  const row = (x) => `<div class="stage-row" data-id="${esc(x.id)}"><input type="color" value="${x.color}" aria-label="Warna"><input value="${esc(x.name)}" aria-label="Nama tahap" maxlength="60"><button class="soft round" data-up aria-label="Naikkan">${icon('up')}</button><button class="soft round" data-del aria-label="Hapus">${icon('trash')}</button></div>`;
  const s = sheet({
    title: first ? 'Atur tahap pekerjaan' : 'Atur tahap', sub: 'Satu berkas satu pekerjaan',
    body: `<label class="field">Nama pekerjaan<input id="work-name" value="${esc(now?.work ?? '')}" placeholder="mis. Kolom" maxlength="60"></label>
      <p class="label">Isi cepat</p><div class="chips">${Object.keys(M.PRESETS).map((n) => `<button class="soft" data-preset="${n}">${n}</button>`).join('')}</div>
      <p class="label">Tahap, urut dari awal ke akhir</p><div id="rows">${(now?.stages ?? []).map(row).join('')}</div><button class="link" data-add>+ Tambah tahap</button>
      <p class="label">Berlaku untuk</p><div class="grid2"><button class="solid" data-scope="all">Semua lembar</button><button class="soft" data-scope="one">Lembar ini saja</button></div>
      <div class="pair"><button class="soft" data-no>Nanti</button><button class="solid" data-save>Simpan</button></div>`,
  });
  let scope = 'all';
  const rows = $('#rows', s.el);
  const fresh = () => { let n = 1; const used = new Set($$('.stage-row', rows).map((r) => r.dataset.id)); while (used.has(`s${n}`)) n++; return `s${n}`; };
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.preset) {
      $('#work-name', s.el).value = d.preset;
      const old = $$('.stage-row', rows).map((r) => r.dataset.id); // id dipertahankan menurut urutan agar tanggal tidak hilang
      rows.innerHTML = M.PRESETS[d.preset].map((name, i) => row({ id: old[i] ?? `s${i + 1}`, name, color: M.COLORS[i] })).join('');
      stagger($$('.stage-row', rows));
    } else if ('add' in d) {
      rows.insertAdjacentHTML('beforeend', row({ id: fresh(), name: '', color: M.COLORS[rows.children.length % M.COLORS.length] }));
      $('input:not([type=color])', rows.lastElementChild).focus();
    } else if ('del' in d) b.closest('.stage-row').remove();
    else if ('up' in d) { const r = b.closest('.stage-row'); if (r.previousElementSibling) { rows.insertBefore(r, r.previousElementSibling); move(r, [{ translate: '0 52px' }, { translate: '0 0' }]); } }
    else if (d.scope) { scope = d.scope; pick($$('[data-scope]', s.el), 'scope', b); }
    else if ('no' in d) s.close();
    else if ('save' in d) {
      const work = $('#work-name', s.el).value.trim() || 'Pekerjaan';
      const names = new Set();
      const stages = $$('.stage-row', rows).map((r) => ({ id: r.dataset.id, color: $('[type=color]', r).value.toLowerCase(), name: $('input:not([type=color])', r).value.trim() }))
        .filter((x) => x.name && !names.has(x.name.toLowerCase()) && names.add(x.name.toLowerCase())).slice(0, 20);
      if (!stages.length) return toast('Isi minimal satu tahap');
      const pages = scope === 'all' ? [...Array(S.view.pages).keys()] : [S.page];
      const keep = new Set(stages.map((x) => x.id));
      const lost = pages.some((page) => M.elementsOn(p, page).some((el) => Object.keys(el.st ?? {}).some((id) => !keep.has(id))));
      if (lost && !(await ask('Hapus tahap terisi?', 'Ada tanggal pada tahap yang dihapus. Tanggal itu ikut terhapus.', 'Hapus', true))) return;
      change(() => {
        for (const page of pages) {
          project().progress.sheets[page] = { work, stages: structuredClone(stages) };
          for (const el of M.elementsOn(project(), page)) {
            for (const id of Object.keys(el.st ?? {})) if (!keep.has(id)) delete el.st[id];
            if (el.date && !el.st) el.st = { [stages[0].id]: el.date }; // penanda lama tanpa tahap
            M.setStage(stages, el, stages[0].id, el.st?.[stages[0].id] ?? null);
          }
        }
      });
      s.close();
    }
  });
}

/* ---------- kelola lembar ---------- */
export function sheetsDialog() {
  let current = S.page;
  const s = sheet({ title: 'Kelola lembar', wide: true });
  const render = () => {
    s.update(`<p class="sub">${S.view.pages} lembar</p><div class="sheets">${Array.from({ length: S.view.pages }, (_, i) => { const sum = M.summary(project(), i); return `<button data-page="${i}" class="${i === current ? 'on' : ''}"><img alt=""><b>${esc(W.sheetName(i))}</b><small>${sum.n ? `${sum.n} elemen` : 'belum dipetakan'} · ${sum.percent}%</small></button>`; }).join('')}<button class="add" data-act="add">${icon('plus')}<b>Tambah lembar</b><small>PDF, foto, atau kosong</small></button></div>
      <p class="label">${esc(W.sheetName(current))} terpilih</p>
      <div class="chips"><button class="soft" data-act="open">Buka</button><button class="soft" data-act="left">Geser kiri</button><button class="soft" data-act="right">Geser kanan</button><button class="soft" data-act="rename">Ganti nama</button><button class="soft" data-act="copy">Duplikat</button><button class="soft" data-act="rotate">Putar</button><button class="soft" data-act="deskew">Luruskan</button><button class="soft warn" data-act="delete">Hapus</button></div>`);
    $$('[data-page] img', s.el).forEach(async (img, i) => { img.src = await W.thumb(i); });
  };
  render();
  let working = false;
  /** Susun ulang halaman; semua data per halaman ikut pindah. */
  const apply = async (order, { copy = 'all', rotate = new Set(), extra = null, names: custom } = {}) => {
    const plan = order.map((from, i) => (from != null ? { from } : extra[i]));
    const names = custom ?? order.map((from) => (from != null ? S.names[from] : null));
    let next = remapPages(project(), order, copy);
    for (const i of rotate) next = rotatePage(next, i, S.view.sizes[order[i]][1]);
    // lembar baru ikut tahap berkas
    const conf = Object.values(project().progress.sheets)[0];
    if (conf) order.forEach((from, i) => { if (from == null) next.progress.sheets[i] = structuredClone(conf); });
    toast('Menyusun lembar…');
    await W.changePdf(await arrangePages(S.pdf, plan, names, rotate), next);
    toast('Lembar diperbarui', { label: 'Urungkan', run: W.undo });
  };
  const identity = () => [...Array(S.view.pages).keys()];
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || working) return;
    if (b.dataset.page !== undefined) { current = +b.dataset.page; return render(); }
    const act = b.dataset.act;
    if (!act) return;
    working = true;
    try {
      const order = identity();
      if (act === 'open') { s.close(); await W.showPage(current, Math.sign(current - S.page)); return; }
      if (act === 'left' || act === 'right') {
        const to = current + (act === 'left' ? -1 : 1);
        if (to < 0 || to >= order.length) return;
        [order[current], order[to]] = [order[to], order[current]];
        await apply(order);
        current = to;
      } else if (act === 'rename') {
        const v = await form('Nama lembar', [{ key: 'name', label: 'Nama', value: W.sheetName(current) }]);
        if (!v) return;
        const names = identity().map((i) => (i === current ? v.name.trim() : S.names[i]));
        await W.changePdf(await renamePages(S.pdf, names), structuredClone(project()));
      } else if (act === 'copy') {
        const what = await choose('Yang disalin', [{ id: 'all', label: 'Gambar dan data progres', icon: 'salin' }, { id: 'stages', label: 'Gambar dan tahap saja', icon: 'salin' }, { id: 'none', label: 'Gambar saja', icon: 'foto' }]);
        if (!what) return;
        order.splice(current + 1, 0, current);
        await apply(order, { copy: what, names: order.map((i, k) => (k === current + 1 ? `${W.sheetName(i)} salinan` : S.names[i])) });
        current += 1;
      } else if (act === 'deskew') { s.close(); await W.showPage(current, Math.sign(current - S.page)); await straightenDialog(); return; }
      else if (act === 'rotate') await apply(order, { rotate: new Set([current]) });
      else if (act === 'delete') {
        if (order.length === 1) return toast('Berkas harus punya minimal satu lembar');
        if (!(await ask('Hapus lembar?', `${W.sheetName(current)} dan semua penandanya dihapus.`, 'Hapus', true))) return;
        order.splice(current, 1);
        await apply(order);
        current = Math.min(current, order.length - 1);
      } else if (act === 'add') {
        const how = await choose('Tambah lembar', [{ id: 'file', label: 'Dari PDF atau foto', icon: 'berkas' }, { id: 'blank', label: 'Halaman kosong', icon: 'kotak' }]);
        if (!how) return;
        const extra = [];
        if (how === 'blank') { extra[order.length] = { blank: [...S.view.sizes[current]] }; order.push(null); }
        else {
          for (const file of await pickFiles('application/pdf,.pdf,image/*', true)) {
            let bytes;
            if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) bytes = new Uint8Array(await file.arrayBuffer());
            else { const canvas = await straighten(file); if (!canvas) continue; bytes = await imageToPdf(await toBlob(canvas, 'image/jpeg', 0.92)); }
            const view = await openPdf(bytes);
            for (let i = 0; i < view.pages; i++) { extra[order.length] = { pdf: bytes, from: i }; order.push(null); }
            await view.close();
          }
          if (!extra.length) return;
        }
        await apply(order, { extra });
        current = order.length - 1;
      }
      render();
    } catch (err) { console.error(err); toast(`Gagal: ${err.message}`); } finally { working = false; }
  });
}

/* ---------- kuas ---------- */
const BRUSHES = [['pulpen', 'Pulpen', 2.5, 1, 0.7], ['spidol', 'Spidol', 5, 1, 0.3], ['pensil', 'Pensil', 1.5, 0.8, 0.8], ['stabilo', 'Stabilo', 14, 0.4, 0], ['garis', 'Garis', 2.5, 1, 0], ['panah', 'Panah', 2.5, 1, 0], ['kotakgambar', 'Kotak', 2.5, 1, 0]];
const INK = ['#1c1c1e', '#ff383c', '#ff8d28', '#ffd60a', '#1f9d55', '#7c3aed', '#ffffff'];
export function brushes() {
  const f = W.favorite();
  const slider = (key, label, min, max, step) => `<label class="range">${label}<input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${f[key]}"><output>${f[key]}</output></label>`;
  const s = sheet({
    title: 'Kuas', kind: 'panel', sub: 'Perubahan tersimpan pada favorit yang aktif',
    body: `<div class="chips">${prefs.favorites.map((x, i) => `<button class="${i === S.fav ? 'solid' : 'soft'}" data-fav="${i}">${esc(x.name)}</button>`).join('')}</div>
      <div class="tiles">${BRUSHES.map(([id, label]) => `<button class="${f.brush === id ? 'solid' : 'soft'}" data-brush="${id}">${icon({ garis: 'garis', panah: 'panah', kotakgambar: 'kotak' }[id] ?? id)}<span>${label}</span></button>`).join('')}</div>
      <canvas class="preview" width="640" height="90"></canvas>
      ${slider('size', 'Tebal', 0.5, 30, 0.5)}${slider('op', 'Pekat', 0.1, 1, 0.05)}${slider('pressure', 'Peka tekanan', 0, 1, 0.05)}${slider('smooth', 'Penstabil', 0, 1, 0.05)}
      <div class="swatches">${INK.map((c) => `<button style="background:${c}" data-color="${c}" aria-label="Warna ${c}" aria-pressed="${f.color === c}"></button>`).join('')}<input type="color" value="${f.color}" aria-label="Warna lain"></div>
      <label class="field">Nama favorit<input data-fname value="${esc(f.name)}" maxlength="10"></label>`,
  });
  const preview = () => {
    const c = $('.preview', s.el), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const x = W.favorite();
    const pts = Array.from({ length: 40 }, (_, i) => [30 + i * 15, 45 + Math.sin(i / 5) * 24]);
    drawAnnotation(g, { type: 'pen', brush: x.brush, color: x.color, size: x.size * 2, op: x.op, pts, pr: x.pressure ? pts.map((_, i) => 0.5 + Math.sin((i / 40) * Math.PI) * 0.4 * x.pressure) : undefined });
  };
  const done = () => { savePrefs(); preview(); W.setMode('gambar', `fav${S.fav}`); };
  preview();
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.fav) { S.fav = +b.dataset.fav; s.close(); W.setMode('gambar', `fav${S.fav}`); return brushes(); }
    if (b.dataset.brush) {
      const [id, , size, op, pressure] = BRUSHES.find((x) => x[0] === b.dataset.brush);
      Object.assign(W.favorite(), { brush: id, size, op, pressure });
      pick($$('[data-brush]', s.el), 'brush', b);
      for (const [k, v] of Object.entries({ size, op, pressure })) { const i = $(`[data-k="${k}"]`, s.el); i.value = v; i.nextElementSibling.value = v; }
      done();
    }
    if (b.dataset.color) { W.favorite().color = b.dataset.color; $$('[data-color]', s.el).forEach((x) => x.setAttribute('aria-pressed', x === b)); done(); }
  });
  s.el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.k) { W.favorite()[t.dataset.k] = Number(t.value); t.nextElementSibling.value = t.value; }
    else if (t.type === 'color') W.favorite().color = t.value;
    else if ('fname' in t.dataset) W.favorite().name = t.value.trim() || 'Kuas';
    else return;
    done();
  });
  return s;
}

/* ---------- hasil cari simbol ---------- */
export function found() {
  const f = S.found;
  if (!f) return;
  if (!open.found?.el.isConnected) {
    const s = register('found', sheet({ title: 'Cari simbol', kind: 'panel', onClose: () => { if (S.found && !S.found.keep) W.cancelFound(); } }));
    s.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !S.found) return;
      if (b.dataset.scope) { S.found.all = b.dataset.scope === 'all'; W.search(); }
      if (b.dataset.act === 'accept') W.acceptFound();
      if (b.dataset.act === 'cancel') s.close();
    });
    s.el.addEventListener('change', (e) => { if (S.found && e.target.type === 'range') { S.found.similarity = prefs.similarity = Number(e.target.value); savePrefs(); W.search(); } });
  }
  const n = f.list.filter((c) => c.on).length;
  open.found.update(`<p class="sub">${f.list.length} ditemukan dari ${f.samples.length} contoh</p>
    <p class="label">Cari di</p><div class="grid2"><button class="${f.all ? 'soft' : 'solid'}" data-scope="one">Lembar ini</button><button class="${f.all ? 'solid' : 'soft'}" data-scope="all">Semua lembar</button></div>
    <label class="range">Kemiripan<input type="range" min="55" max="95" step="5" value="${f.similarity}"><output>${f.similarity}%</output></label>
    <p class="hint">Ketuk kotak di gambar untuk membuang yang salah. Tarik kotak lain untuk menambah contoh. Hasil menjadi kandidat, belum masuk rekap.</p>
    <div class="pair"><button class="soft" data-act="cancel">Batal</button><button class="solid" data-act="accept" ${n ? '' : 'disabled'}>Terima ${n}</button></div>`);
}

/* ---------- tampilan ---------- */
export function viewPanel(focus) {
  const p = project();
  const legend = p.progress.legend;
  const mode = (id, label) => `<button class="${prefs.colorMode === id ? 'solid' : 'soft'}" data-color="${id}">${label}</button>`;
  const alpha = Math.round(prefs.alpha * 100), scale = Math.round((legend.scale ?? 1) * 100);
  const s = sheet({
    title: 'Tampilan dan legenda', kind: 'panel',
    body: `<p class="label">Warna penanda</p><div class="grid2">${mode('tahap', 'Menurut tahap')}${mode('tanggal', 'Menurut tanggal')}</div>
      <label class="range">Kepekatan<input type="range" data-k="alpha" min="0" max="100" step="5" value="${alpha}"><output>${alpha}%</output></label>
      <div class="chips">${[[20, 'Tipis'], [35, 'Nyaman'], [65, 'Tebal'], [100, 'Penuh']].map(([v, n]) => `<button class="soft" data-alpha="${v}">${n}</button>`).join('')}</div>
      <p class="label">Tulisan di penanda</p>${sw('pct', 'Persen progres', prefs.pct)}${sw('dates', 'Tanggal', prefs.dates)}${sw('names', 'Nama elemen', prefs.names)}${sw('labelTop', 'Label area di tepi atas', prefs.labelTop)}
      <p class="label">Legenda</p>${sw('legend', 'Tampilkan legenda', legend.on !== false)}
      <label class="range">Ukuran<input type="range" data-k="scale" min="50" max="400" step="10" value="${scale}"><output>${scale}%</output></label>
      <div class="grid2">${[['atas-kiri', 'Kiri atas'], ['atas-kanan', 'Kanan atas'], ['bawah-kiri', 'Kiri bawah'], ['bawah-kanan', 'Kanan bawah']].map(([v, n]) => `<button class="soft" data-corner="${v}">${n}</button>`).join('')}</div>
      ${sw('allsheets', 'Posisi berlaku untuk semua lembar', false)}
      <p class="hint">Di gambar: seret legenda untuk memindah, seret bulatan di sudutnya untuk mengubah ukuran (mode Progres).</p>
      <p class="label">Lainnya</p>${sw('show', 'Tampilkan penanda', p.progress.show !== false)}${sw('notes', 'Tampilkan coretan', p.annotations.show !== false)}${sw('sequential', 'Tahap berurutan (isi yang sebelumnya)', prefs.sequential)}
      <label class="field">Kondisi hingga tanggal<input type="date" value="${S.until ?? ''}"></label><button class="soft wide" data-clear>Tampilkan semua tanggal</button>
      <p class="label">Sorot satu tahap</p><div class="chips">${W.stages().map((x) => `<button class="${S.filter === x.id ? 'solid' : 'soft'}" data-filter="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>`,
  });
  const setAlpha = (v) => {
    prefs.alpha = v / 100;
    savePrefs();
    const input = $('[data-k="alpha"]', s.el);
    input.value = v;
    input.nextElementSibling.value = `${v}%`;
    W.refresh();
  };
  let before = null;
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.alpha) return setAlpha(Number(d.alpha));
    if (d.corner) return W.placeLegend(d.corner, $('[data-sw="allsheets"]', s.el).getAttribute('aria-pressed') === 'true');
    if (d.color) { prefs.colorMode = d.color; savePrefs(); pick($$('[data-color]', s.el), 'color', b); }
    else if (d.sw) {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', on);
      if (d.sw === 'allsheets') return;
      if (d.sw === 'show') change(() => { project().progress.show = on; });
      else if (d.sw === 'notes') change(() => { project().annotations.show = on; });
      else if (d.sw === 'legend') change(() => { project().progress.legend.on = on; });
      else { prefs[d.sw] = on; savePrefs(); }
    } else if ('clear' in d) { S.until = null; $('input[type=date]', s.el).value = ''; }
    else if (d.filter) { S.filter = S.filter === d.filter ? null : d.filter; $$('[data-filter]', s.el).forEach((x) => { x.classList.toggle('solid', x.dataset.filter === S.filter); x.classList.toggle('soft', x.dataset.filter !== S.filter); }); }
    else return;
    W.refresh();
  });
  s.el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.k === 'alpha') setAlpha(Number(t.value));
    if (t.dataset.k === 'scale') {
      before ??= JSON.stringify(project().progress.legend);
      project().progress.legend.scale = Number(t.value) / 100;
      t.nextElementSibling.value = `${t.value}%`;
      W.getBoard().redraw();
    }
  });
  // geser ukuran dicatat sebagai satu langkah urungkan saat dilepas
  s.el.addEventListener('change', (e) => {
    if (e.target.dataset.k !== 'scale' || before === null) return;
    const now = project().progress.legend.scale;
    project().progress.legend = JSON.parse(before);
    before = null;
    change(() => { project().progress.legend.scale = now; });
  });
  $('input[type=date]', s.el).onchange = (e) => { S.until = e.target.value || null; W.refresh(); };
  if (focus === 'hingga') requestAnimationFrame(() => $('input[type=date]', s.el).scrollIntoView({ block: 'center', behavior: 'smooth' }));
  return s;
}

/* ---------- pengaturan ---------- */
export function settings() {
  const s = sheet({
    title: 'Pengaturan', kind: 'panel',
    body: `${sw('leftHand', 'Mode tangan kiri', prefs.leftHand)}${sw('finger', 'Jari ikut menggambar', prefs.finger)}${sw('straighten', 'Rapikan bentuk saat ditahan', prefs.straighten)}${sw('wheel', 'Roda pen', prefs.wheel)}${sw('snap', 'Tempel ke garis gambar', prefs.snap)}${sw('strip', 'Daftar lembar', prefs.strip)}
      <p class="label">Tampilan</p><div class="chips">${['sistem', 'terang', 'gelap'].map((t) => `<button class="${prefs.theme === t ? 'solid' : 'soft'}" data-theme="${t}">${t[0].toUpperCase()}${t.slice(1)}</button>`).join('')}</div>
      <p class="hint">Ketuk dua jari: urungkan. Tiga jari: ulangi. Tombol samping pen atau tahan jari: roda pen. Keyboard: V pilih, T titik, G garis, A area, K kotak, R ruang, S cari, C coret, B kuas, Enter, Del, Ctrl+Z, Ctrl+S, PageUp/PageDown.</p>`,
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.sw) { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); prefs[b.dataset.sw] = on; }
    else if (b.dataset.theme) { prefs.theme = b.dataset.theme; pick($$('[data-theme]', s.el), 'theme', b); W.applyTheme(); }
    else return;
    savePrefs();
    W.layout();
  });
}

/* ---------- rekap dan hasil ---------- */
export async function savePkp() {
  await W.flush();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', S.pdf))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const pdfName = project().pdf.name || `${S.file.name.replace(/\.pkp$/i, '')}.pdf`;
  await deliver(encodePkp(finalize(project(), pdfName, S.view.pages, hash), S.pdf), `${safeName(S.file.name.replace(/\.pkp$/i, ''))}.pkp`, 'application/x-pdfkill-project');
  S.file.backupAt = Date.now();
  await W.flush();
}
const paintOptions = () => ({ until: S.until, mode: prefs.colorMode, dates: prefs.dates, pct: prefs.pct, names: prefs.names, alpha: prefs.alpha, labelTop: prefs.labelTop, period: S.period, notes: project().annotations.show !== false });
const num = (v) => (v ? v.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '—');

export function recap() {
  const p = project();
  const names = Array.from({ length: S.view.pages }, (_, i) => W.sheetName(i));
  const base = safeName(S.file.name.replace(/\.pkp$/i, ''));
  const sums = names.map((_, i) => M.summary(p, i));
  const done = sums.reduce((a, x) => a + x.counts.reduce((q, v) => q + v, 0), 0), total = sums.reduce((a, x) => a + x.n * x.stages.length, 0);
  const vol = volumes(p, S.view.pages, S.until);
  let period = S.period ?? week(M.today());
  let preset = S.period ? 'lain' : 'ini';
  const s = sheet({
    title: 'Rekap progres', wide: true, sub: `${sums.reduce((a, x) => a + x.n, 0)} elemen · ${total ? Math.round((done / total) * 100) : 0}% selesai`,
    body: `<p class="label">Progres periode</p>
      <div class="chips"><button data-preset="ini">Minggu ini</button><button data-preset="lalu">Minggu lalu</button><button data-preset="30">30 hari</button></div>
      <div class="grid2"><label class="field">Dari<input type="date" data-from></label><label class="field">Sampai<input type="date" data-to></label></div>
      <div data-period></div>
      <p class="label">Per lembar (keseluruhan)</p>
      <div class="table"><table><thead><tr><th>Lembar</th><th>Elemen</th><th>Tahap selesai</th><th>Progres</th></tr></thead><tbody>${sums.map((x, i) => `<tr><td>${esc(names[i])}</td><td>${x.n}</td><td>${x.stages.map((st, k) => `<span class="tag"><i class="dot full" style="--c:${st.color}"></i>${esc(st.name)} ${x.counts[k]}</span>`).join('') || '—'}</td><td><b>${x.percent}%</b><div class="meter"><i style="width:${x.percent}%"></i></div></td></tr>`).join('')}</tbody></table></div>
      <p class="label">Volume selesai per tahap</p>
      <div class="table"><table><thead><tr><th>Tahap</th><th>Elemen</th><th>Panjang (m)</th><th>Luas (m²)</th></tr></thead><tbody>${vol.rows.map((r) => `<tr><td><i class="dot full" style="--c:${r.color}"></i> ${esc(r.name)}</td><td>${r.count}</td><td>${num(r.length)}</td><td>${num(r.area)}</td></tr>`).join('') || '<tr><td colspan="4">Belum ada tahap.</td></tr>'}</tbody></table></div>
      ${vol.unscaled ? '<p class="hint">Ada garis atau area di lembar yang belum diskala. Atur lewat Otomatis → Skala agar masuk hitungan.</p>' : ''}
      <p class="label">Per tanggal</p><div class="chips">${M.byDate(p).map(([d, n]) => `<span class="tag">${M.fmtDate(d)}: ${n}</span>`).join('') || '<span class="hint">Belum ada tanggal.</span>'}</div>
      <div class="cards3"><button data-act="pdf">${icon('berkas')}<b>Laporan PDF</b><small>rekap dan gambar</small></button><button data-act="png">${icon('share')}<b>Bagikan gambar</b><small>lembar ini</small></button><button data-act="xlsx">${icon('rekap')}<b>Excel</b><small>rumus hidup</small></button><button data-act="pkp">${icon('salin')}<b>Simpan .pkp</b><small>cadangan, lanjut di desktop</small></button></div>`,
  });
  const showPeriod = () => {
    const r = periodReport(p, S.view.pages, period.from, period.to);
    $('[data-from]', s.el).value = period.from;
    $('[data-to]', s.el).value = period.to;
    for (const b of $$('[data-preset]', s.el)) b.className = b.dataset.preset === preset ? 'solid' : 'soft';
    $('[data-period]', s.el).innerHTML = `<p class="big"><b>${r.after}%</b> <span>dari ${r.before}% · bertambah ${r.after - r.before} poin · ${r.total} tahap selesai</span></p>
      <div class="table"><table><thead><tr><th>Lembar</th><th>Sebelum</th><th>Sesudah</th><th>Selesai di periode ini</th></tr></thead><tbody>${r.rows.map((x) => `<tr><td>${esc(names[x.page])}</td><td>${x.before}%</td><td><b>${x.after}%</b></td><td>${x.stages.map((st, k) => (x.added[k] ? `<span class="tag"><i class="dot full" style="--c:${st.color}"></i>${esc(st.name)} ${x.added[k]}</span>` : '')).join('') || '—'}</td></tr>`).join('') || '<tr><td colspan="4">Belum ada elemen.</td></tr>'}</tbody></table></div>
      <button class="soft wide" data-act="highlight" ${r.total ? '' : 'disabled'}>Sorot di gambar yang dikerjakan periode ini</button>`;
  };
  showPeriod();
  s.el.addEventListener('change', (e) => {
    if (e.target.matches('[data-from], [data-to]')) {
      const from = $('[data-from]', s.el).value, to = $('[data-to]', s.el).value;
      if (!from || !to) return;
      period = from <= to ? { from, to } : { from: to, to: from };
      preset = 'lain';
      showPeriod();
    }
  });
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.preset) {
      preset = b.dataset.preset;
      period = preset === 'ini' ? week(M.today()) : preset === 'lalu' ? week(M.today(), 1) : { from: shift(M.today(), -29), to: M.today() };
      return showPeriod();
    }
    const act = b.dataset.act;
    if (!act) return;
    try {
      if (act === 'highlight') { S.period = { ...period }; s.close(); W.refresh(); }
      if (act === 'pkp') await savePkp();
      if (act === 'xlsx') await deliver(toXlsx(p, names, S.until), `${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (act === 'png') {
        const sum = M.summary(p, S.page, S.until);
        const canvas = await sheetImage(S.view, p, S.page, `${base.replaceAll('_', ' · ')} · ${W.sheetName(S.page)} · ${sum.percent}% · ${M.fmtDate(S.until ?? M.today())}`, { ...paintOptions(), period: null });
        await deliver(new Uint8Array(await (await toBlob(canvas)).arrayBuffer()), `${base} ${safeName(W.sheetName(S.page))}.png`, 'image/png');
      }
      if (act === 'pdf') {
        const pages = names.map((_, i) => i).filter((i) => M.elementsOn(p, i).some((x) => x.date));
        if (!pages.length) return toast('Belum ada elemen bertanggal');
        s.close();
        const head = await form('Kop laporan', [{ key: 'title', label: 'Judul', value: S.file.title ?? `Laporan progres ${base.replaceAll('_', ' ')}` }, { key: 'author', label: 'Disusun oleh', value: prefs.author }], 'Buat PDF', `Periode ${M.fmtDate(period.from)} sampai ${M.fmtDate(period.to)}`);
        if (!head) return;
        S.file.title = head.title.trim();
        prefs.author = head.author.trim();
        savePrefs();
        await W.flush();
        toast('Menyusun PDF…');
        const front = recapPages({ title: S.file.title || 'Laporan progres', author: prefs.author, period, names, report: periodReport(p, S.view.pages, period.from, period.to), volumes: volumes(p, S.view.pages, S.until) });
        const pdf = await reportPdf(S.view, pages, (page, g) => paintSheet(g, p, page, S.view.sizes[page], { ...paintOptions(), period: null, notes: false }), front);
        await deliver(pdf, `${base}-progres.pdf`, 'application/pdf');
      }
    } catch (err) { console.error(err); toast(`Gagal: ${err.message}`); }
  });
  return s;
}
