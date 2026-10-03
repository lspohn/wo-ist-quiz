# Konzept: Öffentliche Version für Schulen

Status: **Konzept – nichts davon ist umgesetzt.** Die Raspi-Version bleibt unverändert nutzbar.

## Ziele

- Kostenlos oder nahezu kostenlos verteilbar, ohne Konten, ohne App-Store.
- Gruppen von 1–5 Personen (bis Klassenstärke) spielen **mit den Leuten im selben Raum** – nicht mit Fremden.
- Funktioniert auf Schul-Tablets, Chromebooks und privaten Handys, auch in restriktiven Schul-WLANs.
- Datenschutz (DSGVO) so, dass eine Schule es ohne Vertragsprüfung einsetzen kann.

## Das eigentliche Problem: „Wer sitzt neben mir?“

Eine Lobby-**Liste** funktioniert nur im Heimnetz. Bundesweit sähe man Lobbys aus anderen Städten.
**Lösung: Beitrittscode statt Liste** (wie bei Kahoot):

1. Host eröffnet ein Spiel → großer Code (z. B. `K7Q-42`) plus QR-Code mit Link `…/?spiel=K7Q42`.
2. Mitspieler scannen den QR-Code oder tippen den Code ein.
3. Ohne Code findet niemand das Spiel. Codes laufen nach Spielende ab.

Damit ist die Ortsfrage gelöst – unabhängig davon, wo der Server steht.

## Optionen für den Transport

### A – Rein statisch, Direktverbindung (WebRTC) mit QR-Austausch

- Spiellogik läuft im Browser des Hosts (die vorhandene `Lobby`-Klasse ist transportunabhängig).
- Verbindungsaufbau ohne Server: Host zeigt QR mit Verbindungsangebot, Mitspieler scannt und zeigt eine
  Antwort als QR, die der Host scannt → **zwei Scans pro Mitspieler**.
- Hosting: beliebiger statischer Speicher (GitHub Pages, Schulserver, USB-Stick mit lokaler Datei).
- **Haken:** Viele Schul-WLANs isolieren Geräte voneinander („Client Isolation“) – dann kommt keine
  Direktverbindung zustande. Ausweg: Lehrkraft spannt einen Handy-Hotspot auf. iOS versteckt lokale
  IP-Adressen (mDNS), was ohne Internet gelegentlich scheitert.
- Kosten: 0 €. Robustheit: gering.

### B – Statisch + öffentlicher Vermittler (z. B. Bibliothek Trystero über Nostr/MQTT/BitTorrent-Tracker)

- Wie A, aber der Verbindungsaufbau läuft über fremde, öffentliche Server: nur Code eintippen.
- **Haken:** gleiche WLAN-Probleme wie A; IP-Adressen der Schüler gehen an unbekannte Drittserver
  (oft außerhalb der EU) → in Schulen datenschutzrechtlich kaum vertretbar.
- Kosten: 0 €. Robustheit: mittel. Datenschutz: schlecht.

### C – Beitrittscode + kleiner zentraler Server (Empfehlung)

- Alle Geräte verbinden sich ausgehend per WebSocket mit einem Server → funktioniert in jedem Netz,
  das Webseiten erlaubt.
- Server hält pro Spiel einen Raum im Speicher; keine Datenbank nötig (außer optionaler Bestenliste).
- Varianten:
  - **Cloudflare Workers + Durable Objects:** ein Durable Object pro Spielraum, weltweit, Gratis-Kontingent
    reicht für Schulbetrieb sehr wahrscheinlich. Haken: US-Anbieter (Auftragsverarbeitung, Standardvertragsklauseln).
  - **Kleiner EU-Server** (z. B. 4–6 €/Monat): der bestehende Node-Server fast unverändert, nur Beitrittscodes
    statt Liste. Datenschutz einfach, Betrieb (Updates, Überwachung) selbst.
  - **Öffentliche Träger:** Landesmedienzentren, Bildungsserver der Länder oder FWU/„Mundo“ betreiben Dienste
    für Schulen. Weil der Server klein und zustandsarm ist, ist eine Übergabe dorthin realistisch.
- Kosten: ~0–5 €/Monat. Robustheit: hoch.

### Vergleich

| | A statisch/QR | B Vermittler | C Code + Server |
|---|---|---|---|
| Serverkosten | 0 € | 0 € | 0–5 €/Monat |
| Beitritt | 2 Scans | Code | Code oder 1 Scan |
| Schul-WLAN | oft blockiert | oft blockiert | funktioniert |
| Datenschutz | sehr gut (lokal) | problematisch | gut (EU) bis ok (Cloudflare) |
| Offline nutzbar | ja (Hotspot) | nein | nein |
| Umbauaufwand | hoch | mittel | gering |

## Empfehlung

**C als Standard**, später optional **A als „Offline-Modus“** für Ausflüge oder Räume ohne Internet.
Beide nutzen dieselbe Spiellogik – nur der Transport wird ausgetauscht.

## Umbau-Skizze

1. **Transport-Schnittstelle:** `Hub` bekommt eine abstrakte „Verbindung“ (send/onMessage/onClose).
   Implementierungen: WebSocket (heute), Durable Object, WebRTC-Datenkanal.
2. **Beitrittscodes:** `Lobby.id` wird ein menschenlesbarer Code (ohne verwechselbare Zeichen wie 0/O, 1/I).
   Lobby-Liste nur noch im „Heimnetz-Modus“ (Raspi) per Schalter.
3. **QR-Code:** Erzeugung im Browser (kleine Bibliothek, kein Server nötig).
4. **PWA:** Manifest + Service Worker, damit Karten und Flaggen nach dem ersten Laden offline im Cache liegen.
5. **Datenschutz-Grundsätze:** nur Spitznamen, keine Konten, keine Cookies, keine IP-Protokolle, Räume werden
   nach Spielende gelöscht. Bestenliste nur lokal pro Gerät oder ganz weglassen (Spitznamen von Kindern!).
6. **Barrierearmut & Schule:** großer Kontrast, Bedienung auch per Maus/Tastatur, Lehrkräfte-Modus
   (Host spielt nicht mit, sieht nur Fortschritt und Auflösung – gut für den Beamer).

## Offene Fragen

1. Soll die Bestenliste in der Schulversion bleiben (Datenschutz bei Kindernamen) oder nur lokal/anonym sein?
2. Lehrkräfte-/Beamer-Modus gewünscht (Host projiziert, Klasse spielt auf Tablets)?
3. Gruppengröße: Für Klassenstärke (30) müsste das Limit von 12 Spielern steigen – gewollt?
4. Wer soll Betreiber sein (privat, Verein, öffentlicher Träger)? Davon hängt die Hosting-Wahl ab.
5. Kindgerechter Ton: Bleiben die sarkastischen Sprüche, oder gibt es einen „Schulmodus“ mit milderen Texten?
