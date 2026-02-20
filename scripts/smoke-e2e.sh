#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_USERNAME="${TEST_USERNAME:-admin}"
TEST_PASSWORD="${TEST_PASSWORD:-Password1!}"
COOKIE_FILE="${COOKIE_FILE:-/tmp/pharmapop-smoke-cookie.txt}"

cleanup() {
  rm -f "$COOKIE_FILE"
}
trap cleanup EXIT

log() {
  printf '[smoke] %s\n' "$1"
}

fail() {
  printf '[smoke][FAIL] %s\n' "$1" >&2
  exit 1
}

json_field() {
  local key="$1"
  node -e "const fs=require('fs'); const o=JSON.parse(fs.readFileSync(0,'utf8')); const v=o['$key']; process.stdout.write(v===undefined||v===null?'':String(v));"
}

json_has_sheet_id() {
  local target_id="$1"
  node -e "const fs=require('fs'); const rows=JSON.parse(fs.readFileSync(0,'utf8')); process.exit(Array.isArray(rows)&&rows.some(r=>r&&r.id==='${target_id}')?0:1);"
}

generate_uuid() {
  node -e "console.log(require('crypto').randomUUID())"
}

log "login as ${TEST_USERNAME}"
login_body="$(printf '{"username":"%s","password":"%s"}' "$TEST_USERNAME" "$TEST_PASSWORD")"
login_response="$(curl -sS -c "$COOKIE_FILE" -X POST -H 'Content-Type: application/json' -d "$login_body" "$BASE_URL/api/auth/login")"
login_id="$(printf '%s' "$login_response" | json_field id)"
[ -n "$login_id" ] || fail "login failed: $login_response"

log "fetch current user"
current_user="$(curl -sS -b "$COOKIE_FILE" "$BASE_URL/api/current-user")"
creator_id="$(printf '%s' "$current_user" | json_field id)"
creator_name="$(printf '%s' "$current_user" | json_field displayName)"
manufacturer_name="$(printf '%s' "$current_user" | json_field manufacturerName)"
email="$(printf '%s' "$current_user" | json_field email)"
phone_number="$(printf '%s' "$current_user" | json_field phoneNumber)"
[ -n "$creator_id" ] || fail "failed to read current user: $current_user"

sheet_id="$(generate_uuid)"
product_id="$(generate_uuid)"
now_iso="$(node -e "console.log(new Date().toISOString())")"
jan_code="4900000000001"

payload="$(cat <<EOF
{
  "sheet": {
    "id": "$sheet_id",
    "createdAt": "$now_iso",
    "updatedAt": "$now_iso",
    "creatorId": "$creator_id",
    "creatorName": "$creator_name",
    "manufacturerName": "$manufacturer_name",
    "email": "$email",
    "phoneNumber": "$phone_number",
    "title": "SMOKE TEST $(date +%s)",
    "notes": "",
    "status": "draft",
    "products": [
      {
        "id": "$product_id",
        "shelfName": "テスト棚",
        "manufacturerName": "$manufacturer_name",
        "janCode": "$jan_code",
        "productName": "スモーク商品",
        "riskClassification": "",
        "specificIngredients": [],
        "catchCopy": "",
        "productMessage": "",
        "productNotes": "",
        "width": 10,
        "height": 10,
        "depth": 10,
        "facingCount": 1,
        "hasPromoMaterial": "no"
      }
    ]
  }
}
EOF
)"

log "save draft sheet"
save_code="$(curl -sS -o /tmp/pharmapop_smoke_save_body.txt -w '%{http_code}' -b "$COOKIE_FILE" -X PUT -H 'Content-Type: application/json' -d "$payload" "$BASE_URL/api/sheets/$sheet_id")"
[ "$save_code" = "200" ] || fail "save failed($save_code): $(cat /tmp/pharmapop_smoke_save_body.txt)"

log "verify sheet appears in list"
sheets_response="$(curl -sS -b "$COOKIE_FILE" "$BASE_URL/api/sheets")"
printf '%s' "$sheets_response" | json_has_sheet_id "$sheet_id" || fail "saved sheet not found in list"

log "cleanup test sheet"
delete_code="$(curl -sS -o /tmp/pharmapop_smoke_delete_body.txt -w '%{http_code}' -b "$COOKIE_FILE" -X DELETE "$BASE_URL/api/sheets/$sheet_id")"
[ "$delete_code" = "200" ] || fail "cleanup failed($delete_code): $(cat /tmp/pharmapop_smoke_delete_body.txt)"

log "PASS"
