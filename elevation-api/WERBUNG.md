# Elevation API — Positionierung & Werbetext

## Headline

**Höhendaten in 1 Meter. Sichtbarkeit inklusive. In einem API-Call.**

> Die einzige Höhen-API, die nicht nur sagt *wie hoch* das Gelände ist,
> sondern *was man von wo aus sieht* — mit echter 1-m-Laserscan-Auflösung,
> nicht mit 10-m-Schätzungen.

---

## Der Pitch (kurz)

Amtliche Höhendaten sind in Deutschland kostenlos — aber sie liegen verstreut über
16 Länderportale, als sperrige Datei-Downloads und OGC-Dienste (WMS/WCS), die kein
Entwickler freiwillig anfasst. Globale APIs wie Google oder Mapbox sind bequem, aber
**grob**: Mapbox quantisiert auf 10-Meter-Stufen. Für Windkraft, Funknetz, Solar oder
Drohnen ist das zu ungenau.

**Wir schließen die Lücke:** eine schlichte REST-API auf 1-m-Laserscan-Daten (DOM,
inkl. Bäume und Gebäude) — mit einem Feature, das weder Behörde noch Big-Tech
out-of-the-box liefert: **Line-of-Sight**.

---

## Was wir machen, was andere nicht machen

| | Behörden-Portale (BKG/Länder) | Google / Mapbox | **Elevation API** |
|---|:---:|:---:|:---:|
| Auflösung | 1 m (roh) | ~10 m | **1 m** |
| Entwicklerfreundliche REST-API | ✗ (meist OGC/Download) | ✓ | **✓** |
| Sichtbarkeit / Line-of-Sight | ✗ | ✗ | **✓ eingebaut** |
| Höhenprofil per Call | teils | teils | **✓** |
| Oberflächenmodell mit Bäumen/Gebäuden (DOM) | teils | ✗ (meist DTM) | **✓** |
| Eine Auth, eine Doku, ein Format | ✗ (pro Land verschieden) | ✓ | **✓** |

**Kernsatz:** *Andere liefern Höhenzahlen. Wir liefern die Antwort auf die eigentliche
Frage — „Sieht man es von dort?"*

---

## Use-Cases (Nutzen statt Bytes)

- **Windkraft & Bürgerbeteiligung:** Ist die geplante Anlage von Ort X sichtbar, und
  wie viel davon? — `line-of-sight` in einem Call.
- **Funknetz / Telekommunikation:** Sichtverbindung zwischen Mast und Standort prüfen.
- **Solar / PV:** Verschattung und Horizontverlauf aus dem Höhenprofil.
- **Drohnen / BVLOS:** Geländefreiheit und Sichtlinien für Flugplanung.
- **Bau & Planung:** schnelle Geländeschnitte ohne GIS-Software.

---

## Claims / Slogans (Auswahl)

- „1-Meter-Wahrheit statt 10-Meter-Schätzung."
- „Höhendaten, die mitdenken: Sichtbarkeit per API."
- „Vom Laserscan zur Antwort — in einem Request."
- „Amtliche Genauigkeit. Entwickler-Geschwindigkeit."

---

## Tonalität & Hinweise

- Ehrlich bleiben: Datengrundlage ist **offenes amtliches Open Data** (DL-DE/BY-2.0,
  Quellenangabe „© GeoBasis-DE/LGB"). Der Wert ist **Aufbereitung + Sichtbarkeits-Compute
  + DX**, nicht exklusiver Datenbesitz.
- Abdeckung aktuell regional (Brandenburg/Neuhausen-Spree) — nicht „ganz Deutschland"
  versprechen, bevor weitere Länder aggregiert sind.
