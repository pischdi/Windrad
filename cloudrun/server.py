"""
Cloud Run Service: On-Demand-Nachladen kleiner Gebiete (Suchkreise ~1 km²).
Synchron — bei ~8 Kacheln dauert das <1 min, daher kein Queue/DO nötig.

POST /ensure
  Body: { "models": ["NRW_DOM","NRW_DGM"],
          "area": {"center":[lat,lon],"radius_km":1}  ODER  "bbox":[xmin,xmax,ymin,ymax] (UTM-km) }
  -> verarbeitet die fehlenden Kacheln im Gebiet, gibt Statistik zurück.

Schutz: MAX_TILES begrenzt die Gebietsgröße (verhindert versehentliche Riesenläufe).
Auth: idealerweise nicht öffentlich deployen (Cloud Run --no-allow-unauthenticated)
und der Worker ruft mit Identity-Token auf; oder ein API-Key-Header prüfen.
"""
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, jsonify
import tileproc as tp

BUCKET = os.environ.get('BUCKET', 'windrad-tiles')
WORKERS = int(os.environ.get('WORKERS', '8'))
MAX_TILES = int(os.environ.get('MAX_TILES', '200'))
API_KEY = os.environ.get('ENSURE_API_KEY', '')  # optional: Header X-Api-Key

app = Flask(__name__)
_s3 = None


def s3():
    global _s3
    if _s3 is None:
        _s3 = tp.r2_client()
    return _s3


_listing_cache = {}


def _tiles_cached(preset):
    if preset not in _listing_cache:
        _listing_cache[preset] = tp.list_all_tiles(preset)
    return _listing_cache[preset]


def _auto_presets(area, bbox):
    """Presets, deren Portal Kacheln im Gebiet hat (z. B. NRW-Punkt -> NRW_DOM+DGM)."""
    hits = []
    for preset, p in tp.PRESETS.items():
        bb = tuple(bbox) if bbox else tp.bbox_km(area, p['zone'])
        if not bb:
            continue
        x0, x1, y0, y1 = bb
        files = _tiles_cached(preset)
        if any(x0 <= x <= x1 and y0 <= y <= y1 for (x, y) in files):
            hits.append(preset)
    return hits


@app.get('/health')
def health():
    return 'ok'


@app.post('/ensure')
def ensure():
    if API_KEY and request.headers.get('X-Api-Key') != API_KEY:
        return jsonify({'error': 'unauthorized'}), 401
    body = request.get_json(force=True, silent=True) or {}
    models = body.get('models')
    area = body.get('area')
    bbox = body.get('bbox')

    # models weglassen oder "auto" -> passende Presets automatisch bestimmen
    # (jene, deren Portal Kacheln im Gebiet hat). So genügt dem Frontend das Gebiet.
    if not models or models == 'auto':
        models = _auto_presets(area, bbox)
        if not models:
            return jsonify({'ok': True, 'result': {},
                            'note': 'Für dieses Gebiet ist (noch) keine Datenquelle/Preset hinterlegt.'}), 200
    elif isinstance(models, str):
        models = [models]

    # 1) Gesamtzahl der zu holenden Kacheln vorab prüfen (Schutz).
    plan = {}
    total_todo = 0
    for preset in models:
        if preset not in tp.PRESETS:
            return jsonify({'error': f'unknown preset {preset}'}), 400
        p = tp.PRESETS[preset]
        files = tp.list_all_tiles(preset)
        tiles = sorted(files)
        bb = tuple(bbox) if bbox else tp.bbox_km(area, p['zone'])
        if bb:
            x0, x1, y0, y1 = bb
            tiles = [(x, y) for (x, y) in tiles if x0 <= x <= x1 and y0 <= y <= y1]
        done = tp.list_done(s3(), BUCKET, preset)
        todo = [t for t in tiles if t not in done]
        plan[preset] = (files, tiles, todo)
        total_todo += len(todo)

    if total_todo > MAX_TILES:
        return jsonify({'error': f'area too large: {total_todo} tiles to fetch (max {MAX_TILES})'}), 400

    # 2) Verarbeiten.
    result = {}
    for preset, (files, tiles, todo) in plan.items():
        ok = err = 0
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(tp.process_tile, s3(), BUCKET, preset, tx, ty, files[(tx, ty)]): (tx, ty)
                    for (tx, ty) in todo}
            for f in as_completed(futs):
                try:
                    f.result(); ok += 1
                except Exception:
                    err += 1
        result[preset] = {'total': len(tiles), 'todo': len(todo), 'processed': ok, 'errors': err}
    return jsonify({'ok': True, 'result': result})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', '8080')))
