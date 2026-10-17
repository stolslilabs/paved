#!/bin/sh
# The ignore step of scripts/vercel/ignore-build.sh judged on real commits of main (GUARDS, P-71).
#
#   sh scripts/vercel/ignore-build.test.sh
#
# Each case runs the script as Vercel would on main (VERCEL_GIT_COMMIT_REF=main, VERCEL_GIT_PREVIOUS_SHA the
# commit's parent) on a commit of main's history, and checks skip (exit 0) or build (exit 1). A clone without
# those commits (a shallow CI checkout) skips the cases it cannot judge, and says so.

here=$(dirname "$0")
script="$here/ignore-build.sh"
failed=0
ran=0

# expect <commit> <project> <skip|build> <why>
expect() {
  if ! git cat-file -e "$1^{commit}" 2>/dev/null || ! git cat-file -e "$1^^{commit}" 2>/dev/null; then
    echo "skip: $1 is not in this clone ($4)"
    return
  fi
  out=$(VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA=$(git rev-parse "$1^") VERCEL_GIT_PULL_REQUEST_ID= \
    IGNORE_BUILD_HEAD="$1" sh "$script" "$2" 2>&1)
  code=$?
  got=build
  [ "$code" -eq 0 ] && got=skip
  ran=$((ran + 1))
  if [ "$got" = "$3" ]; then
    echo "ok: $1 $2 -> $3 ($4)"
  else
    echo "FAIL: $1 $2 -> $got, expected $3 ($4)"
    echo "$out" | sed 's/^/  /'
    failed=$((failed + 1))
  fi
}

expect 4598b6d3 client skip "docs/measures only"
expect 4598b6d3 storybook skip "docs/measures only"
expect 362ac8a0 client skip ".gitignore and .claude only"
expect 362ac8a0 storybook skip ".gitignore and .claude only"
expect 35871a0d client build "packages/app and packages/renderer"
expect 35871a0d storybook build "packages/app and packages/renderer"
expect 97859343 client skip "the root vercel.json and packages/app-web/vercel.json: not the client's inputs"
expect 97859343 storybook build "the root vercel.json holds the Storybook's commands"

# The paths mode prints the inputs; an unknown project fails (and the ignore step then builds).
if sh "$script" --paths storybook | grep -qx vercel.json && ! sh "$script" --paths client | grep -qx vercel.json; then
  echo "ok: --paths lists the root vercel.json for the Storybook only"
else
  echo "FAIL: --paths storybook and client"; failed=$((failed + 1))
fi
if sh "$script" nope >/dev/null 2>&1; then
  echo "FAIL: an unknown project skips the build"; failed=$((failed + 1))
else
  echo "ok: an unknown project builds"
fi

echo "$ran case(s) on real commits, $failed failure(s)"
[ "$failed" -eq 0 ]
