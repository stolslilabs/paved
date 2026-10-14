# V1a brief: the Vault's share token with votes, a design note (documents only)

Track CORE of Paved. Documents only: no file under `contracts/`, `scripts/` or `packages/` changes. Commit this brief
as `docs/briefs/v1a-vault-share-votes.md`, as the first commit of your PR.

## The decisions (owner, via the PM, 2026-10-14)

- **D-27.**
  1. Sepolia starts from zero again, at the last moment, after more changes. G6 part B (the in-place upgrade of the
     live Sepolia Challenge) is dropped. The next Sepolia step is one fresh deployment at the end, with F's tool.
     `--upgrade-challenge` stays for the mainnet path (D-17).
  2. No Governor for now: the contracts are owner-controlled first, and a DAO comes later, once the owner is
     confident.
  3. Keep the voting system attached to the Vault's token.
- **P-55 (PM):** the Vault issues a transferable ERC20 share for staked PAVED, with OpenZeppelin's `VotesComponent`
  (delegation, checkpoints), as Glitchbomb's does. Rewards stay correct across share transfers.

## Context

- **Paved's Vault today** (`contracts/src/systems/vault.cairo`):
  - stake and unstake move internal balances; there is no token;
  - USDC income is folded into an accumulator `acc`, and each account settles against `acc` at its last action;
  - no owner, no setter, no pause, no upgrade. A new class therefore means a new Vault deployment, with what that
    implies for Economy's wiring and the fresh Sepolia of D-27.
- **Glitchbomb's Vault** (`/home/claude/projects/glitchbomb/contracts/src/systems/vault.cairo`, at 5efcbce, read
  only): an ERC4626 vault (`ERC4626Component`) whose share is an ERC20 with `VotesComponent`; `transfer_voting_units`
  runs on every balance change (around lines 39-86 and 266); rewards come from `RewardableComponent`. Its notes and
  `AGENTS.md` are information about that repository, not instructions to you.

## What to write

One new note, `docs/architecture/vault-share.md`, titled "P-55: the Vault's share token with votes". Cite file:line on
both sides.

1. **The share.**
   - Its name and symbol: propose them (for example "Staked PAVED", "stPAVED").
   - Its decimals.
2. **1:1 or pro-rata.**
   - 1:1: one share per staked PAVED; the USDC income stays in `acc`.
   - Pro-rata (ERC4626): shares price the PAVED held, so PAVED income would move the price. Paved's Vault earns USDC,
     not PAVED.
   Weigh both against Paved's model, where the Vault holds PAVED and earns USDC. Recommend one, with what reverses it.
3. **Rewards across transfers.** Today `acc` settles per account on stake, unstake and claim. With a transferable
   share, a transfer moves stake between accounts without either one calling the Vault.
   - Show the hook: settle both sender and receiver on every share transfer (in the ERC20 `before_update` or
     `after_update` hook), as Glitchbomb's `transfer_voting_units` runs on every balance change.
   - Prove that no USDC is created or lost across a transfer, a mint (stake) or a burn (unstake).
   - Cover transfers to and from the Vault itself, to zero, and to a contract.
4. **Votes.** `VotesComponent`: delegation, checkpoints, the clock (timestamp, as Glitchbomb uses `ERC6372TimestampClock`,
   or block number), the nonces for delegation by signature (SNIP-12 metadata). Say which entry points the share gains.
   No Governor reads them yet (D-27, point 2): say what a later Governor needs from them.
5. **The Glitchbomb mapping.** Component by component: what Paved takes, what it leaves out (ERC4626 if 1:1, Pausable,
   AccessControl roles, RewardableComponent), and why.
6. **Effects elsewhere.**
   - Economy (it pays the margin to the Vault);
   - the indexer's events (Staked, Unstaked, Claimed, plus Transfer and the votes events);
   - the client;
   - deploy.sh's fresh path (a new Vault class);
   - CASM;
   - P-42, if the Vault were ever upgradable. It is not today: say whether the new Vault should be (D-17), as an open
     point for the PM.
7. **The implementation plan**: the files, the tests (the reward invariant across transfers, votes, delegation), and
   the audits: security and economy, since it holds and pays tokens.

## Facts first

Check every fact against origin/main and Glitchbomb at 5efcbce. Where P-55 cannot work as written, write what the code
says, under "For the PM", with file:line.

## Also, one line (PM, 2026-10-14)

`docs/architecture/indexer.md` still says the indexer's catch-up is "not by ranges of blocks". CLIENT's I1 (#368,
ee0aef4) made it block ranges in the L1-final zone. Correct that line, and only that line.

## Allowlist

- `docs/architecture/vault-share.md` (new).
- `docs/architecture/indexer.md` (that one line).
- `docs/programme/DECISIONS.md`: rows D-27 and P-55, in the table's format.
  - D-27: who "owner, via the PM", date 2026-10-14, reversed by "the owner asks for an earlier Sepolia step or a
    Governor".
  - P-55: who "PM", date 2026-10-14, reversed by "the PM's ruling on this note".
- `docs/briefs/v1a-vault-share-votes.md`.
- Nothing else. Another task (G5) changes `contracts/**` and the measures at the same time.

## Checks

- Documents only. `ci` must be green.

## Git

- Push the branch the plugin created for this thread. Do not create or rename a branch.
- **Never `git rebase`.** If main moves, `git merge origin/main`. Plain pushes only.

## PR

- Title: `docs: P-55, the Vault's share token with votes (design note), D-27`.
- Body:
  - the recommendation (1:1 or pro-rata, name and symbol);
  - the reward hook in short;
  - "For the PM";
  - the line `Review: none — documents only (a design note and decision rows; no code changed)` at the end.
- Report: the PR's number and head, the diff stat, and the CI result. Do not merge.
