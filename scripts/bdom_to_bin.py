#!/usr/bin/env python3
"""
bDOM (Brandenburg, bildbasiertes DOM) → Binär-Höhenkachel.

Lädt eine bDOM-Kachel (GeoTIFF, nativ 0,2 m) vom Geoportal und schreibt sie im
byte-kompatiblen Format der Elevation API: 1000×1000, 1 m, Uint16 in cm,
Little-Endian, Zeile 0 = Süden, Index row*1000+col, nodata = 0.

Downsampling 0,2 m → 1 m mit "höchster Punkt gewinnt" (Resampling.max), passend
zum alten DSM (erhält Hindernis-Höhen für die Sichtbarkeit).

Dies ist die lokale Variante der Konvertierung aus
colab/process_brandenburg_bdom.ipynb (dort für den Bulk-Lauf, hier für Einzeltests).

Usage:
    python3 bdom_to_bin.py <tileX> <tileY> [outdir]
    # Beispiel: python3 bdom_to_bin.py 459 5722 tiles_output
"""

import io
import sys
import gzip
import zipfile
from pathlib import Path

import requests
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin

BDOM_BASE = "https://data.geobasis-bb.de/geobasis/daten/bdom/tif"
TILE_SIZE = 1000   # Meter pro Kachel
GRID = 1000        # Zellen pro Kante -> 1 m Auflösung


def make_grid(tif_bytes, tx, ty):
    """GeoTIFF-Bytes -> Uint16-cm-Grid (1000×1000, row0=Süden, nodata=0)."""
    with rasterio.open(io.BytesIO(tif_bytes)) as src:
        dst = np.zeros((GRID, GRID), dtype=np.float32)
        # Ziel: north-up, NW-Ecke der km-Kachel, 1 m Auflösung
        dst_transform = from_origin(tx * TILE_SIZE, (ty + 1) * TILE_SIZE,
                                    TILE_SIZE / GRID, TILE_SIZE / GRID)
        reproject(
            source=rasterio.band(src, 1), destination=dst,
            src_transform=src.transform, src_crs=src.crs,
            dst_transform=dst_transform, dst_crs=src.crs,
            src_nodata=src.nodata, dst_nodata=0.0,
            resampling=Resampling.max)
    dst = np.flipud(dst)                 # GeoTIFF north-up -> row0=Süden
    dst[~np.isfinite(dst)] = 0.0
    dst[dst < 0] = 0.0
    return (dst * 100.0).astype("<u2")   # cm, little-endian Uint16


def fetch_bdom_tif(tx, ty):
    url = f"{BDOM_BASE}/bdom_33{tx}-{ty}.zip"
    r = requests.get(url, timeout=600)
    r.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    name = next(n for n in zf.namelist() if n.lower().endswith((".tif", ".tiff")))
    return zf.read(name)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    tx, ty = int(sys.argv[1]), int(sys.argv[2])
    outdir = Path(sys.argv[3] if len(sys.argv) > 3 else "tiles_output")
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"⬇️  Lade bDOM {tx}-{ty} …")
    grid = make_grid(fetch_bdom_tif(tx, ty), tx, ty)
    raw = grid.tobytes()
    assert len(raw) == GRID * GRID * 2, f"falsche Größe {len(raw)}"

    bin_path = outdir / f"tile_{tx}_{ty}.bin"
    gz_path = outdir / f"tile_{tx}_{ty}.bin.gz"
    bin_path.write_bytes(raw)
    gz_path.write_bytes(gzip.compress(raw))

    valid = grid[grid > 0] / 100.0
    print(f"✅ {bin_path}  ({len(raw)} bytes, gz {gz_path.stat().st_size} bytes)")
    print(f"   Höhen: min={valid.min():.1f} mean={valid.mean():.1f} "
          f"max={valid.max():.1f} m | Abdeckung {100*valid.size/grid.size:.1f}%")


if __name__ == "__main__":
    main()
