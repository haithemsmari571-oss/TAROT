#!/usr/bin/env bash
# The visitor statistics' secrets (ROUND61), made once on the server as root:
#     bash /root/TAROT/scripts/umami/make-secrets.sh
#
# Writes /root/TAROT/.env.umami, which docker-compose.umami.yml and start.sh
# read: Umami's database password, its APP_SECRET (signs dashboard sign-ins)
# and its two-factor key, each 32 random bytes from the kernel, as 64 hex
# characters. Readable by root only, never printed, never committed
# (.gitignore). A file that is already there is left alone: the database
# password in it is the one the database already has.
set -Eeuo pipefail

TAROT_DIR="${TAROT_DIR:-/root/TAROT}"
SECRETS="$TAROT_DIR/.env.umami"

if [ -e "$SECRETS" ]; then
  echo "$SECRETS is already there. Nothing was changed."
  exit 0
fi

secret() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }

umask 077
{
  echo "# Umami's secrets (scripts/umami/make-secrets.sh). Never share, print or commit this file."
  echo "UMAMI_DB_PASSWORD=$(secret)"
  echo "UMAMI_APP_SECRET=$(secret)"
  echo "UMAMI_TWO_FACTOR_KEY=$(secret)"
} > "$SECRETS.partial"
mv -- "$SECRETS.partial" "$SECRETS"
echo "Written: $SECRETS, three secrets, readable by root only. None of them was shown."
