#!/usr/bin/env python3
"""
LAZ → Binary Height Grid Converter
Für Neuhausen/Spree lokale Entwicklung

Konvertiert LAZ-Dateien zu kompaktem Binary-Format:
- 1000×1000 Grid (1m Auflösung)
- Uint16 (0-65535 = 0-655.35m in cm)
- ~2 MB pro Kachel (unkomprimiert)
- ~500 KB mit GZIP
"""

import sys
import struct
import gzip
from pathlib import Path

try:
    import laspy
    import numpy as np
except ImportError:
    print("ERROR: Fehlende Dependencies!")
    print("Installation:")
    print("  pip install laspy numpy")
    sys.exit(1)


def laz_to_height_grid(laz_file, output_dir, tile_size=1000, resolution=1.0):
    """
    Konvertiert LAZ zu Height Grid

    Args:
        laz_file: Path zu LAZ-Datei
        output_dir: Ausgabe-Verzeichnis
        tile_size: Kachel-Größe in Metern (default: 1000m)
        resolution: Auflösung in Metern (default: 1m)
    """
    print(f"📂 Lade LAZ-Datei: {laz_file}")

    # LAZ laden
    las = laspy.read(laz_file)

    print(f"   Punkte: {len(las.points):,}")
    print(f"   Bounds: X=[{las.header.x_min:.2f}, {las.header.x_max:.2f}]")
    print(f"   Bounds: Y=[{las.header.y_min:.2f}, {las.header.y_max:.2f}]")
    print(f"   Bounds: Z=[{las.header.z_min:.2f}, {las.header.z_max:.2f}]")

    # Koordinaten extrahieren
    x = las.x
    y = las.y
    z = las.z

    # Tile-Grenzen berechnen
    x_min = int(las.header.x_min / tile_size) * tile_size
    y_min = int(las.header.y_min / tile_size) * tile_size
    x_max = int(np.ceil(las.header.x_max / tile_size)) * tile_size
    y_max = int(np.ceil(las.header.y_max / tile_size)) * tile_size

    print(f"\n🔲 Erstelle Tiles:")
    print(f"   Tile-Size: {tile_size}m × {tile_size}m")
    print(f"   Resolution: {resolution}m")
    print(f"   Grid: {int(tile_size/resolution)} × {int(tile_size/resolution)} Punkte")

    tiles_created = 0

    # Für jede Kachel
    for tile_x in range(int(x_min), int(x_max), tile_size):
        for tile_y in range(int(y_min), int(y_max), tile_size):

            # Punkte in dieser Kachel filtern
            mask = (
                (x >= tile_x) & (x < tile_x + tile_size) &
                (y >= tile_y) & (y < tile_y + tile_size)
            )

            if not np.any(mask):
                continue

            tile_points = np.column_stack([x[mask], y[mask], z[mask]])

            # DSM Grid erstellen (höchster Punkt pro Zelle)
            grid_size = int(tile_size / resolution)
            dsm = np.zeros((grid_size, grid_size), dtype=np.float32)

            for px, py, pz in tile_points:
                # Grid-Position
                grid_x = int((px - tile_x) / resolution)
                grid_y = int((py - tile_y) / resolution)

                # Clamp to grid bounds
                grid_x = max(0, min(grid_size - 1, grid_x))
                grid_y = max(0, min(grid_size - 1, grid_y))

                # Höchster Punkt gewinnt (DSM)
                dsm[grid_y, grid_x] = max(dsm[grid_y, grid_x], pz)

            # Lücken füllen (einfache Interpolation)
            # Punkte ohne Daten bekommen Nachbar-Wert
            for gy in range(grid_size):
                for gx in range(grid_size):
                    if dsm[gy, gx] == 0:
                        # Suche nächsten Nachbarn
                        neighbors = []
                        for dy in [-1, 0, 1]:
                            for dx in [-1, 0, 1]:
                                ny, nx = gy + dy, gx + dx
                                if 0 <= ny < grid_size and 0 <= nx < grid_size:
                                    if dsm[ny, nx] > 0:
                                        neighbors.append(dsm[ny, nx])
                        if neighbors:
                            dsm[gy, gx] = np.mean(neighbors)

            # Zu Uint16 konvertieren (cm Genauigkeit)
            dsm_uint16 = (dsm * 100).astype(np.uint16)

            # Dateiname
            tile_id_x = int(tile_x / 1000)
            tile_id_y = int(tile_y / 1000)
            output_file = output_dir / f"tile_{tile_id_x}_{tile_id_y}.bin"
            output_file_gz = output_dir / f"tile_{tile_id_x}_{tile_id_y}.bin.gz"

            # Speichern (Binary)
            with open(output_file, 'wb') as f:
                f.write(dsm_uint16.tobytes())

            # GZIP komprimieren
            with open(output_file, 'rb') as f_in:
                with gzip.open(output_file_gz, 'wb') as f_out:
                    f_out.writelines(f_in)

            size_raw = output_file.stat().st_size / 1024
            size_gz = output_file_gz.stat().st_size / 1024

            print(f"   ✅ Tile {tile_id_x}_{tile_id_y}: {size_raw:.0f} KB → {size_gz:.0f} KB (GZIP)")

            tiles_created += 1

    print(f"\n✨ Fertig! {tiles_created} Tiles erstellt in: {output_dir}")
    return tiles_created


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="LAZ → Binary Height Grid Converter")
    parser.add_argument("laz_file", help="Input LAZ file")
    parser.add_argument("-o", "--output", default="tiles", help="Output directory (default: tiles)")
    parser.add_argument("-s", "--size", type=int, default=1000, help="Tile size in meters (default: 1000)")
    parser.add_argument("-r", "--resolution", type=float, default=1.0, help="Grid resolution in meters (default: 1.0)")

    args = parser.parse_args()

    # Output directory erstellen
    output_dir = Path(args.output)
    output_dir.mkdir(exist_ok=True)

    # Konvertieren
    laz_to_height_grid(
        Path(args.laz_file),
        output_dir,
        tile_size=args.size,
        resolution=args.resolution
    )
