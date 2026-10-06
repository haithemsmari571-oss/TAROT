#!/usr/bin/env bash
# Starts the visitor statistics, Umami (ROUND61), on the server as root, once
# its secrets exist (make-secrets.sh beside this file):
#     bash /root/TAROT/scripts/umami/start.sh
# Safe to run again at any time: every step checks first and leaves what is
# already right alone. No secret is ever printed.
#
# 1. Umami's own user and database, both "umami" (the names in
#    docker-compose.umami.yml's DATABASE_URL), in the site's postgres container.
#    The site's own database is never touched. The user is no superuser, holds
#    at most 10 connections, and any query of its stops after 60 seconds, so
#    the statistics can never hold the site's database up.
# 2. Umami itself (docker-compose.umami.yml, a compose project of its own),
#    then waits until it answers.
# 3. The site in Umami, "Ask Valentina", with the id the site's pages send
#    (tarot-landing-web/src/features/analytics/analytics.ts, read from there).
# 4. Says whether the dashboard still has Umami's first password, which must
#    be changed at the first sign-in (README.md beside this file, step 4).
set -Eeuo pipefail

TAROT_DIR="${TAROT_DIR:-/root/TAROT}"
SECRETS="$TAROT_DIR/.env.umami"
POSTGRES_CONTAINER=tarot-postgres   # docker-compose.yml container_name
UMAMI_CONTAINER=tarot-umami         # docker-compose.umami.yml container_name
UMAMI_DB=umami                      # docker-compose.umami.yml DATABASE_URL
ANALYTICS_TS="$TAROT_DIR/tarot-landing-web/src/features/analytics/analytics.ts"
STATEMENT_TIMEOUT=60s
CONNECTION_LIMIT=10

step="Umami did not start"
fail() {
  echo "FAILED. $step (line $1 of start.sh; the lines above say why)."
  exit 1
}
trap 'fail $LINENO' ERR

cd "$TAROT_DIR"

step="The secrets are missing: run  bash $TAROT_DIR/scripts/umami/make-secrets.sh  first"
password=$(sed -n 's/^UMAMI_DB_PASSWORD=\([0-9a-f]\{64\}\)$/\1/p' "$SECRETS")
[ -n "$password" ]

step="The site's id was not found in $ANALYTICS_TS"
website_id=$(sed -n 's/^export const ANALYTICS_WEBSITE_ID = "\([0-9a-f-]\{36\}\)";$/\1/p' "$ANALYTICS_TS")
[ -n "$website_id" ]

# psql inside the postgres container as its own POSTGRES_USER, no password
# typed, reading SQL from this script (never from the command line).
psql_in() {
  docker exec -i "$POSTGRES_CONTAINER" sh -c "psql -X -q -t -A -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d $1"
}

echo "1. Umami's user and database in the site's postgres"
step="Umami's user and database could not be made"
{
  printf '\\set pw %s\n' "'$password'"
  cat <<SQL
SELECT 'CREATE ROLE $UMAMI_DB LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$UMAMI_DB') \gexec
ALTER ROLE $UMAMI_DB WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT $CONNECTION_LIMIT PASSWORD :'pw';
ALTER ROLE $UMAMI_DB SET statement_timeout = '$STATEMENT_TIMEOUT';
ALTER ROLE $UMAMI_DB SET idle_in_transaction_session_timeout = '$STATEMENT_TIMEOUT';
SELECT 'CREATE DATABASE $UMAMI_DB OWNER $UMAMI_DB' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$UMAMI_DB') \gexec
REVOKE ALL ON DATABASE $UMAMI_DB FROM PUBLIC;
SQL
} | psql_in postgres
echo "   ready."

echo "2. Umami (the first start downloads it, about 1.5 GB, and takes a few minutes)"
step="Umami could not be started"
docker compose --env-file "$SECRETS" -f "$TAROT_DIR/docker-compose.umami.yml" up -d
step="Umami did not answer within 5 minutes (docker logs $UMAMI_CONTAINER says why)"
ready=""
for _ in $(seq 1 100); do
  if docker exec "$UMAMI_CONTAINER" curl -fsS -o /dev/null http://localhost:3000/api/heartbeat 2>/dev/null; then
    ready=1
    break
  fi
  sleep 3
done
[ -n "$ready" ]
echo "   running."

echo "3. The site in Umami"
step="The site could not be added in Umami"
found=$(psql_in "$UMAMI_DB" <<SQL
INSERT INTO website (website_id, name, domain, user_id, created_by, created_at)
SELECT '$website_id', 'Ask Valentina', 'askvalentina.co.uk', user_id, user_id, now()
FROM "user" WHERE role = 'admin' AND deleted_at IS NULL ORDER BY created_at LIMIT 1
ON CONFLICT (website_id) DO NOTHING;
SELECT count(*) FROM website WHERE website_id = '$website_id' AND deleted_at IS NULL;
SQL
)
step="The site Ask Valentina is not in Umami (was it deleted in the dashboard?)"
[ "$found" = 1 ]
echo "   Ask Valentina is there (id $website_id)."

echo "4. The dashboard's password"
answer=$(docker exec "$UMAMI_CONTAINER" curl -s -o /dev/null -w '%{http_code}' \
  -H 'Content-Type: application/json' --data '{"username":"admin","password":"umami"}' \
  http://localhost:3000/api/auth/login || true)
if [ "$answer" = 200 ]; then
  echo "   STILL UMAMI'S FIRST PASSWORD. Sign in and change it now (README.md, step 4)."
else
  echo "   changed: Umami's first password no longer opens it."
fi
echo "Done. Umami is running."
