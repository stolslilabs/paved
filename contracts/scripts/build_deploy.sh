#!/bin/bash

katana --disable-fee

sozo build && sozo migrate

../scripts/default_auth.sh