# 🌬️ Windrad AR - Neuhausen/Spree

Web-basierte AR-Visualisierung für geplante Windkraftanlagen in der Gemeinde Neuhausen/Spree.

**Live-Demo:** https://pischdi.github.io/Windrad/

---

## 📱 **Für Bürger**

Nutzen Sie Ihr Smartphone, um geplante Windkraftanlagen direkt in Ihrer Umgebung zu visualisieren!

### **So funktioniert's:**

1. Öffnen Sie: **https://pischdi.github.io/Windrad/**
2. Wählen Sie einen Entfernungsfilter (5/10/20 km)
3. Erlauben Sie Kamera- und Standortzugriff
4. Richten Sie Ihr Handy zum Horizont
5. Das Windrad erscheint in der richtigen Richtung

### **QR-Code:**

```
Scannen Sie diesen Code mit Ihrer Kamera-App:
[Erstellen Sie einen QR-Code für: https://pischdi.github.io/Windrad/]
```

---

## 👨‍💼 **Für Administratoren**

### **Windräder bearbeiten:**

**Methode 1: Admin-Seite (Lokal)**

1. Öffnen Sie `admin.html` lokal im Browser
2. Passwort: `neuhausen2025`
3. Windräder hinzufügen/bearbeiten
4. **"CSV herunterladen"** klicken
5. Auf GitHub hochladen (siehe unten)

**Methode 2: Direkt auf GitHub**

1. Öffnen Sie [windraeder.csv](windraeder.csv)
2. Klicken Sie auf das Stift-Symbol (Edit)
3. Bearbeiten Sie die Daten
4. "Commit changes" klicken

---

## 📤 **CSV auf GitHub hochladen**

Nach dem Bearbeiten in `admin.html`:

1. **CSV herunterladen** (Button in Admin)
2. Öffnen Sie https://github.com/pischdi/Windrad
3. Klicken Sie auf `windraeder.csv`
4. Klicken Sie rechts auf das **Stift-Symbol** ✏️
5. Löschen Sie den alten Inhalt
6. Öffnen Sie die heruntergeladene CSV mit Editor
7. Kopieren Sie alles (Strg+A, Strg+C)
8. Fügen Sie auf GitHub ein (Strg+V)
9. Unten: **"Commit changes"** klicken
10. Fertig! Nach ~1 Minute überall verfügbar ✅

---

## 📝 **CSV-Format**

```csv
id,name,hubHeight,rotorDiameter,lat,lon
1769757500000,Windpark Nord,166,150,51.5833,14.2833
1769757600000,Windpark Süd,164,149,51.5700,14.2900
```

**Spalten:**
- `id`: Eindeutige ID (Unix-Timestamp)
- `name`: Name des Windparks
- `hubHeight`: Nabenhöhe in Metern
- `rotorDiameter`: Rotordurchmesser in Metern
- `lat`: Breitengrad (Latitude)
- `lon`: Längengrad (Longitude)

---

## 🛠️ **Technische Details**

### **Architektur:**

```
GitHub Repository (pischdi/Windrad)
├── index.html         → Viewer (AR-Ansicht für Bürger)
├── admin.html         → Admin (Windräder verwalten)
├── windraeder.csv     → Daten (automatisch geladen)
└── README.md          → Diese Anleitung
```

### **Datenfluss:**

```
Admin (lokal)
    ↓ Bearbeiten
CSV herunterladen
    ↓ Manuell hochladen
GitHub Repository
    ↓ GitHub Pages
https://pischdi.github.io/Windrad/
    ↓ Lädt CSV via Raw URL
https://raw.githubusercontent.com/pischdi/Windrad/main/windraeder.csv
    ↓ Zeigt an
Viewer (alle Geräte)
```

### **URLs:**

- **Viewer:** https://pischdi.github.io/Windrad/
- **Admin:** https://pischdi.github.io/Windrad/admin.html
- **CSV Raw:** https://raw.githubusercontent.com/pischdi/Windrad/main/windraeder.csv
- **Repository:** https://github.com/pischdi/Windrad

---

## 🔐 **Sicherheit**

### **Admin-Passwort ändern:**

Öffnen Sie `admin.html` in einem Texteditor und ändern Sie Zeile 290:

```javascript
const ADMIN_PASSWORD = 'dein_neues_passwort';  // Ändern Sie dies!
```

Speichern und auf GitHub hochladen.

### **Zugriffskontrolle:**

- ✅ **Viewer (index.html):** Öffentlich für alle Bürger
- 🔒 **Admin (admin.html):** Passwortgeschützt
- 📖 **CSV-Datei:** Öffentlich lesbar (notwendig für Viewer)
- 🔐 **GitHub Repository:** Nur Sie können bearbeiten

**Hinweis:** Die CSV-Datei MUSS öffentlich sein, damit der Viewer sie laden kann!

---

## 📱 **Browser-Kompatibilität**

### **Getestet mit:**

✅ **Chrome (Android)**
✅ **Safari (iOS)**
✅ **Samsung Internet**
✅ **Edge (Desktop/Mobile)**

### **Einschränkungen:**

❌ **Firefox Mobile:** Eingeschränkte AR-Funktionalität
❌ **Alte Browser:** Benötigt moderne Browser (ab 2020)

### **Anforderungen:**

- 📷 Kamera-Zugriff
- 📍 GPS/Standort-Zugriff
- 🧭 Bewegungssensoren (Kompass)
- 🌐 HTTPS (automatisch durch GitHub Pages)

---

## 🐛 **Fehlersuche**

### **Problem: "Keine Windrad-Daten gefunden"**

**Ursache:** CSV kann nicht geladen werden

**Lösung:**
1. Prüfen Sie: https://raw.githubusercontent.com/pischdi/Windrad/main/windraeder.csv
2. Sollte CSV-Inhalt zeigen
3. Falls 404: Datei fehlt → Hochladen
4. Falls Fehler: Datei beschädigt → Neu hochladen

### **Problem: "Berechtigung verweigert" (Kamera/GPS)**

**Lösung:**
1. Klicken Sie auf **Schloss-Symbol 🔒** in der Adressleiste
2. Ändern Sie "Kamera" und "Standort" auf **"Zulassen"**
3. Laden Sie die Seite neu (F5)
4. Erneut versuchen

### **Problem: "Windrad erscheint nicht"**

**Mögliche Ursachen:**
1. ❌ Nicht in richtige Richtung schauen → Langsam im Kreis drehen
2. ❌ GPS ungenau (±50m normal) → 30-60 Sekunden warten
3. ❌ Windrad zu weit weg → Filter auf "Alle anzeigen" ändern
4. ❌ Kompass nicht kalibriert → Handy in 8er-Bewegung

### **Problem: Admin-Seite fragt nicht nach Passwort**

**Ursache:** Browser hat Passwort gespeichert

**Lösung:** Inkognito-Modus verwenden

---

## 📊 **Statistiken**

- **Entwickelt für:** Gemeinde Neuhausen/Spree, Brandenburg
- **Hosting:** GitHub Pages (kostenlos)
- **Technologie:** HTML5, JavaScript, CSS3
- **AR-Engine:** Custom Canvas-basiertes Rendering
- **Karten:** OpenStreetMap + Leaflet

---

## 🔄 **Updates & Wartung**

### **Windräder aktualisieren:**

1. Bearbeiten Sie `windraeder.csv` (siehe oben)
2. Commit → Push
3. Warten Sie ~1 Minute
4. Automatisch auf allen Geräten verfügbar! ✅

### **Design ändern:**

1. Bearbeiten Sie `index.html` oder `admin.html`
2. Commit → Push
3. Warten Sie ~1 Minute
4. Änderungen sind live

### **Backup erstellen:**

```bash
# Gesamtes Repository klonen
git clone https://github.com/pischdi/Windrad.git

# Oder nur CSV herunterladen
curl https://raw.githubusercontent.com/pischdi/Windrad/main/windraeder.csv > backup.csv
```

---

## 📞 **Kontakt & Support**

**Für Bürger:**
- Bei technischen Problemen: Gemeinde Neuhausen/Spree kontaktieren
- Bei Fragen zu Windrädern: Gemeinderat

**Für Administratoren:**
- GitHub Issues: https://github.com/pischdi/Windrad/issues
- Dokumentation: Diese README

---

## 📄 **Lizenz**

Entwickelt für die Gemeinde Neuhausen/Spree zur Bürgerbeteiligung bei Windkraft-Projekten.

Frei verwendbar für Gemeinden und öffentliche Einrichtungen zur Windkraft-Visualisierung.

---

## 🎯 **Roadmap**

### **Geplante Features:**

- [ ] Multi-Windrad-Anzeige (mehrere gleichzeitig)
- [ ] Offline-Modus (Service Worker)
- [ ] Screenshots/Fotos mit AR-Overlay
- [ ] Vergleichsmodus (mit/ohne Windräder)
- [ ] Export für andere Gemeinden

### **Bereits implementiert:**

- [x] AR-Visualisierung mit Kamera
- [x] GPS-basierte Positionierung
- [x] Kompass-Integration
- [x] Entfernungsfilter
- [x] Mobile-optimiert
- [x] Admin-Interface
- [x] GitHub Pages Hosting
- [x] CSV-basierte Datenverwaltung

---

**Entwickelt für Gemeinderat Neuhausen/Spree**  
**Januar 2026 - GitHub Pages Edition**

🌍 **Live:** https://pischdi.github.io/Windrad/
