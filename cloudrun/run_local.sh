#!/usr/bin/env bash
# Lokaler Runner-Start: lädt .env, aktiviert venv, läuft resume-sicher.
# Nutzung:
#   ./run_local.sh            # im Vordergrund (Ctrl-C = sauberer Stop, Resume beim nächsten Start)
#   ./run_local.sh bg         # im Hintergrund (überlebt Terminal-Schließen), Log: run_local.log
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "FEHLT: .env  (cp .env.example .env && nano .env)"; exit 2; }
set -a; . ./.env; set +a

# venv anlegen/aktivieren
if [ ! -d .venv ]; then
  python3 -m venv .venv
  . .venv/bin/activate
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements-local.txt
else
  . .venv/bin/activate
fi

if [ "${1:-}" = "bg" ]; then
  # setsid + nohup: läuft weiter, auch wenn das Terminal/SSH zugeht
  setsid nohup python3 -u run_local.py >> run_local.log 2>&1 &
  echo "Gestartet im Hintergrund (PID $!). Live mitlesen:  tail -f run_local.log"
  echo "Stoppen:  kill $!   (oder: pkill -f run_local.py)  — Resume beim nächsten Start"
else
  exec python3 -u run_local.py
fi
