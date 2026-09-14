# Neue Zugangswege — die sechs geprüften Einstiegspunkte

**Stand:** 2026-09-15 · Alle Angaben **live verifiziert** von diesem Host (HTTP-Status,
`Content-Length`, ZIP-Central-Directory remote gelesen, je eine Kachel probeweise extrahiert).

## Ergebnis vorweg

**Alle sechs Länder sind gelöst. Fünf davon haben ein offenes DOM.** Damit fällt die
Kategorie „ungelöst" aus `BUNDESLAENDER_HOEHENDATEN.md` komplett weg.

| Land | offenes DOM? | Format | Kachel | Mechanik | Range? |
|------|--------------|--------|--------|----------|--------|
| **Niedersachsen** | ✅ DOM1 1 m + bDOM20 0,2 m | GeoTIFF | 1 km | statischer S3-Bucket + GeoJSON-Index | ✅ |
| **Hamburg** | ✅ bDOM 1 m | GeoTIFF im ZIP | 1 km | CKAN → ein ZIP, Einzelkachel per Range | ✅ |
| **Saarland** | ✅ DOM1 1 m (2025) | GeoTIFF im ZIP | 1 km | Nextcloud-WebDAV, 6 Kreis-ZIPs | ✅ |
| **Bremen** | ✅ DOM1 1 m | XYZ-ASCII im ZIP | 1 km | 2 statische ZIPs | ✅ |
| **Hessen** | ✅ DOM1 1 m | GeoTIFF+TFW im ZIP | 1 km | undokumentierte JSON-REST-API | ✅ |
| **Schleswig-Holstein** | ✅ bDOM 0,2 m | GeoTIFF | 1 km | GeoJSON-Index mit Direktlinks | ❌ |

**Zwei Korrekturen an bisherigen Projektannahmen:**

1. **Hamburg hat sehr wohl ein offenes DOM.** Die Notiz „kein offenes DOM gefunden" war falsch —
   das bDOM liegt seit 2022 als GeoTIFF im Transparenzportal. Keine Anfrage beim LGV nötig.
2. **Niedersachsens Höhen-Indizes existieren.** Die Notiz „statische Indizes nur für
   DOP/LoD1/LoD2" stimmte für den LGLN-Bucket, aber die DOM1-/DGM1-/bDOM20-Indizes liegen
   auf **ArcGIS Online**, nicht unter `pro-download-indices/`. Keine Anfrage beim LGLN nötig.

**Die beiden vermuteten „maschinenlesbaren" Einstiege waren beide Nieten** — aber aus
unterschiedlichen Gründen, und beide Länder lassen sich trotzdem anders lösen:
- Das **CKAN von Schleswig-Holstein** antwortet sauber, verlinkt als einzige Ressource aber
  nur die HTML-Seite des Download-Clients zurück. Kein Dateizugang über CKAN.
- Die **GeoNetwork-API von Niedersachsen** liefert seit Beginn der Messung durchgehend
  **HTTP 503** („Dienst nicht verfügbar", echter Ausfall, kein Bot-Block — auch mit
  Browser-User-Agent). Nicht nutzbar, aber auch nicht nötig.

---

## 1. Niedersachsen — der beste Zugang aller sechs

Der geforderte GeoNetwork-Einstieg ist tot (503). Der funktionierende Weg läuft über die
**ArcGIS-Online-Items des LGLN**, in denen die Kachelindizes als GeoJSON liegen.

**Index finden** (Owner `opengeodata_lgln_opendata`, 6 Indizes):

```
https://www.arcgis.com/sharing/rest/search?q=owner:opengeodata_lgln_opendata%20type:GeoJson&num=50&f=json
```

| Produkt | Item-ID | Index-Größe |
|---------|---------|-------------|
| **DOM1** (1 m) | `dcae97faef544744abf86190072e4d60` | 36,0 MB |
| **bDOM20** (0,2 m) | `49058dd7a9d14c53aab6f5246322f09f` | – |
| DGM1 (1 m) | `f86e0ba4d7b7413b99ee1caf0462e77a` | – |
| DOP20 / LoD1 / LoD2 | (die drei bereits bekannten) | – |

**Index laden:**
```
https://www.arcgis.com/sharing/rest/content/items/<ITEM_ID>/data
```

**DOM1-Index:** 70.807 Features, je 1 km × 1 km, EPSG:25832, Jahrgänge 2010–2025.
Jedes Feature trägt `dom1` (TIF-URL), `metadata` (XML-URL), `Aktualitaet`, `tile_id`.

**Die Dateien liegen in flachen IBM-Cloud-Object-Storage-Buckets — direkt, ohne Auth:**
```
DOM1    https://dom1.s3.eu-de.cloud-object-storage.appdomain.cloud/L2501/Vollkacheln/dom1_32_500_5904_1_ni_2025.tif
DGM1    https://dgm1.s3.eu-de.cloud-object-storage.appdomain.cloud/L2203/Vollkacheln/dgm1_32_452_5955_1_ni_2022.tif
bDOM20  https://bdom20.s3.eu-de.cloud-object-storage.appdomain.cloud/326115895/2026-05-23/bdom20_32_611_5895_1_ni_2026-05-23.tif
```
`Accept-Ranges: bytes`, DOM1-Kachel ≈ 3,6 MB. Die Pfadsegmente (`L2501/Vollkacheln` bzw.
`<tile_id>/<datum>`) sind **nicht ratbar** — immer aus dem Index nehmen.

**Adapter:** Index einmal ziehen und als Lookup `tile_id → URL` cachen, dann reines HTTP-GET.
Das ist derselbe Aufwand wie NRW/BB. bDOM20 ist mit Stand 2026-05 der frischeste Höhen-
datensatz aller 16 Länder.

---

## 2. Hamburg — CKAN, dann Einzelkachel per Range aus dem ZIP

Das Transparenzportal ist ein CKAN. Der `metaver.de`-Einstieg aus dem Auftrag ist nur eine
Metadaten-Anzeige; der Datenzugang sitzt hier:

```
https://suche.transparenz.hamburg.de/api/3/action/package_search?q=Oberflächenmodell
```

85 Treffer, davon **10 bDOM-Pakete** (verschiedene Snapshots). Das aktuelle ist
`digitales-hoehenmodell-hamburg-bdom8`. Achtung: die Pakete `…bdom1`–`…bdom7` zeigen auf
`archiv.transparenz.hamburg.de` und sind Archivkopien — die Live-Links stehen nur in `bdom8`.

**Aktuellster Datensatz (GeoTIFF, 2022-11-21):**
```
https://www.daten-hamburg.de/opendata/Digitales_Hoehenmodell_bDOM/dom1_hh_2022-11-21.zip
```
1.344.475.498 Bytes · `accept-ranges: bytes` · Lizenz dl-de/by-2-0.
⚠️ `https://daten-hamburg.de/...` (ohne `www.`) antwortet **301** — Redirect folgen oder
direkt `www.` verwenden, sonst schlägt ein `curl -r` ohne `-L` fehl.

**ZIP-Inhalt (remote aus dem Central Directory gelesen):** 884 Einträge = 1 CSV + **883
GeoTIFF-Kacheln**, Pfadform `s32_466/dom1_32_466_5973_1_hh_2022.tif`.
Je Kachel 3,5–3,7 MB komprimiert, 4,0 MB entpackt.

**Verifiziert:** Eine Einzelkachel wurde per Range-Request aus dem entfernten ZIP gezogen und
entpackt → `TIFF, 1000×1000, 32 bit, uncompressed` = 1-m-Raster, wie erwartet.

**Adapter:** Central Directory einmal lesen (2 Range-Requests), Offsets cachen, danach je
Kachel ein Range-GET + `zlib`-Inflate. Das komplette 1,34-GB-ZIP muss **nie** geladen werden.
Ältere Jahrgänge (2018, 2020, 2021) liegen als XYZ-ASCII vor — für uns irrelevant.

---

## 3. Saarland — Nextcloud-Share, per WebDAV listbar

Der `saarland.de`-Einstieg aus dem Auftrag ist eine reine Textseite. Der Datenzugang steht in
GovData und führt auf eine **öffentliche Nextcloud** des LVGL:

```
https://www.shop.lvgl.saarland.de/cloud/index.php/s/NK8ndP55qAqGEZD
Share-Token: NK8ndP55qAqGEZD
```

**Listbar per WebDAV** (Basic-Auth: Username = Token, Passwort leer):
```
PROPFIND https://www.shop.lvgl.saarland.de/cloud/public.php/webdav/files/OD_DOM1_2025_tif_LK/
Authorization: Basic <base64("NK8ndP55qAqGEZD:")>
Depth: 1
```
→ HTTP 207. Der Share enthält **das gesamte Open-Data-Angebot des Saarlands**, nicht nur DOM1:
ALKIS, Basis-DLM, DGM1 (tif + laz), DOM1 (tif + laz), DTK5/25/50/100, LoD2, Hauskoordinaten,
Hausumringe, LiDAR-Punktwolke 2025, RINEX, TrueDOP20 2025.

**DOM1 2025 — 6 ZIPs, nach Landkreis, EPSG:25832, zusammen ca. 6,15 GB:**

| Datei | Größe |
|-------|-------|
| `DOM1_tif_MZG_EPSG-25832_Entstehung-2025.zip` | 1.302 MB |
| `DOM1_tif_NK_…` | 627 MB |
| `DOM1_tif_SB_…` | 1.015 MB |
| `DOM1_tif_SLS_…` | 1.042 MB |
| `DOM1_tif_SPK_…` | 1.014 MB |
| `DOM1_tif_WND_…` | 1.155 MB |

Beispiel-Inhalt (NK): 310 GeoTIFFs, `DOM1_tif_NK/dom1_32_349_5473_1_SL_2025.tif`,
1 km, 1,8–2,0 MB komprimiert, 4,0 MB entpackt.

**Range funktioniert auch über WebDAV** (`Content-Range: bytes 0-500/626952523`) → dieselbe
Einzelkachel-aus-ZIP-Technik wie bei Hamburg.

**Das Format war die offene Frage — sie ist beantwortet: GeoTIFF, 1 m, Kachel 1 km,
Aufnahme 2025.** Die vorbereitete LVGL-Anfrage kann entfallen.

---

## 4. Bremen — zwei statische ZIPs, nichts weiter

`geoportal.bremen.de` ist eine 852-Byte-SPA ohne verwertbaren Inhalt. Der Zugang steht in
GovData (`dom1-land-bremen`) und zeigt auf **`gdi2.geo.bremen.de`** — den Host, der bei der
letzten Messung 403 lieferte. **Auf den `/inspire/download/`-Pfaden antwortet er sauber mit 200:**

```
https://gdi2.geo.bremen.de/inspire/download/DOM/data/Gitternetz_DOM1_2017_HB_ASCII_XYZ.zip
https://gdi2.geo.bremen.de/inspire/download/DOM/data/Gitternetz_DOM1_2015_BHV_ASCII_XYZ.zip
```

| Paket | Größe | Kacheln | je Kachel |
|-------|-------|---------|-----------|
| Bremen-Stadt 2017 | 1.236.054.202 B (1,24 GB) | **395** | 2,7–3,0 MB komp. / 21 MB entpackt |
| Bremerhaven 2015 | 324.773.832 B (325 MB) | **114** | 0,1–0,3 MB komp. |

`accept-ranges: bytes`, Pfadform `Gitternetz_DOM1_2017/dom1_32465_5896_1_hb.xyz`.

**Format ist XYZ-ASCII, nicht GeoTIFF** — als einziges der sechs Länder. Kachelname kodiert
UTM32 + Ost/Nord in km (`32465_5896` → E 465000, N 5896000). 21 MB ASCII je km² sind rund
5× mehr Bytes als ein GeoTIFF derselben Kachel; entpackt wird das über die ZIP-Kompression
aber wieder aufgefangen (2,9 MB übertragen).

**Die „Bulk-Mechanik" ist damit geklärt: es gibt keine — es sind zwei Dateien.** Ganz Bremen
sind 509 Kacheln, das ist ein Einmal-Import.

⚠️ **Der Bremer Bestand ist der älteste der sechs** (2017 bzw. 2015). Für ein Produkt, das
Bewuchshöhen für Sichtlinien liefert, sind 9 bis 11 Jahre alte Baumhöhen eine ernstzunehmende
Schwäche — beim Ausbau Bremen erwähnen, nicht stillschweigend ausliefern.

---

## 5. Hessen — es gibt doch eine API, sie ist nur nicht dokumentiert

Das Intershop-Downloadcenter ist eine Vue-App. Der Warenkorb, an dem die letzte Recherche
hängenblieb, ist **gar nicht im Weg**: die App holt ihre Daten aus einer offenen JSON-REST-
Schnittstelle, die ohne Session, ohne Cookie und ohne Registrierung antwortet.

Gefunden im Lazy-Chunk `downloadCenter.f30db1fd1f408ff4d4ba.js` als `START_URL`:

```
https://gds.hessen.de/INTERSHOP/rest/WFS/HLBG-Geodaten-Site/-/downloadcenter?path=<PFAD>&navigation=all
```

**Drei Ebenen bis zur Datei:**

```
1. ?navigation=all
   → 3D-Daten, Digitales Landschaftsmodell, Geodatendienste, …

2. ?path=3D-Daten&navigation=all
   → 3D-Gebäudemodelle · Digitales Geländemodell (DGM1) · Digitales Oberflächenmodell (DOM1)

3. ?path=3D-Daten%2FDigitales+Oberfl%C3%A4chenmodell+%28DOM1%29&navigation=all
   → 26 Landkreise / kreisfreie Städte

4. ?path=…%2FOdenwaldkreis&navigation=all
   → searchresult.downloads[] mit je name, fileSize, creationDate, downloadLink.uri
```

**Beispielantwort (Odenwaldkreis, 12 Downloads):**
```json
{ "name": "Brensbach - DOM1", "id": "DP0101661", "fileExtension": "ZIP",
  "fileSize": "106,1 MB", "creationDate": "16.05.2024",
  "downloadLink": { "uri": "/downloadcenter/20260915/3D-Daten/Digitales Oberflächenmodell (DOM1)/Odenwaldkreis/Brensbach - DOM1.zip" } }
```

**Download verifiziert, ohne jede Session:**
`HTTP 206 · Content-Type: application/zip · Content-Range: bytes 0-1000/111285320 · Accept-Ranges: bytes`

ZIP-Inhalt: 78 Einträge = **39 Kacheln** als `dom1_32_488_5512_1_he.tif` + zugehörige `.tfw`,
je 3,3 MB komprimiert / 3,4 MB entpackt → 1 km, 1 m.

**⚠️ Der wichtigste Fallstrick:** `20260915` im Pfad ist das **Tagesdatum**. Getestet:
`20260101` und `20250101` liefern beide **404**. Die URL ist also **nicht cachebar** — der
Adapter muss den `downloadLink.uri` bei jedem Lauf frisch aus der REST-API holen. Das ist
billig (ein GET je Landkreis), aber ein hartkodierter Link bricht garantiert über Nacht.

Zweiter Punkt: Hessen schneidet **nach Gemeinde**, nicht nach Kachelgitter. Für eine einzelne
Zielkachel muss man also wissen, in welcher Gemeinde sie liegt — oder alle ZIPs eines Kreises
per Range nach dem passenden Kacheldateinamen durchsuchen (Central Directory je ZIP lesen,
dann gezielt extrahieren). Bei 3,3 MB je Kachel bleibt das günstig.

Dieselbe API liefert unter `path=3D-Daten/Digitales Geländemodell (DGM1)` auch das DGM.

---

## 6. Schleswig-Holstein — CKAN nein, aber der Client verrät seinen eigenen Index

**CKAN ist die Sackgasse.** Die API funktioniert einwandfrei:
```
https://opendata.schleswig-holstein.de/api/3/action/package_show?id=bildbasiertes-digitales-oberflachenmodell-bdom
```
(Die im Auftrag genannte ID `digitales-gelandemodell-1-dgm1` existiert dort **nicht** → 404.
Über `package_search?q=DOM` findet man den richtigen Datensatz.)
Aber das Paket hat genau **eine** Ressource, und die ist `format: HTML` und zeigt zurück auf
die Client-Seite. Kein Dateizugang.

**Der Treffer steckt im HTML des gaialight-Clients selbst.** Die letzte Messung scheiterte an
einem Tippfehler in der Parameterliste: sie rief `single.php?file=bDOM_SH_Massendownload` auf
(1 Byte Antwort). Korrekt ist **`.geojson` plus `&id=4`**:

```
https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/single.php?file=bDOM_SH_Massendownload.geojson&id=4
```

→ HTTP 200, **8.942.576 Bytes GeoJSON, ohne Session, ohne Cookie**.
**17.614 Features**, je 1 km × 1 km, EPSG:25832, Aufnahmedaten 2023-04-06 bis 2024-09-22.
Jedes Feature trägt `kachel`, `datum` und `link_data` mit dem fertigen Direktlink:

```
https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/massen.php?file=bdom20nc_32_425_6002_1_sh_2024.tif&id=6&live=2024&km=32420_6000&stack=32425_6002
```

Die AJAX-Kachelsuche, die als Adapter-Aufwand veranschlagt war, muss **nicht** nachgebaut werden.

**Aber — der Haken, und er ist teuer:**

| | |
|---|---|
| Format | GeoTIFF, **0,2 m** (nicht 1 m) |
| Größe je Kachel | **104.861.944 Bytes = 100 MiB je km²** |
| Range-Support | **nein** — Server ignoriert `Range:`, liefert immer die volle Datei |
| Gemessene Rate | 8,9 s für die Kachel ≈ 11,7 MB/s |
| Bestand gesamt | 17.614 × 100 MB ≈ **1,76 TB** |

SH ist damit **40× teurer je km² als Hamburg oder Niedersachsen** und der einzige der sechs
Zugänge ohne Range. Vollausbau SH ist keine Option; On-Demand ist mit ~9 s je Kachel aber
vertretbar. Die 0,2 m müssen ohnehin auf 1 m heruntergerechnet werden — das passiert
sinnvollerweise direkt nach dem Download, damit nur die 4-MB-Fassung in R2 landet.

Der Client bietet dieselbe Mechanik vermutlich auch für DGM (`dl-dgm.html`) — nicht geprüft,
da DGM nachrangig ist.

---

## Konsequenzen für die Pipeline

1. **Vier Adapter-Bauarten decken alle sechs ab**, keine davon braucht Session oder Login:
   - **flacher Bucket + GeoJSON-Index** → Niedersachsen (und analog Schleswig-Holstein)
   - **ZIP + Range + Central Directory** → Hamburg, Saarland, Bremen
   - **JSON-REST-API, Link je Lauf frisch** → Hessen
   - Die ZIP-Range-Technik ist **einmal** zu schreiben und dreimal zu parametrisieren.

2. **Reihenfolge nach Kosten je Kachel** (gemessen bzw. aus `Content-Length`):

   | Rang | Land | Bytes je km² | Bemerkung |
   |------|------|--------------|-----------|
   | 1 | Niedersachsen | 3,6 MB | direkter Bucket, kein ZIP-Overhead |
   | 2 | Hamburg | 3,6 MB | + 2 Range-Requests einmalig je ZIP |
   | 3 | Hessen | 3,3 MB | + 1 API-Call je Landkreis und Lauf |
   | 4 | Saarland | 1,9 MB | kleinste Kachel, aber Nextcloud-Latenz |
   | 5 | Bremen | 2,9 MB | nur 509 Kacheln gesamt → Einmal-Import |
   | 6 | Schleswig-Holstein | **100 MB** | Ausreißer, kein Range |

3. **Zwei Anfragen an Landesämter sind hinfällig** — Hamburg (LGV) und Saarland (LVGL)
   brauchen keine Rückfrage mehr. Die vorbereiteten E-Mails können liegen bleiben.

4. **Zwei Datenqualitäts-Vorbehalte für den späteren Produkttext:**
   - Bremen: DOM von 2017 / 2015.
   - Niedersachsen: DOM1-Jahrgänge streuen von 2010 bis 2025 — der Index führt `Aktualitaet`
     je Kachel, das gehört in die Kachel-Metadaten übernommen, sonst verkaufen wir 16 Jahre
     alte Baumhöhen als aktuell. bDOM20 (2026) ist dort die bessere Quelle, wo es sie gibt.

## Nicht nutzbar

- **`geoportal.geodaten.niedersachsen.de/harvest/srv/api/...`** — HTTP 503 über die gesamte
  Messung, auch mit Browser-User-Agent. Echter Dienstausfall. Falls der Dienst zurückkommt,
  ist er trotzdem überflüssig: die ArcGIS-Indizes sind der direktere Weg.
- **`opendata.schleswig-holstein.de` (CKAN)** — funktioniert, führt aber nur auf die
  HTML-Clientseite zurück.
- **`hvbg.hessen.de/.../digitale-gelaendemodelle`** — verlinkt ausschließlich `gds.hessen.de`.
  Laut HVBG-Open-Data-Übersicht gibt es für DGM1/DOM1 **weder WMS noch WFS**, nur Shop und
  Downloadcenter. Die REST-API des Downloadcenters ist der einzige maschinelle Weg.
- **`geoportal.bremen.de/geoportal/`** — SPA ohne Datenlinks.
- **`geoportal.saarland.de`** und **`saarland.de/lvgl/...`** — nur Viewer bzw. Fließtext.
- **`metaver.de/trefferanzeige?docuuid=...`** — reine Metadatenanzeige; der Hamburger
  Datenzugang läuft über das Transparenzportal-CKAN.
