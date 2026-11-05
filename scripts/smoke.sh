#!/usr/bin/env bash
# §12 smoke test against a deployed (or local `wrangler dev`) MaBear Worker.
#   TARGET=https://mabear.ilya-baimetov.workers.dev DEMO_PASSWORD=… bash scripts/smoke.sh
# REQUIRE_LLM=1 additionally fails the run unless /api/direct answers with source "llm".
# DEMO_PASSWORD is read from the environment (or a git-ignored .secrets.env) and is never echoed.
# Exit 0 = all run checks passed; 1 = a check failed.
set -uo pipefail

TARGET="${TARGET:-https://mabear.ilya-baimetov.workers.dev}"
TARGET="${TARGET%/}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${DEMO_PASSWORD:-}" ] && [ -f "$ROOT/.secrets.env" ]; then
  set -a; # shellcheck disable=SC1091
  . "$ROOT/.secrets.env"; set +a
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
JAR="$WORK/cookies.txt"
FAIL=0
ok()   { printf '  ✅ %s\n' "$1"; }
bad()  { printf '  ❌ %s\n' "$1"; FAIL=1; }

echo "MaBear smoke test → $TARGET"

# 1. /api/health → 200
code=$(curl -sS -o "$WORK/health.json" -w '%{http_code}' "$TARGET/api/health" || echo 000)
if [ "$code" = "200" ]; then ok "/api/health → 200 $(head -c 120 "$WORK/health.json")"; else bad "/api/health → $code"; fi

# 1b. X-Robots-Tag on every response
robots=$(curl -sS -o /dev/null -D - "$TARGET/api/health" | tr -d '\r' | grep -i '^x-robots-tag:' || true)
if echo "$robots" | grep -qi 'noindex'; then ok "X-Robots-Tag: noindex, nofollow"; else bad "X-Robots-Tag missing"; fi

# 2. / without the cookie → login page
code=$(curl -sS -o "$WORK/root.html" -w '%{http_code} %{redirect_url}' "$TARGET/" || echo 000)
login_html=$(curl -sS -L "$TARGET/" || true)
if echo "$code" | grep -q '^30[23] .*/login' && echo "$login_html" | grep -q 'name="password"'; then
  ok "/ without cookie → $code (login page served)"
else
  bad "/ without cookie → $code (expected a redirect to the login page)"
fi

# 2b. API without the cookie → 401
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' --data '{}' "$TARGET/api/direct" || echo 000)
if [ "$code" = "401" ]; then ok "/api/direct without cookie → 401"; else bad "/api/direct without cookie → $code"; fi

# 3. login with $DEMO_PASSWORD → cookie jar
if [ -z "${DEMO_PASSWORD:-}" ]; then
  echo "  ⚠️  authenticated smoke test not run: DEMO_PASSWORD absent"
  exit $FAIL
fi
code=$(printf '%s' "$DEMO_PASSWORD" | curl -sS -o /dev/null -w '%{http_code}' -c "$JAR" --data-urlencode 'password@-' "$TARGET/login" || echo 000)
if grep -q 'mb_session' "$JAR" 2>/dev/null; then ok "login → $code, session cookie set"; else bad "login → $code, no session cookie"; exit 1; fi

code=$(curl -sS -o /dev/null -w '%{http_code}' -b "$JAR" "$TARGET/" || echo 000)
if [ "$code" = "200" ]; then ok "/ with cookie → 200"; else bad "/ with cookie → $code"; fi

# 4. /api/direct with the cookie on two golden prompts → print source and beat count
for id in en_nap ru_swing; do
  if ! (cd "$ROOT" && npx --no-install tsx scripts/evalDirector.ts --print-body "$id") > "$WORK/body-$id.json" 2>/dev/null; then
    bad "could not build the request body for $id"; continue
  fi
  start=$(date +%s%3N)
  code=$(curl -sS -o "$WORK/resp-$id.json" -w '%{http_code}' -b "$JAR" -H 'content-type: application/json' --data-binary "@$WORK/body-$id.json" "$TARGET/api/direct" || echo 000)
  ms=$(( $(date +%s%3N) - start ))
  summary=$(node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const bs = r.beatScript || {};
    console.log(`source=${r.source} beats=${(bs.beats || []).length} model=${r.model} latencyMs=${r.latencyMs}${r.error ? " error=" + String(r.error).slice(0, 100) : ""}`);
  ' "$WORK/resp-$id.json" 2>/dev/null || echo "unparseable response")
  if [ "$code" != "200" ]; then bad "/api/direct $id → $code: $(head -c 200 "$WORK/resp-$id.json")"
  elif [ "${REQUIRE_LLM:-0}" = "1" ] && ! echo "$summary" | grep -q 'source=llm'; then bad "/api/direct $id → 200 but not from the LLM: $summary"
  else ok "/api/direct $id → 200 in ${ms} ms: $summary"; fi
done

echo "URL: $TARGET"
exit $FAIL
