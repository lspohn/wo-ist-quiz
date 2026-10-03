import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommentPicker, fillTemplate } from '../server/comments.js';
import { COMMENTS } from '../server/data/comments.js';

test('fillTemplate replaces known placeholders and keeps unknown', () => {
  assert.equal(fillTemplate('{name} in {ziel} {x}', { name: 'A', ziel: 'B' }), 'A in B {x}');
});

test('CommentPicker does not repeat until category exhausted', () => {
  const picker = new CommentPicker();
  const n = COMMENTS.exact.length;
  const seen = new Set();
  for (let k = 0; k < n; k++) seen.add(picker.pick('exact', { name: 'X', ziel: 'Y' }));
  assert.equal(seen.size, n);
  assert.ok(picker.pick('exact', {}));
});

test('comment pool has at least 100 strings and only known placeholders', () => {
  const all = Object.values(COMMENTS).flat();
  assert.ok(all.length >= 100, `only ${all.length}`);
  for (const s of all) {
    for (const [, key] of s.matchAll(/\{(\w+)\}/g)) assert.ok(['name', 'ziel', 'tipp', 'km'].includes(key), s);
  }
});

test('categories without distance do not reference km', () => {
  for (const cat of ['exact', 'neighbor', 'none', 'winner', 'loser', 'solo', 'middle']) {
    for (const s of COMMENTS[cat]) assert.ok(!s.includes('{km}'), s);
  }
});
