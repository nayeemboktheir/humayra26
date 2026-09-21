#!/usr/bin/env bash
# Interactive edge-function deployer for TradeOn. Run this ON the Coolify host:
#
#   Coolify -> Workspace -> Terminal -> pick the server (NOT a container)
#   curl -fsSL https://raw.githubusercontent.com/nayeemboktheir/humayra26/optimization/supabase/selfhost/deploy-live.sh | bash
#
# It pulls the repo straight from GitHub (so it always deploys what is
# actually on origin/optimization, not whatever happens to be on the VPS's
# disk from a previous run), diffs every function against what is on the
# host, and copies only what you choose. No local tar/scp step needed.
#
# Adapted from a sibling project's version of this script. That version
# defaulted to `docker ps --filter name=edge-functions | head -1` to find the
# container — fine on a host running one Supabase stack, silently wrong here:
# this VPS runs TWO (TradeOn's and an unrelated `modessi` stack), both
# containers match that filter, and `head -1` would pick whichever docker
# happens to list first with no warning. CONTAINER_FILTER below is anchored
# to TradeOn's known service UUID specifically to rule that out — see step 1.
#
# Unlike that sibling script, this one always restarts the container after
# copying (see step 6). That script skips the restart on the claim that
# individual functions are read per request without one; deploy-functions.sh
# (the tar/scp method this replaces) has always restarted, and every deploy
# this session was verified against that behaviour. Nothing here has
# confirmed the no-restart claim also holds for this image, and getting that
# wrong would mean files land on disk while the site keeps serving the old
# code with no visible symptom. Restarting a Deno edge-runtime container is
# a few seconds of cold start, not meaningfully slower — not worth the risk
# to save it until someone deliberately verifies hot-reload works here.
set -uo pipefail

REPO="${REPO:-nayeemboktheir/humayra26}"
BRANCH="${BRANCH:-optimization}"
API="${API:-https://api.tradeon.global}"
# TradeOn's Supabase service UUID (Coolify project "Tradeon"). Do not widen
# this to a bare "edge-functions" substring — see the header comment above.
CONTAINER_FILTER="${CONTAINER_FILTER:-edge-functions-emhbzh3hwap5rmq6ysysloil}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim()  { printf '\033[2m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
err()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }
ok()   { printf '\033[32m%s\033[0m\n' "$*"; }

for c in docker curl tar; do
  command -v "$c" >/dev/null || { err "missing $c - are you on the host shell, not a container?"; exit 1; }
done

# ---- 1. find the container and the directory it serves ---------------------
MATCHES="$(docker ps --filter "name=edge-functions" --format '{{.Names}}')"
CID="$(grep -F "$CONTAINER_FILTER" <<<"$MATCHES" | head -1)"
if [ -z "$CID" ]; then
  err "no container matching '$CONTAINER_FILTER' found. Containers seen:"
  echo "$MATCHES" | sed 's/^/    /'
  exit 1
fi
if [ "$(grep -Fc "$CONTAINER_FILTER" <<<"$MATCHES")" -gt 1 ]; then
  err "more than one container matched '$CONTAINER_FILTER' - refusing to guess:"
  echo "$MATCHES" | sed 's/^/    /'
  exit 1
fi

FUNCS="$(docker inspect "$CID" \
  --format '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}')"
[ -n "$FUNCS" ] && [ -d "$FUNCS" ] || { err "could not resolve the functions bind mount"; exit 1; }

bold "container : $CID"
bold "functions : $FUNCS"
echo

# ---- 2. fetch the repo ----------------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
dim "fetching $REPO@$BRANCH ..."
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" -o "$TMP/r.tar.gz" \
  || { err "download failed"; exit 1; }
tar -xzf "$TMP/r.tar.gz" -C "$TMP"
TOP="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d ! -name '*.tar.gz' | head -1)"
SRC="$TOP/supabase/functions"
if [ ! -d "$SRC" ]; then
  err "supabase/functions not found in the archive"
  dim "  archive top level: ${TOP:-<none>}"
  dim "  looked for:        $SRC"
  exit 1
fi

# ---- 3. compare repo vs host ---------------------------------------------
fingerprint() {
  local d="$1"
  [ -d "$d" ] || { echo "ABSENT"; return; }
  find "$d" -type f ! -name '.DS_Store' -exec md5sum {} + 2>/dev/null \
    | sed "s#$d/##" | sort -k2 | md5sum | cut -d' ' -f1
}

names=(); status=(); changed=()
for d in "$SRC"/*/; do
  n="$(basename "$d")"
  a="$(fingerprint "$d")"; b="$(fingerprint "$FUNCS/$n")"
  if   [ "$b" = "ABSENT" ]; then st="NEW"
  elif [ "$a" != "$b" ];    then st="CHANGED"
  else                           st="same"
  fi
  names+=("$n"); status+=("$st")
  [ "$st" = same ] || changed+=("$n")
done

bold "repo vs host"
for idx in "${!names[@]}"; do
  n="${names[$idx]}"; st="${status[$idx]}"
  case "$st" in
    NEW)     printf '  %2d) \033[32m%-26s NEW\033[0m\n'     "$((idx+1))" "$n" ;;
    CHANGED) printf '  %2d) \033[33m%-26s CHANGED\033[0m\n' "$((idx+1))" "$n" ;;
    *)       printf '  %2d) \033[2m%-26s same\033[0m\n'     "$((idx+1))" "$n" ;;
  esac
done

# TradeOn's repo has no main/ or hello/ under supabase/functions/ (main's
# router and hello are Coolify's own, bind-mounted separately - see
# deploy-functions.sh). Anything on the host with no repo counterpart is
# exactly that, and is left alone.
for d in "$FUNCS"/*/; do
  n="$(basename "$d")"
  [ -d "$SRC/$n" ] || dim "      $n  (on host only - not touched)"
done

echo
if [ ${#changed[@]} -eq 0 ]; then
  ok "host already matches the repo - nothing to deploy"
  exit 0
fi
bold "${#changed[@]} function(s) differ: ${changed[*]}"
echo

# ---- 4. choose ------------------------------------------------------------
cat <<'MENU'
  d  deploy only what differs   (recommended)
  a  deploy every function
  1 3 7 ...  deploy these numbers
  q  quit
MENU
printf 'choice: '; read -r choice

selected=()
case "${choice:-q}" in
  q|Q|'') echo "nothing done"; exit 0 ;;
  d|D)    selected=("${changed[@]}") ;;
  a|A)    selected=("${names[@]}") ;;
  *)      for tok in $choice; do
            case "$tok" in
              ''|*[!0-9]*) err "not a number: $tok"; exit 1 ;;
            esac
            idx=$((tok-1))
            [ -n "${names[$idx]:-}" ] || { err "no such entry: $tok"; exit 1; }
            selected+=("${names[$idx]}")
          done ;;
esac

echo; bold "deploying: ${selected[*]}"; echo

# ---- 5. copy --------------------------------------------------------------
for n in "${selected[@]}"; do
  rm -rf "$FUNCS/$n" && cp -r "$SRC/$n" "$FUNCS/$n" \
    && ok "  $n" || err "  $n FAILED"
done

# ---- 6. restart ------------------------------------------------------------
# See the header comment: this deliberately does not try to skip the restart.
echo
warn "restarting the edge runtime"
docker restart "$CID" >/dev/null && ok "restarted"
sleep 6
docker logs --tail 15 "$CID" 2>&1 | sed 's/^/    /'

# ---- 7. prove it landed ---------------------------------------------------
echo
bold "verifying"
for n in "${selected[@]}"; do
  [ "$n" = "_shared" ] && continue
  [ -f "$FUNCS/$n/index.ts" ] \
    && ok "  $n/index.ts present on host" \
    || err "  $n/index.ts MISSING - the copy did not land"
done

if [ -n "${ANON_KEY:-}" ]; then
  echo
  dim "  a non-5xx below means the worker booted and answered"
  for n in "${selected[@]}"; do
    [ "$n" = "_shared" ] && continue
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X OPTIONS \
      -H "apikey: $ANON_KEY" "$API/functions/v1/$n")"
    case "$code" in
      5*|000) printf '  %-28s HTTP %s  \033[31mFAIL\033[0m\n' "$n" "$code" ;;
      *)      printf '  %-28s HTTP %s  ok\n' "$n" "$code" ;;
    esac
  done
else
  dim "  set ANON_KEY=<selfhost anon key> to also call each endpoint and check it boots"
fi

echo
ok "done"
dim "watch traffic with:  docker logs -f --tail 20 $CID"
