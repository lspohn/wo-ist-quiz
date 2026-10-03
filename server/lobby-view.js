// Serialisiert den Lobby-Zustand pro Spieler. Während der Frage werden
// fremde Tipps nie verschickt, nur ob jemand schon geantwortet hat.

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
  };
  if (lobby.phase === 'question') {
    const mine = round.guesses.get(playerId);
    view.question = {
      target: round.target.name,
      remainingMs: Math.max(0, round.deadline - now),
      limitMs: round.limitMs,
      myGuess: mine ? mine.country.i : null,
    };
  }
  if (lobby.phase === 'reveal' && round?.results) {
    view.reveal = {
      target: { i: round.target.i, name: round.target.name, continent: round.target.continent },
      results: round.results,
      autoNextMs: Math.max(0, round.revealUntil - now),
      last: lobby.roundNo >= lobby.settings.rounds,
    };
  }
  if (lobby.phase === 'final') {
    view.final = { ...lobby.finalComments, highscoreRank: lobby.highscoreRanks[playerId] ?? null };
  }
  return view;
}
