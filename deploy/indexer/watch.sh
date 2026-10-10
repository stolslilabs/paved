#!/usr/bin/env bash
# One check of the Paved indexer's GET /v1/head, run every minute by paved-indexer-watch.timer (as root).
#
# What /v1/head answers (packages/indexer/src/server.ts, api.ts):
#   200 {"status":"ok","state":"ok","head":{"number":N,...},"behind":B,...}
#   503 {"status":"loading"|"rewinding"|"halted","reason":"...","head":{...}|null}   (no "state" key on a 503)
#   nothing: the process is down, or still waiting for the node (main.ts listens only after the chain id answered).
#
# What it does, and why:
#   halted      -> logs at priority err, every minute, and does NOT restart. `halted` is a decode failure or a database that
#                  contradicts the chain: a restart replays the same blocks and halts again. It needs a person (`rebuild`).
#   unreachable -> after FAILS minutes in a row while the unit is active (a hung start, a dead listener), restarts it.
#   stuck head  -> state ok, but head.number has not moved for STUCK minutes: restarts it (a stalled RPC connection).
#   Restarts are at most one per COOLDOWN seconds, so a provider outage does not turn into a restart loop.
# State lives in /run/paved-indexer-watch (RuntimeDirectory of the service), lost at reboot, which is fine.
set -u

URL=${HEAD_URL:-http://127.0.0.1:8787/v1/head}
UNIT=${INDEXER_UNIT:-paved-indexer.service}
DIR=${STATE_DIR:-/run/paved-indexer-watch}
FAILS=${FAILS:-3}
STUCK=${STUCK:-5}
COOLDOWN=${COOLDOWN:-600}

mkdir -p "$DIR"
say() { logger -t paved-indexer-watch -p "daemon.$1" -- "$2"; echo "$2"; }
read_int() { local v; v=$(cat "$DIR/$1" 2>/dev/null) || v=; [[ $v =~ ^[0-9]+$ ]] && echo "$v" || echo "${2:-0}"; }

restart() { # $1: reason
  local now last
  now=$(date +%s)
  last=$(read_int last_restart 0)
  if ((now - last < COOLDOWN)); then
    say warning "$1; not restarting, last restart $((now - last)) s ago (cooldown $COOLDOWN s)"
    return
  fi
  say err "$1; restarting $UNIT"
  echo "$now" >"$DIR/last_restart"
  echo 0 >"$DIR/fails"
  echo 0 >"$DIR/stuck"
  systemctl restart "$UNIT"
}

if ! systemctl is-active --quiet "$UNIT"; then
  # Down on purpose (stopped for an upgrade) or failed (systemd's Restart= handles it): not this script's business.
  echo 0 >"$DIR/fails"
  echo 0 >"$DIR/stuck"
  say info "$UNIT is not active; nothing to check"
  exit 0
fi

body=$(curl -sS --max-time 10 "$URL" 2>&1)
rc=$?
status=
if ((rc == 0)); then status=$(jq -r '.status // empty' <<<"$body" 2>/dev/null); fi

if [[ -z $status ]]; then
  fails=$(($(read_int fails 0) + 1))
  echo "$fails" >"$DIR/fails"
  say warning "no usable answer from $URL ($fails of $FAILS): curl exit $rc"
  ((fails >= FAILS)) && restart "no answer from $URL for $fails minutes"
  exit 0
fi
echo 0 >"$DIR/fails"

case $status in
  halted)
    say err "INDEXER HALTED: $(jq -r '.reason // "no reason given"' <<<"$body"). It is not restarted (a restart halts again); read 'journalctl -u paved-indexer', then rebuild (docs/client/indexer-hosting.md)."
    exit 1
    ;;
  loading | rewinding)
    echo 0 >"$DIR/stuck"
    say info "indexer is $status; head $(jq -r '.head.number // "none"' <<<"$body")"
    ;;
  ok)
    number=$(jq -r '.head.number' <<<"$body")
    behind=$(jq -r '.behind' <<<"$body")
    mismatch=$(jq -c '.checks.last_mismatch' <<<"$body")
    [[ $mismatch != null ]] && say err "cross-check mismatch against the contract's tournament view: $mismatch"
    if [[ $number == "$(cat "$DIR/head" 2>/dev/null)" ]]; then
      stuck=$(($(read_int stuck 0) + 1))
    else
      stuck=0
    fi
    echo "$number" >"$DIR/head"
    echo "$stuck" >"$DIR/stuck"
    if ((stuck >= STUCK)); then
      restart "head stuck at block $number for $stuck minutes (behind $behind)"
    else
      echo "ok: head $number, behind $behind, unchanged for $stuck minutes"
    fi
    ;;
  *)
    say warning "unknown status '$status' from $URL"
    ;;
esac
exit 0
