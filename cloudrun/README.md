# Cloud Run: Höhen-Kachel-Pipeline

Ein Container, zwei Betriebsarten (gleicher Code, `cloudrun/tileproc.py`):
- **Job** (`job.py`): einmaliger Batch-Ausbau (z. B. ganz NRW), über viele Tasks parallel, **resume-sicher**.
- **Service** (`server.py`): On-Demand-Endpoint `POST /ensure` für kleine Suchkreise (später).

Voraussetzung: GCP-Projekt mit aktivierten APIs (`run`, `artifactregistry`, `cloudbuild`), `gcloud` eingeloggt,
Region gesetzt (`gcloud config set run/region europe-west3`).

---

## 1. R2-Zugangsdaten als Secret (einmalig)

```bash
gcloud services enable secretmanager.googleapis.com

# Deine R2-Werte einsetzen (die aus den Colab-Secrets):
printf 'DEIN_R2_ACCESS_KEY_ID'      | gcloud secrets create r2-access-key --data-file=-
printf 'DEIN_R2_SECRET_ACCESS_KEY'  | gcloud secrets create r2-secret-key --data-file=-

# Cloud Run (Default-Compute-Service-Account) darf die Secrets lesen:
PN=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
SA="serviceAccount:${PN}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding r2-access-key --member="$SA" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding r2-secret-key --member="$SA" --role=roles/secretmanager.secretAccessor
```
*(Die Account-ID `975505fa80cf3d0f8e0c3b049e9c6112` ist nicht geheim — die kommt als Env-Var.)*

---

## 2. Job deployen & starten (NRW-Restausbau)

Baut das Image aus diesem Ordner (Cloud Build), legt den Job an:

```bash
gcloud run jobs deploy nrw-tiles \
  --source cloudrun \
  --region europe-west3 \
  --command python3 --args job.py \
  --tasks 20 --parallelism 20 \
  --task-timeout 3600 --max-retries 3 \
  --memory 1Gi --cpu 1 \
  --set-env-vars "^@^R2_ACCOUNT_ID=975505fa80cf3d0f8e0c3b049e9c6112@BUCKET=windrad-tiles@MODELS=NRW_DOM,NRW_DGM@WORKERS=8" \
  --set-secrets "R2_ACCESS_KEY_ID=r2-access-key:latest,R2_SECRET_ACCESS_KEY=r2-secret-key:latest"

gcloud run jobs execute nrw-tiles --region europe-west3
```

- **20 Tasks** teilen sich die Kacheln (Sharding). Jede überspringt, was schon auf R2 liegt
  → die ~13.500 fertigen DOM-Kacheln aus dem Colab-Lauf werden **nicht** neu gerechnet.
- Rest ~58k Kacheln / 20 Tasks / 8 Threads ≈ **wenige Minuten pro Task**.
- `--max-retries 3`: schlägt eine Task fehl (Netzfehler), läuft sie neu — Resume greift.

**Fortschritt/Logs:**
```bash
gcloud run jobs executions list --job nrw-tiles --region europe-west3
# oder in der Console: Cloud Run -> Jobs -> nrw-tiles -> Ausführung -> Logs
```

**Danach:** Abdeckungs-Manifest neu bauen (für die Losspinne). Entweder Zelle 9 im Colab, oder
lokal per `sites_from_coords.py`, sobald `tiles/windrad-tiles.txt` aktualisiert ist.

### Andere Gebiete / Modelle
`MODELS` und (optional) `AREA` über Env-Vars steuern — z. B. nur DGM, oder nur ein Ausschnitt:
`MODELS=NRW_DGM` bzw. den Job ohne `--tasks` für kleine Läufe.

---

## 3. (Später) /ensure-Service deployen

```bash
gcloud run deploy ensure-tiles \
  --source cloudrun \
  --region europe-west3 \
  --no-allow-unauthenticated \
  --memory 1Gi --cpu 1 --timeout 600 \
  --set-env-vars "R2_ACCOUNT_ID=975505fa80cf3d0f8e0c3b049e9c6112,BUCKET=windrad-tiles,MAX_TILES=200" \
  --set-secrets "R2_ACCESS_KEY_ID=r2-access-key:latest,R2_SECRET_ACCESS_KEY=r2-secret-key:latest"
```
Aufruf (Beispiel, Suchkreis 1 km um einen Punkt, beide Modelle):
```bash
curl -X POST "$SERVICE_URL/ensure" -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H 'Content-Type: application/json' \
  -d '{"models":["NRW_DOM","NRW_DGM"],"area":{"center":[52.2779,7.7139],"radius_km":1}}'
```
Die Frontend-Anbindung (Button „Bereich verarbeiten" bei `OUT_OF_COVERAGE`) kommt danach in den Worker/die Losspinne.

---

## Kosten
Scale-to-zero: es läuft nur während der Verarbeitung. R2 hat keinen Egress. Der einmalige
NRW-Ausbau kostet ~ein paar Cent Compute; Speicher ~144 GB (DOM+DGM) ≈ 5 $/Monat auf R2.
