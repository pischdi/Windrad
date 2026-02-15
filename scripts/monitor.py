#!/usr/bin/env python3
"""
Windrad Pipeline Monitor
Zeigt Status und Fortschritt der LAZ-Verarbeitung
"""

import sys
import json
import time
import subprocess
from pathlib import Path
from datetime import datetime, timedelta

# Konfiguration
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
LAZ_DIR = PROJECT_DIR / "laz_downloads"
TILES_DIR = PROJECT_DIR / "tiles_output"
STATE_FILE = SCRIPT_DIR / "pipeline_state.json"


def get_file_count(directory, pattern):
    """Zählt Dateien in Verzeichnis"""
    try:
        path = Path(directory)
        if not path.exists():
            return 0
        return len(list(path.glob(pattern)))
    except:
        return 0


def get_dir_size(directory):
    """Berechnet Verzeichnisgröße in GB"""
    try:
        path = Path(directory)
        if not path.exists():
            return 0
        total = sum(f.stat().st_size for f in path.rglob('*') if f.is_file())
        return total / (1024 ** 3)  # Convert to GB
    except:
        return 0


def parse_conversion_log():
    """Parse convert_all_laz.sh output für aktuellen Status"""
    task_output = Path("/private/tmp/claude-501/-Users-pischdi-Documents-Windrad/tasks/b006b48.output")

    if not task_output.exists():
        return None

    try:
        with open(task_output, 'r') as f:
            lines = f.readlines()

        # Suche letzte [X/Y] Zeile
        current_file = 0
        total_files = 0
        current_laz = ""

        for line in reversed(lines):
            if '[' in line and '/' in line and ']' in line:
                # Parse "[21/     141] 🔄 Verarbeite: als_33458-5723.laz"
                parts = line.split(']')
                if len(parts) >= 2:
                    nums = parts[0].strip('[').split('/')
                    if len(nums) == 2:
                        current_file = int(nums[0].strip())
                        total_files = int(nums[1].strip())

                        # Extract filename
                        if '🔄 Verarbeite:' in line:
                            current_laz = line.split('🔄 Verarbeite:')[-1].strip()
                        break

        return {
            'current': current_file,
            'total': total_files,
            'current_file': current_laz,
            'is_running': current_file < total_files
        }
    except:
        return None


def format_progress_bar(current, total, width=30):
    """Erstellt ASCII Progress Bar"""
    if total == 0:
        return '░' * width

    percent = current / total
    filled = int(width * percent)
    empty = width - filled

    return '█' * filled + '░' * empty


def format_size(bytes_size):
    """Formatiert Bytes zu lesbare Größe"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} PB"


def estimate_eta(current, total, start_time):
    """Schätzt verbleibende Zeit"""
    if current == 0:
        return "Berechne..."

    elapsed = time.time() - start_time
    rate = current / elapsed  # files per second
    remaining = total - current
    eta_seconds = remaining / rate if rate > 0 else 0

    return str(timedelta(seconds=int(eta_seconds)))


def show_status(watch_mode=False):
    """Zeigt aktuellen Pipeline-Status"""

    # Conversion Status
    conv_status = parse_conversion_log()

    # File Counts
    laz_count = get_file_count(LAZ_DIR, "*.laz")
    bin_count = get_file_count(TILES_DIR, "*.bin")
    gz_count = get_file_count(TILES_DIR, "*.bin.gz")

    # Disk Usage
    laz_size = get_dir_size(LAZ_DIR)
    tiles_size = get_dir_size(TILES_DIR)

    # Clear screen in watch mode
    if watch_mode:
        print("\033[2J\033[H", end='')

    print("🌍 Windrad Pipeline Status")
    print("━" * 60)
    print()

    # Download Status
    print("┌─────────────────────────────────────────────────────────┐")
    download_bar = format_progress_bar(laz_count, 141)
    print(f"│ Download  [{download_bar}] {laz_count}/141   │")
    print(f"│ Status: ✅ Completed ({laz_size:.1f} GB)                              │")
    print("└─────────────────────────────────────────────────────────┘")
    print()

    # Conversion Status
    print("┌─────────────────────────────────────────────────────────┐")
    if conv_status:
        conv_bar = format_progress_bar(conv_status['current'], conv_status['total'])
        print(f"│ Convert   [{conv_bar}] {conv_status['current']}/{conv_status['total']}   │")

        if conv_status['is_running']:
            print(f"│ Status: 🔄 In Progress                                  │")
            print(f"│ Current: {conv_status['current_file']:<45} │")
        else:
            print(f"│ Status: ✅ Completed                                    │")
    else:
        conv_bar = format_progress_bar(0, 141)
        print(f"│ Convert   [{conv_bar}] 0/141     │")
        print(f"│ Status: ⏸️ Nicht gestartet                              │")

    print(f"│ Output: {gz_count} compressed tiles ({tiles_size:.1f} GB)              │")
    print("└─────────────────────────────────────────────────────────┘")
    print()

    # Upload Status
    print("┌─────────────────────────────────────────────────────────┐")
    upload_bar = format_progress_bar(0, 141)
    print(f"│ Upload    [{upload_bar}] 0/141     │")
    print(f"│ Status: ⏸️ Pending                                       │")
    print("└─────────────────────────────────────────────────────────┘")
    print()

    # Disk Usage
    print("💾 Disk Usage:")
    print(f"  LAZ Files: {laz_size:.1f} GB ({laz_count} files)")
    print(f"  Binary Tiles: {tiles_size:.1f} GB ({gz_count} compressed)")
    print()

    # Commands
    print("Commands:")
    print("  tail -f /private/tmp/claude-501/-Users-pischdi-Documents-Windrad/tasks/b006b48.output")
    print("  ls -lh tiles_output/*.bin.gz | wc -l")
    print()

    if watch_mode:
        print(f"Letzte Aktualisierung: {datetime.now().strftime('%H:%M:%S')}")
        print("Drücke Ctrl+C zum Beenden...")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Windrad Pipeline Monitor"
    )
    parser.add_argument("-w", "--watch", action="store_true",
                       help="Live updates (refresh every 5s)")

    args = parser.parse_args()

    if args.watch:
        try:
            while True:
                show_status(watch_mode=True)
                time.sleep(5)
        except KeyboardInterrupt:
            print("\n\nMonitoring beendet.")
    else:
        show_status(watch_mode=False)


if __name__ == "__main__":
    main()
