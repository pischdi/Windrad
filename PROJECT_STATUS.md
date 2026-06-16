# Windrad AR - Project Status

**Letzte Aktualisierung:** 2026-06-16

## ✅ Projekt-Status: PRODUKTIONSBEREIT (Kern) + KI-Foto-Analyse (Beta)

Kern-App (Höhendaten, Sichtbarkeit, AR-Overlay) ist produktiv.
Neu hinzugekommen: KI-gestützte Foto-Analyse via Cloudflare Worker + Gemini Vision (Beta).

---

## 🤖 KI-Foto-Analyse (Cloudflare Worker + Gemini Vision)

- **Worker:** `worker/index.js` — analysiert ein Kamerafoto mit `gemini-2.5-flash`
  und liefert Szenendaten (Horizont, Vordergrund-Objekte, empfohlene Turbinen-Position/-Größe,
  Verdeckung, Lichtverhältnisse) als JSON zurück.
- **Endpoint:** `POST https://windrad-ai-worker.pischdi.workers.dev/api/enhance-photo`
  - Body: `{ image: <dataURL>, metadata: { turbine, camera } }`
  - Zusätzlich: `GET /api/list-models` (Debug, listet verfügbare Gemini-Modelle)
- **Frontend:** `index.html` komprimiert das Bild, ruft den Worker (60s Timeout) und
  rendert das Windrad anhand der Szenendaten neu; AI-Panel zeigt Confidence/Objekte/Horizont/Sichtbarkeit.
- **Secret:** `GEMINI_API_KEY` muss im Worker gesetzt sein (`wrangler secret put GEMINI_API_KEY`).
- **Deploy:** `cd worker && wrangler login && wrangler deploy`

---

## 🎯 Übersicht

**Windrad AR** ist eine webbasierte AR-Anwendung zur Visualisierung von Windkraftanlagen in Brandenburg.

- **4 Windräder** erfasst (Neuhausen/Spree Region)
- **141 Höhendaten-Tiles** konvertiert und auf Cloudflare R2 gehostet
- **Vollautomatische Pipeline** für zukünftige Updates

---

## 📊 Aktuelle Daten

### Windkraftanlagen

| Name | Koordinaten | Nabe | Rotor | Tile |
|------|-------------|------|-------|------|
| Test-Laubsdorf | 51.6546°N, 14.4178°E | 166m | 150m | 459_5722 |
| Acker | 51.6711°N, 14.4319°E | 166m | 150m | 460_5724 |
| Kathlow | 51.7639°N, 14.4932°E | 250m | 200m | 465_5734 |
| Richtung Roggosen | 51.6905°N, 14.4519°E | 165m | 170m | 462_5726 |

### Höhendaten

- **Quelle:** Brandenburg Geoportal (Airborne Laser Scanning)
- **Format:** LAZ → Binary Height Grid (1000m × 1000m, 1m Auflösung)
- **Tiles gesamt:** 141
- **Größe:** 0.4 GB (GZIP komprimiert)
- **Hosting:** Cloudflare R2
- **Public URL:** https://pub-a0c3ff1c12374435997e4d3bf4847b65.r2.dev/

---

## 🚀 Deployment-Status

### Cloudflare R2
- ✅ Bucket: `windrad-tiles`
- ✅ Public Access: Aktiviert
- ✅ CORS: Konfiguriert
- ✅ 141 Tiles hochgeladen
- ✅ Öffentlich erreichbar

### Cloudflare Pages
- ✅ Repository: GitHub
- ✅ Auto-Deploy: Aktiviert
- ✅ Production URL: https://windrad.pages.dev

---

## 🛠️ Automatisierungs-Pipeline

### Verfügbare Scripts

```bash
# Komplette Pipeline (Download → Convert → Upload)
./scripts/pipeline.sh --all

# Status überwachen
python3 scripts/monitor.py
python3 scripts/monitor.py --watch  # Live-Updates

# Einzelne Schritte
./scripts/pipeline.sh --download
./scripts/pipeline.sh --convert
./scripts/pipeline.sh --upload
```

### Konfiguration

Zentrale Konfiguration in: `scripts/config.json`

```json
{
  "paths": {
    "tile_list": "../tiles/windrad-tiles.txt",
    "laz_downloads": "../laz_downloads",
    "tiles_output": "../tiles_output"
  },
  "upload": {
    "bucket_name": "windrad-tiles",
    "r2_url": "https://pub-a0c3ff1c12374435997e4d3bf4847b65.r2.dev"
  }
}
```

---

## 📁 Verzeichnisstruktur

```
Windrad/
├── index.html              # Haupt-App
├── admin.html             # Admin-Panel (Windräder verwalten)
├── windraeder.csv         # Windrad-Datenbank
├── js/
│   ├── elevation-service.js  # Höhendaten-Loader (nutzt R2)
│   └── ...
├── scripts/
│   ├── pipeline.sh          # Master-Automation ⭐
│   ├── monitor.py           # Status-Dashboard ⭐
│   ├── download_laz.py      # LAZ-Download
│   ├── laz_to_binary.py     # LAZ → Binary Konverter
│   ├── upload_to_r2.sh      # R2 Upload
│   ├── config.json          # Zentrale Config ⭐
│   └── README.md            # Technische Dokumentation
├── tiles/
│   └── windrad-tiles.txt    # Liste benötigter Tiles (141)
├── laz_downloads/           # Brandenburg LAZ-Dateien (30 GB)
└── tiles_output/            # Konvertierte Binary Tiles (0.4 GB)
```

---

## 🔄 Workflow: Neue Windräder hinzufügen

### 1. Windrad im Admin-Panel hinzufügen
- Öffne `admin.html`
- Klicke auf Karte, um Windrad zu platzieren
- Gib Details ein (Name, Höhe, Rotordurchmesser)
- Speichern

### 2. Tile-Liste neu generieren
```bash
python3 scripts/generate_correct_tiles.py
```

### 3. Pipeline ausführen
```bash
# Komplette Pipeline
./scripts/pipeline.sh --all

# Oder nur die neuen Tiles
./scripts/pipeline.sh --download --convert --upload
```

### 4. Deploy
```bash
git add .
git commit -m "Add new wind turbine: [Name]"
git push
```

Cloudflare Pages deployt automatisch.

---

## 🧪 Testing

### Tile-Erreichbarkeit testen
```bash
curl -I https://pub-a0c3ff1c12374435997e4d3bf4847b65.r2.dev/tile_459_5722.bin.gz
# Sollte: HTTP/1.1 200 OK
```

### App lokal testen
```bash
# HTTP Server starten
python3 -m http.server 8080

# Öffne http://localhost:8080
```

### Produktions-App testen
1. Öffne Production URL
2. Wähle Windrad
3. Prüfe: Höhenprofil lädt ohne Warnung
4. Prüfe: Keine "Using fallback" Meldungen in Console

---

## 📈 Performance

- **Tile-Größe:** ~3 MB (unkomprimiert) → ~500 KB (GZIP)
- **Ladezeit:** ~50-100ms (Cloudflare CDN)
- **Cache:** Browser localStorage (persistent)
- **Fallback:** OpenElevation API (wenn Tile fehlt)

---

## 🔧 Troubleshooting

### Tiles laden nicht (404)
```bash
# Prüfe R2 Bucket
wrangler r2 object get windrad-tiles/tile_459_5722.bin.gz --file=/tmp/test.bin.gz --remote

# Prüfe Public Access
curl -I https://pub-a0c3ff1c12374435997e4d3bf4847b65.r2.dev/tile_459_5722.bin.gz
```

### Konvertierung schlägt fehl
```bash
# Prüfe venv
source scripts/venv/bin/activate
pip list | grep laspy

# Neu installieren falls nötig
pip install laspy numpy lazrs
```

### Upload schlägt fehl
```bash
# Prüfe Wrangler Login
wrangler whoami

# Neu einloggen
wrangler login
```

---

## 📝 Wichtige URLs

- **R2 Tiles:** https://pub-a0c3ff1c12374435997e4d3bf4847b65.r2.dev/
- **Brandenburg Geoportal:** https://data.geobasis-bb.de/geobasis/daten/als/laz/
- **Cloudflare Dashboard:** https://dash.cloudflare.com/975505fa80cf3d0f8e0c3b049e9c6112/r2/overview

---

## 🎓 Nächste Schritte

### Kurzfristig
- [ ] Custom Domain für R2 konfigurieren (optional)
- [ ] Mehr Windräder hinzufügen
- [ ] A/B Test mit echten Benutzern

### Mittelfristig
- [ ] GitHub Actions für automatische Pipeline
- [ ] Webhook von admin.html zu Pipeline
- [ ] Delta-Sync (nur geänderte Tiles uploaden)

### Langfristig
- [ ] Ganz Brandenburg abdecken
- [ ] On-Demand Tile-Generierung (Lambda/Workers)
- [ ] Mobile App (React Native)

---

## 📚 Dokumentation

- **README.md:** Technische Dokumentation
- **scripts/README.md:** Pipeline-Dokumentation
- Dieser File: Projekt-Status und Quick Reference

---

## 🏆 Achievements

- ✅ Vollautomatische Pipeline implementiert
- ✅ 141 Tiles erfolgreich zu R2 hochgeladen
- ✅ Produktionsreife Infrastruktur
- ✅ Monitoring und Logging
- ✅ Umfassende Dokumentation

**Status:** Produktionsbereit! 🚀
