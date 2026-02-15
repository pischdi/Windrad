#!/usr/bin/env python3
"""
Brandenburg LAZ Downloader
Lädt LAZ-Dateien basierend auf Tile-Liste vom Geoportal

Usage:
    python3 download_laz.py windrad-tiles.txt
"""

import sys
import urllib.request
import urllib.error
from pathlib import Path
import time

# Brandenburg Geoportal Base URL
# ALS = Airborne Laser Scanning (Punktwolken-Daten)
BASE_URL = "https://data.geobasis-bb.de/geobasis/daten/als/laz"

def load_tile_list(tile_list_file):
    """
    Lädt Tile-Liste aus Textdatei

    Args:
        tile_list_file: Path zur Tile-Liste

    Returns:
        Set mit Tile-Namen
    """
    tiles = set()
    with open(tile_list_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                tiles.add(line)
    return tiles

def tile_to_laz_filename(tile_name):
    """
    Konvertiert Tile-Name zu ZIP-Dateiname

    tile_459_5722.bin -> als_33459-5722.zip
    """
    # Extrahiere X und Y aus tile_X_Y.bin
    parts = tile_name.replace('.bin', '').split('_')
    if len(parts) != 3 or parts[0] != 'tile':
        return None

    tile_x = parts[1]
    tile_y = parts[2]

    # Brandenburg ALS ZIP-Dateien: als_33{X}-{Y}.zip (mit BINDESTRICH!)
    laz_filename = f"als_33{tile_x}-{tile_y}.zip"

    return laz_filename

def download_laz_file(laz_filename, output_dir, base_url):
    """
    Lädt eine LAZ-Datei herunter

    Returns:
        True bei Erfolg, False bei Fehler
    """
    url = f"{base_url}/{laz_filename}"
    output_path = output_dir / laz_filename

    # Skip if already exists
    if output_path.exists():
        print(f"⏭️  {laz_filename} (bereits vorhanden)")
        return True

    try:
        print(f"⬇️  Lade {laz_filename}...", end=' ', flush=True)

        # Download mit Progress
        with urllib.request.urlopen(url, timeout=60) as response:
            total_size = int(response.headers.get('content-length', 0))

            with open(output_path, 'wb') as f:
                downloaded = 0
                chunk_size = 8192

                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)

                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        print(f"\r⬇️  Lade {laz_filename}... {percent:.1f}%", end='', flush=True)

        file_size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"\r✅ {laz_filename} ({file_size_mb:.1f} MB)")
        return True

    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"\r❌ {laz_filename} (nicht gefunden auf Server)")
        else:
            print(f"\r❌ {laz_filename} (HTTP {e.code})")
        return False
    except Exception as e:
        print(f"\r❌ {laz_filename} (Fehler: {e})")
        return False

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Brandenburg LAZ Downloader",
        epilog="Beispiel: python3 download_laz.py windrad-tiles.txt --yes"
    )
    parser.add_argument("tile_list", help="Path to tile list file (e.g., windrad-tiles.txt)")
    parser.add_argument("-y", "--yes", action="store_true", help="Skip confirmation prompt")
    parser.add_argument("-o", "--output", default="laz_downloads", help="Output directory (default: laz_downloads)")

    args = parser.parse_args()

    tile_list_file = args.tile_list
    output_dir = Path(args.output)

    print("🌍 Brandenburg LAZ Downloader")
    print("=" * 60)

    # Output-Verzeichnis erstellen
    output_dir.mkdir(exist_ok=True)

    # Tile-Liste laden
    print(f"\n📋 Lade Tile-Liste: {tile_list_file}")
    tiles = load_tile_list(tile_list_file)
    print(f"   Gefunden: {len(tiles)} Tiles")

    # LAZ-Dateinamen generieren
    laz_files = []
    for tile in sorted(tiles):
        laz_filename = tile_to_laz_filename(tile)
        if laz_filename:
            laz_files.append(laz_filename)
        else:
            print(f"⚠️  Warnung: Ungültiger Tile-Name: {tile}")

    print(f"\n📦 Download-Liste: {len(laz_files)} LAZ-Dateien")
    print(f"   Output: {output_dir.absolute()}")
    print(f"   Server: {BASE_URL}")

    # Bestätigung
    print(f"\n⚠️  Geschätzte Größe: ~{len(laz_files) * 50} MB")

    if not args.yes:
        try:
            response = input("\nDownload starten? (j/n): ")
            if response.lower() not in ['j', 'ja', 'y', 'yes']:
                print("Abgebrochen.")
                return
        except KeyboardInterrupt:
            print("\nAbgebrochen.")
            return
    else:
        print("\n✓ Auto-confirm aktiviert (--yes)")


    # Download
    print(f"\n⬇️  Starte Download von {len(laz_files)} Dateien...")
    print("-" * 60)

    success_count = 0
    failed_files = []

    for i, laz_filename in enumerate(laz_files, 1):
        print(f"[{i}/{len(laz_files)}] ", end='')

        if download_laz_file(laz_filename, output_dir, BASE_URL):
            success_count += 1
        else:
            failed_files.append(laz_filename)

        # Kleine Pause zwischen Downloads (Server-freundlich)
        if i < len(laz_files):
            time.sleep(0.5)

    # Zusammenfassung
    print("\n" + "=" * 60)
    print("✨ Download abgeschlossen!")
    print(f"   Erfolgreich: {success_count}/{len(laz_files)}")

    if failed_files:
        print(f"\n⚠️  {len(failed_files)} Dateien konnten nicht geladen werden:")
        for filename in failed_files[:10]:
            print(f"   - {filename}")
        if len(failed_files) > 10:
            print(f"   ... und {len(failed_files) - 10} weitere")

        print("\nMögliche Gründe:")
        print("  • Datei existiert nicht auf dem Server")
        print("  • Download-URL ist falsch (siehe README)")
        print("  • Netzwerkproblem")

    print(f"\n📁 Dateien gespeichert in: {output_dir.absolute()}")
    print(f"\n🔄 Nächster Schritt:")
    print(f"   python3 laz_to_binary.py laz_downloads/dom_*.laz --tile-list {tile_list_file}")

if __name__ == "__main__":
    main()
