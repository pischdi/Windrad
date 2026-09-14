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
2. **Keine Bund-Abkürzung — auch nicht für DGM.** BKG-**DGM1 (1 m) ist kostenpflichtig, ab 8.000 €**
   (GDZ-Shop, Stand 09/2026). Gratis nur **DGM200/DGM1000** (viel zu grob), **DGM25** nur für Behörden.
   Es gibt also **keinen kostenlosen bundesweiten DGM1-Weg** — DGM muss ebenso **je Bundesland** geholt
   werden (dort kostenfrei), meist aus **demselben Portal wie das DOM** (ein Adapter liefert oft beides).
   Für **DOM** ohnehin kein Bund-Weg (BKG-DOM1 ~8.000 €, Copernicus 30 m zu grob).

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

## Bundesweite Quellen (Sackgasse für 1 m)
- **BKG DGM1 (1 m):** ❌ **kostenpflichtig, ab 8.000 €** (GDZ-Shop, 09/2026). Gratis nur **DGM200/DGM1000** (zu grob); **DGM25/DGM5** nur für Behörden.
- **BKG DOM1 (1 m):** ❌ ebenfalls **ab 8.000 €**.
- **Copernicus GLO-30** (30 m DSM): frei, aber zu grob für Türme/Bewuchs.
- **Fazit:** Für 1-m-**DOM und -DGM** gibt es beim Bund **keinen kostenlosen Weg** → immer die (kostenfreien) **Länder-Portale**. Ein Länder-Adapter liefert i. d. R. beides (DOM+DGM aus demselben Portal).

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

## Beschaffungsweg je Land — gemessen

**Frage:** Was führt schneller zur fertigen 1-m-Kachel — fertige Rasterkacheln (DOM/DGM als
TIF/ZIP) oder LAZ-Punktwolken?

**Ergebnis vorweg:** Raster gewinnt in **jedem** messbaren Land, mit Faktor **4× bis 35×**.
Kein einziges Land, in dem sich der LAZ-Weg lohnt. Grund ist nicht die Rechenzeit, sondern
die Datenmenge: LAZ ist je km² typisch **20–160× größer** als die fertige Rasterkachel.

### Messbedingungen

- **Datum:** 2026-09-14, ca. 16:20–18:40 Uhr MESZ, von diesem Host aus.
- **Methode:** je Land und Weg **eine** Beispieldatei, davon nur die ersten **5 MB** per
  HTTP-Range (`Range: bytes=0-5242879`); Rate = übertragene Bytes ÷ `time_total` (curl).
  Gesamtgröße aus `Content-Length` bzw. `Content-Range`. Sequenziell, ≥2 s Pause zwischen
  Abrufen, nie parallel auf dasselbe Portal. Gesamtverkehr der Messreihe: **ca. 105 MB**.
- **⚠️ Parallele Last:** Während der gesamten Messung lief auf derselben Leitung der
  Kachel-Runner mit **12 Verbindungen gegen `data.geobasis-bb.de`**. Konsequenz:
  - Die **absoluten** Raten sind durchgehend **zu niedrig**.
  - **Brandenburg ist massiv verzerrt** (0,02–0,18 MB/s statt der sonst üblichen Werte) —
    das Land konkurriert mit dem eigenen Runner um dieselben Portal-Verbindungen.
  - Der **Vergleich zwischen den Ländern** und vor allem der **Vergleich Raster ↔ LAZ
    innerhalb eines Landes** bleibt gültig: beide Wege eines Landes wurden unter derselben
    Last gemessen, das Größenverhältnis ist lastunabhängig.
- **Rechenzeit-Annahmen** (Vorgabe aus dem Projekt): Rasterweg **+2 s** je Kachel,
  LAZ-Weg **+35 s** je Kachel (gemessener Projektwert).

### Tabelle

| Land | Raster verfügbar / Größe je km² | LAZ verfügbar / Größe je km² | gemessene Rate (MB/s) | Zeit je Kachel Raster | Zeit je Kachel LAZ | Empfehlung |
|------|-------------------------------|------------------------------|----------------------|----------------------|--------------------|------------|
| **Brandenburg** | ✅ bDOM 1 m ZIP · **23,2 MB** (DGM 1,3 MB) | ✅ ALS `als_*.zip` · **102,5 MB** | 0,17 / 0,18 ⚠️ verzerrt | **138 s** ⚠️ | **605 s** ⚠️ | **Raster** — 4×; beide Werte durch Runner-Last aufgebläht |
| **NRW** | ✅ DOM1/DGM1 GeoTIFF · **2,1 MB** | ✅ `3dm_*.laz` · **92,8 MB** | 2,20 / 2,53 | **3,0 s** | **72 s** | **Raster** — 24×; LAZ ist 44× größer |
| **Bayern** | ✅ DGM1 TIF **3,0 MB** · DOM20 0,2 m **32,1 MB** | ✅ `*.laz` · **58,6 MB** | 5,61 / 6,60 | **2,5 s** (DGM) · 6,7 s (DOM20) | **44 s** | **Raster** — 17×; schnellstes Portal der Messreihe |
| **Sachsen** | ✅ DOM1/DGM1 TIF-ZIP, 2-km-Kachel · **3,5 MB** | ✅ `lsc_*_laz.zip` · **77,5 MB** | 5,08 / 5,35 | **2,7 s** | **50 s** | **Raster** — 18× |
| **Rheinland-Pfalz** | ✅ DOM1/DGM1 GeoTIFF · **2,0 MB** | ✅ `lpolpg_*.laz` · **323 MB** | 3,77 / 6,11 | **2,5 s** | **88 s** | **Raster** — 35×; größter Abstand aller Länder |
| **Baden-Württemberg** | ✅ DOM1/DGM1 ZIP, 2-km-Kachel · **3,2 MB** | ❌ nicht im OpenGeoData-Portal | 3,53 | **2,9 s** | – | **Raster** — alternativlos |
| **Thüringen** | ✅ DOM1/DGM1 ZIP · **8,8 MB** | 🟡 im Client angeboten, kein statischer Pfad | 3,88 / 4,48 | **4,3 s** | nicht messbar | **Raster** |
| **Mecklenburg-Vorp.** | ✅ DOM1 XYZ-ZIP, 2-km-Kachel · **4,0 MB** | ❌ `als_download` → **HTTP 401** (Basic-Auth) | 7,80 | **2,5 s** | – | **Raster** — LAZ nicht offen |
| **Berlin** | ✅ DOM1 ZIP, 2-km-Kachel · **0,19 MB** | 🟡 nur Sektorpakete (`Mitte.zip` = **36,7 GB**) | 1,19 / 2,82 | **2,2 s** | nicht je Kachel möglich | **Raster** — LAZ nur als Riesenbündel |
| **Hamburg** | 🟡 nur DGM, nur Gesamtpaket **2,95 GB** (≈3,7 MB/km²) | ❌ kein offenes LAZ | 5,61 | **2,7 s** (amortisiert) | – | **Raster (DGM)** — DOM fehlt weiterhin |
| Niedersachsen | ❓ nicht direkt messbar | ❓ nicht direkt messbar | – | – | – | erst Adapter, dann messen |
| Schleswig-Holstein | ❓ nicht direkt messbar | ❓ nicht direkt messbar | – | – | – | erst Adapter, dann messen |
| Sachsen-Anhalt | ❓ nicht direkt messbar | ❓ nicht direkt messbar | – | – | – | erst Adapter, dann messen |
| Hessen | ❓ nicht direkt messbar | ❓ nicht direkt messbar | – | – | – | erst Adapter, dann messen |
| Bremen | ❓ nicht direkt messbar | ❓ nicht direkt messbar | – | – | – | erst Adapter, dann messen |
| Saarland | ❓ nicht direkt messbar | ❓ nicht direkt messbar | – | – | – | erst Adapter, dann messen |

Größen sind **MiB je km²**, aus `Content-Length`/`Content-Range` der Beispieldatei; bei
2-km-Kacheln durch 4 geteilt. NRW-Größen sind Mittelwerte über je 300 Dateien aus dem
XML-Listing, alle übrigen Einzelmessungen (Stichprobe von einer Kachel — Bewuchs und
Bebauung streuen, ±50 % sind normal).

### Was nicht messbar war — und warum

| Land | Mechanismus | Was ein Adapter bräuchte |
|------|-------------|--------------------------|
| **Niedersachsen** | Angular-SPA über S3/COS-Bucket. Statische Indizes existieren nur für DOP/LoD1/LoD2 (`pro-download-indices/*.geojson`), **nicht** für DGM1/DOM1/bDOM20. Der im SPA hinterlegte Shop-Einstieg (`geobasisdaten.niedersachsen.de/shop?do=opendata`) liefert **404**. | Kachel-Auswahl im Portal nachbauen oder LGLN nach dem Höhendaten-Index fragen |
| **Schleswig-Holstein** | gaialight-Download-Client. `single.php?file=bDOM_SH_Massendownload` liefert **1 Byte** ohne Session; echte Dateilisten kommen aus `_ajax/kachelsuche.php` / `multi.php` mit Sitzungskontext. | AJAX-Kachelsuche nachbauen (POST mit Kachel-/Polygonparametern) |
| **Thüringen (nur LAZ)** | DGM/DOM liegen als statische ZIPs unter `/hoehendaten/…` und sind über ATOM auflistbar — **für LAZ existiert kein ATOM-Feed** (`atom_th_hoehendaten_laz` → „internal error1"), Verzeichnislisting ist 403. | dieselbe Kachelsuche wie SH (identischer Client) |
| **Sachsen-Anhalt** | Keine Direktlinks auf den LVermGeo-Seiten; Abgabe läuft über das Geodatenportal (`geodatenportal.sachsen-anhalt.de/gfds`) mit Auswahl-/Bestellstrecke. | Portal-Session + Bestellvorgang, oder Anfrage beim LVermGeo |
| **Hessen** | Intershop-Downloadcenter (`gds.hessen.de/INTERSHOP/…`) — Warenkorb-Logik mit Sitzung. | Intershop-Session nachbauen; unverhältnismäßig, besser Direktanfrage HLBG |
| **Bremen** | `geo.bremen.de` ist eine reine Produktbeschreibung ohne Downloadlinks; `gdi2.geo.bremen.de` antwortet **403**, `geoportal.bremen.de` löst nicht auf. | Bulk-Mechanik beim Landesamt erfragen (stand schon als To-do) |
| **Saarland** | Nur Viewer-Links (`geoportal.saarland.de/map?LAYER[...]`); der INSPIRE-Feed verlangt `type=DATASET|SERVICE` und liefert für Höhendaten keinen Kacheleinstieg. | Feed mit korrektem Dataset-Parameter durchsuchen; Anfrage LVGL liegt ohnehin bereit |
| **Berlin (nur LAZ)** | ALS existiert offen, aber ausschließlich als Sektorpakete (`Nord/Mitte/Süd.zip`), `Mitte.zip` allein **36,7 GB**. | Einmal-Bulk-Import statt On-Demand — lohnt nur bei Vollausbau Berlin |
| **Mecklenburg-Vorp. (nur LAZ)** | `als_download` antwortet **HTTP 401, `WWW-Authenticate: Basic realm="als_download"`** — Punktwolken sind nicht offen. | Zugangsdaten beim LAiV beantragen; für DOM/DGM nicht nötig |
| **Baden-Württemberg (nur LAZ)** | Im OpenGeoData-Portal sind 20 Produkte hinterlegt, **keine Punktwolke**; `/data/las/`, `/data/laz/`, `/data/lidar/` sind 404. | Punktwolken beim LGL kostenpflichtig anfragen — für unseren Zweck irrelevant |

### Konsequenz für die Pipeline

1. **Kein LAZ-Adapter bauen.** Der LAZ-Weg ist in keinem Land konkurrenzfähig. Die 35 s
   Rechenzeit sind dabei nicht einmal das Hauptproblem — schon der reine Download der
   Punktwolke dauert überall länger als der komplette Rasterweg inklusive Rechnen.
2. **Reihenfolge der nächsten Presets nach Messwert**, nicht alphabetisch: Bayern (2,5 s),
   MV (2,5 s), RLP (2,5 s), Sachsen (2,7 s), BW (2,9 s) sind die günstigsten Direktzugänge
   und brauchen alle nur einen simplen HTTP-Adapter.
3. **Brandenburg-Durchsatz ist ein Leitungsproblem, kein Formatproblem.** 138 s je Kachel
   entstehen durch die 12 parallelen Runner-Verbindungen, nicht durch das Portal. Nach
   Abschluss des Vollausbaus neu messen, bevor daraus Schlüsse gezogen werden.
4. **Neu belegte Zugänge** (bisher als „Adapter nötig" geführt, tatsächlich simples HTTP):
   Sachsen (Nextcloud-WebDAV, feste Share-IDs), RLP (offenes Verzeichnis `geobasis-rlp.de/data/`),
   Bayern (`poly2metalink`-POST → direkte `bayernwolke.de`-URLs), Thüringen (statische ZIPs
   unter `/hoehendaten/`), Berlin und MV (ATOM-Feeds mit Direktlinks). Das sind **6 Länder**,
   die deutlich billiger zu integrieren sind als in der Tabelle oben angenommen.
