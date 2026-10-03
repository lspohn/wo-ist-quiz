// Spielvarianten – gemeinsam genutzt von Server (Regeln) und Client (Beschriftung).
// kind 'area': Fläche antippen (Länder/Bundesländer). kind 'point': Stadtpunkt antippen.

export const MODES = {
  welt: {
    label: 'Welt',
    blurb: 'Länder der Welt',
    map: 'world',
    kind: 'area',
    levels: {
      mittel: { label: 'Mittel', hint: 'Rund 120 bekanntere Länder.' },
      schwer: { label: 'Schwer', hint: 'Alle 197 Länder – inklusive Tuvalu, Nauru und Konsorten.' },
    },
  },
  europa: {
    label: 'Europa',
    blurb: 'Länder & Hauptstädte',
    map: 'world',
    view: 'europe',
    kind: 'area',
    levels: {
      mittel: { label: 'Mittel', hint: 'Alle 47 Länder Europas.' },
      schwer: { label: 'Schwer', hint: 'Länder plus: „Von welchem Land ist Bratislava die Hauptstadt?“' },
    },
  },
  'europa-staedte': {
    label: 'Europa · Städte',
    blurb: 'Stadt auf der Karte finden',
    map: 'world',
    view: 'europe',
    kind: 'point',
    points: 'europe',
    scaleKm: 300,
    levels: {
      mittel: { label: 'Mittel', hint: 'Die Hauptstädte Europas.', maxTier: 1 },
      schwer: { label: 'Schwer', hint: 'Hauptstädte plus rund 80 Großstädte.', maxTier: 2 },
    },
  },
  deutschland: {
    label: 'Deutschland',
    blurb: 'Bundesländer & Hauptstädte',
    map: 'germany',
    kind: 'area',
    levels: {
      mittel: { label: 'Mittel', hint: 'Die 16 Bundesländer.' },
      schwer: { label: 'Schwer', hint: 'Länder plus: „Von welchem Bundesland ist Stuttgart die Hauptstadt?“' },
    },
  },
  'de-staedte': {
    label: 'Deutschland · Städte',
    blurb: 'Stadt auf der Karte finden',
    map: 'germany',
    kind: 'point',
    points: 'germany',
    scaleKm: 45,
    levels: {
      mittel: { label: 'Mittel', hint: 'Großstädte ab 100.000 Einwohnern (79).', maxTier: 1 },
      schwer: { label: 'Schwer', hint: 'Städte ab 50.000 Einwohnern (194).', maxTier: 2 },
      sehrschwer: { label: 'Sehr schwer', hint: 'Städte ab 20.000 Einwohnern (704). Viel Glück.', maxTier: 3 },
    },
  },
};

export const MODE_IDS = Object.keys(MODES);

/** Valid difficulty for a mode (falls back to the first level). */
export function levelOf(mode, difficulty) {
  const levels = MODES[mode]?.levels ?? MODES.welt.levels;
  return difficulty in levels ? difficulty : Object.keys(levels)[0];
}

/** Map configuration for the client map. */
export function mapConfig(settings = {}) {
  const mode = MODES[settings.mode] ? settings.mode : 'welt';
  const m = MODES[mode];
  return { map: m.map, view: m.view, kind: m.kind, points: m.points, maxTier: m.levels[levelOf(mode, settings.difficulty)].maxTier };
}

export const PROMPTS = {
  where: 'Wo liegt',
  'capital-country': 'Hauptstadt von welchem Land?',
  'capital-state': 'Hauptstadt von welchem Bundesland?',
};
