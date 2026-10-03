// Holt Städte mit deutschen Namen und aktueller Einwohnerzahl aus Wikidata und legt
// einen Schnappschuss in scripts/data/ ab (eingecheckt, damit Builds reproduzierbar sind).
// Aufruf: node scripts/fetch-places.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EUROPE_ISO, CAPITAL_OVERRIDES, LABEL_FALLBACK, EUROPE_BIG_CITIES } from './places-config.mjs';

const OUT = (name) => fileURLToPath(new URL(`./data/${name}`, import.meta.url));
const UA = 'laender-quiz/1.0 (privates Quiz, Build-Skript)';

async function sparql(query) {
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikidata ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).results.bindings;
}

const point = (wkt) => wkt.match(/Point\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
const qid = (uri) => uri.split('/').pop();

/** Pro Objekt die jüngste Einwohnerzahl wählen. */
function latestPopulation(rows) {
  const byItem = new Map();
  for (const r of rows) {
    const id = qid(r.item.value);
    const date = r.date?.value ?? '0000';
    const prev = byItem.get(id);
    if (!prev || date > prev.date || (date === prev.date && Number(r.pop.value) > prev.pop)) {
      byItem.set(id, { id, name: r.itemLabel.value, pop: Number(r.pop.value), date, coord: point(r.coord.value), extra: r });
    }
  }
  return [...byItem.values()];
}

// Deutschland: alle Gemeinden mit Gemeindeschlüssel (P439)
const deRows = await sparql(`
SELECT ?item ?itemLabel ?pop ?date ?coord WHERE {
  ?item wdt:P439 ?ags; wdt:P625 ?coord; p:P1082 ?st.
  ?st ps:P1082 ?pop. OPTIONAL { ?st pq:P585 ?date }
  FILTER NOT EXISTS { ?item wdt:P576 ?end }
  FILTER(?pop >= 15000)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de". }
}`);
const de = latestPopulation(deRows)
  .filter((c) => c.pop >= 20000 && !/^Q\d+$/.test(c.name))
  .map(({ id, name, pop, coord }) => ({ id, name, pop, lon: coord[0], lat: coord[1] }))
  .sort((a, b) => b.pop - a.pop);
writeFileSync(OUT('cities-de.json'), `${JSON.stringify(de, null, 0)}\n`);
console.log(`Deutschland: ${de.length} Städte ≥ 20.000 (≥100k: ${de.filter((c) => c.pop >= 100000).length}, ≥50k: ${de.filter((c) => c.pop >= 50000).length})`);

// Europa: Hauptstädte
const isoList = EUROPE_ISO.map((i) => `"${i}"`).join(' ');
const capRows = await sparql(`
SELECT ?iso ?item ?itemLabel ?coord ?pop ?date WHERE {
  VALUES ?iso { ${isoList} }
  ?country wdt:P297 ?iso; wdt:P36 ?item.
  ?item wdt:P625 ?coord. OPTIONAL { ?item p:P1082 ?st. ?st ps:P1082 ?pop. OPTIONAL { ?st pq:P585 ?date } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de". }
}`);
const capitals = new Map();
for (const r of capRows) {
  const iso = r.iso.value;
  const name = r.itemLabel.value;
  if (CAPITAL_OVERRIDES[iso] && CAPITAL_OVERRIDES[iso] !== name) continue;
  const prev = capitals.get(iso);
  const pop = Number(r.pop?.value ?? 0);
  if (!prev || pop > prev.pop) capitals.set(iso, { id: qid(r.item.value), name, iso, pop, lon: point(r.coord.value)[0], lat: point(r.coord.value)[1], capital: true });
}

// Europa: kuratierte Großstädte; Koordinaten und Einwohner aus GeoNames (cities15000),
// gefunden über Name oder alternative Namen (enthalten die deutschen Bezeichnungen)
const GEONAMES = fileURLToPath(new URL('../.cache/cities15000.txt', import.meta.url));
const geo = readFileSync(GEONAMES, 'utf8').trim().split('\n').map((line) => line.split('\t'))
  .map((f) => ({ names: new Set([f[1], f[2], ...f[3].split(',')]), lat: Number(f[4]), lon: Number(f[5]), iso: f[8], pop: Number(f[14]) }));
const wanted = Object.entries(EUROPE_BIG_CITIES).flatMap(([iso, names]) => names.map((name) => ({ iso, name })));
const best = new Map();
for (const w of wanted) {
  const hit = geo.filter((g) => g.iso === w.iso && g.names.has(w.name)).sort((a, b) => b.pop - a.pop)[0];
  if (hit) best.set(`${w.iso}:${w.name}`, { id: `${w.iso}-${w.name}`, name: w.name, iso: w.iso, pop: hit.pop, lon: hit.lon, lat: hit.lat, capital: false });
}
const eu = [...capitals.values()];
for (const c of best.values()) if (!eu.some((e) => e.name === c.name)) eu.push(c);
for (const c of eu) if (/^Q\d+$/.test(c.name)) c.name = LABEL_FALLBACK[c.id] ?? c.name;
eu.sort((a, b) => b.pop - a.pop);
writeFileSync(OUT('cities-eu.json'), `${JSON.stringify(eu, null, 0)}\n`);
const missing = EUROPE_ISO.filter((iso) => !capitals.has(iso));
const notFound = wanted.filter((w) => !best.has(`${w.iso}:${w.name}`)).map((w) => w.name);
console.log(`Europa: ${capitals.size} Hauptstädte, ${best.size} Großstädte${missing.length ? `, ohne Hauptstadt: ${missing}` : ''}${notFound.length ? `, nicht gefunden: ${notFound}` : ''}`);
const unnamed = [...de, ...eu].filter((c) => /^Q\d+$/.test(c.name));
if (unnamed.length) console.log('Ohne deutschen Namen:', unnamed.map((c) => c.id));
