"""
Cloud Run Job: Batch-Ausbau. Arbeitet MODELS nacheinander ab, über mehrere
Tasks parallel (Sharding nach CLOUD_RUN_TASK_INDEX). Resume-sicher: schon auf R2
vorhandene Kacheln werden übersprungen — so macht der Job dort weiter, wo der
abgebrochene Colab-Lauf aufgehört hat.

ENV:
  MODELS   z.B. "NRW_DOM,NRW_DGM"   (Default)
  BUCKET   Default windrad-tiles
  WORKERS  Threads je Task (Default 8)
  R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
  CLOUD_RUN_TASK_INDEX / CLOUD_RUN_TASK_COUNT  (von Cloud Run gesetzt)
"""
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
import tileproc as tp

BUCKET = os.environ.get('BUCKET', 'windrad-tiles')
MODELS = [m.strip() for m in os.environ.get('MODELS', 'NRW_DOM,NRW_DGM').split(',') if m.strip()]
WORKERS = int(os.environ.get('WORKERS', '8'))
TASK_INDEX = int(os.environ.get('CLOUD_RUN_TASK_INDEX', '0'))
TASK_COUNT = int(os.environ.get('CLOUD_RUN_TASK_COUNT', '1'))


def main():
    s3 = tp.r2_client()
    for preset in MODELS:
        files = tp.list_all_tiles(preset)
        tiles = sorted(files)
        done = tp.list_done(s3, BUCKET, preset)
        # Diese Task nimmt jede TASK_COUNT-te Kachel; Fertiges wird übersprungen.
        todo = [t for i, t in enumerate(tiles)
                if i % TASK_COUNT == TASK_INDEX and t not in done]
        print(f"[{preset}] Task {TASK_INDEX + 1}/{TASK_COUNT}: "
              f"{len(tiles)} gesamt, {len(done)} schon da, {len(todo)} zu tun", flush=True)

        ok = err = 0
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(tp.process_tile, s3, BUCKET, preset, tx, ty, files[(tx, ty)]): (tx, ty)
                    for (tx, ty) in todo}
            for f in as_completed(futs):
                try:
                    f.result(); ok += 1
                except Exception as e:
                    err += 1
                    print(f"  ERR {futs[f]}: {e}", flush=True)
                if (ok + err) % 200 == 0:
                    print(f"[{preset}] {ok + err}/{len(todo)} (ok {ok}, err {err})", flush=True)
        print(f"[{preset}] Task {TASK_INDEX} FERTIG: ok {ok}, err {err}", flush=True)

        if err:
            # Task als fehlgeschlagen markieren -> Cloud Run kann sie retryen (Resume greift).
            raise SystemExit(f"{err} Kacheln fehlgeschlagen in {preset}")
    print("ALLE MODELLE FERTIG:", MODELS, flush=True)


if __name__ == '__main__':
    main()
