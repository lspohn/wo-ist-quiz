// Fragen, Antwortmengen und Wertung je Spielvariante.
import { readFileSync } from 'node:fs';
import { MODES } from '../public/js/modes.js';
import { borderDistanceKm, loadCountries, prepare, pointDistanceKm } from './geo.js';
import { scoreGuess, POINTS } from './scoring.js';

const readData = (name) => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'));

/** Load every dataset once at startup. */
export function loadGameData() {
  const world = loadCountries();
  const deStates = prepare(readData('de-states.json'));
  const deCities = readData('de-cities.json').map((c) => ({ ...c, rad: toRad(c) }));
  const euCities = readData('eu-cities.json').map((c) => ({ ...c, rad: toRad(c) }));
  return { world, deStates, deCities, euCities };
}

function toRad(c) {
  const r = Math.PI / 180;
  return [c.lon * r, c.lat * r, Math.cos(c.lat * r)];
}

/** Items a guess index refers to in this mode. */
export function answerSpace(data, mode) {
  switch (mode) {
    case 'deutschland': return data.deStates;
    case 'de-staedte': return data.deCities;
    case 'europa-staedte': return data.euCities;
    default: return data.world;
  }
}

/** All questions for mode + difficulty: { key, answer, subject, prompt }. */
export function questionPool(data, mode, level) {
  const where = (c) => ({ key: `w${c.i}`, answer: c.i, subject: c.name, prompt: 'where' });
  switch (mode) {
    case 'europa': {
      const countries = data.world.filter((c) => c.europe);
      if (level === 'mittel') return countries.map(where);
      const capitalOf = new Map(data.euCities.filter((c) => c.capital).map((c) => [c.iso, c.name]));
      const capitalQs = countries.filter((c) => capitalOf.has(c.iso) && capitalOf.get(c.iso) !== c.name)
        .map((c) => ({ key: `c${c.i}`, answer: c.i, subject: capitalOf.get(c.iso), prompt: 'capital-country' }));
      return [...countries.map(where), ...capitalQs];
    }
    case 'deutschland': {
      if (level === 'mittel') return data.deStates.map(where);
      // Stadtstaaten taugen nicht als Hauptstadtfrage („Von welchem Land ist Berlin die Hauptstadt?“)
      const capitalQs = data.deStates.filter((s) => s.capital !== s.name)
        .map((s) => ({ key: `c${s.i}`, answer: s.i, subject: s.capital, prompt: 'capital-state' }));
      return [...data.deStates.map(where), ...capitalQs];
    }
    case 'de-staedte':
    case 'europa-staedte': {
      const maxTier = MODES[mode].levels[level].maxTier;
      const items = mode === 'de-staedte' ? data.deCities : data.euCities;
      return items.filter((c) => tierOf(mode, c) <= maxTier).map(where);
    }
    default:
      return data.world.filter((c) => (level === 'mittel' ? c.medium : c.target)).map(where);
  }
}

/** Tier used for city filtering (1 = most prominent). */
export function tierOf(mode, city) {
  if (mode === 'europa-staedte') return city.capital ? 1 : 2;
  return city.tier;
}

/** Extra line shown under the solved target. */
export function targetSubline(data, mode, question) {
  const items = answerSpace(data, mode);
  const t = items[question.answer];
  if (question.prompt === 'capital-country' || question.prompt === 'capital-state') return `Hauptstadt: ${question.subject}`;
  if (mode === 'de-staedte') return `${t.state} · ${t.pop.toLocaleString('de-DE')} Einw.`;
  if (mode === 'europa-staedte') return `${t.country}${t.capital ? ' · Hauptstadt' : ''}`;
  if (mode === 'deutschland') return t.capital === t.name ? 'Stadtstaat' : `Hauptstadt: ${t.capital}`;
  return t.continent;
}

const STATE_FLAGS = {
  'Baden-Württemberg': 'de-bw', Bayern: 'de-by', Berlin: 'de-be', Brandenburg: 'de-bb', Bremen: 'de-hb',
  Hamburg: 'de-hh', Hessen: 'de-he', 'Mecklenburg-Vorpommern': 'de-mv', Niedersachsen: 'de-ni',
  'Nordrhein-Westfalen': 'de-nw', 'Rheinland-Pfalz': 'de-rp', Saarland: 'de-sl', Sachsen: 'de-sn',
  'Sachsen-Anhalt': 'de-st', 'Schleswig-Holstein': 'de-sh', Thüringen: 'de-th',
};
// Staaten, die nicht von allen UN-Mitgliedern anerkannt sind
const LIMITED_RECOGNITION = new Set(['PS', 'XK', 'TW']);
export const RECOGNITION_NOTE = 'Nicht von allen Staaten anerkannt';

/** Flag code for an answer item (country ISO, state 'de-xx', or the city's state/country). */
export function flagOf(mode, item) {
  if (!item) return null;
  if (mode === 'deutschland') return STATE_FLAGS[item.name] ?? null;
  if (mode === 'de-staedte') return STATE_FLAGS[item.state] ?? null;
  return item.iso && item.iso !== '-99' ? item.iso.toLowerCase() : null;
}

/** Recognition hint for disputed states (also for their capitals). */
export function noteOf(item) {
  return item && LIMITED_RECOGNITION.has(item.iso) ? RECOGNITION_NOTE : null;
}

/** Flag shown with the question – only where it gives nothing away. */
export function questionFlag(mode, question, item) {
  if (question.prompt !== 'where' || MODES[mode].kind !== 'area') return null;
  return flagOf(mode, item);
}

/** Score a guess according to the mode. */
export function scoreForMode(mode, target, guess, timeFraction) {
  const cfg = MODES[mode];
  if (cfg.kind === 'point') return scorePoint(target, guess, timeFraction, cfg.scaleKm);
  if (mode === 'deutschland') return scoreState(target, guess, timeFraction);
  const result = scoreGuess(target, guess, timeFraction);
  if (mode === 'europa' && ['continent', 'far', 'veryfar'].includes(result.category)) return { ...result, category: 'eu_far' };
  return result;
}

// Bundesländer: Nachbar 500, sonst schneller Abfall – Deutschland ist klein
function scoreState(target, guess, timeFraction) {
  const r = scoreGuess(target, guess, timeFraction);
  if (r.category === 'exact' || r.category === 'none') return r;
  if (r.category === 'neighbor') return { ...r, category: 'de_neighbor' };
  const km = Math.round(borderDistanceKm(target, guess));
  return { points: Math.round(400 * Math.exp(-km / 120)), km, category: 'de_far' };
}

function scorePoint(target, guess, timeFraction, scaleKm) {
  if (!guess) return { points: 0, km: null, category: 'none' };
  if (guess === target) {
    const bonus = Math.round(POINTS.speedBonus * Math.max(0, Math.min(1, timeFraction)));
    return { points: POINTS.exact + bonus, km: 0, category: 'exact', bonus };
  }
  const km = Math.max(1, Math.round(pointDistanceKm(target, guess)));
  const points = Math.round(800 * Math.exp(-km / scaleKm));
  const category = km < scaleKm * 0.6 ? 'p_close' : km < scaleKm * 2 ? 'p_near' : km < scaleKm * 6 ? 'p_far' : 'p_veryfar';
  return { points, km, category };
}
