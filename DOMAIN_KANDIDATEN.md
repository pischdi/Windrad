# Domain-Kandidaten

**Stand:** 2026-09-13 · Vorschläge mit grober Verfügbarkeitsprüfung.

**Methode und ihre Grenze:** Geprüft wurde per DNS, ob die Domain überhaupt existiert
(NXDOMAIN = sehr wahrscheinlich frei, Namensserver vorhanden = vergeben). Das ist ein
starkes Signal, aber **kein Verfügbarkeitsnachweis** — eine Domain kann registriert sein,
ohne je eingerichtet worden zu sein. Verbindlich ist erst die Abfrage beim Registrar.

**Was der Name tragen muss:** Höhendaten aus 16 Landesportalen, daraus Gefälle (DGM) und
Sichtverbindungen (DOM) — für Richtfunk zwischen Mobilfunkstandorten, für Bauwerke,
und als AR-Darstellung geplanter Anlagen für die Öffentlichkeit. Also: **nicht Windkraft,
nicht Mobilfunk allein.** Der gemeinsame Nenner ist *Gelände, Höhe, Sicht, Standort*.

---

## Engere Wahl

| Domain | frei? | Warum sie taugt | Haken |
|---|---|---|---|
| **standortblick.de** | frei | Trifft beides: den Blick **vom** Standort (Sichtlinie) und den Blick **auf** den Standort (AR). Deutsch, sofort verständlich, klingt nach Fachdienst statt Bastelei | nur deutschsprachig |
| **gelaendeblick.de** (`.com` ebenfalls frei) | frei | Gelände ist genau das, was du verkaufst, Blick ist die Sichtlinie. Sympathisch, nicht technisch abschreckend | „Blick" klingt eine Spur nach Tourismus |
| **topoline.io** | frei | International, kurz, aussprechbar. Topografie plus Linie, also Profil und Sichtlinie in einem Wort. Skaliert über Deutschland hinaus | `.de`, `.com` und `.app` sind vergeben — der Name gehört dir also nicht allein |
| **hoehenraster.de** | frei | Sagt technisch exakt, was der Kern ist: 1-m-Höhenraster. Für Entwickler sofort klar | beschreibend statt Marke, und Umlaut-Umschrift bleibt erklärungsbedürftig |

**Meine Empfehlung: `standortblick.de`.** Es ist der einzige Kandidat, der beide
Produktlinien in einem Wort hält, ohne eine davon zu verraten. Gegenüber Gemeinden
und Netzplanern funktioniert es gleich gut, und man versteht es am Telefon.

Falls es später über Deutschland hinausgehen soll, nimm zusätzlich **topoline.io** und
lass es auf dasselbe Ziel zeigen.

---

## Weitere freie Fundstücke

| Domain | Gedanke dahinter |
|---|---|
| topoblick.de | Kurzform von Topografie plus Blick, etwas moderner als „Gelände" |
| topowerk.de | „Werk" klingt nach Werkstatt und Werkzeug, passt zum API-Charakter |
| sichtbasis.de | Basis für Sichtverbindungen, sachlich |
| hoehenbasis.de | dasselbe von der Datenseite gedacht |
| standortsicht.de | nah an standortblick, etwas nüchterner |
| hoehenwerk.app | `.app` erzwingt HTTPS, gute Anmutung für eine API. `.de` ist vergeben |
| funkblick.de | schön, aber legt dich auf Richtfunk fest — genau der Fehler, den „windrad" schon macht |
| mastblick.de | dito, zu eng |
| topohoehe.de, geohoehe.de | beschreibend, wenig Marke |

---

## Vergeben, damit du nicht danach suchst

`sichtlinie.de`, `sichtfeld.de`, `hoehenwerk.de`, `hoehenblick.de`, `sichtachse.de`,
`freiesicht.de`, `terraview.de`, `blickachse.de`, `sichtraum.de`, `terrabasis.de`,
`topoline.de`, `topoline.com`, `topoline.app`

---

## Aufteilung, sobald eine Domain steht

```
ar.<domain>       AR-Darstellung, öffentlich
api.<domain>      Elevation-API mit Doku und Demo, geschützt
www.<domain>      eine Seite, die erklärt, was das ist
```

Ein Hinweis zum Kauf: Cloudflare verkauft ohne Aufschlag und verdrahtet DNS sofort,
bietet aber nicht jede Endung an. Falls `.de` dort fehlt, woanders kaufen und die
Namensserver auf Cloudflare zeigen — das Ergebnis ist dasselbe.
