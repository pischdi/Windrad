#!/usr/bin/env bash
# Misst Übertragungsrate per HTTP-Range (5 MB) + Gesamtgröße per HEAD.
# Aufruf: measure_dl.sh <label> <url>
# Ausgabe: TSV  label | http_code | total_bytes | got_bytes | seconds | MB/s
set -u
LABEL="$1"; URL="$2"
UA="windrad-hoehendaten-messung/1.0 (Vergleich Beschaffungsweg; nur Stichprobe)"

HEADOUT=$(curl -sIL --max-time 45 -A "$UA" "$URL" 2>/dev/null | tr -d '\r')
TOTAL=$(printf '%s\n' "$HEADOUT" | awk 'tolower($1)=="content-length:"{v=$2} END{print v+0}')
sleep 2
RES=$(curl -s -o /dev/null -L --max-time 180 -A "$UA" \
      -H "Range: bytes=0-5242879" \
      -w '%{http_code}\t%{size_download}\t%{time_total}' "$URL" 2>/dev/null)
CODE=$(printf '%s' "$RES" | cut -f1)
GOT=$(printf '%s' "$RES" | cut -f2)
SECS=$(printf '%s' "$RES" | cut -f3)
RATE=$(awk -v g="$GOT" -v s="$SECS" 'BEGIN{ if(s>0) printf "%.2f", g/1048576/s; else print "0" }')
printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$LABEL" "$CODE" "$TOTAL" "$GOT" "$SECS" "$RATE"
