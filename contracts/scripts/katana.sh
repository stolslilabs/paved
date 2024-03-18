#!/bin/bash
set -euo pipefail
pushd $(dirname "$0")/..

export RPC_URL="http://localhost:5050";

export WORLD_ADDRESS=$(cat ./target/dev/manifest.json | jq -r '.world.address')

export HOST_ADDRESS=$(cat ./target/dev/manifest.json | jq -r '.contracts[] | select(.name == "paved::systems::host::host" ).address')
export MANAGE_ADDRESS=$(cat ./target/dev/manifest.json | jq -r '.contracts[] | select(.name == "paved::systems::manage::manage" ).address')
export PLAY_ADDRESS=$(cat ./target/dev/manifest.json | jq -r '.contracts[] | select(.name == "paved::systems::play::play" ).address')

echo "---------------------------------------------------------------------------"
echo world : $WORLD_ADDRESS 
echo " "
echo host : $HOST_ADDRESS
echo manage : $MANAGE_ADDRESS
echo play : $PLAY_ADDRESS
echo "---------------------------------------------------------------------------"

# enable system -> component authorizations
COMPONENTS=("Game" "Player" "Builder" "BuilderPosition" "Team" "Tile" "TilePosition" "Character" "CharacterPosition")
ACTIONS=($HOST_ADDRESS $MANAGE_ADDRESS $PLAY_ADDRESS)

for component in ${COMPONENTS[@]}; do
    for action in ${ACTIONS[@]}; do
        sozo auth writer $component $action --world $WORLD_ADDRESS --rpc-url $RPC_URL
        # time out for 1 second to avoid rate limiting
        sleep 1
    done
done

echo "Default authorizations have been successfully set."