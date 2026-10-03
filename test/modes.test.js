import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData, questionPool, scoreForMode, answerSpace, targetSubline } from '../server/modes.js';

const data = loadGameData();
const city = (name) => data.deCities.find((c) => c.name === name);
const state = (name) => data.deStates.find((s) => s.name === name);

test('question pools have the expected sizes', () => {
  assert.equal(questionPool(data, 'welt', 'mittel').length, 121);
  assert.equal(questionPool(data, 'europa', 'mittel').length, 47);
  assert.equal(questionPool(data, 'deutschland', 'mittel').length, 16);
  assert.equal(questionPool(data, 'deutschland', 'schwer').length, 16 + 13);
  assert.equal(questionPool(data, 'de-staedte', 'mittel').length, 79);
  assert.equal(questionPool(data, 'de-staedte', 'schwer').length, 194);
  assert.equal(questionPool(data, 'de-staedte', 'sehrschwer').length, 704);
  assert.equal(questionPool(data, 'europa-staedte', 'mittel').length, 47);
  assert.ok(questionPool(data, 'europa-staedte', 'schwer').length > 120);
});

test('state capital questions point at the state, city states excluded', () => {
  const qs = questionPool(data, 'deutschland', 'schwer').filter((q) => q.prompt === 'capital-state');
  const stuttgart = qs.find((q) => q.subject === 'Stuttgart');
  assert.equal(data.deStates[stuttgart.answer].name, 'Baden-Württemberg');
  assert.ok(!qs.some((q) => ['Berlin', 'Hamburg', 'Bremen'].includes(q.subject)));
});

test('europe capital questions ask for the country', () => {
  const qs = questionPool(data, 'europa', 'schwer').filter((q) => q.prompt === 'capital-country');
  const q = qs.find((x) => x.subject === 'Bratislava');
  assert.equal(data.world[q.answer].name, 'Slowakei');
  assert.ok(!qs.some((x) => x.subject === 'Monaco' || x.subject === 'San Marino'));
});

test('city scoring decays with distance and rewards exact hits', () => {
  const muc = city('München');
  assert.equal(scoreForMode('de-staedte', muc, muc, 1).points, 1100);
  const augsburg = scoreForMode('de-staedte', muc, city('Augsburg'), 1);
  const hamburg = scoreForMode('de-staedte', muc, city('Hamburg'), 1);
  assert.equal(augsburg.category, 'p_near');
  assert.ok(augsburg.km > 40 && augsburg.km < 70, `km=${augsburg.km}`);
  assert.ok(augsburg.points > 150 && augsburg.points < 400, `pts=${augsburg.points}`);
  assert.equal(hamburg.category, 'p_veryfar');
  assert.ok(hamburg.points < 2);
});

test('state scoring knows neighbours and uses German categories', () => {
  assert.equal(scoreForMode('deutschland', state('Bayern'), state('Hessen')).category, 'de_neighbor');
  const far = scoreForMode('deutschland', state('Bayern'), state('Schleswig-Holstein'));
  assert.equal(far.category, 'de_far');
  assert.ok(far.points < 200);
});

test('europe mode never says wrong continent', () => {
  const pt = data.world.find((c) => c.iso === 'PT' && c.target);
  const ru = data.world.find((c) => c.iso === 'RU' && c.target);
  assert.equal(scoreForMode('europa', pt, ru).category, 'eu_far');
});

test('sublines describe the solved target', () => {
  const q = questionPool(data, 'de-staedte', 'mittel').find((x) => x.subject === 'Köln');
  assert.match(targetSubline(data, 'de-staedte', q), /Nordrhein-Westfalen/);
  assert.equal(answerSpace(data, 'de-staedte')[q.answer].name, 'Köln');
});
