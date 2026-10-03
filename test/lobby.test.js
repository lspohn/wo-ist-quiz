import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../server/modes.js';
import { Lobby, REVEAL_MS, HOST_GRACE_MS, sanitizeSettings } from '../server/lobby.js';
import { lobbyView } from '../server/lobby-view.js';

const data = loadGameData();

function fakeClock() {
  let t = 1_000_000;
  let timers = [];
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const h = { fn, at: t + ms }; timers.push(h); return h; },
    clearTimeout: (h) => { timers = timers.filter((x) => x !== h); },
    advance(ms) {
      t += ms;
      for (;;) {
        const due = timers.filter((x) => x.at <= t).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((x) => x !== due);
        due.fn();
      }
    },
  };
}

function setup(settings = { rounds: 5, timeLimit: 20 }) {
  const clock = fakeClock();
  const lobby = new Lobby({ id: 'L1', hostId: 'a', settings, data, clock, random: () => 0.3 });
  lobby.addPlayer({ id: 'a', name: 'Anna' });
  lobby.addPlayer({ id: 'b', name: 'Ben' });
  return { lobby, clock };
}

test('sanitizeSettings rejects unknown values', () => {
  assert.deepEqual(sanitizeSettings({ difficulty: 'leicht', timeLimit: 45, rounds: 15 }),
    { mode: 'welt', difficulty: 'mittel', timeLimit: 40, rounds: 15 });
  assert.equal(sanitizeSettings({ mode: 'de-staedte', difficulty: 'sehrschwer' }).difficulty, 'sehrschwer');
  assert.equal(sanitizeSettings({ mode: 'welt', difficulty: 'sehrschwer' }).difficulty, 'mittel');
  assert.equal(sanitizeSettings({ mode: 'mond' }).mode, 'welt');
  assert.equal(sanitizeSettings({ timeLimit: 20 }).timeLimit, 20);
});

test('only host can start the game', () => {
  const { lobby } = setup();
  assert.equal(lobby.start('b'), false);
  assert.equal(lobby.start('a'), true);
  assert.equal(lobby.phase, 'question');
});

test('round ends when all connected players guessed', () => {
  const { lobby } = setup();
  lobby.start('a');
  const target = lobby.round.target.i;
  lobby.guess('a', target);
  assert.equal(lobby.phase, 'question');
  lobby.guess('b', 0);
  assert.equal(lobby.phase, 'reveal');
  assert.equal(lobby.players.get('a').score, 1100);
  assert.equal(lobby.round.results[0].id, 'a');
  assert.ok(lobby.round.results.every((r) => typeof r.comment === 'string' && r.comment.length > 5));
});

test('round ends on timeout and missing players get 0', () => {
  const { lobby, clock } = setup();
  lobby.start('a');
  lobby.guess('a', lobby.round.target.i);
  clock.advance(20_000);
  assert.equal(lobby.phase, 'reveal');
  const ben = lobby.round.results.find((r) => r.id === 'b');
  assert.deepEqual([ben.points, ben.category], [0, 'none']);
});

test('disconnected players are not waited for', () => {
  const { lobby } = setup();
  lobby.start('a');
  lobby.setConnected('b', false);
  lobby.guess('a', 5);
  assert.equal(lobby.phase, 'reveal');
});

test('second guess is rejected', () => {
  const { lobby } = setup();
  lobby.addPlayer({ id: 'c', name: 'Cem' });
  lobby.start('a');
  assert.equal(lobby.guess('a', 5), true);
  assert.equal(lobby.guess('a', 6), false);
});

test('game runs all rounds then shows final with comments', () => {
  const { lobby, clock } = setup({ rounds: 5 });
  lobby.start('a');
  const targets = new Set();
  for (let r = 0; r < 5; r++) {
    targets.add(lobby.round.target.i);
    lobby.guess('a', lobby.round.target.i);
    lobby.guess('b', 0);
    if (r < 4) clock.advance(REVEAL_MS);
  }
  assert.equal(targets.size, 5);
  lobby.next('a');
  assert.equal(lobby.phase, 'final');
  assert.match(lobby.finalComments.headline, /Anna/);
  assert.match(lobbyView(lobby, 'b').final.mine, /Ben/);
  assert.equal(lobbyView(lobby, 'a').final.mine, null);
  assert.equal(lobby.backToLobby('a'), true);
  assert.equal(lobby.players.get('a').score, 0);
});

test('host is transferred after grace period', () => {
  const { lobby, clock } = setup();
  lobby.setConnected('a', false);
  clock.advance(HOST_GRACE_MS - 1);
  assert.equal(lobby.hostId, 'a');
  clock.advance(1);
  assert.equal(lobby.hostId, 'b');
});

test('host reconnecting within grace keeps host role', () => {
  const { lobby, clock } = setup();
  lobby.setConnected('a', false);
  clock.advance(5_000);
  lobby.setConnected('a', true);
  clock.advance(HOST_GRACE_MS);
  assert.equal(lobby.hostId, 'a');
});

test('lobbyView hides other guesses during question', () => {
  const { lobby } = setup();
  lobby.start('a');
  lobby.guess('a', 7);
  const viewB = lobbyView(lobby, 'b');
  assert.equal(viewB.question.myGuess, null);
  assert.equal(viewB.players.find((p) => p.id === 'a').answered, true);
  assert.ok(!JSON.stringify(viewB).includes('"guess"'));
  assert.equal(typeof viewB.question.target, 'string');
  assert.ok(viewB.question.remainingMs <= 20_000);
});

test('late joiner can participate in running game', () => {
  const { lobby } = setup();
  lobby.start('a');
  assert.equal(lobby.addPlayer({ id: 'c', name: 'Cem' }), true);
  lobby.guess('a', 1);
  lobby.guess('b', 1);
  assert.equal(lobby.phase, 'question');
  lobby.guess('c', 1);
  assert.equal(lobby.phase, 'reveal');
});

test('guess after deadline is rejected even if timer has not fired', () => {
  const { lobby, clock } = setup();
  lobby.start('a');
  const t = lobby.round.target.i;
  clock.now = ((n) => () => n + 31_000)(clock.now());
  assert.equal(lobby.guess('a', t), false);
  assert.equal(lobby.phase, 'reveal');
  assert.equal(lobby.players.get('a').score, 0);
});

test('guess with stale round key is rejected', () => {
  const { lobby } = setup();
  lobby.start('a');
  const key = lobby.roundKey;
  lobby.guess('a', 1); lobby.guess('b', 1);
  lobby.next('a', key);
  assert.equal(lobby.phase, 'question');
  assert.equal(lobby.guess('b', 2, key), false);
  assert.equal(lobby.guess('b', 2, lobby.roundKey), true);
});

test('stale next does not skip a later reveal', () => {
  const { lobby } = setup();
  lobby.start('a');
  const key1 = lobby.roundKey;
  lobby.guess('a', 1); lobby.guess('b', 1);
  lobby.next('a', key1);
  lobby.guess('a', 1); lobby.guess('b', 1);
  assert.equal(lobby.next('a', key1), false);
  assert.equal(lobby.phase, 'reveal');
});

test('returning player becomes host when offline host grace expired', () => {
  const { lobby, clock } = setup();
  lobby.setConnected('a', false);
  lobby.setConnected('b', false);
  clock.advance(HOST_GRACE_MS);
  assert.equal(lobby.hostId, 'a');
  lobby.setConnected('b', true);
  assert.equal(lobby.hostId, 'b');
});

test('finish reports highscore ranks per player in the view', () => {
  const clock = fakeClock();
  const lobby = new Lobby({
    id: 'L2', hostId: 'a', settings: { rounds: 5 }, data, clock, random: () => 0.3,
    onFinish: (l) => ({ [l.standings()[0].id]: 1 }),
  });
  lobby.addPlayer({ id: 'a', name: 'Anna' });
  lobby.start('a');
  for (let r = 0; r < 5; r++) {
    lobby.guess('a', lobby.round.target.i);
    lobby.next('a');
  }
  assert.equal(lobby.phase, 'final');
  assert.equal(lobbyView(lobby, 'a').final.highscoreRank, 1);
  assert.ok(lobbyView(lobby, 'a').final.headline);
});

function playGame(lobby, clock, rounds, guesses) {
  lobby.start('a');
  const targets = [];
  for (let r = 0; r < rounds; r++) {
    targets.push(lobby.round.target.i);
    for (const [id, pick] of Object.entries(guesses)) lobby.guess(id, pick(lobby.round.target.i));
    lobby.next('a');
  }
  return targets;
}

test('scores accumulate across games of one lobby', () => {
  const { lobby, clock } = setup({ rounds: 5 });
  playGame(lobby, clock, 5, { a: (t) => t, b: () => 0 });
  const first = lobby.players.get('a').score;
  playGame(lobby, clock, 5, { a: (t) => t, b: () => 0 });
  const a = lobby.players.get('a');
  assert.equal(a.total, first + a.score);
  assert.equal(lobby.gamesPlayed, 2);
  const view = lobbyView(lobby, 'a').players.find((p) => p.id === 'a');
  assert.equal(view.total, a.total);
});

test('targets do not repeat across games until the pool is used up', () => {
  const clock = fakeClock();
  const lobby = new Lobby({ id: 'L3', hostId: 'a', settings: { rounds: 15 }, data, clock });
  lobby.addPlayer({ id: 'a', name: 'Anna' });
  const all = [];
  for (let g = 0; g < 8; g++) all.push(...playGame(lobby, clock, 15, { a: (t) => t }));
  assert.equal(new Set(all.slice(0, 120)).size, 120);
});

test('final comments do not repeat across games in one lobby', () => {
  const clock = fakeClock();
  const lobby = new Lobby({ id: 'L4', hostId: 'a', settings: { rounds: 5 }, data, clock });
  lobby.addPlayer({ id: 'a', name: 'Anna' });
  const seen = [];
  for (let g = 0; g < 6; g++) {
    playGame(lobby, clock, 5, { a: (t) => t });
    seen.push(lobby.finalComments.headline);
  }
  assert.equal(new Set(seen).size, 6);
});
