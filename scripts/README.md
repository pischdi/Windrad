# Brandenburg LAZ → Binary Height Grid Pipeline

Lokale Entwicklungsumgebung für Neuhausen/Spree Höhendaten.

## Übersicht

Dieses Setup konvertiert LAZ-Dateien (LiDAR-Punktwolken) in kompakte Binary Height Grids für schnelle Höhenabfragen im Browser.

**Pipeline:**
1. LAZ-Datei → Python-Script → Binary Tiles (1000m × 1000m)
2. HTTP Server → Stellt Tiles bereit
3. Browser → Lädt Tiles on-demand

## Installation

### Dependencies installieren

```bash
pip install laspy numpy
```

**Hinweis:** Für LAZ-Unterstützung (komprimierte LAS-Dateien) wird `laszip` benötigt:

```bash
# macOS
brew install laszip

# oder mit pip
pip install laszip
```

## LAZ-Dateien besorgen

### Brandenburg Geoportal

1. Gehe zu: https://data.geobasis-bb.de
2. Navigiere zu: **Höhen → DOM (Digitales Oberflächenmodell) → LAZ**
3. Suche Kacheln für **Neuhausen/Spree** (ca. 51.67°N, 14.43°E)
4. Lade die entsprechenden LAZ-Dateien herunter (z.B. `dom_33401_5729.laz`)

**Koordinaten Neuhausen/Spree:**
- Latitude: 51.6724°N
- Longitude: 14.4354°E
- UTM Zone: 33N
- UTM Coordinates: ca. 401000 E, 5729000 N

**Hinweis:** Die Kachelnamen entsprechen den UTM-Koordinaten (in km):
- `dom_33401_5729.laz` = UTM 401km E, 5729km N

## Schritt 1: LAZ → Binary Konvertierung

```bash
# In das scripts-Verzeichnis wechseln
cd /Users/pischdi/Documents/Windrad/scripts

# LAZ-Datei konvertieren
python3 laz_to_binary.py path/to/dom_33401_5729.laz -o tiles

# Optionale Parameter:
# -s, --size: Tile-Größe in Metern (default: 1000)
# -r, --resolution: Grid-Auflösung in Metern (default: 1.0)
```

**Beispiel:**
```bash
python3 laz_to_binary.py ~/Downloads/dom_33401_5729.laz -o tiles
```

**Ausgabe:**
```
📂 Lade LAZ-Datei: ~/Downloads/dom_33401_5729.laz
   Punkte: 25,000,000
   Bounds: X=[401000.00, 402000.00]
   Bounds: Y=[5729000.00, 5730000.00]
   Bounds: Z=[45.00, 120.00]

🔲 Erstelle Tiles:
   Tile-Size: 1000m × 1000m
   Resolution: 1m
   Grid: 1000 × 1000 Punkte

   ✅ Tile 401_5729: 2000 KB → 479 KB (GZIP)

✨ Fertig! 1 Tiles erstellt in: tiles
```

Das Script erstellt:
- `tile_401_5729.bin` (~2 MB, unkomprimiert)
- `tile_401_5729.bin.gz` (~500 KB, komprimiert)

### Format

**Binary Height Grid:**
- Uint16 Array (1000 × 1000 Punkte)
- Höhe in Zentimetern (0-65535 = 0-655.35m)
- 1m Auflösung
- DSM: Digitales Oberflächenmodell (höchster Punkt pro Zelle)

**Koordinaten-Mapping:**
```
Tile-ID: tileX_tileY
tileX = floor(UTM_X / 1000)
tileY = floor(UTM_Y / 1000)

Lokale Koordinate innerhalb Tile:
localX = floor(UTM_X - tileX * 1000)  // 0-999
localY = floor(UTM_Y - tileY * 1000)  // 0-999

Array-Index:
index = localY * 1000 + localX

Höhe:
heightM = heights[index] / 100.0
```

## Schritt 2: Tile Server starten

```bash
# In das scripts-Verzeichnis wechseln
cd /Users/pischdi/Documents/Windrad/scripts

# Server starten (Port 8000)
python3 tile_server.py

# Optionaler Custom-Port:
python3 tile_server.py 8080
```

**Server läuft auf:**
```
http://localhost:8000
```

**Tile-Zugriff:**
```
http://localhost:8000/tiles/tile_401_5729.bin
```

Der Server unterstützt:
- ✅ CORS (für lokale Entwicklung)
- ✅ Automatisches GZIP für .gz Dateien
- ✅ Alle Dateitypen in tiles/

## Schritt 3: Web-App starten

Die Web-App lädt Tiles automatisch on-demand vom lokalen Server.

### Option A: VS Code Live Server

1. Installiere "Live Server" Extension
2. Rechtsklick auf `index.html` → "Open with Live Server"
3. Browser öffnet sich auf `http://127.0.0.1:5500`

### Option B: Python HTTP Server

```bash
# Im Windrad-Root-Verzeichnis
cd /Users/pischdi/Documents/Windrad
python3 -m http.server 8080
```

Browser: `http://localhost:8080`

**Wichtig:** Der Tile-Server muss parallel laufen (Port 8000)!

## Konfiguration

Die Tile-Server-URL ist in `js/elevation-service.js` konfiguriert:

```javascript
this.tileServerUrl = 'http://localhost:8000/tiles';
```

**Für Produktion ändern auf:**
```javascript
this.tileServerUrl = 'https://your-domain.com/tiles';
```

## Workflow

```
┌─────────────────────────────────────────────────────────┐
│ 1. LAZ-Dateien herunterladen (Brandenburg Geoportal)   │
│    → dom_33401_5729.laz, dom_33402_5729.laz, ...      │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Konvertierung mit laz_to_binary.py                  │
│    → tile_401_5729.bin, tile_402_5729.bin, ...        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Tile Server starten (tile_server.py)                │
│    → http://localhost:8000/tiles/                      │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Web-App starten (Live Server / Python Server)       │
│    → http://localhost:8080                             │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 5. App lädt Tiles on-demand für Sichtbarkeits-         │
│    berechnung zwischen User und Windrad                │
└─────────────────────────────────────────────────────────┘
```

## Testing

### Test 1: Tile Konvertierung

```bash
# Test mit einer LAZ-Datei
python3 laz_to_binary.py test.laz -o tiles

# Prüfe Output
ls -lh tiles/
# Sollte sehen: tile_X_Y.bin und tile_X_Y.bin.gz
```

### Test 2: Server

```bash
# Server starten
python3 tile_server.py

# In einem anderen Terminal:
curl -I http://localhost:8000/tiles/tile_401_5729.bin
# Sollte sehen: HTTP/1.0 200 OK
```

### Test 3: Web-App

1. Starte Tile Server (Port 8000)
2. Starte Web-App (Port 8080)
3. Öffne Browser: `http://localhost:8080`
4. Öffne Browser Console (F12)
5. Prüfe auf Fehler/Logs

**Erwartete Logs:**
```
[WINDRAD-AR] ElevationService initialized
[WINDRAD-AR] Loading tile: 401_5729
[WINDRAD-AR] Tile loaded: 401_5729 (2000 KB)
[WINDRAD-AR] Elevation @ (401500, 5729500): 78.45m
```

## Troubleshooting

### "Tile not found"

- Prüfe ob Tiles korrekt erstellt wurden: `ls tiles/`
- Prüfe Tile-Server läuft: `curl http://localhost:8000/tiles/`
- Prüfe Tile-Namen korrekt (tileX_tileY.bin)

### "CORS Error"

- Stelle sicher beide Server laufen (App + Tiles)
- tile_server.py sollte CORS-Header senden
- Prüfe Browser Console für Details

### "Invalid tile size"

- Binary-Datei ist beschädigt
- Neu konvertieren mit laz_to_binary.py

### "Kompass nicht verfügbar"

- Nur auf HTTPS oder localhost
- Gerät braucht Magnetometer
- iOS: Berechtigung in Settings → Safari → Motion & Orientation

## Production Deployment: Cloudflare R2

Für den Production-Einsatz empfehlen wir Cloudflare R2 für Tile-Hosting.

### Warum Cloudflare R2?

✅ **Kostenlos** bis 10 GB Storage
✅ **Keine Egress-Kosten** (im Gegensatz zu AWS S3)
✅ **Globales CDN** für schnelle Auslieferung
✅ **HTTPS** automatisch konfiguriert
✅ **CORS** einfach einstellbar

### Setup: Cloudflare R2

#### 1. R2 Bucket erstellen

```bash
# Wrangler CLI installieren
npm install -g wrangler

# Login zu Cloudflare
wrangler login

# Bucket erstellen
wrangler r2 bucket create windrad-tiles
```

**Oder via Web-Interface:**
1. https://dash.cloudflare.com → R2 → Create bucket
2. Name: `windrad-tiles`
3. Location: Western Europe
4. Public Access: Allow

#### 2. Tiles hochladen

**Option A: Mit Upload-Script (empfohlen)**

```bash
# Tiles aus Admin-Panel herunterladen
# → windrad-tiles.txt

# LAZ konvertieren (nur benötigte Tiles)
python3 laz_to_binary.py ~/Downloads/dom_33401_5729.laz \
  --tile-list windrad-tiles.txt \
  -o tiles

# Alle Tiles hochladen
./upload_to_r2.sh
```

**Option B: Manuell mit Wrangler**

```bash
# Einzelnes Tile
wrangler r2 object put windrad-tiles/tile_401_5729.bin \
  --file=tiles/tile_401_5729.bin

# Batch-Upload
for file in tiles/*.bin; do
  filename=$(basename "$file")
  wrangler r2 object put windrad-tiles/$filename --file=$file
done
```

**Option C: Web-Interface**

1. R2 Dashboard → windrad-tiles → Upload
2. Drag & Drop aller `.bin` Dateien

#### 3. Public Access konfigurieren

```bash
# R2 Dashboard → Settings → Public Access
# → Allow Access
# → Enable R2.dev subdomain
```

**Public URL Format:**
```
https://pub-abc123def456.r2.dev/tile_401_5729.bin
```

**Custom Domain (optional):**
```
https://tiles.ihre-domain.de/tile_401_5729.bin
```

#### 4. Code anpassen

In `js/elevation-service.js`:

```javascript
// Zeile 17-18 ändern:
this.tileServerUrl = 'https://pub-YOUR-BUCKET-ID.r2.dev';
```

Ihre Bucket-ID finden Sie:
- R2 Dashboard → windrad-tiles → Settings
- Public R2.dev bucket URL kopieren

#### 5. Testen

```bash
# Tile-URL testen
curl -I https://pub-YOUR-BUCKET-ID.r2.dev/tile_401_5729.bin
# Sollte: HTTP/2 200 OK

# Web-App testen
# → Öffne https://windrad-xxx.pages.dev
# → Wähle WKA → Prüfe Höhenprofil lädt ohne Warnung
```

### Workflow: Admin → LAZ → R2 → Production

```
┌─────────────────────────────────────────────────────────┐
│ 1. Admin-Panel: Windräder hinzufügen                   │
│    → Tile-Liste herunterladen (windrad-tiles.txt)     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. LAZ-Dateien besorgen (Brandenburg Geoportal)        │
│    → dom_33401_5729.laz, dom_33402_5729.laz, ...      │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Konvertieren (nur benötigte Tiles!)                 │
│    python3 laz_to_binary.py input.laz \                │
│      --tile-list windrad-tiles.txt                     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Upload zu Cloudflare R2                             │
│    ./upload_to_r2.sh                                   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Code-Update & Deployment                            │
│    git add js/elevation-service.js                     │
│    git commit -m "Update tile server URL"              │
│    git push                                            │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Live auf Cloudflare Pages                           │
│    https://windrad-xxx.pages.dev                       │
└─────────────────────────────────────────────────────────┘
```

### Kosten (Beispiel: 50 Tiles)

**Storage:**
- 50 Tiles × 500 KB = 25 MB
- Kosten: **€0.00** (Free Tier: 10 GB)

**Requests:**
- 1000 User/Monat × 50 Tiles = 50,000 Requests
- Kosten: **€0.00** (Free Tier: 10 Mio/Monat)

**Egress:**
- 1000 User × 25 MB = 25 GB Transfer
- Kosten: **€0.00** (R2 hat KEINE Egress-Kosten!)

**Total: €0.00/Monat** 🎉

### Vergleich: R2 vs. GitHub Pages vs. Lokaler Server

| Feature | Cloudflare R2 | GitHub Pages | Lokaler Server |
|---------|---------------|--------------|----------------|
| **Speed** | ~50ms (CDN) | ~300ms (EU) | Nur lokal |
| **Kosten** | €0 (10GB free) | €0 (1GB limit) | Eigene Infra |
| **Setup** | 10 Minuten | Nicht möglich* | 2 Minuten |
| **HTTPS** | ✅ Auto | ✅ Auto | ❌ Manual |
| **CORS** | ✅ Konfigurierbar | ❌ Eingeschränkt | ✅ Voll |
| **Egress** | ✅ Unlimited free | ⚠️ Soft limit | ❌ N/A |

*GitHub Pages kann keine Binary-Tiles hosten (max. 1GB, kein custom CORS)

## Nächste Schritte

### Für lokale Entwicklung

1. **Eine LAZ-Datei konvertieren:** Test-Tile erstellen
2. **Tile-Server starten:** `python3 tile_server.py`
3. **Web-App testen:** http://localhost:8080

### Für Production

1. **Cloudflare R2 Setup** (siehe oben)
2. **Tile-Liste generieren:** Admin-Panel → Download
3. **LAZ konvertieren:** Mit `--tile-list` Filter
4. **Upload zu R2:** `./upload_to_r2.sh`
5. **Deploy:** Code anpassen → Git push

### Für CODE-DE / EO-Lab Skalierung

Siehe separate Dokumentation für Cloud-basierte Verarbeitung:
- Jupyter Notebooks für Batch-Konvertierung
- S3-Storage für Tiles
- Lambda/Cloud Functions für On-Demand-Konvertierung

## Ressourcen

- **Brandenburg Geoportal:** https://geoportal.brandenburg.de
- **LAZ Download:** https://data.geobasis-bb.de
- **Laspy Docs:** https://laspy.readthedocs.io
- **UTM Koordinaten:** https://www.utm-koordinaten.de

## Lizenz

Brandenburg Geodaten: [Datenlizenz Deutschland – Namensnennung – Version 2.0](https://www.govdata.de/dl-de/by-2-0)
