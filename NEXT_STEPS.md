# Nächste Schritte — Übergabe (für Dispatch/Handy-Session)

**Stand:** 2026-07-11 · Kontext liegt auch in Memory: `windrad-project-state`, `windrad-bundeslaender-expansion`.

## Wo wir gerade stehen
- ✅ **Losspinne (LoS-Test-Light) gebaut** — neue Route `/losspinne` im Worker `elevation-api/index.js` (analog `/demo`, same-origin, kein CORS/Key nötig). Lokal end-to-end getestet (echte Höhendaten via R2-Fallback): Standort setzen → 4 Spinnen-Linien (grün/orange/rot) → Klick auf Linie → Höhenprofil. Ziele sind die 4 Windräder aus `windraeder.csv` (Spitzenhöhe = Nabe + Rotor/2). **Noch NICHT deployt** — `cd elevation-api && wrangler deploy` (Login vorhanden), dann live unter `.../losspinne`.
- ⏳ Offen: **R2-Upload für die Colab-Kachel-Pipeline** (siehe unten).

## Losspinne — offene Punkte
- **Deploy** steht noch aus (bewusst nicht automatisch gepusht).
- Standorte werden aktuell per Karten-Klick gesetzt. Sobald die **Standortliste (mit Adressen)** da ist: Adressen → lat/lon **geocoden**, dann als Default-Standorte einspeisen. Ziele (Windräder) sind fest verdrahtet — bei neuen Windrädern das `TURBINES`-Array in `LOSSPINNE_HTML` erweitern.
- Lokaler Start: `.claude/launch.json` (Config `elevation-api`) oder `cd elevation-api && wrangler dev` → `http://127.0.0.1:8788/losspinne`.

## Sofort dran (R2-Key → Colab)
1. In Cloudflare **R2 API Token** erstellen: Permission **Object Read & Write**, nur Bucket `windrad-tiles`. (Token-Seite war offen, Einstellungen korrekt.)
2. Nach "Create" die **Access Key ID** + **Secret Access Key** (nur 1× sichtbar) in **Colab-Secrets** eintragen:
   - `R2_ACCESS_KEY_ID` = Access Key ID
   - `R2_SECRET_ACCESS_KEY` = Secret Access Key
   - `R2_ACCOUNT_ID` = `975505fa80cf3d0f8e0c3b049e9c6112` (ist schon Default im Notebook)
3. Notebook `colab/process_brandenburg_bdom.ipynb` öffnen, Zellen der Reihe nach. **Erfolgssignal Zelle 2:** `R2-Client bereit. Account: 975505fa…`
4. **`BBOX_KM` NICHT auf ganz-BB lassen** — erst auf die Region der Standortliste eingrenzen (spart ~680 GB Download).

## Blockiert / brauche von dir
- **Standortliste** kommt **mit Adressen** (nicht lat/lon). → Vor BBOX-Rechnung müssen die Adressen **geocodet** werden (Adresse → lat/lon). Danach: **Bounding-Box der UTM32/33-Kacheln** ausrechnen → exakter `BBOX_KM`-Wert fürs Notebook. Dieselbe geocodete Liste speist die Default-Standorte der Losspinne.
- **Cloudflare-Login** (Browser via GitHub) für den R2-Token-Schritt.

## Elevation-API (live, gesund)
- Health/Point getestet OK. Endpoints: `/v1/point`, `/v1/profile`, `/v1/line-of-sight`, `/v1/viewshed`, `/docs`, `/demo`.
