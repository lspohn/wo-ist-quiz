// Interaktive Karte: Zoom-Zustand, Variantenwechsel, Hervorhebungen.
import { attachGestures } from './gestures.js';
import { createOverlay } from './map-overlay.js';
import { createPicker, pickPoint } from './map-pick.js';
import { buildAreaLayers, buildPointLayer, loadDataset, loadEuropeExtras, svgEl } from './map-data.js';

const DOT_SCREEN_PX = 16;
const MARK_CLASSES = ['candidate', 'locked', 'target', 'guessed'];
const CITY_RADIUS = { 1: 5, 2: 4, 3: 3 };

/** Build the interactive map inside `host`. */
export async function createMap(host, { onLongPress, onLongPressStart, onLongPressCancel } = {}) {
  const svg = svgEl('svg', { class: 'map-svg' });
  const world = svgEl('g', { class: 'world' });
  svg.append(world);
  host.append(svg);

  const s = { k: 1, x: 0, y: 0 };
  let ds = null;
  let layers = null;
  let point = { pointEls: new Map(), points: [] };
  let kind = 'area';
  let viewBox = null;
  let configKey = '';
  let using = Promise.resolve();
  let minK = 1;
  let maxK = 80;
  let anim = null;
  let gestures = null;
  const size = () => ({ W: host.clientWidth, H: host.clientHeight });
  const overlay = createOverlay(host, ([x, y]) => [s.x + x * s.k, s.y + y * s.k]);
  const screenSize = (i) => {
    const c = layers?.byIndex.get(i);
    return c ? Math.max(c.b[2] - c.b[0], c.b[3] - c.b[1]) * s.k : Infinity;
  };
  const pickArea = createPicker(screenSize);
  const toScreen = (x, y) => [s.x + x * s.k, s.y + y * s.k];
  const pick = (x, y) => (kind === 'point' ? pickPoint(point.points, toScreen, x, y) : pickArea(x, y));

  const clampK = (k) => Math.max(minK, Math.min(maxK, k));

  function clampXY() {
    const { W, H } = size();
    const mw = ds.w * s.k;
    const mh = ds.h * s.k;
    const padX = Math.min(W * 0.5, mw * 0.5);
    const padY = Math.min(H * 0.5, mh * 0.5);
    s.x = Math.min(W - padX, Math.max(padX - mw, s.x));
    s.y = Math.min(H - padY, Math.max(padY - mh, s.y));
  }

  let radiusK = 0;
  function apply() {
    world.setAttribute('transform', `translate(${s.x.toFixed(2)} ${s.y.toFixed(2)}) scale(${s.k.toFixed(4)})`);
    overlay.place();
    // Stadtpunkte auch während Pinch/Animation in fester Bildschirmgröße halten
    if (point.points.length && s.k !== radiusK) {
      radiusK = s.k;
      const inv = 1 / s.k;
      for (const c of point.points) point.pointEls.get(c.i).setAttribute('r', CITY_RADIUS[c.t] * inv);
    }
  }

  // Punkte behalten auf dem Bildschirm eine feste Größe
  function updateDots() {
    if (!layers) return;
    const inv = 1 / s.k;
    for (const d of layers.dotEls) d.vis.setAttribute('r', kind === 'area' && screenSize(d.c.i) < DOT_SCREEN_PX ? 3.5 * inv : 0);
    for (const c of point.points) point.pointEls.get(c.i).setAttribute('r', CITY_RADIUS[c.t] * inv);
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
    if (!ds) return;
    const { W, H } = size();
    const b = viewBox ?? [0, 0, ds.w, ds.h];
    const bw = b[2] - b[0];
    const bh = b[3] - b[1];
    const fit = Math.min(W / bw, H / bh);
    const fullFit = Math.min(W / ds.w, H / ds.h);
    minK = Math.min(fit, fullFit) * 0.9;
    maxK = fullFit * 120;
    // Hochkant die Welt etwas reinzoomen, damit Länder nicht winzig sind
    let k = fit;
    if (W < H && ds.name === 'world') k = viewBox ? Math.min((H * 0.62) / bh, fit * 1.9) : Math.min(H / bh, fit * 2.2);
    s.k = k;
    s.x = (W - bw * k) / 2 - b[0] * k;
    s.y = (H - bh * k) / 2 - b[1] * k;
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
    const minSpan = ds.name === 'germany' ? 60 : 90;
    const bw = Math.max(b[2] - b[0], minSpan);
    const bh = Math.max(b[3] - b[1], minSpan * 0.66);
    const k = clampK(Math.min(aw / bw, ah / bh) * 0.86);
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    animateTo(k, left + aw / 2 - cx * k, top + ah / 2 - cy * k);
  }

  const marksFor = (i) => (kind === 'point' ? [point.pointEls.get(i)].filter(Boolean) : layers.els.get(i) ?? []);

  function setClass(cls, indices) {
    for (const el of svg.querySelectorAll(`.${cls}`)) el.classList.remove(cls);
    for (const i of indices) {
      for (const el of marksFor(i)) {
        el.classList.add(cls);
        el.parentNode.append(el); // nach oben, damit die Umrandung sichtbar ist
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
    resizeT = setTimeout(() => { if (ds) { clampXY(); apply(); updateDots(); } }, 60);
  }).observe(host);

  const api = {
    /** Switch to a variant: { map: 'world'|'germany', view?: 'europe', kind, points?, maxTier } */
    use(cfg) {
      const key = `${cfg.map}|${cfg.view ?? ''}|${cfg.kind}|${cfg.maxTier ?? ''}`;
      if (key === configKey) return using;
      configKey = key;
      using = (async () => {
        // Daten zuerst laden, dann nur anwenden, wenn inzwischen nichts anderes gewählt wurde
        let next;
        let extras;
        try {
          next = await loadDataset(cfg.map);
          extras = cfg.kind === 'point'
            ? (cfg.points === 'europe' ? await loadEuropeExtras() : { cities: next.cities, rivers: null })
            : { cities: [], rivers: null };
        } catch (err) {
          if (configKey === key) configKey = '';
          throw err;
        }
        if (configKey !== key) return;
        if (ds?.name !== next.name) {
          ds = next;
          layers = buildAreaLayers(world, ds);
        }
        kind = cfg.kind;
        viewBox = cfg.view ? ds.views[cfg.view] : null;
        svg.classList.toggle('point-mode', kind === 'point');
        svg.classList.toggle('germany', ds.name === 'germany');
        point = buildPointLayer(layers, { rivers: extras.rivers, cities: extras.cities, maxTier: cfg.maxTier });
        radiusK = 0;
        api.clearAll();
        fitAll();
      })();
      return using;
    },
    fitAll,
    zoomToBounds,
    /** Core bounds (largest part) – France without French Guiana; points get a tiny box. */
    coreBounds(i) {
      if (kind === 'point') { const [x, y] = api.anchor(i); return [x - 1, y - 1, x + 1, y + 1]; }
      const c = layers.byIndex.get(i);
      return c?.mb ?? c?.b;
    },
    anchor(i) {
      if (kind === 'point') { const c = point.points.find((p) => p.i === i); return c ? [c.x, c.y] : [0, 0]; }
      const c = layers.byIndex.get(i);
      return c?.dot ?? c?.l ?? [(c.b[0] + c.b[2]) / 2, (c.b[1] + c.b[3]) / 2];
    },
    setCandidate(i) {
      setClass('candidate', i == null ? [] : [i]);
      overlay.setRing(i == null ? null : api.anchor(i));
    },
    setLocked: (i) => setClass('locked', i == null ? [] : [i]),
    setTarget: (i) => setClass('target', i == null ? [] : [i]),
    /** Fill guessed areas/points in the guessing player's colour: [{ i, color }] */
    setGuessFills(list) {
      for (const el of svg.querySelectorAll('.guessed')) el.style.removeProperty('--g');
      setClass('guessed', list.map((g) => g.i));
      for (const g of list) for (const el of marksFor(g.i)) el.style.setProperty('--g', g.color);
    },
    overlay,
    clearAll() {
      if (!layers) return;
      for (const cls of MARK_CLASSES) setClass(cls, []);
      overlay.clear();
      overlay.setLines([]);
    },
    resetGestures: () => gestures.reset(),
    setInteractive: (on) => svg.classList.toggle('readonly', !on),
  };
  await api.use({ map: 'world', kind: 'area' });
  return api;
}
