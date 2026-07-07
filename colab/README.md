# Höhenkacheln erzeugen & nach R2 laden

Dieses Verzeichnis enthält den Bulk-Prozessor, mit dem die Höhen-Kacheln der
Elevation API aus Brandenburger Open Data erzeugt werden.

## Das Konzept in einem Satz

Brandenburg liefert Gratis-Höhendaten → wir wandeln sie in kompakte Binär-Kacheln
(`tile_x_y.bin`, 1000×1000, 1 m, Uint16 in cm) → speichern sie in **Cloudflare R2** →
der **Worker** (`../elevation-api`) beantwortet damit Höhen-/Sichtbarkeitsfragen als API.

```
Brandenburg-Geoportal (bDOM, 0,2 m)  →  Colab: konvertieren zu 1 m  →  R2  →  Worker  →  App/Kunden
```

## Warum bDOM (nicht ALS-LAZ)?

| Produkt | Größe/Kachel | Inhalt |
|---------|--------------|--------|
| ALS-LAZ (früher) | ~114 MB | Punktwolke → DOM |
| **bDOM-TIF (jetzt)** | **~22 MB** | **Oberfläche inkl. Bäume/Gebäude (Raster)** |
| DGM-TIF | ~1,2 MB | nur Boden (ohne Bewuchs) |

bDOM hat dieselbe DOM-Semantik wie die bisherigen Kacheln (wichtig für die
„hinter dem Haus sieht man nichts"-Sichtbarkeit), ist aber ~5× kleiner und einfacher
zu verarbeiten. **bDOM ist nativ 0,2 m** (5000×5000/km²); wir rechnen mit
`Resampling.max` („höchster Punkt gewinnt", wie das alte DSM) auf **1 m** herunter,
damit das Format byte-kompatibel bleibt und der Worker unverändert läuft.

## Dateien

- **`process_brandenburg_bdom.ipynb`** — Colab-Notebook für den **Bulk-Lauf** (ganz BB
  oder ein Bounding-Box-Ausschnitt), mit Resume (überspringt bereits auf R2 vorhandene
  Kacheln) und parallelem Upload.
- **`../scripts/bdom_to_bin.py`** — lokale Einzelkachel-Konvertierung (gleiche Logik),
  praktisch für Tests: `python3 scripts/bdom_to_bin.py <tileX> <tileY> [outdir]`.

## Voraussetzung: R2 S3-API-Token (nur für Colab)

Colab läuft auf einem Google-Rechner und muss die erzeugten Kacheln in **euer** R2
schreiben dürfen. Dafür braucht es maschinenlesbare Zugangsdaten (der Browser-Login
`wrangler login` geht in Colab nicht). R2 bietet dafür die S3-kompatible API.

**Token anlegen (2 Minuten, im Cloudflare-Dashboard — der Secret bleibt bei dir):**
1. Cloudflare-Dashboard → **R2** → **Manage R2 API Tokens** → **Create API Token**.
2. Permissions: **Object Read & Write**, beschränkt auf den Bucket `windrad-tiles`.
3. Du erhältst **Access Key ID** und **Secret Access Key** (Secret wird nur einmal
   angezeigt — kopieren).
4. In Colab links auf **🔑 Secrets** und drei Secrets anlegen (Notebook-Zugriff an):
   - `R2_ACCOUNT_ID` = deine Cloudflare-Account-ID
   - `R2_ACCESS_KEY_ID` = Access Key ID
   - `R2_SECRET_ACCESS_KEY` = Secret Access Key

> Hinweis: Der Token wurde bewusst **nicht** automatisiert erzeugt — ein dauerhafter
> Zugangsschlüssel gehört nur in deine Hand und nicht in Logs/Chatverläufe.

## Notebook ausführen

1. Token/Secrets wie oben anlegen.
2. Notebook in Colab öffnen, Zellen der Reihe nach ausführen.
3. **Erst testen:** im Konfig-Block `BBOX_KM` auf einen kleinen Ausschnitt setzen
   (z. B. `(458, 470, 5720, 5735)` für die Windrad-Region), Lauf prüfen.
4. Für ganz BB `BBOX_KM = None`. Bei Colab-Disconnect (nach ~12 h) einfach die
   Resume-Zelle + Run-Zelle erneut ausführen — Fertiges wird übersprungen.

**Maßstab ganz BB:** ~30k Kacheln, ~680 GB Download, ~60 GB `.bin` auf R2, mehrere
Colab-Sessions. R2-Ingress ist kostenlos; Speicher ~$0,015/GB/Monat.

## Validierung (bereits durchgeführt)

Die Pipeline wurde lokal (via `scripts/bdom_to_bin.py` + wrangler) end-to-end getestet:

- **Format/Qualität:** Kachel `459_5722` neu aus bDOM erzeugt und mit der alten
  ALS-Kachel verglichen: Mittelwerte 100,3 m vs. 99,9 m, mittlere Differenz **+0,43 m**,
  **92,6 %** der Zellen unter 3 m Abweichung, **100 % Abdeckung** (bDOM hat keine
  interpolierten Löcher).
- **End-to-End:** neue Kachel `468_5720` (bislang außerhalb der Abdeckung) erzeugt,
  nach R2 geladen — Worker `/v1/point` an `51.634629,14.544849`:
  vorher `OUT_OF_COVERAGE` → nachher `elevation: 128.07 m`. ✅

> Die Testkachel `468_5720` liegt jetzt zusätzlich auf R2 (harmlos, erweitert die
> Abdeckung). Bei Bedarf entfernbar mit
> `wrangler r2 object delete windrad-tiles/tile_468_5720.bin --remote` (und `.bin.gz`).
