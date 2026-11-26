// Layar koreksi foto miring: geser empat sudut ke tepi kertas.
import { readImage, canvasOf } from './pdf.js';
import { warp, outputSize } from './warp.js';
import { $, $$, move, finished, toast } from './ui.js';

/** Kembalikan kanvas hasil (diluruskan atau apa adanya), atau null bila dibatalkan. */
export async function straighten(file) {
  const result = await cornersOf(await readImage(file));
  return result?.canvas ?? null;
}

/** Layar empat sudut untuk kanvas apa pun -> { canvas, corners (0..1) } atau null. `simple`: hanya Batal dan Luruskan. */
export function cornersOf(input, { simple = false } = {}) {
  let source = input;
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'crop';
    el.innerHTML = `<p>Geser empat sudut ke tepi gambar</p><div class="stage"><canvas></canvas><svg><polygon></polygon></svg>${[0, 1, 2, 3].map((i) => `<button data-c="${i}" aria-label="Sudut ${i + 1}"></button>`).join('')}</div>
      <div class="line"><button class="soft" data-a="cancel">Batal</button>${simple ? '' : '<button class="soft" data-a="rotate">Putar</button><button class="soft" data-a="asis">Pakai apa adanya</button>'}<button class="solid" data-a="apply">Luruskan</button></div>`;
    document.body.appendChild(el);
    move(el, [{ opacity: 0 }, { opacity: 1 }]);
    const canvas = $('canvas', el), stage = $('.stage', el), poly = $('polygon', el);
    let corners, box;
    const reset = () => {
      const m = 0.06;
      corners = [[m, m], [1 - m, m], [1 - m, 1 - m], [m, 1 - m]];
    };
    const layout = () => {
      const k = Math.min(stage.clientWidth / source.width, stage.clientHeight / source.height) * 0.94;
      box = { w: source.width * k, h: source.height * k, x: (stage.clientWidth - source.width * k) / 2, y: (stage.clientHeight - source.height * k) / 2 };
      canvas.width = Math.round(box.w);
      canvas.height = Math.round(box.h);
      Object.assign(canvas.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      place();
    };
    const place = () => {
      const pts = corners.map(([u, v]) => [box.x + u * box.w, box.y + v * box.h]);
      poly.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
      $$('[data-c]', el).forEach((b, i) => { b.style.left = `${pts[i][0]}px`; b.style.top = `${pts[i][1]}px`; });
    };
    for (const b of $$('[data-c]', el)) {
      b.onpointerdown = (e) => { b.setPointerCapture(e.pointerId); move(b, [{ scale: '1' }, { scale: '1.4' }], 150, { fill: 'forwards' }); };
      b.onpointermove = (e) => {
        if (!b.hasPointerCapture(e.pointerId)) return;
        const r = stage.getBoundingClientRect();
        corners[+b.dataset.c] = [Math.max(0, Math.min(1, (e.clientX - r.left - box.x) / box.w)), Math.max(0, Math.min(1, (e.clientY - r.top - box.y) / box.h))];
        place();
      };
      b.onpointerup = b.onpointercancel = () => move(b, [{ scale: '1.4' }, { scale: '1' }], 150, { fill: 'forwards' });
    }
    const observer = new ResizeObserver(layout);
    reset();
    observer.observe(stage);
    const close = async (result) => {
      observer.disconnect();
      await finished(move(el, [{ opacity: 1 }, { opacity: 0 }], 170, { fill: 'forwards' }));
      el.remove();
      resolve(result);
    };
    el.onclick = (e) => {
      const act = e.target.closest('[data-a]')?.dataset.a;
      if (act === 'cancel') close(null);
      else if (act === 'asis') close({ canvas: source, corners: null });
      else if (act === 'rotate') {
        const [c, g] = canvasOf(source.height, source.width);
        g.translate(c.width, 0);
        g.rotate(Math.PI / 2);
        g.drawImage(source, 0, 0);
        source = c;
        reset();
        layout();
      } else if (act === 'apply') {
        try {
          const px = corners.map(([u, v]) => [u * source.width, v * source.height]);
          const [w, h] = outputSize(px, 3200);
          const [out, g] = canvasOf(w, h);
          const data = g.createImageData(w, h);
          warp(source.getContext('2d').getImageData(0, 0, source.width, source.height), px, data);
          g.putImageData(data, 0, 0);
          close({ canvas: out, corners: corners.map((c) => [...c]) });
        } catch (err) { toast(err.message); }
      }
    };
  });
}
