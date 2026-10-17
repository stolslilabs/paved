#!/bin/sh
# Vercel "Ignored Build Step" (`ignoreCommand`) of the client and the Storybook (GUARDS, P-71).
#
#   sh scripts/vercel/ignore-build.sh <client|storybook>    the ignore step: exit 0 skips the build, exit 1 builds
#   sh scripts/vercel/ignore-build.sh --paths <project>     prints the project's inputs, one pathspec a line
#
# Vercel runs the ignoreCommand from the project's root directory (the repository root for the Storybook,
# packages/app for the client): the script moves to the top level of the clone first. Exit 0 and 1 are its only
# exit codes in the ignore step (Vercel fails a deployment whose ignore step exits with another). It skips only when it has
# proven that none of the project's inputs changed since the comparison commit; on any doubt (no comparison
# commit, a shallow clone without it, a git error) it builds. The logic is that of book/vercel-ignore-build.sh,
# with a list of paths instead of book/. It echoes which branch it took, so the build log says why.
# Vercel's exit codes: https://vercel.com/docs/project-configuration/git-settings#ignored-build-step

# The inputs, as git pathspecs: what each build really reads, nothing else (GUARDS, P-71; the PM's strict sets).
#
# Storybook: packages/app (stories included), the workspace packages its stories import or that the PM names
# (game-core, renderer, chain, ui; packages/app holds the source assets, asset-sources/), the contracts' ABIs and
# deployment files @paved/chain imports, the lockfile and the root manifests tsc and turbo read, and the root
# vercel.json that holds its commands. A package's own README.md and docs/ are out (no build reads them); a file
# under a public/ folder is in, whatever its type, since the builds copy it to the output.
# Client: the same without the stories (*.stories.tsx, src/stories/, .storybook/) and without the root vercel.json;
# its own packages/app/vercel.json is in, under packages/app.
# Out of both: docs/, book/, packages/indexer/, contracts/src/, .github/, .claude/, scripts/ (this script included),
# the root *.md.
common_paths() {
  printf '%s\n' \
    packages/app \
    packages/game-core \
    packages/renderer \
    packages/chain \
    packages/ui \
    contracts/abis \
    contracts/deployments \
    bun.lock \
    package.json \
    turbo.json \
    tsconfig.base.json \
    ':(exclude,glob)packages/*/README.md' \
    ':(exclude,glob)packages/*/docs/**'
}

client_paths() {
  common_paths
  printf '%s\n' \
    ':(exclude,glob)packages/app/**/*.stories.tsx' \
    ':(exclude)packages/app/src/stories' \
    ':(exclude)packages/app/.storybook'
}

storybook_paths() {
  common_paths
  printf '%s\n' vercel.json
}

paths() {
  case "$1" in
    client) client_paths ;;
    storybook) storybook_paths ;;
    *) echo "ignore step: unknown project '$1' (client or storybook)" >&2; return 2 ;;
  esac
}

if [ "$1" = "--paths" ]; then
  paths "$2"
  exit $?
fi

project="$1"
list=$(paths "$project") || { echo "ignore step: build"; exit 1; }
top=$(git rev-parse --show-toplevel 2>/dev/null) && cd "$top" || { echo "ignore step: not in a git clone, build"; exit 1; }
# The commit to judge: HEAD, or IGNORE_BUILD_HEAD for scripts/vercel/ignore-build.test.sh.
head="${IGNORE_BUILD_HEAD:-HEAD}"

# Succeeds (exit 0) when none of the inputs differs: `git diff --quiet` exits 1 on a difference and >1 on an
# error, and both must build. The pathspecs are split on new lines (none holds a space), with globbing off so that
# the shell leaves their `*` to git.
unchanged() (
  set -f
  IFS='
'
  # shellcheck disable=SC2086
  git diff --quiet "$1" "$2" -- $list 2>/dev/null
)

# Prints the merge base of the base branch and the head, deepening the shallow clone until it exists (Vercel
# clones the branch at a small depth). Empty when it cannot be found.
merge_base() {
  if mb=$(git merge-base "$remote/$1" "$head" 2>/dev/null) && [ -n "$mb" ]; then echo "$mb"; return 0; fi
  git fetch -q --depth=100 "$remote" "$1" 2>/dev/null || return 1
  tries=0
  while [ "$tries" -lt 5 ]; do
    mb=$(git merge-base FETCH_HEAD "$head" 2>/dev/null) && [ -n "$mb" ] && { echo "$mb"; return 0; }
    tries=$((tries + 1))
    git fetch -q --deepen=200 "$remote" "$1" "${VERCEL_GIT_COMMIT_REF:-HEAD}" 2>/dev/null \
      || git fetch -q --deepen=200 "$remote" "$1" 2>/dev/null || return 1
  done
  return 1
}

ref="${VERCEL_GIT_COMMIT_REF:-}"
remote=origin
public="https://github.com/${VERCEL_GIT_REPO_OWNER:-stolslilabs}/${VERCEL_GIT_REPO_SLUG:-paved}.git"
echo "ignore step ($project): ref='$ref' pr='${VERCEL_GIT_PULL_REQUEST_ID:-}' previous='${VERCEL_GIT_PREVIOUS_SHA:-}' head=$(git rev-parse --short "$head" 2>/dev/null)"

# 1. A PR (or any branch other than main): compare with the merge base of main. Not with VERCEL_GIT_PREVIOUS_SHA,
#    which on a new branch may be an old deployment of another branch, whose diff would hold changes already on main.
if [ -n "${VERCEL_GIT_PULL_REQUEST_ID:-}" ] || { [ -n "$ref" ] && [ "$ref" != "main" ]; }; then
  # The clone's own remote first, then the public repository by URL.
  if mb=$(merge_base main) || { remote="$public"; mb=$(merge_base main); }; then
    if unchanged "$mb" "$head"; then
      echo "ignore step ($project): branch 1 (merge base $(echo "$mb" | cut -c1-7)): no input changed, skip"
      exit 0
    fi
    echo "ignore step ($project): branch 1 (merge base $(echo "$mb" | cut -c1-7)): an input changed or the diff failed, build"
    exit 1
  fi
  echo "ignore step ($project): branch 1: no merge base with main, build"
  exit 1
fi

# 2. Main: the last successfully built commit of the branch (the last production build).
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$prev" ] && git cat-file -e "$prev^{commit}" 2>/dev/null; then
  if unchanged "$prev" "$head"; then
    echo "ignore step ($project): branch 2 (previous $(echo "$prev" | cut -c1-7)): no input changed, skip"
    exit 0
  fi
  echo "ignore step ($project): branch 2 (previous $(echo "$prev" | cut -c1-7)): an input changed or the diff failed, build"
  exit 1
fi

# 3. No usable comparison commit: build.
echo "ignore step ($project): branch 3: no usable comparison commit, build"
exit 1
