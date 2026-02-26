#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
RUNTIME_DIR="$ROOT_DIR/.context/runtime"
WORLD_ADDR="0x04d8a741b4c0680c3f3de05808173c3640428a841d75f9055f250d1f9cff3ad1"

mkdir -p "$RUNTIME_DIR"

require_free_port() {
  local port="$1"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use. Stop existing process first."
    exit 1
  fi
}

wait_for_port() {
  local port="$1"
  local name="$2"
  for _ in {1..80}; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done

  echo "$name did not start on port $port."
  exit 1
}

cleanup() {
  if [[ -n "${TORII_PID:-}" ]]; then
    kill "$TORII_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${KATANA_PID:-}" ]]; then
    kill "$KATANA_PID" >/dev/null 2>&1 || true
  fi
}

init_contracts_workaround() {
  local inspect_json
  inspect_json="$(sozo --profile dev inspect --json)"

  selector_of() {
    local tag="$1"
    echo "$inspect_json" | jq -r ".contracts[] | select(.tag == \"$tag\") | .selector"
  }

  local token_addr
  token_addr="$(echo "$inspect_json" | jq -r '.contracts[] | select(.tag == "paved-Token") | .address')"

  for tag in paved-Account paved-Economy paved-Token paved-Tutorial; do
    sozo --profile dev execute --diff world init_contract "$(selector_of "$tag")" 0 --wait || true
  done

  for tag in paved-Configurable paved-Daily paved-Weekly; do
    sozo --profile dev execute --diff world init_contract "$(selector_of "$tag")" 1 "$token_addr" --wait || true
  done

  local pending
  pending="$(sozo --profile dev inspect --json | jq -r '.contracts[] | select(.is_initialized == false) | .tag')"
  if [[ -n "$pending" ]]; then
    echo "Contracts still not initialized:"
    echo "$pending"
    exit 1
  fi
}

grant_permissions_workaround() {
  # `sozo migrate` currently fails before all expected auth grants are applied.
  # Grant namespace-level writers for gameplay contracts using live addresses.
  local inspect_json
  inspect_json="$(sozo --profile dev inspect --json)"

  address_of() {
    local tag="$1"
    echo "$inspect_json" | jq -r ".contracts[] | select(.tag == \"$tag\") | .address"
  }

  local contract_addr
  for tag in paved-Account paved-Economy paved-Token paved-Configurable paved-Tutorial paved-Daily paved-Weekly; do
    contract_addr="$(address_of "$tag")"
    if [[ -z "$contract_addr" || "$contract_addr" == "null" ]]; then
      echo "Skipping writer grant for $tag (not deployed)."
      continue
    fi

    sozo --profile dev auth grant writer "paved,$contract_addr" --wait
  done

  # Keep explicit player grant for compatibility with existing app assumptions.
  contract_addr="$(address_of "paved-Account")"
  if [[ -n "$contract_addr" && "$contract_addr" != "null" ]]; then
    sozo --profile dev auth grant writer "paved-Player,$contract_addr" --wait
  fi
}

sync_manifest_addresses() {
  local inspect_json
  inspect_json="$(sozo --profile dev inspect --json)"

  sync_one_manifest() {
    local manifest_path="$1"
    local tmp_file
    tmp_file="$(mktemp)"

    jq --argjson inspect "$inspect_json" '
      .world.address = ($inspect.world.address // .world.address)
      | .contracts |= map(
          . as $contract
          | ($inspect.contracts[]? | select(.tag == $contract.tag) | .address) as $live_address
          | if $live_address then .address = $live_address else . end
        )
    ' "$manifest_path" >"$tmp_file"

    mv "$tmp_file" "$manifest_path"
  }

  sync_one_manifest "$CONTRACTS_DIR/manifests/dev/deployment/manifest.json"
  sync_one_manifest "$CONTRACTS_DIR/manifest_dev.json"
}

trap cleanup EXIT INT TERM

require_free_port 5050
require_free_port 8080
require_free_port 5173

echo "Starting Katana..."
(
  cd "$CONTRACTS_DIR"
  katana --dev --dev.no-fee --http.cors_origins "*"
) >"$RUNTIME_DIR/katana.log" 2>&1 &
KATANA_PID=$!
wait_for_port 5050 "Katana"

echo "Deploying world..."
(
  cd "$CONTRACTS_DIR"
  sozo --profile dev migrate --wait || true
  init_contracts_workaround
  grant_permissions_workaround
  sync_manifest_addresses
) >"$RUNTIME_DIR/deploy.log" 2>&1

echo "Starting Torii..."
(
  cd "$CONTRACTS_DIR"
  torii --world "$WORLD_ADDR" --rpc http://127.0.0.1:5050 --http.cors_origins "*"
) >"$RUNTIME_DIR/torii.log" 2>&1 &
TORII_PID=$!
wait_for_port 8080 "Torii"

echo "Starting app-web on :5173..."
cd "$ROOT_DIR"
bun run --filter @paved/app-web dev
