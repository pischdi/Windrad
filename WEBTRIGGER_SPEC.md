# Web-Trigger: On-Demand-Höhenverarbeitung — Spezifikation

**Stand:** 2026-07-16 · Status: Design (noch nicht implementiert)

Ziel: Aus der Losspinne heraus für einen Bereich ohne Höhen-Kacheln die Verarbeitung
**per Button anstoßen**, Fortschritt sehen, bei Ende/Fehler informiert werden — ohne
manuelles Colab.

## Architektur (empfohlen: Hybrid)

```
Frontend (Losspinne)
   │  POST /process { bbox, zone }              ← Nadel + Radius ergibt bbox
   ▼
Cloudflare Worker  (Trigger + Status-API)
   │  legt Job an → Durable Object (Job-State)
   │  enqueued 1 Nachricht je Kachel
   ▼
Cloudflare Queue  (tile-jobs)
   │  push je Nachricht
   ▼
Worker-Consumer  (dünn, kein rasterio)
   │  fetch()  POST /tile { zone, x, y }
   ▼
Cloud Run  (Python + rasterio)  ── lädt bDOM-ZIP, rechnet 1-m-Grid, PUT nach R2 (tile_<zone>_E_N)
   │  200 ok / Fehler
   ▼
Worker-Consumer → Durable Object: done++/failed++ ; bei „alle fertig": Manifest-Refresh + Notify
```

**Warum so:** Rechnen (GDAL/rasterio) auf **Cloud Run** (ausgereift, scale-to-zero,
autoskalierend → BBOX in ~Minuten statt ~2 h). Orchestrierung (Trigger, State, Queue,
R2) bleibt auf **Cloudflare**. R2 hat null Egress → Cloud Run → R2 günstig.
Alternative „alles CF" via **Cloudflare Containers**, sobald aus Beta.

## Komponenten

### 1. Worker — Trigger + Status-API
- `POST /process` → Body `{ bbox: [xmin,xmax,ymin,ymax], zone: 32|33 }` (BBOX in UTM-km,
  wie im Colab). Antwort `{ jobId }`. Enqueued je Kachel eine Queue-Nachricht,
  legt Job im Durable Object an. **Auth nötig** (s. u.).
- `GET /process/:jobId` → `{ status, total, done, failed, tiles_remaining, error? }`.
- Kachelliste je BBOX: analog Colab-Zelle 3 (bDOM-Verzeichnis filtern) — entweder im
  Worker (fetch + regex) oder im Cloud-Run-Endpoint `POST /list { bbox, zone }`.

### 2. Durable Object — Job-State (Serialisierung + Fortschritt)
```
Job = { id, bbox, zone, status: 'queued'|'running'|'done'|'error',
        total, done, failed, failures: [ [x,y,msg] ], startedAt, finishedAt }
```
- Ein DO pro Job. Consumer meldet Kachel-Ergebnisse hierher (atomar). Bei `done+failed==total`
  → Status `done`, Manifest-Refresh triggern, Notify senden.

### 3. Queue `tile-jobs`
- Nachricht: `{ jobId, zone, x, y }` (eine Kachel).
- Consumer = **Worker** (kein rasterio): ruft Cloud Run `POST /tile` auf, wartet, meldet
  Ergebnis ans DO. Retry/DLQ der Queue nutzen (pro Kachel, robust).

### 4. Cloud Run — `POST /tile { zone, x, y }`
- Python-Container (rasterio, boto3, requests, numpy) mit der **bestehenden Pipeline-Logik**
  (aus `colab/process_brandenburg_bdom.ipynb`): bDOM-ZIP laden → `make_grid` (1-m, Resampling.max,
  flip) → PUT `tile_<zone>_<x>_<y>.bin`(+`.bin.gz`) nach R2.
- R2-Credentials als Cloud-Run-Secret (S3-API). Idempotent (überschreibt Kachel).
- `POST /list { bbox, zone }` optional (Kachelliste) — oder im Worker.

### 5. Benachrichtigung + Manifest
- Am Job-Ende: Worker sendet ntfy/Webhook/Mail. **Manifest-Refresh**: R2 listen
  (Logik existiert, `r2_manifest()` aus dem Notebook) → Abdeckung greift sofort in der
  Losspinne (Sites neu filtern).

## Frontend-Integration (Losspinne)
- Beim „Berechnen": Linien mit `OUT_OF_COVERAGE`/404 markieren → Hinweis
  **„Höhendaten für diesen Bereich nicht verarbeitet"** + Button **„Bereich verarbeiten"**.
- Button → `POST /process` mit BBOX aus Nadel+Radius (lat/lon → UTM-km, `warp`/vorhandene
  Umrechnung). Danach `GET /process/:id` pollen, Fortschritt anzeigen. Bei `done` Sites/Abdeckung
  neu laden und Spinne neu rechnen.

## Sicherheit / Kosten
- **Auth am Trigger:** teure Operation → Endpoint schützen (bestehende API-Key-Gate +
  strenges Rate-Limit, oder Cloudflare Access falls internes Tool). Sonst kann jeder
  große Jobs auslösen.
- **BBOX-Limit:** Obergrenze für Kachelzahl je Job (z. B. max 2000) + Bestätigung im UI.
- **Kosten:** Cloud Run scale-to-zero (nur bei Nutzung); R2 kein Egress; Queue/Worker/DO gering.

## Offene Punkte / Phasen
1. **Phase 1 (MVP):** Worker `/process`+`/status`, DO, Queue, Cloud-Run-`/tile`; Frontend-Button;
   Notify. Manifest-Refresh manuell.
2. **Phase 2:** Manifest-Refresh automatisch am Job-Ende; UI-Fortschrittsbalken; DLQ-Handling.
3. **Später:** „alles CF" via Cloudflare Containers (wenn GA), dann Cloud Run ablösbar.

## Wiederverwendbar (schon vorhanden)
- `ZONE`/`tile_key`/BBOX-aus-lat/lon, Resume (`list_done`), Manifest (`r2_manifest`) — aus
  `colab/process_brandenburg_bdom.ipynb`; wandert 1:1 in den Cloud-Run-Container.
- Worker liest `tile_<zone>_E_N` bereits (Commit `fd80a5d`) — keine Änderung nötig.
