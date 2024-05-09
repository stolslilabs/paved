#!/bin/bash

cd contracts

echo "----- Building World -----"
sozo build

echo "----- Migrating World -----"
sozo migrate apply

echo "----- Auth and World Contracts: Set 0.1s ----- "
scripts/katana.sh --interval 0.1 --mode dev


echo "-----  Started indexer ----- "
torii --world 0x6f4cc545524ac50cdbd6b2b2cdd813ba878e1aed638ba9d223a6b74bdf6e404 --allowed-origins "*"