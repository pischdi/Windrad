# Höhendaten der Bundesländer — Eignung für die Elevation-API

**Stand:** 2026-07-08 · Grundlage: Deep-Research (20 Claims verifiziert, 5 verworfen) +
eigene Live-Checks der Bulk-URLs.

Ziel: die Brandenburg-Pipeline (offenes DOM als GeoTIFF → 1-m-Kachel `tile_x_y.bin` →
R2 → Worker) auf weitere Länder ausweiten. „Leicht" = **offenes Raster-DOM (Oberfläche)
+ offene Lizenz + automatisierbarer Bulk-Zugang**.

## Übersicht

| Land | DOM (Oberfläche)? | Auflös. | Format | Lizenz | Bulk-Zugang | CRS | Eignung |
|------|-------------------|---------|--------|--------|-------------|-----|---------|
| Sachsen | ✅ DOM1 (+DGM1) | 1 m | GeoTIFF (2 km) | DL-DE/BY-2.0 | Batch-Download | **UTM33** | 🟢 leicht |
| NRW | ✅ DOM1 | 1 m | GeoTIFF | DL-DE/**Zero** | Bulk-Verzeichnis (live verifiziert) | UTM32 | 🟢 leicht |
| Sachsen-Anhalt | ✅ DOM1 + bDOM20 | 1 m / 0,2 m | GeoTIFF | DL-DE/BY / CC BY | Self-Service (Session-Limit) | UTM32 | 🟢 leicht |
| Baden-Württemberg | ✅ DOM1 + bDOM | 1 m / 0,2 m | GeoTIFF | DL-DE/BY-2.0 | opengeodata-Portal | UTM32 | 🟢–🟡 |
| Niedersachsen | ✅ bDOM20 | 0,2 m | COG-GeoTIFF | CC BY 4.0 | OpenGeoData-Portal | UTM32 | 🟡 |
| Schleswig-Holstein | ✅ bDOM | 0,2 m | GeoTIFF + LAZ | kostenfrei | Download-Client | UTM32 | 🟡 |
| Bayern | ⚠️ DGM1 sicher; DOM20 existiert | 1 m / 0,2 m | GeoTIFF | CC BY 4.0 | Metalink (DGM); DOM-URL offen | UTM32 | 🟡 |
| Hamburg | ❌ nur DGM1 (Boden) | 1 m | ASCII-XYZ | DL-DE/BY-2.0 | ATOM/WMS/Bulk | UTM32 | 🟡 |
| Bremen | ✅ DOM1/5 | 1 m | GeoTIFF | ⚠️ widersprüchlich (CC BY vs. NC-ND) | Portal | UTM32 | 🟠 klären |
| Berlin | ✅ DOM (unverifiziert) | 1 m | ATOM | ? | ATOM-Feed | UTM33 | 🟠 prüfen |
| Thüringen | ⚠️ DOM2/DOM5 (gröber, unsicher) | 2–5 m | ? | ? | GDI-Th | UTM32 | 🟠 prüfen |
| Hessen, MV, RLP, Saarland | ❔ nicht belegt | — | — | — | — | — | ⚪ Lücke |

## Wichtigster technischer Befund: zwei UTM-Zonen

- **Ost (UTM33 / EPSG:25833)** — wie Brandenburg: **Sachsen, Sachsen-Anhalt, Berlin, MV**.
  → gleiches Kachelraster, **kein Worker-Umbau nötig**.
- **West (UTM32 / EPSG:25832)**: NRW, Bayern, BW, Niedersachsen, SH, HB, HH, Hessen, RLP,
  Saarland. → anderes Gitter, braucht eine **Zonen-Strategie** (Kacheln pro Zone speichern,
  Worker wählt Zone nach Längengrad; z. B. Key-Präfix `z32/` bzw. `z33/`).

## Empfohlene Ausbau-Reihenfolge

1. **Phase 1 — UTM33-Nachbarn (kein Code-Umbau):** Sachsen zuerst, dann Sachsen-Anhalt,
   Berlin, MV. Nur Bulk-URL + Kachelschema im Konverter anpassen.
2. **Phase 2 — Zonen-Handling einbauen, dann West:** NRW als erster UTM32-Fall (bester
   Bulk-Zugang, große Reichweite, DL-DE/Zero) → löst einmalig die Zonen-Logik. Danach
   BW, Niedersachsen, Bayern (DOM20), SH.
3. **Phase 3 — Lücken/Klärung:** Bremen-Lizenz klären; Hessen, RLP, Saarland, Thüringen
   nachrecherchieren.

## Einschränkungen

- 7 Länder in der Recherche nicht bis zur Verifikation belegt (Berlin, Hessen, MV, NRW,
  RLP, Saarland, Thüringen) — **kein** Beleg für Nicht-Verfügbarkeit. NRW wurde separat
  per Live-Check bestätigt.
- Bestätigtes **Oberflächen**modell (DOM/bDOM) nur für NI, SH, SN, ST, BW (+NRW).
  Bayern/Hamburg (verifiziert) bislang nur DGM (Boden).
- Bremen-Lizenz vor kommerzieller Nutzung verbindlich klären.

## Quellen (Primär)

- NRW: https://www.opengeodata.nrw.de/produkte/geobasis/hm/dom1_tiff/dom1_tiff/
- Sachsen: https://www.geodaten.sachsen.de/downloadbereich-digitale-hoehenmodelle-4851.html
- Sachsen-Anhalt: https://www.lvermgeo.sachsen-anhalt.de/de/gdp-dom-bdom-lsa.html
- Baden-Württemberg: https://opengeodata.lgl-bw.de/
- Niedersachsen: https://opengeodata.lgln.niedersachsen.de/
- Schleswig-Holstein: https://www.schleswig-holstein.de/DE/…/geodatenService_Geobasisdaten_DGM.html
- Bayern DGM1 (Metalink): https://geodaten.bayern.de/odd/a/dgm/dgm1/meta/metalink/09.meta4
- Brandenburg (Referenz, genutzt): https://data.geobasis-bb.de/geobasis/daten/bdom/tif/
