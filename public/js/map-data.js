// Lädt Kartendaten (Welt, Deutschland, Europa-Extras) und baut daraus die SVG-Ebenen.
// Keine Namen im DOM – nur numerische IDs.

const NS = 'http://www.w3.org/2000/svg';
const cache = new Map();

export const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

function fetchJson(url) {
  if (!cache.has(url)) {
    // no-cache: auch einen alten, noch „frischen“ Browser-Cache immer per ETag prüfen
    const p = fetch(url, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    });
    // Fehlschläge nicht cachen, damit ein neuer Versuch möglich ist
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url);
}

/** Normalised dataset: { w, h, areas, decor, cities } */
export async function loadDataset(name) {
  if (name === 'germany' || name === 'usa' || name === 'europe') {
    const g = await fetchJson(`/data/${name}.json`);
    return {
      name, w: g.w, h: g.h, areas: g.states, cities: g.cities ?? [],
      decor: { context: g.context, rivers: g.rivers, lakes: g.lakes, insets: g.insets },
    };
  }
  const m = await fetchJson('/data/map.json');
  return { name, w: m.w, h: m.h, areas: m.c, cities: [], decor: { graticule: m.graticule, outline: m.outline } };
}

/** Build the static layers of a dataset into `world`; returns lookup structures. */
export function buildAreaLayers(world, ds) {
  world.replaceChildren();
  const { decor } = ds;
  if (decor.outline) world.append(svgEl('path', { d: decor.outline, class: 'sphere' }));
  else world.append(svgEl('rect', { x: -5000, y: -5000, width: 10000 + ds.w, height: 10000 + ds.h, class: 'sea' }));
  if (decor.graticule) world.append(svgEl('path', { d: decor.graticule, class: 'graticule' }));
  if (decor.context) {
    const ctx = svgEl('g', { class: 'context' });
    for (const d of decor.context) ctx.append(svgEl('path', { d }));
    world.append(ctx);
  }
  // Einschübe (Alaska/Hawaii) mit Meeresfläche hinterlegen, über Kontext und Flüssen
  const insets = svgEl('g', { class: 'insets' });
  const land = svgEl('g', { class: 'land' });
  const dots = svgEl('g', { class: 'dots' });
  const overlayLines = svgEl('g', { class: 'waters' });
  const els = new Map();
  const byIndex = new Map();
  const dotEls = [];
  const remember = (i, el) => { if (!els.has(i)) els.set(i, []); els.get(i).push(el); };

  for (const c of ds.areas) {
    const p = svgEl('path', { d: c.d, 'data-i': c.i, class: `country tint${c.i % 5}` });
    land.append(p);
    remember(c.i, p);
    if (c.alias) continue;
    byIndex.set(c.i, c);
    if (c.dot) {
      const vis = svgEl('circle', { cx: c.dot[0], cy: c.dot[1], class: 'dot', 'data-i': c.i });
      dots.append(vis);
      remember(c.i, vis);
      dotEls.push({ c, vis });
    }
  }
  if (decor.lakes) for (const d of decor.lakes) overlayLines.append(svgEl('path', { d, class: 'lake' }));
  if (decor.rivers) for (const r of decor.rivers) overlayLines.append(svgEl('path', { d: r.d, class: `river r${r.r}` }));
  if (decor.insets) for (const d of decor.insets) insets.append(svgEl('path', { d, class: 'inset-frame' }));
  const cities = svgEl('g', { class: 'cities' });
  world.append(insets, land, overlayLines, dots, cities);
  return { land, dots, waters: overlayLines, cities, els, byIndex, dotEls };
}

/** Render rivers (extra) and city points into the given groups. */
export function buildPointLayer(layers, { rivers = null, cities = [], maxTier = 9 }) {
  layers.cities.replaceChildren();
  layers.waters.querySelectorAll('.extra').forEach((el) => el.remove());
  if (rivers) for (const r of rivers) layers.waters.append(svgEl('path', { d: r.d, class: `river r${r.r} extra` }));
  const pointEls = new Map();
  const points = [];
  for (const c of cities) {
    if (c.t > maxTier) continue;
    const el = svgEl('circle', { cx: c.x, cy: c.y, class: `city t${c.t}` });
    layers.cities.append(el);
    pointEls.set(c.i, el);
    points.push(c);
  }
  return { pointEls, points };
}
