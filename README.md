# 🌬️ Windrad AR - Brandenburg

**Augmented Reality Visualisierung von Windkraftanlagen mit präziser Sichtbarkeitsberechnung**

Windrad AR ermöglicht es Bürgern in Brandenburg, geplante oder bestehende Windkraftanlagen (WKA) direkt in der realen Umgebung zu visualisieren. Die App nutzt Brandenburg's Digitales Oberflächenmodell (DOM) für präzise Line-of-Sight Berechnungen unter Berücksichtigung von Wäldern und Gebäuden.

## 📱 Features

### Für Nutzer

✅ **AR-Visualisierung** - WKA-Overlay direkt auf Kamera-Bild
✅ **Kompass-Navigation** - Automatische Ausrichtung zum WKA
✅ **Präzise Sichtbarkeit** - Berücksichtigt Wald, Gebäude und Gelände
✅ **Entfernungs-Info** - Distanz und Richtung zu jedem WKA
✅ **Höhenprofil** - Interaktive Geländedarstellung
✅ **Foto-Export** - Aufnahmen speichern und teilen

### Für Administratoren

✅ **WKA-Verwaltung** - Einfaches Hinzufügen/Löschen via Web-Interface
✅ **Kartenansicht** - Interaktive Platzierung auf Leaflet-Karte
✅ **Tile-Kalkulator** - Automatische Berechnung benötigter Höhendaten
✅ **CSV-Export** - Datenexport für GitHub-Deployment
✅ **WEA-Vorlagen** - Schnelles Ausfüllen für gängige Turbinen-Typen

## 🚀 Quick Start

### Für Nutzer

1. Öffne: **https://pischdi.github.io/Windrad/**
2. Erlaube GPS, Kamera und Kompass
3. Wähle ein Windrad aus der Liste
4. Navigiere zur perfekten Ausrichtung
5. Foto aufnehmen ✅

### Für Administratoren

1. Öffne: **https://pischdi.github.io/Windrad/admin.html**
2. Login: `neuhausen2025`
3. Klicke auf Karte → Position auswählen
4. Daten eingeben → Speichern
5. CSV herunterladen → Auf GitHub hochladen

## 📐 Technologie

### Frontend

- **Vanilla JavaScript** - Keine Framework-Dependencies
- **Leaflet.js** - Interaktive Karten
- **MediaDevices API** - Kamera-Zugriff
- **DeviceOrientation API** - Kompass/Magnetometer
- **Geolocation API** - GPS-Positionierung
- **Canvas API** - AR-Overlay Rendering

### Höhendaten

**Primär: Brandenburg DOM (DSM)**
- Digitales Oberflächenmodell
- Enthält Bäume, Gebäude, Infrastruktur
- 1m Auflösung
- Binary Height Grid Format (Uint16)
- ~500 KB pro Tile (1km × 1km)

**Fallback: OpenElevation (DTM)**
- Digitales Geländemodell
- Nur Terrain, keine Vegetation
- Kostenlos, unlimited API
- Warnung wird angezeigt

### Sichtbarkeitsberechnung

```
1. Hole Höhenprofil zwischen User ↔ WKA
2. Berechne Sichtlinie (Line of Sight)
3. Prüfe Hindernisse (Terrain, Wald, Gebäude)
4. Klassifiziere:
   - ✅ Sichtbar (>70%)
   - ⚠️ Teilweise sichtbar (10-70%)
   - ❌ Verdeckt (<10%)
```

## 🗂️ Projektstruktur

```
Windrad/
├── index.html                 # Haupt-App (User-Interface)
├── admin.html                 # Admin-Panel (WKA-Verwaltung)
├── README.md                  # Diese Datei
│
├── css/
│   └── styles.css             # UI-Styling
│
├── js/
│   ├── config.js              # Konfiguration & Settings
│   ├── app.js                 # Haupt-Anwendungslogik
│   ├── elevation-service.js   # Höhendaten-Service (DOM/OpenElevation)
│   ├── visibility-calculator.js  # Line-of-Sight Berechnung
│   ├── windrad-renderer.js    # AR-Overlay Rendering
│   ├── camera-controller.js   # Kamera & Kompass
│   └── map-manager.js         # Kartenansicht & WKA-Liste
│
├── data/
│   └── windraeder.csv         # WKA-Datenbank
│
├── scripts/
│   ├── README.md              # Setup-Anleitung für Höhendaten
│   ├── laz_to_binary.py       # LAZ → Binary Konverter
│   └── tile_server.py         # Lokaler Tile-Server
│
└── archive/                   # Alte/nicht mehr benötigte Dateien
```

## 🛠️ Setup & Deployment

### Lokale Entwicklung

```bash
# Repository clonen
git clone https://github.com/pischdi/Windrad.git
cd Windrad

# Mit Live Server öffnen (VS Code Extension)
# Oder:
python3 -m http.server 8080

# Browser: http://localhost:8080
```

### GitHub Pages Deployment

Bereits eingerichtet! Änderungen werden automatisch deployed:

```bash
git add .
git commit -m "Update WKA data"
git push

# Nach ~1 Minute live auf:
# https://pischdi.github.io/Windrad/
```

## 📦 Höhendaten-Setup

### Quick Start (für Tests)

Die App funktioniert sofort mit OpenElevation-Fallback (DTM ohne Wald/Gebäude).

### Production Setup (mit Brandenburg DOM)

Für präzise Sichtbarkeit mit Wald/Gebäuden:

**1. LAZ-Dateien herunterladen**

Quelle: https://data.geobasis-bb.de → DOM

**2. Konvertieren**

```bash
cd scripts
pip install laspy numpy

python3 laz_to_binary.py ~/Downloads/dom_33401_5729.laz -o tiles
```

**3. Tiles hosten**

**Option A: Lokaler Test**
```bash
python3 tile_server.py  # Port 8000
```

**Option B: Cloudflare R2** (empfohlen)
- Kostenlos bis 10 GB
- Schneller als GitHub
- Setup: https://dash.cloudflare.com/

**4. URL konfigurieren**

In `js/elevation-service.js`:
```javascript
this.tileServerUrl = 'https://windrad-tiles.r2.dev/tiles';
```

Details: [scripts/README.md](scripts/README.md)

## 📝 WKA-Verwaltung

### Neues WKA hinzufügen

**1. Admin-Panel öffnen**

https://pischdi.github.io/Windrad/admin.html

Login: `neuhausen2025`

**2. Position wählen**

- Klicke auf Karte
- Oder: Marker verschieben

**3. Daten eingeben**

- Name: z.B. "Windpark Neuhausen Nord"
- WEA-Typ wählen (auto-fills Specs)
- Oder manuell: Nabenhöhe & Rotordurchmesser

**4. Tile-Info prüfen**

Das System zeigt automatisch welche Höhendaten-Tiles benötigt werden:

```
Sichtbereich: 5 km Radius
Benötigte Tiles: 121

tile_400_5728.bin
tile_400_5729.bin
tile_401_5728.bin
...
```

**5. Speichern & Deployen**

- "Windrad speichern" klicken
- "CSV herunterladen"
- CSV auf GitHub hochladen (ersetzt alte `windraeder.csv`)
- Nach ~1 Minute live

### CSV-Format

```csv
id,name,hubHeight,rotorDiameter,lat,lon
1735123456789,Windpark Nord,166,150,51.6724,14.4354
```

**Felder:**
- `id`: Timestamp (wird automatisch generiert)
- `name`: WKA-Name (frei wählbar)
- `hubHeight`: Nabenhöhe in Metern
- `rotorDiameter`: Rotordurchmesser in Metern
- `lat`: Breitengrad (WGS84)
- `lon`: Längengrad (WGS84)

## 🎯 User-Anleitung

### Erste Schritte

**1. App öffnen**

https://pischdi.github.io/Windrad/

**2. Berechtigungen erteilen**

- 📍 Standort (GPS)
- 📷 Kamera
- 🧭 Kompass/Bewegung (iOS)

**3. WKA auswählen**

Liste zeigt alle WKAs sortiert nach Entfernung.

### Foto aufnehmen

**1. WKA auswählen**

Die App berechnet:
- Entfernung
- Richtung
- Sichtbarkeit (mit Geländeprofil)

**2. Kamera starten**

- Button "📷 Foto-Modus"
- Kompass zeigt Richtung an

**3. Ausrichten**

Drehe dich bis:
- Kompass zeigt ✓ Perfekt
- Grünes Signal

**4. Foto aufnehmen**

- Button drücken
- WKA-Overlay wird gerendert
- Foto anzeigen/speichern/teilen

### Sichtbarkeits-Status

**✅ Komplett sichtbar**
- WKA ist vom aktuellen Standort vollständig sichtbar
- Keine Hindernisse im Weg

**⚠️ Teilweise sichtbar**
- Nur oberer Teil des WKA ist sichtbar
- Gelände/Wald verdeckt unteren Teil
- Prozentangabe zeigt sichtbare Höhe

**❌ Nicht sichtbar**
- WKA wird durch Gelände verdeckt
- Ändern Sie den Standort

**⚠️ Ohne Wald-/Gebäudedaten**
- OpenElevation Fallback aktiv
- Sichtbarkeit unpräzise (nur Terrain)
- Administrator sollte DOM-Tiles bereitstellen

## 🔧 Konfiguration

### js/config.js

```javascript
CONFIG = {
    // Karten-Einstellungen
    MAP: {
        defaultLocation: { lat: 51.6724, lng: 14.4354 },
        zoom: 12
    },

    // Höhendaten
    ELEVATION: {
        samples: 50,        // Profil-Auflösung
        cacheEnabled: true, // Browser-Cache
        cacheDuration: 86400000  // 24h
    },

    // Sichtbarkeit
    VISIBILITY: {
        blockedThreshold: 10,    // <10% = blocked
        partialThreshold: 70,    // 10-70% = partial
        visibleThreshold: 70     // >70% = visible
    },

    // Kamera
    CAMERA: {
        targetThreshold: 10,  // ±10° = "perfekt"
        videoConstraints: {
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        }
    },

    DEBUG: false  // Detailliertes Logging
}
```

## 🌍 Erweiterung auf andere Regionen

### Brandenburg → Ganz Deutschland

**Schritt 1: Mehr Tiles**
- Download aller Brandenburg LAZ-Dateien
- Konvertierung mit `scripts/laz_to_binary.py`
- ~10.000 Tiles × 500 KB = ~5 GB

**Schritt 2: Cloud-Hosting**
- Cloudflare R2 oder AWS S3
- CDN für schnelle Auslieferung

**Schritt 3: CODE-DE/EO-Lab Skalierung**

Für ganz Deutschland:

1. **Jupyter Notebooks** auf EO-Lab
2. **Batch-Konvertierung** aller LAZ-Dateien
3. **S3-Storage** für Tiles
4. **Lambda Functions** für On-Demand-Konvertierung

### Andere Regionen (außerhalb Brandenburg)

Für Regionen ohne eigene DOM-Daten:

**Option 1: Copernicus DEM** (Europa, 10m)
- https://registry.opendata.aws/copernicus-dem/
- Kostenlos, EU-weit

**Option 2: OpenTopography** (weltweit)
- https://opentopography.org/
- Verschiedene DEM-Quellen

**Option 3: Lokale Geodaten**
- Vermessungsämter anfragen
- LIDAR-Daten

## 🤝 Mitwirken

### Bug-Reports

Issues auf GitHub: https://github.com/pischdi/Windrad/issues

### Pull Requests

1. Fork das Repository
2. Feature-Branch erstellen
3. Changes committen
4. Pull Request öffnen

### Lizenz

Brandenburg Geodaten: [Datenlizenz Deutschland – Namensnennung – Version 2.0](https://www.govdata.de/dl-de/by-2-0)

Code: MIT

## 📚 Ressourcen

### Geodaten

- **Brandenburg Geoportal:** https://geoportal.brandenburg.de
- **LAZ Download:** https://data.geobasis-bb.de
- **Metadaten:** https://metaver.de
- **INSPIRE Services:** https://isk.geobasis-bb.de/inspire

### APIs

- **OpenElevation:** https://api.open-elevation.com
- **Copernicus DEM:** https://registry.opendata.aws/copernicus-dem/

### Entwicklung

- **Leaflet.js:** https://leafletjs.com
- **Laspy (Python):** https://laspy.readthedocs.io
- **MDN Web APIs:** https://developer.mozilla.org

## 🎓 Hintergrund

Dieses Projekt entstand aus dem Bedarf, Bürgern in Brandenburg eine realistische Visualisierung geplanter Windkraftanlagen zu ermöglichen. Durch die Nutzung des Brandenburg DOM können präzise Sichtbarkeitsberechnungen durchgeführt werden, die Wälder, Gebäude und Geländestrukturen berücksichtigen.

**Technische Highlights:**
- Client-side AR ohne Server-Backend
- Effiziente Binary Tile-Encoding (~500 KB/km²)
- Automatischer Fallback für offline-Nutzung
- GitHub Pages Hosting (kostenlos)

**Entwickelt für:**
- Gemeinde Neuhausen/Spree
- Erweiterbar auf ganz Brandenburg
- Skalierbar auf ganz Deutschland

---

**Version:** 1.0.0  
**Zuletzt aktualisiert:** Februar 2026  
**Entwickelt mit:** Claude Sonnet 4.5
