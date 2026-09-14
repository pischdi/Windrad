# Wettbewerb

Stand: 2026-09-15 · geprüft durch direkte Abrufe der Seiten und API-Dokumentationen

Übersicht:

| Anbieter | Abdeckung | Modell | Preis | Für uns gefährlich? |
|---|---|---|---|---|
| **hoehendaten.de** | DE, alle 16 Länder, 1 m | **DGM** | kostenlos | Ja — für generische DGM-Dienste |
| **gpxz.io** | weltweit, DE „most states at 1m" | **DGM** (bare-earth) | 99 / 249 USD im Monat | Nein für DOM, ja als Preisanker |
| ArcGIS / QGIS / GRASS | beliebig | was man einspeist | Lizenz bzw. frei | Nur für Fachleute, die selbst rechnen |

**Der rote Faden: Alle liefern Gelände, keiner liefert Oberfläche.**

---

## hoehendaten.de

## Was es ist

**hoehendaten.de** — kostenloser Webservice für **DGM1-Höhendaten aller 16 Bundesländer**.
Betreiber laut Impressum: **Klaus Tockloth**, Münster (USt-IdNr. DE316642974), Benutzeroberfläche
von Franz Kolberg. Also ein Zwei-Personen-Projekt, kein Unternehmen, keine Anmeldung, keine
erkennbare Bezahlschranke.

- Webseite: https://hoehendaten.de/
- API-Basis: `https://api.hoehendaten.de:14444` (POST, JSON)
- Datengrundlage: dieselben offenen Landesdaten, die auch wir ziehen (dl-de/by-2-0 bzw. cc-by/4.0),
  Höhenbezug DHHN2016 (EPSG:7837)

## Funktionsumfang

| Endpunkt | Inhalt |
|---|---|
| `/v1/point`, `/v1/utmpoint` | Höhe für einen Punkt (Lon/Lat bzw. UTM) |
| `/v1/rawtif` | Roh-Höhendaten als GeoTIFF für **1×1 km** — identische Kachelgröße wie bei uns |
| `/v1/elevationprofile` | Höhenprofil A–B |
| `/v1/gpx`, `/v1/gpxanalyze` | Höhen und Analyse für GPX-Dateien |
| `/v1/slope`, `/v1/aspect` | Hangneigung, Hangexposition |
| `/v1/contours`, `/v1/hillshade`, `/v1/colorrelief` | Höhenlinien, Schummerung, Farbrelief |
| `/v1/roughness`, `/v1/tri`, `/v1/tpi` | Geländerauheit, Ruggedness Index, Position Index |
| `/v1/histogram` | Histogramm |

Antwort von `/v1/point` liefert zusätzlich Aktualität, Herkunft, Attribution und Kachelindex.

## Der entscheidende Unterschied: DGM, kein DOM

Die Seite sagt es selbst: *„Ein DGM stellt im Gegensatz zum Digitalen Oberflächenmodell (DOM)
keine Objekte auf der Erdoberfläche dar (z. B. Bäume und Häuser). Brücken sind nicht Bestandteil
eines DGM."*

**Damit ist die Sichtbarkeitsfrage dort strukturell nicht beantwortbar.** Ob ein Windrad hinter
einem 30 m hohen Waldstück verschwindet, entscheidet das DOM, nicht das DGM. Genau das ist unsere
Produktlinie 2 (Sichtlinien / Viewshed) und die Grundlage der AR-Darstellung.

## Was das für uns heißt

**1. Generische DGM-Dienste sind als Geschäftsmodell in Deutschland tot.**
Punktabfrage, Höhenprofil, Hangneigung, Schummerung — alles kostenlos, flächendeckend, mit
Attributionshinweisen. Dagegen etwas verkaufen zu wollen, ist aussichtslos.

**2. Unser Alleinstellungsmerkmal ist das DOM und alles, was darauf aufbaut.**
Sichtlinien, Viewshed, Verschattung, AR-Einblendung. Dort gibt es kein vergleichbares Angebot.

**3. Priorität bei neuen Bundesländern: DOM zuerst, DGM nachrangig.**
Bisher haben wir je Land beide Modelle geplant. Das ist doppelte Ladezeit und doppelter
Speicher für den Teil, den es woanders geschenkt gibt. BB_DGM läuft und wird fertiggestellt
(zu weit fortgeschritten zum Abbrechen), aber ab Sachsen gilt: **DOM hat Vorrang.**

**4. Kein Bulk-Abgriff bei hoehendaten.de.**
`/v1/rawtif` liefert 1×1-km-GeoTIFFs und wäre technisch ein bequemer Abkürzungsweg für unsere
DGM-Lücken. Das ist ein Hobbyserver hinter einem einzelnen Port. Hunderttausende Abrufe dagegen
zu fahren wäre schäbig und würde den Dienst abschießen. Machen wir nicht.

**5. Bestätigung nebenbei:** Der Betreiber veröffentlicht die Landesdaten mit Quellenvermerk je
Bundesland. Das belegt, dass unser eigener Weg lizenzrechtlich tragfähig ist — Attribution je
Land ist Pflicht, Weiterverwendung erlaubt.

## Praktische Beobachtung zu hoehendaten.de

Die API läuft auf **Port 14444**. Aus diesem Netz ist der Port nicht erreichbar (TCP-Verbindung
läuft in den Timeout) — vermutlich die Deep-Packet-Inspection der FortiClient-Installation.
In Unternehmensnetzen dürfte der Dienst also häufiger nicht nutzbar sein. Unsere API läuft über
443 und hat dort einen praktischen Vorteil.

---

## gpxz.io

Kommerzieller **weltweiter** Höhen-API-Anbieter (Neuseeland-Ursprung, LINZ-Lidar als Aushängeschild).

**Datenlage**
- Basis: GEBCO 2024 (Meerestiefe) + Copernicus 30 m, darüber offene Lidar-Datensätze
- Auflösung je nach Region 0,5 m → 2 m, 5 → 10 m, 30 m, 110 m, 450 m
- **Deutschland ist drin**: „Germany (most states at 1m)" — sie ziehen dieselben Landesdaten wie wir
- Höhenbezug EGM2008 (EPSG:3855), Stand v2025.1, zuletzt Dezember 2025

**Schnittstellen**
`/v1/elevation/point`, `/points` (Pipe-getrennte Liste), `/raster` (GeoTIFF nach Bounding Box und
Auflösung), `tiles.json` und XYZ-Kacheln (`@2x.webp`, Mapbox-Encoding) — und ein
**Google-Maps-Elevation-kompatibler Endpunkt** (`/v1/elevation/gmaps-compat/`) als
Migrationspfad. Das ist klug gemacht.

**Preise**
- kostenlos: 100 Abfragen/Tag, 1.000 Kachelabrufe/Tag, nur zum Testen
- **99 USD/Monat**: 2.500 Abfragen/Tag, 25.000 Kachelabrufe/Tag, kommerzielle Nutzung
- **249 USD/Monat**: 7.500 Abfragen/Tag, 75.000 Kachelabrufe/Tag
- darüber Enterprise mit Vertrag; feste Monatspreise ohne Überschreitungskosten

**Und auch hier das Entscheidende — es ist ein Geländemodell:**

> *„GPXZ uses bare-earth terrain data (DTMs) for hires coverage. Areas without hires coverage use
> Copernicus surface data (DSMs), **processed to remove vegetation and structures**."*
> *„the GPXZ elevation dataset is now a global terrain model."*

Sie entfernen Vegetation und Gebäude **aktiv**. Wo wir die Bäume brauchen, rechnen sie sie weg.

**Was wir daraus mitnehmen**

1. **Preisanker.** 99 USD/Monat für 2.500 Abfragen am Tag ≈ 75.000 im Monat, also rund
   **0,13 Cent je Abfrage**. Unsere Cloudflare-Kosten liegen bei ~1,80 €/Monat für den gesamten
   Bestand. Die Marge in diesem Markt ist also erheblich — das Geschäft liegt nicht im Ausliefern,
   sondern im Beschaffen und Aufbereiten. Genau der Teil, den wir gerade bauen.
2. **Ihre Kontingente sind klein.** 2.500 Abfragen am Tag sind für eine Planungsabteilung wenig.
   Wer Flächen rechnet statt Punkte, stößt sofort an die Grenze. Kachelweise Auslieferung wie
   bei uns skaliert dort besser.
3. **Der gmaps-kompatible Endpunkt ist eine Idee zum Klauen** — nicht für Google, sondern als
   Drop-in für Leute, die schon etwas gebaut haben.
4. **Open Topo Data** ist ihr offener Fork des API-Servers. Lohnt einen Blick, bevor wir
   Serverfunktionen selbst erfinden.

---

## Die unbequeme Wahrheit zum „Moat"

Zwei unabhängige Anbieter, beide DGM, keiner DOM — das ist kein Zufall, das ist ein Muster.
DOM ist größer, uneinheitlicher und nicht überall verfügbar (Hamburg hat gar keins offen).
Das ist unser Graben, aber der Graben existiert, weil das Buddeln unangenehm ist, nicht weil
niemand daran gedacht hat.

**Und die Sichtbarkeitsrechnung selbst ist keine Erfindung.** Viewshed und Line-of-Sight sind
Standardfunktionen in ArcGIS, QGIS und GRASS; Esri führt in der eigenen Doku ausgerechnet
Windräder als Beispiel an. Ein Planungsbüro mit QGIS-Kenntnis und DOM-Daten kann das selbst.

**Unser Wert ist deshalb nicht der Algorithmus, sondern das Weglassen der Voraussetzungen:**
kein GIS, keine Datenbeschaffung, keine Projektionsrechnerei — Adresse rein, Antwort raus,
und obendrauf die AR-Ansicht, die kein GIS-Werkzeug liefert. Wer das vergisst und „Viewshed-API"
verkaufen will, verkauft eine QGIS-Funktion.
