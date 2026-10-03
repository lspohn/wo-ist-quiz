import { readFileSync } from 'node:fs';

const EARTH_KM = 6371;
const RAD = Math.PI / 180;

/** Load country metadata produced by scripts/build-map.mjs. */
export function loadCountries(file = new URL('./data/countries.json', import.meta.url)) {
  const list = JSON.parse(readFileSync(file, 'utf8'));
  for (const c of list) {
    c.neighborSet = new Set(c.neighbors);
    c.rad = c.pts.map(([lon, lat]) => [lon * RAD, lat * RAD, Math.cos(lat * RAD)]);
  }
  return list;
}

/** Pool of target countries for a difficulty ('mittel' | 'schwer'). */
export function targetPool(countries, difficulty) {
  return countries.filter((c) => (difficulty === 'mittel' ? c.medium : c.target));
}

function haversine(a, b) {
  const dLat = b[1] - a[1];
  const dLon = b[0] - a[0];
  const h = Math.sin(dLat / 2) ** 2 + a[2] * b[2] * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Smallest distance in km between the sampled borders of two countries. */
export function borderDistanceKm(a, b) {
  if (a === b) return 0;
  if (a.neighborSet.has(b.i)) return 0;
  let best = Infinity;
  for (const p of a.rad) {
    for (const q of b.rad) {
      const d = haversine(p, q);
      if (d < best) best = d;
    }
  }
  return best;
}
