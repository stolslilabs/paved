# Client economy (P8)

How the web client buys a paid Daily game in USDC, settles it after the day, and stakes PAVED in the Vault. The
contract side is `economy.md` (ruled by the PM: P-31); the data layer and its payment rules are
`client-data-layer.md`. The code is `packages/chain/src/economy/` (this document's part a) and the economy panels of
`packages/app-web` (part b, below).

**Nothing is deployed beyond devnet** (economy.md). Every deployment today lacks the economy's addresses, so the
client's economy is **not configured** everywhere and the screens say so; nothing is read or sent.

## What runs on a stub until CORE's E2 and E3

| Piece | Source today | Real source | What to do when it lands |
|---|---|---|---|
| `Economy` ABI: `quote`, `day`, `terms`, `settle`, events `Purchased`, `Recorded`, `DayClosed`, `Settled` | **STUB** `economy/stub-abi.ts`, shapes from economy.md section 6; integer widths guessed | `contracts/abis/Economy.json` (E2) | import it in `abis.ts`, delete the stub, fix `ECONOMY_VIEW_FIELDS` where `test/economy.test.ts` fails |
| `Daily.spawn(stake, referrer, min_out)` | **STUB** `STUB_DAILY_PAID_ABI`: the real `Daily` ABI with that one entry replaced | `contracts/abis/Daily.json` (E3) | the test "the real Daily ABI still has none" fails on E3's ABI: drop `DailyPaid`, encode with `Daily` |
| USDC (`approve`, `balance_of`, `allowance`) | **STUB** `STUB_USDC_ABI` | the MockUSDC ABI (E3's devnet deploy) | import it |
| `PavedToken`, `Vault` | CORE's real ABIs (E1, #260) | | |
| Addresses | `contracts.{Economy, PavedToken, Vault}` and `contracts.USDC` or `contracts.MockUSDC` of `contracts/deployments/<network>.json`, as economy.md says E3 writes them; or the env | E3's `devnet.json` | check the key names against E3's file |
| Reads in unit tests | `FakeEconomy` (`economy/fake.ts`), **tests only**: not exported from `@paved/chain`, imported by path | | |

`ECONOMY_ABI_IS_STUB` is true while any stub remains; the screens print "Economy contracts on stub ABIs (E2 not
merged)" from it.

Two readings of the stub that E2 must confirm:

- `Quote.min_out_hint` is read as the router's **expected** PAVED for `burn_quote`, before slippage; the client applies
  its own slippage to it. If E2 makes it already include a slippage, the client must send it as it is.
- `TermsView.stake` is 0 for a Daily game that was not bought (before E3 every Daily game).

## Deployment

`resolveEconomyDeployment({ base, file, env })` (`economy/deployment.ts`) takes the four contracts' `Deployment` and
adds the economy's addresses, the env first. It is `configured` only when the base is configured and `Economy`,
`PavedToken`, `Vault` and USDC are all known; otherwise `missing` lists what is not. `createEconomyClient` gives null
then. `deployment.ts` is not changed: a deployment without the economy keeps working as before.

## Amounts

Every amount is a `bigint` in base units: USDC 6 decimals, PAVED 18 (D-10, economy.md "Units"). `parseUnits` and
`formatUnits` never go through a float. The labels are `USDC` and `PAVED` whatever a mock's symbol says.

| Figure | How the client gets it |
|---|---|
| Price `P` of stake `k` (1 to 10) | `k x Daily.entry_price().amount` (2 USDC per stake unit after E3), and `Economy.quote(k).price` must be the same, else nothing is sent |
| Boost | `1 + k/100` (`boostBps`), shown as a multiplier; the reward itself is the contract's |
| Referral | 5 % of `P`, **out of the margin**: it changes no amount the player pays (P-31) |
| `min_out` | `quote.min_out_hint x (1 - slippage)`, rounded down; slippage 1 % (`DEFAULT_SLIPPAGE_BPS`, economy.md section 5), at most 50 % |
| Reward | only `Economy.terms(game).reward` after settlement; the client computes and promises none |

## Writes

`EconomyWriter` (`economy/writer.ts`), from `EconomyClient.writer(pavedWriter)`. Every write goes through the
account's `PavedWriter` (`PavedWriter.sendCalls`), so the economy's writes and the game's are **serialised together**:
while one is pending, another is refused. The checks below run inside that lock, just before `execute`, and any failed
read or refused check sends nothing (`WriteError`, or the typed errors).

| Write | Calls (one multicall) | Read and refused at send |
|---|---|---|
| `purchase({ stake, confirmedPrice, referrer })` | `USDC.approve(Daily, P)`, `Daily.spawn(stake, referrer, min_out)` | `entry_price` and `quote(stake)`; the entry token is not USDC; `P` is 0; the quote's price is not `k x unit`; `P` is not `confirmedPrice` (`PurchasePriceChangedError`); a stake outside 1..10. A self-referral is sent as `0x0` |
| `settle(gameIds)` (the player's claim of PAVED) | `Economy.settle(game_ids)` | `terms` and `Daily.game` of each: not bought (stake 0), not over, already settled, or its day not over (`now < (day + 1) x 86400`) |
| `stake(amount, { confirmedAmount })` | `PavedToken.approve(Vault, amount)`, `Vault.stake(amount)` | the amount is 0 or not the confirmed one (`VaultAmountChangedError`); the PAVED balance is short |
| `unstake(amount, { confirmedAmount })` | `Vault.unstake(amount)` | the amount is 0 or not the confirmed one; more than staked |
| `claimDividends({ confirmedAmount })` | `Vault.claim()` | the pending USDC is 0 or not the confirmed one (it grows with every purchase: the player confirms again) |

`planPurchase` runs the same reads and checks and returns the calls without sending them (tests).

## Reads

`EconomyViews` (`RpcEconomyViews` on the contracts, `FakeEconomy` in tests): `quote(stake)`, `day(day)`,
`terms(gameId)`, `vault(account)` (`staked`, `pending`, `total_staked`), `usdcBalance`, `pavedBalance`. Reverts map to
`ViewError` as the game views do; a not configured economy is a `not-configured` `ViewError` with no call.

## Screens (part b)

All on the landing page (`App.tsx`, which holds the routes, is outside this task's files: no new route). The economy of
the build is `useEconomy()` (`utils/economy-context.ts`): the same network's deployments file and the env
(`VITE_ECONOMY_ADDRESS`, `VITE_PAVED_TOKEN_ADDRESS`, `VITE_VAULT_ADDRESS`, `VITE_USDC_ADDRESS`, `utils/economy-network.ts`);
`EconomyProvider` overrides it in tests. While it is not configured, the panel says "Not deployed on `<network>`" with what
is missing, the Daily keeps today's confirm, and nothing of the economy is read.

| Screen | Where | What it shows and does |
|---|---|---|
| Purchase | the Daily dialog (`EconomyPurchase`), when the economy is configured and no Daily game is active | the stake `k` picker (1 to 10), the price read from the chain (`k x entry_price`, equal to `quote(k).price`, else "Price unavailable"), the boost `x(1 + k/100)`, the referrer from the link, the cliff. "Buy for P USDC" only opens the confirm; "Confirm purchase" navigates to `/game?mode=daily` with the purchase in the history state |
| Referral link | panel (`EconomyReferral`) | the player's link `/?ref=<address>` and "pays the same price; you get 5 % of it, out of the stakers' margin" |
| Vault | panel (`EconomyVault`) | staked PAVED, total staked, pending USDC dividends, the wallet's PAVED; stake, unstake, claim dividends, each through a confirm that shows the amount |
| After the day | panel (`EconomySettle`) | the player's bought Daily games (the newest 30 `GameSpawned`, then `terms` each; stake 0 is not listed): day running, not finished (never settled: the stake is lost), to settle, or settled with the chain's reward; a reward of 0 says "below the shifted mean, the stake is lost". "Settle" opens a confirm |

The cliff is said as it is wherever a game is bought or settled: **"Below the shifted mean the stake is lost."** No
reward is shown before the contract computed it (`terms.reward` after settlement).

### Consent

The payment rules of `client-data-layer.md` hold for each paying action:

- **A paid start only after a click on a confirm that shows the amount.** The purchase's consent is the history state
  `{ start: true, purchase: { stake, confirmedPrice, referrer } }` (`utils/economy-start.ts`), set only by "Confirm
  purchase". A link (`?stake=`, `?price=`, `?ref=`) sets none: the game page says "No game selected" and sends nothing.
  `readPurchaseIntent` refuses any malformed state (a stake outside 1..10, a price that is not a positive integer string,
  a referrer that is not hex).
- **The referrer comes from a link; the consent never does.** `?ref=0x...` on the landing page names a referrer, shown at
  the confirm with its 5 % "out of the stakers' margin: you pay the same"; one's own address, or an address that is not a
  registered player (`Account.player`), is ignored and said so. A failed read of the referrer disables the purchase.
- **Cleared before sending.** The game page reads the purchase at mount, clears the history state (replace, state
  null) before anything is sent, and keeps the intent in a ref, exactly as the Daily start; the 30 s expiry without a
  ready writer applies too. An active Daily game is resumed instead of buying another.
- **Amounts re-checked at send** by `EconomyWriter` (part a); a changed price shows "The price changed: confirm
  again". The Vault's amount field is read again at the confirm click and handed over with the confirmed amount.
- **Writes serialised** with the game's (`PavedWriter.sendCalls`); the panels share the landing's `writing` flag.
- **Nothing sent when a read fails or the client is not configured**: the purchase and Vault buttons are disabled on a
  failed read, and every write re-reads.

## Tests

- `packages/chain/test/economy.test.ts`: the stubs and their field lists, the arithmetic (BigInt, 2k USDC, boost,
  5 %, `min_out`), the deployment, each write's calls and each refusal with nothing sent, the serialisation, the views'
  decoding.
- `packages/app-web/__tests__/economy-screens.test.tsx` (jsdom, `FakeEconomy`): the picker's price and boost, the
  explicit confirm and its history state, the referrer shown and the same price, self-referral, a failed read and a
  quote that disagrees, the not-deployed state, the Vault confirms and a changed amount, the settle list and confirm, the
  cliff text.
- `packages/app-web/__tests__/economy-game-start.test.tsx`: the game page buys from the state only, after clearing it;
  a changed price, a URL alone and a malformed state send nothing.

No browser run (jsdom only). Nothing has run against a live economy: no deployment has one yet.

## What waits for E2 and E3

- The real `Economy.json`, the paid `Daily.spawn` and the MockUSDC ABI replace the stubs (table at the top); the
  deployments file gains the addresses, and the economy becomes configured on devnet by itself.
- Then: a devnet run of a purchase with MockUSDC, a settlement on a later day and the Vault (`PAVED_E2E`), and the
  Daily's old free-token confirm removed (after E3 `Daily.spawn` takes the stake, so `PavedWriter.spawn("daily")` must
  go).
- The list of games to settle could come from the indexer's unsettled games (economy.md section 6) instead of events.
