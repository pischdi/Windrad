# Elevation API

Höhendaten-Dienst auf Basis des **Brandenburg-DOM** (Airborne Laser Scanning,
1 m Auflösung, EPSG:25833). Liefert Punkt-Höhe, Höhenprofil entlang einer Linie
und **Sichtbarkeit/Line-of-Sight** — als einfache REST-API auf Cloudflare Workers.

- **Live:** https://elevation-api.pischdi.workers.dev
- **Interaktive Demo (Karte):** https://elevation-api.pischdi.workers.dev/demo
- **Doku (Redoc):** https://elevation-api.pischdi.workers.dev/docs
- **OpenAPI-Spec:** https://elevation-api.pischdi.workers.dev/openapi.json
- **Abdeckung (MVP):** Region Neuhausen/Spree (Brandenburg) — die vorhandenen R2-Tiles.

---

## Endpunkte

| Methode & Pfad | Zweck |
|---|---|
| `GET /v1/point?lat=&lon=` | Höhe an einem Punkt (bilinear interpoliert) |
| `GET /v1/profile?from=lat,lon&to=lat,lon&samples=n` | Höhenprofil entlang einer Linie |
| `GET /v1/line-of-sight?observer=lat,lon[,h]&target=lat,lon[,h]&samples=n` | Sichtbarkeit / verdeckter Anteil |
| `GET /v1/viewshed?observer=lat,lon[,h]&radius=&rays=&step=&targetHeight=` | Sichtweite (Fächer): sichtbare Distanz-Intervalle pro Richtung |
| `GET /v1/health` | Liveness-Check (offen) |
| `GET /docs`, `/openapi.json` | Dokumentation (offen) |

Koordinaten in Dezimalgrad (WGS84). Höhen `h` in Metern über Grund
(Beobachter-Default = Augenhöhe 1,7 m; Ziel-Default = 0 m).

### Beispiele

```bash
# Punkt-Höhe
curl "https://elevation-api.pischdi.workers.dev/v1/point?lat=51.6546&lon=14.4178"

# Höhenprofil (50 Stützpunkte)
curl "https://elevation-api.pischdi.workers.dev/v1/profile?from=51.6546,14.4178&to=51.6711,14.4319&samples=50"

# Sichtbarkeit eines 250 m hohen Windrads über 13 km
curl -H "X-API-Key: <KEY>" \
  "https://elevation-api.pischdi.workers.dev/v1/line-of-sight?observer=51.6546,14.4178,1.7&target=51.7639,14.4932,250"
```

### `line-of-sight`-Antwort (Auszug)

```json
{
  "visible": true,            // Zielspitze ungehindert sichtbar (status === "visible")
  "status": "partial",        // visible | partial | blocked
  "visiblePercent": 99.41,
  "visibleHeight_m": 248.51,
  "blockedAt": { "lat": .., "lon": .., "elevation": 106.73, "distance_m": 132.84 }
}
```

Hinweis: `visible` kann `true` sein, während `blockedAt` gesetzt ist — dann ist die
Sicht nur geringfügig (< 30 %) beschnitten und der Status bleibt `visible`.

---

## Authentifizierung & Limits

- Header **`X-API-Key`** (optional).
- **Ohne Key:** 30 Anfragen / 60 s pro IP.
- **Mit gültigem Key:** 600 Anfragen / 60 s pro Key. Ungültiger Key → `401`.
- Über Limit → `429` (mit `Retry-After`).
- Das Rate-Limit ist Missbrauchsschutz (Fenster 10/60 s), **keine Monatsquote**.

Keys liegen im KV-Namespace `API_KEYS` (`Key` → `{ "name": ..., "tier": ... }`):

```bash
wrangler kv key put --namespace-id=<API_KEYS-id> "<key>" '{"name":"kunde","tier":"free"}' --remote
```

---

## Benötigte Zugänge / Secrets

| Was | Wofür | Status |
|---|---|---|
| Cloudflare-Account-Login (`wrangler login`) | Deploy, KV, R2 | nötig für Deploy |
| R2-Bucket `windrad-tiles` | Höhen-Tiles (Quelle) | vorhanden |
| KV-Namespace `API_KEYS` | API-Key-Validierung | angelegt (`7c5f2744…`) |
| Rate-Limit-Bindings `RL_ANON`, `RL_KEY` | Drosselung | in `wrangler.toml` |

**Dieser Worker benötigt keine Secrets** (`wrangler secret`) — er nutzt nur Bindings.
Tiles werden bevorzugt über das R2-Binding `TILES` gelesen; ohne Binding fällt der
Worker auf die öffentliche R2-URL zurück.

> Hinweis zum Schwester-Worker `../worker` (AI-Foto-Analyse): der braucht die
> Secrets `GEMINI_API_KEY` und `ANTHROPIC_API_KEY` (`wrangler secret put ...`).

---

## Deployment

`wrangler.toml` ist repo-weit per `.gitignore` ausgeschlossen; die vollständige
Binding-Konfiguration steht in [../MVP_ELEVATION_SERVICE.md](../MVP_ELEVATION_SERVICE.md).

```bash
cd elevation-api
wrangler login          # einmalig
wrangler deploy --env=""
```

---

## Technik & bekannte Grenzen

- **Koordinaten:** vollständige Transverse-Mercator-Vorwärtsformel (WGS84 → UTM33N).
  Verifiziert gegen alle vier bekannten Windrad-Kacheln.
- **Tiles:** `Uint16`-Grid, 1000×1000, Werte in **cm**, Datei `tile_<x>_<y>.bin`.
- **nodata:** Der Wert `0` wird als „keine Daten" behandelt. In Brandenburg
  unproblematisch (Grund 30–150 m); bei Ausweitung auf Tiefland/Küste müsste der
  echte nodata-Sentinel berücksichtigt werden.
- **Kein Cross-Request-Cache:** jede Anfrage lädt Tiles neu (Request-lokaler Cache
  dedupliziert innerhalb einer Anfrage). Optimierung via Cache API ist Backlog.
- **`line-of-sight` / `viewshed` rechnen auf dem DOM** (Oberfläche inkl. Bäume
  und Gebäude). Die Verdeckung wird über den **steilsten Sichtwinkel** (grazing
  angle) bestimmt — ein nahes hohes Hindernis verdeckt korrekt auch weit
  entfernte, tieferliegende Ziele. Folge: auf Augenhöhe (1,7 m) in/nahe Bebauung
  ist die Sicht oft vollständig blockiert (realistisch). Für „Sicht über offenes
  Gelände ohne Bewuchs" bräuchte man ein DTM (bare-earth) als zusätzlichen Layer.
- **Genauigkeit:** ohne Erdkrümmung/Refraktion — für sehr große Distanzen TODO.
