// SVG-Weltkarte: Rendering, Zoom-Zustand, Hervorhebungen.
// Die Karte enthält bewusst keine Ländernamen – nur numerische IDs.
import { attachGestures } from './gestures.js';
import { createOverlay } from './map-overlay.js';
import { createPicker } from './map-pick.js';

const NS = 'http://www.w3.org/2000/svg';
const DOT_SCREEN_PX = 16;
const MARK_CLASSES = ['candidate', 'locked', 'target', 'guessed'];

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
  const els = new Map(); // Haupt-ID → alle Pfade/Punkte (inkl. Enklaven)
  const byIndex = new Map();
  const dotEls = [];
  const remember = (i, el) => { if (!els.has(i)) els.set(i, []); els.get(i).push(el); };

  for (const c of data.c) {
    const p = svgEl('path', { d: c.d, 'data-i': c.i, class: `country tint${c.i % 5}` });
    land.append(p);
    remember(c.i, p);
    if (c.alias) continue;
    byIndex.set(c.i, c);
    if (c.dot) {
      // Fangbereich um den Punkt übernimmt map-pick.js
      const vis = svgEl('circle', { cx: c.dot[0], cy: c.dot[1], class: 'dot', 'data-i': c.i });
      dots.append(vis);
      remember(c.i, vis);
      dotEls.push({ c, vis });
    }
  }
  world.append(land, dots);
  svg.append(world);
  host.append(svg);

  const s = { k: 1, x: 0, y: 0 };
  let minK = 1;
  let maxK = 80;
  let anim = null;
  let gestures = null;
  const size = () => ({ W: host.clientWidth, H: host.clientHeight });
  const overlay = createOverlay(host, ([x, y]) => [s.x + x * s.k, s.y + y * s.k]);
  const screenSize = (i) => {
    const c = byIndex.get(i);
    return c ? Math.max(c.b[2] - c.b[0], c.b[3] - c.b[1]) * s.k : Infinity;
  };
  const pick = createPicker(screenSize);

  const clampK = (k) => Math.max(minK, Math.min(maxK, k));

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
    overlay.place();
  }

  function updateDots() {
    const inv = 1 / s.k;
    for (const d of dotEls) {
      const show = screenSize(d.c.i) < DOT_SCREEN_PX;
      d.vis.setAttribute('r', show ? 3.5 * inv : 0);
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
    gestures?.stopInertia();
    const { W, H } = size();
    const fit = Math.min(W / data.w, H / data.h);
    minK = fit * 0.9;
    maxK = fit * 120;
    // Hochkant: etwas reinzoomen, damit Länder nicht winzig sind
    const k = W < H ? Math.min(H / data.h, fit * 2.2) : fit;
    s.k = k;
    s.x = (W - data.w * k) / 2;
    s.y = (H - data.h * k) / 2;
    clampXY();
    apply();
    updateDots();
  }

  function animateTo(k, x, y, ms = 700) {
    cancelAnimationFrame(anim);
    gestures?.stopInertia();
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

  /** Zoom to world-space bounds [x0,y0,x1,y1] inside the free area (insets in px). */
  function zoomToBounds(b, inset = {}) {
    const { W, H } = size();
    const top = inset.top ?? 80;
    const bottom = inset.bottom ?? 80;
    const left = inset.left ?? 30;
    const right = inset.right ?? 30;
    const aw = Math.max(80, W - left - right);
    const ah = Math.max(80, H - top - bottom);
    const bw = Math.max(b[2] - b[0], 90);
    const bh = Math.max(b[3] - b[1], 60);
    const k = clampK(Math.min(aw / bw, ah / bh) * 0.88);
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    animateTo(k, left + aw / 2 - cx * k, top + ah / 2 - cy * k);
  }

  function setClass(cls, indices) {
    for (const el of svg.querySelectorAll(`.${cls}`)) el.classList.remove(cls);
    for (const i of indices) {
      for (const el of els.get(i) ?? []) {
        el.classList.add(cls);
        if (el.tagName === 'path') land.append(el); // nach oben, damit die Umrandung sichtbar ist
      }
    }
  }

  gestures = attachGestures(svg, view, {
    onLongPressStart,
    onLongPressCancel,
    onLongPress: (x, y) => onLongPress?.(pick(x, y), x, y),
    onSettle: updateDots,
  });

  let resizeT;
  new ResizeObserver(() => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { clampXY(); apply(); updateDots(); }, 60);
  }).observe(host);
  fitAll();

  const api = {
    fitAll,
    zoomToBounds,
    /** Core bounds (largest part) – France without French Guiana. */
    coreBounds: (i) => byIndex.get(i)?.mb ?? byIndex.get(i)?.b,
    anchor: (i) => { const c = byIndex.get(i); return c?.dot ?? c?.l; },
    setCandidate(i) {
      setClass('candidate', i == null ? [] : [i]);
      overlay.setRing(i == null ? null : api.anchor(i));
    },
    setLocked: (i) => setClass('locked', i == null ? [] : [i]),
    setTarget: (i) => setClass('target', i == null ? [] : [i]),
    /** Fill guessed countries in the guessing player's colour: [{ i, color }] */
    setGuessFills(list) {
      for (const el of svg.querySelectorAll('.guessed')) el.style.removeProperty('--g');
      setClass('guessed', list.map((g) => g.i));
      for (const g of list) for (const el of els.get(g.i) ?? []) el.style.setProperty('--g', g.color);
    },
    overlay,
    clearAll() {
      for (const cls of MARK_CLASSES) setClass(cls, []);
      overlay.clear();
      overlay.setLines([]);
    },
    resetGestures: () => gestures.reset(),
    setInteractive: (on) => svg.classList.toggle('readonly', !on),
  };
  return api;
}
