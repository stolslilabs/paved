# Client economy (P8)

How the web client buys a paid Challenge game in USDC, settles it after the day, and deposits PAVED in the Vault for
vPAVED (P-56: "The Vault as vPAVED" below). The
contract side is `economy.md` (ruled by the PM: P-31); the data layer and its payment rules are
`client-data-layer.md`. The code is `packages/chain/src/economy/` (this document's part a) and the economy panels and the `/economy` page of
`packages/app-web` (part b, below).

**Nothing is deployed beyond devnet** (economy.md). A deployment file without the economy's addresses leaves the client's
economy **not configured**, and the screens say so; nothing is read or sent. The committed `contracts/deployments/devnet.json`
since #276 holds the economy: `contracts.{Economy, PavedToken, Vault, Faucet, MockRouter}` (written by `scripts/deploy.sh`).

Since D-23 the paid game's contract is named `Challenge` (`Daily` before; `public-interface.md`, "Breaking change D-23"):
its ABI becomes `contracts/abis/Challenge.json` and a fresh deployment file's key `contracts.Challenge`, with the same
entry points (`spawn`, `entry_price`). `packages/chain` names it `Challenge` too (the `Challenge` codec,
`Challenge.json`, `contracts.Challenge`) since CLIENT's W1e.

## What E3 made real (P8, #275)

Every ABI is now a committed one. There are no stubs, `stub-abi.ts` and `ECONOMY_ABI_IS_STUB` are gone, and the economy
panel no longer prints that purchases are not possible.

| Piece | Source |
|---|---|
| `Economy`, `PavedToken`, `Vault` | `contracts/abis/{Economy,PavedToken,Vault}.json` (E1, E2) |
| `Challenge.spawn(stake, referrer, min_out)` | `contracts/abis/Challenge.json` (E3, `Daily.json` before D-23), encoded by the `Challenge` codec of `ECONOMY_ABIS` |
| USDC (`approve`, `balance_of`, `allowance`, and the devnet faucet `mint`) | `contracts/abis/Faucet.json` (#276 committed it): the ERC20 interface the real USDC exposes too, plus the mock's `mint(recipient, amount)`. `ECONOMY_ABIS.USDC` is this ABI, no longer `Token.json`'s |
| Addresses | `contracts.{Economy, PavedToken, Vault}` and the USDC: `contracts.Faucet` on devnet and Sepolia (explicit: neither a stray `contracts.USDC` nor `VITE_USDC_ADDRESS` is read there), `VITE_USDC_ADDRESS` then `contracts.USDC` on the networks without a faucet (mainnet) of `contracts/deployments/<network>.json`; or the env |
| Reads in unit tests | `FakeEconomy`, `FakePoolQuoter`, `fakeTerms`: **tests only**, exported from `@paved/chain/testing` |

What a purchase sends (`EconomyWriter.purchase`), in one multicall:

1. `USDC.approve(Challenge, price)`, `price = stake x Challenge.entry_price().amount` (2,000,000 per stake unit, 6 decimals);
2. `Challenge.spawn(stake, referrer, min_out)`, `min_out` = `Economy.quote_swap(swap_in)` on every network (the on-chain
   quote of the purchase's own route since E-9: "The pool quote" below) less the player's slippage (1 % by default, at
   most 5 %, rounded down). `swap_in` is the USDC of the purchase's one swap since P-56: the burn quote plus the margin,
   that is the price less the referral when a referrer is sent (`swapInputOf`).

The rules around it are unchanged and keep their tests: the confirm, the consent in history state only, the re-check of
the price at send (`PurchasePriceChangedError`), no purchase from a URL alone, writes serialised through one writer, and
nothing sent after a failed read or a missing pool quote.

What E3 removed from the client:

- `PavedWriter.spawn("challenge")`, with its approve of `entry_price` and `EntryPriceChangedError`: it now throws and sends
  nothing, a Challenge game is bought only by `EconomyWriter.purchase`. `spawn("tutorial")` stays: the Tutorial is free and
  unchanged. The Landing dialog of a Challenge game only resumes one; a new one is bought with the stake picker.
- The prize no longer grew with entries (economy.md section 7, P-31): it was **sponsor-only**, and D-20 removed it with
  sponsoring, claiming and reclaiming. The Landing labels the entry in USDC (`TOKEN_LABEL`).
  `PavedClient.balance` reads the token `Challenge.entry_price` names.
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
- `TermsView.stake` is 0 for a Challenge game that was not bought, with `recorded` and `settled` false.

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
Since D-25 (E) a referrer is **any non-zero address other than the payer, the Challenge and the Economy** (the contract's
rule, CORE's step E: it ignores those three), with no registration: there is no `Account` to ask, so no read holds the
purchase back. Before E the referrer had to be a registered player other than the payer (the client read `Account.player`
and dropped an unregistered one). The writer refuses the payer's own address and the deployment's `Challenge` and `Economy`
addresses, in any spelling (padded or not), with `RefusedReferrerError` (`who`: `payer`, `challenge` or `economy`) and one plain
message, "This address cannot be your referrer. Nothing was sent." (`refusedReferrer` is the check). The landing page shows
such a link as "Referral link: this address cannot be your referrer, so no referrer is sent" and sends none. A zero referrer is no referrer (`0x0`).

## The devnet faucet and the entry token

- `PavedWriter.mint()` sends `Faucet.mint(self, FAUCET_USDC_AMOUNT)` (100 USDC,
  6 decimals) at `deployment.faucet`, which is `contracts.Faucet` of the deployments file. It
  replaces the old `Token.mint()`. `faucet` resolves on `devnet` and `sepolia` only (`FAUCET_NETWORKS`; any other network, mainnet above all, gets `""`, whatever its file or env holds; on Sepolia the controller signs it, with `mint` in its session policies). The Landing offers the faucet button only with `supportsMint && !!deployment.faucet` (`createPlayer` and its `mintTestToken` left with D-25 (E): there is no account to create). A deployment without that address has no faucet: `mint` throws `No faucet` and sends nothing, and
  nothing else in `Deployment` changes (`configured` does not need it). The faucet is not a session policy of the Cartridge
  controller: the burner signs it on devnet, and `controller.test.ts` drives both writes and asserts that neither is in the session.
- `Landing` compares `Challenge.entry_price().token` with the **USDC address** (`economy.deployment.addresses.USDC`), no longer with
  the old `Token` (gone from the deployment): a different entry token, or no USDC address known, is "Unknown token".

## The prize, its claims and the reclaim (D-20)

D-20 removed the day's prize: `claim` (ranks 1 to 3, and rank 0, a sponsor's reclaim of P-37), `sponsor` and the
`tournament` view. The client follows: `PavedWriter` has no `claim`, `sponsor` or `reclaim`, `EventReader` no
`sponsorship`, `sponsoredDays` or `reclaimedTotal`, the controller session no `claim` or `sponsor` policy, and the Landing no
prize panel. Their errors (`NoPrizeDayError`, `NothingToReclaimError`, `RewardChangedError`, `SponsorAmountChangedError`,
`ReclaimAmountChangedError`) went with them. The Economy's reverts (`swap below min_out`, `day cannot close yet`) still match
as text and as the hex of the short string the node may return, in the receipt's revert and at fee estimation.

## Deployment

`resolveEconomyDeployment({ base, file, env })` (`economy/deployment.ts`) takes the four contracts' `Deployment` and
adds the economy's addresses, the env first. It is `configured` only when the base is configured and `Economy`,
`PavedToken`, `Vault` and USDC are all known; otherwise `missing` lists what is not. `createEconomyClient` gives null
then. `Deployment` gains only `faucet` (the faucet's address, `""` where there is none): a deployment without the economy keeps working as before.

## The pool quote (E-9)

The pool quote sets the floor that protects the player's swap (P-35): `min_out` = quote less the slippage. A quote too
low exposes the swap; a quote too high only makes it revert. Since CORE's E-9 (#309, economy.md "As built: E-9") there is
**one quoter on every network**: `EconomyPoolQuoter` (`economy/pool.ts`) calls the view `Economy.quote_swap(usdc_in) ->
u256`. The Economy builds the same `RouteNode` as `purchase` (its stored pool key, `sqrt_ratio_limit`, `skip_ahead: 0`)
and asks its router's `quote_swap`: Ekubo's router on mainnet, the `MockRouter` on devnet and Sepolia. The quote is
therefore the exact route the purchase swaps, and the client never calls a router or a quoter API itself.
`poolQuoterFor(deployment, provider, codec)` gives it for any configured deployment (devnet, sepolia, mainnet), and null
when the economy is not deployed; `EconomyClient` takes it unless a test passes its own.

**The amount quoted is the amount swapped.** Since P-56 `Economy.purchase` pays the referral (if any) out of the margin,
then swaps the rest of the price, the burn quote and the margin, in **one swap** that must fill whole (`'Economy: partial
fill'` reverts the purchase); the PAVED is split by input, the margin's part (`bought x margin / (burn_quote + margin)`,
rounded down) to the Vault by a plain transfer, the rest burned. `EconomyWriter.planPurchase` quotes exactly that input,
`swapIn = swapInputOf(quote, referred)`: `quote.price`, less `quote.referral` when a referrer is sent, read from
`Economy.quote(stake)` in the same plan. The line that ties the two is
`poolOut = await this.options.poolQuoter.quoteSwap(swapIn)` in `economy/writer.ts`, and `PurchasePlan.swapIn` keeps it. The
devnet run proves it against the contract's own computation: `swapIn` equals `Purchased.burned_quote + margin` (what the
contract swapped), the PAVED the swap paid (`burned + vault_paved`) equals the plan's `poolOut`, and it is at least
`min_out`. A `burn_quote` outside `(0, price]`, or a `referral` above the margin, is refused before any quote. The
referral changes no amount the player pays, but it leaves the swap, so a purchase with a referrer has a lower `min_out`.

**Fresh at every send, never below what the player confirmed.** The quote is taken inside the writer's `prepare`, right
before the account executes, at every purchase: nothing is cached, and the quote the purchase screen shows is never the
one sent. There is no age bound to state: the send never uses an older quote. The confirm shows "At least X bought",
and X (the confirm's `min_out`, at the default slippage) rides in the purchase intent as `confirmedMinOut`, a
decimal string parsed as strictly as `confirmedPrice` (an intent without it, or with a malformed one, buys nothing).
`PurchaseRequest.confirmedMinOut` must be a bigint above 0. At send, a fresh `min_out` below it is refused with
`PoolPriceMovedError` ("The pool price moved: confirm again") and nothing is sent; an equal or higher one sends its own,
higher-or-equal `min_out`. So the `min_out` sent is never below what the player confirmed (value audit t-0111, finding
1). Between the send's quote and the block, `'Economy: swap below min_out'` (`SwapBelowMinOutError`) applies.

**A revert is "the pool cannot fill this purchase now".** `quote_swap` reverts with `'Economy: partial fill'` when the
pool cannot take the whole input now (E-9's F1), `'Economy: wrong delta'` (F2), `'Economy: amount too large'` above
`u128`, or with the router's or core's own reason (`LIMIT_DIRECTION`). Each of these, a failed RPC call, and a quote
whose `min_out` rounds to 0 is no slippage protection: the writer throws `PoolCannotFillError` and sends nothing. Its
message is `POOL_CANNOT_FILL` plus "Nothing was sent.": "The pool cannot fill this purchase right now. Try a smaller stake
or later. Nothing was sent." The cause stays on `detail`, never in the message.

**A quote that cannot be read is not a revert** (t-0111, note 4). `isQuoteRevert` (`economy/pool.ts`) tells them apart:
a node reports a revert of a view as `CONTRACT_ERROR` (JSON-RPC code 40, a `revert_error`), or the text names one of the
Economy's reasons. Anything else (a transport error, a rate limit -32011 or 429, a timeout) throws
`PoolQuoteUnavailableError`: "Cannot read the pool quote right now; try again. Nothing was sent." Nothing is sent in
either case. Checked against Sepolia on 2026-10-12: the real revert of `quote_swap(2^128)` is a revert, an unreachable
node is not. The game page shows it as "Cannot start a
game: ..." (the purchase's consent is already cleared, so nothing is retried).

The purchase screen reads the same quote for the stake shown and displays "Swapped for PAVED in one swap: <swap_in>",
"Burned: the PAVED of <burn quote> of the price (70 %), at today's terms; the rest goes to the Vault (vPAVED) for the
stakers" and "PAVED bought: at least <min_out> (quoted again when sent)", and the same figures in the confirm. When the read reverts or fails it shows only
`POOL_CANNOT_FILL` and a disabled "Pool cannot fill" button; a read that failed without a revert shows
`POOL_QUOTE_UNAVAILABLE` and a disabled "Pool quote unavailable". **No stale quote**: the figure is shown only from an answer
for the current stake that is not being read again and has no error (`useAsyncRead` keeps an old answer next to a new
error; the screen does not show it). The quote is read again when the page becomes visible.

A real answer on Sepolia (read only, Cartridge `rpc/v0_10`, 2026-10-12, Economy `0x005aab18…6a18b`, through
`poolQuoterFor` and `EconomyPoolQuoter`): 1.4 USDC quotes 106.298780403549364740 PAVED, 14 USDC 1,061.717630437859022100
PAVED; 2^128 reverts with `'Economy: amount too large'`, a `ViewError` the writer turns into `PoolCannotFillError`.
Sepolia still runs the pre-E-9 `Economy` class; its `quote_swap` signature is the same, so CORE's coming repoint (upgrade,
`set_router`, `set_pool`) needs no client change.

**Removed with E-9:** Ekubo's public quoter API (`EkuboPoolQuoter`, `economy/ekubo.ts`, its 5 s timeout and its answer
checks, and its test): no code path fetches `prod-api-quoter.ekubo.org`. Also dropped, never built: **guard (i)**, the
backlog item to refuse any Ekubo route that is not the single hop through `Economy.pool()`. Its reason, "the quoted route
is not the route the contract swaps", is gone: the on-chain quote is the purchase's own route.

## The mainnet gates on the purchase quote (E-9b)

CORE's rulings of E-9b (#311; `docs/architecture/economy.md`, "For CLIENT", rulings 1 and 2, and the mainnet gates
list). Both are checked in `EconomyWriter.planPurchase`, the purchase's own `prepare`, with the quote: the entry price,
`Economy.quote(stake)`, `Economy.rate()` and `Economy.router()` are read together, fresh at every send.

**The router pin (ruling 2).** `Economy.router()` must be the deployment's `expectedRouter` (`economy/deployment.ts`):

- mainnet (the network named `mainnet`, or any network whose file's `chain_id` is `SN_MAIN`): `MAINNET_ROUTER`,
  `0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e`, Ekubo's "Router V3.0.13". Never Nums' Router
  V3.0.3, which has no `quote_swap`;
- devnet and Sepolia: the file's `contracts.MockRouter`, never the env (the router is not a build setting);
- a devnet or Sepolia file without `MockRouter`, or any other network: no router is known, and every purchase is
  refused ("Purchases are off: no known swap router on this network."). An unknown router is never accepted.

Another router throws `RouterNotPinnedError` ("Purchases are off: the economy swaps through an unexpected router.
Nothing was sent."): the pool is not even quoted. A router that cannot be read refuses like any failed read. The purchase
screen reads `router()` too: it shows the same message, quotes nothing and offers no purchase. There is **no on-chain
pin** (economy.md gives the reasons): when Ekubo publishes a new router, CORE re-runs its fork test and the client
updates `MAINNET_ROUTER` in the same release.

**The sanity floor (ruling 1), a warning and never a refusal.** `implied = swap_in x rate / RATE_SCALE` (the burn
quote alone before P-56; the guard's rate is the same price per USDC, P-56 reads it from the burn's part of the swap)
(`impliedPaved`, `economy/amounts.ts`), where `rate` is `Economy.rate()`, the guard's rate that `min_out_hint` and
`curve::guarded` use (PAVED base units per USDC base unit, x `RATE_SCALE` = 1e18, `curve.cairo`). The quote is below the
floor when `quote_swap(swap_in) < 90 % x implied`. `SANITY_FLOOR_BPS` (9,000) holds the 90 %; E4, or a measured
false-warning rate on mainnet, may move it.

- Arithmetic: bigint only. The comparison is exact, cross-multiplied (`quote x 10,000 x RATE_SCALE < swap_in x rate x
  9,000`), so neither side is rounded: exactly 90 % is not below. The `implied` figure shown is rounded down.
- At or above 90 %, and above `implied`: nothing changes (the on-chain guard caps `R` at `quote x rate x 1.10`).
- A rate of 0 (the constructor refuses it, so only a mock or an unexpected upgrade has one): no `implied`, no warning; the
  contract has no guard then either (`guarded` counts the whole purchase). On mainnet it refuses instead (below). A rate that cannot be read: no purchase (screen and send), as any failed read.
- Below 90 %: the purchase screen shows both figures ("The pool quotes X PAVED for the swap, below 90 % of the Y PAVED the
  guard rate implies: the pool may have been pushed."); the confirm repeats them next to a checkbox ("I understand and
  buy anyway"), and "Confirm purchase" stays disabled until it is ticked. The acceptance rides in the purchase intent as
  `acceptedLowQuote` (only `true` counts).
- The send cannot skip it: a send-time quote below 90 % without the acceptance throws `PoolQuoteBelowFloorError` ("The
  pool quote is far below the guard rate: confirm again") and sends nothing, so the player sees the warning. The
  acceptance never lowers `confirmedMinOut`: `PoolPriceMovedError` still applies.

**Mainnet, rate 0 (unexpected): refused** (E-9c, CORE's ruling 3, `docs/architecture/economy.md` at 7d9f803, #314). The
guard rate is never 0 on a deployment: `Economy`'s constructor refuses 0 (`'Economy: zero rate'`) and stores the rate it
is given (the deploy passes the launch rate, 7.6e31), so no purchase "seeds" it. On mainnet a rate of 0 can therefore only
come from an unexpected upgrade, and the client then refuses every purchase with "Price rate unavailable; purchases are
paused" (`RateUnavailableError`, `rateProblem`): checked on screen and at send, in the same prepare as the router and the
quote, with the router pin's mainnet test; the pool is not quoted and nothing is sent. Devnet and Sepolia are unchanged:
a rate of 0 there means no warning, and the purchase proceeds.

**The chain check** (value audit t-0116, note 1). Once per client, before anything is read for a purchase,
`EconomyClient.checkChain` compares the RPC's `getChainId()` with the deployment file's `chain_id`. It fails closed: a
deployment without `chain_id`, or a provider that cannot tell its chain, refuses with "Purchases are off: the network
cannot be confirmed."; another chain with "Purchases are off: the RPC is on another network than this deployment."
(`ChainMismatchError`); nothing is sent, and the screen shows the same and offers no purchase. A match is kept for the
client's life; a failed read is tried again at the next purchase, and the purchase screen reads it again when the page is
shown again, so a transient RPC error at page open does not leave purchases off until a reload (a mismatch stays refused).
The check compares the read RPC's chain id with the deployment's `chain_id`. It cannot see the chain of the wallet that
signs, so a wallet on another chain is outside this check.

**Confirm again.** After `PoolPriceMovedError`, `PoolQuoteBelowFloorError` or `PurchasePriceChangedError`, the game
page shows a "Back to purchase" button to `/economy` beside Back (review #310, note 2), with `?ref=<referrer>` when the
purchase had one, so the referral survives the retry (review t-0115). Nothing was sent in each case. An acceptance of a
low quote is for the quote it was given on: when the quote shown changes, when the implied figure changes (the guard rate moved), or when it stops being low, the
checkbox is cleared.

**The burn share is "at today's terms"** (CORE's ruling, 2026-10-12). The purchase screen and the confirm show the part of
the price swapped and burned with that label, and the confirmation is unchanged: no check of `burn_bps` and no
`max_burn`. The player's USDC is fixed on chain (`price = stake x BASE_PRICE`, 2 USDC, asserted by `purchase`, and the
approve is exactly that), and `burn_bps`, which an owner act may change between the confirm and the transaction, only
splits the PAVED of the one swap between the burn and the Vault (5,000 to 9,000 bps): the swap's input, and so `min_out`,
does not depend on it since P-56.

**Sepolia today** (read only, Cartridge `rpc/v0_10`, 2026-10-12, Economy `0x005aab18…6a18b`): `rate()` =
75,997,157,987,455,519,998,088,182,721,818 (75.997 PAVED per USDC), `burn_quote` of stake 1 = 1.4 USDC, `implied` =
106.396021182437727997 PAVED, `quote_swap` = 106.298780403549364740 PAVED: **99.90 %** of `implied`, no warning.
`router()` **does not exist** there: Sepolia runs the pre-E-9 class ("Requested entrypoint does not exist"), so purchases
on Sepolia are refused until CORE's repoint upgrades it. The file's `MockRouter` is `0x02aa4d01…58f0`.

## Amounts

Every amount is a `bigint` in base units: USDC 6 decimals, PAVED 18 (D-10, economy.md "Units"). `parseUnits` and
`formatUnits` never go through a float. The labels are `USDC` and `PAVED` whatever a mock's symbol says.

| Figure | How the client gets it |
|---|---|
| Price `P` of stake `k` (1 to 10) | `k x Challenge.entry_price().amount` (2 USDC per stake unit after E3), and `Economy.quote(k).price` must be the same, else nothing is sent |
| Boost | `1 + k/100` (`boostBps`), shown as a multiplier; the reward itself is the contract's |
| Referral | 5 % of `P`, **out of the margin**: it changes no amount the player pays (P-31) |
| `min_out` | the pool quote for `swap_in`, the burn quote plus the margin less the referral (`swapInputOf`, P-56; `PoolQuoter.quoteSwap`, fee included) less the slippage, rounded down: 1 % by default (`DEFAULT_SLIPPAGE_BPS`), at most 5 % (`MAX_SLIPPAGE_BPS`), shown to the player (P-35). Never `min_out_hint` |
| Reward | only `Economy.terms(game).reward` after settlement; the client computes and promises none |
| vPAVED rate | `vaultRate(total_assets, total_supply)` = `(A + 1) x 1e18 / (S + 1)`, rounded down: OpenZeppelin's conversion at offset 0, shown as "1.0123 PAVED per vPAVED" (cut at 4 digits) |
| Exit fee | `Vault.exit_fee()` bps, shown as "1 % exit fee, left to the other stakers" (`formatPercentBps`) |

## Writes

`EconomyWriter` (`economy/writer.ts`), from `EconomyClient.writer(pavedWriter)`. Every write goes through the
account's `PavedWriter` (`PavedWriter.sendCalls`), so the economy's writes and the game's are **serialised together**:
while one is pending, another is refused. The checks below run inside that lock, just before `execute`, and any failed
read or refused check sends nothing (`WriteError`, or the typed errors).

| Write | Calls (one multicall) | Read and refused at send |
|---|---|---|
| `purchase({ stake, confirmedPrice, referrer })` | `USDC.approve(Challenge, P)`, `Challenge.spawn(stake, referrer, min_out)` | `entry_price` and `quote(stake)`; the entry token is not USDC; `P` is 0; the quote's price is not `k x unit`; `P` is not `confirmedPrice` (`PurchasePriceChangedError`); a stake outside 1..10; no pool quoter (the economy not deployed: "No pool quote: nothing was sent"); a `burn_quote` outside `(0, P]`; a `referral` above the margin; a `quote_swap` that reverts or fails, or a min_out rounding to 0 (`PoolCannotFillError`, "The pool cannot fill this purchase right now. Try a smaller stake or later. Nothing was sent.": no slippage protection); a slippage above 5 %; a referrer that does not parse as an address (a `WriteError`, never a raw parse error); the payer, the Challenge or the Economy as the referrer (`RefusedReferrerError`, D-25 (E)). A zero referrer is sent as `0x0` |
| `settle(gameIds)` (the player's claim of PAVED) | `Economy.settle(game_ids)` | the ids de-duplicated; `terms` of each: not bought (stake 0), not recorded (not over, or expired: no reward), already settled, or its day not yet settleable (`now < settlesAfter(day)`, the end of the next day, `now` the latest block's timestamp when the provider reads blocks, the device clock otherwise); a failed block read sends nothing |
| `deposit(amount, { confirmedAmount })` | `PavedToken.approve(Vault, amount)`, `Vault.deposit(amount, self)` | the amount is 0 or not the confirmed one (`VaultAmountChangedError`); the PAVED balance is short; `preview_deposit(amount)` is 0 (`VaultZeroSharesError`: the contract would revert, `'Vault: zero shares'`) |
| `withdraw(amount, { confirmedAmount })` | `Vault.withdraw(amount, self, self)`: exactly `amount` PAVED out, the vPAVED of `amount` plus the exit fee burned | the amount is 0 or not the confirmed one; above `max_withdraw` (`VaultOverMaxWithdrawError`, "More than you can withdraw: at most X PAVED now, the exit fee taken. Nothing was sent.") |
| `withdrawAll({ confirmedShares })` | `Vault.redeem(shares, self, self)` of every vPAVED held, for their PAVED less the exit fee | no vPAVED held; the vPAVED held is not the confirmed amount (`VaultAmountChangedError`) |

**New games paused (G4).** `purchase` and `planPurchase` read `Challenge.spawn_paused()` first, before the chain check, the
quote or any call is built: when it is true they throw `SpawnPausedError` ("New Challenge games are paused for now. Games
already started can still be played.", `SPAWN_PAUSED_TEXT`) and send nothing. The same error comes back for a
`'Challenge: spawn paused'` revert (text, short-string or hex form, from the receipt or from the node at fee estimation) when
the state changed between the read and the call; the revert is before any token moves, so no USDC is spent, though a
reverted send still pays its network fee. A failed `spawn_paused` read does not block the purchase (the contract is the
guard). `settle` and the Vault writes are not affected: the pause stops `spawn` only.

`planPurchase` runs the same reads and checks and returns the calls without sending them (tests).

Deposit and withdraw check the amount handed over against the confirmed one (`VaultAmountChangedError`), then against the
chain: the PAVED balance and `preview_deposit` for a deposit, `max_withdraw` for a withdraw, the vPAVED held for a
withdraw all. The player's consent is the confirm of the Vault screen (part b), which shows the amount and its preview and
hands over the field read again at the click. The Vault's reverts read plainly: `'Vault: zero shares'`
(`VaultZeroSharesError`), `'ERC4626: exceeds max withdraw'` or `'... max redeem'` (`VaultOverMaxWithdrawError`, with no
figure), and `'ERC20: insufficient allowance'` (`VaultAllowanceError`: the deposit approves exactly its amount in the same
multicall, so only an approval changed in between meets it). Each says the PAVED was not moved.

**Sent, outcome unknown.** A purchase that was sent but whose receipt could not be read (the wait timed out, the RPC
dropped), or whose receipt arrives without a `GameSpawned`, may have spent USDC: it is not a failure. A reverted receipt
stays a `WriteError` (`reverted` true): that one is a known failure. The writer throws `PurchaseOutcomeUnknownError` with the transaction hash. The game page shows "Purchase
sent (hash), outcome unknown: check your games before buying again", offers no retry, and the consent is already gone, so
nothing buys again without a new confirm.

## Reads

`EconomyViews` (`RpcEconomyViews` on the contracts, `FakeEconomy` in tests): `quote(stake)`, `day(day)`,
`terms(gameId)`, `vault(account)` (below), `previewDeposit`, `previewWithdraw`, `previewRedeem`, `usdcBalance`, `pavedBalance`. Reverts map to
`ViewError` as the game views do; a not configured economy is a `not-configured` `ViewError` with no call.

## The Vault as vPAVED (P-56)

CORE's V1b made the Vault an OpenZeppelin ERC4626 over PAVED, "Vault PAVED" `vPAVED`, 18 decimals, with votes
(`docs/architecture/vault-share.md`, its addendum). The client follows on the current client (`packages/chain`,
`packages/app-web`); client v2 (`packages/app`) gets its own page later (P10).

- **No claim.** `stake`, `unstake`, `claim`, `pending`, `acc` and `accounted` are gone: the rate is the only reward. A
  purchase's margin reaches the Vault as PAVED by a plain transfer, with no share minted, so the rate rises; the exit fee
  stays in the Vault, so it rises again for those who stay. Nothing in USDC reaches the Vault any more.
- **The position** (`EconomyViews.vault(account)`, `VaultPosition`): `shares` (`balance_of`), `value`
  (`convert_to_assets(shares)`: the worth at the current rate, before the fee), `maxWithdraw` (`max_withdraw`: what a
  withdraw pays now, the fee taken; CORE's limit makes it equal to `preview_redeem(shares)`), `exitFeeBps` (`exit_fee`),
  `totalAssets` and `totalSupply` (the rate). The screen shows `value` as "worth" and `max_withdraw` as "Withdrawable now,
  after the exit fee"; the withdraw-all confirm shows `max_withdraw` as what the redeem pays.
- **Votes and delegation**: nothing is read or wrapped; the delegation UI waits for its spec.
- **The indexer** does not read the Vault (its sources are Challenge, Setup, Economy and Collection). `Purchased` gained
  `vault_paved` (u256, the PAVED the margin bought): the indexer decodes it, stores it in `purchases.vault_paved`, and moves
  to schema 12 (the rebuild at the fresh release covers it). No indexed contract emits a new event.

## Screens (part b)

All on the landing page (`App.tsx`, which holds the routes, is outside this task's files: no new route). The economy of
the build is `useEconomy()` (`utils/economy-context.ts`): the same network's deployments file and the env
(`VITE_ECONOMY_ADDRESS`, `VITE_PAVED_TOKEN_ADDRESS`, `VITE_VAULT_ADDRESS`, `VITE_USDC_ADDRESS`, `utils/economy-network.ts`);
`EconomyProvider` overrides it in tests. While it is not configured, the panel says "Not deployed on `<network>`" with what
is missing, the Challenge keeps today's confirm, and nothing of the economy is read.

| Screen | Where | What it shows and does |
|---|---|---|
| Purchase | the Challenge dialog (`EconomyPurchase`), when the economy is configured and no Challenge game is active | the stake `k` picker (1 to 10), the price read from the chain (`k x entry_price`, equal to `quote(k).price`, else "Price unavailable"), the boost `x(1 + k/100)`, the slippage ("1 % (at most 5 %)"), "A paid game expires 24 h after its purchase", the current reference (`Quote.mean` and `threshold`, "the day's own mean is known only at settlement"), the referrer from the link, the cliff. The least PAVED bought (`Economy.quote_swap(swap_in)` less the slippage, "quoted again when sent"), the one swap's USDC and the burn's part, the rest to the Vault. A quote that reverts or fails shows "The pool cannot fill this purchase right now. Try a smaller stake or later." and a disabled "Pool cannot fill", with no figure. Without a pool quoter (the economy not deployed) it says "No pool quote: purchase unavailable" and offers no Buy. "Buy for P USDC" only opens the confirm; "Confirm purchase" navigates to `/game?mode=challenge` with the purchase in the history state |
| Referral link | panel (`EconomyReferral`) | the player's link `/?ref=<address>` and "pays the same price; you get 5 % of it, out of the stakers' margin" |
| Vault | panel (`EconomyVault`) | "Your share: X vPAVED, worth Y PAVED", "Withdrawable now: Z PAVED, after the exit fee" (`max_withdraw`), "Rate: R PAVED per vPAVED", "1 % exit fee, left to the other stakers", that the rate rises with every purchase's margin and every exit fee and there is nothing to claim, the wallet's PAVED. Deposit, Withdraw and Withdraw all, each through a confirm: a deposit shows the vPAVED it mints (`preview_deposit`), a withdraw the vPAVED it uses with the fee (`preview_withdraw`), withdraw all the vPAVED and what they pay after the fee. A withdraw above `max_withdraw` and a deposit that would mint no vPAVED are refused at the first click with the writer's plain message, and nothing is sent; vPAVED that changed before a withdraw all (`VaultAmountChangedError`) say so and send nothing |
| After the day | panel (`EconomySettle`) | the current reference (as above), then the player's bought Challenge games (the newest 30 `GameSpawned`, then `terms` each; stake 0 is not listed): in play with its expiry (purchase `start_time` + 24 h), "Expired: no reward" (not recorded by then), "settles after <end of D+1>" (recorded, day D), to settle, or settled with the chain's reward; a reward of 0 says "below the shifted mean, the stake is lost". "Settle" shows only once the settlement date is past and opens a confirm; the writer checks that date against the latest block. No day mean (zeros until the day closes), estimate or projected reward is shown |

**While spawn is paused (G4)**, the Challenge card on the landing page carries the notice "New Challenge games are paused for
now. Games already started can still be played.", and the purchase dialog shows it as an alert with a disabled "New games
paused" button instead of "Buy for P USDC": no confirm opens and nothing is sent. A Challenge game already started is
resumed as always (the dialog shows "Resume Game" and no purchase). The state is read with the other views
(`spawnPaused` on the landing page, `useAsyncRead` in the purchase) and refreshed with them (on open, when the page becomes
visible, after a write); a failed read shows nothing and keeps today's behaviour. Training and the Tutorial are off chain
and untouched.

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
  the confirm with its 5 % "out of the stakers' margin: you pay the same"; one's own address, the Challenge or the Economy is refused and said so,
  and no referrer is sent (D-25 (E): any other non-zero address is a referrer, with no registration read).
- **Cleared before sending.** The game page reads the purchase at mount, clears the history state (replace, state
  null) before anything is sent, and keeps the intent in a ref, exactly as the Challenge start; the 30 s expiry without a
  ready writer applies too. An active Challenge game is resumed instead of buying another.
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
  quote that disagrees, the not-deployed state, the Vault (vPAVED: its value, rate, exit fee and `max_withdraw`; deposit,
  withdraw, withdraw all; a withdraw above `max_withdraw` and a zero-share deposit refused with nothing sent; a changed
  amount), the settle list and confirm, the cliff text.
- `packages/chain/test/economy.test.ts` (P-56): the Vault ABI's ERC4626 entry points and no claim, `deposit(amount,
  self)`, `withdraw` and `redeem(shares, self, self)` calldata, above `max_withdraw` and a zero-share deposit refused before
  sending, the Vault's reverts read plainly (zero shares, over max withdraw or redeem, a missing allowance), the position's
  decoding.
- `packages/chain/test/e2e-devnet.test.ts` (P-56, `PAVED_E2E=1`): each purchase's one swap against the contract (`swap_in`
  = `burned_quote + margin`, the PAVED bought = the plan's quote, at least `min_out`, its split by input), `total_assets`
  growing by `vault_paved` with no share minted; the slippage bound (a floor above the fresh quote sends nothing; a
  `min_out` one above the swap reverts on chain); a deposit, a withdraw whose burned vPAVED equal `preview_withdraw`'s
  formula with only the amount leaving `total_assets` (the fee stays), and a withdraw all paying `preview_redeem`.
- `packages/chain/test/economy-quote.test.ts` (E-9, no network): one quoter, `Economy.quote_swap` on the deployed
  Economy, on devnet, sepolia and mainnet, with no `fetch`; a revert (`'Economy: partial fill'`, another router revert,
  `'Economy: wrong delta'`) or an RPC error refuses the purchase with `PoolCannotFillError` and sends nothing; rounding
  down; a quote rounding to 0 refused; the quote for exactly the one swap (burn quote + margin, P-56) at stakes 1, 4 and
  10, and the price less the referral with a referrer; a `burn_quote` outside `(0, price]`, or a referral above the
  margin, refused; a pool that moves between display and send (the send quotes again, nothing cached).
- `packages/chain/test/codec.test.ts`: signed integers.
- `packages/app-web/__tests__/economy-screens.test.tsx` also covers the `/economy` page, the expired state, an unregistered referrer sent at once (D-25 (E)), the `?ref=` bound and `spawnForIntent`.
- `packages/app-web/__tests__/economy-game-start.test.tsx`: the game page buys from the state only, after clearing it;
  a changed price, a URL alone, a malformed state and a `quote_swap` revert at send send nothing; the revert shows the
  plain message.
- `economy-screens.test.tsx` (E-9): the least PAVED shown from the quote, a revert shows the plain message with no figure
  and no purchase, and no stale quote (another stake that reverts, or a read again that fails, drops the figure).
- `packages/chain/test/economy-gates.test.ts` (E-9b): `RATE_SCALE` and the 90 % floor; 89.99 %, exactly 90 %, one base
  unit below, a quote above `implied`, a rate of 0, an unreadable rate; the floor at send with and without the
  acceptance, a send-time drop after a confirm with no warning, a guard rate that rose; the router pin on mainnet (the
  pinned router, Nums', a mock, zero; by chain id), devnet and Sepolia (the file's `MockRouter`, another one, a file
  without one), the committed files, a router read at every send, an unreadable router; `rate()` and `router()` decoding.
- `economy-screens.test.tsx` and `economy-game-start.test.tsx` (E-9b): the burn share "at today's terms" at the picker and
  the confirm; no warning at 95 %; below 90 % both figures and a disabled Confirm until the checkbox, the acceptance in
  the intent; an unpinned router (message, nothing quoted); at send, the floor without and with the acceptance, the
  router refused, and "Back to purchase" after "confirm again".

No browser run (jsdom only). Nothing has run against a live economy from the client yet.

## The page

`/economy` (`pages/Economy.tsx`) shows the purchase, the Vault, the "after the day" list and the referral link as one
page; the Landing keeps its own entry points and links to it. The purchase is only confirmed on the page: its consent is
the history state to the game page, which sends it, as from the Landing.

## What waits

- The devnet run of the economy (`PAVED_E2E=1`, `bun run test:e2e` in `packages/chain`, t-0073 PR b) passes on a fresh
  `starknet-devnet --seed 42` after `scripts/deploy.sh devnet`, with the indexer on 127.0.0.1:8787: faucet, a paid purchase with a
  referrer (price = burn + referral + margin against the balances), play to game over (recorded in the Economy), the
  settlement, the Vault and an expired game (the prize and the sponsor's reclaim steps left with D-20). Since t-0081 (2026-10-10, 18 of 18 on day 20738): alice plays with
  the search player of `test/challenge-player.ts` and scores 9,084 against a threshold of 3,455.877 (prior 3,353, her stake 3, bob's and
  carol's 1,257 at stakes 2 and 1); her settlement mints 1,566.385536085290946482 PAVED, and the `Settled` event, `terms.reward`, her
  balance change and `R x c x score / threshold` from the chain's terms (`test/economy-curve.ts`) agree; bob and carol get 0. carol
  stakes her own 1,000 test PAVED in the Vault; bob's later purchase gives her 3,125 USDC base units pending, which she claims.
  The recorded receipts of `test/fixtures/devnet.json` still predate E3 (the harness that records them, `test/devnet.test.ts`,
  deploys the old four contracts): the paid spawn is not re-recorded.
  These figures were measured before D-18 with prior 3,353 and slope 18,130; new deploys use slope 12,220 and a mean of 3,980 (P-46), and the client's fakes follow.
- The old `Token` is gone from the deployment and the client (W1f). `PavedClient.balance` reads `balance_of` at the address
  `Challenge.entry_price` names (the Faucet), with the Faucet's ABI (the ERC20 interface).
- The list of games to settle could come from the indexer's `unsettled` list (indexer.md) instead of events.
- If a batch settle is ever added, it skips expired games.
