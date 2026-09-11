#!/usr/bin/env python3
"""
Standort-CSV MIT Koordinaten  ->  losspinne_sites.json  (für die Losspinne)

Kein Geocoding — reiner Join. Nimmt Koordinaten in WGS84 (lat/lon) ODER
UTM32/33 (Ost/Nord) und rechnet UTM bei Bedarf nach WGS84 um.
Filtert optional auf die vorhandene Höhen-Tile-Abdeckung (tiles/windrad-tiles.txt),
weil die Losspinne nur dort LoS/Profil rechnen kann.

Spalten werden fuzzy erkannt:
  Standort-Nr : standort-nr | standortnr | site | id
  WGS84       : lat|breite|latitude  +  lon|länge|laenge|longitude
  UTM         : ost|rechtswert|easting|utm_e  +  nord|hochwert|northing|utm_n
                (+ optional zone|utm_zone; sonst --utm-zone 32/33)
  optional    : höhe/antennenhöhe -> h ; operator/betreiber -> op ; name/ort -> name

Beispiele:
  python3 scripts/sites_from_coords.py planung_export.csv                # WGS84, auf Abdeckung gefiltert
  python3 scripts/sites_from_coords.py export.csv --utm-zone 33          # UTM33-Eingabe
  python3 scripts/sites_from_coords.py export.csv --no-coverage-filter   # alle behalten
"""
import argparse, csv, json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TILE_LIST = os.path.join(ROOT, 'tiles', 'windrad-tiles.txt')
OUT = os.path.join(ROOT, 'elevation-api', 'losspinne_sites.json')

A = 6378137.0            # WGS84 / GRS80 große Halbachse (ETRS89-UTM ~ WGS84)
F = 1 / 298.257223563
E2 = F * (2 - F)
K0 = 0.9996

COLS = {
    "nr":   ["standort-nr", "standortnr", "standort_nr", "standortnummer", "site", "siteid", "id", "nr"],
    "lat":  ["lat", "breite", "latitude", "wgs84_lat", "geo_lat"],
    "lon":  ["lon", "länge", "laenge", "lng", "longitude", "wgs84_lon", "geo_lon"],
    "east": ["ost", "ostwert", "rechtswert", "easting", "utm_e", "utm_ost", "utm32_x", "utm33_x", "e"],
    "north":["nord", "nordwert", "hochwert", "northing", "utm_n", "utm_nord", "utm32_y", "utm33_y", "n"],
    "zone": ["zone", "utm_zone", "utmzone"],
    "h":    ["höhe", "hoehe", "antennenhöhe", "antennenhoehe", "mast", "height"],
    "op":   ["operator", "betreiber", "netzbetreiber"],
    "name": ["name", "ort", "standortname", "bezeichnung"],
}


def norm(s): return (s or "").strip().lower().replace(" ", "").replace("﻿", "")


def resolve(header):
    idx, normed = {}, [norm(h) for h in header]
    for field, cands in COLS.items():
        for c in cands:
            if c in normed:
                idx[field] = normed.index(c); break
    return idx


def utm_to_wgs84(east, north, zone):
    """Inverse UTM (ETRS89/WGS84) -> lat/lon in Grad."""
    lon0 = math.radians(zone * 6 - 183)
    x = east - 500000.0
    y = north
    m = y / K0
    mu = m / (A * (1 - E2/4 - 3*E2**2/64 - 5*E2**3/256))
    e1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))
    phi1 = (mu + (3*e1/2 - 27*e1**3/32)*math.sin(2*mu)
            + (21*e1**2/16 - 55*e1**4/32)*math.sin(4*mu)
            + (151*e1**3/96)*math.sin(6*mu) + (1097*e1**4/512)*math.sin(8*mu))
    ep2 = E2 / (1 - E2)
    C1 = ep2 * math.cos(phi1)**2
    T1 = math.tan(phi1)**2
    N1 = A / math.sqrt(1 - E2*math.sin(phi1)**2)
    R1 = A * (1 - E2) / (1 - E2*math.sin(phi1)**2)**1.5
    D = x / (N1 * K0)
    lat = phi1 - (N1*math.tan(phi1)/R1) * (
        D**2/2 - (5 + 3*T1 + 10*C1 - 4*C1**2 - 9*ep2)*D**4/24
        + (61 + 90*T1 + 298*C1 + 45*T1**2 - 252*ep2 - 3*C1**2)*D**6/720)
    lon = lon0 + (D - (1 + 2*T1 + C1)*D**3/6
                  + (5 - 2*C1 + 28*T1 - 3*C1**2 + 8*ep2 + 24*T1**2)*D**5/120) / math.cos(phi1)
    return math.degrees(lat), math.degrees(lon)


def wgs84_to_utm(lat, lon, force_zone=None):
    """Forward (identisch zur Worker-Logik) -> (zone, x, y) für den Tile-Filter.
    force_zone erzwingt eine UTM-Zone (nötig, weil der Tile-Schlüssel E_N keine
    Zone trägt und der Abdeckungs-Tileset UTM33/Brandenburg ist)."""
    zone = force_zone if force_zone else (32 if lon < 12 else 33)
    lon0 = math.radians(9 if zone == 32 else 15)
    phi, lam = math.radians(lat), math.radians(lon)
    ep2 = E2 / (1 - E2)
    N = A / math.sqrt(1 - E2*math.sin(phi)**2)
    T = math.tan(phi)**2
    C = ep2 * math.cos(phi)**2
    Aa = (lam - lon0) * math.cos(phi)
    M = A * ((1 - E2/4 - 3*E2**2/64 - 5*E2**3/256)*phi
             - (3*E2/8 + 3*E2**2/32 + 45*E2**3/1024)*math.sin(2*phi)
             + (15*E2**2/256 + 45*E2**3/1024)*math.sin(4*phi)
             - (35*E2**3/3072)*math.sin(6*phi))
    x = K0*N*(Aa + (1 - T + C)*Aa**3/6 + (5 - 18*T + T*T + 72*C - 58*ep2)*Aa**5/120) + 500000
    y = K0*(M + N*math.tan(phi)*(Aa*Aa/2 + (5 - T + 9*C + 4*C*C)*Aa**4/24
            + (61 - 58*T + T*T + 600*C - 330*ep2)*Aa**6/720))
    return zone, x, y


def covered_tiles():
    """Abdeckungs-Manifest lesen. Akzeptiert zonenpräfixierte Keys
    (tile_<zone>_<E>_<N>) und Legacy-Keys (tile_<E>_<N> = Zone 33/Brandenburg).
    Rückgabe: Set von "<zone>_<E>_<N>"."""
    s = set()
    if not os.path.exists(TILE_LIST): return s
    import re
    for line in open(TILE_LIST, encoding='utf-8'):
        m = re.search(r'tile_(\d+)_(\d+)_(\d+)', line)      # zone_E_N
        if m:
            s.add(f"{m.group(1)}_{m.group(2)}_{m.group(3)}"); continue
        m = re.search(r'tile_(\d+)_(\d+)', line)             # Legacy E_N -> Zone 33
        if m:
            s.add(f"33_{m.group(1)}_{m.group(2)}")
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--utm-zone", type=int, default=0, help="UTM-Zone (32/33), falls Eingabe UTM ohne Zone-Spalte ist")
    ap.add_argument("--no-coverage-filter", action="store_true")
    ap.add_argument("-o", "--out", default=OUT)
    args = ap.parse_args()

    if args.csv.lower().endswith((".xlsx", ".xlsm")):
        import openpyxl
        def cellval(c):
            if c is None: return ""
            if isinstance(c, float) and c.is_integer(): return str(int(c))
            return str(c)
        ws = openpyxl.load_workbook(args.csv, read_only=True, data_only=True).active
        rows = [[cellval(c) for c in r] for r in ws.iter_rows(values_only=True)]
    else:
        with open(args.csv, newline='', encoding='utf-8-sig') as f:
            sample = f.read(4096); f.seek(0)
            try: dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
            except csv.Error: dialect = csv.excel
            rows = list(csv.reader(f, dialect))
    rows = [r for r in rows if any(str(c).strip() for c in r)]  # Leerzeilen raus
    header, data = rows[0], rows[1:]
    idx = resolve(header)
    if "nr" not in idx:
        raise SystemExit(f"Spalte Standort-Nr nicht gefunden. Header: {header}")
    mode = "wgs84" if ("lat" in idx and "lon" in idx) else "utm" if ("east" in idx and "north" in idx) else None
    if not mode:
        raise SystemExit(f"Weder lat/lon noch Ost/Nord gefunden. Header: {header}")
    print(f"Eingabe-Modus: {mode}  |  Spalten erkannt: {sorted(idx)}")

    covered = set() if args.no_coverage_filter else covered_tiles()
    def cell(r, k): return r[idx[k]].strip() if k in idx and len(r) > idx[k] else ""

    seen, out, skipped = {}, [], 0
    for r in data:
        nr = cell(r, "nr")
        if not nr: continue
        try:
            if mode == "wgs84":
                lat = float(cell(r, "lat").replace(',', '.')); lon = float(cell(r, "lon").replace(',', '.'))
            else:
                e = float(cell(r, "east").replace(',', '.')); n = float(cell(r, "north").replace(',', '.'))
                zone = int(cell(r, "zone")) if "zone" in idx and cell(r, "zone") else args.utm_zone
                if zone not in (32, 33):
                    raise ValueError("UTM-Zone fehlt/ungültig (nutze --utm-zone 32|33)")
                lat, lon = utm_to_wgs84(e, n, zone)
        except ValueError as ex:
            skipped += 1; continue
        if covered:
            # Zonenbewusst: natürliche UTM-Zone (lon<12 -> 32, sonst 33). Der Manifest-
            # Key trägt die Zone, daher keine Kollision zwischen UTM32 und UTM33 mehr.
            zone, x, y = wgs84_to_utm(lat, lon)
            if f"{zone}_{int(x//1000)}_{int(y//1000)}" not in covered:
                continue
        s = {"nr": nr, "lat": round(lat, 6), "lon": round(lon, 6)}
        h = cell(r, "h")
        if h:
            try: s["h"] = round(float(h.replace(',', '.').replace('m', '').strip()), 1)
            except ValueError: pass
        if cell(r, "op"): s["op"] = cell(r, "op")
        if cell(r, "name"): s["name"] = cell(r, "name")
        seen[nr] = s
    out = list(seen.values())
    json.dump(out, open(args.out, "w", encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f"{len(data)} Zeilen -> {len(out)} eindeutige Standorte geschrieben"
          + (f" (nach Abdeckungs-Filter; {len(covered)} Tiles)" if covered else " (kein Abdeckungs-Filter)")
          + (f"; {skipped} wegen ungültiger Koordinaten übersprungen" if skipped else ""))
    print(f"  -> {args.out}")
    if out: print("  Beispiel:", out[0])


if __name__ == "__main__":
    main()
