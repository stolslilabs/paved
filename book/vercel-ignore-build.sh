#!/bin/sh
# Vercel "Ignored Build Step" of the paved-doc project (root directory book/).
# Exit 0 = skip the build, exit 1 = build. Runs from book/.
# Skips only when it has proven that nothing under book/ changed since the
# comparison commit; on any doubt (missing commit, shallow clone, git error) it builds.
# It echoes which branch it took, so the build log says why.

# Succeeds (exit 0) when nothing under the current directory differs: `git diff --quiet`
# exits 1 on a difference and >1 on an error, and both must build.
unchanged() { git diff --quiet "$@" -- . 2>/dev/null; }

# Prints the merge base of the base branch and HEAD, deepening the shallow clone until
# it exists (Vercel clones the branch at a small depth). Empty when it cannot be found.
merge_base() {
  depth=100
  git fetch -q --depth="$depth" origin "$1" 2>/dev/null || return 1
  tries=0
  while [ "$tries" -lt 5 ]; do
    mb=$(git merge-base FETCH_HEAD HEAD 2>/dev/null) && [ -n "$mb" ] && { echo "$mb"; return 0; }
    tries=$((tries + 1))
    git fetch -q --deepen=200 origin "$1" "${VERCEL_GIT_COMMIT_REF:-HEAD}" 2>/dev/null \
      || git fetch -q --deepen=200 origin "$1" 2>/dev/null || return 1
  done
  return 1
}

ref="${VERCEL_GIT_COMMIT_REF:-}"
echo "ignore step: ref='$ref' pr='${VERCEL_GIT_PULL_REQUEST_ID:-}' previous='${VERCEL_GIT_PREVIOUS_SHA:-}' head=$(git rev-parse --short HEAD 2>/dev/null)"

# 1. A PR (or any branch other than main): compare with the merge base of main. Not with
#    VERCEL_GIT_PREVIOUS_SHA, which on a new branch may be an old deployment of another
#    branch, whose diff would include book/ changes already on main.
if [ -n "$VERCEL_GIT_PULL_REQUEST_ID" ] || { [ -n "$ref" ] && [ "$ref" != "main" ]; }; then
  if mb=$(merge_base main); then
    if unchanged "$mb" HEAD; then
      echo "ignore step: branch 1 (merge base ${mb%"${mb#???????}"}): no change under book/, skip"
      exit 0
    fi
    echo "ignore step: branch 1 (merge base ${mb%"${mb#???????}"}): book/ changed or diff failed, build"
    exit 1
  fi
  echo "ignore step: branch 1: no merge base with main, build"
  exit 1
fi

# 2. Main: last successfully built commit of the branch (the last production build).
prev="$VERCEL_GIT_PREVIOUS_SHA"
if [ -n "$prev" ] && git cat-file -e "$prev^{commit}" 2>/dev/null; then
  if unchanged "$prev" HEAD; then
    echo "ignore step: branch 2 (previous ${prev%"${prev#???????}"}): no change under book/, skip"
    exit 0
  fi
  echo "ignore step: branch 2 (previous ${prev%"${prev#???????}"}): book/ changed or diff failed, build"
  exit 1
fi

# 3. No usable comparison commit: build.
echo "ignore step: branch 3: no usable comparison commit, build"
exit 1
