// SVG-Weltkarte: Rendering, Zoom-Zustand, Markierungen.
// Die Karte enthält bewusst keine Ländernamen – nur numerische IDs.
import { attachGestures } from './gestures.js';

const NS = 'http://www.w3.org/2000/svg';
const DOT_SCREEN_PX = 16;

const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/** Build the interactive world map inside `host`. */
export async function createMap(host, { onLongPress, onLongPressStart, onLongPressCancel } = {}) {
  const data = await fetch('/data/map.json').then((r) => r.json());
  const svg = svgEl('svg', { class: 'map-svg' });
  const world = svgEl('g', { class: 'world' });
  world.append(svgEl('path', { d: data.outline, class: 'sphere' }));
  world.append(svgEl('path', { d: data.graticule, class: 'graticule' }));
  const land = svgEl('g', { class: 'land' });
  const dots = svgEl('g', { class: 'dots' });
  const markers = svgEl('g', { class: 'markers' });
  const paths = new Map();
  const dotEls = [];

  for (const c of data.c) {
    const p = svgEl('path', { d: c.d, 'data-i': c.i, class: `country tint${c.i % 5}` });
    land.append(p);
    paths.set(c.i, p);
    if (c.dot) {
      const vis = svgEl('circle', { cx: c.dot[0], cy: c.dot[1], class: 'dot', 'data-i': c.i });
      const hit = svgEl('circle', { cx: c.dot[0], cy: c.dot[1], class: 'dot-hit', 'data-i': c.i });
      dots.append(vis, hit);
      dotEls.push({ c, vis, hit });
    }
  }
  world.append(land, dots, markers);
  svg.append(world);
  host.append(svg);

  const byIndex = new Map(data.c.map((c) => [c.i, c]));
  const s = { k: 1, x: 0, y: 0 };
  let minK = 1;
  let maxK = 80;
  let anim = null;
  let markerEls = [];

  const size = () => ({ W: host.clientWidth, H: host.clientHeight });

  function clampK(k) {
    return Math.max(minK, Math.min(maxK, k));
  }

  function clampXY() {
    const { W, H } = size();
    const mw = data.w * s.k;
    const mh = data.h * s.k;
    // Karte darf nie ganz aus dem Bild geschoben werden
    const padX = Math.min(W * 0.5, mw * 0.5);
    const padY = Math.min(H * 0.5, mh * 0.5);
    s.x = Math.min(W - padX, Math.max(padX - mw, s.x));
    s.y = Math.min(H - padY, Math.max(padY - mh, s.y));
  }

  function apply() {
    world.setAttribute('transform', `translate(${s.x.toFixed(2)} ${s.y.toFixed(2)}) scale(${s.k.toFixed(4)})`);
    const inv = 1 / s.k;
    for (const m of markerEls) m.el.setAttribute('transform', `translate(${m.x} ${m.y}) scale(${inv})`);
    svg.style.setProperty('--k', s.k);
  }

  function updateDots() {
    const inv = 1 / s.k;
    for (const d of dotEls) {
      const w = Math.max(d.c.b[2] - d.c.b[0], d.c.b[3] - d.c.b[1]) * s.k;
      const show = w < DOT_SCREEN_PX;
      d.vis.setAttribute('r', show ? 3.2 * inv : 0);
      d.hit.setAttribute('r', show ? 14 * inv : 0);
    }
  }

  const view = {
    get: () => ({ ...s }),
    clampK,
    set(k, x, y) {
      cancelAnimationFrame(anim);
      s.k = clampK(k);
      s.x = x;
      s.y = y;
      clampXY();
      apply();
    },
  };

  function fitAll() {
    cancelAnimationFrame(anim);
    const { W, H } = size();
    const fit = Math.min(W / data.w, H / data.h);
    minK = fit * 0.9;
    maxK = fit * 90;
    // Hochkant: etwas reinzoomen, damit Länder nicht winzig sind
    const k = W < H ? Math.min(H / data.h, fit * 2.2) : fit;
    s.k = k;
    s.x = (W - data.w * k) / 2;
    s.y = (H - data.h * k) / 2;
    clampXY();
    apply();
    updateDots();
  }

  function animateTo(k, x, y, ms = 650) {
    cancelAnimationFrame(anim);
    const from = { ...s };
    const t0 = performance.now();
    const step = (t) => {
      const u = Math.min(1, (t - t0) / ms);
      const e = 1 - (1 - u) ** 3;
      s.k = from.k * (k / from.k) ** e;
      s.x = from.x + (x - from.x) * e;
      s.y = from.y + (y - from.y) * e;
      apply();
      if (u < 1) anim = requestAnimationFrame(step);
      else updateDots();
    };
    anim = requestAnimationFrame(step);
  }

  /** Zoom to world-space bounds [x0,y0,x1,y1] with padding (insets in px). */
  function zoomToBounds(b, inset = {}) {
    const { W, H } = size();
    const top = inset.top ?? 80;
    const bottom = inset.bottom ?? 80;
    const left = inset.left ?? 30;
    const right = inset.right ?? 30;
    const aw = Math.max(80, W - left - right);
    const ah = Math.max(80, H - top - bottom);
    const bw = Math.max(b[2] - b[0], 240);
    const bh = Math.max(b[3] - b[1], 150);
    const k = clampK(Math.min(aw / bw, ah / bh) * 0.8);
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    animateTo(k, left + aw / 2 - cx * k, top + ah / 2 - cy * k);
  }

  function countryAt(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const hit = el?.closest?.('[data-i]');
    return hit ? Number(hit.getAttribute('data-i')) : null;
  }

  function setClass(cls, indices) {
    for (const el of svg.querySelectorAll(`.${cls}`)) el.classList.remove(cls);
    for (const i of indices) {
      if (i == null) continue;
      paths.get(i)?.classList.add(cls);
      dots.querySelector(`.dot[data-i="${i}"]`)?.classList.add(cls);
    }
    // markierte Länder nach oben, damit ihre Umrandung sichtbar ist
    for (const i of indices) { const p = paths.get(i); if (p) land.append(p); }
  }

  function center(i) {
    const c = byIndex.get(i);
    if (c.dot) return c.dot;
    return [(c.b[0] + c.b[2]) / 2, (c.b[1] + c.b[3]) / 2];
  }

  /** Pins for players' guesses: [{i, color, label}] */
  function setMarkers(list) {
    markers.replaceChildren();
    markerEls = [];
    const stack = new Map();
    for (const m of list) {
      const [x, y] = center(m.i);
      const n = stack.get(m.i) ?? 0;
      stack.set(m.i, n + 1);
      const g = svgEl('g', { class: 'pin' });
      g.style.setProperty('--c', m.color);
      g.style.setProperty('--delay', `${markerEls.length * 90}ms`);
      const inner = svgEl('g', { transform: `translate(${n * 22} 0)` });
      inner.append(
        svgEl('path', { d: 'M0 0 C -4 -8 -12 -12 -12 -21 A 12 12 0 1 1 12 -21 C 12 -12 4 -8 0 0 Z', class: 'pin-body' }),
      );
      const t = svgEl('text', { x: 0, y: -17, class: 'pin-label' });
      t.textContent = m.label;
      inner.append(t);
      g.append(inner);
      markers.append(g);
      markerEls.push({ el: g, x, y });
    }
    apply();
  }

  const gestures = attachGestures(svg, view, {
    onLongPressStart,
    onLongPressCancel,
    onLongPress: (x, y) => onLongPress?.(countryAt(x, y), x, y),
    onSettle: updateDots,
  });

  let resizeT;
  new ResizeObserver(() => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { const keep = { ...s }; if (!keep.k || keep.k === 1) fitAll(); else { clampXY(); apply(); updateDots(); } }, 60);
  }).observe(host);
  fitAll();

  return {
    fitAll,
    zoomToBounds,
    bounds: (i) => byIndex.get(i)?.b,
    setCandidate: (i) => setClass('candidate', [i]),
    setLocked: (i) => setClass('locked', [i]),
    setTarget: (i) => setClass('target', [i]),
    setWrong: (list) => setClass('wrong', list),
    setMarkers,
    clearAll() {
      for (const cls of ['candidate', 'locked', 'target', 'wrong']) setClass(cls, []);
      setMarkers([]);
    },
    cancelPress: gestures.cancel,
    setInteractive: (on) => svg.classList.toggle('readonly', !on),
  };
}
