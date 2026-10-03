import { borderDistanceKm } from './geo.js';

export const POINTS = {
  exact: 1000,
  speedBonus: 100,
  neighbor: 500,
  nearMax: 450,
  continentFloor: 100,
  decayKm: 1500,
};

/**
 * Score one guess. `timeFraction` is the share of the round time still left (0..1).
 * Returns points, distance and a comment category.
 */
export function scoreGuess(target, guess, timeFraction = 0) {
  if (!guess) return { points: 0, km: null, category: 'none' };
  if (guess === target) {
    const bonus = Math.round(POINTS.speedBonus * Math.max(0, Math.min(1, timeFraction)));
    return { points: POINTS.exact + bonus, km: 0, category: 'exact', bonus };
  }
  if (target.neighborSet.has(guess.i)) {
    return { points: POINTS.neighbor, km: 0, category: 'neighbor' };
  }
  const km = Math.round(borderDistanceKm(target, guess));
  const sameContinent = target.continent === guess.continent;
  let points = Math.round(POINTS.nearMax * Math.exp(-km / POINTS.decayKm));
  if (sameContinent) points = Math.max(points, POINTS.continentFloor);
  return { points, km, category: categorize(km, sameContinent) };
}

function categorize(km, sameContinent) {
  if (km < 800) return 'close';
  if (sameContinent) return 'continent';
  if (km < 6000) return 'far';
  return 'veryfar';
}
