# Lokaler Kachel-Runner (WSL2 / Dauerläufer)

Baut die Höhen-Kacheln **auf einem eigenen 24/7-Rechner** statt in der Cloud und lädt sie nach R2.
Ideal, weil die Arbeit **download-limitiert** ist (manche Portale drosseln stark, z. B. Brandenburg
~12 KB/s) — in der Cloud bezahlt man CPU fürs Warten, hier kostet das Warten **nichts**. R2-Upload
ist kostenlos (kein Egress). Voll-Builds sind Einmal-Läufe (~1×/Jahr bei Neubefliegung).

**Resume-sicher:** Jederzeit mit Ctrl-C stoppen; beim nächsten Start macht er dort weiter
(liest vorhandene Kacheln aus R2 und überspringt sie). Kein Datenverlust.

---

## Dateien
- `tileproc.py` — Kernlogik (Download → 1-m-Grid → R2). Gemeinsam mit der Cloud-Variante.
- `run_local.py` — der lokale Treiber (Thread-Pool, Fortschritt/ETA, Resume, Stop per Ctrl-C).
- `run_local.sh` — Start-Wrapper (venv + .env laden; Vordergrund oder Hintergrund).
- `requirements-local.txt` — nur die nötigen Pakete (ohne Server-Teile).
- `.env.example` → kopieren nach `.env` (gitignored) und R2-Schlüssel eintragen.

---

## Einrichtung in WSL2 (Ubuntu)

```bash
# 1) Systempakete (rasterio-Wheels bündeln GDAL; libexpat wird zur Laufzeit gebraucht)
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip libexpat1

# 2) Diesen Ordner auf die Maschine bringen (z. B. per git clone des Repos, dann:)
cd <repo>/cloudrun

# 3) Zugangsdaten eintragen
cp .env.example .env
nano .env          # R2_ACCESS_KEY_ID (32 Hex) + R2_SECRET_ACCESS_KEY (64 Hex) einsetzen

# 4) Start (legt beim ersten Mal automatisch .venv an und installiert die Pakete)
chmod +x run_local.sh
./run_local.sh            # Vordergrund
#   oder dauerhaft im Hintergrund (überlebt Terminal/SSH-Schließen):
./run_local.sh bg
tail -f run_local.log     # mitlesen
```

Stoppen: im Vordergrund **Ctrl-C**; im Hintergrund `pkill -f run_local.py`.
Beides ist sauber — Resume beim nächsten Start.

---

## Rechner wach halten (wichtig!)
- **Windows:** Energieoptionen → im Netzbetrieb **„Energiesparmodus: nie"**. Sonst pausiert WSL.
- WSL2 selbst fährt nicht herunter, solange ein Prozess läuft und Windows wach ist.
- Läuft der Rechner per Remote/SSH: `run_local.sh bg` (setsid) oder `tmux`/`screen` nutzen,
  damit der Lauf das Schließen der Sitzung übersteht.

---

## Was einstellen (.env)
| Variable | Default | Bedeutung |
|---|---|---|
| `MODELS` | `BB_DOM` | Was bauen. Mehrere: `BB_DOM,BB_DGM`. Weitere Presets siehe `tileproc.py`. |
| `WORKERS` | `24` | Parallele Downloads. Höher = mehr Last aufs Portal (Vorsicht bei Drosselung). |
| `AREA_BBOX` | — | Nur ein Rechteck `süd,west,nord,ost` (lat/lon) statt ganzem Land. |
| `UPLOAD_GZ` | `1` | Zusätzlich `.bin.gz` hochladen (der Worker bevorzugt gz). |

**Empfohlener erster Lauf:** `MODELS=BB_DOM` (Brandenburg-Oberfläche für die Losspinne).
Danach bei Bedarf `MODELS=BB_DGM` für die Gefälle-/Aufstellflächen-Prüfung nachziehen.

---

## Fortschritt deuten
```
[BB_DOM] 5200/28700 (18.1%) · ok=5198 err=2 · 640.0/min (Ø 610.0) · ETA 0h38m
```
`ok`/`err` = erfolgreich/fehlgeschlagen, `…/min` = aktuelle/Ø-Rate, `ETA` = Restzeit-Schätzung.
Einzelne `err` (z. B. 502 vom Portal) sind unkritisch — die Kachel wird beim nächsten Lauf
einfach neu versucht (Resume).

---

## Kosten
- Lokaler Rechner: nur Strom (läuft ja ohnehin).
- R2: Upload/Speicher im kostenlosen/günstigen Rahmen, **kein Egress-Entgelt**.
- Die Cloud-Run-Variante (`job.py`/`README.md`) bleibt als gedeckelte Reserve bestehen,
  kostet aber nur, während eine Execution läuft.
