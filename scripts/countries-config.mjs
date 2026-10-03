// Auswahl der Zielländer, Schwierigkeitspools und Namenskorrekturen.
// Schlüssel sind ISO-3166-Alpha-2-Codes (Natural Earth: ISO_A2_EH).

// Alle 193 UN-Mitglieder plus Vatikan, Palästina, Kosovo, Taiwan → Modus "schwer"
export const ALL_TARGETS = `
DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG
MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW
AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM
PK PH QA SA SG KR LK SY TJ TH TL TR TM AE UZ VN YE
AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO
PL PT RO RU SM RS SK SI ES SE CH UA GB
AG AR BS BB BZ BO BR CA CL CO CR CU DM DO EC SV GD GT GY HT HN JM MX NI PA PY PE KN LC VC
SR TT US UY VE
AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU
VA PS XK TW
`.trim().split(/\s+/);

// Bekanntere bzw. größere Länder → Modus "mittel"
export const MEDIUM_TARGETS = `
AL AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT LV LT NL MK NO PL PT RO RU RS SK SI
ES SE CH UA GB
AF BD KH CN IN ID IR IQ IL JP JO KZ KP KR MY MN MM NP OM PK PH SA LK SY TH TR AE UZ VN YE
GE TW
DZ AO CM CD CI EG ET GH KE LY MG ML MA MZ NA NE NG RW SN SO ZA SD SS TZ TN UG ZM ZW BW TD
AR BO BR CA CL CO CR CU EC GT JM MX PA PY PE US UY VE DO HT
AU NZ PG FJ
`.trim().split(/\s+/);

export const NAME_OVERRIDES = {
  TW: 'Taiwan',
  CN: 'China',
  CY: 'Zypern',
  MD: 'Moldau',
  FM: 'Mikronesien',
  US: 'USA',
  GB: 'Großbritannien',
  CD: 'Demokratische Republik Kongo',
  CG: 'Republik Kongo',
  BA: 'Bosnien und Herzegowina',
  PS: 'Palästina',
  VA: 'Vatikanstadt',
  TL: 'Osttimor',
  KY: 'Kaimaninseln',
  '-99:Somaliland': 'Somaliland',
};

export const CONTINENT_DE = {
  Africa: 'Afrika',
  Asia: 'Asien',
  Europe: 'Europa',
  'North America': 'Nordamerika',
  'South America': 'Südamerika',
  Oceania: 'Ozeanien',
  'Seven seas (open ocean)': 'Ozean',
};

// Inselstaaten, die Natural Earth als "Seven seas" führt
export const CONTINENT_OVERRIDES = {
  MV: 'Asia',
  MU: 'Africa',
  SC: 'Africa',
};
