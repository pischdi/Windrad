"""
Kachel-Pipeline (wiederverwendet aus colab/process_brandenburg_bdom.ipynb).

Lädt bDOM/DGM-GeoTIFFs von den Landesportalen, rechnet auf das 1-m-Kachelraster
und lädt sie nach Cloudflare R2 (Key tile_<zone>_E_N.bin bzw. dgm_<zone>_E_N.bin).

R2-Zugang aus Umgebungsvariablen:
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, (BUCKET, Default windrad-tiles)
"""
import io, os, re, json, gzip, zipfile, time
import requests
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling, transform as warp_transform
from rasterio.transform import from_origin
import boto3
from botocore.config import Config

TILE_SIZE = 1000       # Meter pro Kachel
GRID = 1000            # Zellen pro Kante -> 1 m Auflösung
MAX_CM = 65535         # Uint16-Decke: 655,35 m ü. NN (siehe make_grid)

# Bundesland x Produkt. kind='dom' (Oberfläche, Sichtlinien) / 'dgm' (Gelände, Gefälle).
#
# Optionale Felder:
#   src_km  Kantenlänge der Quellkachel in km (Default 1). Länder mit 2-km-Kacheln
#           (Sachsen) liefern pro Download vier Zielkacheln — siehe process_source().
#   lister  Abweichender Weg zum Dateiverzeichnis (Default: HTML-Listing über name_re).
PRESETS = {
    'BB_DOM':  dict(zone=33, kind='dom', base='https://data.geobasis-bb.de/geobasis/daten/bdom/tif',
                    name_re=r'bdom_33(\d+)-(\d+)\.zip'),
    'BB_DGM':  dict(zone=33, kind='dgm', base='https://data.geobasis-bb.de/geobasis/daten/dgm/tif',
                    name_re=r'dgm_33(\d+)-(\d+)\.zip'),
    'NRW_DOM': dict(zone=32, kind='dom', base='https://www.opengeodata.nrw.de/produkte/geobasis/hm/dom1_tiff/dom1_tiff',
                    name_re=r'dom1_32_(\d+)_(\d+)_1_nw_\d+\.tif'),
    'NRW_DGM': dict(zone=32, kind='dgm', base='https://www.opengeodata.nrw.de/produkte/geobasis/hm/dgm1_tiff/dgm1_tiff',
                    name_re=r'dgm1_32_(\d+)_(\d+)_1_nw_\d+\.tif'),
    # Sachsen: 2-km-Kacheln aus der GeoCloud (Nextcloud). Kein Verzeichnislisting —
    # das Kachelverzeichnis steht in der Batch-Download-Seite, siehe _list_sn().
    'SN_DOM':  dict(zone=33, kind='dom', src_km=2, lister='sn_batch', product='DOM1_TIFF_2km',
                    base='https://geocloud.landesvermessung.sachsen.de/public.php/dav/files'),
    'SN_DGM':  dict(zone=33, kind='dgm', src_km=2, lister='sn_batch', product='DGM1_TIFF_2km',
                    base='https://geocloud.landesvermessung.sachsen.de/public.php/dav/files'),
}

SN_BATCH_URL = 'https://www.geodaten.sachsen.de/batch-download-4719.html'


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


def _js_object(html, var):
    """`batchConfig.<var>={…}` aus der Seite schneiden (Klammern zählen) und lesen."""
    i = html.index(f'batchConfig.{var}=')
    j = html.index('{', i)
    depth, k = 0, j
    while True:
        if html[k] == '{':
            depth += 1
        elif html[k] == '}':
            depth -= 1
            if depth == 0:
                break
        k += 1
    return json.loads(html[j:k + 1])


def _rle_cells(rle, step=1):
    """Sachsens Lauflängenkodierung [zelle, anzahl, …] -> {(E_km, N_km)}.

    Eine Zelle ist die 7-stellige Zahl EEENNNN (Rechtswert-km, Hochwert-km);
    der Lauf geht nach Norden, bei 2-km-Produkten in 2-km-Schritten.
    """
    out = set()
    for i in range(0, len(rle), 2):
        cell, n = rle[i], rle[i + 1]
        x, y = divmod(cell, 10000)
        out.update((x, y + d * step) for d in range(n))
    return out


def _list_sn(p):
    """Sachsen: Kachelverzeichnis aus der Batch-Download-Seite ableiten.

    Die Seite trägt zwei JS-Objekte: `batchConfig.products` (je Produkt die
    GeoCloud-Share-ID, die Dateinamen-Vorlage und die Liste nicht existierender
    Kacheln) und `batchConfig.mapping` (je Gemarkung das 1-km-Raster). Die Share-ID
    wandert in den Dateinamen, damit `base + '/' + fname` unverändert trägt.

    Ein Verzeichnislisting gibt es nicht — PROPFIND und HEAD auf die GeoCloud
    antworten 401, nur das direkte GET trägt. Die Produktseite
    (downloadbereich-digitale-hoehenmodelle-4851.html) enthält keine Dateiliste
    und verweist ihrerseits hierher; sie gibt aber das amtliche Kachelraster als
    Shapefile heraus (download/Shape_km2_33_UTM.zip). Damit gegengeprüft: die
    4.989 Kacheln des Shapefiles minus die 8 oben gelisteten sind genau die 4.981,
    die dieser Weg liefert — keine zu viel, keine zu wenig.
    """
    html = requests.get(SN_BATCH_URL, timeout=180).text
    prod = _js_object(html, 'products')[p['product']]
    step = prod['packagesize'] // 1000
    if step != p.get('src_km', 1):
        raise RuntimeError(f"Sachsen: Paketgröße {step} km passt nicht zu src_km")

    km1 = set()
    for gemarkung in _js_object(html, 'mapping').values():
        km1 |= _rle_cells(gemarkung['grid_id'])
    missing = _rle_cells(prod['computed_not_existing'], step=step)

    files = {}
    for x, y in km1:
        src = (x // step * step, y // step * step)
        if src in missing:
            continue
        files[(x, y)] = '{}/{}'.format(prod['share_id'], prod['filename']
                                       .replace('$Rechtswert$', str(src[0]))
                                       .replace('$Hochwert$', str(src[1])))
    return files


def list_all_tiles(preset):
    """{(E_km, N_km): dateiname} je *Ziel*kachel (1 km) — voller Dateiname.

    Bei 2-km-Quellen zeigen bis zu vier Zielkacheln auf dieselbe Datei; das
    Zusammenfassen erledigt group_sources().
    """
    p = PRESETS[preset]
    if p.get('lister') == 'sn_batch':
        return _list_sn(p)
    html = requests.get(p['base'] + '/', timeout=180).text
    files = {}
    for m in re.finditer(p['name_re'], html):
        files[(int(m.group(1)), int(m.group(2)))] = m.group(0)
    return files


def group_sources(files):
    """{(tx,ty): fname} -> [(fname, [(tx,ty), …])] — ein Arbeitspaket je Quelldatei.

    Für 1-km-Länder (BB, NRW) enthält jedes Paket genau eine Kachel, das Verhalten
    bleibt also unverändert. Für Sachsen bündelt das die noch fehlenden Viertel
    einer 2-km-Datei, sodass sie nur *einmal* geladen wird.
    """
    groups = {}
    for tile, fname in files.items():
        groups.setdefault(fname, []).append(tile)
    return [(fname, sorted(tiles)) for fname, tiles in sorted(groups.items())]


def list_done_api(preset):
    """Vorhandene Kacheln über die Elevation-API ermitteln (ohne S3-Zugang)."""
    p = PRESETS[preset]
    base_url = os.environ['UPLOAD_URL'].rstrip('/')
    done, cursor = set(), None
    while True:
        url = f"{base_url}/v1/tiles?zone={p['zone']}&model={p['kind']}"
        if cursor:
            url += '&cursor=' + requests.utils.quote(cursor)
        r = requests.get(url, timeout=180,
                         headers={'X-API-Key': os.environ['UPLOAD_KEY']})
        r.raise_for_status()
        d = r.json()
        for t in d['tiles']:
            a, b = t.split('_')
            done.add((int(a), int(b)))
        if not d.get('truncated'):
            return done
        cursor = d['cursor']


def list_done(s3, bucket, preset):
    """Bereits auf R2 vorhandene Kacheln dieses Modells/Zone (Resume)."""
    p = PRESETS[preset]
    pref = f"{key_prefix(p['kind'])}_{p['zone']}_"
    rgx = re.compile(rf"{re.escape(pref)}(\d+)_(\d+)\.bin(\.gz)?$")
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
    cm = dst * 100.0
    # Uint16 in cm endet bei 655,35 m. Ohne Deckel klappt numpy stillschweigend um
    # (1214,47 m -> 121447 cm -> 55911 cm -> 559,11 m); der Fehler sieht dann wie
    # eine plausible Höhe aus und fällt nicht auf. Lieber sichtbar anschlagen als
    # falsch aussehen. Betrifft alles oberhalb 655 m, also Erzgebirge, Harz,
    # Rothaargebirge, Alpen — Brandenburg (max 201 m) bleibt unberührt.
    np.clip(cm, 0, MAX_CM, out=cm)
    return cm.astype('<u2')               # cm, little-endian Uint16


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


def upload_via_api(preset, tx, ty, gz_bytes):
    """Kachel über die Elevation-API in R2 legen (ohne S3-Zugangsdaten).

    Gedacht für den lokalen Dauerläufer: Statt eigener R2-Schlüssel genügt der
    API-Schlüssel, den die internen Werkzeuge ohnehin benutzen. Der Worker prüft
    den Schlüssel, die Gzip-Kennung und die Größe, bevor er schreibt.
    """
    p = PRESETS[preset]
    base_url = os.environ['UPLOAD_URL'].rstrip('/')
    url = (f"{base_url}/v1/tile?zone={p['zone']}&x={tx}&y={ty}"
           f"&model={p['kind']}")
    last = None
    for i in range(4):
        try:
            r = requests.put(url, data=gz_bytes, timeout=180,
                             headers={'X-API-Key': os.environ['UPLOAD_KEY'],
                                      'Content-Type': 'application/gzip'})
            if r.status_code == 200:
                return
            last = RuntimeError(f'HTTP {r.status_code}: {r.text[:200]}')
            if r.status_code in (400, 401, 403):
                break                      # Fehler in Daten oder Schlüssel: kein Retry
        except Exception as e:
            last = e
        time.sleep(1.5 * (i + 1))
    raise last


def process_source(s3, bucket, preset, fname, targets, upload_gz=True):
    """Eine Quelldatei -> alle daraus abzuleitenden Zielkacheln: laden -> Grid -> R2.

    Der Download passiert genau einmal, egal wie viele Zielkacheln aus der Datei
    fallen. Bei 1-km-Quellen (BB, NRW) ist `targets` einelementig — dann ist das
    Wort für Wort der alte Weg. Bei Sachsens 2-km-Kacheln schneidet make_grid()
    aus demselben GeoTIFF nacheinander bis zu vier 1-km-Fenster; das Zielraster
    kommt allein aus (tx, ty), deshalb braucht der Split keine eigene Geometrie.

    Zwei Upload-Wege: Liegt `UPLOAD_URL` in der Umgebung, geht die Kachel über die
    Elevation-API (nur gepackt, so wie der Bestand seit 14.09.2026 aussieht).
    Sonst der klassische S3-Weg für den Cloud-Run-Betrieb.
    """
    p = PRESETS[preset]
    content = _download(f"{p['base']}/{fname}")
    if fname.lower().endswith('.zip'):
        zf = zipfile.ZipFile(io.BytesIO(content))
        inner = next(n for n in zf.namelist() if n.lower().endswith(('.tif', '.tiff')))
        tif = zf.read(inner)
    else:
        tif = content                     # NRW & Co.: GeoTIFF direkt
    del content

    for tx, ty in targets:
        raw = make_grid(tif, tx, ty).tobytes()
        assert len(raw) == GRID * GRID * 2, f'falsche Größe {len(raw)}'

        if os.environ.get('UPLOAD_URL'):
            upload_via_api(preset, tx, ty, gzip.compress(raw))
            continue

        base = f"{key_prefix(p['kind'])}_{p['zone']}_{tx}_{ty}"
        s3.put_object(Bucket=bucket, Key=base + '.bin', Body=raw,
                      ContentType='application/octet-stream')
        if upload_gz:
            s3.put_object(Bucket=bucket, Key=base + '.bin.gz', Body=gzip.compress(raw),
                          ContentType='application/gzip')


def process_tile(s3, bucket, preset, tx, ty, fname, upload_gz=True):
    """Eine einzelne Kachel — Altweg, bleibt für Bestandsaufrufe erhalten."""
    process_source(s3, bucket, preset, fname, [(tx, ty)], upload_gz=upload_gz)


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
