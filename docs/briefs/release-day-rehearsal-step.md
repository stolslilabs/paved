# Brief: the release-day checklist gets a rehearsal at the deploy commit

Track CORE of Paved. A documents-only follow-up of #418. Commit this brief as `docs/briefs/release-day-rehearsal-step.md`, as the first commit of your PR.

## Goal

`docs/programme/sepolia-release-day.md` records the two rehearsals run for #418 (at a28f1e8d and 9924820a). But it has no step to rehearse again at the commit that will be deployed, and main has moved since (#415 at least).

Add a step in the contracts section, before the funded run. Put it after the go, and before or beside the real `--estimate-only` with the funded account:
- at the deploy commit, on a fresh local starknet-devnet: `scripts/deploy.sh sepolia --rehearse --out <tmp> --guardian deployer`, then `scripts/deploy.sh sepolia --rehearse --check-only --out <that record>`;
- what to expect (`smoke ok`, `fresh: complete`, `every check passed; nothing was sent`), and what to do if it fails (stop; nothing goes to Sepolia);
- the commit's sha written into the record of the day.

Check each command against deploy.sh's usage at your head, and use only forms it accepts. Keep the rest of the file unchanged.

## Runs

- No build, test or deploy is needed. Documents only.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`**, never force-push. If main moves, `git merge origin/main`. Plain pushes only.

## Allowlist

- `docs/programme/sepolia-release-day.md`, `docs/briefs/release-day-rehearsal-step.md`. No other file.

## PR

- Title: `docs: the release day rehearses at the deploy commit first`.
- Use `gh pr create` with this line in the body: `Review: none — documents only (a checklist step)`.
- Report: the PR's number and head. Do not merge.

