#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run-tests.sh — Run E2E tests locally against Mailpit
#
# Usage:
#   ./e2e/run-tests.sh                    # run all E2E tests
#   ./e2e/run-tests.sh --grep "password"  # only password tests
#   ./e2e/run-tests.sh --headed           # run with visible browser
#
# Prerequisites:
#   - Backend compiled: cd backend && cargo build --release
#   - Frontend deps:    cd tsv-tennis-app && npm ci
#   - E2E deps:         cd e2e && npm ci
#   - Playwright:       cd e2e && npx playwright install chromium
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[-]${NC} $*"; }

# ── PIDs for cleanup ─────────────────────────────────────────────────────────
MAILPIT_PID="" BACKEND_PID="" FRONTEND_PID=""

# Kill only processes we own on our ports (stale from previous runs)
kill_port_owners() {
    local port=$1
    local pids
    pids=$(fuser "$port/tcp" 2>/dev/null) || return 0
    for pid in $pids; do
        # Only kill if it looks like our test processes (mailpit, backend, vite)
        local comm
        comm=$(ps -p "$pid" -o comm= 2>/dev/null) || continue
        case "$comm" in
            mailpit|tsv-tennis-back|node|esbuild)
                kill "$pid" 2>/dev/null || true
                ;;
        esac
    done
}
for port in 5000 5173 1025 8025; do kill_port_owners "$port"; done
sleep 1

cleanup() {
    info "Cleaning up…"
    for pid_var in FRONTEND_PID BACKEND_PID MAILPIT_PID; do
        local pid="${!pid_var}"
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    # Give processes a moment to exit, then force-kill survivors on our ports
    sleep 1
    for port in 5173 5000 1025 8025; do kill_port_owners "$port"; done
    info "Done."
}
trap cleanup EXIT INT TERM

# ── 1. Mailpit ───────────────────────────────────────────────────────────────
if curl -sf http://localhost:8025/api/v1/messages >/dev/null 2>&1; then
    info "Mailpit already running on :1025/:8025"
else
    info "Starting Mailpit…"
    if [[ ! -x /tmp/mailpit ]]; then
        info "Downloading Mailpit…"
        curl -sL https://github.com/axllent/mailpit/releases/latest/download/mailpit-linux-amd64.tar.gz \
            | tar xz -C /tmp
    fi
    /tmp/mailpit \
        --smtp-tls-cert sans:localhost \
        --smtp-tls-key sans:localhost \
        --smtp-require-starttls > /tmp/e2e-mailpit.log 2>&1 &
    MAILPIT_PID=$!
    for i in $(seq 1 10); do
        if curl -sf http://localhost:8025/api/v1/messages >/dev/null 2>&1; then
            info "Mailpit ready (PID $MAILPIT_PID)"
            break
        fi
        if ! kill -0 "$MAILPIT_PID" 2>/dev/null; then
            error "Mailpit crashed! Log:"; cat /tmp/e2e-mailpit.log; exit 1
        fi
        sleep 1
    done
    if ! curl -sf http://localhost:8025/api/v1/messages >/dev/null 2>&1; then
        error "Mailpit failed to start after 10s"
        cat /tmp/e2e-mailpit.log
        exit 1
    fi
fi

# Flush any stale messages from previous runs
curl -sf -X DELETE http://localhost:8025/api/v1/messages >/dev/null 2>&1 || true

# ── 2. Environment ───────────────────────────────────────────────────────────
# Load real Teable credentials from backend/.env (needed for seed + login)
if [[ -f "$PROJECT_ROOT/backend/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/backend/.env"
    set +a
fi

# E2E overrides — Mailpit instead of real SMTP, local URLs
export DATABASE_URL="sqlite:$PROJECT_ROOT/backend/e2e_test.db"
export E2E_DATABASE_PATH="$PROJECT_ROOT/backend/e2e_test.db"
export JWT_SECRET="e2e-test-secret-do-not-use-in-prod"
export FRONTEND_URL="http://localhost:5173"
export BACKEND_URL="http://localhost:5000"
export BASE_URL="http://localhost:5173"

export EMAIL_DISABLE_SEND="false"
export EMAIL_ACCEPT_INVALID_CERTS="true"
export EMAIL_HOST="localhost"
export EMAIL_PORT="1025"
export EMAIL_USER=""
export EMAIL_PASSWORD=""
export EMAIL_FROM="e2e-test@tsv-tennis.local"

export E2E_USER_COUNT="${E2E_USER_COUNT:-20}"
export E2E_ORGA_COUNT="${E2E_ORGA_COUNT:-5}"

# ── 3. Seed test data ────────────────────────────────────────────────────────
# Reset SQLite DB contents so password changes from previous runs don't leak
DB_PATH="$PROJECT_ROOT/backend/e2e_test.db"
if [[ -f "$DB_PATH" ]]; then
    python3 -c "
import sqlite3
db = sqlite3.connect('$DB_PATH')
try:
    db.execute('DELETE FROM details')
    db.execute('DELETE FROM reset_tokens')
    db.commit()
except sqlite3.OperationalError:
    pass
db.close()
" 2>/dev/null || rm -f "$DB_PATH"
fi

info "Seeding test data (users=$E2E_USER_COUNT, orga=$E2E_ORGA_COUNT)…"
(cd "$PROJECT_ROOT/e2e/seed" && npx tsx seed.ts)
info "Seed complete."

# ── 4. Backend ───────────────────────────────────────────────────────────────
BACKEND_BIN="$PROJECT_ROOT/backend/target/release/tsv-tennis-backend"
if [[ ! -x "$BACKEND_BIN" ]]; then
    error "Backend binary not found at $BACKEND_BIN"
    error "Run: cd backend && cargo build --release"
    exit 1
fi

info "Starting backend…"
(cd "$PROJECT_ROOT/backend" && "$BACKEND_BIN" > /tmp/e2e-backend.log 2>&1) &
BACKEND_PID=$!

# Wait for health check
for i in $(seq 1 30); do
    if curl -sf http://localhost:5000/api/health >/dev/null 2>&1; then
        info "Backend ready (PID $BACKEND_PID)"
        break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        error "Backend crashed! Log:"
        cat /tmp/e2e-backend.log
        exit 1
    fi
    sleep 1
done

if ! curl -sf http://localhost:5000/api/health >/dev/null 2>&1; then
    error "Backend failed to become healthy after 30s"
    cat /tmp/e2e-backend.log
    exit 1
fi

# ── 5. Frontend ──────────────────────────────────────────────────────────────
info "Starting frontend dev server…"
(cd "$PROJECT_ROOT/tsv-tennis-app" && npm run dev -- --port 5173 > /tmp/e2e-frontend.log 2>&1) &
FRONTEND_PID=$!

for i in $(seq 1 30); do
    if curl -sf http://localhost:5173 >/dev/null 2>&1; then
        info "Frontend ready (PID $FRONTEND_PID)"
        break
    fi
    sleep 1
done

if ! curl -sf http://localhost:5173 >/dev/null 2>&1; then
    error "Frontend failed to start after 30s"
    cat /tmp/e2e-frontend.log
    exit 1
fi

# ── 6. Quick smoke test: can the backend send mail via Mailpit? ──────────────
info "Smoke-testing SMTP connectivity…"
python3 -c "
import smtplib, ssl, sys
try:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    s = smtplib.SMTP('localhost', 1025)
    s.starttls(context=ctx)
    s.sendmail('smoke@test.local', ['check@test.local'], 'Subject: smoke\n\nok')
    s.quit()
    print('SMTP OK')
except Exception as e:
    print(f'SMTP FAILED: {e}', file=sys.stderr)
    sys.exit(1)
" || { error "Cannot reach Mailpit SMTP on :1025"; exit 1; }

MSG_COUNT=$(curl -sf http://localhost:8025/api/v1/messages | python3 -c "import json,sys; print(json.load(sys.stdin).get('messages_count',0))")
info "Mailpit has $MSG_COUNT message(s) after smoke test"

# Flush smoke-test message so it doesn't confuse real tests
curl -sf -X DELETE http://localhost:8025/api/v1/messages >/dev/null 2>&1 || true

# ── 7. Run Playwright tests ──────────────────────────────────────────────────
info "Running Playwright E2E tests…"
info "Pass-through args: $*"
echo ""

cd "$PROJECT_ROOT/e2e"
npx playwright test --reporter=list --max-failures=1 "$@" 2>&1
TEST_EXIT=$?

# ── 8. Report ────────────────────────────────────────────────────────────────
echo ""
if [[ $TEST_EXIT -eq 0 ]]; then
    info "All tests passed!"
else
    error "Tests failed (exit code $TEST_EXIT)"
    error "View HTML report: cd e2e && npx playwright show-report"
fi

# Dump backend log for debugging
echo ""
info "── Last 20 lines of backend log ──"
tail -20 /tmp/e2e-backend.log 2>/dev/null || true

exit $TEST_EXIT
