// Serialisiert den Lobby-Zustand pro Spieler. Während der Frage werden
// fremde Tipps nie verschickt, nur ob jemand schon geantwortet hat.
import { flagOf, noteOf, questionFlag } from './modes.js';

/** Short entry for the public lobby list. */
export function lobbySummary(lobby) {
  const host = lobby.players.get(lobby.hostId);
  return {
    id: lobby.id,
    host: host?.name ?? '?',
    players: lobby.players.size,
    names: [...lobby.players.values()].map((p) => p.name),
    phase: lobby.phase,
    roundNo: lobby.roundNo,
    settings: lobby.settings,
  };
}

/** Full state for one player. */
export function lobbyView(lobby, playerId) {
  const now = lobby.clock.now();
  const round = lobby.round;
  const players = lobby.standings().map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    score: p.score,
    total: p.total,
    connected: p.connected,
    answered: lobby.phase === 'question' ? round.guesses.has(p.id) : false,
  }));
  const view = {
    id: lobby.id,
    you: playerId,
    hostId: lobby.hostId,
    phase: lobby.phase,
    settings: lobby.settings,
    players,
    roundNo: lobby.roundNo,
    roundKey: lobby.roundKey,
    gamesPlayed: lobby.gamesPlayed,
  };
  if (lobby.phase === 'question') {
    const mine = round.guesses.get(playerId);
    const mode = lobby.settings.mode;
    view.question = {
      prompt: round.question.prompt,
      target: round.question.subject,
      flag: questionFlag(mode, round.question, round.target),
      note: round.question.prompt === 'where' ? noteOf(round.target) : null,
      remainingMs: Math.max(0, round.deadline - now),
      limitMs: round.limitMs,
      myGuess: mine ? mine.country.i : null,
    };
  }
  if (lobby.phase === 'reveal' && round?.results) {
    view.reveal = {
      target: {
        i: round.target.i, name: round.target.name, sub: round.subline,
        flag: flagOf(lobby.settings.mode, round.target), note: noteOf(round.target),
      },
      results: round.results,
      autoNextMs: Math.max(0, round.revealUntil - now),
      last: lobby.roundNo >= lobby.settings.rounds,
    };
  }
  if (lobby.phase === 'final') {
    view.final = {
      headline: lobby.finalComments?.headline ?? null,
      mine: lobby.finalComments?.personal[playerId] ?? null,
      highscoreRank: lobby.highscoreRanks[playerId] ?? null,
    };
  }
  return view;
}
