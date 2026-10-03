import { CommentPicker } from './comments.js';
import { targetPool } from './geo.js';
import { scoreGuess } from './scoring.js';

export const SETTINGS_OPTIONS = {
  difficulty: ['mittel', 'schwer'],
  timeLimit: [30, 60],
  rounds: [5, 10, 15],
};
export const DEFAULT_SETTINGS = { difficulty: 'mittel', timeLimit: 30, rounds: 10 };
export const MAX_PLAYERS = 12;
export const REVEAL_MS = 45_000;
export const HOST_GRACE_MS = 15_000;
export const PLAYER_COLORS = [
  '#ff6b4a', '#3ec5ff', '#ffd23f', '#9b5de5', '#2ee6a6', '#ff4fa3',
  '#f9a03f', '#5b8cff', '#b8f25c', '#e0e0e0', '#00b3a4', '#c38dff',
];

const defaultClock = { now: () => Date.now(), setTimeout, clearTimeout };

/** Validate settings against the allowed options; unknown values fall back. */
export function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const out = { ...base };
  for (const [key, allowed] of Object.entries(SETTINGS_OPTIONS)) {
    if (allowed.includes(input[key])) out[key] = input[key];
  }
  return out;
}

/** One game room: lobby → question ↔ reveal → final. */
export class Lobby {
  constructor({
    id, hostId, settings, countries, clock = defaultClock, random = Math.random, onChange = () => {}, onFinish = () => ({}),
  }) {
    this.id = id;
    this.hostId = hostId;
    this.settings = sanitizeSettings(settings);
    this.countries = countries;
    this.clock = clock;
    this.random = random;
    this.onChange = onChange;
    this.onFinish = onFinish;
    this.highscoreRanks = {};
    this.players = new Map();
    this.phase = 'lobby';
    this.round = null;
    this.roundNo = 0;
    this.gameNo = 0;
    this.usedTargets = new Set();
    this.comments = new CommentPicker(random);
    this.timer = null;
    this.hostTimer = null;
    this.finalComments = null;
    this.lastActivity = clock.now();
  }

  /** Identifies the current round so stale client actions can be rejected. */
  get roundKey() {
    return `${this.gameNo}-${this.roundNo}`;
  }

  isStale(key) {
    return key !== undefined && key !== this.roundKey;
  }

  get connectedPlayers() {
    return [...this.players.values()].filter((p) => p.connected);
  }

  addPlayer({ id, name }) {
    if (this.players.has(id)) {
      this.setConnected(id, true);
      this.ensureHost();
      return true;
    }
    if (this.players.size >= MAX_PLAYERS) return false;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0];
    this.players.set(id, { id, name, color, score: 0, connected: true, joinedAt: this.clock.now() });
    this.ensureHost();
    this.touch();
    return true;
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return;
    if (this.hostId === id) this.transferHost();
    this.checkRoundComplete();
    this.touch();
  }

  setConnected(id, connected) {
    const p = this.players.get(id);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    if (id === this.hostId) {
      this.clock.clearTimeout(this.hostTimer);
      this.hostTimer = null;
      if (!connected) {
        this.hostTimer = this.clock.setTimeout(() => { this.hostTimer = null; this.transferHost(); }, HOST_GRACE_MS);
      }
    }
    if (connected) this.ensureHost();
    else this.checkRoundComplete();
    this.touch();
  }

  /** After the host's grace period, an offline host hands over to anyone online. */
  ensureHost() {
    const host = this.players.get(this.hostId);
    if (host?.connected || this.hostTimer) return;
    this.transferHost();
  }

  transferHost() {
    const next = this.connectedPlayers.find((p) => p.id !== this.hostId)
      ?? (this.players.has(this.hostId) ? null : [...this.players.values()][0]);
    if (next && next.id !== this.hostId) {
      this.hostId = next.id;
      this.touch();
    }
  }

  updateSettings(byId, input) {
    if (byId !== this.hostId || this.phase !== 'lobby') return false;
    this.settings = sanitizeSettings(input, this.settings);
    this.touch();
    return true;
  }

  start(byId) {
    if (byId !== this.hostId || (this.phase !== 'lobby' && this.phase !== 'final')) return false;
    for (const p of this.players.values()) p.score = 0;
    this.usedTargets.clear();
    this.comments = new CommentPicker(this.random);
    this.roundNo = 0;
    this.gameNo += 1;
    this.finalComments = null;
    this.startRound();
    return true;
  }

  startRound() {
    this.clock.clearTimeout(this.timer);
    let pool = targetPool(this.countries, this.settings.difficulty).filter((c) => !this.usedTargets.has(c.i));
    if (!pool.length) pool = targetPool(this.countries, this.settings.difficulty);
    const target = pool[Math.floor(this.random() * pool.length)];
    this.usedTargets.add(target.i);
    this.roundNo += 1;
    const now = this.clock.now();
    const limitMs = this.settings.timeLimit * 1000;
    this.round = { target, startedAt: now, deadline: now + limitMs, limitMs, guesses: new Map(), results: null };
    this.phase = 'question';
    this.timer = this.clock.setTimeout(() => this.endRound(), limitMs);
    this.touch();
  }

  guess(byId, countryIndex, key) {
    if (this.phase !== 'question' || !this.players.has(byId) || this.isStale(key)) return false;
    if (this.clock.now() >= this.round.deadline) {
      this.endRound();
      return false;
    }
    if (this.round.guesses.has(byId)) return false;
    const country = this.countries[countryIndex];
    if (!country || !Number.isInteger(countryIndex)) return false;
    this.round.guesses.set(byId, { country, at: this.clock.now() });
    this.checkRoundComplete();
    this.touch();
    return true;
  }

  checkRoundComplete() {
    if (this.phase !== 'question') return;
    const waiting = this.connectedPlayers.filter((p) => !this.round.guesses.has(p.id));
    if (waiting.length === 0) this.endRound();
  }

  endRound() {
    if (this.phase !== 'question') return;
    this.clock.clearTimeout(this.timer);
    const { target, guesses, deadline, limitMs } = this.round;
    const results = [];
    for (const p of this.players.values()) {
      const g = guesses.get(p.id);
      const fraction = g ? (deadline - g.at) / limitMs : 0;
      const score = scoreGuess(target, g?.country ?? null, fraction);
      p.score += score.points;
      const vars = { name: p.name, ziel: target.name, tipp: g?.country.name ?? '–', km: formatKm(score.km) };
      results.push({
        id: p.id,
        guess: g ? g.country.i : null,
        guessName: g ? g.country.name : null,
        ...score,
        comment: this.comments.pick(score.category, vars),
      });
    }
    results.sort((a, b) => b.points - a.points);
    this.round.results = results;
    this.phase = 'reveal';
    this.round.revealUntil = this.clock.now() + REVEAL_MS;
    this.timer = this.clock.setTimeout(() => this.advance(), REVEAL_MS);
    this.touch();
  }

  next(byId, key) {
    if (byId !== this.hostId || this.phase !== 'reveal' || this.isStale(key)) return false;
    this.advance();
    return true;
  }

  advance() {
    if (this.phase !== 'reveal') return;
    if (this.roundNo >= this.settings.rounds) this.finish();
    else this.startRound();
  }

  finish() {
    this.clock.clearTimeout(this.timer);
    this.phase = 'final';
    const ranking = this.standings();
    this.highscoreRanks = this.onFinish(this) ?? {};
    const winner = ranking[0];
    const loser = ranking.length > 1 ? ranking[ranking.length - 1] : null;
    this.finalComments = {
      winner: winner ? this.comments.pick(ranking.length === 1 ? 'solo' : 'winner', { name: winner.name }) : null,
      loser: loser && loser.score < winner.score ? this.comments.pick('loser', { name: loser.name }) : null,
    };
    this.touch();
  }

  backToLobby(byId) {
    if (byId !== this.hostId || this.phase !== 'final') return false;
    this.phase = 'lobby';
    this.round = null;
    this.roundNo = 0;
    for (const p of this.players.values()) p.score = 0;
    this.touch();
    return true;
  }

  standings() {
    return [...this.players.values()].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  }

  touch() {
    this.lastActivity = this.clock.now();
    this.onChange(this);
  }

  dispose() {
    this.clock.clearTimeout(this.timer);
    this.clock.clearTimeout(this.hostTimer);
  }
}

/** Format distance for German UI ("1.234"). */
export function formatKm(km) {
  return km == null ? '–' : km.toLocaleString('de-DE');
}
