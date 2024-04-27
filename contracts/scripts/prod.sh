#!/bin/bash
set -euo pipefail
pushd $(dirname "$0")/..

export STARKNET_RPC_URL="https://api.cartridge.gg/x/paved/katana";

export DOJO_WORLD_ADDRESS=$(cat ./manifests/prod/manifest.json | jq -r '.world.address')

export HOST_ADDRESS=$(cat ./manifests/prod/manifest.json | jq -r '.contracts[] | select(.name == "paved::systems::host::host" ).address')
export MANAGE_ADDRESS=$(cat ./manifests/prod/manifest.json | jq -r '.contracts[] | select(.name == "paved::systems::manage::manage" ).address')
export PLAY_ADDRESS=$(cat ./manifests/prod/manifest.json | jq -r '.contracts[] | select(.name == "paved::systems::play::play" ).address')

echo "---------------------------------------------------------------------------"
echo world : $DOJO_WORLD_ADDRESS 
echo " "
echo host : $HOST_ADDRESS
echo manage : $MANAGE_ADDRESS
echo play : $PLAY_ADDRESS
echo "---------------------------------------------------------------------------"

# enable system -> component authorizations
MODELS=("Game" "Player" "Builder" "BuilderPosition" "Team" "Tile" "TilePosition" "Character" "CharacterPosition" "Tournament")
ACTIONS=($HOST_ADDRESS $MANAGE_ADDRESS $PLAY_ADDRESS)

command="sozo auth grant --world $DOJO_WORLD_ADDRESS --wait writer "
for model in "${MODELS[@]}"; do
    for action in "${ACTIONS[@]}"; do
        command+="$model,$action "
    done
done
eval "$command"

echo "Default authorizations have been successfully set."