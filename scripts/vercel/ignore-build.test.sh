#!/bin/sh
# The three Vercel ignore steps judged on real commits of main (GUARDS, P-71): the client's and the Storybook's
# (scripts/vercel/ignore-build.sh) and the docs' (book/vercel-ignore-build.sh).
#
#   sh scripts/vercel/ignore-build.test.sh [--table]
#
# Each case runs a step as Vercel would on main (VERCEL_GIT_COMMIT_REF=main, VERCEL_GIT_PREVIOUS_SHA the commit's
# parent) on one commit, and checks skip (exit 0) or build (exit 1); any other exit fails the case. The docs' step
# judges HEAD only, so today's copy of it runs in a throwaway clone of this repository checked out at the commit. A clone without a
# commit (a shallow CI checkout) skips its case and says so. --table prints the results as a Markdown table.

here=$(cd "$(dirname "$0")" && pwd)
top=$(git -C "$here" rev-parse --show-toplevel) || exit 1
script="$here/ignore-build.sh"
table=0
[ "$1" = "--table" ] && table=1
failed=0
ran=0
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git clone -q --shared --no-checkout "$top" "$tmp/clone" 2>/dev/null || { echo "FAIL: cannot clone for the docs' step"; exit 1; }

# judge <project> <commit>: prints skip, build or exit-<n>
judge() {
  prev=$(git -C "$top" rev-parse "$2^")
  if [ "$1" = docs ]; then
    git -C "$tmp/clone" checkout -q --detach "$2" 2>/dev/null || { echo "exit-checkout"; return; }
    # Today's script, judging the commit: an old checkout may not hold it.
    mkdir -p "$tmp/clone/book"
    (cd "$tmp/clone/book" && VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA="$prev" VERCEL_GIT_PULL_REQUEST_ID= \
      sh "$top/book/vercel-ignore-build.sh" >/dev/null 2>&1)
  else
    (cd "$top" && VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA="$prev" VERCEL_GIT_PULL_REQUEST_ID= \
      IGNORE_BUILD_HEAD="$2" sh "$script" "$1" >/dev/null 2>&1)
  fi
  code=$?
  case $code in 0) echo skip ;; 1) echo build ;; *) echo "exit-$code" ;; esac
}

[ "$table" = 1 ] && printf '| Commit | What it changes | Storybook | Client | Docs |\n|---|---|---|---|---|\n'

# expect <commit> <storybook> <client> <docs> <what it changes>
expect() {
  if ! git -C "$top" cat-file -e "$1^{commit}" 2>/dev/null || ! git -C "$top" cat-file -e "$1^^{commit}" 2>/dev/null; then
    echo "skip: $1 is not in this clone ($5)"
    return
  fi
  row=""
  for pair in "storybook:$2" "client:$3" "docs:$4"; do
    project=${pair%%:*}
    want=${pair#*:}
    got=$(judge "$project" "$1")
    ran=$((ran + 1))
    if [ "$got" = "$want" ]; then
      [ "$table" = 1 ] || echo "ok: $1 $project -> $got ($5)"
      row="$row | $got"
    else
      echo "FAIL: $1 $project -> $got, expected $want ($5)"
      failed=$((failed + 1))
      row="$row | **$got, expected $want**"
    fi
  done
  [ "$table" = 1 ] && echo "| \`$1\` | $5$row |"
}

expect 7d83480d skip skip skip "#502 DISCLOSE: docs/ and packages/app/public/backgrounds/README.md"
expect 4598b6d3 skip skip skip "#503: docs/measures only"
expect 362ac8a0 skip skip skip "#505: .gitignore and .claude/ only"
expect bc486b1f skip skip skip "CORE quests v2a: contracts/src, docs/, scripts/ (no ABI)"
expect b1aa97a2 build build skip "CORE cobbles part 3: contracts/src, packages/indexer, and contracts/abis/Setup.json (which @paved/chain imports)"
expect 8abb0c49 build skip skip "LOAD-FAST: packages/app/src/stories/ only"
expect 33971f92 build build skip "#493 SLOTS: packages/app, packages/renderer, docs/"
expect 97859343 build skip skip "VERCEL-CFG: the root vercel.json, packages/app-web/vercel.json, docs/"
expect 0a4c741e skip skip build "#355: book/vercel.json, app/vercel.json, docs/"
expect a931ec52 skip skip build "book/docs only"

# The paths mode prints the inputs; an unknown project builds.
if sh "$script" --paths storybook | grep -qx vercel.json && ! sh "$script" --paths client | grep -qx vercel.json; then
  [ "$table" = 1 ] || echo "ok: --paths lists the root vercel.json for the Storybook only"
else
  echo "FAIL: --paths storybook and client"; failed=$((failed + 1))
fi
sh "$script" nope >/dev/null 2>&1
code=$?
if [ "$code" -eq 1 ]; then
  [ "$table" = 1 ] || echo "ok: an unknown project builds (exit 1)"
else
  echo "FAIL: an unknown project exits $code, not 1"; failed=$((failed + 1))
fi

echo "$ran judgement(s) on real commits, $failed failure(s)"
[ "$failed" -eq 0 ]
