# Client economy (P8)

How the web client buys a paid Daily game in USDC, settles it after the day, and stakes PAVED in the Vault. The
contract side is `economy.md` (ruled by the PM: P-31); the data layer and its payment rules are
`client-data-layer.md`. The code is `packages/chain/src/economy/` (this document's part a) and the economy panels of
`packages/app-web` (part b).

**Nothing is deployed beyond devnet** (economy.md). Every deployment today lacks the economy's addresses, so the
client's economy is **not configured** everywhere and the screens say so; nothing is read or sent.

## What runs on a stub until CORE's E2 and E3

| Piece | Source today | Real source | What to do when it lands |
|---|---|---|---|
| `Economy` ABI: `quote`, `day`, `terms`, `settle`, events `Purchased`, `Recorded`, `DayClosed`, `Settled` | **STUB** `economy/stub-abi.ts`: `Quote` and `TermsView` as CORE gave them from E2's branch (#262 head 0cbb1a5); `Quote.slope`, `Quote.cap`, `DayView` and the events from economy.md section 6 | `contracts/abis/Economy.json` (E2, #262), authoritative once merged | import it in `abis.ts`, delete the stub, fix `ECONOMY_VIEW_FIELDS` where `test/economy.test.ts` fails |
| `Daily.spawn(stake, referrer, min_out)` | **STUB** `STUB_DAILY_PAID_ABI`: the real `Daily` ABI with that one entry replaced | `contracts/abis/Daily.json` (E3) | the test "the real Daily ABI still has none" fails on E3's ABI: drop `DailyPaid`, encode with `Daily` |
| USDC (`approve`, `balance_of`, `allowance`) | **STUB** `STUB_USDC_ABI` | the MockUSDC ABI (E3's devnet deploy) | import it |
| `PavedToken`, `Vault` | CORE's real ABIs (E1, #260) | | |
| Addresses | `contracts.{Economy, PavedToken, Vault}` and `contracts.USDC` or `contracts.MockUSDC` of `contracts/deployments/<network>.json`, as CORE confirmed (USDC off devnet, MockUSDC on devnet); or the env | E3's `devnet.json` | |
| Reads in unit tests | `FakeEconomy` (`economy/fake.ts`), **tests only**: not exported from `@paved/chain`, imported by path | | |

`ECONOMY_ABI_IS_STUB` is true while any stub remains; the screens print "Economy contracts on stub ABIs (E2 not
merged)" from it.

What CORE confirmed from E2's branch (2026-10-09):

- `Quote.min_out_hint` **already has the 1 % off**: 99 % of `burn_quote` at the price guard's swap rate. The client sends
  it as `min_out` as it is and takes nothing more off. It is a floor, not the pool's price: the client never shows it as
  a price, and since the stub has no pool quote, no PAVED price is shown at all.
- `TermsView.stake` is 0 for a Daily game that was not bought, with `recorded` and `settled` false.
- Widths: `Quote` amounts `u256`, `factor` `u32` (bps), `mean` and `threshold` `u64` (points x 1,000); `TermsView` is
  `player`, `day` u64, `stake` u8, `reference` u128, `sigma_bps` i16, `slope_bps` u32, `cap` u8, `score` u32, `recorded`,
  `settled`, `reward` u128. `quote(stake)` asserts `1 <= stake <= MAX_STAKE`; the price is `stake x 2 USDC`.
- The codec decodes no signed integer, so the stub declares `sigma_bps` as a `felt252` and `RpcEconomyViews` reads it as
  an `i16`. With the real ABI, the codec needs `i16` (`codec.ts`, outside this task's files) or the same workaround.

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
| `min_out` | `quote.min_out_hint` as it is: E2 already took the 1 % slippage of economy.md section 5 off |
| Reward | only `Economy.terms(game).reward` after settlement; the client computes and promises none |

## Writes

`EconomyWriter` (`economy/writer.ts`), from `EconomyClient.writer(pavedWriter)`. Every write goes through the
account's `PavedWriter` (`PavedWriter.sendCalls`), so the economy's writes and the game's are **serialised together**:
while one is pending, another is refused. The checks below run inside that lock, just before `execute`, and any failed
read or refused check sends nothing (`WriteError`, or the typed errors).

| Write | Calls (one multicall) | Read and refused at send |
|---|---|---|
| `purchase({ stake, confirmedPrice, referrer })` | `USDC.approve(Daily, P)`, `Daily.spawn(stake, referrer, min_out)` | `entry_price` and `quote(stake)`; the entry token is not USDC; `P` is 0; the quote's price is not `k x unit`; `P` is not `confirmedPrice` (`PurchasePriceChangedError`); a stake outside 1..10; `min_out_hint` is 0 ("No quote for the burn swap": a 0 floor is no slippage protection); a referrer that does not parse as an address (a `WriteError`, never a raw parse error). A self-referral is sent as `0x0` |
| `settle(gameIds)` (the player's claim of PAVED) | `Economy.settle(game_ids)` | the ids de-duplicated; `terms` of each: not bought (stake 0), not over (`recorded` false), already settled, or its day not over (`now < (day + 1) x 86400`, `now` the latest block's timestamp when the provider reads blocks, the device clock otherwise); a failed block read sends nothing |
| `stake(amount, { confirmedAmount })` | `PavedToken.approve(Vault, amount)`, `Vault.stake(amount)` | the amount is 0 or not the confirmed one (`VaultAmountChangedError`); the PAVED balance is short |
| `unstake(amount, { confirmedAmount })` | `Vault.unstake(amount)` | the amount is 0 or not the confirmed one; more than staked. The dividends earned so far are credited, not paid: they stay claimable (E1's Vault) |
| `claimDividends({ confirmedAmount })` | `Vault.claim()` | the pending USDC is 0 or not the confirmed one (it grows with every purchase: the player confirms again) |

`planPurchase` runs the same reads and checks and returns the calls without sending them (tests).

Stake and unstake check the amount handed over against the confirmed one (`VaultAmountChangedError`), then against the
chain: the PAVED balance for a stake, the staked amount for an unstake. The player's consent for both is the confirm of the
Vault screen (part b), which shows the amount and hands over the field read again at the click.

**Sent, outcome unknown.** A purchase that was sent but whose receipt could not be read (the wait timed out, the RPC
dropped), or whose receipt arrives without a `GameSpawned`, may have spent USDC: it is not a failure. A reverted receipt
stays a `WriteError` (`reverted` true): that one is a known failure. The writer throws `PurchaseOutcomeUnknownError` with the transaction hash. The game page shows "Purchase
sent (hash), outcome unknown: check your games before buying again", offers no retry, and the consent is already gone, so
nothing buys again without a new confirm.

## Reads

`EconomyViews` (`RpcEconomyViews` on the contracts, `FakeEconomy` in tests): `quote(stake)`, `day(day)`,
`terms(gameId)`, `vault(account)` (`staked`, `pending`, `total_staked`), `usdcBalance`, `pavedBalance`. Reverts map to
`ViewError` as the game views do; a not configured economy is a `not-configured` `ViewError` with no call.
