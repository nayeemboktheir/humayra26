#!/usr/bin/env bash
# Deploy the edge functions to the self-hosted Supabase stack.
#
# There is no `supabase functions deploy` here. The Coolify edge-runtime container
# bind-mounts a host directory at /home/deno/functions and starts with
# `--main-service /home/deno/functions/main`, a router that dispatches the first
# path segment to a sibling directory. So deploying is: copy the directories in,
# restart the runtime. No build, no image rebuild.
#
# Run ON THE VPS:
#
#   # from your machine, ship the sources up
#   tar czf functions.tgz -C supabase functions
#   scp functions.tgz supabase/selfhost/deploy-functions.sh tanvir@72.61.248.65:~/
#
#   # on the VPS
#   tar xzf functions.tgz
#   chmod +x deploy-functions.sh
#   sudo ./deploy-functions.sh ~/functions
#
# Pass ANON_KEY=... to have it smoke-test every endpoint afterwards.

set -euo pipefail

SRC="${1:?usage: deploy-functions.sh <functions-source-dir> [service-uuid]}"
UUID="${2:-emhbzh3hwap5rmq6ysysloil}"

DEST="/data/coolify/services/${UUID}/volumes/functions"
CONTAINER="supabase-edge-functions-${UUID}"
BASE_URL="${BASE_URL:-https://api.tradeon.global}"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ----------------------------------------------------------------- preflight
say "Preflight"

[ -d "$SRC" ] || { echo "no such source directory: $SRC"; exit 1; }
[ -d "$DEST" ] || { echo "no such destination: $DEST (wrong service uuid?)"; exit 1; }
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "no such container: $CONTAINER"; exit 1; }

# main/ and hello/ are Coolify's own, bind-mounted as individual files. Overwriting
# main/index.ts would replace the router the runtime was started with.
[ -f "$DEST/main/index.ts" ] || { echo "REFUSING: $DEST/main/index.ts missing — this does not look like the edge-runtime mount"; exit 1; }

mapfile -t FUNCS < <(find "$SRC" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
  | grep -vE '^(_shared|main|hello)$' | sort)
[ "${#FUNCS[@]}" -gt 0 ] || { echo "no function directories found in $SRC"; exit 1; }

echo "source:      $SRC"
echo "destination: $DEST"
echo "functions:   ${#FUNCS[@]}"
printf '  %s\n' "${FUNCS[@]}"

[ -d "$SRC/_shared" ] || echo "WARNING: no _shared/ in source — functions importing ../_shared/* will fail at runtime"

# ------------------------------------------------------------------- backup
say "Backing up current functions directory"
BACKUP="/root/functions-backup-$(date +%Y%m%d-%H%M%S).tgz"
tar czf "$BACKUP" -C "$(dirname "$DEST")" "$(basename "$DEST")"
echo "saved: $BACKUP"

# --------------------------------------------------------------------- copy
say "Copying"

# _shared first: relative imports like ../_shared/normalize-img.ts resolve against
# /home/deno/functions/, so it has to sit beside the function directories.
if [ -d "$SRC/_shared" ]; then
  rm -rf "$DEST/_shared"
  cp -r "$SRC/_shared" "$DEST/_shared"
  echo "  _shared/ ($(find "$SRC/_shared" -type f | wc -l) files)"
fi

for f in "${FUNCS[@]}"; do
  rm -rf "${DEST:?}/$f"
  cp -r "$SRC/$f" "$DEST/$f"
  echo "  $f"
done

# Anything in the destination that is not in the source and not Coolify's own is
# a leftover from a previous deploy — a function we have since deleted. Report it
# rather than removing it silently.
say "Stale directories in destination (present there, absent from source)"
STALE=0
while read -r d; do
  case "$d" in main|hello|_shared) continue ;; esac
  if ! printf '%s\n' "${FUNCS[@]}" | grep -qx "$d"; then
    echo "  $d  -> sudo rm -rf $DEST/$d"
    STALE=$((STALE+1))
  fi
done < <(find "$DEST" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
[ "$STALE" -eq 0 ] && echo "  none"

chown -R 1000:1000 "$DEST" 2>/dev/null || true

# ------------------------------------------------------------------ restart
say "Restarting the edge runtime"
docker restart "$CONTAINER" >/dev/null
for i in $(seq 1 60); do
  docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true && break
  sleep 1
done
sleep 5
docker logs --tail 15 "$CONTAINER" 2>&1 | sed 's/^/  /'

# --------------------------------------------------------------- smoke test
say "Smoke test"
if [ -z "${ANON_KEY:-}" ]; then
  echo "  ANON_KEY not set — skipping. Re-run with:"
  echo "    sudo ANON_KEY=<anon key> ./deploy-functions.sh $SRC"
  exit 0
fi

FAIL=0
for f in "${FUNCS[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
    -X OPTIONS "$BASE_URL/functions/v1/$f" -H "apikey: $ANON_KEY" || echo 000)
  # 500 from this runtime means "no such function directory". 2xx/4xx means the
  # function loaded and answered. Anything else is a genuine problem.
  case "$code" in
    5*|000) printf '  %-30s %s  FAIL\n' "$f" "$code"; FAIL=$((FAIL+1)) ;;
    *)      printf '  %-30s %s  ok\n'   "$f" "$code" ;;
  esac
done

echo
if [ "$FAIL" -gt 0 ]; then
  echo "$FAIL function(s) failed to load. Check: docker logs $CONTAINER"
  echo "Roll back with: tar xzf $BACKUP -C $(dirname "$DEST") && docker restart $CONTAINER"
  exit 1
fi
echo "All ${#FUNCS[@]} functions responding."
cat <<'EOF'

Reminder — functions need their secrets set as service environment variables in
Coolify (not in this directory), then one more redeploy of the service:

  TMAPI_TOKEN               alibaba-1688-*, tmapi-keyword-search, refresh-*
  PAYSTATION_MERCHANT_ID    paystation-init-payment, paystation-verify-payment
  PAYSTATION_PASSWORD       paystation-init-payment
  RESEND_API_KEY            auth-email-hook, send-invoice-email
  SEND_EMAIL_HOOK_SECRET    auth-email-hook  (v1,whsec_<base64>)

SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are already injected
by the template. Without TMAPI_TOKEN the nightly cron jobs will fail.
EOF
