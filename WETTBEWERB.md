# Wettbewerb: hoehendaten.de

Stand: 2026-09-15 · geprüft durch direkte Abrufe der Seite und der API-Dokumentation

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

## Praktische Beobachtung

Die API läuft auf **Port 14444**. Aus diesem Netz ist der Port nicht erreichbar (TCP-Verbindung
läuft in den Timeout) — vermutlich die Deep-Packet-Inspection der FortiClient-Installation.
In Unternehmensnetzen dürfte der Dienst also häufiger nicht nutzbar sein. Unsere API läuft über
443 und hat dort einen praktischen Vorteil.
