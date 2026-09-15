#!/usr/bin/env python3
"""
NRW-Kacheln ermitteln, die von der alten Zentimeter-Decke betroffen sind.

Hintergrund: Bis zur Umstellung auf Dezimeter (15.09.2026) speicherten die
Kacheln Höhen als Uint16 in Zentimetern. Das endet bei 65535 cm = 655,35 m.
Alles darüber lief still über — der Langenberg (843 m) kam als 188,38 m aus
der API. NRW ist mit Rothaargebirge, Eifel und Sauerland das Land, in dem das
flächig zuschlägt.

Gesucht ist die Liste der 1-km-Kacheln, die neu gerechnet werden müssen.

METHODE — warum ein grobes Fremdmodell statt der eigenen Quelldaten
------------------------------------------------------------------
Der direkte Weg wäre, alle rund 34.000 NRW-GeoTIFFs zu laden und ihr Maximum
zu bestimmen. Das ist genau die Arbeit, die wir *vermeiden* wollen: mehrere
Terabyte Download für eine reine Vorauswahl.

Stattdessen dient das Copernicus DEM GLO-90 als Sieb:
  - frei und ohne Anmeldung über den AWS-Open-Data-Bucket erreichbar,
  - 90 m Rasterweite, rund 3,7 MB je 1°-Kachel — für ganz NRW etwa 55 MB,
  - deckt Europa lückenlos ab.

Es ist ein *Oberflächenmodell* (mit Bewuchs), liegt also eher zu hoch als zu
tief. Für ein Sieb ist das die richtige Richtung: lieber eine Kachel zu viel
auf die Liste als eine zu wenig.

Der Schwellwert liegt bei 600 m statt 655 m. Die 55 m Abstand fangen zweierlei
auf: die 90-m-Rasterweite kann einen schmalen Gipfel um einige Meter verfehlen,
und unsere Kacheln tragen das DOM, also Bäume und Bauwerke *über* dem Gelände —
30 m Fichte auf 620 m Kuppe reißt die 655er-Grenze.

Das Umprojizieren auf das 1-km-Zielraster passiert mit Resampling.max: pro
Zielkachel gewinnt der höchste Punkt, nicht der Mittelwert. Ein Mittelwert
würde genau die schmalen Gipfel glattbügeln, auf die es hier ankommt.

Ausgabe: nrw_neu_zu_rechnen.txt (je Zeile "x_y", UTM32-Kilometer).
"""
import io
import os
import sys

import numpy as np
import rasterio
import requests
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'cloudrun'))
import tileproc as tp  # noqa: E402

# Copernicus DEM GLO-90 (COG) im offenen AWS-Bucket — keine Anmeldung nötig.
COP_BASE = 'https://copernicus-dem-90m.s3.amazonaws.com'
COP_NAME = 'Copernicus_DSM_COG_30_N{lat:02d}_00_E{lon:03d}_00_DEM'

SCHWELLE_M = 600.0      # Sieb-Grenze (Decke war 655,35 m — 55 m Sicherheitsabstand)
NRW_LAT = range(50, 53)  # NRW: ~50,3° bis 52,6° N
NRW_LON = range(5, 10)   # NRW: ~5,8° bis 9,5° O
ZIEL = os.path.join(os.path.dirname(__file__), '..', 'nrw_neu_zu_rechnen.txt')


def lade_copernicus():
    """Alle GLO-90-Grad-Kacheln über NRW holen. Fehlende (Meer) werden übersprungen."""
    out = []
    for la in NRW_LAT:
        for lo in NRW_LON:
            stem = COP_NAME.format(lat=la, lon=lo)
            url = f'{COP_BASE}/{stem}/{stem}.tif'
            r = requests.get(url, timeout=300)
            if r.status_code == 404:
                print(f'  (keine Daten: N{la} E{lo})')
                continue
            r.raise_for_status()
            out.append((stem, r.content))
            print(f'  geladen: N{la} E{lo} ({len(r.content)/1e6:.1f} MB)')
    return out


def max_je_kachel(cop_tiles, xmin, xmax, ymin, ymax):
    """GLO-90 -> UTM32-Kilometerraster, je Zelle der höchste Punkt (in Metern)."""
    cols = xmax - xmin + 1
    rows = ymax - ymin + 1
    # Zielraster: 1000 m Zellen, Zeile 0 = Norden (from_origin arbeitet north-up).
    dst_transform = from_origin(xmin * 1000, (ymax + 1) * 1000, 1000, 1000)
    acc = np.zeros((rows, cols), dtype=np.float32)

    for stem, blob in cop_tiles:
        with rasterio.open(io.BytesIO(blob)) as src:
            buf = np.zeros((rows, cols), dtype=np.float32)
            reproject(
                source=rasterio.band(src, 1), destination=buf,
                src_transform=src.transform, src_crs=src.crs,
                dst_transform=dst_transform, dst_crs='EPSG:25832',
                src_nodata=src.nodata, dst_nodata=0.0,
                resampling=Resampling.max)   # höchster Punkt gewinnt, kein Mittel
        buf[~np.isfinite(buf)] = 0.0
        np.maximum(acc, buf, out=acc)        # Kacheln überlagern sich am Rand
    return acc


def main():
    print('1) NRW-Kachelverzeichnis (opengeodata.nrw.de) …')
    dom = tp.list_all_tiles('NRW_DOM')
    dgm = tp.list_all_tiles('NRW_DGM')
    alle = set(dom) | set(dgm)
    print(f'   DOM {len(dom)}, DGM {len(dgm)}, zusammen {len(alle)} Kacheln')

    xs = [t[0] for t in alle]
    ys = [t[1] for t in alle]
    xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
    print(f'   Ausdehnung UTM32: x {xmin}–{xmax} km, y {ymin}–{ymax} km')

    print('2) Copernicus GLO-90 laden …')
    cop = lade_copernicus()

    print('3) auf das 1-km-Raster umprojizieren (Resampling.max) …')
    acc = max_je_kachel(cop, xmin, xmax, ymin, ymax)

    print(f'4) Kacheln über {SCHWELLE_M:.0f} m auswählen …')
    treffer = []
    for (tx, ty) in sorted(alle):
        r = (ymax - ty)          # Zeile 0 = Norden
        c = (tx - xmin)
        h = float(acc[r, c])
        if h >= SCHWELLE_M:
            treffer.append((tx, ty, h))

    with open(ZIEL, 'w') as f:
        f.write(f'# NRW-Kacheln mit Gelände über {SCHWELLE_M:.0f} m (Copernicus GLO-90, Resampling.max)\n')
        f.write('# Betroffen von der alten Uint16-cm-Decke (655,35 m) — neu zu rechnen in dm.\n')
        f.write('# Format: <x>_<y>  (UTM32-Kilometer)   # grobe Maximalhöhe in m\n')
        for tx, ty, h in treffer:
            f.write(f'{tx}_{ty}  # {h:.0f}\n')

    print(f'   {len(treffer)} Kacheln -> {os.path.relpath(ZIEL)}')
    if treffer:
        hs = [h for _, _, h in treffer]
        print(f'   Höhen {min(hs):.0f}–{max(hs):.0f} m')


if __name__ == '__main__':
    main()
