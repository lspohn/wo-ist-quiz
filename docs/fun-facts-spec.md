# Spezifikation: Fun Facts bei der Auflösung

Status: **Entwurf – offene Fragen am Ende, noch nicht umgesetzt.**

## Ziel

Bei jeder Auflösung erscheint unter dem gesuchten Ort **ein Satz** mit einer überraschenden, nachprüfbaren
Tatsache („Wusstest du …?“). Er soll in 5 Sekunden lesbar sein, Erwachsene und Schüler ansprechen und darf
nie falsch sein. Lieber kein Fakt als ein erfundener.

## Umfang

| Menge | Anzahl | Beispiel-Satz (nur zur Illustration, ungeprüft) |
|---|---|---|
| Länder (Welt + Europa) | 197 | „In Bhutan wird das Bruttonationalglück offiziell gemessen.“ |
| Hauptstädte Europas | 47 | – |
| Europäische Großstädte | 83 | – |
| Bundesländer | 16 | – |
| Deutsche Städte ≥ 20.000 Einw. | 704 | – |
| **Summe** | **≈ 1.050 Orte** | |

Pro Ort werden 2–3 Kandidaten erzeugt, damit bei Wiederholungen Abwechslung bleibt und Ausfälle in der
Prüfung verkraftbar sind (≈ 2.500 geprüfte Sätze).

## Pipeline (Build-Zeit, nicht live)

```
Ortsliste ──► 1. Quelltext holen ──► 2. Kandidaten schreiben ──► 3. Fakt extrahieren & prüfen ──► 4. Review ──► facts.json
              (Wikipedia-API)        (Frontier-Modell)           (Extraktor-Modell)              (Mensch, Stichprobe)
```

1. **Quelltext holen** – `scripts/facts/fetch-sources.mjs`
   - Deutsche Wikipedia, REST-API `/page/summary/{titel}` plus ggf. die Abschnitte „Geschichte“/„Sonstiges“
     über `/page/mobile-sections` (Titel über die Wikidata-ID → Sitelink `dewiki`, also eindeutig).
   - Speichert Text, Revisions-ID und Abrufdatum in `.cache/facts/sources/{id}.json` (für Quellenangabe und
     Reproduzierbarkeit).
2. **Kandidaten schreiben** – Frontier-Modell über `codex2` (Vorschlag des Nutzers).
   - Prompt: „Schreibe 3 überraschende Fakten, je genau 1 Satz, max. 160 Zeichen, **ausschließlich** aus dem
     folgenden Text. Gib zu jedem Satz das wörtliche Zitat aus dem Text an, das ihn belegt.“
   - Verbote: keine Superlative ohne Beleg, keine Politik-/Konfliktbewertungen, keine Zahlen, die nicht
     wörtlich im Text stehen, nichts über lebende Privatpersonen.
   - Ausgabe als JSON gegen ein festes Schema.
3. **Extrahieren & prüfen** – kleines, schnelles Modell (Vorschlag: `gpt-6-luna` über `codex2`).
   - Prüft je Satz: (a) steht das Zitat wörtlich im Quelltext (das geht auch ohne Modell, per Stringvergleich),
     (b) folgt der Satz aus dem Zitat (Modell-Urteil: `belegt` / `teilweise` / `nicht belegt`),
     (c) stimmen Zahlen und Namen exakt.
   - Nur `belegt` + Zitat gefunden + Zahlen identisch wird übernommen.
4. **Review** – Stichprobe von ~10 % plus alle Sätze zu sensiblen Orten (z. B. Palästina, Kosovo, Taiwan,
   Krim, Israel) per Review-Seite (HTML-Tabelle mit Haken/Verwerfen).
5. **Ergebnis** – `server/data/facts.json`: `{ "<Ort-ID>": [{ "text", "source": { "title", "revid" } }] }`.
   Eingecheckt; der Server liefert pro Auflösung einen Fakt (ohne Wiederholung pro Lobby, wie bei den Sprüchen).

## Anzeige

- Unter dem Kommentar in der Auflösung, klein mit „Wusstest du?“-Etikett, bei allen Spielern gleich.
- Quellenangabe: Fußzeile „Fakten nach Wikipedia (CC BY-SA 4.0)“ auf einer Quellen-Seite; der einzelne Satz
  ist eine eigene Formulierung, die Quelle wird pro Ort in `facts.json` mitgeführt.

## Kosten & Aufwand (Schätzung)

- Quelltexte: ≈ 1.050 Anfragen, kostenlos (Wikipedia-API mit eigenem User-Agent, gedrosselt).
- Generierung: ≈ 1.050 Aufrufe à ~3.000 Token Eingabe → überschaubar, abhängig vom Tarif in `codex2`.
- Prüfung: ≈ 2.500–3.000 kurze Aufrufe mit dem kleinen Modell.
- Laufzeit: eher Stunden als Minuten, daher fortsetzbar (Zwischenstand je Ort im Cache).

## Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Halluzinierte Fakten | Nur aus Quelltext, wörtliches Zitat + Stringprüfung + Modellprüfung |
| Veraltete Zahlen (Einwohner, Rekorde) | Keine Zahlen ohne Jahresangabe; Revisions-ID speichern, Neulauf möglich |
| Politisch heikle Aussagen | Verbotsliste im Prompt, sensible Orte immer manuell prüfen |
| Langweilige Fakten („X ist eine Stadt in Y“) | Prompt fordert Überraschung; Prüfmodell bewertet zusätzlich „interessant ja/nein“ |
| Kleine Städte mit dünnem Artikel | Kein Fakt statt schwachem Fakt; Feld bleibt leer |
| `codex2` hatte zuletzt keine Credits | Vor Start prüfen, sonst `codex3` |

## Offene Fragen

1. **Sprache und Zielgruppe:** Ein Ton für alle (Erwachsene + Schüler) oder zwei Fassungen (z. B. „Schule“ ohne
   ironischen Unterton)?
2. **Umfang der Städte:** Fakten für alle 704 deutschen Städte, oder nur für Großstädte (≥ 50.000, 194 Orte),
   um Kosten und Prüfaufwand zu halbieren?
3. **Quellen:** Nur deutsche Wikipedia, oder bei dünnen Artikeln zusätzlich die englische (dann übersetzt)?
4. **Fakten auch zur Frage oder nur zur Auflösung?** (Bei der Frage könnten sie Hinweise geben – Vorschlag: nur Auflösung.)
5. **Hauptstadtfragen:** Fakt zur Hauptstadt, zum Land oder abwechselnd?
6. **Review-Tiefe:** Reicht eine 10-%-Stichprobe plus sensible Orte, oder sollen alle Sätze einmal angesehen werden?
7. **Modelle:** Bleibt es bei `codex2` (Generierung) und `gpt-6-luna` (Prüfung), oder soll die Prüfung bewusst
   einen anderen Anbieter nutzen (unabhängiger Fehler)?
8. **Lizenzhinweis im Spiel:** Reicht eine Quellen-Seite, oder soll pro Fakt ein kleiner Link „Wikipedia“ erscheinen?
