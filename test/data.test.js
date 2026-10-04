import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const countries = read('server/data/countries.json');
const inside = (pt, m) => pt[0] >= 0 && pt[0] <= m.w && pt[1] >= 0 && pt[1] <= m.h;

test('world map ids match server countries one to one', () => {
  const world = read('public/data/map.json');
  for (const c of world.c) assert.ok(countries[c.i], `id ${c.i}`);
  for (const c of countries.filter((x) => x.target)) assert.ok(world.c.some((a) => a.i === c.i && !a.alias), c.iso);
});

test('europe map uses world ids and covers every European target with a visible anchor', () => {
  const eu = read('public/data/europe.json');
  for (const a of eu.states) assert.ok(countries[a.i], `id ${a.i}`);
  for (const c of countries.filter((x) => x.europe)) {
    const area = eu.states.find((a) => a.i === c.i && !a.alias);
    assert.ok(area, c.iso);
    assert.ok(inside(area.l, eu), `${c.iso} anchor ${area.l}`);
  }
  const cities = read('server/data/eu-cities.json');
  assert.equal(eu.cities.length, cities.length);
  for (const p of eu.cities) assert.ok(inside([p.x, p.y], eu), cities[p.i].name);
});

test('germany and usa maps match their server state lists', () => {
  for (const [map, data, n] of [['germany', 'de-states', 16], ['usa', 'us-states', 51]]) {
    const m = read(`public/data/${map}.json`);
    const states = read(`server/data/${data}.json`);
    assert.equal(states.length, n);
    assert.deepEqual(m.states.map((s) => s.i).sort((a, b) => a - b), states.map((s) => s.i));
  }
  const de = read('public/data/germany.json');
  assert.equal(de.cities.length, read('server/data/de-cities.json').length);
});
