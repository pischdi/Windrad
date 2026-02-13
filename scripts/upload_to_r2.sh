#!/bin/bash
# ========================================
# Upload Tiles to Cloudflare R2
# ========================================

# Konfiguration
BUCKET_NAME="windrad-tiles"
TILES_DIR="tiles"

# Farben für Output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Windrad AR - Tile Upload zu Cloudflare R2${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Wrangler CLI nicht gefunden!${NC}"
    echo ""
    echo "Installation:"
    echo "  npm install -g wrangler"
    echo ""
    echo "Dann erneut ausführen."
    exit 1
fi

# Check if tiles directory exists
if [ ! -d "$TILES_DIR" ]; then
    echo -e "${RED}❌ Tiles-Verzeichnis nicht gefunden: $TILES_DIR${NC}"
    echo ""
    echo "Erstellen Sie zuerst Tiles mit:"
    echo "  python3 laz_to_binary.py input.laz --tile-list tiles.txt"
    exit 1
fi

# Count tiles
TILE_COUNT=$(ls -1 "$TILES_DIR"/*.bin 2>/dev/null | wc -l)

if [ "$TILE_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ Keine .bin Dateien in $TILES_DIR gefunden${NC}"
    exit 1
fi

echo -e "${GREEN}📦 Gefunden: $TILE_COUNT Tiles${NC}\n"

# Confirm upload
echo -e "Bucket: ${BLUE}$BUCKET_NAME${NC}"
echo -e "Tiles:  ${BLUE}$TILE_COUNT${NC} Dateien\n"

read -p "Alle Tiles hochladen? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Abgebrochen."
    exit 0
fi

# Upload tiles
echo ""
echo -e "${BLUE}Starte Upload...${NC}\n"

UPLOADED=0
FAILED=0

for file in "$TILES_DIR"/*.bin; do
    filename=$(basename "$file")

    echo -n "Uploading $filename... "

    if wrangler r2 object put "$BUCKET_NAME/$filename" --file="$file" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((UPLOADED++))
    else
        echo -e "${RED}✗${NC}"
        ((FAILED++))
    fi
done

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ Upload abgeschlossen${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Erfolgreich: ${GREEN}$UPLOADED${NC}"

if [ "$FAILED" -gt 0 ]; then
    echo -e "Fehlgeschlagen: ${RED}$FAILED${NC}"
fi

echo ""
echo -e "${BLUE}Nächste Schritte:${NC}"
echo "1. Testen Sie die Tiles:"
echo "   https://pub-YOUR-BUCKET-ID.r2.dev/tile_400_5728.bin"
echo ""
echo "2. Aktualisieren Sie js/elevation-service.js:"
echo "   this.tileServerUrl = 'https://pub-YOUR-BUCKET-ID.r2.dev';"
echo ""
echo "3. Deployen:"
echo "   git add . && git commit -m 'Update tiles' && git push"
