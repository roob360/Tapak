// Pekerja citra: menyimpan citra abu-abu lembar aktif, menjalankan alat otomatis tanpa membekukan layar.
import { toGray, binarize, findRoom, findSimilar, snapPoint, crop } from './auto.js';

let img = null;

self.onmessage = ({ data: { id, op, args } }) => {
  try {
    let result = null;
    if (op === 'load') {
      const gray = toGray(args.rgba, args.w, args.h);
      img = { gray, bin: binarize(gray), w: args.w, h: args.h };
    } else if (!img) throw new Error('Citra belum siap');
    else if (op === 'room') result = findRoom(img.bin, img.w, img.h, args.seed, args.gap);
    else if (op === 'similar') result = findSimilar(img.gray, img.w, img.h, args.box, args);
    else if (op === 'sample') result = crop(img.gray, img.w, args.box.map(Math.round));
    else if (op === 'snap') result = snapPoint(img.bin, img.w, img.h, args.p, args.r);
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: e.message });
  }
};
