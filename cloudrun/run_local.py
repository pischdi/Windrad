#!/usr/bin/env python3
"""
Lokaler Kachel-Runner — für einen Rechner, der eh 24/7 läuft (z. B. WSL2 auf Windows).

Warum lokal statt Cloud Run? Die Arbeit ist *download-limitiert* (manche Länder-Portale
drosseln stark, z. B. Brandenburg ~12 KB/s). In der Cloud bezahlt man teure CPU fürs
*Warten*; auf einem eigenen Dauerläufer kostet das Warten nichts. R2-Upload ist ohnehin
kostenlos (kein Egress). Voll-Builds sind Einmal-Läufe (~1×/Jahr bei Neubefliegung).

Eigenschaften:
- **Resume-sicher**: liest vorhandene Kacheln aus R2 (`list_done`) und überspringt sie.
  Jederzeit mit Ctrl-C abbrechbar; beim nächsten Start geht's weiter.
- **Thread-Pool** (WORKERS) lädt/verarbeitet/uploadet parallel — CPU-günstig.
- **Fortschritt + ETA** werden regelmäßig ausgegeben.
- Mehrere Modelle nacheinander (MODELS, z. B. "BB_DOM" oder "BB_DOM,BB_DGM").
- Optional auf ein Gebiet begrenzen (AREA_BBOX = "süd,west,nord,ost" in lat/lon).

Konfiguration über Umgebungsvariablen (siehe .env.example):
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  (Pflicht)
  BUCKET   (Default windrad-tiles)
  MODELS   (Default BB_DOM)          z. B. "BB_DOM" | "BB_DOM,BB_DGM" | "NRW_DOM"
  WORKERS  (Default 24)              parallele Downloads/Verarbeitungen
  AREA_BBOX (optional)               "52.0,13.0,52.6,14.0"  -> nur dieses Rechteck
  UPLOAD_GZ (Default 1)              zusätzlich .bin.gz hochladen (1/0)
  FORCE_LIST (optional)              Datei mit Kacheln, die *trotz* Bestand neu
                                     gerechnet werden (Format `<x>_<y>`, `#` = Kommentar)
  FORCE_LIST_<PRESET> (optional)     dasselbe, aber nur für ein Modell — schlägt
                                     FORCE_LIST, z. B. FORCE_LIST_NRW_DOM
  DRY_RUN  (Default 0)               nur zählen und melden, nichts laden/hochladen
"""
import os
import sys
import time
import signal
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import tileproc as tp

BUCKET = os.environ.get("BUCKET", "windrad-tiles")
MODELS = [m.strip() for m in os.environ.get("MODELS", "BB_DOM").split(",") if m.strip()]
WORKERS = int(os.environ.get("WORKERS", "24"))
UPLOAD_GZ = os.environ.get("UPLOAD_GZ", "1") not in ("0", "false", "False", "")
DRY_RUN = os.environ.get("DRY_RUN", "0") not in ("0", "false", "False", "")

_stop = threading.Event()


def _force_path(preset):
    """Pfad der Zwangsliste für dieses Modell, oder None.

    `FORCE_LIST_<PRESET>` schlägt `FORCE_LIST`. Damit lässt sich eine Liste auf ein
    einzelnes Modell begrenzen, wenn im selben Lauf noch andere Modelle stehen, die
    sie nichts angeht.
    """
    raw = (os.environ.get(f"FORCE_LIST_{preset}")
           or os.environ.get("FORCE_LIST") or "").strip()
    if not raw:
        return None
    # Relativ heißt: neben run_local.py. Der Wächter startet uns zwar aus diesem
    # Verzeichnis, aber ein Handstart aus der Projektwurzel soll nicht stillschweigend
    # eine leere Liste ergeben.
    if os.path.isabs(raw):
        return raw
    return os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), raw))


def read_force_list(preset):
    """Kacheln, die trotz vorhandenem Bestand neu gerechnet werden sollen -> {(x, y)}.

    Je Zeile `<x>_<y>`; alles ab `#` ist Kommentar, leere Zeilen fallen raus.

    Eine fehlende Datei ist ein Abbruchgrund und kein Achselzucken: ein Tippfehler im
    Pfad ginge sonst als "nichts zu tun" durch, der Lauf wäre umsonst und man merkte
    es erst, wenn die kaputten Kacheln immer noch kaputt sind.
    """
    path = _force_path(preset)
    if not path:
        return set()
    if not os.path.isfile(path):
        raise SystemExit(f"FEHLT: Zwangsliste für {preset} nicht gefunden: {path}")
    out = set()
    with open(path, encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            try:
                x, y = line.split("_")
                out.add((int(x), int(y)))
            except ValueError:
                raise SystemExit(f"Zwangsliste {path}, Zeile {lineno}: "
                                 f"'{line}' ist kein <x>_<y>")
    return out


def _area_bbox(preset):
    """AREA_BBOX (lat/lon) -> UTM-km-Rechteck für die Zone des Presets, oder None."""
    raw = os.environ.get("AREA_BBOX", "").strip()
    if not raw:
        return None
    s, w, n, e = (float(x) for x in raw.split(","))
    return tp.bbox_km({"bbox": (s, w, n, e)}, tp.PRESETS[preset]["zone"])


def _fmt_eta(seconds):
    if seconds <= 0 or seconds != seconds:  # <=0 oder NaN
        return "?"
    h, rem = divmod(int(seconds), 3600)
    m, _ = divmod(rem, 60)
    return f"{h}h{m:02d}m"


def run_model(s3, preset):
    if preset not in tp.PRESETS:
        print(f"[{preset}] UNBEKANNTES Preset — übersprungen", flush=True)
        return
    print(f"[{preset}] Verzeichnis vom Portal lesen …", flush=True)
    files = tp.list_all_tiles(preset)
    tiles = sorted(files.keys())

    bb = _area_bbox(preset)
    if bb:
        x0, x1, y0, y1 = bb
        tiles = [(x, y) for (x, y) in tiles if x0 <= x <= x1 and y0 <= y <= y1]
        print(f"[{preset}] auf Gebiet begrenzt: {len(tiles)} Kacheln im Rechteck", flush=True)

    print(f"[{preset}] bereits vorhandene Kacheln in R2 ermitteln (Resume) …", flush=True)
    done = (tp.list_done_api(preset) if os.environ.get('UPLOAD_URL')
            else tp.list_done(s3, BUCKET, preset))

    # Zwangsliste: Kacheln, die im Bestand liegen, aber falsch sind (z. B. die vor der
    # Dezimeter-Umstellung gerechneten NRW-Kacheln über 655,35 m). Sie aus `done` zu
    # nehmen ist der ganze Trick — danach fallen sie durch die normale Resume-Logik
    # wieder in `todo` und werden überschrieben.
    forced = read_force_list(preset)
    if forced:
        im_raster = forced & set(tiles)
        zusaetzlich = im_raster & done
        done = done - forced
        print(f"[{preset}] Zwangsliste {_force_path(preset)}: {len(forced)} Einträge · "
              f"{len(zusaetzlich)} davon im Bestand -> zusätzlich zu tun", flush=True)
        fremd = forced - im_raster
        if fremd:
            print(f"[{preset}] Hinweis: {len(fremd)} Einträge der Zwangsliste stehen nicht im "
                  f"Kachelverzeichnis dieses Modells — übergangen.", flush=True)

    todo = [t for t in tiles if t not in done]
    total = len(tiles)
    print(f"[{preset}] {total} gesamt · {len(done & set(tiles))} schon da · "
          f"{len(todo)} zu tun · {WORKERS} Worker", flush=True)
    if not todo:
        print(f"[{preset}] ✓ nichts zu tun — komplett.", flush=True)
        return

    # Ein Arbeitspaket je Quelldatei. Bei 1-km-Ländern ist das 1:1 wie bisher; bei
    # Sachsens 2-km-Kacheln teilen sich bis zu vier Zielkacheln einen Download.
    groups = tp.group_sources({t: files[t] for t in todo})
    if len(groups) != len(todo):
        print(f"[{preset}] {len(groups)} Quelldateien für {len(todo)} Zielkacheln "
              f"(Ø {len(todo)/len(groups):.2f} Kacheln je Download)", flush=True)

    if DRY_RUN:
        print(f"[{preset}] TROCKENLAUF — hier wäre Schluss mit Rechnen: "
              f"kein Download, kein Upload.", flush=True)
        return

    ok = err = 0
    errors_shown = 0
    t_start = time.time()
    t_last = t_start
    last_count = 0
    lock = threading.Lock()

    def work(group):
        fname, targets = group
        tp.process_source(s3, BUCKET, preset, fname, targets, upload_gz=UPLOAD_GZ)
        return group

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(work, g): g for g in groups}
        try:
            for f in as_completed(futs):
                fname, targets = futs[f]
                try:
                    f.result()
                    ok += len(targets)
                except Exception as e:
                    err += len(targets)
                    if errors_shown < 10:
                        print(f"[{preset}]   FEHLER {fname} ({len(targets)} Kacheln): {e}",
                              flush=True)
                        errors_shown += 1

                n = ok + err
                now = time.time()
                # Fortschritt alle 25 Kacheln oder alle 30 s. Schwelle statt Modulo,
                # weil ein Arbeitspaket mehrere Kacheln auf einmal zählen kann.
                if (n - last_count) >= 25 or (now - t_last) >= 30:
                    with lock:
                        dt = max(now - t_last, 1e-6)
                        rate_win = (n - last_count) / dt * 60.0          # Kacheln/min (Fenster)
                        rate_avg = n / max(now - t_start, 1e-6) * 60.0    # Kacheln/min (gesamt)
                        remaining = len(todo) - n
                        eta = remaining / max(rate_avg / 60.0, 1e-9)
                        pct = 100.0 * n / len(todo)
                        print(f"[{preset}] {n}/{len(todo)} ({pct:4.1f}%) · "
                              f"ok={ok} err={err} · {rate_win:5.1f}/min (Ø {rate_avg:5.1f}) · "
                              f"ETA {_fmt_eta(eta)}", flush=True)
                        t_last = now
                        last_count = n

                if _stop.is_set():
                    print(f"[{preset}] Abbruch angefordert — laufende Downloads zu Ende, "
                          f"keine neuen. (Resume beim nächsten Start)", flush=True)
                    for fu in futs:
                        fu.cancel()
                    break
        except KeyboardInterrupt:
            _stop.set()

    dt = time.time() - t_start
    print(f"[{preset}] fertig-für-jetzt: ok={ok} err={err} in {_fmt_eta(dt)} "
          f"({ok/max(dt,1e-6)*60:.1f}/min). {'ABGEBROCHEN' if _stop.is_set() else 'DURCH'}",
          flush=True)


def main():
    # Zwei Betriebsarten: über die Elevation-API (kein S3-Zugang noetig) oder
    # klassisch mit R2-Schluesseln. Geprueft wird nur, was der gewaehlte Weg braucht.
    via_api = bool(os.environ.get("UPLOAD_URL"))
    needed = ("UPLOAD_URL", "UPLOAD_KEY") if via_api else (
        "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
    missing = [k for k in needed if not os.environ.get(k)]
    if missing:
        print("FEHLT: " + ", ".join(missing) + " — siehe .env.example / LOCAL_RUNNER.md",
              file=sys.stderr)
        sys.exit(2)

    def _sig(_signum, _frame):
        if not _stop.is_set():
            print("\n(Stop-Signal — sauberes Herunterfahren, bitte kurz warten …)", flush=True)
            _stop.set()
    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    # Zwangslisten vorab lesen: ein falscher Pfad soll in der ersten Sekunde auffallen
    # und nicht erst Stunden später, wenn das Modell davor endlich durch ist.
    vorgemerkt = {p: len(read_force_list(p)) for p in MODELS}

    s3 = None if via_api else tp.r2_client()
    print(f"Runner gestartet · Weg={'API' if via_api else 'S3'} · Bucket={BUCKET} · "
          f"Modelle={MODELS} · Worker={WORKERS} · "
          f"gz={'an' if UPLOAD_GZ else 'aus'}"
          f"{' · TROCKENLAUF' if DRY_RUN else ''}", flush=True)
    for preset, n in vorgemerkt.items():
        if n:
            print(f"  Zwangsliste {preset}: {n} Kacheln aus {_force_path(preset)}", flush=True)
    for preset in MODELS:
        if _stop.is_set():
            break
        run_model(s3, preset)
    print("Runner beendet." + ("" if not _stop.is_set() else " (durch Stop)"), flush=True)


if __name__ == "__main__":
    main()
