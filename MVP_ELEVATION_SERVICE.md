# MVP: Höhendaten-Dienst (Elevation Service)

**Stand:** 2026-06-25 · **Status:** Plan / in Umsetzung

Aufbauend auf der bestehenden Brandenburg-ALS-Pipeline (LAZ → Uint16-Höhengrids, 1m,
auf Cloudflare R2) und der vorhandenen Sichtbarkeitslogik
([js/visibility-calculator.js](js/visibility-calculator.js)).

---

## 1. Worum geht es

Eine **REST-API für Höhendaten mit Mehrwert-Endpunkten**. Der eigentliche
Unterscheidungsfaktor ist **nicht** "Daten" (die sind als Open Data gratis), sondern
**Line-of-Sight / Sichtbarkeit + saubere Developer-UX** — beides bietet das offizielle
Brandenburger Geoportal so nicht.

### Marktlage (Kurzfassung aus der Recherche, 2026-06)
- Rohdaten sind **gratis Open Data** (Brandenburg DGM unter `dl-de/by-2-0`).
- Brandenburg betreibt **selbst** eine kostenlose REST-API für Punkt + Linienprofil
  (`isk.geobasis-bb.de/elevation/...`) plus WMS/WCS/WMTS + Direkt-Download.
- Bundesweit liegen 1m-Daten vor (BKG DGM1, Bayern DGM1 gratis CC BY 4.0),
  aber **meist nur als OGC-Dienste/Bulk-Download, nicht als entwicklerfreundliche REST-API**.
- Globale Anbieter (Mapbox etc.) sind **gröber aufgelöst** (10m-Stufen) als 1m-ALS.
- **Fazit:** Reiner Daten-Wiederverkauf trägt nicht. Chance liegt in
  **Usability + Aggregation + Mehrwert-Compute (Line-of-Sight)**.
- **Offen/unbelegt:** konkrete Zahlungsbereitschaft. → erst MVP, dann an echten Nutzern lernen.

---

## 2. Scope MVP (bewusst klein)

- **Region:** nur Brandenburg (141 Tiles existieren bereits auf R2).
- **Drei Endpunkte:**
  1. `GET /v1/point` — Höhe an einem Punkt
  2. `GET /v1/profile` — Höhenprofil entlang einer Linie
  3. `GET /v1/line-of-sight` — Sichtbarkeit (sichtbar ja/nein + verdeckter Anteil) **← USP**

### Bewusst NICHT im MVP
Bundesweite Aggregation, Billing/Stripe, Tile-Download-Endpunkt, Custom Domain,
weitere Bundesländer, SDKs. Kommt erst nach belegter Nutzung.

---

## 3. API-Design

### `GET /v1/point?lat=<>&lon=<>`
```json
{ "lat": 51.6546, "lon": 14.4178, "elevation": 78.3, "unit": "m", "source": "DGM1 Brandenburg", "resolution_m": 1 }
```

### `GET /v1/profile?from=<lat>,<lon>&to=<lat>,<lon>&samples=<n>`
```json
{ "from": {...}, "to": {...}, "samples": 200,
  "profile": [ { "lat": .., "lon": .., "distance_m": 0, "elevation": 78.3 }, ... ] }
```

### `GET /v1/line-of-sight?observer=<lat>,<lon>,<h>&target=<lat>,<lon>,<h>`
```json
{ "visible": false, "visiblePercent": 62, "blockedAt": { "distance_m": 1430, "elevation": 95.1 },
  "observer": {...}, "target": {...} }
```
- `h` = Höhe über Grund (Augenhöhe / Objekthöhe), optional, Default 1.7 m.

### Querschnitt
- Auth: Header `X-API-Key` (Free-Tier ohne Key mit hartem Rate-Limit denkbar).
- Fehler: JSON `{ "error": "...", "code": "OUT_OF_COVERAGE" }`, passende HTTP-Codes.
- CORS aktiviert (Browser-Nutzung).

---

## 4. Architektur (alles Cloudflare)

```
Client → Cloudflare Worker (elevation-api)
            ├─ API-Key-Check + Rate-Limit (KV)
            ├─ Koordinate (WGS84) → EPSG:25833 → Kachel-ID (z.B. 459_5722)
            ├─ Tile aus R2 laden (.bin.gz, Uint16, 1m)   ← Pipeline existiert
            ├─ bilineare Interpolation am Punkt
            └─ Profil / Line-of-Sight (Logik aus visibility-calculator.js)
         → JSON
```

- **Daten:** R2 (vorhanden). Kachelung über EPSG:25833 wie heute (`tile_<x>_<y>.bin.gz`).
- **Tile-Format:** Uint16-Grid, 1000×1000, 1m — wie von `laz_to_binary.py` erzeugt.
- **Auth/Limits:** API-Keys + Zählerstände in Cloudflare KV.
- **Doku:** OpenAPI-Spec + einfache Doku-Seite (der eigentliche UX-Vorteil ggü. OGC-Portalen).

---

## 5. Umsetzungsschritte & Aufwand

| # | Baustein | Aufwand |
|---|----------|---------|
| 1 | Worker-Gerüst + Routing + R2-Tile-Loader + Punkt-Interpolation (`/v1/point`) | ~1–2 Tage |
| 2 | Profil-Endpunkt (`/v1/profile`) | ~1 Tag |
| 3 | Line-of-Sight (`/v1/line-of-sight`) — Portierung aus `visibility-calculator.js` | ~2 Tage |
| 4 | API-Keys + Rate-Limit (KV) | ~1 Tag |
| 5 | OpenAPI-Spec + Doku-Seite | ~1 Tag |
| | **Summe MVP** | **~1 Woche** |

---

## 6. Reality-Check

Brandenburg hat selbst eine kostenlose Punkt+Profil-API. Die Daseinsberechtigung des
Dienstes hängt an **(a)** spürbar besserer Developer-Experience **und (b)** dem
**Line-of-Sight-Mehrwert**, den die Behörde nicht bietet. Ist LoS nicht der Kern, ist der
Markt zu dünn — dann besser als Open-Source-Demo/Portfolio statt bezahltem Dienst
positionieren.
