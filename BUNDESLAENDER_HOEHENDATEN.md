# Höhendaten der Bundesländer — Zugänge & Pipeline-Status

**Stand:** 2026-09-11 · Grundlage: Recherche (4 Agenten, 2026-07) + Live-Verifikation NRW/BB
(aktuell). Ziel: offenes **DOM** (Oberfläche, für Sichtlinien/Losspinne) und **DGM** (Gelände,
für Gefälle/Aufstellflächen) → 1-m-Kachel → R2 → Worker.

Unterscheidung: **Quelle offen** = Datenzugang recherchiert/verifiziert. **Preset** = in der
Cloud-Run-Pipeline (`cloudrun/tileproc.py`) tatsächlich eingebaut & lauffähig.

## Gesamtübersicht (16 Länder)

| Land | UTM | DOM (Sicht) | DGM (Gefälle) | Preset | Status / To-do |
|------|-----|-------------|---------------|--------|----------------|
| **Brandenburg** | 33 | ✅ bDOM 1 m | ✅ verifiziert | ✅ | **einsatzbereit** (Vollausbau läuft) |
| **NRW** | 32 | ✅ DOM1 1 m | ✅ verifiziert | ✅ | **einsatzbereit** (ganz NRW gebaut) |
| Sachsen | 33 | ✅ DOM1 | ✅ (Land) | – | Preset + Batch-Download-Adapter |
| Berlin | 33 | ✅ DOM1/bDOM | ✅ | – | Preset + ATOM-Adapter |
| Mecklenburg-Vorp. | 33 | ✅ DOM1 | ✅ | – | Preset + ATOM/WCS-Adapter |
| Sachsen-Anhalt | 32 | ✅ DOM1/bDOM | ✅ | – | Preset + Portal-Adapter |
| Thüringen | 32 | ✅ DOM1 | ✅ | – | Preset + DLA-Client-Adapter |
| Niedersachsen | 32 | ✅ bDOM 0,2 m | ✅ | – | Preset + ArcGIS-Hub/ATOM-Adapter |
| Bayern | 32 | ✅ DOM20 0,2 m | ✅ | – | Preset + Metalink-Adapter |
| Baden-Württemberg | 32 | ✅ DOM1 | ✅ | – | Preset + Portal/OGC-API-Adapter |
| Rheinland-Pfalz | 32 | ✅ bDOM 0,2 m | ✅ | – | Preset + ATOM-Adapter |
| Schleswig-Holstein | 32 | ✅ bDOM 0,2 m | ✅ | – | Preset + Download-Client-Adapter |
| Hessen | 32 | 🟡 offen | ✅ | – | Zugang umständlich (Intershop) |
| Bremen | 32 | 🟡 offen | ✅ | – | Bulk-Mechanik klären |
| Saarland | 32 | 🟡 Format? | ✅ | – | Format prüfen (Anfrage liegt bereit) |
| **Hamburg** | 32 | ⚪ **kein DOM** | ✅ nur DGM | – | DOM anfragen (LGV) / BKG-DGM als Notnagel |

**Bilanz:** Preset einsatzbereit **2/16** (BB, NRW) · Quelle offen, Preset fehlt **10** · offen mit Haken **3** · ohne offenes DOM **1** (Hamburg).

## Zwei Einordnungen

1. **„Preset fehlt" ≠ 3 Zeilen.** NRW/BB haben ein simples HTTP-Verzeichnis; die anderen nutzen
   ATOM-Feeds, Metalinks, Batch-/Download-Clients → je Land ein kleiner **Listing-/Download-
   Adapter** in `tileproc.py` (Verarbeitung `make_grid`/Upload bleibt identisch). Kein Worker-Umbau.
2. **Gefälle-Abkürzung über den Bund:** **BKG-DGM1 ist bundesweit offen** (eine Quelle für ganz
   Deutschland). Damit wäre die Gefälle-Funktion überall abgedeckt, ohne 16 Länder-Adapter — braucht
   aber eine **BKG-Registrierung/Freischaltung** (anonymer Abruf → HTTP 403). Für **DOM** hilft das
   nicht: es gibt **kein bundesweites offenes DOM** (BKG-DOM1 kostenpflichtig ~8.000 €, Copernicus 30 m zu grob).

## Zwei UTM-Zonen
- **UTM33** (wie BB): Sachsen, Berlin, Mecklenburg-Vorpommern.
- **UTM32**: alle übrigen. Der Worker (Commit `fd80a5d`) bedient beide über `tile_<zone>_E_N`.

## Ausbau-Strategie
On-Demand statt „alles auf Vorrat": pro neuer MRT-Region das passende Land als Preset+Adapter
ergänzen (`cloudrun/tileproc.py`), dann zieht `/ensure`/Batch dort sofort. Reihenfolge nach
tatsächlichem Standort-Bedarf, nicht alphabetisch.

## Problemfälle & Kontakte
- **Hamburg (⚪):** LGV Hamburg, ☎ +49 40 42826-5720, `geobasisdaten@gv.hamburg.de`.
- **Saarland (🟡, nur Format):** LVGL Saarland, ☎ +49 681 9712-03, `poststelle@lvgl.saarland.de`.
- Fertige Anfrage-Emails: Google Drive → LOS-Test → „Anfrage Hoehendaten – Problemfaelle & Kontakte (final)".

## Bundesweite Quellen
- **BKG DGM1** (Boden, 1 m): offen (DL-DE/Zero), aber **Freischaltung nötig** — `https://gdz.bkg.bund.de/` bzw. `https://daten.gdz.bkg.bund.de/produkte/dgm/dgm1/aktuell/`.
- **BKG DOM1**: ❌ nicht offen (~8.000 €). **Copernicus GLO-30** (30 m DSM): frei, aber zu grob.

## Primärquellen (DOM, Stand Juli-Recherche; NRW/BB aktuell verifiziert)
- Brandenburg bDOM: https://data.geobasis-bb.de/geobasis/daten/bdom/tif/ · DGM: …/daten/dgm/tif/
- NRW DOM1: https://www.opengeodata.nrw.de/produkte/geobasis/hm/dom1_tiff/dom1_tiff/ · DGM1: …/dgm1_tiff/dgm1_tiff/
- Sachsen: https://www.geodaten.sachsen.de/batch-download-4719.html
- Berlin: https://gdi.berlin.de/ (FIS-Broker/ATOM)
- Mecklenburg-Vorpommern: https://laiv.geodaten-mv.de/afgvk/Geotopographie/Beschreibung?produkt=DOM
- Sachsen-Anhalt: https://www.lvermgeo.sachsen-anhalt.de/de/gdp-dom-bdom-lsa.html
- Thüringen: https://geoportal.geoportal-th.de/gaialight-th/_apps/dladownload/dl-dhm.html
- Niedersachsen: https://opengeodata.lgln.niedersachsen.de/
- Bayern: https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=dom20
- Baden-Württemberg: https://opengeodata.lgl-bw.de/
- Rheinland-Pfalz: https://geoshop.rlp.de/opendata-domb.html
- Schleswig-Holstein: https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/dl-bdom.html
- Hessen: https://gds.hessen.de/INTERSHOP/web/WFS/HLBG-Geodaten-Site/de_DE/-/EUR/ViewDownloadcenter-Start
- Bremen: https://www.geo.bremen.de/produkte/3d-produkte/hoehenmodelle-12482
- Saarland: https://geoportal.saarland.de/app-article/geobasisdatenuebersicht/
- Hamburg (nur DGM): https://suche.transparenz.hamburg.de/dataset/digitales-hohenmodell-hamburg-dgm-1
