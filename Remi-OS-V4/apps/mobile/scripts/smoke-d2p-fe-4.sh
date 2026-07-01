#!/usr/bin/env bash
# smoke-d2p-fe-4.sh — verify D2P-FE-4 wiring without needing a debug menu.
#
# Usage:
#   ./scripts/smoke-d2p-fe-4.sh <orderId>
#
# What it does (using only curl + jq + psql, all already on this Mac):
#   1. Logs in as the demo tech josh@remi-demo.com against http://localhost:3000.
#   2. GETs /api/v1/technician/jobs/<orderId> and prints `tagged_for_review_at`.
#   3. Queries the local Postgres `appointment_notes` table for the 5 most
#      recent notes on that order (newest first).
#
# Why: there is no GET endpoint for notes, so we read the table directly.
# That's the only "verify the note really saved" path until a future chunk
# adds GET /jobs/:id/notes + a notes section in the order detail screen.

set -euo pipefail

ORDER_ID="${1:-}"

DB_NAME="${DB_NAME:-remi_dev}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# When called with no args (or `list`), print the 20 most recent orders
# assigned to the demo tech so you can pick an ID by matching the customer
# name to whatever you tapped in the app. No URL bar needed.
if [[ -z "$ORDER_ID" || "$ORDER_ID" == "list" ]]; then
  echo "Recent orders for josh@remi-demo.com (most recent first):"
  echo
  PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT a.id AS order_id,
           u.full_name AS customer,
           a.scheduled_date,
           a.status,
           a.tagged_for_review_at
      FROM appointments a
      JOIN users u ON u.id = a.customer_id
     WHERE a.technician_id = (SELECT id FROM users WHERE email='josh@remi-demo.com')
     ORDER BY a.scheduled_date DESC
     LIMIT 20;
  "
  echo
  echo "Pick an order_id whose customer name matches the row you tapped in the app, then re-run:"
  echo "  $0 <orderId>"
  exit 0
fi

API="${API:-http://localhost:3000/api/v1/technician}"
EMAIL="${EMAIL:-josh@remi-demo.com}"
PASSWORD="${PASSWORD:-password123}"

echo "==> Logging in as $EMAIL ..."
LOGIN_JSON=$(curl -fsS -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_JSON" | jq -r '.data.tokens.accessToken // .data.access_token // .data.token // empty')
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: could not extract access token. Raw response:" >&2
  echo "$LOGIN_JSON" | jq . >&2
  exit 1
fi
echo "    OK (token len=${#TOKEN})"

echo
echo "==> Fetching /jobs/$ORDER_ID ..."
DETAIL=$(curl -fsS "$API/jobs/$ORDER_ID" -H "Authorization: Bearer $TOKEN")

CUSTOMER=$(echo "$DETAIL" | jq -r '.data.appointment.customer.full_name // .data.appointment.customer_name // "(unknown)"')
STATUS=$(echo "$DETAIL" | jq -r '.data.appointment.status // "(unknown)"')
TAGGED=$(echo "$DETAIL" | jq -r '.data.appointment.tagged_for_review_at // empty')

echo "    Customer: $CUSTOMER"
echo "    Status:   $STATUS"
if [[ -z "$TAGGED" || "$TAGGED" == "null" ]]; then
  echo "    tagged_for_review_at: (null) -- NOT tagged for review"
else
  echo "    tagged_for_review_at: $TAGGED"
fi

echo
echo "==> Last 5 notes for order $ORDER_ID (from appointment_notes table) ..."
PSQL_OUT=$(PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -A -F $'\t' -t -c "
  SELECT id, created_at::text, COALESCE(author_user_id::text, '?'), note
    FROM appointment_notes
   WHERE appointment_id = $ORDER_ID
   ORDER BY created_at DESC
   LIMIT 5;
" 2>/dev/null || true)

if [[ -z "$PSQL_OUT" ]]; then
  echo "    (no notes found for this order)"
else
  printf "    %-6s  %-30s  %-8s  %s\n" "id" "created_at" "user_id" "note"
  printf "    %-6s  %-30s  %-8s  %s\n" "------" "------------------------------" "--------" "----"
  while IFS=$'\t' read -r id created_at user_id note; do
    printf "    %-6s  %-30s  %-8s  %s\n" "$id" "$created_at" "$user_id" "$note"
  done <<< "$PSQL_OUT"
fi

echo
echo "Done."
