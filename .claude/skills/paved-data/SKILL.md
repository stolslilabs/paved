---
name: paved-data
description: How game data is read and written in the Paved client v2. Use for work under packages/app/src/data, the sessions in packages/game-core/src/sessions, or the wiring of a page to data (hooks, query keys, sessions, fakes, hook tests).
---

# paved-data

`docs/client/v2-architecture.md` section 3.3 is the design ("As built (P2)" says what exists); this skill is the rules to
follow. The data layer is `packages/app/src/data/`; the sessions are `packages/game-core/src/sessions/`. Paths below are
relative to `packages/app/` unless they start with `packages/`.

## Three owners of state

| State | Owner | Where |
|---|---|---|
| Server state (chain views, events, the indexer) | TanStack Query | `src/data/chain.ts`, `src/data/indexer.ts` |
| The game in play | a session, outside React | `LocalSession`, `TutorialRun` in `packages/game-core/src/sessions/`; `useTrainingSession` in `src/data/training.ts` reads it with `useSyncExternalStore` |
| Local settings | `localStorage` | the Training save (`TRAINING_KEY`), the tutorial save, the `welcomed` flag |

Do not copy a query's data into `useState` or a session. The query cache is not persisted.

## Hooks

- A hook gets its sources from `useDataSources()` (`src/data/sources.tsx`): `views`, `events`, `economy`, `pool`,
  `indexer`, `store`. It never builds a client itself. The app does not mount `DataProvider` yet (only the tests do, through `renderData`):
  the page wiring adds it with the real `PavedClient`, `EconomyClient` and indexer client, so do not assume it is mounted.
- **Each hook returns the type its scene's prop takes**; where the indexer's type differs, the hook maps it
  (`usePlayerQuests` joins the definitions' schedule). `src/data/scene-types.ts` has the compile-time check
  (`Expect<Equal<...>>`, no runtime code): a new hook gets a line there, and `tsc -b` fails on a drift. A scene still
  takes plain props and imports no data code (`paved-ui`).
- A read that needs an id takes `null` and is disabled (`enabled: gameId !== null`), not called with a placeholder.
- An economy read answers `null` without an economy deployment; the scene type is `T | null` (`OrNull` in `scene-types.ts`).
- **`isPending` and `error` go together.** A hook that joins several queries (`usePlayerStatus`, `usePlayerQuests`)
  reports `isPending: !ready && !error`, so a failed read ends the wait. A page shows its error state from `error`, not an
  endless loading scene. `__tests__/data-indexer.test.tsx` ("stop pending when a read fails") checks the two joined hooks.
- `staleTime` is per read: `Infinity` for a closed economy day (`useEconomyDay`) and a closed day's leaderboard (`useLeaderboard`), `0` otherwise.

## Query keys

- Every key is in `src/data/keys.ts` (`queryKeys.chain`, `.indexer`, `.local`): `[domain, read, ...args]`. A hook never
  writes a key inline; a new read adds its key there.
- **Never a bigint in a key.** TanStack hashes keys with `JSON.stringify`, which throws on a bigint. Keys hold numbers and
  strings: an address goes through `addressKey()` (lower-case hex, no leading zeros, so `0x05f1` and `0x5f1` share an
  entry), an amount in base units as a decimal string (`poolQuote(usdcIn: string)`).

## No polling

- No hook sets `refetchInterval`, and none polls on a timer; that holds by grep today, not by a test. Refetch triggers
  are window focus and the user's action (and, once writes land, a write's receipt). `__tests__/data-chain.test.tsx`
  ("does not poll") checks, for `useGame` only, one read per key within 50 ms of the first answer.
- How a write will update data (design, section 3.3): its receipt events go into the cache by key with `setQueryData`, then
  one `invalidateQueries` on the key for the reconciling read. Main has no write yet, so nothing calls them today.

## Sessions in game-core

- A session **keeps its engine between moves** and replays only to resume (and the tutorial on Back, the engine having no
  undo). Do not rebuild the engine per move. `packages/game-core/__tests__/sessions.test.ts` ("sessions keep their engine between moves")
  checks `LocalSession` and `TutorialRun`; `data-training.test.tsx` checks `useTrainingSession` resumes once, then applies
  a move without a replay.
- **The save formats stay byte for byte**: `paved:training:v1` (`packages/game-core/src/sessions/training-storage.ts`) and `paved.tutorial.v1`
  (`packages/game-core/src/sessions/tutorial-storage.ts`). A save written by an older build must resume. `packages/game-core/__tests__/sessions.test.ts` ("saves written before the
  move") resumes a Training game and a tutorial and checks the bytes written next. A format change is a new key and a
  migration, never an edit in place.
- **game-core imports nothing from `@paved/chain`**: the chain depends on game-core. `packages/game-core/src/sessions/types.ts` holds structural
  copies (`BoardTile`, `PlaceMove`, `ScoredStructure`, `PageState`, `PageSession`); the chain's `GameSession` satisfies
  `PageSession` unchanged. No code passes a `GameSession` as a `PageSession` since app-web left (P-70), so `tsc` no
  longer catches a drift: change a copy when the chain's shape changes.

## Tests and fakes

- Hook tests are `__tests__/data-chain.test.tsx`, `data-indexer.test.tsx`, `data-training.test.tsx`. They render the
  hook with `renderData` and `fakeSources()` (`__tests__/data-fakes.tsx`): `FakeGameViews` (from `@paved/chain`), and
  `FakeEconomy`, `FakePoolQuoter`, `FixtureIndexer` (from `@paved/chain/testing`, which is not in the main entry), with
  the Training save in a `memoryStore()`. A read that must fail wraps the fixture's `fetch` (see the "stop pending" test).
- Use the mocks of `src/mocks/` for values (`GAME_PLAYING`, `PLAYER_ID`), not a new ad hoc shape.
- Test a new hook the same way: its values on the fakes, and a failing read when it joins several queries.
- Test commands. The `@paved/app` cap is from `packages/app/README.md`; game-core and chain are from `AGENTS.md` ("Node test peaks"):
  - `NODE_OPTIONS=--max-old-space-size=832 bun run test --filter @paved/app`
  - `NODE_OPTIONS=--max-old-space-size=384 bun run test --filter @paved/game-core`
  - `NODE_OPTIONS=--max-old-space-size=448 bun run test --filter @paved/chain`

## Mock data (MOCK-FIRST)

- `VITE_DATA_SOURCE=mock|chain` (`src/data/data-source.ts`, its rule in `src/data/source-of.ts`) is the one switch; unset,
  Sepolia is `mock`. Since #927 `mock` serves every read and write from `MockLedger` (`src/data/mock/ledger.ts`) through the
  overlays of `src/data/mock/overlay.ts`, over `offline` parts (`src/data/mock/app.ts`): nothing is sent to a node or an
  indexer, and a mock build carries no starknet.js (`vite.config.ts`). Never add a second switch or a per-page mock.
- A new read or write: add it to `MockedReads` or `MockedWrites`, implement it in `MockLedger` with the contract's checks and
  receipt events, list it in the overlay (else the mock refuses it, `not-configured`), and add its flow to the parity tests of
  `__tests__/data-mock.test.tsx` (the same hook on `chain` and `mock`). `__tests__/mock-no-fetch.test.ts` fails if a mock read
  or write makes a request.

## Writes (not in the app yet)

P5, P7 and P10 add them. They go through `@paved/chain`'s writers (`PavedWriter` in `packages/chain/src/writer.ts`,
`EconomyWriter` in `packages/chain/src/economy/writer.ts`), never a raw account call from a component. A refusal is a typed
error (`WriteError` and its subclasses such as `SpawnPausedError`, `GameExpiredError`), so the page tells the player what
happened instead of showing a revert string. Read the writer's own doc comments for each error's meaning.
