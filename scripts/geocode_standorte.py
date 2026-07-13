#!/usr/bin/env python3
"""
Standort-CSV -> geocodete sites.json  (für die Losspinne / Richtfunk-LoS)

Ablauf:
  1. CSV lesen (Spalten Standort-Nr, Straße, PLZ, Ort — Namen werden fuzzy erkannt).
  2. Nach Standort-Nr deduplizieren (erste vollständigste Adresse gewinnt).
  3. Jede eindeutige Adresse via Google Geocoding API -> lat/lon.
     - On-Disk-Cache (scripts/.geocode_cache.json): Reruns kosten nichts.
     - Rate-limit-freundlich, Retries mit Backoff.
  4. sites.json schreiben: [{nr, name, address, lat, lon, quality}].

Key (nie geloggt, nie committet):
  - ENV  GOOGLE_GEOCODING_API_KEY
  - oder Datei scripts/.google_geocoding_key  (nur der Key, eine Zeile)

Beispiele:
  # nur dedupe + Zählung, kein Geocoding, kein Key nötig:
  python3 scripts/geocode_standorte.py standorte.csv --dry-run

  # Stichprobe (erste 25 Adressen) zur Qualitäts-/Kostenprüfung:
  python3 scripts/geocode_standorte.py standorte.csv --limit 25

  # voller Lauf:
  python3 scripts/geocode_standorte.py standorte.csv -o elevation-api/sites.json
"""
import argparse, csv, json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH = os.path.join(HERE, ".geocode_cache.json")
KEY_FILE = os.path.join(HERE, ".google_geocoding_key")
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

# Spalten-Erkennung: gesuchtes Feld -> mögliche Header (lowercase, ohne Leerzeichen)
COLS = {
    "nr":     ["standort-nr", "standortnr", "standort_nr", "standortnummer", "site", "siteid", "standort"],
    "street": ["straße", "strasse", "street", "adresse", "address"],
    "plz":    ["plz", "postleitzahl", "zip", "postcode"],
    "city":   ["ort", "stadt", "city", "gemeinde"],
}


def norm(s):
    return (s or "").strip().lower().replace(" ", "").replace("﻿", "")


def resolve_columns(header):
    idx = {}
    normed = [norm(h) for h in header]
    for field, cands in COLS.items():
        for c in cands:
            if c in normed:
                idx[field] = normed.index(c)
                break
    missing = [f for f in ("nr", "city") if f not in idx]  # nr+city Minimum
    if missing:
        raise SystemExit(f"Pflichtspalten nicht gefunden: {missing}\nHeader war: {header}")
    return idx


def read_sites(csv_path):
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        # Delimiter automatisch (Komma/Semikolon)
        sample = f.read(4096)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
        except csv.Error:
            dialect = csv.excel
        reader = csv.reader(f, dialect)
        header = next(reader)
        idx = resolve_columns(header)
        seen = {}
        for row in reader:
            if not row or len(row) <= idx["nr"]:
                continue
            nr = (row[idx["nr"]] or "").strip()
            if not nr:
                continue
            street = row[idx["street"]].strip() if "street" in idx and len(row) > idx["street"] else ""
            plz = row[idx["plz"]].strip() if "plz" in idx and len(row) > idx["plz"] else ""
            city = row[idx["city"]].strip() if len(row) > idx["city"] else ""
            rec = {"nr": nr, "street": street, "plz": plz, "city": city}
            # Dedupe: behalte den Datensatz mit der "vollständigsten" Adresse
            prev = seen.get(nr)
            if prev is None or _completeness(rec) > _completeness(prev):
                seen[nr] = rec
        return list(seen.values())


def _completeness(rec):
    return sum(bool(rec[k]) for k in ("street", "plz", "city"))


def build_address(rec):
    parts = [p for p in (rec["street"], f'{rec["plz"]} {rec["city"]}'.strip()) if p]
    return ", ".join(parts) + ", Deutschland"


def load_cache():
    if os.path.exists(CACHE_PATH):
        try:
            return json.load(open(CACHE_PATH, encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_cache(cache):
    tmp = CACHE_PATH + ".tmp"
    json.dump(cache, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, CACHE_PATH)


def get_key():
    k = os.environ.get("GOOGLE_GEOCODING_API_KEY", "").strip()
    if k:
        return k
    if os.path.exists(KEY_FILE):
        return open(KEY_FILE, encoding="utf-8").read().strip()
    raise SystemExit(
        "Kein Google-API-Key. Setze ENV GOOGLE_GEOCODING_API_KEY "
        f"oder lege den Key (eine Zeile) in {KEY_FILE} ab."
    )


def geocode(address, key, retries=3):
    params = urllib.parse.urlencode({
        "address": address, "key": key, "region": "de", "language": "de",
        "components": "country:DE",
    })
    url = f"{GEOCODE_URL}?{params}"
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                data = json.load(r)
        except Exception as e:
            if attempt == retries - 1:
                return {"status": "NETWORK_ERROR", "error": str(e)}
            time.sleep(1.5 * (attempt + 1))
            continue
        status = data.get("status")
        if status == "OVER_QUERY_LIMIT":
            time.sleep(2.0 * (attempt + 1))
            continue
        if status == "OK" and data.get("results"):
            res = data["results"][0]
            loc = res["geometry"]["location"]
            return {
                "status": "OK",
                "lat": loc["lat"], "lon": loc["lng"],
                # location_type: ROOFTOP > RANGE_INTERPOLATED > GEOMETRIC_CENTER > APPROXIMATE
                "quality": res["geometry"].get("location_type", "UNKNOWN"),
                "formatted": res.get("formatted_address", ""),
            }
        return {"status": status or "UNKNOWN"}
    return {"status": "OVER_QUERY_LIMIT"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", help="Pfad zur Standort-CSV (Standort-Nr, Straße, PLZ, Ort)")
    ap.add_argument("-o", "--out", default=os.path.join(os.path.dirname(HERE), "elevation-api", "sites.json"))
    ap.add_argument("--limit", type=int, default=0, help="nur die ersten N Adressen geocoden (Stichprobe)")
    ap.add_argument("--dry-run", action="store_true", help="nur dedupe + Zählung, kein Geocoding")
    ap.add_argument("--sleep", type=float, default=0.05, help="Pause zwischen Live-Calls (s)")
    args = ap.parse_args()

    sites = read_sites(args.csv)
    print(f"CSV gelesen: {len(sites)} eindeutige Standorte (nach Standort-Nr).")
    complete = sum(1 for s in sites if s["street"] and s["plz"] and s["city"])
    print(f"  davon mit Straße+PLZ+Ort: {complete}  |  nur PLZ/Ort: {len(sites)-complete}")

    if args.dry_run:
        for s in sites[:5]:
            print("  z.B.", s["nr"], "->", build_address(s))
        print("Dry-run: kein Geocoding, kein Key nötig. Google-Kosten (Vollauf) ~ "
              f"{len(sites)/1000*5:.2f} USD bei $5/1000 (erste ~40k/Monat via $200-Guthaben gratis).")
        return

    key = get_key()
    cache = load_cache()
    todo = sites if not args.limit else sites[:args.limit]
    out, live_calls = [], 0
    for i, s in enumerate(todo, 1):
        addr = build_address(s)
        g = cache.get(addr)
        if g is None:
            g = geocode(addr, key)
            cache[addr] = g
            live_calls += 1
            if live_calls % 25 == 0:
                save_cache(cache)
                print(f"  ...{i}/{len(todo)} ({live_calls} Live-Calls)")
            time.sleep(args.sleep)
        if g.get("status") == "OK":
            out.append({"nr": s["nr"], "address": g.get("formatted") or addr,
                        "lat": g["lat"], "lon": g["lon"], "quality": g["quality"]})
        else:
            out.append({"nr": s["nr"], "address": addr, "lat": None, "lon": None,
                        "quality": g.get("status")})
    save_cache(cache)

    ok = [o for o in out if o["lat"] is not None]
    json.dump(out, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"\nGeocoding fertig: {len(ok)}/{len(out)} erfolgreich  ({live_calls} neue Live-Calls, Rest aus Cache).")
    # Qualitäts-Verteilung
    from collections import Counter
    q = Counter(o["quality"] for o in out)
    print("  Qualität:", dict(q))
    print(f"  -> {args.out}")
    if len(ok) < len(out):
        print("  Hinweis: nicht-OK-Standorte haben lat/lon=null (siehe 'quality').")


if __name__ == "__main__":
    main()
