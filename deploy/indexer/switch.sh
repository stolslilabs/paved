#!/usr/bin/env bash
# Points /var/www/paved/current at an existing release (a rollback). Run as the deploy user. Atomic, like publish.sh.
#   switch.sh <release-name>      (switch.sh --list shows them, newest first)
set -euo pipefail
ROOT=${WWW_ROOT:-/var/www/paved}
if [[ ${1:-} == --list ]]; then ls -1t "$ROOT/releases"; readlink "$ROOT/current"; exit 0; fi
name=${1:?usage: switch.sh <release-name> | --list}
[[ $name =~ ^[A-Za-z0-9._-]+$ && -f $ROOT/releases/$name/index.html ]] || { echo "no such release: $name" >&2; exit 2; }
ln -sfnT "releases/$name" "$ROOT/.current.new"   # -f -n -T: a stale .current.new from an interrupted run is replaced
mv -T "$ROOT/.current.new" "$ROOT/current"
echo "current -> releases/$name"
