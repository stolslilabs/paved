# P1 scope: what was removed

Phase P1 of the CORE track takes Weekly, Configurable game creation and the economy of #181 out of
the contracts, so that P2 (leaving Dojo) ports only Daily and Tutorial. Git history keeps all of it.

**Last commit with the removed code: `4778e18922cf50d8a9c0f41890afef3b9bb40b5e`** (`main` before the
P1 pull request). Recover a file with `git show 4778e18:<path>`. The economy and the configurable
creation were added by #181 (`97beef1`, "Add configurable game creation and NUMS economy"); `97beef1^`
is the last commit before them, with the pre-#181 `Game`, `Tournament`, `payable` and `Token`.

Paths below are relative to the repository root and exist at `4778e18`.

## Removed

| What | Paths |
| --- | --- |
| Weekly mode (system, e2e tests, mode, price, duration, seed, constants) | `contracts/src/systems/weekly.cairo`, `contracts/src/tests/e2e/weekly.cairo`, `contracts/src/tests/e2e/weekly_advanced.cairo`; `Mode::Weekly` in `contracts/src/types/mode.cairo`; `WEEKLY_TOURNAMENT_*` in `contracts/src/constants.cairo` |
| Deck used by Weekly alone | `Deck::Base` in `contracts/src/types/deck.cairo` (the Daily deck `Simple` is built on `elements/decks/base.cairo`, which stays) |
| Configurable creation | `contracts/src/systems/configurable.cairo`, `contracts/src/helpers/config_templates.cairo`, `contracts/src/helpers/config_validation.cairo`, `contracts/src/tests/e2e/configurable_creation.cairo`; models `GameConfigTemplate`, `GameConfigSnapshot`, `ConfigPolicy` in `contracts/src/models/index.cairo` |
| #181 economy | `contracts/src/systems/economy.cairo`, `contracts/src/models/economy.cairo`, `contracts/src/helpers/economy_curve.cairo`, `contracts/src/tests/e2e/economy_compat.cairo`, `economy_entry_split.cairo`, `economy_spawn_claim.cairo`; models `EconomyConfig`, `EconomyState`, `EntrySettlement` in `contracts/src/models/index.cairo` |
| Config and economy fields | `Game`: `config_id`, `entry_price`, `duration_seconds`, `deck_id`, `allow_discard`, `allow_surrender`, `entry_multiplier_fp`, `entry_supply_snapshot`, `entry_target_snapshot` (price, duration and deck come from the mode again; `tile_limit` stays, the golden games shorten decks with it). `Tournament`: `top{1,2,3}_game_id`, `top{1,2,3}_multiplier_fp`, `game()`, `multiplier()`; `score()` takes two arguments again |
| Payments of the economy | `PayableComponent`: `mint`, `burn_from_contract`, `pay_split`, `treasury_address`; `IERC20.mint_to` and `IERC20.burn`. Daily pays the entry in full (`pay`) and a claim is paid out of the prize pool (`refund`), as before #181. `Token` mock: `mint_to`, `burn` and the economy mirror (`record_mint`, `record_burn`) |
| Spawn | `HostableComponent::spawn_with_runtime` and the economy snapshot, settlement and counters in `spawn`; the economy counter in `claim` |

## Kept although the brief of P1 listed them

- `contracts/src/helpers/multiplier.cairo` (with `BASE` and `MULTIPLIER` in `constants.cairo`): it is the
  score bonus curve of a closed structure, called by `helpers/generic.cairo` on every scored move, not
  the economy multiplier. Removing it changes the golden scores.
- `contracts/src/mocks/token.cairo`: Daily still takes its entry price in an ERC20, and the test world
  needs a token with a faucet. It is the faucet-only `Token` of `97beef1^` again.

## Worth reusing later

Read these when the economy or configurable games come back (a P5 extension, or the META/ECO tracks):

- **Configuration validation**: `contracts/src/helpers/config_validation.cairo`. `RuntimeGameConfig`,
  its validation against a `ConfigPolicy` (duration and entry price ranges, private games need an access
  root, seed policies default/fixed/tournament, scoring and character profiles), the error and status
  codes, and the conversions template <-> runtime <-> snapshot. Pure functions, no world access, testable
  alone. `contracts/src/helpers/config_templates.cairo` gives the default template id per mode.
- **Economy curve**: `contracts/src/helpers/economy_curve.cairo`. `compute_multiplier_fp(supply, target)`
  in fixed point (`FP` = 1,000,000): 2x when the supply is zero, 1x at the target, 0 at twice the target,
  linear in between; it reverts when the target is zero. Unit tests included. The target curve (fixed or
  affine in time, `target_at`), the basis-point split of an entry between team and burn (`split_entry`)
  and the validation of the parameters are in `contracts/src/models/economy.cairo`.
- **Multiplier fixed at spawn**: the supply and target are read once when a game is created and stored
  in the game (`entry_multiplier_fp`, `entry_supply_snapshot`, `entry_target_snapshot`, set in
  `HostableComponent::spawn_with_runtime`, `contracts/src/components/hostable.cairo`); the tournament
  keeps the multiplier of each ranked game (`Tournament::score`, `multiplier`) and the claim scales the
  reward by it (`Tournament::claim`, `contracts/src/models/tournament.cairo`). A game therefore keeps the
  terms it was bought under whatever happens to the supply afterwards.
- **Burn and mint helpers**: `PayableComponent::{pay_split, burn_from_contract, mint}` in
  `contracts/src/components/payable.cairo` (pull the entry, route the team share to a treasury, burn the
  rest, mint the reward) and `mint_to`, `burn` of the token mock in `contracts/src/mocks/token.cairo`,
  with the supply bookkeeping (`record_mint`, `record_burn`). The settlement of an entry is stored per
  game (`EntrySettlement`, `contracts/src/models/economy.cairo`).
- **Known flaws of #181** (do not copy as is): the economy was configured by a writable system with no
  access control worth the name, the token mock mirrors supply into the world on every mint, and the
  spawn of Daily and Tutorial read and wrote the economy models, which cost gas on every game (the P1
  removal alone lowered a Daily build by 3 % to 12 %, see `docs/measures/baseline.md`).

## Stale generated files

`contracts/manifests/`, `contracts/abis/`, `contracts/manifest_dev.json` and the deploy overlays
`contracts/overlays/*/{weekly,configurable,economy}.toml` (and the removed models in the writers of the
remaining overlays) still describe the removed contracts. They are outside the P1 allowlist and were not
touched; the client reads them and is another track.
