// Spielvarianten – gemeinsam genutzt von Server (Regeln) und Client (Beschriftung).
// kind 'area': Fläche antippen (Länder/Bundesländer). kind 'point': Stadtpunkt antippen.

export const MODES = {
  welt: {
    label: 'Welt',
    blurb: 'Länder der Welt',
    map: 'world',
    kind: 'area',
    levels: {
      mittel: { label: 'Mittel', sub: '≈ 120 bekannte Länder', hint: 'Rund 120 bekanntere Länder.' },
      schwer: { label: 'Schwer', sub: 'alle 197 Länder', hint: 'Alle 197 Länder – inklusive Tuvalu, Nauru und Konsorten.' },
    },
  },
  europa: {
    label: 'Europa',
    blurb: 'Länder & Hauptstädte',
    map: 'europe',
    kind: 'area',
    levels: {
      mittel: { label: 'Länder', sub: '47 Länder', hint: 'Alle 47 Länder Europas.' },
      schwer: { label: 'Länder + Hauptstädte', sub: 'auch Hauptstadtfragen', hint: 'Länder plus: „Von welchem Land ist Bratislava die Hauptstadt?“' },
    },
  },
  'europa-staedte': {
    label: 'Europa · Städte',
    blurb: 'Stadt auf der Karte finden',
    map: 'europe',
    kind: 'point',
    scaleKm: 300,
    levels: {
      mittel: { label: 'Hauptstädte', sub: '47 Städte', hint: 'Die Hauptstädte Europas.', maxTier: 1 },
      schwer: { label: '+ Großstädte', sub: '130 Städte', hint: 'Hauptstädte plus rund 80 Großstädte.', maxTier: 2 },
    },
  },
  deutschland: {
    label: 'Deutschland',
    blurb: 'Bundesländer & Hauptstädte',
    map: 'germany',
    kind: 'area',
    levels: {
      mittel: { label: 'Bundesländer', sub: '16 Länder', hint: 'Die 16 Bundesländer.' },
      schwer: { label: 'Länder + Hauptstädte', sub: 'auch Hauptstadtfragen', hint: 'Länder plus: „Von welchem Bundesland ist Stuttgart die Hauptstadt?“' },
    },
  },
  usa: {
    label: 'USA',
    blurb: 'Bundesstaaten & Hauptstädte',
    map: 'usa',
    kind: 'area',
    levels: {
      mittel: { label: 'Staaten', sub: '50 Staaten', hint: 'Die 50 Bundesstaaten.' },
      schwer: { label: 'Staaten + Hauptstädte', sub: 'auch Hauptstadtfragen', hint: 'Staaten plus: „Von welchem Bundesstaat ist Sacramento die Hauptstadt?“' },
    },
  },
  'de-staedte': {
    label: 'Deutschland · Städte',
    blurb: 'Stadt auf der Karte finden',
    map: 'germany',
    kind: 'point',
    scaleKm: 45,
    levels: {
      mittel: { label: 'Mittel', sub: 'ab 300.000 Einw.', hint: 'Die 23 größten Städte ab 300.000 Einwohnern.', maxTier: 1 },
      schwer: { label: 'Schwer', sub: 'ab 100.000 Einw.', hint: 'Alle 79 Großstädte ab 100.000 Einwohnern.', maxTier: 2 },
      sehrschwer: { label: 'Extrem', sub: 'ab 50.000 Einw.', hint: '194 Städte ab 50.000 Einwohnern. Viel Glück.', maxTier: 3 },
    },
  },
};

export const MODE_IDS = Object.keys(MODES);

/** Valid difficulty for a mode (falls back to the first level). */
export function levelOf(mode, difficulty) {
  const levels = MODES[mode]?.levels ?? MODES.welt.levels;
  return typeof difficulty === 'string' && Object.hasOwn(levels, difficulty) ? difficulty : Object.keys(levels)[0];
}

/** Map configuration for the client map. */
export function mapConfig(settings = {}) {
  const mode = MODES[settings.mode] ? settings.mode : 'welt';
  const m = MODES[mode];
  return { map: m.map, kind: m.kind, maxTier: m.levels[levelOf(mode, settings.difficulty)].maxTier };
}

/** Quellenvermerk je Karte (Datenlizenz Deutschland verlangt ihn sichtbar bei der Karte). */
export const MAP_CREDITS = {
  world: 'Karte: Natural Earth',
  europe: 'Karte: Natural Earth',
  usa: 'Karte: Natural Earth',
  germany: 'Karte: © GeoBasis-DE / BKG (2026), Natural Earth',
};

export const PROMPTS = {
  where: 'Wo liegt',
  'capital-country': 'Hauptstadt von welchem Land?',
  'capital-state': 'Hauptstadt von welchem Bundesland?',
  'capital-usstate': 'Hauptstadt von welchem Bundesstaat?',
};
