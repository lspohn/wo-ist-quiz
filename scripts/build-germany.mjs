// Baut die Deutschland-Karte (Bundesländer aus BKG VG1000, Nachbarländer als Kontext, Flüsse, Seen,
// Städte) sowie die Serverdaten für die Varianten „Deutschland“ und „Deutschland-Städte“.
import { readFileSync, writeFileSync } from 'node:fs';
import { geoConicConformal, geoContains, geoDistance, geoPath } from 'd3-geo';
import { STATE_CAPITALS } from './places-config.mjs';
import { file, inBox as inBoxOf, load, loadVg1000States, neighborsOf, round1 as round, samplePoints, shape } from './lib/regional.mjs';

const WIDTH = 1000;
const PAD = 70;
const CLIP = [0.5, 44, 20.5, 58];
const inBox = inBoxOf(CLIP);

// --- Bundesländer ---
// Reihenfolge alphabetisch wie bisher, damit die Indizes stabil bleiben
const rawStates = (await loadVg1000States())
  .map((f) => ({ ...f, properties: { name: f.properties.GEN } }))
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'de'));
const neighbors = neighborsOf(rawStates);

const states = await shape(rawStates, process.env.DE_SIMPLIFY ?? '35%');
const context = await shape((await load('ne10')).features.filter((f) => f.properties.ISO_A2_EH !== 'DE' && inBox(f)), '60%', CLIP);
const rivers = await shape([
  ...(await load('ne_10m_rivers_lake_centerlines')).features.filter(inBox),
  ...(await load('ne_10m_rivers_europe')).features.filter(inBox),
], null, CLIP);
const lakes = await shape([...(await load('ne_10m_lakes')).features, ...(await load('ne_10m_lakes_europe')).features].filter(inBox), '40%', CLIP);

const stateFc = { type: 'FeatureCollection', features: states };
const projection = geoConicConformal().parallels([48.5, 53.5]).rotate([-10.4, 0]).fitWidth(WIDTH - 2 * PAD, stateFc);
const [[x0, y0], [, y1]] = geoPath(projection).bounds(stateFc);
projection.translate([projection.translate()[0] - x0 + PAD, projection.translate()[1] - y0 + PAD]);
const height = Math.ceil(y1 - y0 + 2 * PAD);
// Kontext rechteckig am Kartenrand abschneiden statt entlang von Längen-/Breitengraden
projection.clipExtent([[0, 0], [WIDTH, height]]);
const path = geoPath(projection).digits(1);

const stateMeta = rawStates.map((f, i) => {
  const name = f.properties.name;
  return { i, name, capital: STATE_CAPITALS[name], neighbors: neighbors[i], pts: samplePoints(f.geometry) };
});
const mapStates = states.map((f, i) => ({
  i,
  d: path(f),
  b: path.bounds(f).flat().map(Math.round),
  l: path.centroid(f).map(round),
}));

// --- Städte ---
// Städte ab 50.000 Einwohnern in drei Stufen: ≥ 300.000 · ≥ 100.000 · ≥ 50.000
const cities = JSON.parse(readFileSync(file('scripts/data/cities-de.json'), 'utf8')).filter((c) => c.pop >= 50000);
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
  const tier = c.pop >= 300000 ? 1 : c.pop >= 100000 ? 2 : 3;
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
  proj: { type: 'conicConformal', parallels: [48.5, 53.5], rotate: [-10.4, 0], scale: projection.scale(), translate: projection.translate() },
  states: mapStates,
  context: context.map((f) => path(f)).filter(Boolean),
  rivers: rivers.map((f) => ({ d: path(f), r: riverRank(f) <= 5 ? 1 : riverRank(f) <= 9 ? 2 : 3 })).filter((r) => r.d),
  lakes: lakes.map((f) => path(f)).filter(Boolean),
  cities: mapCities,
};
writeFileSync(file('public/data/germany.json'), JSON.stringify(mapJson));
writeFileSync(file('server/data/de-states.json'), JSON.stringify(stateMeta));
writeFileSync(file('server/data/de-cities.json'), JSON.stringify(cityMeta));
const size = JSON.stringify(mapJson).length;
console.log(`Deutschland: ${stateMeta.length} Länder, ${cityMeta.length} Städte, ${mapJson.rivers.length} Flüsse, ${mapJson.lakes.length} Seen, ${(size / 1024).toFixed(0)} KB, ${WIDTH}×${height}`);
console.log('Nachbarn Bremen:', stateMeta.find((s) => s.name === 'Bremen').neighbors.map((n) => stateMeta[n].name).join(', '));
console.log('Nachbarn Bayern:', stateMeta.find((s) => s.name === 'Bayern').neighbors.map((n) => stateMeta[n].name).join(', '));
console.log('Städte pro Land:', Object.entries(cityMeta.reduce((a, c) => ({ ...a, [c.state]: (a[c.state] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', '));
