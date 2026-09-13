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

---

## Nachtrag: aus dem Grundgedanken abgeleitet (2026-09-13)

**Der Grundgedanke in einem Satz:** Aus sechzehn unbrauchbaren Datenquellen wird eine
Antwort — einmal teuer gerechnet, damit die Antwort beliebig oft billig ist. Und beide
Zielgruppen, Fachleute wie Bürger, sehen dieselbe Rechnung, nur in anderer Verpackung.

Gesucht war also ein Name für *Grundlage plus Sicht*, nicht für Windkraft und nicht
für Funk.

### Der Fund: **sichtgrund.de**

Frei, und dazu `.com`, `.eu` und `.app`. Das ganze Nest ist zu haben.

Das Wort trägt drei Bedeutungen gleichzeitig, und alle drei stimmen:
1. **Der Grund, über den man sieht** — das Gelände, das DOM, der Rohstoff.
2. **Die Grundlage der Sicht** — das vorgerechnete Raster, auf dem alles aufsetzt.
3. **Der Sichtgrund im Sinne von Begründung** — genau das, was ein Beteiligungs-
   verfahren oder eine Netzplanung braucht: keine Behauptung, sondern ein belegter Befund.

Dazu kommt: kein Fachjargon, am Telefon buchstabierbar, festgelegt auf nichts außer
Sicht und Gelände.

```
ar.sichtgrund.de      AR-Darstellung, öffentlich
api.sichtgrund.de     Elevation-API, Doku und Demo
www.sichtgrund.de     was das ist, für wen
```

### Weitere freie Funde aus derselben Runde

| Domain | Gedanke |
|---|---|
| grundsicht.de | dieselbe Idee andersherum, `.com` aber vergeben |
| blickgrund.de | weicher, mehr Landschaft als Technik |
| sichtstand.de | Sicht plus Standort, sachlich |
| gelaendeklar.de | betont das Ergebnis: hinterher ist klar, was Sache ist |
| sichtwissen.de, hoehenklar.de, sichtfreigabe.de | solide, aber weniger dicht |

**Vergeben:** sichtsache.de, blickfrei.de, klarblick.de, fernsicht.de, sichtfaktor.de,
sichtpunkt.de

---

## Englische Richtung (2026-09-13, Stichworte: ground truth, elevation, earth, plot, land, view)

**„Ground truth" ist der stärkste Begriff der ganzen Liste.** In Geodaten und
Maschinellem Lernen heißt er: der überprüfte, tatsächliche Befund, an dem sich
alles andere messen lassen muss. Genau das verkaufst du — nicht eine Schätzung
aus einem globalen 30-Meter-Modell, sondern amtliche Messung mit einem Meter.

### Frei und aus meiner Sicht gut

| Domain | Gedanke | Haken |
|---|---|---|
| **truelevation.io** (`.de`, `.app` auch frei) | Wortspiel aus *true elevation* und *elevation* — Wahrheit und Höhe in einem Wort. Enthält den Produktbegriff, den ein Entwickler sucht | `.com` ist vergeben; am Telefon muss man es einmal erklären |
| **groundsight.io** | Wörtlich Boden plus Sicht, also genau Sichtlinie über Gelände. Nichts zu buchstabieren, keine Doppeldeutigkeit | etwas generisch |
| **terraplot.io** (`.app` frei) | Gelände plus Kachel/Parzelle. Klingt nach Werkzeug, nicht nach Beratung | `.com` vergeben |
| **plotview.io** | Parzelle plus Ansicht — trifft die AR-Seite gut | sagt nichts über Höhe |
| **landview.io** (`.app` frei) | schlicht, breit einsetzbar | austauschbar |
| **geotruth.io** | die Ground-Truth-Idee kurz | klingt eine Spur nach Weltanschauung |
| **earthplot.io** | Erde plus Kachel | „earth" ist global gedacht, du bist es nicht |
| **groundtruthelevation.com** | sagt alles, wirklich alles | zu lang zum Diktieren |

**Vergeben:** groundtruth.io/.app, trueground.io, truelevation.com, elevationtruth.com,
groundview.io, terrasight.io, landsight.io, sightline.io, siteline.io, linesight.io,
earthview.io, terraplot.com, elevate.earth

### Deutsch oder Englisch?

Beides hat ein Argument:
- **Deutsch (`sichtgrund.de`)** gewinnt bei denen, die zahlen sollen: Gemeinden,
  Planungsbüros, Netzplanung in Deutschland. Am Telefon sofort klar, wirkt bodenständig.
- **Englisch (`truelevation.io`)** gewinnt bei Entwicklern, die eine API einbauen,
  und lässt die Tür nach draußen offen.

**Mein Rat:** `sichtgrund.de` als Hausadresse, `truelevation.io` dazunehmen und auf
dieselbe Stelle zeigen lassen, falls die API später ein eigenes Gesicht bekommen soll.
Zwei Namen kosten zusammen unter 40 Euro im Jahr. Zwei *Marken* zu pflegen kostet
dagegen richtig Zeit — also eine davon führen, die andere nur parken.

---

## Richtung Präzision (2026-09-13)

**Vorab eine Warnung, die zum Namen gehört:** Deine Auflösung ist **ein Meter**, und
die Quelle ist amtlich. Das ist genau, aber es ist nicht Millimeter. Ein Name, der
mehr verspricht, fällt dir beim ersten Fachgespräch auf die Füße. „Metergenau" darfst
du behaupten, „millimetergenau" nicht. Der Vorteil gegenüber dem Wettbewerb ist ohnehin
nicht die absolute Genauigkeit, sondern dass die Genauigkeit **überhaupt verfügbar** ist:
1 m statt 30 m aus globalen Modellen.

### Deutsch, frei

| Domain | Gedanke | Bewertung |
|---|---|---|
| **metergenau.de** | Sagt exakt, was stimmt: auf den Meter genau. Ein Wort, das jeder Handwerker, Planer und Bürgermeister sofort versteht, und das nichts verspricht, was du nicht hältst | **stärkster Kandidat dieser Runde** |
| **sichtgenau.de** | Verbindet Präzision mit dem Ergebnis: die Sicht, genau bestimmt. Nah an sichtgrund, aber mit Betonung auf Güte statt Grundlage | sehr gut |
| **hoehengenau.de** | dieselbe Idee von der Datenseite | etwas technischer, weniger Marke |
| **meterscharf.de** | „scharf" klingt nach Bild und Auflösung, passt zur AR-Seite | ungewöhnlich, bleibt hängen, ist aber erklärungsbedürftig |

### Englisch, frei

| Domain | Gedanke |
|---|---|
| **precisight.io** | Verschmelzung aus *precision* und *sight* — Präzision und Sicht in einem Wort, kurz und merkfähig |
| **onemeter.io** | Das Versprechen als Name: ein Meter. Ehrlich, prüfbar, international sofort verständlich |
| **truemeter.io** | *true* plus *meter*, verbindet Ground-Truth-Gedanke mit der Auflösung (`.com` vergeben) |
| **precisionground.io** | ausgeschrieben, seriös, etwas lang |
| **exactground.io**, **metergrid.io**, **meterview.io** | solide Zweitwahl |

**Vergeben:** grundgenau.de, truemeter.com, precisionterrain.com

### Einordnung gegenüber den bisherigen Favoriten

- **sichtgrund.de** beschreibt die *Grundlage* — was du hast.
- **metergenau.de** beschreibt die *Güte* — wie gut es ist.
- **truelevation.io** beschreibt die *Wahrheit* — dass es stimmt.

Alle drei erzählen dieselbe Geschichte aus verschiedenen Richtungen. Wenn du den
Kaufgrund deiner Kunden in den Mittelpunkt stellen willst, ist **metergenau.de** der
direkteste Treffer: Kein Planer kauft „Grundlage", er kauft Verlässlichkeit auf den Meter.
