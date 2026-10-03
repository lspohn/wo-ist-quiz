// Gemeinsame Bausteine für Regionalkarten (Deutschland, USA): Quellen laden, zuschneiden,
// vereinfachen, Nachbarn aus gemeinsamen Stützpunkten, Grenzpunkte für die Distanzwertung.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea } from 'd3-geo';
import mapshaper from 'mapshaper';

export const file = (rel) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const SOURCES = { ne10: 'ne_10m_admin_0_countries' };

/** Natural-Earth-Datei aus .cache laden (lädt sie beim ersten Mal herunter). */
export async function load(name) {
  const target = file(`.cache/${name}.geojson`);
  if (!existsSync(target)) {
    mkdirSync(dirname(target), { recursive: true });
    const res = await fetch(`${NE}/${SOURCES[name] ?? name}.geojson`);
    if (!res.ok) throw new Error(`Download ${name} fehlgeschlagen: ${res.status}`);
    writeFileSync(target, await res.text());
  }
  return JSON.parse(readFileSync(target, 'utf8'));
}

/** Prädikat: liegt mindestens ein Stützpunkt der Geometrie in der Box [x0,y0,x1,y1]? */
export const inBox = (box) => (f) => {
  if (!f.geometry) return false;
  const nums = JSON.stringify(f.geometry.coordinates).match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g) ?? [];
  return nums.some((p) => {
    const [x, y] = p.split(',').map(Number);
    return x > box[0] && x < box[2] && y > box[1] && y < box[3];
  });
};

/** Zuschneiden (optional) und vereinfachen via mapshaper; Ringe für d3 ausrichten. */
export async function shape(features, simplify, clip = null) {
  const cmd = `-i in.json ${clip ? `-clip bbox=${clip.join(',')}` : ''} ${simplify ? `-simplify ${simplify} keep-shapes planar` : ''} -o out.json format=geojson`;
  const out = await mapshaper.applyCommands(cmd, { 'in.json': { type: 'FeatureCollection', features } });
  return JSON.parse(out['out.json']).features.map(rewind);
}

// d3 erwartet Außenringe im Uhrzeigersinn; mapshaper liefert RFC 7946
export function rewind(f) {
  if (!/Polygon/.test(f.geometry?.type ?? '') || geoArea(f) <= 2 * Math.PI) return f;
  const rev = (poly) => poly.map((ring) => [...ring].reverse());
  const g = f.geometry;
  return { ...f, geometry: { ...g, coordinates: g.type === 'Polygon' ? rev(g.coordinates) : g.coordinates.map(rev) } };
}

export const rings = (g) => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat());

/** Nachbarschaft über gemeinsame (gerundete) Stützpunkte. */
export function neighborsOf(features) {
  const owners = new Map();
  features.forEach((f, i) => {
    for (const ring of rings(f.geometry)) {
      for (const [x, y] of ring) {
        const key = `${x.toFixed(3)},${y.toFixed(3)}`;
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key).add(i);
      }
    }
  });
  const neighbors = features.map(() => new Set());
  for (const set of owners.values()) for (const a of set) for (const b of set) if (a !== b) neighbors[a].add(b);
  return neighbors.map((s) => [...s]);
}

/** Bis zu `max` Grenzpunkte [lon, lat] für die Distanzwertung. */
export function samplePoints(geometry, max = 400) {
  const pts = rings(geometry).flat();
  const step = Math.max(1, Math.ceil(pts.length / max));
  return pts.filter((_, k) => k % step === 0).map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);
}

export const round1 = (v) => Math.round(v * 10) / 10;
