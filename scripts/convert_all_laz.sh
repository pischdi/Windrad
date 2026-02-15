#!/bin/bash
# Konvertiert alle LAZ-Dateien zu Binary Height Grid Tiles

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

LAZ_DIR="$PROJECT_DIR/laz_downloads"
OUTPUT_DIR="$PROJECT_DIR/tiles_output"
TILE_LIST="$PROJECT_DIR/tiles/windrad-tiles.txt"

echo "🌍 LAZ → Binary Height Grid Batch Converter"
echo "=========================================="
echo ""
echo "LAZ Directory: $LAZ_DIR"
echo "Output Directory: $OUTPUT_DIR"
echo "Tile List: $TILE_LIST"
echo ""

# Aktiviere venv
source "$SCRIPT_DIR/venv/bin/activate"

# Zähle LAZ-Dateien
LAZ_COUNT=$(ls "$LAZ_DIR"/*.laz 2>/dev/null | wc -l)
echo "📦 Gefunden: $LAZ_COUNT LAZ-Dateien"
echo ""

if [ "$LAZ_COUNT" -eq 0 ]; then
    echo "❌ Keine LAZ-Dateien gefunden!"
    exit 1
fi

# Erstelle Output-Verzeichnis
mkdir -p "$OUTPUT_DIR"

# Progress tracking
CURRENT=0
SUCCESS=0
FAILED=0

# Verarbeite alle LAZ-Dateien
for LAZ_FILE in "$LAZ_DIR"/*.laz; do
    CURRENT=$((CURRENT + 1))
    BASENAME=$(basename "$LAZ_FILE")

    echo "[$CURRENT/$LAZ_COUNT] 🔄 Verarbeite: $BASENAME"

    if python3 "$SCRIPT_DIR/laz_to_binary.py" "$LAZ_FILE" \
        --tile-list "$TILE_LIST" \
        --output "$OUTPUT_DIR" 2>&1 | grep -q "✨ Fertig"; then
        SUCCESS=$((SUCCESS + 1))
        echo "           ✅ Erfolgreich"
    else
        FAILED=$((FAILED + 1))
        echo "           ❌ Fehler"
    fi

    echo ""
done

echo "=========================================="
echo "✨ Batch-Konvertierung abgeschlossen!"
echo ""
echo "   Gesamt:      $LAZ_COUNT Dateien"
echo "   Erfolgreich: $SUCCESS"
echo "   Fehlgeschlagen: $FAILED"
echo ""
echo "📁 Tiles gespeichert in: $OUTPUT_DIR"
echo ""

# Zähle erstellte Tiles
BIN_COUNT=$(ls "$OUTPUT_DIR"/*.bin 2>/dev/null | wc -l)
GZ_COUNT=$(ls "$OUTPUT_DIR"/*.bin.gz 2>/dev/null | wc -l)

echo "📦 Erstellte Tiles:"
echo "   Binary (.bin): $BIN_COUNT"
echo "   GZIP (.bin.gz): $GZ_COUNT"
echo ""

# Berechne Gesamtgröße
if [ "$GZ_COUNT" -gt 0 ]; then
    TOTAL_SIZE=$(du -sh "$OUTPUT_DIR"/*.bin.gz 2>/dev/null | awk '{s+=$1}END{print s}')
    echo "💾 Gesamtgröße (GZIP): $(du -sh "$OUTPUT_DIR" | awk '{print $1}')"
fi

echo ""
echo "🔄 Nächster Schritt:"
echo "   Tiles zu Cloudflare R2 hochladen"
