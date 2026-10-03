import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deck } from '../server/deck.js';

const items = Array.from({ length: 7 }, (_, i) => ({ i }));

test('Deck draws every item once before repeating', () => {
  const deck = new Deck(() => items, Math.random);
  const first = Array.from({ length: 7 }, () => deck.draw('mittel').i);
  assert.equal(new Set(first).size, 7);
});

test('Deck reshuffles after exhaustion without immediate repeat', () => {
  for (let run = 0; run < 50; run++) {
    const deck = new Deck(() => items, Math.random);
    let last;
    for (let k = 0; k < 7; k++) last = deck.draw('mittel').i;
    assert.notEqual(deck.draw('mittel').i, last);
  }
});

test('Deck keeps separate stacks per difficulty', () => {
  const deck = new Deck((d) => (d === 'mittel' ? items.slice(0, 2) : items), Math.random);
  const m = [deck.draw('mittel').i, deck.draw('mittel').i];
  assert.deepEqual(new Set(m), new Set([0, 1]));
  assert.ok(deck.draw('schwer'));
});
