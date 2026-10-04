import { CommentPicker } from './comments.js';
import { Deck } from './deck.js';
import { answerSpace, flagOf, questionPool, scoreForMode, targetSubline } from './modes.js';
import { MODE_IDS, levelOf } from '../public/js/modes.js';

export const SETTINGS_OPTIONS = {
  mode: MODE_IDS,
  timeLimit: [15, 30, 45],
  rounds: [5, 10, 15],
};
export const DEFAULT_SETTINGS = { mode: 'welt', difficulty: 'mittel', timeLimit: 30, rounds: 10, rivers: true, relief: true };
export const MAX_PLAYERS = 12;
export const REVEAL_MS = 20_000;
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
  // Kartenebenen (Flüsse, Relief) sind einfache Schalter
  for (const key of ['rivers', 'relief']) if (typeof input[key] === 'boolean') out[key] = input[key];
  // Schwierigkeit hängt vom Modus ab; ungültige fallen auf die erste Stufe zurück
  out.difficulty = levelOf(out.mode, input.difficulty ?? out.difficulty);
  return out;
}

/** One game room: lobby → question ↔ reveal → final. */
export class Lobby {
  constructor({
    id, hostId, settings, data, clock = defaultClock, random = Math.random, onChange = () => {}, onFinish = () => ({}),
  }) {
    this.id = id;
    this.hostId = hostId;
    this.settings = sanitizeSettings(settings);
    this.data = data;
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
    this.gamesPlayed = 0;
    this.deck = new Deck((key) => questionPool(data, ...key.split(':')), random);
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

  hasQuestions() {
    const { mode, difficulty } = this.settings;
    if (levelOf(mode, difficulty) !== difficulty) return false;
    try {
      return questionPool(this.data, mode, difficulty).length > 0;
    } catch {
      return false;
    }
  }

  /** Items that guesses index into for the current mode. */
  get answers() {
    return answerSpace(this.data, this.settings.mode);
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
    this.players.set(id, { id, name, color, score: 0, total: 0, connected: true, joinedAt: this.clock.now() });
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
    if (!this.hasQuestions()) return false;
    for (const p of this.players.values()) p.score = 0;
    this.roundNo = 0;
    this.gameNo += 1;
    this.finalComments = null;
    this.startRound();
    return true;
  }

  startRound() {
    this.clock.clearTimeout(this.timer);
    const question = this.deck.draw(`${this.settings.mode}:${this.settings.difficulty}`);
    const target = this.answers[question.answer];
    this.roundNo += 1;
    const now = this.clock.now();
    const limitMs = this.settings.timeLimit * 1000;
    this.round = { question, target, startedAt: now, deadline: now + limitMs, limitMs, guesses: new Map(), results: null };
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
    if (!Number.isInteger(countryIndex)) return false;
    const raw = this.answers[countryIndex];
    const country = raw?.alias !== undefined ? this.answers[raw.alias] : raw;
    if (!country) return false;
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
      const score = scoreForMode(this.settings.mode, target, g?.country ?? null, fraction);
      p.score += score.points;
      const vars = { name: p.name, ziel: target.name, tipp: g?.country.name ?? '–', km: formatKm(score.km) };
      results.push({
        id: p.id,
        guess: g ? g.country.i : null,
        guessName: g ? g.country.name : null,
        guessFlag: g ? flagOf(this.settings.mode, g.country) : null,
        ...score,
        comment: this.comments.pick(score.category, vars),
      });
    }
    results.sort((a, b) => b.points - a.points);
    this.round.results = results;
    this.round.subline = targetSubline(this.data, this.settings.mode, this.round.question);
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
    for (const p of ranking) p.total += p.score;
    this.gamesPlayed += 1;
    this.highscoreRanks = this.onFinish(this) ?? {};
    this.finalComments = this.pickFinalComments(ranking);
    this.touch();
  }

  /** Headline for the winner, a personal verdict for everyone else. */
  pickFinalComments(ranking) {
    const [winner] = ranking;
    if (!winner) return { headline: null, personal: {} };
    const headline = this.comments.pick(ranking.length === 1 ? 'solo' : 'winner', { name: winner.name });
    const personal = {};
    ranking.slice(1).forEach((p, idx) => {
      const isLast = idx === ranking.length - 2 && p.score < winner.score;
      personal[p.id] = this.comments.pick(isLast ? 'loser' : 'middle', { name: p.name });
    });
    return { headline, personal };
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
