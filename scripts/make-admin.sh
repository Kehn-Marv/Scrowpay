#!/usr/bin/env bash
# =====================================================================
#  make-admin.sh
#  POSIX equivalent of make-admin.ps1 for macOS / Linux / WSL users.
#  Reads TURSO_DATABASE_URL + TURSO_AUTH_TOKEN from ../.env and flips
#  users.is_admin = 1 for the given phone number.
#
#  Usage:
#    ./make-admin.sh +2348012345678
#    ./make-admin.sh --id 1            # promote by users.id (most reliable)
#  Or edit DEFAULT_PHONE below and just:
#    ./make-admin.sh
#
#  Requires: bash, curl, jq
# =====================================================================

set -euo pipefail

# ─── EDIT THIS if you don't want to pass the phone on the CLI ─────────
DEFAULT_PHONE="+2348012345678"
# ──────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../.env}"

USER_ID=""
PHONE=""
if [[ "${1:-}" == "--id" && -n "${2:-}" ]]; then
    USER_ID="$2"
else
    PHONE="${1:-$DEFAULT_PHONE}"
fi

# Sanity checks
command -v curl >/dev/null || { echo "❌ curl is required"; exit 1; }
command -v jq   >/dev/null || { echo "❌ jq is required (brew install jq | apt install jq)"; exit 1; }
[[ -f "$ENV_FILE" ]]      || { echo "❌ .env not found at $ENV_FILE"; exit 1; }

# Load TURSO_* from .env (only those two — ignore everything else)
TURSO_DATABASE_URL=$(grep -E '^TURSO_DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")
TURSO_AUTH_TOKEN=$(grep -E '^TURSO_AUTH_TOKEN='   "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")

if [[ -z "$TURSO_DATABASE_URL" || "$TURSO_DATABASE_URL" == *"your-database-name"* ]]; then
    echo "❌ TURSO_DATABASE_URL missing or placeholder in $ENV_FILE"; exit 1
fi
if [[ -z "$TURSO_AUTH_TOKEN" || "$TURSO_AUTH_TOKEN" == *"your-turso-auth-token"* ]]; then
    echo "❌ TURSO_AUTH_TOKEN missing or placeholder in $ENV_FILE"; exit 1
fi

# libsql:// → https://
HTTP_URL="${TURSO_DATABASE_URL/libsql:\/\//https:\/\/}"

echo "═══════════════════════════════════════════════════════"
echo "  ScrowPay — Grant Admin"
echo "═══════════════════════════════════════════════════════"
if [[ -n "$USER_ID" ]]; then
    echo "User id   : $USER_ID"
else
    echo "Phone     : $PHONE"
fi
echo "Turso URL : $HTTP_URL"
echo ""

# Helper: POST a single SQL statement. Pass arg type as "text" or "integer".
run_sql() {
    local sql="$1"
    local arg="$2"
    local arg_type="${3:-text}"
    curl -sS -X POST "$HTTP_URL/v2/pipeline" \
        -H "Authorization: Bearer $TURSO_AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$(jq -nc \
              --arg sql "$sql" \
              --arg arg "$arg" \
              --arg t   "$arg_type" \
              '{requests:[{type:"execute",stmt:{sql:$sql,args:[{type:$t,value:$arg}]}},{type:"close"}]}')"
}

# 1. Lookup
echo "→ Looking up user..."
if [[ -n "$USER_ID" ]]; then
    LOOKUP=$(run_sql 'SELECT id, first_name, last_name, is_admin FROM users WHERE id = ?' "$USER_ID" integer)
else
    LOOKUP=$(run_sql 'SELECT id, first_name, last_name, is_admin FROM users WHERE phone_number = ?' "$PHONE" text)
fi

ROW_COUNT=$(echo "$LOOKUP" | jq '.results[0].response.result.rows | length')
if [[ "$ROW_COUNT" -eq 0 ]]; then
    echo ""
    if [[ -n "$USER_ID" ]]; then
        echo "❌ No user found with id = $USER_ID"
    else
        echo "❌ No user found with phone_number = $PHONE"
        echo "   Check the format (must match exactly what's in the DB),"
        echo "   or try --id <n> using the numeric users.id."
    fi
    exit 1
fi

ROW_ID=$(echo "$LOOKUP" | jq -r '.results[0].response.result.rows[0][0].value')
NAME=$(echo "$LOOKUP" | jq -r '.results[0].response.result.rows[0][1].value + " " + .results[0].response.result.rows[0][2].value')
WAS_ADMIN=$(echo "$LOOKUP" | jq -r '.results[0].response.result.rows[0][3].value')

echo "Found: $NAME (id=$ROW_ID, is_admin was $WAS_ADMIN)"

if [[ "$WAS_ADMIN" == "1" ]]; then
    echo "✅ Already an admin. Nothing to do."
    exit 0
fi

# 2. Promote (always by id to avoid hidden-char issues in phone_number)
echo "→ Setting is_admin = 1..."
run_sql 'UPDATE users SET is_admin = 1 WHERE id = ?' "$ROW_ID" integer >/dev/null

# 3. Verify
VERIFY=$(run_sql 'SELECT is_admin FROM users WHERE id = ?' "$ROW_ID" integer)
NOW_ADMIN=$(echo "$VERIFY" | jq -r '.results[0].response.result.rows[0][0].value')

if [[ "$NOW_ADMIN" == "1" ]]; then
    echo ""
    echo "✅ Success! $NAME is now an admin."
    echo ""
    echo "Open: http://localhost:8080/admin.html"
else
    echo "⚠️  Verification returned is_admin = $NOW_ADMIN"
    exit 1
fi
