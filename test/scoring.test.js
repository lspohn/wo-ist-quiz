import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCountries, targetPool, borderDistanceKm } from '../server/geo.js';
import { scoreGuess } from '../server/scoring.js';

const countries = loadCountries();
const by = (iso) => countries.find((c) => c.iso === iso);

test('scoreGuess exact match gives 1000 plus speed bonus', () => {
  const de = by('DE');
  assert.equal(scoreGuess(de, de, 1).points, 1100);
  assert.equal(scoreGuess(de, de, 0.5).points, 1050);
  assert.equal(scoreGuess(de, de, 0).category, 'exact');
});

test('scoreGuess neighbor gives 500', () => {
  const r = scoreGuess(by('DE'), by('AT'), 1);
  assert.deepEqual([r.points, r.category], [500, 'neighbor']);
});

test('scoreGuess no guess gives 0 with category none', () => {
  assert.deepEqual(scoreGuess(by('DE'), null), { points: 0, km: null, category: 'none' });
});

test('scoreGuess near non-neighbor scores high and is close', () => {
  const r = scoreGuess(by('GB'), by('FR'));
  assert.equal(r.category, 'close');
  assert.ok(r.km < 50, `km=${r.km}`);
  assert.ok(r.points > 400);
});

test('scoreGuess same continent has floor of 100', () => {
  const r = scoreGuess(by('PT'), by('RU'));
  assert.equal(r.category, 'continent');
  assert.ok(r.points >= 100);
});

test('scoreGuess opposite side of world scores near zero', () => {
  const r = scoreGuess(by('NZ'), by('ES'));
  assert.equal(r.category, 'veryfar');
  assert.ok(r.points < 5);
  assert.ok(r.km > 15000);
});

test('scoreGuess points decrease monotonically with distance', () => {
  const de = by('DE');
  const guesses = ['IT', 'ES', 'EG', 'IN', 'AR'].map(by);
  const pts = guesses.map((g) => scoreGuess(de, g).points);
  for (let k = 1; k < pts.length; k++) assert.ok(pts[k] <= pts[k - 1], pts.join(','));
});

test('borderDistanceKm is symmetric and zero for neighbors', () => {
  assert.equal(borderDistanceKm(by('FR'), by('ES')), 0);
  const a = borderDistanceKm(by('IE'), by('IS'));
  assert.equal(Math.round(a), Math.round(borderDistanceKm(by('IS'), by('IE'))));
  assert.ok(a > 700 && a < 1300, `IE-IS ${a}`);
});

test('targetPool sizes match difficulty', () => {
  assert.equal(targetPool(countries, 'schwer').length, 197);
  assert.equal(targetPool(countries, 'mittel').length, 121);
  assert.ok(targetPool(countries, 'mittel').every((c) => c.target));
});

test('country names are German and unique among targets', () => {
  const names = targetPool(countries, 'schwer').map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('Deutschland') && names.includes('China') && names.includes('Taiwan'));
});
