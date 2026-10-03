// Konfiguration für die Varianten Europa und Deutschland.

// Länder im Europa-Modus (ISO-3166-Alpha-2); Zypern und Türkei zählen mit
export const EUROPE_ISO = `
AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK
NO PL PT RO RU SM RS SK SI ES SE CH TR UA GB VA
`.trim().split(/\s+/);

// Wo Wikidata mehrere Hauptstädte kennt, gilt diese
export const CAPITAL_OVERRIDES = {
  NL: 'Amsterdam',
  CH: 'Bern',
  CY: 'Nikosia',
  XK: 'Pristina',
  VA: 'Vatikanstadt',
  MC: 'Monaco',
  SM: 'San Marino',
};

// Hauptstädte der Bundesländer
export const STATE_CAPITALS = {
  'Baden-Württemberg': 'Stuttgart',
  Bayern: 'München',
  Berlin: 'Berlin',
  Brandenburg: 'Potsdam',
  Bremen: 'Bremen',
  Hamburg: 'Hamburg',
  Hessen: 'Wiesbaden',
  'Mecklenburg-Vorpommern': 'Schwerin',
  Niedersachsen: 'Hannover',
  'Nordrhein-Westfalen': 'Düsseldorf',
  'Rheinland-Pfalz': 'Mainz',
  Saarland: 'Saarbrücken',
  Sachsen: 'Dresden',
  'Sachsen-Anhalt': 'Magdeburg',
  'Schleswig-Holstein': 'Kiel',
  Thüringen: 'Erfurt',
};

// Wikidata-Objekte ohne deutsches Label
export const LABEL_FALLBACK = {
  Q585: 'Oslo',
};

// Bekannte europäische Großstädte (ohne Hauptstädte) für Europa-Städte „schwer“
export const EUROPE_BIG_CITIES = {
  DE: ['Hamburg', 'München', 'Köln', 'Frankfurt am Main', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden', 'Hannover', 'Nürnberg'],
  FR: ['Marseille', 'Lyon', 'Toulouse', 'Nizza', 'Nantes', 'Straßburg', 'Bordeaux', 'Lille'],
  IT: ['Mailand', 'Neapel', 'Turin', 'Palermo', 'Genua', 'Bologna', 'Florenz', 'Venedig'],
  ES: ['Barcelona', 'Valencia', 'Sevilla', 'Saragossa', 'Málaga', 'Bilbao'],
  GB: ['Birmingham', 'Manchester', 'Glasgow', 'Liverpool', 'Leeds', 'Edinburgh', 'Bristol', 'Belfast'],
  PL: ['Krakau', 'Breslau', 'Łódź', 'Posen', 'Danzig'],
  NL: ['Rotterdam', 'Den Haag', 'Utrecht'],
  BE: ['Antwerpen', 'Gent'],
  UA: ['Charkiw', 'Odessa', 'Dnipro', 'Lwiw'],
  RU: ['Sankt Petersburg', 'Nischni Nowgorod', 'Kasan', 'Wolgograd', 'Rostow am Don', 'Kaliningrad'],
  TR: ['Istanbul', 'Izmir'],
  PT: ['Porto'],
  SE: ['Göteborg', 'Malmö'],
  CH: ['Zürich', 'Genf', 'Basel'],
  AT: ['Graz', 'Salzburg'],
  GR: ['Thessaloniki'],
  CZ: ['Brünn'],
  NO: ['Bergen'],
  DK: ['Aarhus'],
  RO: ['Cluj-Napoca'],
  BG: ['Plowdiw'],
  RS: ['Novi Sad'],
  IE: ['Cork'],
  FI: ['Tampere'],
  HR: ['Split'],
};
