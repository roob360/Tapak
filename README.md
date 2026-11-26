# Tapak

PWA peta progres lapangan di atas gambar denah, untuk tablet/iPad, desktop, dan HP.
Berkas proyek `.pkp` bisa dipakai bergantian dengan PDFKill desktop.

## Menjalankan

```bash
npm start      # http://localhost:5180
npm test
```

Tanpa langkah build dan tanpa `npm install`. Untuk dipasang di tablet dan dipakai offline,
folder ini harus disajikan lewat HTTPS (misalnya GitHub Pages).

## Struktur

| Berkas | Isi |
|---|---|
| `js/pkp.js`, `js/model.js` | format `.pkp`, aturan progres, susun dan putar lembar |
| `js/board.js` | kanvas, zoom, pen / sentuh / mouse |
| `js/work.js`, `js/panels.js` | papan kerja, panel dan dialog |
| `js/draw.js`, `js/ui.js` | gambar penanda dan coretan, lembar bergerak, roda pen |
| `js/auto.js`, `js/worker.js` | ruang otomatis, cari simbol, tempel ke garis |
| `js/pdf.js`, `js/export.js` | PDF dan Excel |
| `js/naming.js` | nama berkas ekspor |
| `js/report.js`, `js/page.js` | progres periode, volume, halaman laporan |
| `js/crop.js`, `js/warp.js`, `js/deskew.js` | koreksi foto miring dan pelurusan lembar scan |
| `js/cursor.js` | kursor per alat |
| `vendor/` | pdf.js (Apache-2.0), pdf-lib (MIT) |

Berkas baru di `js/` harus ditambahkan ke daftar di `sw.js`.

## Belum ada

- Hapus coretan sebagian (baru per goresan); geser dan ubah catatan, cap, atau awan yang sudah ditaruh.
  (Elemen progres sudah bisa digeser dan diubah sudutnya dengan alat Ubah di mode Petakan.)
- Urutkan lembar dengan seret (sekarang tombol geser kiri / kanan).
- Deteksi sudut kertas otomatis pada koreksi foto.
- Impor skala dari teks gambar, OCR, deteksi grid.
- Sinkron otomatis antarperangkat: pindahkan berkas lewat `.pkp`.

## Belum diuji

Perangkat asli (iPad, Apple Pencil, S Pen), dan buka-simpan bolak-balik di aplikasi PDFKill desktop
(yang diuji: berkas Tapak lolos pembaca `.pkp` PDFKill dari kode sumbernya).
Nama lembar disimpan sebagai bookmark PDF.
