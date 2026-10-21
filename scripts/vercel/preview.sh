#!/bin/sh
# Vercel previews on demand: deploys one commit of a branch to the client (`paved`) and the Storybook (`paved-storybook`),
# waits for each deployment and prints one line a project: `<project> <state> <url>`.
#
#   VERCEL_TOKEN=<token> sh scripts/vercel/preview.sh <branch> <sha>
#
# Vercel deploys only `main` from git (`git.deploymentEnabled` in `vercel.json` and `packages/app/vercel.json`); this is the
# other way in, run by `.github/workflows/preview.yaml` (the label `preview` on a pull request) or by hand. The deployment
# goes through Vercel's git source, so each project's ignore step runs as for a push (`ignore-build.sh`): a project whose
# inputs did not change since the merge base with `main` ends CANCELED, not built. A commit Vercel already deployed is not
# built again: Vercel returns that deployment. Exit 1 when a deployment fails or is still building after 15 minutes.
# Needs curl and jq.
set -eu

team=team_OH1JLokiyD6NDwvIQuDKRjxJ
repo_id=739340606
api=https://api.vercel.com

ref="${1:?usage: preview.sh <branch> <sha>}"
sha="${2:?usage: preview.sh <branch> <sha>}"
: "${VERCEL_TOKEN:?VERCEL_TOKEN is not set}"

call() { curl -sS --fail-with-body -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" "$@"; }

ids=""
for project in paved paved-storybook; do
  body=$(jq -n --arg p "$project" --arg ref "$ref" --arg sha "$sha" --argjson repo "$repo_id" \
    '{name: $p, project: $p, gitSource: {type: "github", repoId: $repo, ref: $ref, sha: $sha}}')
  id=$(call -X POST "$api/v13/deployments?teamId=$team" -d "$body" | jq -r '.id')
  ids="$ids $project:$id"
done

# Each deployment until it settles (READY, ERROR or CANCELED), polled every 10 s, 15 minutes at most.
status=0
for pair in $ids; do
  project=${pair%%:*}
  id=${pair#*:}
  tries=0
  while :; do
    d=$(call "$api/v13/deployments/$id?teamId=$team")
    state=$(printf '%s' "$d" | jq -r '.readyState')
    case "$state" in READY | ERROR | CANCELED) break ;; esac
    tries=$((tries + 1))
    if [ "$tries" -ge 90 ]; then state=TIMEOUT; break; fi
    sleep 10
  done
  echo "$project $state https://$(printf '%s' "$d" | jq -r '.url')"
  case "$state" in ERROR | TIMEOUT) status=1 ;; esac
done
exit "$status"
