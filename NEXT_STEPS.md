# Nächste Schritte — Übergabe

**Stand:** 2026-07-13 · Kontext in Memory: `losspinne-richtfunk-purpose`, `windrad-project-state`.

## Wo wir stehen
Die **Losspinne** ist auf ihren echten Zweck umgebaut: **Sichtverbindungs-/Richtfunk-Planung zwischen Mobilfunk-Standorten** (nicht Windräder). Route `/losspinne` im Worker `elevation-api/index.js`.

- ✅ **POC gebaut & verifiziert** (Nutzer hat live gefahren: Punkt setzen → Spinne 3 frei/3 teilw./1 kritisch → Klick auf Linie → DOM-Profil).
  - Neuer Punkt (Karten-Klick) + **Radius-Slider** → Standorte im Umkreis → Sichtlinien 🟢 frei / 🟠 teilw. / 🔴 kritisch (`/v1/line-of-sight`, Antennenhöhe beidseitig einstellbar) → **Klick → DOM-Geländeprofil** (`/v1/profile`).
  - Standorte via `import LOSSPINNE_SITES from './losspinne_sites.json'` + Route `/losspinne/sites.json`.
- ⏳ **Blockiert auf echte Standortdaten** (siehe unten) und **Deploy** (bewusst nicht gepusht).

## Datenquellen-Entscheidung (erschöpfend geprüft)
- **OSM/Overpass** = POC-Gerüst: metergenau wo vorhanden, ODbL. **Aber unvollständig** — der reale Laubsdorf-Turm (51,677/14,442) fehlt in OSM komplett. Taugt NICHT als Katalog der echten Standorte.
- **OpenCellID verworfen**: median ±1 km, 0 % mastgenau → für LoS untauglich (`DATA/262.csv` nur Referenz, gitignored).
- **BNetzA EMF**: inhaltlich ideal (exakt + Antennenhöhen), aber Antworten verschlüsselt (`Standortservice.asmx`, `SecMode:true`) + Bulk nur Behörden-Portal → nicht scrapen.
- **→ Echter Katalog:** Koordinaten aus der **Netzplanung/RAN-DB** (Weg B, entschieden). Anfrage an Kollegen läuft.

## Sofort dran, sobald der Koordinaten-Export da ist
1. Export (CSV/xlsx, WGS84 lat/lon **oder** UTM32/33 Ost/Nord + Zone) ins Projekt legen, z. B. `scripts/standorte_koordinaten.csv` (gitignored).
2. `python3 scripts/sites_from_coords.py <datei> [--utm-zone 33]` → schreibt `elevation-api/losspinne_sites.json` (dedupt, auf Höhen-Abdeckung gefiltert). Konverter ist getestet (UTM↔WGS84 Roundtrip 0 m).
3. Losspinne neu laden → echte Standorte. Ggf. `wrangler deploy`.

## Engpass: Höhen-Abdeckung (nicht die Standortquelle)
Auf R2 liegen nur die **141 Original-Tiles** um die 4 Windräder (UTM33 E456–468, N5719–5737). Von 180 regionalen OSM-Türmen fallen nur **9** hinein. Mehr Standorte nutzbar erst mit mehr Tiles → **Colab→R2-Kachel-Pipeline** (unten, weiterhin blockiert).

## Blockiert (Cloudflare) — Tile-Pipeline
- **R2 API Token** in Cloudflare erstellen (Permission Object Read & Write, Bucket `windrad-tiles`) → Access Key ID + Secret in Colab-Secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; `R2_ACCOUNT_ID=975505fa80cf3d0f8e0c3b049e9c6112`).
- Notebook `colab/process_brandenburg_bdom.ipynb` (Erfolgssignal Zelle 2: `R2-Client bereit. Account: 975505fa…`). `BBOX_KM` vorher auf Zielregion eingrenzen.
- **Blocker:** Cloudflare-Browser-Login (via GitHub) + MCP-Server in dieser Session nicht authentifiziert.

## Elevation-API (live, gesund)
Endpoints: `/v1/point`, `/v1/profile`, `/v1/line-of-sight`, `/v1/viewshed`, `/docs`, `/demo`, **`/losspinne`**, `/losspinne/sites.json`.

## Skripte
- `scripts/sites_from_coords.py` — Koordinaten-CSV → sites.json (der produktive Weg).
- `scripts/geocode_standorte.py` — Adress-CSV → Geocoding (nur falls mal Adressen ohne Koordinaten; für LoS zu ungenau).
