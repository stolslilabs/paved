#!/usr/bin/env bash
# Publishes a client build as a new release and switches Caddy to it. Run as the deploy user (paved-deploy), no root.
#   publish.sh <dist-dir> <release-name>
# <dist-dir> is packages/app-web/dist of a build made with the Sepolia env (docs/client/indexer-hosting.md). The release is
# copied to /var/www/paved/releases/<release-name>, and /var/www/paved/current is then replaced by a symlink to it in one
# atomic rename (ln -sfn is not atomic; mv -T of a fresh symlink is). Caddy only reads /var/www/paved.
# Rollback is the same swap to an older release: switch.sh. Releases beyond the newest KEEP are removed.
set -euo pipefail
ROOT=${WWW_ROOT:-/var/www/paved}
KEEP=${KEEP:-5}
dist=${1:?usage: publish.sh <dist-dir> <release-name>}
name=${2:?usage: publish.sh <dist-dir> <release-name>}
[[ $name =~ ^[A-Za-z0-9._-]+$ ]] || { echo "release name: letters, digits, . _ - only" >&2; exit 2; }
[[ -f $dist/index.html ]] || { echo "$dist/index.html is missing: not a client build" >&2; exit 2; }
[[ -d $ROOT/releases && ! -e $ROOT/releases/$name ]] || { echo "$ROOT/releases missing, or release $name exists" >&2; exit 2; }

tmp=$(mktemp -d "$ROOT/releases/.incoming.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
cp -a "$dist/." "$tmp/"
chmod -R u=rwX,go=rX "$tmp"
touch "$tmp"   # cp -a keeps the build's mtime; the pruning below sorts by it
mv -T "$tmp" "$ROOT/releases/$name"
trap - EXIT

ln -s "releases/$name" "$ROOT/.current.new"
mv -T "$ROOT/.current.new" "$ROOT/current"
echo "current -> releases/$name"

# Older releases beyond KEEP, never the one now in use.
cd "$ROOT/releases"
ls -1dt -- */ 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  old=${old%/}
  [[ $old == "$name" ]] || rm -rf -- "$old"
done
