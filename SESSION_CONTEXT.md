# Session Context - Windrad AR

**Für Claude Code Sessions: Lese diese Datei zu Beginn jeder neuen Session**

---

## ✅ Projekt-Status: PRODUKTIONSBEREIT

Alle Systeme sind vollständig eingerichtet und funktionsfähig.

---

## 🎯 Quick Reference

### Wichtige URLs
- **Production App:** https://windrad.pages.dev/
- **Admin Panel:** https://windrad.pages.dev/admin.html
- **R2 Tiles:** https://pub-a0c3ff1c12374435997e4d3bf4847b65.r2.dev/
- **Cloudflare Dashboard:** https://dash.cloudflare.com/975505fa80cf3d0f8e0c3b049e9c6112/r2/overview

### Wichtige Dateien
- **Projekt-Status:** [PROJECT_STATUS.md](PROJECT_STATUS.md) - Umfassende Dokumentation
- **README:** [README.md](README.md) - User-Dokumentation
- **Tech-Docs:** [scripts/README.md](scripts/README.md) - Pipeline-Dokumentation
- **Konfiguration:** [scripts/config.json](scripts/config.json) - Zentrale Config

### Windräder (4 aktiv)
| Name | Tile | Koordinaten |
|------|------|-------------|
| Test-Laubsdorf | 459_5722 | 51.6546°N, 14.4178°E |
| Acker | 460_5724 | 51.6711°N, 14.4319°E |
| Kathlow | 465_5734 | 51.7639°N, 14.4932°E |
| Richtung Roggosen | 462_5726 | 51.6905°N, 14.4519°E |

---

## 🚀 Häufige Tasks

### Neues Windrad hinzufügen
```bash
# 1. Admin-Panel öffnen, Windrad platzieren, speichern
# 2. Tile-Liste neu generieren
python3 scripts/generate_correct_tiles.py

# 3. Pipeline ausführen (Download → Convert → Upload)
./scripts/pipeline.sh --all

# 4. Deployen
git add . && git commit -m "Add new turbine" && git push
```

### Status checken
```bash
python3 scripts/monitor.py
```

### Tiles manuell hochladen
```bash
./scripts/upload_to_r2.sh
```

### Tile-Erreichbarkeit testen
```bash
curl -I https://pub-a0c3ff1c12374435997e4d3bf4847b65.r2.dev/tile_459_5722.bin.gz
# Sollte: HTTP/1.1 200 OK
```

---

## 📁 Verzeichnisstruktur

```
Windrad/
├── index.html              # Main app
├── admin.html             # Admin panel
├── windraeder.csv         # Turbine database
├── js/                    # JavaScript modules
│   ├── elevation-service.js  # Loads tiles from R2
│   └── ...
├── scripts/
│   ├── pipeline.sh          # Master automation ⭐
│   ├── monitor.py           # Status dashboard ⭐
│   ├── config.json          # Central config ⭐
│   ├── download_laz.py      # LAZ downloader
│   ├── laz_to_binary.py     # LAZ → Binary converter
│   └── upload_to_r2.sh      # R2 uploader
├── tiles/
│   └── windrad-tiles.txt    # Required tiles (141)
├── laz_downloads/           # 31 GB LAZ files (in .gitignore)
└── tiles_output/            # 446 MB binary tiles (in .gitignore)
```

---

## 🔧 System-Komponenten

### Frontend
- **Hosting:** Cloudflare Pages + GitHub Pages
- **Tech:** Vanilla JavaScript, Leaflet.js
- **APIs:** MediaDevices, Geolocation, DeviceOrientation

### Backend/Data
- **Tiles:** Cloudflare R2 (141 tiles, 0.4 GB)
- **Source:** Brandenburg ALS (Airborne Laser Scanning)
- **Format:** Binary Height Grid (Uint16, 1m resolution)

### Automation
- **Pipeline:** [pipeline.sh](scripts/pipeline.sh) - Download → Convert → Upload
- **Monitoring:** [monitor.py](scripts/monitor.py) - Live status dashboard
- **Config:** [config.json](scripts/config.json) - Central configuration

---

## ⚙️ Environment

### Python
- **venv:** `scripts/venv/` (created, activated with `source scripts/venv/bin/activate`)
- **Dependencies:** laspy, numpy, lazrs

### Node.js
- **npm:** Installed globally
- **wrangler:** Installed (`npm install -g wrangler`)
- **Login:** Already logged in to Cloudflare

### Git
- **Remote:** https://github.com/pischdi/Windrad.git
- **Branch:** main
- **Status:** Clean working directory

---

## 🐛 Troubleshooting

### Tiles nicht erreichbar (401/404)
```bash
# Prüfe Public Access in Cloudflare Dashboard
# Prüfe --remote flag in upload_to_r2.sh (Zeile 74)
```

### Pipeline schlägt fehl
```bash
# Check logs
cat scripts/pipeline.log

# Resume
./scripts/pipeline.sh --resume
```

### Konvertierung langsam
- Normal: ~30-40s pro Tile
- 141 Tiles: ~70-90 Minuten
- Monitor: `python3 scripts/monitor.py --watch`

---

## 📊 Aktuelle Daten

- **LAZ-Dateien:** 141 files, 31 GB (laz_downloads/)
- **Binary Tiles:** 141 files, 446 MB (tiles_output/)
- **R2 Upload:** ✅ Alle 141 Tiles erfolgreich
- **Public Access:** ✅ Funktioniert
- **Production URL:** ✅ Live

---

## 🎯 Nächste mögliche Schritte

1. Mehr Windräder in der Region hinzufügen
2. Custom Domain für R2 konfigurieren
3. GitHub Actions für automatische Pipeline
4. Mobile App mit React Native
5. Ganz Brandenburg abdecken

---

## 💡 Best Practices

1. **Vor großen Änderungen:** Lies PROJECT_STATUS.md
2. **Neue Windräder:** Immer pipeline.sh verwenden
3. **Testing:** Lokaler Server + curl für Tile-Tests
4. **Git:** Commit messages: "Add turbine: Name" oder "Update tiles"
5. **R2 Upload:** Immer mit --remote flag

---

**Letzte Aktualisierung:** 2026-02-15
**Session:** Vollautomatische Pipeline implementiert, 141 Tiles zu R2 hochgeladen
