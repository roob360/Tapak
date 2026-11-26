// Nama berkas ekspor disusun dari bagian-bagian yang bisa dipilih. Murni.
import { safeName } from './export.js';

export const PARTS = [
  ['disiplin', 'Disiplin'], ['pekerjaan', 'Pekerjaan'], ['gedung', 'Gedung'], ['lembar', 'Lembar'],
  ['jenis', 'Jenis berkas'], ['periode', 'Periode'], ['persen', 'Persen'], ['tanggal', 'Tanggal'],
];
const KIND = { pkp: 'Proyek', xlsx: 'Rekap', pdf: 'Laporan', png: 'Gambar' };
/** Bawaan: .pkp mengikuti aturan disiplin_pekerjaan_gedung; hasil laporan diberi jenis dan waktunya. */
export const DEFAULTS = {
  pkp: ['disiplin', 'pekerjaan', 'gedung'],
  xlsx: ['disiplin', 'pekerjaan', 'gedung', 'jenis', 'tanggal'],
  pdf: ['disiplin', 'pekerjaan', 'gedung', 'jenis', 'periode'],
  png: ['disiplin', 'pekerjaan', 'gedung', 'lembar', 'tanggal'],
};
const date = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

/** `info` = { fileName, sheet, period: {from,to}, percent, today }. Return nilai tiap bagian (kosong bila tidak ada). */
export function values(type, info) {
  const base = String(info.fileName).replace(/\.pkp$/i, '');
  const split = base.split('_');
  const [disiplin, pekerjaan, ...rest] = split.length >= 3 ? split : ['', base];
  const p = info.period;
  return {
    disiplin, pekerjaan: pekerjaan ?? base, gedung: rest.join(' '),
    lembar: info.sheet ?? '', jenis: KIND[type] ?? '',
    periode: p ? `${date(p.from).slice(0, 5)} sd ${date(p.to)}` : '',
    persen: info.percent == null ? '' : `${info.percent}persen`,
    tanggal: date(info.today),
  };
}

/** Gabungkan bagian terpilih menurut urutan baku, dipisah garis bawah. */
export function buildName(chosen, all) {
  const name = PARTS.map(([key]) => (chosen.includes(key) ? String(all[key] ?? '').trim() : '')).filter(Boolean).join('_');
  return safeName(name || all.pekerjaan || 'berkas');
}
