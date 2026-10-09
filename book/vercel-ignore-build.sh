#!/bin/sh
# Vercel "Ignored Build Step" of the paved-doc project (root directory book/).
# Exit 0 = skip the build, exit 1 = build. Runs from book/.
# Skips only when it has proven that nothing under book/ changed since the
# comparison commit; on any doubt (missing commit, shallow clone, git error) it builds.

# Succeeds (exit 0) when nothing under the current directory differs: `git diff --quiet`
# exits 1 on a difference and >1 on an error, and both must build.
unchanged() { git diff --quiet "$@" -- . 2>/dev/null; }

# 1. Last successfully built commit of this branch (main: the last production build;
#    a PR: the last build of the PR branch). Empty on the first push of a branch.
prev="$VERCEL_GIT_PREVIOUS_SHA"
if [ -n "$prev" ] && git cat-file -e "$prev^{commit}" 2>/dev/null; then
  unchanged "$prev" HEAD && exit 0 || exit 1
fi

# 2. First push of a PR branch: compare with the merge base of the base branch, when
#    the shallow clone can fetch it.
base="${VERCEL_GIT_PULL_REQUEST_ID:+main}"
if [ -n "$base" ] && git fetch -q --depth=100 origin "$base" 2>/dev/null; then
  unchanged FETCH_HEAD...HEAD 2>/dev/null && exit 0 || exit 1
fi

# 3. No usable comparison commit: build.
exit 1
