#!/bin/bash
set -euo pipefail
pushd $(dirname "$0")/..

export STARKNET_RPC_URL="https://free-rpc.nethermind.io/sepolia-juno";

export DOJO_WORLD_ADDRESS=$(cat ./manifests/dev/manifest.json | jq -r '.world.address')

export ACCOUNT_ADDRESS=$(cat ./manifests/dev/manifest.json | jq -r '.contracts[] | select(.name == "paved::systems::account::account" ).address')
export DAILY_ADDRESS=$(cat ./manifests/dev/manifest.json | jq -r '.contracts[] | select(.name == "paved::systems::daily::daily" ).address')
export WEEKLY_ADDRESS=$(cat ./manifests/dev/manifest.json | jq -r '.contracts[] | select(.name == "paved::systems::weekly::weekly" ).address')

echo "---------------------------------------------------------------------------"
echo world : $DOJO_WORLD_ADDRESS 
echo " "
echo account : $ACCOUNT_ADDRESS
echo daily : $DAILY_ADDRESS
echo weekly : $WEEKLY_ADDRESS
echo "---------------------------------------------------------------------------"

# enable system -> component authorizations
MODELS=("Game" "Player" "Builder" "Tile" "TilePosition" "Character" "CharacterPosition" "Tournament")
ACTIONS=($ACCOUNT_ADDRESS $DAILY_ADDRESS $WEEKLY_ADDRESS)

command="sozo auth grant --world $DOJO_WORLD_ADDRESS --wait writer "
for model in "${MODELS[@]}"; do
    for action in "${ACTIONS[@]}"; do
        command+="$model,$action "
    done
done
eval "$command"

echo "Default authorizations have been successfully set."