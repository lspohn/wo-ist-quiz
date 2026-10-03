// Baut die Deutschland-Karte (Bundesländer, Nachbarländer als Kontext, Flüsse, Seen, Städte)
// sowie die Serverdaten für die Varianten „Deutschland“ und „Deutschland-Städte“.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea, geoConicConformal, geoContains, geoDistance, geoPath } from 'd3-geo';
import mapshaper from 'mapshaper';
import { STATE_CAPITALS } from './places-config.mjs';

const file = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const load = (name) => JSON.parse(readFileSync(file(`../.cache/${name}.geojson`), 'utf8'));
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const SOURCES = { ne10: 'ne_10m_admin_0_countries' };
for (const name of ['ne10', 'ne_10m_admin_1_states_provinces', 'ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe', 'ne_10m_lakes', 'ne_10m_lakes_europe']) {
  const target = file(`../.cache/${name}.geojson`);
  if (existsSync(target)) continue;
  mkdirSync(dirname(target), { recursive: true });
  const res = await fetch(`${NE}/${SOURCES[name] ?? name}.geojson`);
  if (!res.ok) throw new Error(`Download ${name} fehlgeschlagen: ${res.status}`);
  writeFileSync(target, await res.text());
}
const WIDTH = 1000;
const PAD = 70;
const CLIP = [3.2, 45.6, 17.8, 56.4];

const inBox = (f) => {
  if (!f.geometry) return false;
  const nums = JSON.stringify(f.geometry.coordinates).match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g) ?? [];
  return nums.some((p) => {
    const [x, y] = p.split(',').map(Number);
    return x > CLIP[0] && x < CLIP[2] && y > CLIP[1] && y < CLIP[3];
  });
};

async function shape(features, simplify, clip = true) {
  const cmd = `-i in.json ${clip ? `-clip bbox=${CLIP.join(',')}` : ''} ${simplify ? `-simplify ${simplify} keep-shapes planar` : ''} -o out.json format=geojson`;
  const out = await mapshaper.applyCommands(cmd, { 'in.json': { type: 'FeatureCollection', features } });
  return JSON.parse(out['out.json']).features.map(rewind);
}

// d3 erwartet Außenringe im Uhrzeigersinn; mapshaper liefert RFC 7946
function rewind(f) {
  if (!/Polygon/.test(f.geometry?.type ?? '') || geoArea(f) <= 2 * Math.PI) return f;
  const rev = (poly) => poly.map((ring) => [...ring].reverse());
  const g = f.geometry;
  return { ...f, geometry: { ...g, coordinates: g.type === 'Polygon' ? rev(g.coordinates) : g.coordinates.map(rev) } };
}

const rings = (g) => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat());

// --- Bundesländer ---
const rawStates = load('ne_10m_admin_1_states_provinces').features
  .filter((f) => f.properties.iso_a2 === 'DE')
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'de'));
const owners = new Map();
rawStates.forEach((f, i) => {
  for (const ring of rings(f.geometry)) {
    for (const [x, y] of ring) {
      const key = `${x.toFixed(3)},${y.toFixed(3)}`;
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(i);
    }
  }
});
const neighbors = rawStates.map(() => new Set());
for (const set of owners.values()) for (const a of set) for (const b of set) if (a !== b) neighbors[a].add(b);

const states = await shape(rawStates, '30%', false);
const context = await shape(load('ne10').features.filter((f) => f.properties.ISO_A2_EH !== 'DE' && inBox(f)), '25%');
const rivers = await shape([
  ...load('ne_10m_rivers_lake_centerlines').features.filter(inBox),
  ...load('ne_10m_rivers_europe').features.filter(inBox),
], '35%');
const lakes = await shape([...load('ne_10m_lakes').features, ...load('ne_10m_lakes_europe').features].filter(inBox), '40%');

const stateFc = { type: 'FeatureCollection', features: states };
const projection = geoConicConformal().parallels([48.5, 53.5]).rotate([-10.4, 0]).fitWidth(WIDTH - 2 * PAD, stateFc);
const [[x0, y0], [, y1]] = geoPath(projection).bounds(stateFc);
projection.translate([projection.translate()[0] - x0 + PAD, projection.translate()[1] - y0 + PAD]);
const height = Math.ceil(y1 - y0 + 2 * PAD);
const path = geoPath(projection).digits(1);
const round = (v) => Math.round(v * 10) / 10;

const stateMeta = rawStates.map((f, i) => {
  const name = f.properties.name;
  const pts = rings(f.geometry).flat();
  const step = Math.max(1, Math.ceil(pts.length / 400));
  return {
    i,
    name,
    capital: STATE_CAPITALS[name],
    neighbors: [...neighbors[i]],
    pts: pts.filter((_, k) => k % step === 0).map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]),
  };
});
const mapStates = states.map((f, i) => ({
  i,
  d: path(f),
  b: path.bounds(f).flat().map(Math.round),
  l: path.centroid(f).map(round),
}));

// --- Städte ---
const cities = JSON.parse(readFileSync(file('./data/cities-de.json'), 'utf8'));
const stateOf = (c) => {
  const pt = [c.lon, c.lat];
  const inside = rawStates.findIndex((f) => geoContains(f, pt));
  if (inside >= 0) return inside;
  // Küsten-/Grenzpunkte knapp außerhalb: nächstgelegenes Land
  let best = 0;
  let bestD = Infinity;
  stateMeta.forEach((s) => {
    for (const p of s.pts) {
      const d = geoDistance(pt, p);
      if (d < bestD) { bestD = d; best = s.i; }
    }
  });
  return best;
};
const nameCount = new Map();
for (const c of cities) nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1);
const cityMeta = cities.map((c, i) => {
  const state = stateOf(c);
  const tier = c.pop >= 100000 ? 1 : c.pop >= 50000 ? 2 : 3;
  const name = nameCount.get(c.name) > 1 ? `${c.name} (${rawStates[state].properties.name})` : c.name;
  return { i, name, pop: c.pop, tier, lat: c.lat, lon: c.lon, state: rawStates[state].properties.name };
});
const mapCities = cityMeta.map((c) => {
  const [x, y] = projection([c.lon, c.lat]);
  return { i: c.i, x: round(x), y: round(y), t: c.tier };
});

const riverRank = (f) => f.properties.scalerank ?? 10;
const mapJson = {
  w: WIDTH,
  h: height,
  states: mapStates,
  context: context.map((f) => path(f)).filter(Boolean),
  rivers: rivers.map((f) => ({ d: path(f), r: riverRank(f) <= 5 ? 1 : riverRank(f) <= 9 ? 2 : 3 })).filter((r) => r.d),
  lakes: lakes.map((f) => path(f)).filter(Boolean),
  cities: mapCities,
};
writeFileSync(file('../public/data/germany.json'), JSON.stringify(mapJson));
writeFileSync(file('../server/data/de-states.json'), JSON.stringify(stateMeta));
writeFileSync(file('../server/data/de-cities.json'), JSON.stringify(cityMeta));
const size = JSON.stringify(mapJson).length;
console.log(`Deutschland: ${stateMeta.length} Länder, ${cityMeta.length} Städte, ${mapJson.rivers.length} Flüsse, ${mapJson.lakes.length} Seen, ${(size / 1024).toFixed(0)} KB, ${WIDTH}×${height}`);
console.log('Nachbarn Bremen:', stateMeta.find((s) => s.name === 'Bremen').neighbors.map((n) => stateMeta[n].name).join(', '));
console.log('Nachbarn Bayern:', stateMeta.find((s) => s.name === 'Bayern').neighbors.map((n) => stateMeta[n].name).join(', '));
console.log('Städte pro Land:', Object.entries(cityMeta.reduce((a, c) => ({ ...a, [c.state]: (a[c.state] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', '));
