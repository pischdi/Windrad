# Architektur-Entscheidungen: öffentlich, privat, Hosting, Datenquelle

**Stand:** 2026-09-13 · Entwurf zur Abstimmung, nichts davon ist umgesetzt.
Grundlage: `BUNDESLAENDER_HOEHENDATEN.md`, `MVP_ELEVATION_SERVICE.md`, `NEXT_STEPS.md`,
`PROJECT_STATUS.md` sowie der lokale Runner (`cloudrun/` + `run_local.py`).

---

## 0. Die zwei Produktlinien

| | **A — AR-Standortvisualisierung** | **B — Höhendaten- und Sichtdienst** |
|---|---|---|
| Zweck | Ein geplantes Bauwerk (Windrad, Batteriespeicher, Mast) vor Ort sichtbar machen, damit Bürger, Gemeinde und Öffentlichkeit sich ein Bild machen | Neigung des Untergrunds (DGM) für Bauwerke, Sichtverbindungen (DOM) für Richtfunk und Landschaftsbild |
| Nutzer | Laien, Verfahrensbeteiligte | Planer, Netzplanung, Entwickler |
| Bausteine | `index.html`, `admin.html`, `js/`, Foto-KI-Worker, Foto-Experimente | `elevation-api/`, Losspinne, Kachel-Pipelines, R2-Bucket |
| Rolle | Schaufenster, Akzeptanz, Sichtbarkeit | Das, wofür jemand zahlt |

Linie A wirbt für Linie B. Das ist kein Zufall, das ist das Geschäftsmodell.

---

## 1. Was öffentlich sein soll, und was nicht

**Leitsatz:** Öffentlich ist alles, was Vertrauen schafft oder Nutzer bringt.
Nicht öffentlich ist alles, was Arbeit repräsentiert, die jemand sonst geschenkt bekäme.

| Artefakt | Vorschlag | Begründung |
|---|---|---|
| AR-Viewer (Seite selbst) | **öffentlich** | Genau dafür ist er da. Ohne öffentlichen Zugang kein Beteiligungswerkzeug. |
| Quellcode des AR-Viewers | **privat**, sobald verkauft wird | Der Wert steckt nicht im Code, aber ein Wettbewerber spart sich damit Monate. Solange es reines Bürgerprojekt ist, darf es offen bleiben. |
| API-Doku + Demo (`/docs`, `/demo`) | **öffentlich** | Developer-UX ist laut MVP-Papier der Unterscheidungsfaktor. Eine API, die man nicht ausprobieren kann, kauft niemand. |
| API-Endpunkte `/v1/*` | **öffentlich erreichbar, aber mit Schlüssel und Kontingent** | Anonym: kleines Fenster zum Ausprobieren. Ernsthafte Nutzung: Schlüssel. Ist über `API_KEYS` im KV schon angelegt. |
| Kachel-Bestand auf R2 | **nicht mehr pauschal öffentlich** | Siehe Punkt 2. Heute hängt der Bucket an einer offenen `r2.dev`-Adresse. |
| Länder-Adapter (`tileproc.py`-Presets) | **privat** | Das ist der eigentliche Burggraben: 16 Portale, jedes mit eigener Macke, zu einer Quelle vereinheitlicht. Wer das hat, hat das Produkt. |
| Runner, Zeitfenster-Wächter, Betriebsskripte | **privat** | Betriebswissen, kein Kundennutzen. |
| Standortkatalog (Losspinne, RAN-Daten) | **privat, niemals veröffentlichen** | Netzplanungsdaten Dritter. Das ist nicht deine Entscheidung, sondern die des Datengebers. |
| Schlüssel jeder Art | **privat** | Selbstverständlich, aber `wrangler.toml` ist bereits gitignored — gut so. |

### Der wunde Punkt: der offene Kachel-Bucket

Heute liefert `https://pub-a0c3ff1c….r2.dev/` jede Kachel an jeden aus.
Das war für den Bürgerdienst richtig und ist es für Brandenburg weiterhin.
Beim Ausbau auf NRW (36.884 Kacheln) ändert sich die Lage: Das sind Wochen
Rechen- und Downloadzeit, die sich jeder mit einem Skript abholen kann.

**Vorschlag, zwei Schubladen im selben Bucket:**
- `public/…` — die Kacheln, die die AR-App für die veröffentlichten Standorte braucht.
  Bleiben offen erreichbar.
- `private/…` — alles andere. Kein `r2.dev`-Zugriff, nur über den Worker mit Schlüssel.

Technisch ist das billig: Der Worker hat das Bucket ohnehin als Binding (`TILES`),
liest also direkt und ohne Umweg über das öffentliche Internet.
Kosten entstehen dadurch keine zusätzlichen.

**Offene Frage an dich:** Soll die AR-App überhaupt öffentliche Kacheln behalten,
oder darf auch sie über den Worker gehen? Letzteres ist sauberer, kostet aber
einen API-Schlüssel im Frontend, und der steht dann im Quelltext der Seite.
Übliche Lösung: ein eigener, auf die Domain beschränkter Schlüssel nur fürs Frontend.

---

## 2. Hosting: bleibt es Cloudflare?

**Kurz: ja, und es gibt keinen guten Grund zu wechseln.**

Warum es passt:
- **Kein Ausgangs-Entgelt bei R2.** Das ist der entscheidende Punkt. Bei S3 oder
  einem eigenen Server zahlst du jedes ausgelieferte Höhenprofil mit.
- **Worker liest R2 direkt** über das Binding. Die Kachel verlässt das Netz von
  Cloudflare nicht, bevor daraus ein Ergebnis von wenigen Bytes wird.
- **Rechnen dort, wo der Nutzer ist.** Line-of-Sight ist Rechnen auf Daten, nicht
  Ausliefern von Daten. Genau dafür sind Worker gemacht.
- Pages und Worker kosten im Kleinen nichts.

**Womit du rechnen musst** (Größenordnungen, vor einer Zusage an Kunden nachschlagen):
- Worker im Gratis-Tarif: sehr knappe Rechenzeit je Anfrage. Eine Sichtlinie über
  viele Kacheln sprengt das. **Der bezahlte Tarif (rund 5 $ im Monat) ist die
  realistische Stufe**, dort liegt die Grenze je Anfrage bei Sekunden statt Millisekunden.
- R2: Speicher etwa 1,5 Cent je Gigabyte und Monat. Dein Brandenburg-Bestand
  (0,4 GB) ist nichts. Ganz NRW wird spürbar, bleibt aber im einstelligen
  Euro-Bereich pro Monat.
- Schreib- und Leseoperationen werden gezählt. Beim Vollausbau zählt der Upload,
  nicht der Betrieb.

**Wann ein eigener Server sinnvoll wird** — und das ist schon heute so:
- **Für das Bauen der Kacheln.** Download-Drosselung kostet Wartezeit, und Wartezeit
  auf Mietrechnern ist teuer. Genau deshalb läuft der Runner auf deiner Maschine.
  Das bleibt richtig.
- Für den Betrieb der API dagegen nicht. Ein eigener Server hieße: Ausgangsverkehr
  bezahlen, Erreichbarkeit selbst verantworten, Aktualisierungen selbst fahren.

**Fazit:** Bauen lokal, Ausliefern bei Cloudflare. Die Trennung, die du intuitiv
schon gebaut hast, ist die richtige.

**Ein Vorbehalt, den du kennen solltest:** Abhängigkeit von einem Anbieter. Der
Ausweg ist billig, wenn man ihn früh einbaut: Die Kacheln liegen als schlichte
Binärdateien in einem Bucket mit S3-Schnittstelle. Ein Umzug zu einem anderen
Anbieter ist ein `rclone copy`. Halte den Worker-Code frei von Cloudflare-Eigenheiten,
wo es ohne Aufwand geht, dann bleibt der Ausgang offen.

---

## 3. LAZ oder fertige Kacheln: die Entscheidung je Fall

Beide Wege führen zum selben Ergebnis, einem 1-m-Höhengitter auf R2.

| | **LAZ (Punktwolke)** | **bDOM/DOM1 (Rasterkachel)** |
|---|---|---|
| Was kommt an | Rohe Laserpunkte | Fertiges Raster, oft 0,2 m |
| Menge je Kachel | sehr groß (Brandenburg: ~220 MB je km²) | klein (wenige MB) |
| Rechenaufwand | hoch, 30–40 s je Kachel | gering, Herunterrechnen auf 1 m |
| Zusätzlicher Nutzen | Punktklassen: Boden, Vegetation, Gebäude getrennt. Daraus lassen sich DGM **und** DOM ableiten | Was geliefert wird, ist, was du bekommst |
| Wann es klemmt | wenn das Portal die Bandbreite nicht hergibt | wenn das Land kein Raster anbietet |

**Die Entscheidungsregel, die aus deinem eigenen Beispiel folgt:**

Nicht das Format entscheidet, sondern **die Zeit bis zur fertigen Kachel**:

```
Zeit = Datenmenge / tatsächliche Bandbreite + Rechenzeit
```

Ein LAZ mit 220 MB bei 100 Mbit/s ist in etwa 18 Sekunden da, plus 35 Sekunden
Rechnen macht knapp eine Minute. Eine Rasterkachel mit 8 MB bei gedrosselten
12 KB/s braucht über 11 Minuten. **Dann gewinnt LAZ, obwohl es das Hundertfache
an Daten ist.** Genau umgekehrt sieht es aus, wenn das Rasterportal normal liefert.

**Praktisch heißt das:** je Bundesland einmal messen, Ergebnis in die Tabelle
schreiben, danach ist es keine Diskussion mehr. Die Messung ist billig, es reicht
eine Kachel je Weg mit Stoppuhr.

Zusätzlich gilt:
- **Brauchst du DGM und DOM**, ist LAZ oft der bessere Kauf, weil beides aus einer
  Quelle fällt. Zwei Rasterprodukte sind zwei Downloads.
- **Brauchst du nur DOM** und das Raster kommt zügig, nimm das Raster.
- Bei **0,2-m-Rastern** (Niedersachsen, Rheinland-Pfalz, Schleswig-Holstein, Bayern)
  lädst du das 25-fache der Daten, die du am Ende behältst. Das ist nur bei guter
  Leitung sinnvoll.

**Konsequenz für die Aufräumarbeit:** Die beiden Pipelines sind **kein Duplikat**.
`scripts/` ist der LAZ-Weg, `cloudrun/` der Rasterweg. Beide bleiben. Was fehlt, ist
eine Spalte „schnellster Weg“ in `BUNDESLAENDER_HOEHENDATEN.md` und ein Satz im
README, welcher Weg wann gilt.

---

## 4. Was daraus als nächstes zu tun wäre

Nichts davon ist gemacht, alles ist zur Abstimmung:

1. **Messen**, nicht raten: je verfügbarem Land eine Kachel auf beiden Wegen ziehen,
   Zeiten notieren, Spalte ergänzen.
2. **Bucket aufteilen** in öffentlich und privat, bevor der NRW-Bestand vollständig ist.
3. **Repo privat schalten**, sobald der erste Verkauf ansteht. Vorher nicht nötig.
4. **Bezahlten Worker-Tarif buchen**, sobald echte Nutzer auf der Sichtlinie rechnen.
5. **Echte Kontingente** statt nur Missbrauchsschutz. Steht im MVP-Papier schon als
   offener Punkt, braucht D1 oder Durable Objects.
