"""
Kachel-Pipeline (wiederverwendet aus colab/process_brandenburg_bdom.ipynb).

Lädt bDOM/DGM-GeoTIFFs von den Landesportalen, rechnet auf das 1-m-Kachelraster
und lädt sie nach Cloudflare R2 (Key tile_<zone>_E_N.bin bzw. dgm_<zone>_E_N.bin).

R2-Zugang aus Umgebungsvariablen:
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, (BUCKET, Default windrad-tiles)
"""
import io, os, re, gzip, zipfile, time
import requests
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling, transform as warp_transform
from rasterio.transform import from_origin
import boto3
from botocore.config import Config

TILE_SIZE = 1000       # Meter pro Kachel
GRID = 1000            # Zellen pro Kante -> 1 m Auflösung

# Bundesland x Produkt. kind='dom' (Oberfläche, Sichtlinien) / 'dgm' (Gelände, Gefälle).
PRESETS = {
    'BB_DOM':  dict(zone=33, kind='dom', base='https://data.geobasis-bb.de/geobasis/daten/bdom/tif',
                    name_re=r'bdom_33(\d+)-(\d+)\.zip'),
    'BB_DGM':  dict(zone=33, kind='dgm', base='https://data.geobasis-bb.de/geobasis/daten/dgm/tif',
                    name_re=r'dgm_33(\d+)-(\d+)\.zip'),
    'NRW_DOM': dict(zone=32, kind='dom', base='https://www.opengeodata.nrw.de/produkte/geobasis/hm/dom1_tiff/dom1_tiff',
                    name_re=r'dom1_32_(\d+)_(\d+)_1_nw_\d+\.tif'),
    'NRW_DGM': dict(zone=32, kind='dgm', base='https://www.opengeodata.nrw.de/produkte/geobasis/hm/dgm1_tiff/dgm1_tiff',
                    name_re=r'dgm1_32_(\d+)_(\d+)_1_nw_\d+\.tif'),
}


def key_prefix(kind):
    return 'tile' if kind == 'dom' else 'dgm'


def r2_client():
    acc = os.environ['R2_ACCOUNT_ID']
    return boto3.client(
        's3',
        endpoint_url=f'https://{acc}.r2.cloudflarestorage.com',
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
        region_name='auto',
        config=Config(retries={'max_attempts': 5, 'mode': 'standard'}),
    )


def list_all_tiles(preset):
    """{(E_km, N_km): dateiname} — voller Dateiname (enthält je Land Jahr/Suffix)."""
    p = PRESETS[preset]
    html = requests.get(p['base'] + '/', timeout=180).text
    files = {}
    for m in re.finditer(p['name_re'], html):
        files[(int(m.group(1)), int(m.group(2)))] = m.group(0)
    return files


def list_done(s3, bucket, preset):
    """Bereits auf R2 vorhandene Kacheln dieses Modells/Zone (Resume)."""
    p = PRESETS[preset]
    pref = f"{key_prefix(p['kind'])}_{p['zone']}_"
    rgx = re.compile(rf"{re.escape(pref)}(\d+)_(\d+)\.bin$")
    done, token = set(), None
    while True:
        kw = {'Bucket': bucket, 'Prefix': pref}
        if token:
            kw['ContinuationToken'] = token
        r = s3.list_objects_v2(**kw)
        for o in r.get('Contents', []):
            m = rgx.match(o['Key'])
            if m:
                done.add((int(m.group(1)), int(m.group(2))))
        if r.get('IsTruncated'):
            token = r['NextContinuationToken']
        else:
            break
    return done


def make_grid(tif_bytes, tx, ty):
    """GeoTIFF -> byte-kompatibles Uint16-cm-Grid (1000x1000, row0=Süden, nodata=0)."""
    with rasterio.open(io.BytesIO(tif_bytes)) as src:
        dst = np.zeros((GRID, GRID), dtype=np.float32)
        dst_transform = from_origin(tx * TILE_SIZE, (ty + 1) * TILE_SIZE,
                                    TILE_SIZE / GRID, TILE_SIZE / GRID)
        reproject(
            source=rasterio.band(src, 1), destination=dst,
            src_transform=src.transform, src_crs=src.crs,
            dst_transform=dst_transform, dst_crs=src.crs,
            src_nodata=src.nodata, dst_nodata=0.0,
            resampling=Resampling.max)   # höchster Punkt gewinnt (wie DSM)
    dst = np.flipud(dst)                  # GeoTIFF north-up -> row0=Süden
    dst[~np.isfinite(dst)] = 0.0
    dst[dst < 0] = 0.0
    return (dst * 100.0).astype('<u2')    # cm, little-endian Uint16


def _download(url, retries=3):
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, timeout=300)
            r.raise_for_status()
            return r.content
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def process_tile(s3, bucket, preset, tx, ty, fname, upload_gz=True):
    """Eine Kachel: laden -> Grid -> R2 (.bin + optional .bin.gz)."""
    p = PRESETS[preset]
    content = _download(f"{p['base']}/{fname}")
    if fname.lower().endswith('.zip'):
        zf = zipfile.ZipFile(io.BytesIO(content))
        inner = next(n for n in zf.namelist() if n.lower().endswith(('.tif', '.tiff')))
        tif = zf.read(inner)
    else:
        tif = content                     # NRW & Co.: GeoTIFF direkt
    raw = make_grid(tif, tx, ty).tobytes()
    assert len(raw) == GRID * GRID * 2, f'falsche Größe {len(raw)}'
    base = f"{key_prefix(p['kind'])}_{p['zone']}_{tx}_{ty}"
    s3.put_object(Bucket=bucket, Key=base + '.bin', Body=raw,
                  ContentType='application/octet-stream')
    if upload_gz:
        s3.put_object(Bucket=bucket, Key=base + '.bin.gz', Body=gzip.compress(raw),
                      ContentType='application/gzip')


def bbox_km(area, zone):
    """lat/lon-Gebiet -> UTM-km-Rechteck (xmin,xmax,ymin,ymax) fuer die aktive Zone."""
    if not area:
        return None
    epsg = 25832 if zone == 32 else 25833

    def u(lat, lon):
        xs, ys = warp_transform('EPSG:4326', f'EPSG:{epsg}', [lon], [lat])
        return xs[0] / 1000, ys[0] / 1000

    if 'center' in area:
        (la, lo), r = area['center'], area['radius_km']
        cx, cy = u(la, lo)
        return (int(cx - r), int(cx + r) + 1, int(cy - r), int(cy + r) + 1)
    s, w, n, e = area['bbox']
    pts = [u(a, o) for a, o in ((s, w), (s, e), (n, w), (n, e))]
    ex = [pt[0] for pt in pts]
    ny = [pt[1] for pt in pts]
    return (int(min(ex)), int(max(ex)) + 1, int(min(ny)), int(max(ny)) + 1)
