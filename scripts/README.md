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

## Nächste Schritte

### Für Produktion

1. **Mehr Tiles erstellen:** Alle LAZ-Dateien für Brandenburg konvertieren
2. **Cloud-Hosting:** Tiles auf CDN hochladen (z.B. Cloudflare, AWS S3)
3. **HTTPS:** Production-Server mit SSL-Zertifikat
4. **Caching:** Browser-Cache + Service Worker für Offline-Support

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
