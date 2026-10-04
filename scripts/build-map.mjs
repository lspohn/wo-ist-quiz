// Baut aus Natural Earth 50m die Kartendaten für Client und Server.
// Ergebnis wird eingecheckt; der Docker-Build lädt nichts herunter.
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { geoArea, geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo';
import mapshaper from 'mapshaper';
import {
  ALL_TARGETS, MEDIUM_TARGETS, NAME_OVERRIDES, CONTINENT_DE, CONTINENT_OVERRIDES, MERGE_INTO,
} from './countries-config.mjs';
import { EUROPE_ISO } from './places-config.mjs';

const RES = process.env.MAP_RES ?? '10m';
const SIMPLIFY = process.env.MAP_SIMPLIFY ?? '8%';
const SRC_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_${RES}_admin_0_countries.geojson`;
const CACHE_DIR = fileURLToPath(new URL('../.cache/', import.meta.url));
const CACHE = `${CACHE_DIR}ne${RES.replace('m', '')}.geojson`;
const MAP_OUT = fileURLToPath(new URL('../public/data/map.json', import.meta.url));
const META_OUT = fileURLToPath(new URL('../server/data/countries.json', import.meta.url));
const WIDTH = 2000;
const MAX_SAMPLES = 500;
const DOT_AREA = 15; // projizierte Fläche (px²), darunter bekommt ein Land einen Punkt

if (!existsSync(CACHE)) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const res = await fetch(SRC_URL);
  if (!res.ok) throw new Error(`Download fehlgeschlagen: ${res.status}`);
  writeFileSync(CACHE, await res.text());
}
const raw = JSON.parse(readFileSync(CACHE, 'utf8'));
const features = raw.features.filter((f) => f.properties.ISO_A2_EH !== 'AQ');

function rings(geom) {
  return geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
}

// Nachbarn: Natural Earth teilt an Landgrenzen exakt dieselben Stützpunkte
const owners = new Map();
features.forEach((f, i) => {
  for (const ring of rings(f.geometry)) {
    for (const [x, y] of ring) {
      const key = `${x.toFixed(4)},${y.toFixed(4)}`;
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(i);
    }
  }
});
const neighbors = features.map(() => new Set());
for (const set of owners.values()) {
  if (set.size < 2) continue;
  for (const a of set) for (const b of set) if (a !== b) neighbors[a].add(b);
}

function largestPart(f) {
  if (f.geometry.type !== 'MultiPolygon') return f;
  const parts = f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
  return parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
}

function samplePoints(geom) {
  const pts = rings(geom).flat();
  const step = Math.max(1, Math.ceil(pts.length / MAX_SAMPLES));
  const out = [];
  for (let k = 0; k < pts.length; k += step) {
    out.push([+pts[k][0].toFixed(3), +pts[k][1].toFixed(3)]);
  }
  return out;
}

const simplified = await mapshaper.applyCommands(
  `-i in.json -simplify ${SIMPLIFY} keep-shapes planar -o out.json format=geojson`,
  { 'in.json': { type: 'FeatureCollection', features } },
);
const simple = JSON.parse(simplified['out.json']).features.map(rewind);

// d3 erwartet Außenringe im Uhrzeigersinn; mapshaper liefert RFC-7946 (gegen den Uhrzeigersinn)
function rewind(f) {
  if (geoArea(f) <= 2 * Math.PI) return f;
  const rev = (poly) => poly.map((ring) => [...ring].reverse());
  const g = f.geometry;
  const coordinates = g.type === 'Polygon' ? rev(g.coordinates) : g.coordinates.map(rev);
  return { ...f, geometry: { ...g, coordinates } };
}

const fc = { type: 'FeatureCollection', features: simple };
const projection = geoNaturalEarth1().fitWidth(WIDTH, fc);
const [[, y0], [, y1]] = geoPath(projection).bounds(fc);
const height = Math.ceil(y1 - y0 + 4);
projection.translate([projection.translate()[0], projection.translate()[1] - y0 + 2]);
const path = geoPath(projection).digits(1);

const targetSet = new Set(ALL_TARGETS);
const mediumSet = new Set(MEDIUM_TARGETS);
const mapCountries = [];
const meta = [];

// Pro Zielland genau ein Haupt-Feature (das flächengrößte); Enklaven/Doppelte werden darauf abgebildet
const mainByIso = new Map();
features.forEach((f, i) => {
  const p = f.properties;
  if (!targetSet.has(p.ISO_A2_EH) || ['Dependency', 'Lease'].includes(p.TYPE) || MERGE_INTO[p.ADMIN]) return;
  const prev = mainByIso.get(p.ISO_A2_EH);
  if (prev === undefined || geoArea(f) > geoArea(features[prev])) mainByIso.set(p.ISO_A2_EH, i);
});
const aliasOf = (f, i) => {
  const into = MERGE_INTO[f.properties.ADMIN] ?? (targetSet.has(f.properties.ISO_A2_EH) ? f.properties.ISO_A2_EH : null);
  const main = into ? mainByIso.get(into) : undefined;
  return main !== undefined && main !== i ? main : null;
};

simple.forEach((f, i) => {
  const p = f.properties;
  const iso = p.ISO_A2_EH;
  const alias = aliasOf(features[i], i);
  const isTarget = mainByIso.get(iso) === i;
  const continentKey = CONTINENT_OVERRIDES[iso] ?? p.CONTINENT;
  const b = path.bounds(f).flat().map((v) => Math.round(v));
  // Enklaven tragen die ID ihres Hauptlandes – Klick zählt als dieses Land
  const entry = alias === null ? { i, d: path(f), b } : { i: alias, d: path(f), b, alias: true };
  if (alias === null) {
    // Kernbereich (größtes Teilpolygon) für Zoom, Labelpunkt für Pins – Frankreich ≠ Französisch-Guayana
    entry.mb = path.bounds(largestPart(f)).flat().map((v) => Math.round(v));
    entry.l = projection([p.LABEL_X, p.LABEL_Y]).map((v) => Math.round(v * 10) / 10);
  }
  if (alias === null && path.area(f) < DOT_AREA) {
    const [lx, ly] = projection([p.LABEL_X, p.LABEL_Y]);
    entry.dot = [Math.round(lx * 10) / 10, Math.round(ly * 10) / 10];
  }
  mapCountries.push(entry);
  meta.push({
    i,
    ne: p.NE_ID,
    iso,
    ...(alias === null ? {} : { alias }),
    name: NAME_OVERRIDES[iso] ?? NAME_OVERRIDES[p.ADMIN] ?? p.NAME_DE,
    continent: CONTINENT_DE[continentKey] ?? continentKey,
    target: isTarget,
    medium: isTarget && mediumSet.has(iso),
    neighbors: [...neighbors[i]],
    pts: samplePoints(features[i].geometry),
  });
});

// Enklaven in ihr Hauptland falten: Nachbarn und Grenzpunkte übernehmen, Verweise umbiegen
const mainOf = (i) => meta[i].alias ?? i;
for (const m of meta) {
  if (m.alias === undefined) continue;
  const main = meta[m.alias];
  main.neighbors.push(...m.neighbors);
  main.pts.push(...m.pts);
}
for (const m of meta) {
  m.neighbors = [...new Set(m.neighbors.map(mainOf))].filter((n) => n !== m.i && n !== mainOf(m.i));
}

const graticule = geoPath(projection).digits(0)(geoGraticule10());
const outline = geoPath(projection).digits(0)({ type: 'Sphere' });

mkdirSync(fileURLToPath(new URL('../public/data/', import.meta.url)), { recursive: true });
mkdirSync(fileURLToPath(new URL('../server/data/', import.meta.url)), { recursive: true });
// Länder der Europa-Varianten (Karte selbst: scripts/build-europe.mjs)
for (const m of meta) m.europe = m.target && EUROPE_ISO.includes(m.iso);
console.log(`Europa: ${meta.filter((m) => m.europe).length} Länder`);

const mapJson = JSON.stringify({ w: WIDTH, h: height, graticule, outline, c: mapCountries });
writeFileSync(MAP_OUT, mapJson);
writeFileSync(META_OUT, JSON.stringify(meta));

const missing = ALL_TARGETS.filter((iso) => !meta.some((m) => m.iso === iso));
const missingMedium = MEDIUM_TARGETS.filter((iso) => !meta.some((m) => m.iso === iso && m.medium));
console.log(`Features: ${meta.length}, Ziele schwer: ${meta.filter((m) => m.target).length}, mittel: ${meta.filter((m) => m.medium).length}`);
console.log(`Punkte (Kleinstaaten): ${mapCountries.filter((c) => c.dot).length}`);
if (missing.length || missingMedium.length) console.log('FEHLEN:', missing, missingMedium);
console.log(`map.json: ${(mapJson.length / 1024).toFixed(0)} KB, Höhe ${height}`);

// Europa-Karte hängt an den Welt-Indizes – immer gemeinsam neu bauen
await import('./build-europe.mjs');
