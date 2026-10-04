// Baut die Europa-Karte (eigene Kegelprojektion, Natural Earth 10m mit wenig Vereinfachung,
// Ausschnitt Portugal–Moskau, Island–Ägypten) für die Varianten „Europa“ und „Europa-Städte“.
// Die Länder tragen dieselben Indizes wie die Weltkarte (server/data/countries.json),
// damit der Server unverändert mit der Welt-Antwortmenge arbeitet.
import { readFileSync, writeFileSync } from 'node:fs';
import { geoArea, geoConicConformal, geoPath } from 'd3-geo';
import { file, inBox as inBoxOf, load, round1, shape } from './lib/regional.mjs';

const WIDTH = 1200;
// Sichtbarer Ausschnitt (wird als Rechteck in Bildschirmkoordinaten zugeschnitten):
// Island bis Moskau, Nordkap bis Ägypten/Tunesien, Iran nur am Rand
const VIEW = [[-24, 35], [44, 35], [-24, 70], [44, 70], [10, 26], [10, 71]];
// Daten großzügiger laden, damit das Rechteck vollständig gefüllt ist
const BOX = [-45, 12, 70, 82];
// Punkt für Kleinstaaten nach echter Fläche (< ~600 km²), nicht nach dem zugeschnittenen Rest
const DOT_SR = 600 / 6371 ** 2;
const inBox = inBoxOf(BOX);

const meta = JSON.parse(readFileSync(file('server/data/countries.json'), 'utf8'));
const world = (await load('ne10')).features.filter((f) => f.properties.ISO_A2_EH !== 'AQ');
if (world.length !== meta.length) throw new Error('Weltkarte und countries.json passen nicht zusammen – erst npm run build:map');

// Länder im Ausschnitt; Index = Position in der Weltliste
const picked = world.map((f, i) => ({ f, i })).filter(({ f }) => inBox(f));
const clipped = await shape(picked.map(({ f, i }) => ({ ...f, properties: { i } })), process.env.EU_SIMPLIFY ?? '30%', BOX);

const rivers = await shape((await load('ne_10m_rivers_lake_centerlines')).features
  .filter((f) => (f.properties.scalerank ?? 10) <= 7 && inBox(f)), '40%', BOX);
const lakes = await shape((await load('ne_10m_lakes')).features
  .filter((f) => (f.properties.scalerank ?? 10) <= 5 && inBox(f)), '40%', BOX);

const frame = { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: VIEW } };
const projection = geoConicConformal().parallels([40, 65]).rotate([-12, 0]).fitWidth(WIDTH, frame);
const [[x0, y0], [, y1]] = geoPath(projection).bounds(frame);
projection.translate([projection.translate()[0] - x0, projection.translate()[1] - y0]);
const height = Math.ceil(y1 - y0);
projection.clipExtent([[0, 0], [WIDTH, height]]);
const path = geoPath(projection).digits(1);

const areas = [];
for (const f of clipped) {
  const i = f.properties.i;
  const d = path(f);
  if (!d) continue;
  const m = meta[i];
  const p = world[i].properties;
  if (m.alias !== undefined) {
    areas.push({ i: m.alias, d, b: path.bounds(f).flat().map(Math.round), alias: true });
    continue;
  }
  const entry = { i, d, b: path.bounds(f).flat().map(Math.round) };
  const label = projection([p.LABEL_X, p.LABEL_Y]);
  if (label) entry.l = label.map(round1);
  // Kernbereich (größtes Teilstück im Ausschnitt) für den Zoom bei der Auflösung
  if (f.geometry.type === 'MultiPolygon') {
    const parts = f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
    const big = parts.reduce((a, b) => (path.area(b) > path.area(a) ? b : a));
    entry.mb = path.bounds(big).flat().map(Math.round);
  }
  if (geoArea(world[i]) < DOT_SR && label && m.target) entry.dot = label.map(round1);
  areas.push(entry);
}

const cities = JSON.parse(readFileSync(file('server/data/eu-cities.json'), 'utf8')).map((c) => {
  const [x, y] = projection([c.lon, c.lat]);
  return { i: c.i, x: round1(x), y: round1(y), t: c.capital ? 1 : 2 };
});

const mapJson = {
  w: WIDTH,
  h: height,
  states: areas,
  rivers: rivers.map((f) => ({ d: path(f), r: (f.properties.scalerank ?? 10) <= 4 ? 1 : 2 })).filter((r) => r.d),
  lakes: lakes.map((f) => path(f)).filter(Boolean),
  cities,
};
writeFileSync(file('public/data/europe.json'), JSON.stringify(mapJson));
const missing = meta.filter((m) => m.europe && !areas.some((a) => a.i === m.i && !a.alias)).map((m) => m.iso);
console.log(`Europa: ${areas.length} Flächen, ${cities.length} Städte, ${mapJson.rivers.length} Flüsse, ${(JSON.stringify(mapJson).length / 1024) | 0} KB, ${WIDTH}×${height}${missing.length ? `, FEHLEN: ${missing}` : ''}`);
console.log(`Punkte (Kleinstaaten): ${areas.filter((a) => a.dot).map((a) => meta[a.i].iso).join(' ')}`);
