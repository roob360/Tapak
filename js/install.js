// Pasang ke layar utama: dialog peramban bila ditawarkan, selain itu petunjuk sesuai perangkat.
import { esc, sheet } from './ui.js';

let prompt = null;
let changed = () => {};

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  prompt = e;
  changed();
});
addEventListener('appinstalled', () => {
  prompt = null;
  changed();
});

export const onInstallChange = (fn) => { changed = fn; };
export const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** Kenali perangkat dan peramban dari user agent. Murni. */
export function detect(ua, touchPoints = 0) {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const browser = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Telegram|; wv\)/.test(ua) ? 'dalam-aplikasi'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /EdgA?\/|EdgiOS/.test(ua) ? 'Edge'
    : /OPR\/|OPiOS/.test(ua) ? 'Opera'
    : /MiuiBrowser|HeyTapBrowser|VivoBrowser|HuaweiBrowser|UCBrowser/.test(ua) ? 'bawaan'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari' : 'lain';
  return { system: ios ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop', browser };
}

export function steps({ system, browser }) {
  if (browser === 'dalam-aplikasi') return ['Halaman ini dibuka di dalam aplikasi lain, yang tidak bisa memasang.', 'Buka menu di pojok, pilih "Buka di Chrome" atau "Buka di Safari".', 'Lalu ketuk lagi tombol Pasang aplikasi.'];
  if (system === 'ios') return ['Ketuk tombol Bagikan (kotak dengan panah ke atas) di bilah peramban.', 'Gulir ke bawah, pilih "Tambahkan ke Layar Utama".', 'Ketuk "Tambah". Bila pilihannya tidak ada, buka alamat ini di Safari.'];
  if (browser === 'Samsung Internet') return ['Ketuk menu (tiga garis) di bawah.', 'Pilih "Tambahkan halaman ke", lalu "Layar awal" atau "Layar utama".'];
  if (browser === 'Firefox') return ['Ketuk menu (tiga titik).', 'Pilih "Instal" atau "Tambahkan ke layar utama".', 'Bila tidak ada, buka alamat ini di Chrome.'];
  if (browser === 'Chrome' || browser === 'Edge') return ['Ketuk menu (tiga titik) di pojok.', 'Pilih "Instal aplikasi" atau "Tambahkan ke layar utama".', 'Bila tertulis "Buka aplikasi", Tapak sudah terpasang: cari di daftar aplikasi.'];
  return ['Peramban ini mungkin tidak bisa memasang aplikasi web.', 'Buka alamat yang sama di Chrome, lalu ketuk lagi tombol Pasang aplikasi.'];
}

export async function install() {
  if (prompt) {
    const event = prompt;
    prompt = null;
    await event.prompt();
    await event.userChoice;
    return changed();
  }
  const device = detect(navigator.userAgent, navigator.maxTouchPoints);
  sheet({
    title: 'Pasang aplikasi', sub: 'Peramban tidak menawarkan pemasangan otomatis',
    body: `<ol class="steps">${steps(device).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <p class="hint">Terbaca: ${esc(device.system)}, ${esc(device.browser)}${isSecureContext ? '' : ', alamat tidak aman (harus https)'}. Bila masih gagal, kirim tangkapan layar jendela ini.</p>`,
  });
}
