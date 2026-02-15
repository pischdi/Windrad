#!/usr/bin/env python3
"""
Generate correct tile list based on windrad coordinates
Uses accurate UTM Zone 33N conversion
"""

import math

def wgs84_to_utm33(lat, lng):
    """
    Convert WGS84 to UTM Zone 33N (EPSG:25833)
    Accurate conversion for Brandenburg
    """
    # WGS84 parameters
    a = 6378137.0  # semi-major axis
    f = 1 / 298.257223563  # flattening
    e = math.sqrt(2 * f - f * f)  # eccentricity
    e2 = e * e
    e4 = e2 * e2
    e6 = e4 * e2

    # UTM Zone 33N parameters
    k0 = 0.9996  # scale factor
    E0 = 500000  # false easting
    N0 = 0  # false northing (northern hemisphere)
    lambda0 = math.radians(15)  # central meridian (15°E for Zone 33)

    # Convert to radians
    phi = math.radians(lat)
    lambda_ = math.radians(lng)

    sin_phi = math.sin(phi)
    cos_phi = math.cos(phi)
    tan_phi = math.tan(phi)

    # Calculate meridional arc
    n = (a - a * math.sqrt(1 - e2)) / (a + a * math.sqrt(1 - e2))
    n2 = n * n
    n3 = n2 * n
    n4 = n3 * n
    n5 = n4 * n
    n6 = n5 * n

    A_coeff = a / (1 + n) * (1 + n2/4 + n4/64 + n6/256)

    M = A_coeff * (
        phi
        - (3*n/2 - 27*n3/32 + 269*n5/512) * math.sin(2*phi)
        + (21*n2/16 - 55*n4/32) * math.sin(4*phi)
        - (151*n3/96) * math.sin(6*phi)
        + (1097*n4/512) * math.sin(8*phi)
    )

    # Transverse Mercator parameters
    N = a / math.sqrt(1 - e2 * sin_phi * sin_phi)
    T = tan_phi * tan_phi
    C = e2 / (1 - e2) * cos_phi * cos_phi
    A = (lambda_ - lambda0) * cos_phi

    # Calculate UTM Easting
    x = E0 + k0 * N * (
        A +
        (1 - T + C) * A**3 / 6 +
        (5 - 18*T + T*T + 72*C - 58*e2/(1-e2)) * A**5 / 120
    )

    # Calculate UTM Northing
    y = N0 + k0 * (
        M +
        N * tan_phi * (
            A**2 / 2 +
            (5 - T + 9*C + 4*C*C) * A**4 / 24 +
            (61 - 58*T + T*T + 600*C - 330*e2/(1-e2)) * A**6 / 720
        )
    )

    return x, y


def get_required_tiles(lat, lng, radius_km=3):
    """Get all tiles within radius of a point"""
    x, y = wgs84_to_utm33(lat, lng)
    radius_m = radius_km * 1000

    # Bounding box
    min_x = x - radius_m
    max_x = x + radius_m
    min_y = y - radius_m
    max_y = y + radius_m

    # Tile IDs (1km x 1km tiles)
    min_tile_x = int(min_x // 1000)
    max_tile_x = int(max_x // 1000)
    min_tile_y = int(min_y // 1000)
    max_tile_y = int(max_y // 1000)

    tiles = set()
    for tile_x in range(min_tile_x, max_tile_x + 1):
        for tile_y in range(min_tile_y, max_tile_y + 1):
            tiles.add(f"tile_{tile_x}_{tile_y}.bin")

    return tiles


# Windrad coordinates from windraeder.csv
windraeder = [
    {"name": "Test-Laubsdorf", "lat": 51.654580371640826, "lon": 14.41783905029297},
    {"name": "Acker", "lat": 51.67112586229757, "lon": 14.431936740875246},
    {"name": "Kathlow", "lat": 51.763929032538854, "lon": 14.493198394775392},
    {"name": "Richtung Roggosen", "lat": 51.690499516603225, "lon": 14.451913833618166}
]

print("🌍 Windrad AR - Korrekte Tile-Berechnung")
print("=" * 60)
print()

all_tiles = set()
radius_km = 3

for wka in windraeder:
    x, y = wgs84_to_utm33(wka['lat'], wka['lon'])
    print(f"📍 {wka['name']}")
    print(f"   WGS84: {wka['lat']:.6f}°N, {wka['lon']:.6f}°E")
    print(f"   UTM33: {x:.1f}m E, {y:.1f}m N")

    tile_x = int(x // 1000)
    tile_y = int(y // 1000)
    print(f"   Tile:  {tile_x}_{tile_y}")
    print()

    tiles = get_required_tiles(wka['lat'], wka['lon'], radius_km)
    all_tiles.update(tiles)

print("=" * 60)
print(f"📦 Gesamt: {len(all_tiles)} Tiles für {len(windraeder)} WKAs ({radius_km} km Radius)")
print()

# Sort tiles
sorted_tiles = sorted(all_tiles)

# Extract tile IDs to check range
tile_coords = []
for tile in sorted_tiles:
    parts = tile.replace('.bin', '').split('_')
    if len(parts) == 3:
        tile_coords.append((int(parts[1]), int(parts[2])))

if tile_coords:
    min_x = min(c[0] for c in tile_coords)
    max_x = max(c[0] for c in tile_coords)
    min_y = min(c[1] for c in tile_coords)
    max_y = max(c[1] for c in tile_coords)

    print(f"📊 Tile-Bereich:")
    print(f"   X: {min_x} - {max_x} (UTM {min_x}km - {max_x}km E)")
    print(f"   Y: {min_y} - {max_y} (UTM {min_y}km - {max_y}km N)")
    print()

# Write to file
output_file = "../tiles/windrad-tiles.txt"

with open(output_file, 'w') as f:
    f.write("# Windrad AR - Benötigte Höhendaten-Tiles (KORRIGIERT)\n")
    f.write(f"# Generiert: 2026-02-14 (mit korrekter UTM-Konvertierung)\n")
    f.write(f"# Anzahl WKAs: {len(windraeder)}\n")
    f.write(f"# Sichtradius: {radius_km} km\n")
    f.write(f"# Anzahl Tiles: {len(all_tiles)}\n")
    f.write("#\n")
    f.write("# Verwendung:\n")
    f.write("#   python3 download_laz.py windrad-tiles.txt --yes\n")
    f.write("#   python3 laz_to_binary.py input.laz --tile-list windrad-tiles.txt\n")
    f.write("#\n\n")

    for tile in sorted_tiles:
        f.write(tile + '\n')

print(f"✅ Tile-Liste gespeichert: {output_file}")
print()
print("🔄 Nächster Schritt:")
print("   python3 scripts/download_laz.py tiles/windrad-tiles.txt --yes")
