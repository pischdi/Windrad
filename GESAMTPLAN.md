# Gesamtplan: wie alles zusammenspielt

**Stand:** 2026-09-13 · Entwurf zur Abstimmung.
Entschieden ist bereits: **die AR-App greift über den Worker zu, nicht direkt auf den Bucket.**

---

## 1. Der Weg der Daten, von der Behörde bis zum Handy

```
 ① Landesportal (16 Länder, LAZ oder Raster)
        │   holen + rechnen: nur bei dir zu Hause
        ▼
 ② Lokaler Runner (cloudrun/run_local.py, Zeitfenster 18–07 + Wochenende)
        │   1-m-Höhengitter, Uint16, + .gz
        ▼
 ③ R2-Bucket  windrad-tiles      ← der einzige Datenspeicher, nicht öffentlich
        │   Binding TILES, kein Umweg übers Internet
        ▼
 ④ Worker  elevation-api          ← die einzige Tür zu den Daten
        │   /v1/point · /v1/profile · /v1/line-of-sight · /v1/viewshed · /v1/ensure
        │
        ├───► ⑤ Losspinne (geschützt)   darstellen im Browser + Export als GeoJSON
        ├───► ⑥ Kunden-API (geschützt)  Fremdentwickler, Kontingent je Schlüssel
        └───► ⑦ AR-App (offen)          Bürger, Frontend-Schlüssel nur für unsere Domain
                    │
                    └──► ⑧ Foto-KI-Worker (Gemini) rendert das Bauwerk ins Kamerabild
```

**Die eine Regel, aus der alles folgt:** Der Bucket hat genau eine Tür, und die heißt
Worker. Wer Höhen will, fragt den Worker. Damit ist egal, wer fragt — Bürger, Kunde
oder du selbst —, es gilt überall dieselbe Rechte- und Kontingentlogik.

---

## 2. Wo die gerechneten Kacheln liegen

**Antwort: weiterhin R2, ein Bucket, aber mit Ordnung und ohne offene Adresse.**

Warum nicht woanders:
- Ausgehender Verkehr kostet bei R2 nichts. Bei jedem anderen Anbieter zahlst du
  jedes ausgelieferte Profil.
- Der Worker liest den Bucket über ein Binding. Die Kachel verlässt Cloudflare
  nicht, bevor daraus ein Ergebnis von wenigen Bytes geworden ist.
- Ein Umzug bleibt trotzdem billig: Es sind schlichte Binärdateien hinter einer
  S3-Schnittstelle, ein `rclone copy` genügt.

### Namensschema

Heute liegt alles flach im Bucket (`tile_459_5722.bin.gz`), der neue Worker kennt
zusätzlich `tile_<zone>_<E>_<N>`. Beim Ausbau auf mehrere Länder und zwei Modelle
(DOM für Sicht, DGM für Gefälle) wird das eng. Vorschlag:

```
dom/33/tile_459_5722.bin.gz        Brandenburg, UTM33, Oberfläche
dom/32/tile_368_5705.bin.gz        NRW, UTM32
dgm/33/tile_459_5722.bin.gz        dasselbe Feld, Gelände
```

Das Land steckt implizit in Zone und Koordinate, es braucht keine eigene Ebene.
Die 141 Altkacheln werden einmal kopiert, nicht verschoben, dann kann der Worker
beide Wege bedienen, bis die alte Ebene leer ist.

### Zugriff

| Wer | Wie |
|---|---|
| Runner (Schreiben) | S3-Schlüssel, nur Object Read & Write auf diesen Bucket. Liegt lokal in `cloudrun/.env`. |
| Worker (Lesen) | Binding `TILES`, gar kein Schlüssel nötig. |
| Alle anderen | **gar nicht.** Die öffentliche `r2.dev`-Adresse wird abgeschaltet. |

**Das ist die eine Änderung mit sofortiger Wirkung:** Solange `pub-a0c3ff1c….r2.dev`
offen ist, kann sich jeder den kompletten Bestand ziehen. Abschalten geht erst,
wenn die AR-App auf den Worker umgestellt ist — also in dieser Reihenfolge.

---

## 3. Schlüssel: drei Sorten, drei Zwecke

| Sorte | Für wen | Rechte | Wo er liegt |
|---|---|---|---|
| **Frontend-Schlüssel** | die AR-App | nur lesende Endpunkte, gedeckelt, **nur von unserer Domain gültig** (Origin-Prüfung im Worker) | im Quelltext der Seite, das ist in Ordnung |
| **Kunden-Schlüssel** | Planer, Fremdentwickler, Losreport | volles `/v1/*`, eigenes Kontingent | KV `API_KEYS`, bereits gebaut |
| **Schreib-Schlüssel** | nur der Runner | Schreiben auf R2 | lokal, nie im Repo, nie im Frontend |

Der Frontend-Schlüssel steht zwangsläufig sichtbar in der Seite. Das ist unkritisch,
solange der Worker prüft, von welcher Herkunft die Anfrage kommt, und solange dieser
Schlüssel nur das darf, was die AR-App braucht. Ohne Origin-Prüfung ist er wertlos
als Schutz.

---

## 4. Domain: ja, und zwar bald

**Kurz: kaufen. Aus vier Gründen, von denen nur einer Eitelkeit ist.**

1. **Unabhängigkeit.** `pages.dev` und `workers.dev` gehören Cloudflare. Ziehst du
   um, ändern sich alle Adressen, und jeder Kunde muss seine Anbindung anfassen.
   Mit eigener Domain zeigst du einfach woanders hin. Das ist die billigste
   Versicherung gegen Anbieterbindung, die es gibt.
2. **Kunden.** Eine API unter `…​.workers.dev` sieht aus wie ein Bastelprojekt.
   Für den ersten Vertrag ist das ein echtes Hindernis.
3. **Schlüsselbindung.** Die Origin-Prüfung aus Punkt 3 braucht eine feste,
   eigene Domain, sonst schützt sie nichts.
4. **E-Mail und Impressum.** Kommt spätestens mit der ersten Rechnung.

**Aufteilung**, alles unter einer Domain:

```
ar.<domain>          AR-App, öffentlich (heute windrad.pages.dev)
api.<domain>         Elevation-API mit Doku und Demo
report.<domain>      Losreport, geschützt
foto.<domain>        Foto-KI-Worker (oder als Pfad unter api.)
```

**Zum Namen:** Nimm **nicht** „windrad“. Die Losspinne ist längst Richtfunk, und die
API rechnet Gefälle für Funktürme und Gebäude. Ein Name, der nach Windkraft klingt,
verkauft dir die Hälfte deiner Anwendungsfälle weg. Besser etwas um Höhe, Gelände
oder Sichtlinie herum.

**Praktisch:** Wenn du bei Cloudflare kaufst, verkaufen die zum Einkaufspreis ohne
Aufschlag, und DNS ist sofort verdrahtet. Ob deine Wunschendung dort verfügbar ist,
musst du im Dashboard prüfen — nicht jede Endung wird dort angeboten. Falls nicht:
woanders kaufen, Namensserver auf Cloudflare zeigen, gleiches Ergebnis.

---

## 5. Reihenfolge der Umsetzung

Jeder Schritt ist für sich nützlich und bricht nichts:

| # | Schritt | Warum zuerst |
|---|---|---|
| 1 | **Domain kaufen**, Unterdomains auf die bestehenden Dienste zeigen | Alles Weitere hängt daran, und alte Adressen laufen parallel weiter |
| 2 | **Origin-Prüfung + Frontend-Schlüssel** im Worker | Voraussetzung für Schritt 3 |
| 3 | **AR-App auf den Worker umstellen**, danach `r2.dev` **abschalten** | Erst dann ist der Bestand geschützt |
| 4 | **Bucket-Ordnung** einführen (`dom/…`, `dgm/…`), Altkacheln kopieren | Vor dem großen Ausbau, nicht danach |
| 5 | **Bezahlter Worker-Tarif** | Sobald echte Sichtlinien gerechnet werden |
| 6 | **Echte Kontingente** je Schlüssel (D1 oder Durable Objects) | Erst wenn jemand zahlt |
| 7 | **Länder nach Bedarf** ergänzen, Adapter je Portal | On-Demand, nicht auf Vorrat |

Nicht auf der Liste, absichtlich: Repo privat schalten. Das machst du, sobald der
erste Verkauf ansteht, vorher bringt es nichts und kostet Sichtbarkeit.

---

## 6. Was das kostet, grob

| Posten | Größenordnung |
|---|---|
| Domain | einige Euro im Jahr |
| Worker, bezahlter Tarif | rund 5 $ im Monat |
| R2-Speicher | etwa 1,5 Cent je GB und Monat — Brandenburg 0,4 GB, ganz NRW einstellig im Monat |
| Ausgehender Verkehr | nichts |
| Rechnen der Kacheln | Strom, läuft ohnehin |

Vor einer Zusage an Kunden bitte die aktuellen Preise im Dashboard gegenprüfen,
die Zahlen hier sind Größenordnungen, keine Angebote.

---

## 7. Ausgabeformat: darstellen und als GeoJSON ausliefern

**Entschieden (2026-09-13): kein Report, kein PDF. Darstellen im Browser, Export als GeoJSON.**

Das ist aus drei Gründen die bessere Wahl:
- **Anschlussfähig.** GeoJSON zieht man in QGIS, ArcGIS oder ein Planungswerkzeug und
  arbeitet weiter. Ein PDF landet im Ordner und stirbt dort.
- **Kein zweiter Apparat.** Ein PDF bräuchte eine Rendering-Kette im Worker. GeoJSON
  fällt aus den Daten heraus, die ohnehin vorliegen.
- **Prüfbar.** Der Kunde sieht die Zahlen, nicht nur eine Ampel.

### Was welcher Endpunkt liefert

| Inhalt | Geometrie | Eigenschaften |
|---|---|---|
| Standorte | `Point` | Name, Antennenhöhe, Quelle |
| Sichtverbindung | `LineString` (Anfang → Ende) | Bewertung (frei / teilweise / kritisch), geringster Abstand zum Gelände, Entfernung, Antennenhöhen beidseitig |
| Höhenprofil | `LineString` mit Höhe als dritter Koordinate | Schrittweite, Modell (DOM oder DGM), Kachelabdeckung |
| Sichtfeld (viewshed) | `Polygon` oder `MultiPolygon` | Beobachterhöhe, Reichweite |

Alles zusammen als eine `FeatureCollection` je Abfrage, dann hat der Empfänger eine
Datei statt vier.

### Zwei Fallstricke

1. **GeoJSON ist auf WGS84 festgelegt** (RFC 7946). Deine Kacheln liegen in UTM 32
   und 33. Es wird also immer umgerechnet ausgeliefert. Wer in UTM weiterarbeitet,
   rechnet zurück — die Rundungsfehler sind im Zentimeterbereich und damit egal,
   aber erwähnen muss man es.
2. **Höhen gehören in die Koordinate**, nicht in ein eigenes Feld. Die dritte Stelle
   einer GeoJSON-Position ist genau dafür da. Wer es anders macht, fliegt in jedem
   Standardwerkzeug auf die Nase.

Wer später doch UTM braucht, bekommt GeoPackage oder CSV dazu. Erst mal nicht bauen.

---

## 8. Offene Punkte

- **Standortkatalog für die Losspinne** fehlt weiterhin (Export aus der Netzplanung).
  Ohne ihn bleibt die Sichtlinienrechnung ein Demonstrator.
- **Datenlizenz je Land** sauber nachweisen, bevor verkauft wird. Nennung der Quelle
  gehört dann in Doku und Export.
- **Foto-KI:** vertagt (2026-09-13). Bleibt vorerst Teil der AR-App, Entscheidung über
  einen eigenen bezahlten Dienst später.

## Dauerlauf als Systemdienst (seit 15.09.2026)

Der Kachel-Runner hing bis dahin als Kindprozess an der Agenten-Sitzung. Am 15.09. um
00:39 hat ihn eine Konfigurationsänderung mitgerissen — 6.599 Kacheln blieben liegen.
`setsid nohup` hat unter WSL2 nicht getragen.

Seitdem läuft der Zeitfenster-Wächter als **systemd-Benutzerdienst**:

    cp cloudrun/windrad-runner.service ~/.config/systemd/user/
    systemctl --user daemon-reload
    systemctl --user enable --now windrad-runner.service

    systemctl --user status windrad-runner.service    # Zustand
    systemctl --user stop windrad-runner.service      # sauber anhalten
    journalctl --user -u windrad-runner.service -f    # mitlesen

Eigenschaften:
- `Restart=always` — überlebt Abstürze, nachgewiesen gegen SIGKILL
- `TimeoutStopSec=180` — der Wächter darf laufende Downloads zu Ende bringen (`stop_runner`
  wartet bis zu 120 s), bevor systemd härter wird
- `WantedBy=default.target` plus aktiviertes Linger — startet nach einem Neustart der
  Maschine von selbst, ohne Anmeldung
- Das Zeitfenster (Mo–Fr 18:00–07:00, Wochenende durchgehend) und die Datei `.freigabe`
  gelten unverändert; der Dienst ändert nur, **wer** den Wächter am Leben hält.
