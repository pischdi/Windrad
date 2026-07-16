# Höhendaten der Bundesländer — Eignung für die Elevation-API

**Stand:** 2026-07-13 · Grundlage: 4 parallele Recherche-Agenten (alle 16 Länder + Bund/BKG/Copernicus live verifiziert), aufbauend auf der Deep-Research vom 2026-07-08.

Ziel: die Brandenburg-Pipeline (offenes DOM als GeoTIFF → 1-m-Kachel `tile_x_y.bin` → R2 →
Worker) bundesweit ausweiten. „Leicht" = **offenes Raster-DOM (Oberfläche) + offene Lizenz +
automatisierbarer Bulk-Zugang**. Für Sichtverbindungen zählt die **Oberfläche** (DOM/bDOM,
inkl. Bäume/Gebäude) — reines DGM (Boden) genügt nicht.

## Gesamtübersicht (16 Länder)

| Land | DOM/bDOM (Auflös.) | Format | Lizenz | Bulk-Zugang | CRS | Eignung |
|------|--------------------|--------|--------|-------------|-----|---------|
| Brandenburg | bDOM 1 m (Referenz) | GeoTIFF (zip) | DL-DE/Zero | Verzeichnis (live) | **UTM33** | 🟢 |
| Sachsen | DOM1 1 m | GeoTIFF (2 km, zip) | DL-DE/Zero | Batch-Download | **UTM33** | 🟢 |
| Berlin | DOM1 + bDOM1 (1 m) | GeoTIFF + GML | DL-DE/Zero | ATOM (2 km) | **UTM33** | 🟢 |
| Mecklenburg-Vorp. | DOM 1 m + bDOM 0,2 m | GeoTIFF / LAZ | offen (o. Bed.) | Portal + ATOM + WCS | **UTM33** | 🟢 |
| Sachsen-Anhalt | DOM1 1 m + bDOM 0,2 m | GeoTIFF (LZW) | DL-DE/BY | Open-Data-Portal | UTM32 | 🟢 |
| Thüringen | DOM1 1 m + bDOM | GeoTIFF (1 km) | DL-DE/BY | DLA-Client + ATOM | UTM32 | 🟢 |
| NRW | DOM1 1 m | GeoTIFF (float) | DL-DE/Zero | Verzeichnis + `index.json` | UTM32 | 🟢 (bester Bulk) |
| Niedersachsen | bDOM 0,2 m + DOM1 | COG-GeoTIFF | CC BY 4.0 | ArcGIS-Hub/API + ATOM | UTM32 | 🟢 |
| Bayern | DOM20 0,2 m (bildbasiert) | GeoTIFF (1 km) | CC BY 4.0 | Metalink `.meta4` (aria2c) | UTM32 | 🟢 |
| Baden-Württemberg | DOM1 1 m | GeoTIFF (2 km) | DL-DE/BY | Open-GeoData-Portal + OGC-API | UTM32 | 🟢 |
| Rheinland-Pfalz | bDOM 0,2 m + DOM | GeoTIFF (2 km) | DL-DE/BY | GeoShop + INSPIRE-ATOM | UTM32 | 🟢 |
| Schleswig-Holstein | bDOM 0,2 m | GeoTIFF + LAZ | CC BY 4.0 | Download-Client (GeoJSON-Index) | UTM32 | 🟢 |
| Hessen | DOM1 1 m | GeoTIFF (float) | DL-DE/Zero | Intershop-Downloadcenter + ATOM/WFS | UTM32 | 🟡 Zugang umständlich |
| Bremen | DOM 1 m/5 m | GeoTIFF (+TFW) | CC BY 4.0 | GeoPortal/MetaVer (ATOM schwach dok.) | UTM32 | 🟡 Bulk klären |
| Saarland | DOM1 (2025) | ⚠️ GeoTIFF **oder** XYZ (unbestätigt) | DL-DE/BY | GeoPortal + ATOM | UTM32 | 🟡 Format prüfen |
| **Hamburg** | **❌ kein DOM** (nur DGM1 Boden) | ASCII-XYZ | DL-DE/BY | Transparenzportal + WMS | UTM32 | ⚪ **Problemfall** |

**Bilanz:** 12× 🟢 offen & automatisierbar, 3× 🟡 (offen, aber Zugang/Format-Haken), 1× ⚪ (Hamburg — kein Oberflächenmodell).

## Bundesweite Quellen (kein Ersatz für die Länder-Portale)

- **BKG DGM1** (Boden, 1 m): ✅ offen (DL-DE/Zero), GeoTIFF, bundesweit einheitlich —
  `https://daten.gdz.bkg.bund.de/produkte/dgm/dgm1/aktuell/`. **Nur Gelände, keine Bäume/Gebäude** → als lückenlose Boden-Referenz nutzbar, aber nicht für Verdeckung durch Bewuchs/Bebauung.
- **BKG DOM1** (Oberfläche): ❌ **nicht offen** — Vertrieb nach AdV-Gebührenrichtlinie, ~8.000 €.
- **Copernicus GLO-30** (30 m, DSM/Oberfläche): frei, weltweit — aber **30 m zu grob** für einzelne Türme/Bäume. Nur Notnagel für Regionen ganz ohne offenes DOM.
- **Fazit:** Es gibt **kein bundesweites offenes DOM**; die Länder-bDOM/DOM1-Portale bleiben maßgeblich.

## Technischer Kernbefund: zwei UTM-Zonen

- **UTM33 / EPSG:25833** (wie Brandenburg): **Sachsen, Berlin, Mecklenburg-Vorpommern**. → gleiches Kachelraster, kein Umbau.
- **UTM32 / EPSG:25832**: alle übrigen (Sachsen-Anhalt, Thüringen, NRW, NI, BY, BW, RLP, SH, HE, HB, SL, HH). → **Korrektur ggü. 07-08: Sachsen-Anhalt ist UTM32, nicht UTM33.**
- Der Multi-UTM-Worker (Commit `fd80a5d`) deckt beide Zonen ab.

## Empfohlene Ausbau-Reihenfolge

1. **UTM33 zuerst (kein Code-Umbau):** Sachsen → Berlin → Mecklenburg-Vorpommern. Nur Bulk-URL + Kachelschema im Konverter.
2. **UTM32 (Worker kann's schon):** NRW zuerst (bester Bulk via `index.json`), dann Bayern (meta4), BW, RLP, Niedersachsen, SH, Sachsen-Anhalt, Thüringen.
3. **🟡-Fälle:** Hessen (Intershop-Automatisierung), Bremen (ATOM-Mechanismus klären), Saarland (Format verifizieren — siehe Anfrage).
4. **⚪ Hamburg:** kein offenes DOM → Anfrage an LGV Hamburg (Kontakt/Email im Drive-Doc „Anfrage Hoehendaten – Problemfaelle & Kontakte"). Übergangsweise BKG-DGM1 (nur Boden) oder Copernicus.

## Problemfälle & Anfragen

- **Hamburg (⚪):** LGV Hamburg, Geobasisdaten-Hotline **+49 40 42826-5720**, `geobasisdaten@gv.hamburg.de`.
- **Saarland (🟡, nur Format):** LVGL Saarland, **+49 681 9712-03**, `poststelle@lvgl.saarland.de`.
- Fertige Anfrage-Emails + Vorlage: Google Drive → LOS-Test → „Anfrage Hoehendaten – Problemfaelle & Kontakte (final)".

## Quellen (Primär)

- Brandenburg: https://data.geobasis-bb.de/geobasis/daten/bdom/tif/
- Sachsen: https://www.geodaten.sachsen.de/batch-download-4719.html
- Sachsen-Anhalt: https://www.lvermgeo.sachsen-anhalt.de/de/gdp-dom-bdom-lsa.html
- Thüringen: https://geoportal.geoportal-th.de/gaialight-th/_apps/dladownload/dl-dhm.html
- Berlin: https://gdi.berlin.de/geonetwork/srv/ger/catalog.search#/metadata/ffa05de2-fd1e-4b70-b5b2-3e53e52f47ea
- Mecklenburg-Vorpommern: https://laiv.geodaten-mv.de/afgvk/Geotopographie/Beschreibung?produkt=DOM
- NRW: https://www.opengeodata.nrw.de/produkte/geobasis/hm/dom1_tiff/
- Niedersachsen: https://opengeodata.lgln.niedersachsen.de/
- Bayern: https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=dom20
- Baden-Württemberg: https://opengeodata.lgl-bw.de/
- Rheinland-Pfalz: https://geoshop.rlp.de/opendata-domb.html
- Schleswig-Holstein: https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/dl-bdom.html
- Hessen: https://gds.hessen.de/INTERSHOP/web/WFS/HLBG-Geodaten-Site/de_DE/-/EUR/ViewDownloadcenter-Start
- Bremen: https://www.geo.bremen.de/produkte/3d-produkte/hoehenmodelle-12482
- Saarland: https://geoportal.saarland.de/app-article/geobasisdatenuebersicht/
- Hamburg (nur DGM): https://suche.transparenz.hamburg.de/dataset/digitales-hohenmodell-hamburg-dgm-1
- BKG DGM1 (offen, Boden): https://daten.gdz.bkg.bund.de/produkte/dgm/dgm1/aktuell/
- Copernicus DEM: https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM
