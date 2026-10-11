# Sepolia run against the real Cartridge controller (D-16)

Run of 2026-10-11 against https://paved.bal7hazar.com (release of 1235607, #304) and https://api.paved.bal7hazar.com.
Part A (no Cartridge account) is done. Part B (account needed) is **blocked**: no Cartridge account has been created,
registered or logged into, and none will be until the owner's exact sentence allowing it is relayed.

## Method

- VPS only, headless Chromium only (`headless: true`, no window flags): `scripts/e2e-sepolia/part-a.mjs`, Playwright
  (`playwright-core` 1.49.1, installed apart in `scripts/e2e-sepolia/`, like `scripts/bench`), browser
  `chromium_headless_shell-1243`.
- Run: `NODE_OPTIONS=--max-old-space-size=384 /usr/bin/time -v bun scripts/e2e-sepolia/part-a.mjs --out docs/client/sepolia-controller-run --connect`.
- **Peak RSS of the run (`/usr/bin/time -v`, largest process): 115,244 kB (112.5 MiB)**, 19.9 s wall, heap cap 384 MB.
- The driver clicks Connect and reads the keychain iframe's text; it never types into or clicks inside the keychain.
- Evidence is in `docs/client/sepolia-controller-run/`: `01-loaded.jpg`, `02-leaderboard.jpg`, `03-after-connect.jpg`,
  `run.json` (console, requests, failures), `page-text.txt`, `leaderboard-text.txt`, `keychain-text.txt`, `frames.json`,
  and the raw `indexer-*.json` answers. No secret, session key or private key appears in them (nothing was signed).

## Part A results

| Step | Result | Evidence |
|---|---|---|
| 1. Load the client headless | **pass**, with two notes below | `01-loaded.jpg`, `run.json`, `page-text.txt` |
| 2. Leaderboard and today's Daily, UI against indexer | **pass**, they agree | `02-leaderboard.jpg`, `leaderboard-text.txt`, `indexer-*.json` |
| 3. Press Connect, read the keychain | **pass up to the account screen; blocked there** (see below) | `03-after-connect.jpg`, `keychain-text.txt`, `frames.json` |

### Step 1: load

- The page loads (`paved.bal7hazar.com/`, `assets/index-*.js`, `assets/dist-*.js`), no failed request.
- Console: 4 messages, none from the client's own code:
  - warning `Setting overlaysContent is only supported from the top level browsing context` (the keychain iframe);
  - error `{code: NOT_CONNECTED}` (the controller's `probe()` answering that no session exists; expected before Connect);
  - 2 errors `rpc error: code = Unauthenticated desc = access denied`, raised by `x.cartridge.gg/assets/index-*.js`.
    They appear once the keychain iframe is open (the 11 `POST api.cartridge.gg/query` calls); they did not stop the login
    screen from rendering. Not caused by the client's policies (nothing was approved yet); probably the keychain's own
    anonymous GraphQL calls. To re-check after Part B.
- The RPC the client uses is Cartridge's: `POST https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10` (7 requests on load).
  It is the RPC configured for the controller; no other RPC host is called.
- "Connected": the app is **not** connected, as expected; the top bar says "Read only: connect to play." and the
  token card says "Mint Unavailable / Mint disabled for this network" until a controller connects.
- The keychain iframe (`x.cartridge.gg`) is loaded already on page load, before Connect is pressed (`lazyload: true` did not defer
  the request; it also pulls fonts and `auth.turnkey.com`).
- Indexer: the home page makes no indexer request; the indexer is called when the leaderboard is opened (step 2).

### Step 2: leaderboard and Daily

Opening "Leaderboard" in the UI makes exactly two requests: `GET /v1/tournaments?…` and `GET /v1/tournaments/20737/leaderboard?…`.

| | UI (`leaderboard-text.txt`) | Indexer (`/v1/tournaments/20737/leaderboard`) |
|---|---|---|
| Day | 2026-10-11 (today) | tournament 20737, `start_time` 1791676800 |
| Entries | rank 1, player `smoke`, best score 0, 1 game, no prize slot | `total` 1; rank 1, `name` "smoke", `best_score` 0, `games_played` 1, `prize_ranks` [] |
| Freshness | "Updated 4261 blocks behind: scores may be late (block 16421719)" | `behind` 4261, head 16421719 |

Today's Daily from `GET /v1/tournaments/20737`: `games_spawned` 1, `games_finished` 1, `players` 1, `best_score` 0;
economy `games_purchased` 1, `games_settled` 0, `closed` false. The single game belongs to the previous smoke test
(player `smoke`), not to this run. The UI and the indexer agree.

### Step 3: the keychain, without an account

Pressing Connect opens `https://x.cartridge.gg/connect?id=<uuid>` in an iframe (a modal over the page) and `https://auth.turnkey.com/`
(a hidden frame). The only screen reached:

> **Connect Controller** · field "Username" · "Enter a Username" · "By continuing you are agreeing to Cartridge's Terms of
> Service and Privacy Policy" · **LOG IN** · "by cartridge"

- This is the username entry that either logs in or leads to sign-up. Stopped here, per the rule: nothing typed, no click in the frame.
- **Not seen yet**, because they come after the account step: the text about this origin (`paved.bal7hazar.com`), the
  "unverified" marking of the policies, the spending-limit screen, any refusal for this origin. So the question of #295
  (is the origin refused?) is **not answered** by Part A; the only signal so far is that the keychain loads for this origin and
  shows its login screen with no refusal.

## Part B (needs a Cartridge account): blocked

Steps 4 to 8 (connect with a WebAuthn method, faucet mint of 100 USDC, buy one Daily game, play a few moves, check the
indexer once `behind` has dropped) are **blocked**: no account may be created until the owner's exact sentence is relayed.
The indexer is still catching up (`behind` 4261 at the time of the run); `/v1/head` shows it.

Two ways to continue, the owner choosing: a throwaway account driven headless on the VPS with the method the PM gives; or
the owner's own run below.

## Part B by the owner, by hand, on the Mac

Used if the owner says no to a throwaway account. The owner connects once, in their own visible browser on the Mac, at a
moment they choose. No agent runs a browser on the Mac for this variant. Have a Cartridge passkey method ready (Touch ID
or a security key). Take a screenshot at each numbered step where it says so; do not capture anything that shows a private key
or recovery phrase.

1. **Open** https://paved.bal7hazar.com in a fresh browser profile or window. Expect "Read only: connect to play." and a
   Token card reading "Mint Unavailable". Open the browser's console (Develop menu or F12) and keep it open; note any red error
   besides `{code: NOT_CONNECTED}` and the two `Unauthenticated ... access denied` lines already known.
2. **Connect.** Press "Connect". A "Connect Controller" modal appears (iframe from `x.cartridge.gg`). Enter a username and
   create the account (passkey), or log in to an existing one. **Capture** the screens that follow, in particular:
   - any text naming the origin (`paved.bal7hazar.com`), such as "wants to connect" or a warning about an unknown or
     unverified site;
   - the session approval screen: whether the policies are marked unverified, the list of contracts and methods
     (`Account.create`, `Daily.spawn/build/discard/surrender/claim/sponsor`, `Tutorial.*`, `MockUSDC.mint`, one `approve` on the
     entry token with a spender and a cap) and the spending-limit text;
   - any refusal or error line, copied word for word.
   Approve the session. The top bar should now stop saying "Read only".
3. **Faucet.** On the Token card press Mint once (100 USDC). **Capture** the balance (0 to 100 USDC) and the transaction hash
   (Voyager or Starkscan link, or the controller's toast). It should not prompt for a signature, as `MockUSDC.mint` is a session policy; note
   if it does. One mint only.
4. **Buy one Daily game.** Start the Daily (price in USDC, paid by one `approve` then the entry). **Capture** the price shown,
   whether a prompt appeared for the `approve` (it should not: it is within the session cap), and the tx hash(es).
5. **Play a few moves.** Place about five tiles. **Capture** one screenshot of the board and the tx hash of at least one move;
   note whether any move prompted. Then end with "Surrender" (a finished game counts in the leaderboard) or leave it open.
6. **Afterwards, check the indexer.** The indexer is behind: wait until `GET https://api.paved.bal7hazar.com/v1/head` shows
   `"behind"` close to 0 (it was 4261 on 2026-10-11 and falls with time). Then, with the player id from step 2 (the account
   address, shown by the controller) and the game's contract and id:
   - head and lag: `GET https://api.paved.bal7hazar.com/v1/head`
   - today's day: `GET https://api.paved.bal7hazar.com/v1/tournaments?limit=1` (the first `id`, 20737 for 2026-10-11 UTC, is `<day>`)
   - the day's summary: `GET https://api.paved.bal7hazar.com/v1/tournaments/<day>`
   - the leaderboard: `GET https://api.paved.bal7hazar.com/v1/tournaments/<day>/leaderboard?limit=20`
     (your username should appear with `games_played` of at least 1, and `best_score` rising once you finish a game)
   - your player: `GET https://api.paved.bal7hazar.com/v1/players/<player_id>` and `GET https://api.paved.bal7hazar.com/v1/players/<player_id>/games`
   - the game: `GET https://api.paved.bal7hazar.com/v1/games/<contract>/<game_id>` (`<contract>` from `contracts.daily` of `/v1/head`)

   Compare with the UI: "Leaderboard" on the home page must show the same rank, score and games.
7. **Send back**: the screenshots of steps 2 to 5, the copied keychain text about the origin and unverified policies, the tx
   hashes of mint, purchase and one move, and the JSON answers of step 6.
