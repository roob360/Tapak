// Papan kerja: kamera (zoom berbatas), kanvas, dan penerjemah masukan pen / jari / mouse.
// Dunia = titik halaman PDF. view.k = piksel layar per titik.

const ZOOM_MAX = 8; // kali ukuran pas layar; batas kecilnya = pas layar

export function createBoard(canvas, h) {
  const g = canvas.getContext('2d');
  const view = { k: 1, x: 0, y: 0 };
  const pointers = new Map();
  let image = null, size = [1, 1], fitK = 1, act = null, hold = 0, penDown = null, queued = false, anim = 0, gesture = null, cache = null;
  const state = { penSeen: false, finger: false, loupe: null, still: false };
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  const area = () => {
    const i = h.insets();
    return { x: i.left, y: i.top, w: Math.max(80, canvas.clientWidth - i.left - i.right), h: Math.max(80, canvas.clientHeight - i.top - i.bottom) };
  };
  const toWorld = ([sx, sy]) => [(sx - view.x) / view.k, (sy - view.y) / view.k];
  const toScreen = ([x, y]) => [x * view.k + view.x, y * view.k + view.y];
  const at = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  function fitView() {
    const a = area();
    fitK = Math.min(a.w / size[0], a.h / size[1]);
    return { k: fitK, x: a.x + (a.w - size[0] * fitK) / 2, y: a.y + (a.h - size[1] * fitK) / 2 };
  }
  /** Halaman tidak boleh digeser menghilang dari area kerja. */
  function clamp(v) {
    const a = area();
    fitView();
    const k = Math.max(fitK, Math.min(fitK * ZOOM_MAX, v.k));
    const axis = (pos, len, start, span) => (len <= span ? start + (span - len) / 2 : Math.min(start, Math.max(start + span - len, pos)));
    return { k, x: axis(v.x, size[0] * k, a.x, a.w), y: axis(v.y, size[1] * k, a.y, a.h) };
  }
  const around = (q, k) => ({ k, x: q[0] - (q[0] - view.x) * (k / view.k), y: q[1] - (q[1] - view.y) * (k / view.k) });

  function set(v) { Object.assign(view, v); cache = null; redraw(); h.zoomed(view.k / fitK); }
  function glide(to, ms = 250) {
    const from = { ...view }, id = ++anim, t0 = performance.now(), dur = state.still ? 1 : ms;
    const step = (t) => {
      if (id !== anim) return;
      const p = Math.min(1, Math.max(0, (t - t0) / dur)), e = 1 - (1 - p) ** 3;
      set({ k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function paintBase(d) {
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (!image) return;
    g.translate(view.x, view.y);
    g.scale(view.k, view.k);
    g.save();
    g.shadowColor = '#00000030';
    g.shadowBlur = 18;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, size[0], size[1]);
    g.restore();
    g.drawImage(image, 0, 0, size[0], size[1]);
    h.paint(g, view.k);
  }
  function draw() {
    queued = false;
    const d = dpr(), W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * d) || canvas.height !== Math.round(H * d)) { canvas.width = Math.round(W * d); canvas.height = Math.round(H * d); cache = null; }
    // saat menggores, gambar dasar dipakai ulang supaya tinta menempel di ujung pen
    if (cache) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(cache, 0, 0); g.setTransform(d, 0, 0, d, 0, 0); g.translate(view.x, view.y); g.scale(view.k, view.k); }
    else paintBase(d);
    if (image) h.live(g, view.k);
    if (state.loupe) loupe(d, W);
  }
  const redraw = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };

  function snapshot() {
    paintBase(dpr());
    cache = document.createElement('canvas');
    cache.width = canvas.width;
    cache.height = canvas.height;
    cache.getContext('2d').drawImage(canvas, 0, 0);
  }

  function loupe(d, W) {
    const { screen, point } = state.loupe;
    const R = 68, mag = view.k * 2.5;
    const cx = Math.max(R + 8, Math.min(W - R - 8, screen[0])), cy = screen[1] - 128 < R + 8 ? screen[1] + 128 : screen[1] - 128;
    g.save();
    g.setTransform(d, 0, 0, d, 0, 0);
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.clip();
    g.translate(cx - point[0] * mag, cy - point[1] * mag);
    g.scale(mag, mag);
    g.drawImage(image, 0, 0, size[0], size[1]);
    h.paint(g, mag);
    h.live(g, mag);
    g.restore();
    g.save();
    g.setTransform(d, 0, 0, d, 0, 0);
    g.strokeStyle = '#1c1c1e';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx - 14, cy); g.lineTo(cx + 14, cy); g.moveTo(cx, cy - 14); g.lineTo(cx, cy + 14);
    g.stroke();
    g.restore();
  }

  const touches = () => [...pointers.values()].filter((p) => p.type === 'touch');
  const pinchNow = () => {
    const [a, b] = touches();
    return { mid: [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2], d: Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) };
  };

  function cancel() {
    clearTimeout(hold);
    if (act && ['draw', 'place', 'erase', 'paint', 'box', 'legend'].includes(act.kind)) h.cancel();
    act = null;
    cache = null;
    state.loupe = null;
    redraw();
  }

  function armShape() {
    clearTimeout(hold);
    hold = setTimeout(() => { if (act?.kind === 'draw' && h.straighten()) { act.locked = true; navigator.vibrate?.(20); redraw(); } }, 550);
  }
  function aim(screen, type) {
    state.loupe = { screen, point: h.preview(toWorld(screen), type) };
    redraw();
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = at(e), type = e.pointerType;
    anim++;
    if (type === 'pen') {
      if (!state.penSeen) { state.penSeen = true; h.penSeen(); }
      penDown = e.pointerId;
      cancel();
      for (const [id, q] of pointers) if (q.type === 'touch') pointers.delete(id);
    } else if (type === 'touch' && penDown !== null) return; // telapak tangan
    try { canvas.setPointerCapture(e.pointerId); } catch { /* sudah lepas */ }
    pointers.set(e.pointerId, { at: p, from: p, type });
    h.touched();

    if (type === 'touch') {
      const n = touches().length;
      if (n === 1) gesture = { t: performance.now(), max: 1, moved: false };
      else if (gesture) gesture.max = Math.max(gesture.max, n);
      if (n >= 2) { cancel(); act = { kind: 'pinch', ...pinchNow() }; return; }
    }
    // tombol samping pen atau klik kanan: roda pen / menu
    if (e.button === 2 || (type === 'pen' && e.buttons & 2)) { h.menu(p, toWorld(p), type); return; }

    const grabbed = e.button === 0 && h.grab(toWorld(p), type);
    if (grabbed) { act = { id: e.pointerId, kind: 'legend', start: p, last: p, moved: false, slop: 4 }; return; }
    const tool = h.tool();
    const eraserTip = e.button === 5 || (e.buttons & 32) !== 0;
    const mode = eraserTip ? 'erase' : tool.input;
    const may = e.button !== 1 && mode !== 'pan' && (type !== 'touch' || !state.penSeen || state.finger);
    const base = { id: e.pointerId, start: p, last: p, type, moved: false, may, slop: type === 'touch' ? 10 : 4 };
    const world = toWorld(p), pressure = type === 'pen' ? e.pressure : 0.5;

    if (may && mode === 'draw') {
      h.start(world, pressure, type);
      snapshot();
      act = { ...base, kind: 'draw' };
      armShape();
    } else if (may && mode === 'erase') {
      act = { ...base, kind: 'erase' };
      h.erase(world, true);
    } else if (may && mode === 'drag') {
      act = { ...base, kind: 'box' };
      h.start(world, pressure, type);
    } else if (may && mode === 'paint' && type !== 'touch') {
      act = { ...base, kind: 'paint' };
      h.paintStart(world);
    } else if (may && mode === 'place' && type !== 'touch') {
      act = { ...base, kind: 'place' };
      aim(p, type);
    } else {
      act = { ...base, kind: 'pan' };
      if (type === 'mouse' && (!may || e.button === 1)) canvas.style.cursor = 'grabbing';
      if (may && mode === 'place') hold = setTimeout(() => { if (act && !act.moved) { act.kind = 'place'; aim(act.last, type); navigator.vibrate?.(12); } }, 340);
      else if (type === 'touch') hold = setTimeout(() => { if (act && !act.moved) { act = null; h.menu(p, world, type); } }, 520);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = at(e);
    const q = pointers.get(e.pointerId);
    if (!q) { if (e.pointerType !== 'touch') h.hover(toWorld(p)); return; }
    q.at = p;
    if (gesture && q.type === 'touch' && Math.hypot(p[0] - q.from[0], p[1] - q.from[1]) > 14) gesture.moved = true;
    if (!act) return;
    if (act.kind === 'pinch') {
      if (touches().length < 2) return;
      const now = pinchNow();
      let k = view.k * (now.d / (act.d || now.d));
      const lo = fitK, hi = fitK * ZOOM_MAX;
      if (k > hi) k = hi + (k - hi) * 0.25; else if (k < lo) k = lo - (lo - k) * 0.4; // terasa karet di batas
      const v = around(act.mid, k);
      set({ k, x: v.x + now.mid[0] - act.mid[0], y: v.y + now.mid[1] - act.mid[1] });
      Object.assign(act, now);
      return;
    }
    if (e.pointerId !== act.id) return;
    const far = Math.hypot(p[0] - act.start[0], p[1] - act.start[1]) > act.slop;
    if (!act.moved && far) { act.moved = true; if (act.kind !== 'draw') clearTimeout(hold); }
    if (act.kind === 'pan') {
      if (act.moved && act.type === 'mouse') canvas.style.cursor = 'grabbing';
      if (act.moved) set(clamp({ k: view.k, x: view.x + p[0] - act.last[0], y: view.y + p[1] - act.last[1] }));
    } else if (act.kind === 'place') aim(p, act.type);
    else if (act.kind === 'legend') h.grabMove(toWorld(p));
    else {
      const list = e.getCoalescedEvents?.() ?? [];
      for (const ev of list.length ? list : [e]) {
        const w = toWorld(at(ev));
        if (act.kind === 'draw') { if (!act.locked) h.move(w, act.type === 'pen' ? ev.pressure : 0.5); }
        else if (act.kind === 'box') h.move(w, 0.5);
        else if (act.kind === 'erase') h.erase(w, false);
        else h.paintMove(w);
      }
      if (act.kind === 'draw' && !act.locked && Math.hypot(p[0] - act.last[0], p[1] - act.last[1]) > 3) armShape();
      redraw();
    }
    act.last = p;
  });

  function end(e, cancelled) {
    if (canvas.style.cursor === 'grabbing') { canvas.style.cursor = canvas.dataset.cursor ?? ''; queueMicrotask(h.cursor); }
    if (e.pointerId === penDown) penDown = null;
    const q = pointers.get(e.pointerId);
    if (!pointers.delete(e.pointerId)) return;
    // ketuk dua atau tiga jari: urungkan / ulangi
    if (q.type === 'touch' && !touches().length && gesture) {
      if (gesture.max >= 2 && !gesture.moved && performance.now() - gesture.t < 320) { const fingers = gesture.max; gesture = null; act = null; set(clamp(view)); h.multiTap(fingers); return; }
    }
    if (!act) return;
    if (act.kind === 'pinch') { if (!touches().length) { act = null; glide(clamp(view)); } return; }
    if (e.pointerId !== act.id) return;
    clearTimeout(hold);
    const a = act, p = at(e), w = toWorld(p);
    act = null;
    cache = null;
    state.loupe = null;
    if (cancelled) h.cancel();
    else if (a.kind === 'legend') h.grabEnd(a.moved);
    else if (a.kind === 'draw' || a.kind === 'box') h.end(w, a.moved, a.type);
    else if (a.kind === 'erase') h.eraseEnd();
    else if (a.kind === 'paint') h.paintEnd();
    else if (a.kind === 'place') h.tap(w, a.type);
    else if (!a.moved && a.may !== false) h.tap(w, a.type);
    redraw();
  }
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));
  canvas.addEventListener('dblclick', (e) => { if (h.tool().input === 'pan') glide(fitView()); else h.double(toWorld(at(e))); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    anim++;
    if (e.shiftKey && !e.ctrlKey) return set(clamp({ k: view.k, x: view.x - e.deltaY, y: view.y }));
    const k = Math.max(fitK, Math.min(fitK * ZOOM_MAX, view.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    set(clamp(around(at(e), k)));
  }, { passive: false });
  for (const ev of ['contextmenu', 'gesturestart', 'gesturechange', 'touchstart', 'touchmove']) canvas.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  new ResizeObserver(() => { cache = null; if (image) set(view.k <= fitK * 1.01 ? fitView() : clamp(view)); }).observe(canvas);

  return {
    view, state, redraw, toScreen, toWorld,
    fit(animate = true) { if (animate) glide(fitView(), 340); else set(fitView()); },
    zoomBy(f) { const a = area(); glide(clamp(around([a.x + a.w / 2, a.y + a.h / 2], Math.max(fitK, Math.min(fitK * ZOOM_MAX, view.k * f))))); },
    zoom: () => view.k / fitK,
    reveal() { if (image) glide(clamp(view)); },
    setPage(bmp, pageSize, keep = false) {
      anim++; // animasi kamera yang masih jalan tidak boleh menimpa halaman baru
      image = bmp;
      size = pageSize;
      cache = null;
      if (!bmp) return;
      if (keep) set(clamp(view)); else set(fitView());
    },
    twoFinger: () => gesture?.max ?? 0,
    reset() { pointers.clear(); penDown = null; cancel(); },
  };
}
