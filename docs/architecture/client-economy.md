# Client economy (P8)

How the web client buys a paid Daily game in USDC, settles it after the day, and stakes PAVED in the Vault. The
contract side is `economy.md` (ruled by the PM: P-31); the data layer and its payment rules are
`client-data-layer.md`. The code is `packages/chain/src/economy/` (this document's part a) and the economy panels and the `/economy` page of
`packages/app-web` (part b, below).

**Nothing is deployed beyond devnet** (economy.md). A deployment file without the economy's addresses leaves the client's
economy **not configured**, and the screens say so; nothing is read or sent. The committed `contracts/deployments/devnet.json`
since #276 holds the economy: `contracts.{Economy, PavedToken, Vault, MockUSDC, MockRouter}` (written by `scripts/deploy.sh`).

## What E3 made real (P8, #275)

Every ABI is now a committed one. There are no stubs, `stub-abi.ts` and `ECONOMY_ABI_IS_STUB` are gone, and the economy
panel no longer prints that purchases are not possible.

| Piece | Source |
|---|---|
| `Economy`, `PavedToken`, `Vault` | `contracts/abis/{Economy,PavedToken,Vault}.json` (E1, E2) |
| `Daily.spawn(stake, referrer, min_out)` | `contracts/abis/Daily.json` (E3), encoded by the `Daily` codec of `ECONOMY_ABIS` |
| USDC (`approve`, `balance_of`, `allowance`, and the devnet faucet `mint`) | `contracts/abis/MockUSDC.json` (#276 committed it): the ERC20 interface the real USDC exposes too, plus the mock's `mint(recipient, amount)`. `ECONOMY_ABIS.USDC` is this ABI, no longer `Token.json`'s |
| Addresses | `contracts.{Economy, PavedToken, Vault}` and `contracts.USDC` or `contracts.MockUSDC` of `contracts/deployments/<network>.json`; or the env |
| Reads in unit tests | `FakeEconomy`, `FakePoolQuoter`, `fakeTerms`: **tests only**, exported from `@paved/chain/testing` |

What a purchase sends (`EconomyWriter.purchase`), in one multicall:

1. `USDC.approve(Daily, price)`, `price = stake x Daily.entry_price().amount` (2,000,000 per stake unit, 6 decimals);
2. `Daily.spawn(stake, referrer, min_out)`, `min_out = Economy.quote_swap(Economy.quote(stake).burn_quote)` less the player's
   slippage (1 % by default, at most 5 %, rounded down).

The rules around it are unchanged and keep their tests: the confirm, the consent in history state only, the re-check of
the price at send (`PurchasePriceChangedError`), no purchase from a URL alone, writes serialised through one writer, and
nothing sent after a failed read or a missing pool quote.

What E3 removed from the client:

- `PavedWriter.spawn("daily")`, with its approve of `entry_price` and `EntryPriceChangedError`: it now throws and sends
  nothing, a Daily game is bought only by `EconomyWriter.purchase`. `spawn("tutorial")` stays: the Tutorial is free and
  unchanged. The Landing dialog of a Daily game only resumes one; a new one is bought with the stake picker.
- The prize no longer grows with entries (economy.md section 7, P-31): it is **sponsor-only**. The Landing labels the
  prize and the entry in USDC (`TOKEN_LABEL`), and a sponsorship approves the token `Daily.entry_price` names, not the old mock.
  `PavedClient.balance` reads that same token.
- "Price unavailable" on the purchase button is only a failed price read now, never the stubs.

The indexer's appended fields (API v1, indexer.md "As built (P8 E3)") are parsed by `IndexerClient` and optional, so an indexer
from before E3 is still read: `contracts.economy` of `/v1/head`, `IndexedGame.economy`, `PlayerStats.{paidGames, settledGames,
rewards}` and `TournamentDetail.economy`. A present but malformed field is a bad response.

What E2 changed from the stub it had, and what the client does with it:

- `Quote.min_out_hint` is **an estimate only**: it sits above what the swap returns, because its rate leaves the pool fee
  out, so a purchase sent with it would revert. The client never sends it as `min_out` and never shows it as a price.
  `min_out` comes from `quote_swap` (fee included, a pool read), less 1 % (at most 5 %).
- `quote_swap` takes and returns a `u256` (two felts, low then high). `EconomyPoolQuoter` encodes and decodes them with
  the ABI's codec; a result of another width is a `ViewError`, not a misread figure.
- `Recorded` carries `expired` and no `in_day` (P-34); `record(game_id, score)` has no `in_day`.
- `terms()` adds `time` (the purchase's block time) and `expired`; `day = time / 86400`. `recorded` is true for an
  expired game too (it is recorded, flagged expired): an expired game gets no reward and enters no mean.
- `sigma_bps` is a real `i16`: the codec decodes and encodes signed integers (`i8` to `i128`, a negative value is
  `P - |v|`, a felt outside the type is refused), and `RpcEconomyViews.terms` no longer reads it through a felt.
- Widths: `DayView.weight` is a `u32`; `Settled` is `game_id`, `player_id`, `day` u64, `score` u32, `threshold` u64,
  `reward` u128 (one felt each; the stub had a `u256` reward and a `u32` threshold). A test decodes it at those widths.
- **P-34**: a paid game expires 24 h after its purchase. Day D settles only after D+1 ends (`settlesAfter(D) = (D + 2) x
  86400`). Until a day closes, `day()` answers a zero `mean`, `sum` and `weight`: never shown as figures. The screens show
  `Quote.mean` and `Quote.threshold` as "the current reference; the day's own mean is known only at settlement", and no
  projected reward.
- `TermsView.stake` is 0 for a Daily game that was not bought, with `recorded` and `settled` false.

Errors of the Economy shown as clear states (`economy/writer.ts`, matched in the revert reason as text or as the hex of
the short string):

| Contract reason | State | Why |
|---|---|---|
| `Economy: swap below min_out` (purchase) | `SwapBelowMinOutError`: "The price moved before your purchase went through: your USDC was not spent. Try again." | The approve, the transfers and the swap are one multicall, and a revert undoes it whole: no funds move, but the reverted transaction still pays its network fee, so the message says the USDC was not spent, not that nothing was charged. The player confirms again at the new price |
| `Economy: day cannot close yet` (settle) | `SettleTooEarlyError`: "This day cannot be settled yet: try again after the next day ends." | The contract settles day D at `(D + 2) x 86400`; the writer already refuses earlier from the latest block's time, so this is the race at the border |

An expired game says "Expired: no reward" in the "after the day" list (`terms().expired`, or never recorded 24 h after
its purchase); `settle` refuses it before sending.

Referrers: a `?ref=` must be a non-zero hex address below `2^251 - 256` (`ADDRESS_BOUND`, itself below the felt prime);
a value out of range counts as no referrer, as does a malformed one. The writer applies the same bound to what it sends.
The purchase waits for the referrer's registration read, and a referrer who is not a registered player is shown as
ignored and not sent.

## The devnet faucet and the entry token

- `PavedWriter.mint()` and `createPlayer(name, { mintTestToken: true })` send `MockUSDC.mint(self, FAUCET_USDC_AMOUNT)` (100 USDC,
  6 decimals) at `deployment.mockUsdc`, which is `contracts.MockUSDC` of the deployments file (or `VITE_MOCK_USDC_ADDRESS`). It
  replaces the old `Token.mint()`. `mockUsdc` resolves on `network === "devnet"` only (any other network gets `""`, whatever its file or env holds), and the Landing asks for `mintTestToken` only with `supportsMint && !!deployment.mockUsdc`, so a missing MockUSDC never blocks account creation. A deployment without that address has no faucet: both throw `No faucet` and send nothing, and
  nothing else in `Deployment` changes (`configured` does not need it). The faucet is not a session policy of the Cartridge
  controller: the burner signs it on devnet, and `controller.test.ts` drives both writes and asserts that neither is in the session.
- `Landing` compares `Daily.entry_price().token` with the **USDC address** (`economy.deployment.addresses.USDC`), no longer with
  `addresses.Token`: a different entry token, or no USDC address known, is "Unknown token".

## Claim reverts, and a sponsor's reclaim (P-37)

| Revert text | Where | Clear state |
|---|---|---|
| `Tournament: not found` | a top-3 `claim` on a day nobody sponsored (no tournament) | `NoPrizeDayError`: "This day has no prize: nobody sponsored it, so there is nothing to claim." |
| `Tournament: nothing to reclaim` | `claim(day, 0)` on a ranked day, from a non-sponsor, or a second time | `NothingToReclaimError`: nothing moved |

Both match as text and as the hex of the short string the node may return, in the receipt's revert and in the node's refusal at fee estimation before anything is sent (the same for the Economy's `swap below min_out` and `day cannot close yet`). Any other revert stays as it is.

**The reclaim line.** Rank rewards are unchanged (rank 1 absorbs the empty ranks). A sponsor takes back their part of a prize
nobody ranked for, an empty top 3 or every score 0 (the view shows no first place), with `PavedWriter.reclaim(day,
{ confirmedAmount })` = `Daily.claim(day, 0)` sent by the sponsor. The part is not in any view, and `tournament(day).prize` keeps
the historical total after a reclaim, so it comes from events: `EventReader.sponsorship(day, sponsor)` is their `Sponsored` events
(Daily) less their `Reclaimed { tournament_id, sponsor, amount }` events (declared in `Lobby.json`, emitted from Daily's address,
read with `LOBBY_ABI`); `reclaimedTotal(day)` is what went back to all sponsors; `sponsoredDays(sponsor)` lists the days (the node
cannot filter on `sponsor`, which is event data). `reclaim` reads the day and the part again at send and refuses, sending nothing:
a day not over, a ranked day, nothing sponsored or already taken back (`NothingToReclaimError`), and a part that is not the one
confirmed (`ReclaimAmountChangedError`). The Landing prize panel lists "Prizes nobody ranked for" with the part, what already went back,
a confirm showing the amount, and the re-check at send.

## Deployment

`resolveEconomyDeployment({ base, file, env })` (`economy/deployment.ts`) takes the four contracts' `Deployment` and
adds the economy's addresses, the env first. It is `configured` only when the base is configured and `Economy`,
`PavedToken`, `Vault` and USDC are all known; otherwise `missing` lists what is not. `createEconomyClient` gives null
then. `Deployment` gains only `mockUsdc` (the faucet's address, `""` where there is none): a deployment without the economy keeps working as before.

## Amounts

Every amount is a `bigint` in base units: USDC 6 decimals, PAVED 18 (D-10, economy.md "Units"). `parseUnits` and
`formatUnits` never go through a float. The labels are `USDC` and `PAVED` whatever a mock's symbol says.

| Figure | How the client gets it |
|---|---|
| Price `P` of stake `k` (1 to 10) | `k x Daily.entry_price().amount` (2 USDC per stake unit after E3), and `Economy.quote(k).price` must be the same, else nothing is sent |
| Boost | `1 + k/100` (`boostBps`), shown as a multiplier; the reward itself is the contract's |
| Referral | 5 % of `P`, **out of the margin**: it changes no amount the player pays (P-31) |
| `min_out` | the pool quote for `burn_quote` (`PoolQuoter.quoteSwap`, fee included) less the slippage, rounded down: 1 % by default (`DEFAULT_SLIPPAGE_BPS`), at most 5 % (`MAX_SLIPPAGE_BPS`), shown to the player (P-35). Never `min_out_hint` |
| Reward | only `Economy.terms(game).reward` after settlement; the client computes and promises none |

## Writes

`EconomyWriter` (`economy/writer.ts`), from `EconomyClient.writer(pavedWriter)`. Every write goes through the
account's `PavedWriter` (`PavedWriter.sendCalls`), so the economy's writes and the game's are **serialised together**:
while one is pending, another is refused. The checks below run inside that lock, just before `execute`, and any failed
read or refused check sends nothing (`WriteError`, or the typed errors).

| Write | Calls (one multicall) | Read and refused at send |
|---|---|---|
| `purchase({ stake, confirmedPrice, referrer })` | `USDC.approve(Daily, P)`, `Daily.spawn(stake, referrer, min_out)` | `entry_price` and `quote(stake)`; the entry token is not USDC; `P` is 0; the quote's price is not `k x unit`; `P` is not `confirmedPrice` (`PurchasePriceChangedError`); a stake outside 1..10; no pool quoter (today), a pool quote of 0 or a min_out rounding to 0 ("No pool quote: nothing was sent": no slippage protection), a failed pool read; a slippage above 5 %; a referrer that does not parse as an address (a `WriteError`, never a raw parse error). A self-referral is sent as `0x0` |
| `settle(gameIds)` (the player's claim of PAVED) | `Economy.settle(game_ids)` | the ids de-duplicated; `terms` of each: not bought (stake 0), not recorded (not over, or expired: no reward), already settled, or its day not yet settleable (`now < settlesAfter(day)`, the end of the next day, `now` the latest block's timestamp when the provider reads blocks, the device clock otherwise); a failed block read sends nothing |
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

## Screens (part b)

All on the landing page (`App.tsx`, which holds the routes, is outside this task's files: no new route). The economy of
the build is `useEconomy()` (`utils/economy-context.ts`): the same network's deployments file and the env
(`VITE_ECONOMY_ADDRESS`, `VITE_PAVED_TOKEN_ADDRESS`, `VITE_VAULT_ADDRESS`, `VITE_USDC_ADDRESS`, `utils/economy-network.ts`);
`EconomyProvider` overrides it in tests. While it is not configured, the panel says "Not deployed on `<network>`" with what
is missing, the Daily keeps today's confirm, and nothing of the economy is read.

| Screen | Where | What it shows and does |
|---|---|---|
| Purchase | the Daily dialog (`EconomyPurchase`), when the economy is configured and no Daily game is active | the stake `k` picker (1 to 10), the price read from the chain (`k x entry_price`, equal to `quote(k).price`, else "Price unavailable"), the boost `x(1 + k/100)`, the slippage ("1 % (at most 5 %)"), "A paid game expires 24 h after its purchase", the current reference (`Quote.mean` and `threshold`, "the day's own mean is known only at settlement"), the referrer from the link, the cliff. Without a pool quoter (today, P-35) it says "No pool quote: purchase unavailable" and offers no Buy. "Buy for P USDC" only opens the confirm; "Confirm purchase" navigates to `/game?mode=daily` with the purchase in the history state |
| Referral link | panel (`EconomyReferral`) | the player's link `/?ref=<address>` and "pays the same price; you get 5 % of it, out of the stakers' margin" |
| Vault | panel (`EconomyVault`) | staked PAVED, total staked, pending USDC dividends, the wallet's PAVED; stake, unstake, claim dividends, each through a confirm that shows the amount; the unstake confirm says the dividends stay claimable (E1's `unstake` credits them, it does not pay them); dividends that changed between the confirm and the send (`VaultAmountChangedError`) reopen the confirm with the new amount and say so, sending nothing |
| After the day | panel (`EconomySettle`) | the current reference (as above), then the player's bought Daily games (the newest 30 `GameSpawned`, then `terms` each; stake 0 is not listed): in play with its expiry (purchase `start_time` + 24 h), "Expired: no reward" (not recorded by then), "settles after <end of D+1>" (recorded, day D), to settle, or settled with the chain's reward; a reward of 0 says "below the shifted mean, the stake is lost". "Settle" shows only once the settlement date is past and opens a confirm; the writer checks that date against the latest block. No day mean (zeros until the day closes), estimate or projected reward is shown |

The cliff is said as it is wherever a game is bought or settled: **"Below the shifted mean the stake is lost."** No
reward is shown before the contract computed it (`terms.reward` after settlement).

### Consent

The payment rules of `client-data-layer.md` hold for each paying action:

- **A paid start only after a click on a confirm that shows the amount.** The purchase's consent is the history state
  `{ start: true, purchase: { stake, confirmedPrice, referrer } }` (`utils/economy-start.ts`), set only by "Confirm
  purchase". A link (`?stake=`, `?price=`, `?ref=`) sets none: the game page says "No game selected" and sends nothing.
  `readPurchaseIntent` refuses any malformed state (a stake outside 1..10, a price that is not a positive integer string,
  a referrer that is not hex). A malformed `?ref=` (`?ref=abc`) is ignored on the landing page: no referrer is shown or sent.
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

- `packages/chain/test/economy.test.ts`: the ABIs and the field lists against `Economy.json`, `quote_swap`'s u256 in and out, the error states, the referrer bound, the arithmetic (BigInt, 2k USDC, boost,
  5 %, `min_out`), the deployment, each write's calls and each refusal with nothing sent, the serialisation, the views'
  decoding.
- `packages/app-web/__tests__/economy-screens.test.tsx` (jsdom, `FakeEconomy`): the picker's price and boost, the
  explicit confirm and its history state, the referrer shown and the same price, self-referral, a failed read and a
  quote that disagrees, the not-deployed state, the Vault confirms and a changed amount, the settle list and confirm, the
  cliff text.
- `packages/chain/test/codec.test.ts`: signed integers.
- `packages/app-web/__tests__/economy-screens.test.tsx` also covers the `/economy` page, the expired state, a non-registered and a loading referrer, the `?ref=` bound and `spawnForIntent`.
- `packages/app-web/__tests__/economy-game-start.test.tsx`: the game page buys from the state only, after clearing it;
  a changed price, a URL alone and a malformed state send nothing.

No browser run (jsdom only). Nothing has run against a live economy from the client yet.

## The page

`/economy` (`pages/Economy.tsx`) shows the purchase, the Vault, the "after the day" list and the referral link as one
page; the Landing keeps its own entry points and links to it. The purchase is only confirmed on the page: its consent is
the history state to the game page, which sends it, as from the Landing.

## What waits

- The devnet run of the economy (`PAVED_E2E=1`, `bun run test:e2e` in `packages/chain`, t-0073 PR b) passes on a fresh
  `starknet-devnet --seed 42` after `scripts/deploy.sh devnet`, with the indexer on 127.0.0.1:8787: faucet, a paid purchase with a
  referrer (price = burn + referral + margin against the balances), play to game over (recorded in the Economy), the prizes, the
  settlement, the Vault, a sponsor's reclaim and an expired game. Since t-0081 (2026-10-10, 18 of 18 on day 20738): alice plays with
  the search player of `test/daily-player.ts` and scores 9,084 against a threshold of 3,455.877 (prior 3,353, her stake 3, bob's and
  carol's 1,257 at stakes 2 and 1); her settlement mints 1,566.385536085290946482 PAVED, and the `Settled` event, `terms.reward`, her
  balance change and `R x c x score / threshold` from the chain's terms (`test/economy-curve.ts`) agree; bob and carol get 0. carol
  stakes her own 1,000 test PAVED in the Vault; bob's later purchase gives her 3,125 USDC base units pending, which she claims.
  The recorded receipts of `test/fixtures/devnet.json` still predate E3 (the harness that records them, `test/devnet.test.ts`,
  deploys the old four contracts): the paid spawn is not re-recorded.
- The old `Token` (the mock ERC20, no longer charged) is still in the base deployment (`PavedClient.balance` and a sponsor's approve use
  its codec, the same ERC20); the entry token is read from `Daily.entry_price`.
- The list of games to settle could come from the indexer's `unsettled` list (indexer.md) instead of events.
- If a batch settle is ever added, it skips expired games.
