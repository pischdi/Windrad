#!/usr/bin/env bash
# Zeitfenster-Waechter fuer den Kachel-Runner.
#
# Erlaubtes Fenster (Pischdi, 2026-09-13):
#   Mo-Fr: 18:00 bis 07:00 des Folgetags
#   Sa+So: durchgehend
# Ausserhalb des Fensters wird der Runner sauber gestoppt (SIGTERM -> Resume beim naechsten Start).
#
# Start:  ./window_guard.sh start     (Hintergrund, ueberlebt Terminal-Schliessen)
#         ./window_guard.sh fg        (Vordergrund, zum Zuschauen)
# Stop:   ./window_guard.sh stop      (Waechter + laufenden Runner beenden)
# Status: ./window_guard.sh status
set -uo pipefail
cd "$(dirname "$0")"

GUARD_LOG="window_guard.log"
RUN_LOG="run_local.log"
GUARD_PID_FILE=".guard.pid"
RUN_PID_FILE=".runner.pid"
CHECK_INTERVAL=60

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$GUARD_LOG"; }

# Ausdrueckliche Freigabe durch Pischdi: Datei .freigabe haelt das Fenster offen,
# unabhaengig von Uhrzeit und Wochentag. Loeschen = zurueck zur Regel.
in_window() {
  local dow hour
  [ -f .freigabe ] && return 0
  dow=$(date +%u)   # 1=Mo .. 7=So
  hour=$(date +%H)
  hour=$((10#$hour))
  if [ "$dow" -ge 6 ]; then return 0; fi          # Sa/So: immer
  if [ "$hour" -ge 18 ] || [ "$hour" -lt 7 ]; then return 0; fi
  return 1
}

runner_pid() {
  [ -f "$RUN_PID_FILE" ] || return 1
  local pid; pid=$(cat "$RUN_PID_FILE" 2>/dev/null)
  [ -n "${pid:-}" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  printf '%s' "$pid"
}

start_runner() {
  if runner_pid >/dev/null; then return 0; fi
  if [ ! -f .env ]; then log "START ABGEBROCHEN: .env fehlt"; return 1; fi
  set -a; . ./.env; set +a
  # Zwei Betriebsarten: Upload ueber die Elevation-API (kein S3 noetig) oder klassisch mit R2-Schluesseln.
  if [ -n "${UPLOAD_URL:-}" ]; then
    if [ -z "${UPLOAD_KEY:-}" ]; then log "START ABGEBROCHEN: UPLOAD_KEY fehlt in .env"; return 1; fi
  elif [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
    log "START ABGEBROCHEN: weder UPLOAD_URL noch R2-Schluessel in .env"; return 1
  fi
  setsid nohup .venv/bin/python -u run_local.py >> "$RUN_LOG" 2>&1 &
  echo $! > "$RUN_PID_FILE"
  log "Runner gestartet (PID $(cat "$RUN_PID_FILE"))"
}

stop_runner() {
  local pid; pid=$(runner_pid) || return 0
  log "Stopp-Signal an Runner (PID $pid) — laufende Downloads werden zu Ende gebracht"
  kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 1 120); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null; then
    log "Runner reagiert nicht — SIGKILL (Resume bleibt sicher)"
    kill -KILL "$pid" 2>/dev/null
  fi
  rm -f "$RUN_PID_FILE"
  log "Runner gestoppt"
}

loop() {
  echo $$ > "$GUARD_PID_FILE"
  log "Waechter gestartet (PID $$) · Fenster: Mo-Fr 18:00-07:00, Sa+So durchgehend"
  trap 'log "Waechter beendet"; stop_runner; rm -f "$GUARD_PID_FILE"; exit 0' TERM INT
  while true; do
    if in_window; then
      runner_pid >/dev/null || start_runner
    else
      runner_pid >/dev/null && stop_runner
    fi
    # Lagemeldung fuer die Admin-Seite (fehlschlagen darf sie, ohne dass der
    # Waechter stehen bleibt — der Runner ist wichtiger als die Anzeige).
    [ -x ./status_push.sh ] && ./status_push.sh >/dev/null 2>&1 || true
    sleep "$CHECK_INTERVAL"
  done
}

case "${1:-start}" in
  fg)    loop ;;
  start)
    if [ -f "$GUARD_PID_FILE" ] && kill -0 "$(cat "$GUARD_PID_FILE" 2>/dev/null)" 2>/dev/null; then
      echo "Waechter laeuft bereits (PID $(cat "$GUARD_PID_FILE"))"; exit 0
    fi
    setsid nohup "$0" fg >/dev/null 2>&1 &
    sleep 1
    echo "Waechter gestartet (PID $(cat "$GUARD_PID_FILE" 2>/dev/null))· Log: $GUARD_LOG / $RUN_LOG"
    ;;
  stop)
    if [ -f "$GUARD_PID_FILE" ]; then kill -TERM "$(cat "$GUARD_PID_FILE")" 2>/dev/null; fi
    sleep 2
    stop_runner
    rm -f "$GUARD_PID_FILE"
    echo "Waechter und Runner gestoppt"
    ;;
  status)
    if [ -f "$GUARD_PID_FILE" ] && kill -0 "$(cat "$GUARD_PID_FILE" 2>/dev/null)" 2>/dev/null; then
      echo "Waechter: laeuft (PID $(cat "$GUARD_PID_FILE"))"
    else
      echo "Waechter: gestoppt"
    fi
    if pid=$(runner_pid); then echo "Runner:   laeuft (PID $pid)"; else echo "Runner:   gestoppt"; fi
    if in_window; then echo "Fenster:  offen (Runner soll laufen)"; else echo "Fenster:  zu (Runner soll pausieren)"; fi
    ;;
  frei)
    touch .freigabe
    echo "Freigabe gesetzt — Runner laeuft jetzt unabhaengig vom Zeitfenster."
    ;;
  normal)
    rm -f .freigabe
    echo "Freigabe aufgehoben — es gilt wieder Mo-Fr 18:00-07:00 / Wochenende."
    ;;
  *) echo "Nutzung: $0 {start|fg|stop|status|frei|normal}"; exit 2 ;;
esac
