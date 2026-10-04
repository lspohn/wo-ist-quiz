// Baut die USA-Karte (Bundesstaaten in Albers-Projektion mit Alaska/Hawaii als Einschub,
// Kanada/Mexiko als Kontext, große Flüsse und Seen) sowie die Serverdaten der Variante „USA“.
import { writeFileSync } from 'node:fs';
import { geoAlbers, geoAlbersUsa, geoPath } from 'd3-geo';
import { US_CAPITALS, US_NAME_OVERRIDES } from './places-config.mjs';
import { file, inBox as inBoxOf, load, neighborsOf, round1, samplePoints, shape, smooth } from './lib/regional.mjs';

const WIDTH = 1000;
const PAD = 30;
const CLIP = [-160, 14, -45, 78]; // Umfeld des Festlands; Alaska/Hawaii kommen als Einschub ohne Kontext
const MAINLAND = [-125, 24, -66, 50];
const inBox = inBoxOf(CLIP);

const rawStates = (await load('ne_10m_admin_1_states_provinces')).features
  .filter((f) => f.properties.iso_a2 === 'US')
  .map((f) => ({ ...f, properties: { ...f.properties, de: US_NAME_OVERRIDES[f.properties.postal] ?? f.properties.name_de ?? f.properties.name } }))
  .sort((a, b) => a.properties.de.localeCompare(b.properties.de, 'de'));
const neighbors = neighborsOf(rawStates);

const states = await shape(rawStates, process.env.US_SIMPLIFY ?? '40%');
const context = await shape((await load('ne10')).features.filter((f) => ['CA', 'MX', 'CU', 'BS'].includes(f.properties.ISO_A2_EH)), '10%', CLIP);
// Gewässer nur im Festland-Rahmen – sie liegen über den Staaten und dürfen nicht in die Einschübe ragen
const rivers = await shape((await load('ne_10m_rivers_lake_centerlines')).features
  .filter((f) => (f.properties.scalerank ?? 10) <= 7 && inBoxOf(MAINLAND)(f)), null, MAINLAND);
const lakes = (await shape((await load('ne_10m_lakes')).features
  .filter((f) => (f.properties.scalerank ?? 10) <= 4 && inBoxOf(MAINLAND)(f)), '50%', MAINLAND)).map((f) => smooth(f));

const stateFc = { type: 'FeatureCollection', features: states };
const projection = geoAlbersUsa().fitWidth(WIDTH - 2 * PAD, stateFc);
const [[x0, y0], [, y1]] = geoPath(projection).bounds(stateFc);
projection.translate([projection.translate()[0] - x0 + PAD, projection.translate()[1] - y0 + PAD]);
const height = Math.ceil(y1 - y0 + 2 * PAD);
const path = geoPath(projection).digits(1);
// Kontext (Kanada, Mexiko, Flüsse, Seen) mit der ungeschnittenen Festland-Projektion –
// sonst entstehen harte Kanten und Kanada-/Mexiko-Stücke in den Einschüben
const mainland = geoAlbers().scale(projection.scale()).translate(projection.translate()).clipExtent([[0, 0], [WIDTH, height]]);
const ctxPath = geoPath(mainland).digits(1);

const stateMeta = rawStates.map((f, i) => {
  const { postal, de } = f.properties;
  return {
    i, name: de, postal, capital: US_CAPITALS[postal] ?? null, target: postal !== 'DC',
    neighbors: neighbors[i], pts: samplePoints(f.geometry),
  };
});
const mapStates = states.map((f, i) => ({
  i,
  d: path(f),
  b: path.bounds(f).flat().map(Math.round),
  l: path.centroid(f).map(round1),
}));

// Rahmen um die Einschübe Alaska und Hawaii, damit klar ist, dass sie versetzt sind
const insetFrame = (postal) => {
  const f = states[rawStates.findIndex((s) => s.properties.postal === postal)];
  const [[a, b], [c, d]] = path.bounds(f);
  const m = 8;
  return `M${Math.round(a - m)},${Math.round(b - m)}H${Math.round(c + m)}V${Math.round(d + m)}H${Math.round(a - m)}Z`;
};

const mapJson = {
  w: WIDTH,
  h: height,
  proj: { type: 'albersUsa', scale: projection.scale(), translate: projection.translate() },
  states: mapStates,
  context: context.map((f) => ctxPath(f)).filter(Boolean),
  rivers: rivers.map((f) => ({ d: ctxPath(f), r: (f.properties.scalerank ?? 10) <= 4 ? 1 : 2 })).filter((r) => r.d),
  lakes: lakes.map((f) => ctxPath(f)).filter(Boolean),
  insets: [insetFrame('AK'), insetFrame('HI')],
  cities: [],
};
writeFileSync(file('public/data/usa.json'), JSON.stringify(mapJson));
writeFileSync(file('server/data/us-states.json'), JSON.stringify(stateMeta));
const missing = stateMeta.filter((s) => s.target && !s.capital).map((s) => s.postal);
console.log(`USA: ${stateMeta.filter((s) => s.target).length} Staaten, ${mapJson.rivers.length} Flüsse, ${mapJson.lakes.length} Seen, ${(JSON.stringify(mapJson).length / 1024) | 0} KB, ${WIDTH}×${height}${missing.length ? `, ohne Hauptstadt: ${missing}` : ''}`);
console.log('Nachbarn Colorado:', stateMeta.find((s) => s.postal === 'CO').neighbors.map((n) => stateMeta[n].postal).join(' '));
console.log('Nachbarn Hawaii:', stateMeta.find((s) => s.postal === 'HI').neighbors.length, '| Maine:', stateMeta.find((s) => s.postal === 'ME').neighbors.map((n) => stateMeta[n].postal).join(' '));
