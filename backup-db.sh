#!/usr/bin/env bash
# Dumps the NaijaBites MySQL database to backups/<name>-<timestamp>.sql
set -euo pipefail
cd "$(dirname "$0")"
DUMP="/c/Program Files/MySQL/MySQL Server 8.4/bin/mysqldump.exe"
[ -x "$DUMP" ] || DUMP="$(command -v mysqldump)"
mkdir -p backups
OUT="backups/naijabites_$(date +%Y%m%d-%H%M%S).sql"
"$DUMP" -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3307}" \
  -u "${DB_MIGRATOR_USER:-naijabites_migrator}" -p"${DB_MIGRATOR_PASSWORD:-migrator_dev_only_change_me}" \
  --single-transaction --no-tablespaces --routines --triggers --events \
  --set-gtid-purged=OFF --result-file="$OUT" "${DB_NAME:-naijabites}"
echo "Backup written: $OUT ($(wc -c < "$OUT") bytes)"
