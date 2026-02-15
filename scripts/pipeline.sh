#!/bin/bash
# ========================================
# Windrad LAZ Automation Pipeline
# ========================================
# Vollautomatische Verarbeitung: Download → Convert → Upload
#
# Usage:
#   ./pipeline.sh --all                    # Complete pipeline
#   ./pipeline.sh --download               # Only download
#   ./pipeline.sh --convert                # Only convert
#   ./pipeline.sh --upload                 # Only upload
#   ./pipeline.sh --convert --upload       # Convert + Upload
#   ./pipeline.sh --resume                 # Resume from last failure

set -e  # Exit on error

# ========================================
# Configuration
# ========================================

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

TILE_LIST="$PROJECT_DIR/tiles/windrad-tiles.txt"
LAZ_DIR="$PROJECT_DIR/laz_downloads"
TILES_OUTPUT="$PROJECT_DIR/tiles_output"
VENV="$SCRIPT_DIR/venv"

STATE_FILE="$SCRIPT_DIR/pipeline_state.json"
LOG_FILE="$SCRIPT_DIR/pipeline.log"

# ========================================
# Colors
# ========================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ========================================
# Helper Functions
# ========================================

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_success() {
    log "${GREEN}✅ $1${NC}"
}

log_error() {
    log "${RED}❌ $1${NC}"
}

log_info() {
    log "${BLUE}ℹ️  $1${NC}"
}

log_warn() {
    log "${YELLOW}⚠️  $1${NC}"
}

update_state() {
    local step=$1
    local status=$2
    local data=$3

    # Create or update state file
    if [ ! -f "$STATE_FILE" ]; then
        echo "{}" > "$STATE_FILE"
    fi

    # Update using Python (simple JSON manipulation)
    python3 << EOF
import json
from pathlib import Path

state_file = Path("$STATE_FILE")
state = json.loads(state_file.read_text()) if state_file.exists() else {}

if 'steps' not in state:
    state['steps'] = {}

state['steps']['$step'] = {
    'status': '$status',
    'timestamp': '$(date -u +"%Y-%m-%dT%H:%M:%SZ")',
}

if '$data':
    state['steps']['$step']['data'] = '$data'

state['last_run'] = '$(date -u +"%Y-%m-%dT%H:%M:%SZ")'
state_file.write_text(json.dumps(state, indent=2))
EOF
}

# ========================================
# Pipeline Steps
# ========================================

step_download() {
    log_info "Schritt 1/3: Download LAZ-Dateien"
    log_info "Tile-Liste: $TILE_LIST"
    log_info "Output: $LAZ_DIR"

    update_state "download" "running" ""

    # Run download script
    if python3 "$SCRIPT_DIR/download_laz.py" "$TILE_LIST" --yes -o "$LAZ_DIR" >> "$LOG_FILE" 2>&1; then
        LAZ_COUNT=$(ls -1 "$LAZ_DIR"/*.laz 2>/dev/null | wc -l | tr -d ' ')
        log_success "Download abgeschlossen: $LAZ_COUNT LAZ-Dateien"
        update_state "download" "completed" "$LAZ_COUNT files"
        return 0
    else
        log_error "Download fehlgeschlagen!"
        update_state "download" "failed" ""
        return 1
    fi
}

step_convert() {
    log_info "Schritt 2/3: Konvertiere LAZ → Binary Tiles"
    log_info "Input: $LAZ_DIR"
    log_info "Output: $TILES_OUTPUT"

    update_state "convert" "running" ""

    # Activate venv
    if [ ! -d "$VENV" ]; then
        log_error "Virtual environment nicht gefunden: $VENV"
        log_info "Erstelle venv mit: python3 -m venv $VENV && source $VENV/bin/activate && pip install laspy numpy lazrs"
        return 1
    fi

    source "$VENV/bin/activate"

    # Create output dir
    mkdir -p "$TILES_OUTPUT"

    # Run conversion
    if bash "$SCRIPT_DIR/convert_all_laz.sh" >> "$LOG_FILE" 2>&1; then
        TILE_COUNT=$(ls -1 "$TILES_OUTPUT"/*.bin.gz 2>/dev/null | wc -l | tr -d ' ')
        log_success "Konvertierung abgeschlossen: $TILE_COUNT Tiles"
        update_state "convert" "completed" "$TILE_COUNT tiles"
        return 0
    else
        log_error "Konvertierung fehlgeschlagen!"
        update_state "convert" "failed" ""
        return 1
    fi
}

step_upload() {
    log_info "Schritt 3/3: Upload zu Cloudflare R2"
    log_info "Bucket: windrad-tiles"
    log_info "Files: $TILES_OUTPUT/*.bin.gz"

    update_state "upload" "running" ""

    # Check wrangler
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI nicht gefunden!"
        log_info "Installation: npm install -g wrangler"
        update_state "upload" "failed" "wrangler missing"
        return 1
    fi

    # Check tiles exist
    TILE_COUNT=$(ls -1 "$TILES_OUTPUT"/*.bin.gz 2>/dev/null | wc -l | tr -d ' ')
    if [ "$TILE_COUNT" -eq 0 ]; then
        log_error "Keine Tiles zum Upload gefunden!"
        update_state "upload" "failed" "no tiles"
        return 1
    fi

    # Run upload
    if bash "$SCRIPT_DIR/upload_to_r2.sh" <<< "y" >> "$LOG_FILE" 2>&1; then
        log_success "Upload abgeschlossen: $TILE_COUNT Tiles"
        update_state "upload" "completed" "$TILE_COUNT tiles"
        return 0
    else
        log_error "Upload fehlgeschlagen!"
        update_state "upload" "failed" ""
        return 1
    fi
}

# ========================================
# Main
# ========================================

main() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}🌍 Windrad LAZ Automation Pipeline${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    # Parse arguments
    DO_DOWNLOAD=false
    DO_CONVERT=false
    DO_UPLOAD=false
    DO_RESUME=false

    if [ "$#" -eq 0 ]; then
        echo "Usage: $0 [--all|--download|--convert|--upload|--resume]"
        echo ""
        echo "Options:"
        echo "  --all        Run complete pipeline (download → convert → upload)"
        echo "  --download   Only download LAZ files"
        echo "  --convert    Only convert LAZ to binary tiles"
        echo "  --upload     Only upload tiles to R2"
        echo "  --resume     Resume from last failure"
        echo ""
        echo "Examples:"
        echo "  $0 --all                    # Complete pipeline"
        echo "  $0 --convert --upload       # Skip download"
        echo "  $0 --resume                 # Resume interrupted pipeline"
        exit 0
    fi

    for arg in "$@"; do
        case $arg in
            --all)
                DO_DOWNLOAD=true
                DO_CONVERT=true
                DO_UPLOAD=true
                ;;
            --download)
                DO_DOWNLOAD=true
                ;;
            --convert)
                DO_CONVERT=true
                ;;
            --upload)
                DO_UPLOAD=true
                ;;
            --resume)
                DO_RESUME=true
                ;;
            *)
                echo "Unknown option: $arg"
                exit 1
                ;;
        esac
    done

    # Resume mode: check state and skip completed steps
    if [ "$DO_RESUME" = true ]; then
        log_info "Resume-Modus: Prüfe letzte Pipeline-Status..."

        if [ -f "$STATE_FILE" ]; then
            # Parse state (simplified - assumes download → convert → upload order)
            # In real implementation, use jq or Python for JSON parsing

            # For now, simple heuristic:
            # If LAZ files exist but no tiles → start at convert
            # If tiles exist but not uploaded → start at upload

            LAZ_COUNT=$(ls -1 "$LAZ_DIR"/*.laz 2>/dev/null | wc -l | tr -d ' ')
            TILE_COUNT=$(ls -1 "$TILES_OUTPUT"/*.bin.gz 2>/dev/null | wc -l | tr -d ' ')

            if [ "$TILE_COUNT" -gt 0 ]; then
                log_info "Tiles gefunden ($TILE_COUNT) → Starte bei Upload"
                DO_UPLOAD=true
            elif [ "$LAZ_COUNT" -gt 0 ]; then
                log_info "LAZ-Dateien gefunden ($LAZ_COUNT) → Starte bei Konvertierung"
                DO_CONVERT=true
                DO_UPLOAD=true
            else
                log_warn "Keine vorherigen Daten gefunden → Starte komplette Pipeline"
                DO_DOWNLOAD=true
                DO_CONVERT=true
                DO_UPLOAD=true
            fi
        else
            log_warn "Kein State-File gefunden → Starte komplette Pipeline"
            DO_DOWNLOAD=true
            DO_CONVERT=true
            DO_UPLOAD=true
        fi
    fi

    # Initialize state
    update_state "pipeline" "running" ""

    START_TIME=$(date +%s)

    # Execute steps
    FAILED=false

    if [ "$DO_DOWNLOAD" = true ]; then
        if ! step_download; then
            FAILED=true
        fi
    fi

    if [ "$FAILED" = false ] && [ "$DO_CONVERT" = true ]; then
        if ! step_convert; then
            FAILED=true
        fi
    fi

    if [ "$FAILED" = false ] && [ "$DO_UPLOAD" = true ]; then
        if ! step_upload; then
            FAILED=true
        fi
    fi

    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    # Summary
    echo ""
    echo -e "${BLUE}========================================${NC}"

    if [ "$FAILED" = true ]; then
        log_error "Pipeline fehlgeschlagen!"
        update_state "pipeline" "failed" ""
        echo -e "${BLUE}========================================${NC}"
        echo ""
        echo "Logs: $LOG_FILE"
        echo "Status: python3 $SCRIPT_DIR/monitor.py"
        exit 1
    else
        log_success "Pipeline erfolgreich abgeschlossen!"
        update_state "pipeline" "completed" "${DURATION}s"
        echo -e "${BLUE}========================================${NC}"
        echo ""
        echo -e "${GREEN}⏱️  Dauer: ${DURATION}s${NC}"
        echo ""
        echo "Status: python3 $SCRIPT_DIR/monitor.py"
        echo "Logs: $LOG_FILE"
        exit 0
    fi
}

main "$@"
