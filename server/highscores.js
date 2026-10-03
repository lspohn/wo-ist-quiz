import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const MAX_ENTRIES = 10;

/** One board per difficulty and round count – only those scores are comparable. */
export function boardKey(settings) {
  return `${settings.mode ?? 'welt'}-${settings.difficulty}-${settings.rounds}`;
}

// Alte Schlüssel ohne Modus („mittel-10“) gehören zur Variante Welt
function migrate(boards) {
  return Object.fromEntries(Object.entries(boards).map(([k, v]) => [k.split('-').length === 2 ? `welt-${k}` : k, v]));
}

/** Top-10 lists persisted as one JSON file. */
export class Highscores {
  constructor(file, now = () => Date.now()) {
    this.file = file;
    this.now = now;
    this.boards = {};
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) this.boards = migrate(data);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Highscores nicht lesbar, starte leer:', err.message);
    }
  }

  board(key) {
    return this.boards[key] ?? [];
  }

  all() {
    return this.boards;
  }

  /** Add finished-game scores; returns { playerId: rank } for players that made the board. */
  record(settings, players) {
    const key = boardKey(settings);
    const at = this.now();
    const fresh = players
      .filter((p) => p.score > 0)
      .map((p) => ({ name: p.name, score: p.score, at, players: players.length, pid: p.id }));
    if (!fresh.length) return {};
    const merged = [...this.board(key), ...fresh]
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, MAX_ENTRIES);
    const ranks = {};
    merged.forEach((e, idx) => {
      if (fresh.includes(e)) ranks[e.pid] = idx + 1;
    });
    this.boards[key] = merged.map(({ pid, ...rest }) => rest);
    this.save();
    return ranks;
  }

  save() {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.boards));
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('Highscores konnten nicht gespeichert werden:', err.message);
    }
  }
}
