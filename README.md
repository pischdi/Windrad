# 🌬️ Windrad AR mit Brandenburg DOM

Augmented Reality Visualisierung von Windrädern mit **Brandenburg Digitales Oberflächenmodell (DOM)** Integration.

---

## ✨ FEATURES

### 🗻 **Brandenburg Oberflächenmodell**
- ✅ **KOSTENLOS** (Open Data Brandenburg)
- ✅ **MIT Bäumen & Gebäuden** (nicht nur Gelände!)
- ✅ **1m Auflösung** via WMS
- ✅ **0.2m Auflösung** möglich (LAZ Download)
- ✅ **Fallback** auf OpenElevation (unbegrenzt & kostenlos)

### 📊 **Sichtbarkeitsanalyse**
- 🔍 **Höhenprofil** zwischen User und Windrad
- 🌲 **Vegetation-Erkennung** (Wälder, Bäume)
- 🏠 **Gebäude-Erkennung** (Häuser, Strukturen)
- ⛰️ **Gelände-Verdeckung** (Hügel, Berge)
- 📈 **Visuelles Profil** (Canvas-Grafik)

### 🎨 **3D Windrad Rendering**
- 🌬️ **Realistische Darstellung** (Turm, Gondel, Rotor)
- ⚠️ **Teilweise Sichtbarkeit** (nur sichtbarer Teil)
- ❌ **Vollständig verdeckt** (Warnung)
- 📸 **Foto-Export** mit Overlay

### 🗺️ **Interaktive Karte**
- 📍 **GPS-Lokalisierung**
- 🎯 **Windrad-Auswahl**
- 📏 **Entfernungen & Richtungen**
- 🔗 **Sichtlinie** zwischen User & Windrad

### 📱 **Mobile-Optimiert**
- 📸 **Kamera-Integration**
- 🧭 **Kompass-Navigation**
- ✓ **Perfekte Ausrichtung** (Echtzeit-Feedback)
- 💾 **Foto-Download**

---

## 📦 INSTALLATION

### **Option 1: GitHub Pages (Empfohlen)**

```bash
# 1. Repository clonen
git clone https://github.com/pischdi/Windrad.git
cd Windrad

# 2. Projekt-Dateien kopieren
cp -r windrad-ar-elevation/* .

# 3. GitHub Pages aktivieren
# Settings → Pages → Source: main branch

# 4. Öffnen
https://pischdi.github.io/index.html
```

### **Option 2: Lokaler Server**

```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx http-server -p 8000

# PHP
php -S localhost:8000
```

Dann öffnen: `http://localhost:8000`

---

## 📂 PROJEKT-STRUKTUR

```
windrad-ar-elevation/
├── 📄 index.html                      # Haupt-HTML
├── 📁 css/
│   └── styles.css                     # Alle Styles
├── 📁 js/
│   ├── config.js                      # Konfiguration
│   ├── elevation-service.js           # Brandenburg DOM Service
│   ├── visibility-calculator.js      # Sichtbarkeits-Logik
│   ├── map-manager.js                 # Leaflet Map
│   ├── windrad-renderer.js            # 3D Rendering
│   ├── camera-controller.js           # Kamera/Kompass
│   └── app.js                         # Main Application
└── 📄 README.md                       # Diese Datei
```

---

## ⚙️ KONFIGURATION

### **js/config.js**

```javascript
const CONFIG = {
    // Brandenburg DOM WMS
    BRANDENBURG_DOM: {
        wmsUrl: 'https://isk.geobasis-bb.de/mapproxy/dop20c/service/wms',
        layer: 'by_dop20c',
        fallbackUrl: 'https://api.open-elevation.com/api/v1/lookup'
    },
    
    // CSV Windräder
    CSV_URL: 'https://raw.githubusercontent.com/pischdi/Windrad/main/windraeder.csv',
    
    // Elevation Settings
    ELEVATION: {
        samples: 20,              // Anzahl Messpunkte
        cacheEnabled: true,       // localStorage Cache
        cacheDuration: 86400000   // 24 Stunden
    },
    
    // Map Settings
    MAP: {
        defaultLocation: { lat: 51.6724, lng: 14.4354 }, // Neuhausen
        defaultZoom: 13
    }
};
```

---

## 🚀 VERWENDUNG

### **1. Windrad Auswählen**
- Karte öffnen
- Windrad auf Karte anklicken ODER
- Windrad aus Liste wählen

### **2. Sichtbarkeit Prüfen**
- Automatische Analyse startet
- Höhenprofil wird angezeigt
- Sichtbarkeits-Status erscheint

### **3. Foto Aufnehmen**
- "📸 Foto aufnehmen" klicken
- Kamera ausrichten (folge Pfeilen)
- Bei "Perfekt!" → Aufnehmen
- Foto wird mit Windrad-Overlay gespeichert

---

## 🔧 TECHNISCHE DETAILS

### **Brandenburg DOM Integration**

```javascript
// Elevation Service nutzt Brandenburg WMS
const profile = await elevationService.getProfile(
    userLat, userLon,
    turbineLat, turbineLon,
    20 // Samples
);

// Fallback auf OpenElevation bei Fehler
// Kostenlos, unbegrenzt, weltweit verfügbar
```

### **Sichtbarkeits-Algorithmus**

```javascript
// 1. Sichtlinie berechnen
const sightLineSlope = (turbineTop - userEye) / distance;

// 2. Jeden Geländepunkt prüfen
for (point of profile) {
    const expectedHeight = userEye + (sightLineSlope * point.distance);
    if (point.elevation > expectedHeight) {
        // Verdeckt!
        blocked = true;
    }
}

// 3. Sichtbare Höhe berechnen
visibleHeight = totalHeight - blockedHeight;
visiblePercent = (visibleHeight / totalHeight) * 100;
```

### **3D Rendering**

```javascript
// Windrad mit Perspektive zeichnen
const pixelHeight = (visibleHeight / distanceMeters) * 500;

// Nur sichtbaren Teil rendern
if (status === 'partial') {
    drawFromTop(visibleHeight);
} else if (status === 'blocked') {
    showBlockedMessage();
} else {
    drawCompleteTurbine();
}
```

---

## 💡 OPTIMIERUNGEN

### **Performance**

```javascript
// 1. localStorage Cache
// Elevation-Profile werden 24h gecacht

// 2. Lazy Loading
// Nur aktive Windräder werden berechnet

// 3. Debouncing
// Kompass-Updates gedrosselt
```

### **Datenquellen**

```
Primary:   Brandenburg DOM WMS (1m, kostenlos)
Fallback:  OpenElevation API (30m, kostenlos)
Future:    LAZ Download (0.2m, offline)
```

---

## 📈 FEATURE ROADMAP

### **Phase 2: Advanced DOM**
- [ ] LAZ-Download für 0.2m Auflösung
- [ ] Offline-Modus mit lokalem DOM
- [ ] CloudCompare Integration
- [ ] Baumhöhen-Analyse

### **Phase 3: Multi-Platform**
- [ ] iOS App (Swift)
- [ ] Android App (Kotlin)
- [ ] Desktop App (Electron)

### **Phase 4: Social Features**
- [ ] Foto-Galerie
- [ ] Community-Sharing
- [ ] Kommentare & Bewertungen

---

## 🐛 TROUBLESHOOTING

### **Kamera startet nicht**
```
Problem: "Kamera konnte nicht gestartet werden"
Lösung:  
1. HTTPS erforderlich (GitHub Pages ✓)
2. Kamera-Berechtigung erteilen
3. Browser-Kompatibilität prüfen
```

### **Kompass funktioniert nicht**
```
Problem: Richtungs-Anzeige bleibt bei "--°"
Lösung:
1. Kompass-Berechtigung erteilen (iOS)
2. Gerät kalibrieren (8er-Bewegung)
3. Im Freien testen (Magnetfeld)
```

### **Elevation API Fehler**
```
Problem: "Brandenburg WMS failed"
Lösung: Automatischer Fallback auf OpenElevation
Info: Beide Services kostenlos & unbegrenzt
```

### **GPS ungenau**
```
Problem: Falsche Position auf Karte
Lösung:
1. GPS aktivieren
2. Im Freien testen (kein Gebäude)
3. Standort-Berechtigung prüfen
```

---

## 📞 SUPPORT

**GitHub Issues:** https://github.com/pischdi/Windrad/issues
**E-Mail:** [Deine E-Mail]

---

## 📜 LIZENZ

**MIT License**

Dieses Projekt nutzt:
- **OpenStreetMap** (ODbL)
- **OpenTopoMap** (CC-BY-SA)
- **Brandenburg Open Data** (Datenlizenz Deutschland)
- **Leaflet** (BSD-2-Clause)
- **OpenElevation** (Public Domain)

---

## 🙏 CREDITS

- **LGB Brandenburg** - Digitales Oberflächenmodell (DOM)
- **OpenStreetMap Contributors**
- **OpenTopoMap Team**
- **OpenElevation Project**
- **Leaflet.js Team**

---

**Made with ❤️ in Brandenburg**
