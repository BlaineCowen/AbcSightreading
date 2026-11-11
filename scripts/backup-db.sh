#!/bin/zsh
#
# Nightly copy of the shared database (11 November 2026: there was none; the
# host's own restore window was the only way back from a bad migration or a
# wrong delete, and it is short).
#
# pg_dump in its custom format (restore with pg_restore), checked by listing it,
# kept in ~/Backups/abc-sightreading and copied to the storage server, the last
# RETAIN at both ends. The direct host is used when .env.local names one
# (DIRECT_URL: Neon's, after the move), else DATABASE_URL. A failure goes to
# Telegram, as the site alerts do (Hermes's bot, ~/.hermes/.env).
#
# Run by hand any time, or nightly at 2 am by
# ~/Library/LaunchAgents/com.blainecowen.abc-db-backup.plist
# (scripts/com.blainecowen.abc-db-backup.plist).
#
# Restore into an EMPTY database, never over the live one:
#   /opt/homebrew/opt/libpq/bin/pg_restore --no-owner --no-acl -d "<empty db url>" abcsr-<stamp>.dump
set -u

ROOT=/Users/blainecowen/Projects/abcSightreading
DIR=$HOME/Backups/abc-sightreading
REMOTE_HOST=blaine@server
REMOTE_DIR=/mnt/storage/backups/abc-sightreading
RETAIN=30
PG=/opt/homebrew/opt/libpq/bin

STAMP=$(date '+%Y%m%dT%H%M%S')
OUT=$DIR/abcsr-$STAMP.dump
LOG=$DIR/backup.log
mkdir -p $DIR

say() { echo "$(date '+%F %T')  $*" >> $LOG }
alert() {
  local tok chat
  tok=$(grep -E '^TELEGRAM_BOT_TOKEN=' $HOME/.hermes/.env 2>/dev/null | cut -d= -f2- | tr -d '"'"'")
  chat=$(grep -E '^TELEGRAM_HOME_CHANNEL=' $HOME/.hermes/.env 2>/dev/null | cut -d= -f2- | tr -d '"'"'")
  [[ -n $tok && -n $chat ]] && /usr/bin/curl -s -o /dev/null "https://api.telegram.org/bot$tok/sendMessage" \
    --data-urlencode "chat_id=$chat" --data-urlencode "text=abcSightReading: the nightly database backup failed: $1 (log: $LOG)"
}
die() { say "FAILED: $*"; rm -f $OUT; alert "$*"; exit 1 }

cd $ROOT || die "no $ROOT"
set -a; source ./.env.local || die "no .env.local"; set +a
URL=${DIRECT_URL:-${DATABASE_URL:-}}
[[ -n $URL ]] || die "no DIRECT_URL or DATABASE_URL in .env.local"

say "=== backup $STAMP ==="
$PG/pg_dump --format=custom --no-owner --no-acl --schema=public --file=$OUT "$URL" 2>>$LOG || die "pg_dump"
TABLES=$($PG/pg_restore --list $OUT 2>>$LOG | grep -c 'TABLE DATA') || die "pg_restore --list"
(( TABLES >= 20 )) || die "only $TABLES tables in the dump"
say "ok: $TABLES tables, $(du -h $OUT | cut -f1)"

# Keep the newest RETAIN here.
ls -1t $DIR/abcsr-*.dump 2>/dev/null | tail -n +$((RETAIN + 1)) | xargs -r rm -f

# And on the storage server (a failure here is reported, the local copy stays).
if /usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=10 $REMOTE_HOST "mkdir -p $REMOTE_DIR" 2>>$LOG &&
   /usr/bin/scp -q -o BatchMode=yes $OUT $REMOTE_HOST:$REMOTE_DIR/ 2>>$LOG; then
  /usr/bin/ssh -o BatchMode=yes $REMOTE_HOST "ls -1t $REMOTE_DIR/abcsr-*.dump | tail -n +$((RETAIN + 1)) | xargs -r rm -f" 2>>$LOG
  say "copied to $REMOTE_HOST"
else
  say "FAILED: copy to $REMOTE_HOST"
  alert "copy to the storage server (the local copy is fine)"
fi
