import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Highscores, boardKey, MAX_ENTRIES } from '../server/highscores.js';

const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'hs-')), 'highscores.json');
const settings = { difficulty: 'mittel', timeLimit: 30, rounds: 5 };

test('boardKey separates difficulty and round count', () => {
  assert.equal(boardKey(settings), 'mittel-5');
  assert.equal(boardKey({ ...settings, difficulty: 'schwer', rounds: 15 }), 'schwer-15');
});

test('record returns rank per player and keeps list sorted', () => {
  const hs = new Highscores(tmpFile(), () => 1000);
  hs.record(settings, [{ id: 'a', name: 'Anna', score: 3000 }]);
  const ranks = hs.record(settings, [
    { id: 'b', name: 'Ben', score: 4000 },
    { id: 'c', name: 'Cem', score: 100 },
  ]);
  assert.deepEqual(ranks, { b: 1, c: 3 });
  assert.deepEqual(hs.board('mittel-5').map((e) => e.name), ['Ben', 'Anna', 'Cem']);
});

test('record caps the board and reports no rank for players outside it', () => {
  const hs = new Highscores(tmpFile(), () => 1000);
  for (let k = 0; k < MAX_ENTRIES; k++) hs.record(settings, [{ id: `p${k}`, name: `P${k}`, score: 1000 + k }]);
  const ranks = hs.record(settings, [{ id: 'z', name: 'Zoe', score: 5 }]);
  assert.deepEqual(ranks, {});
  assert.equal(hs.board('mittel-5').length, MAX_ENTRIES);
});

test('equal score keeps the older entry ahead', () => {
  const hs = new Highscores(tmpFile(), () => 1000);
  hs.record(settings, [{ id: 'a', name: 'Anna', score: 500 }]);
  const ranks = hs.record(settings, [{ id: 'b', name: 'Ben', score: 500 }]);
  assert.deepEqual(ranks, { b: 2 });
});

test('scores persist to disk and reload', () => {
  const file = tmpFile();
  new Highscores(file, () => 1000).record(settings, [{ id: 'a', name: 'Anna', score: 777 }]);
  const again = new Highscores(file);
  assert.equal(again.board('mittel-5')[0].score, 777);
  assert.equal(JSON.parse(readFileSync(file, 'utf8'))['mittel-5'][0].name, 'Anna');
});

test('corrupt file starts empty instead of crashing', () => {
  const file = tmpFile();
  writeFileSync(file, '{kaputt');
  assert.deepEqual(new Highscores(file).all(), {});
});

test('zero scores are not recorded', () => {
  const hs = new Highscores(tmpFile());
  assert.deepEqual(hs.record(settings, [{ id: 'a', name: 'Anna', score: 0 }]), {});
  assert.equal(hs.board('mittel-5').length, 0);
});
