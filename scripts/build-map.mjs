// Baut aus Natural Earth 50m die Kartendaten für Client und Server.
// Ergebnis wird eingecheckt; der Docker-Build lädt nichts herunter.
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { geoArea, geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo';
import mapshaper from 'mapshaper';
import {
  ALL_TARGETS, MEDIUM_TARGETS, NAME_OVERRIDES, CONTINENT_DE, CONTINENT_OVERRIDES,
} from './countries-config.mjs';

const SRC_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const CACHE_DIR = fileURLToPath(new URL('../.cache/', import.meta.url));
const CACHE = `${CACHE_DIR}ne50.geojson`;
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
  '-i in.json -simplify 20% keep-shapes planar -o out.json format=geojson',
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

simple.forEach((f, i) => {
  const p = f.properties;
  const iso = p.ISO_A2_EH;
  const isTarget = targetSet.has(iso) && p.TYPE !== 'Dependency';
  const continentKey = CONTINENT_OVERRIDES[iso] ?? p.CONTINENT;
  const b = path.bounds(f).flat().map((v) => Math.round(v));
  const entry = { i, d: path(f), b };
  if (path.area(f) < DOT_AREA) {
    const [lx, ly] = projection([p.LABEL_X, p.LABEL_Y]);
    entry.dot = [Math.round(lx * 10) / 10, Math.round(ly * 10) / 10];
  }
  mapCountries.push(entry);
  meta.push({
    i,
    iso,
    name: NAME_OVERRIDES[iso] ?? NAME_OVERRIDES[`${iso}:${p.NAME}`] ?? p.NAME_DE,
    continent: CONTINENT_DE[continentKey] ?? continentKey,
    target: isTarget,
    medium: isTarget && mediumSet.has(iso),
    neighbors: [...neighbors[i]],
    pts: samplePoints(features[i].geometry),
  });
});

const graticule = geoPath(projection).digits(0)(geoGraticule10());
const outline = geoPath(projection).digits(0)({ type: 'Sphere' });

mkdirSync(fileURLToPath(new URL('../public/data/', import.meta.url)), { recursive: true });
mkdirSync(fileURLToPath(new URL('../server/data/', import.meta.url)), { recursive: true });
const mapJson = JSON.stringify({ w: WIDTH, h: height, graticule, outline, c: mapCountries });
writeFileSync(MAP_OUT, mapJson);
writeFileSync(META_OUT, JSON.stringify(meta));

const missing = ALL_TARGETS.filter((iso) => !meta.some((m) => m.iso === iso));
const missingMedium = MEDIUM_TARGETS.filter((iso) => !meta.some((m) => m.iso === iso && m.medium));
console.log(`Features: ${meta.length}, Ziele schwer: ${meta.filter((m) => m.target).length}, mittel: ${meta.filter((m) => m.medium).length}`);
console.log(`Punkte (Kleinstaaten): ${mapCountries.filter((c) => c.dot).length}`);
if (missing.length || missingMedium.length) console.log('FEHLEN:', missing, missingMedium);
console.log(`map.json: ${(mapJson.length / 1024).toFixed(0)} KB, Höhe ${height}`);
