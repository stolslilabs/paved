# Sepolia run against the real Cartridge controller (D-16)

Run of 2026-10-11 against https://paved.bal7hazar.com (release of 1235607, #304) and https://api.paved.bal7hazar.com.
Part A (no Cartridge account) is done. Part B (account needed) was tried headless on 2026-10-12 with the owner's go for one
throwaway account (section "Part B (automated)"): **sign-up failed twice on Cartridge's side, no account exists**. The fallback
is the owner's by-hand run below.

## Method

- VPS only, headless Chromium only (`headless: true`, no window flags): `scripts/e2e-sepolia/part-a.mjs`, Playwright
  (`playwright-core` 1.63.0, installed apart in `scripts/e2e-sepolia/`, like `scripts/bench`), browser
  `chromium_headless_shell-1243`.
- Run: `NODE_OPTIONS=--max-old-space-size=384 /usr/bin/time -v bun scripts/e2e-sepolia/part-a.mjs --out docs/client/sepolia-controller-run --connect`.
- **Peak RSS of the run (`/usr/bin/time -v`, largest process): 115,244 kB (112.5 MiB)**, 19.9 s wall, heap cap 384 MB.
- The driver clicks Connect and reads the keychain iframe's text; it never types into or clicks inside the keychain.
- Browser install (once; the pinned `playwright-core` does not fetch it): `bunx playwright-core@1.63.0 install chromium-headless-shell`.
  `playwright-core` is pinned to 1.63.0 because its `browsers.json` gives `chromium-headless-shell` revision 1243, the one the driver
  uses by default (`~/.cache/ms-playwright/chromium_headless_shell-1243/`) and the run used; 1.49.1 would install revision 1148. The run itself
  was made with the earlier pin 1.49.1 driving that same 1243 binary through `executablePath`; the driver code is unchanged by the re-pin. `--chromium <path>` names another binary.
- The `indexer-*.json` files are not made by the driver; they are plain GETs, taken right after the run:
  `for p in head 'tournaments?limit=1' tournaments/20737 'tournaments/20737/leaderboard?limit=20'; do curl -s "https://api.paved.bal7hazar.com/v1/$p" | jq . > docs/client/sepolia-controller-run/indexer-$(echo $p | tr '/?=' '___').json; done`
- Frame URLs are written without their query by the driver (`redact`), so `frames.json` and `run.json` agree. The committed
  `run.json` and `frames.json` of this run were made before that change; the keychain's query strings (connect id, iframe options) were stripped from their `frames` by hand, with the same result.
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
| Freshness | "Updated 4261 blocks behind: scores may be late (block 16421719)" | `behind` 4205, head 16421819 (the GETs were taken shortly after the UI read, about 100 blocks later) |

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

## Part B (automated): sign-up failed on Cartridge's side, no account exists

Run of 2026-10-12, headless on the VPS, `scripts/e2e-sepolia/part-b.mjs` (same Playwright 1.63.0 and chromium headless shell 1243
as part A), with the Overseer's relay of the owner's go: **one** throwaway Cartridge controller account on Sepolia, created with a
virtual WebAuthn authenticator (CDP `WebAuthn.enable`, `addVirtualAuthenticator`: ctap2, internal, resident key, user verification),
for this run only, nothing kept. The authenticator is added to the browser context only after the go (`--confirmed`); without that
flag the driver stops at the username screen, as part A did. Peak RSS of each run 112 to 116 MB (`/usr/bin/time -v`, heap cap
384 MB, about 15 s to 2 min wall).

**Result: no account was created. Steps 3 to 8 of part B (Create Account, Daily purchase, moves, indexer comparison, the origin
and "unverified" policies text) were not reached.**

### Usernames

| Name | Characters | Result |
|---|---|---|
| `paved-d16-20261012-6446` | 23 | **Rejected by the keychain**: "Username cannot exceed 19 characters"; `SIGN UP` stayed disabled. Nothing submitted. |
| `d16-20261012-6446` | 17 | Accepted: "Welcome! Let's create a new Controller", `SIGN UP` enabled. The name offered "Create New" before every attempt, so it was never registered. |

**The keychain refuses a username longer than 19 characters.** Use at most 19 (the driver now checks it). The name is also the player name for Create Account (not reached).

### What happened, in order (UTC, 2026-10-12)

1. Name of 23 characters (two launches): `SIGN UP` disabled with the error above. Evidence: `docs/client/sepolia-controller-run/part-b-attempt1-long-name/`.
2. Name of 17 characters: the name was accepted but the driver's click on `SIGN UP` timed out four times (a selector by accessible name; fixed
   to select by visible text with a mouse-click fallback). Nothing submitted; no evidence kept for this run.
3. About 08:19: the click worked. The keychain showed a method chooser, **"Create Controller": SMS / PASSKEY / OTHER OPTIONS**. PASSKEY was
   chosen (by command; SMS and Other options were never chosen and nothing was typed into any other field). The keychain then showed
   "Sign Up with Passkey / Authentication failed. Please try again. / Please try connecting again". Evidence: `part-b-attempt2-finalize-failed/`.
4. **08:23:03**: same run, with the driver now choosing PASSKEY itself on that screen (never SMS or Other options): the same failure.
   Evidence: `part-b-attempt3-finalize-failed/`.

### The failure, verbatim

In the username field's error line, both times:

> rpc error: code = Internal desc = internal server error

followed by the keychain's echo of its own GraphQL request and response, which is **removed from the evidence** (it carried the passkey
registration). The echo showed the operation, `"path":["finalizeRegistration"]` (the mutation `finalizeRegistration`, `network: "SN_SEPOLIA"`),
with HTTP 200, `data: null`, `errors[0].message` equal to the text above. Dialog text under it: "Authentication failed. Please try again." and
"Please try connecting again".

### Keychain screens reached (text)

- Connect (`b02`): "Connect Controller · Enter a Username · By continuing you are agreeing to Cartridge's Terms of Service and Privacy Policy · LOG IN".
- After a new name: the name, "Create New", "Welcome! Let's create a new Controller", `SIGN UP`.
- After `SIGN UP`: "Create Controller": `SMS`, `PASSKEY`, `OTHER OPTIONS` (a screen the by-hand steps below do not mention: choose the passkey method).
- After `PASSKEY`: the failure above.
- Never reached: any text about the origin (`paved.bal7hazar.com`), the "unverified" marking of the session policies, the spending-limit screen.
  The question of #295 (is the origin refused?) is therefore **still open**: no refusal text about the origin was seen, and none of the
  screens before the failure mentions it.

### The two `Unauthenticated ... access denied` console errors

Still present, and now placed: they are raised by `x.cartridge.gg/assets/index-*.js` as soon as the keychain iframe opens after
Connect (not at page load as part A suggested, where Connect was already pressed), before any sign-up. They are not caused by an
account, a session or the client's policies. They stayed through the failed sign-ups. Whether they disappear once connected could not be checked.

### What this shows and does not show

- Shows: the client reaches the keychain; the keychain accepts the origin up to sign-up; the headless browser with a virtual authenticator
  produces a passkey credential and the keychain sends the registration; Cartridge's `finalizeRegistration` then fails with an internal server error, twice, 4 minutes apart.
- Does not show: whether the cause is this origin, the virtual authenticator's attestation (a software authenticator), or a Cartridge outage on Sepolia.
  Only one name and one browser were tried; no other origin or network was (outside the gate). It says nothing about the client's code or
  policies, which were never reached. A retry later may pass; by hand with a real passkey is the way to tell the causes apart.
- No account exists. The credential lived only in the closed browser context. Nothing was signed or sent to Sepolia.

### Evidence handling

Texts and screenshots only; no request body, header, cookie, storage, credential id, key or signature is written. URLs lose their query and
fragment; long hex and token-like strings are scrubbed; the keychain's echoed request is removed (the driver now does it, and it was removed
by hand from the two files that kept it before that change: `part-b-attempt2-finalize-failed/` and `part-b-attempt3-finalize-failed/`).
Each folder holds `part-b-run.json` (console, requests by host and path, frames, screens), `bNN-*.jpg`, `bNN-*.txt`.

Fallback: the owner's by-hand run below. **One more automated attempt is planned**, in the same confirmed scope: the same name
`d16-20261012-6446`, passkey only (never SMS), at most one account, not before 12:23 UTC on 2026-10-12, started only on the PM's
prompt. If `finalizeRegistration` fails the same way, the automated attempts stop for good and that is recorded; no other variant
(another origin, another authenticator) is tried. If the owner's by-hand run comes first it supersedes that attempt. Its results go in a
follow-up PR.

## Part B (needs a Cartridge account): not run

This section is kept as it was written; its steps were not reached by the automated run above.

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
   create the account, or log in to an existing one. **The username must be at most 19 characters**: the keychain refuses a longer
   one ("Username cannot exceed 19 characters") and keeps `SIGN UP` disabled. After `SIGN UP` a "Create Controller" screen offers
   `SMS`, `PASSKEY` and `OTHER OPTIONS`: choose **PASSKEY** (never SMS). **Capture** the screens that follow, in particular:
   - any text naming the origin (`paved.bal7hazar.com`), such as "wants to connect" or a warning about an unknown or
     unverified site;
   - the session approval screen: whether the policies are marked unverified, the list of contracts and methods
     (`Account.create`, `Daily.spawn/build/discard/surrender/claim/sponsor`, `Tutorial.*`, `MockUSDC.mint`, one `approve` on the
     entry token with a spender and a cap) and the spending-limit text;
   - any refusal or error line, copied word for word.
   Approve the session. The top bar should now stop saying "Read only".
3. **Create Account (the client's own step).** After Connect the app offers "Create Account" with a player name. Enter a
   player name and approve. On Sepolia this one transaction already mints 100 USDC (`MockUSDC.mint` then `Account.create`). **Capture**
   the transaction hash (Voyager or Starkscan link, or the controller's toast) and the Token card's balance, which becomes 100 USDC.
   Note whether it prompted for a signature (`Account.create` and `MockUSDC.mint` are session policies). This is the brief's one mint of 100 USDC.
4. **Faucet (optional extra).** On the Token card, Mint adds 100 more USDC (balance 100 to 200). Skip it unless a second
   purchase needs the funds. **Capture** the balance and the transaction hash; it should not prompt, as `MockUSDC.mint` is a session policy.
5. **Buy one Daily game.** On the home page open the Daily card ("Daily Challenge"), pick a stake, press "Buy for ...", and confirm (the client approves USDC, then buys). **Capture** the price shown,
   whether a prompt appeared for the `approve` (it should not: it is within the session cap), and the tx hash(es).
6. **Play a few moves.** Place about five tiles. **Capture** one screenshot of the board and the tx hash of at least one move;
   note whether any move prompted. Then end with "Surrender" (a finished game counts in the leaderboard) or leave it open.
7. **Afterwards, check the indexer.** The indexer is behind: wait until `GET https://api.paved.bal7hazar.com/v1/head` shows
   `"behind"` close to 0 (it was 4261 on 2026-10-11 and falls with time). Then, with the player id (the account
   address, shown by the controller; it must be `0x` plus all 64 hex digits, a shortened or unpadded address answers 400)
   and the game's id:
   - head and lag: `GET https://api.paved.bal7hazar.com/v1/head`
   - today's day: `GET https://api.paved.bal7hazar.com/v1/tournaments?limit=1` (the first `id`, 20737 for 2026-10-11 UTC, is `<day>`)
   - the day's summary: `GET https://api.paved.bal7hazar.com/v1/tournaments/<day>`
   - the leaderboard: `GET https://api.paved.bal7hazar.com/v1/tournaments/<day>/leaderboard?limit=20`
     (your player name from step 3, not the Cartridge username, should appear with `games_played` of at least 1, and `best_score` rising once you finish a game)
   - your player: `GET https://api.paved.bal7hazar.com/v1/players/<player_id>` and `GET https://api.paved.bal7hazar.com/v1/players/<player_id>/games`
   - the game: `GET https://api.paved.bal7hazar.com/v1/games/daily/<game_id>` (the contract is the name `daily`, not an address)

   Compare with the UI: "Leaderboard" on the home page must show the same rank, score and games.
8. **Send back**: the screenshots of steps 2 to 6, the copied keychain text about the origin and unverified policies, the tx
   hashes of Create Account, purchase and one move, and the JSON answers of step 7.
