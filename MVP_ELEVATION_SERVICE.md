# MVP: Höhendaten-Dienst (Elevation Service)

**Stand:** 2026-06-25 · **Status:** MVP komplett (Schritte 1–5 live) → https://elevation-api.pischdi.workers.dev

> Umgesetzt: `/v1/point`, `/v1/profile`, `/v1/line-of-sight`, `/v1/health`,
> API-Keys + Rate-Limit (Schritt 4), OpenAPI + Doku-Seite (Schritt 5).
> Doku: https://elevation-api.pischdi.workers.dev/docs · Spec: `/openapi.json`
> Interaktive Demo (Karte, Punkt + Line-of-Sight): https://elevation-api.pischdi.workers.dev/demo

### Auth & Rate-Limit (Schritt 4)

- Header `X-API-Key`. Keys liegen im KV-Namespace `API_KEYS` (Key → `{name, tier}`).
- Anonym (ohne Key): **30 Anfragen / 60 s pro IP** (native `ratelimit`-Binding `RL_ANON`).
- Mit gültigem Key: **600 Anfragen / 60 s pro Key** (`RL_KEY`). Ungültiger Key → 401.
- Hinweis: Das `ratelimit`-Binding ist Missbrauchsschutz (Fenster 10/60 s), **keine**
  Monatsquote. Echte Kontingente/Billing bräuchten D1 oder Durable Objects (später).
- Key anlegen:
  `wrangler kv key put --namespace-id=<API_KEYS-id> "<key>" '{"name":"...","tier":"..."}' --remote`

#### Bindings (elevation-api/wrangler.toml — ist gitignored, daher hier dokumentiert)

```toml
name = "elevation-api"
main = "index.js"
compatibility_date = "2024-09-01"
workers_dev = true

[[r2_buckets]]
binding = "TILES"
bucket_name = "windrad-tiles"

[[kv_namespaces]]
binding = "API_KEYS"
id = "7c5f27447d1d425e8b02c6f3ef66af72"

[[ratelimits]]
name = "RL_ANON"
namespace_id = "2001"
[ratelimits.simple]
limit = 30
period = 60

[[ratelimits]]
name = "RL_KEY"
namespace_id = "2002"
[ratelimits.simple]
limit = 600
period = 60
```

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

| # | Baustein | Status |
|---|----------|--------|
| 1 | Worker-Gerüst + Routing + R2-Tile-Loader + Punkt-Interpolation (`/v1/point`) | ✅ live |
| 2 | Profil-Endpunkt (`/v1/profile`) | ✅ live |
| 3 | Line-of-Sight (`/v1/line-of-sight`) — Portierung aus `visibility-calculator.js` | ✅ live |
| 4 | API-Keys (KV) + Rate-Limit (ratelimit-Binding) | ✅ live |
| 5 | OpenAPI-Spec + Doku-Seite (`/openapi.json`, `/docs` via Redoc) | ✅ live |

---

## 6. Reality-Check

Brandenburg hat selbst eine kostenlose Punkt+Profil-API. Die Daseinsberechtigung des
Dienstes hängt an **(a)** spürbar besserer Developer-Experience **und (b)** dem
**Line-of-Sight-Mehrwert**, den die Behörde nicht bietet. Ist LoS nicht der Kern, ist der
Markt zu dünn — dann besser als Open-Source-Demo/Portfolio statt bezahltem Dienst
positionieren.
