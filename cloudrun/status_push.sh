#!/usr/bin/env bash
# Meldet den Stand des Runners an die Elevation-API, damit man ihn von
# unterwegs sehen kann (Admin-Seite). Wird vom Waechter jede Minute aufgerufen.
set -uo pipefail
cd "$(dirname "$0")"
[ -f .env ] || exit 0
set -a; . ./.env; set +a
[ -n "${UPLOAD_URL:-}" ] && [ -n "${UPLOAD_KEY:-}" ] || exit 0

laeuft=false
if [ -f .runner.pid ] && kill -0 "$(cat .runner.pid 2>/dev/null)" 2>/dev/null; then laeuft=true; fi

fenster=false
dow=$(date +%u); hour=$((10#$(date +%H)))
if [ -f .freigabe ] || [ "$dow" -ge 6 ] || [ "$hour" -ge 18 ] || [ "$hour" -lt 7 ]; then fenster=true; fi
freigabe=false; [ -f .freigabe ] && freigabe=true

# Letzte Fortschrittszeile auswerten:
# [BB_DGM] 15/31290 ( 0.0%) · ok=15 err=0 · 24.5/min (Ø 24.5) · ETA 21h14m
zeile=$(grep -E '^\[[A-Z_]+\] [0-9]+/[0-9]+' run_local.log 2>/dev/null | tail -1)
modell=$(printf '%s' "$zeile" | sed -n 's/^\[\([A-Z_]*\)\].*/\1/p')
fertig=$(printf '%s' "$zeile" | sed -n 's/^\[[A-Z_]*\] \([0-9]*\)\/.*/\1/p')
gesamt=$(printf '%s' "$zeile" | sed -n 's/^\[[A-Z_]*\] [0-9]*\/\([0-9]*\).*/\1/p')
fehler=$(printf '%s' "$zeile" | sed -n 's/.*err=\([0-9]*\).*/\1/p')
rate=$(printf   '%s' "$zeile" | sed -n 's#.*· *\([0-9.]*\)/min.*#\1#p')
eta=$(printf    '%s' "$zeile" | sed -n 's/.*ETA \([0-9hm]*\).*/\1/p')
[ -z "${modell:-}" ] && modell=$(printf '%s' "${MODELS:-}" | cut -d, -f1)

json=$(MODELL="$modell" FERTIG="${fertig:-}" GESAMT="${gesamt:-}" FEHLER="${fehler:-}" \
       RATE="${rate:-}" ETA="${eta:-}" ZEILE="$zeile" LAEUFT="$laeuft" \
       FENSTER="$fenster" FREIGABE="$freigabe" python3 - <<'PY'
import os, json, datetime
def num(k):
    v = os.environ.get(k, '')
    try: return int(v)
    except ValueError:
        try: return float(v)
        except ValueError: return None
print(json.dumps({
    'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'modell': os.environ.get('MODELL') or None,
    'fertig': num('FERTIG'), 'gesamt': num('GESAMT'),
    'fehler': num('FEHLER'), 'rate': num('RATE'),
    'eta': os.environ.get('ETA') or None,
    'letzte_zeile': (os.environ.get('ZEILE') or '')[:200] or None,
    'runner_laeuft': os.environ['LAEUFT'] == 'true',
    'fenster_offen': os.environ['FENSTER'] == 'true',
    'freigabe': os.environ['FREIGABE'] == 'true',
}, ensure_ascii=False))
PY
)
curl -s -m 25 -X PUT "${UPLOAD_URL%/}/v1/status" \
  -H "X-API-Key: $UPLOAD_KEY" -H 'Content-Type: application/json' \
  --data "$json" >/dev/null
