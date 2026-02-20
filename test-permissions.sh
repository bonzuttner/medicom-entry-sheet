#!/bin/bash

# PharmaPOP Entry System - 権限テストスクリプト
# PERMISSIONS.md に記載されているテストシナリオを自動実行

BASE_URL="http://localhost:3000"
COOKIE_FILE="/tmp/pharmapop-test-cookie.txt"

# 色付き出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# テスト結果集計
PASS=0
FAIL=0

# ユーティリティ関数
log_test() {
    echo -e "\n${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASS=$((PASS + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAIL=$((FAIL + 1))
}

# ログイン
login() {
    local username=$1
    local password=$2

    log_test "ログイン: $username"

    response=$(curl -s -c $COOKIE_FILE -X POST \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$username\",\"password\":\"$password\"}" \
        "$BASE_URL/api/auth/login")

    if echo "$response" | grep -q "\"id\""; then
        log_pass "ログイン成功: $username"
        return 0
    else
        log_fail "ログイン失敗: $username"
        return 1
    fi
}

# ログアウト（Cookieクリア）
logout() {
    rm -f $COOKIE_FILE
}

# シート一覧取得
get_sheets() {
    curl -s -b $COOKIE_FILE "$BASE_URL/api/sheets"
}

# ユーザー一覧取得
get_users() {
    curl -s -b $COOKIE_FILE "$BASE_URL/api/users"
}

# マスターデータ取得
get_master() {
    curl -s -b $COOKIE_FILE "$BASE_URL/api/master"
}

# 現在のユーザー情報取得
get_current_user() {
    curl -s -b $COOKIE_FILE "$BASE_URL/api/current-user"
}

# シート数をカウント
count_sheets() {
    get_sheets | grep -o '"id"' | wc -l | tr -d ' '
}

# ユーザー数をカウント
count_users() {
    get_users | grep -o '"id"' | wc -l | tr -d ' '
}

# 特定メーカーのシートをカウント
count_sheets_by_manufacturer() {
    local manufacturer=$1
    get_sheets | grep -o "\"manufacturerName\":\"$manufacturer\"" | wc -l | tr -d ' '
}

# 特定メーカーのユーザーをカウント
count_users_by_manufacturer() {
    local manufacturer=$1
    get_users | grep -o "\"manufacturerName\":\"$manufacturer\"" | wc -l | tr -d ' '
}

echo "======================================"
echo "PharmaPOP Entry System - 権限テスト"
echo "======================================"

# テスト1: ADMIN ユーザー（admin）
echo -e "\n${YELLOW}=== テスト1: ADMIN ユーザー (admin) ===${NC}"

login "admin" "Password1!" || exit 1

# 現在のユーザー情報確認
current_user=$(get_current_user)
if echo "$current_user" | grep -q '"role":"ADMIN"'; then
    log_pass "ロールが ADMIN であることを確認"
else
    log_fail "ロールが ADMIN ではない"
fi

# シート一覧取得
log_test "エントリーシート一覧の取得"
total_sheets=$(count_sheets)
if [ "$total_sheets" -gt 0 ]; then
    log_pass "全メーカーのシートを取得: $total_sheets 件"
else
    log_fail "シートが取得できない"
fi

# ユーザー一覧取得
log_test "アカウント一覧の取得"
total_users=$(count_users)
if [ "$total_users" -ge 3 ]; then
    log_pass "全アカウントを取得: $total_users 件"
else
    log_fail "全アカウントを取得できない: $total_users 件"
fi

# マスターデータ取得
log_test "マスターデータの取得"
master=$(get_master)
if echo "$master" | grep -q "manufacturerNames"; then
    log_pass "マスターデータを取得可能"
else
    log_fail "マスターデータを取得できない"
fi

logout

# テスト2: STAFF ユーザー（satou - 大江戸製薬）
echo -e "\n${YELLOW}=== テスト2: STAFF ユーザー (satou - 大江戸製薬) ===${NC}"

login "satou" "Satou1!!" || exit 1

# 現在のユーザー情報確認
current_user=$(get_current_user)
if echo "$current_user" | grep -q '"role":"STAFF"'; then
    log_pass "ロールが STAFF であることを確認"
else
    log_fail "ロールが STAFF ではない"
fi

if echo "$current_user" | grep -q '"manufacturerName":"大江戸製薬"'; then
    log_pass "メーカー名が「大江戸製薬」であることを確認"
else
    log_fail "メーカー名が「大江戸製薬」ではない"
fi

# シート一覧取得（自社のみ）
log_test "エントリーシート一覧の取得（自社のみ）"
oedo_sheets=$(count_sheets_by_manufacturer "大江戸製薬")
total_sheets_staff=$(count_sheets)

if [ "$oedo_sheets" -eq "$total_sheets_staff" ]; then
    log_pass "自社（大江戸製薬）のシートのみ表示: $oedo_sheets 件"
else
    log_fail "他社のシートが含まれている: 大江戸製薬=$oedo_sheets 件, 合計=$total_sheets_staff 件"
fi

# ユーザー一覧取得（自社のみ）
log_test "アカウント一覧の取得（自社のみ）"
oedo_users=$(count_users_by_manufacturer "大江戸製薬")
total_users_staff=$(count_users)

if [ "$oedo_users" -eq "$total_users_staff" ]; then
    log_pass "自社（大江戸製薬）のアカウントのみ表示: $oedo_users 件"
else
    log_fail "他社のアカウントが含まれている: 大江戸製薬=$oedo_users 件, 合計=$total_users_staff 件"
fi

# マスターデータ取得（閲覧可能）
log_test "マスターデータの取得（閲覧可能）"
master=$(get_master)
if echo "$master" | grep -q "manufacturerNames"; then
    log_pass "マスターデータを閲覧可能"
else
    log_fail "マスターデータを閲覧できない"
fi

logout

# テスト3: STAFF ユーザー（tanaka - 富士ファーマ）
echo -e "\n${YELLOW}=== テスト3: STAFF ユーザー (tanaka - 富士ファーマ) ===${NC}"

login "tanaka" "Tanaka1!" || exit 1

# 現在のユーザー情報確認
current_user=$(get_current_user)
if echo "$current_user" | grep -q '"role":"STAFF"'; then
    log_pass "ロールが STAFF であることを確認"
else
    log_fail "ロールが STAFF ではない"
fi

if echo "$current_user" | grep -q '"manufacturerName":"富士ファーマ"'; then
    log_pass "メーカー名が「富士ファーマ」であることを確認"
else
    log_fail "メーカー名が「富士ファーマ」ではない"
fi

# シート一覧取得（自社のみ）
log_test "エントリーシート一覧の取得（自社のみ）"
fuji_sheets=$(count_sheets_by_manufacturer "富士ファーマ")
total_sheets_staff=$(count_sheets)

if [ "$fuji_sheets" -eq "$total_sheets_staff" ]; then
    log_pass "自社（富士ファーマ）のシートのみ表示: $fuji_sheets 件"
else
    log_fail "他社のシートが含まれている: 富士ファーマ=$fuji_sheets 件, 合計=$total_sheets_staff 件"
fi

# ユーザー一覧取得（自社のみ）
log_test "アカウント一覧の取得（自社のみ）"
fuji_users=$(count_users_by_manufacturer "富士ファーマ")
total_users_staff=$(count_users)

if [ "$fuji_users" -eq "$total_users_staff" ]; then
    log_pass "自社（富士ファーマ）のアカウントのみ表示: $fuji_users 件"
else
    log_fail "他社のアカウントが含まれている: 富士ファーマ=$fuji_users 件, 合計=$total_users_staff 件"
fi

logout

# テスト結果サマリー
echo -e "\n======================================"
echo -e "テスト結果サマリー"
echo -e "======================================"
echo -e "${GREEN}PASS: $PASS${NC}"
echo -e "${RED}FAIL: $FAIL${NC}"
echo -e "合計: $((PASS + FAIL)) テスト"

if [ $FAIL -eq 0 ]; then
    echo -e "\n${GREEN}✓ すべてのテストに合格しました！${NC}"
    exit 0
else
    echo -e "\n${RED}✗ $FAIL 件のテストが失敗しました${NC}"
    exit 1
fi
