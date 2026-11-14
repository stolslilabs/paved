# The Masterpiece (client)

The weekly individual building event, from the design proposal of 2026-11-09: one board, one week, one structure. This note says what
the client runs today. Nothing is on chain: the whole event is the mock ledger's (`VITE_DATA_SOURCE=mock`), and on `chain` Play shows
no Masterpiece card.

## The calendar

One Masterpiece every week (the owner's ask of 2026-11-10 for the weekly events, in place of the proposal's weeks 3 and 7 of a
season): a new one starts when one ends.

| When (UTC) | What |
|---|---|
| Monday 00:00 | The week's board opens: the first twelve tiles wait. Last week's result is shown, its Cobbles claimed. |
| Every day 00:00 | Twelve new tiles: the same cards for every builder, each board in its own order. A missed day's tiles wait, in day order. |
| Sunday 24:00 | The board freezes; the tiles not played are lost, with no penalty. The next week's board opens. |

The four seasons' kinds come in turn, a week each: the city (winter), the road (spring), the crowned wonder (summer), the forest
(autumn). The proposal's kind is the calendar season's; the client's turn lets every kind be played within a month.

## The rules (`packages/game-core/src/masterpiece.ts`)

- A board is a Training board with no deck of its own: the week's 84 tiles, one in hand at a time, laid by the engine's rules or
  discarded. A day's twelve cards are drawn from the base deck (its 72 less the starter's) by the day's seed, and are public once
  the day opens; a board draws each day's twelve in an order from its own seed.
- The masterpiece is the closed structure of the week's kind that scores the most (the larger at equal points). Its points are the
  engine's own for that structure. A later closing that scores more replaces it; every other structure counts for nothing.
- The crowned wonder: a completed wonder and the closed road, city or forest that scores the most among those with an area on one
  of the wonder's nine tiles, their points added; its size is the wonder's nine tiles plus that structure's size.
  An open wonder's "if closed now" is read the same way: nine tiles and the best structure already closed on its tiles laid so far.
- The score is the masterpiece's points less 50 a discard, never under zero. A discard never brings another card.
- The ranking counts a masterpiece of 8 or more (the engine's size). Order: the score, then the size, then the earlier closing.
- Tiers, by place among the week's counted masterpieces (each share rounded up, the kinder side): top 1 % 300 Cobbles, top 5 % 150,
  top 20 % 60, top 50 % 20, a counted masterpiece below 5. No XP, no chest. Claimed from the next Monday.

## What was read into the proposal

- "Size" is the engine's size of a structure (the figure its points are computed from), for the floor of 8, the ties and the pages.
- "The largest closed structure touching" a wonder is read as the best-scoring closed structure lying on one of its nine tiles.
- The claim asks no level (the proposal names none).
- The first visit's rules are the week's view before the board is opened, not a screen of their own.

## Where it lives

- Rules: `packages/game-core/src/masterpiece.ts` (`Masterpiece`, a village's game on the engine with no territory).
- Source and hooks: `packages/app/src/data/masterpiece-source.ts`, `masterpiece.ts`; the board on the page, `masterpiece-game.ts`
  (each move applied at once and sent in order, as a Puzzle game's; midnight opens the next tiles on an open board by itself).
  The week's reads are read again at each UTC midnight on a page kept open (a new day's tiles, Monday's new week); the gold
  button goes straight to the board only when the state read is this week's.
- Mock: `packages/app/src/data/mock/masterpiece.ts` (pure), run by `MockLedger` (`masterpiece*` methods), given by `mockMasterpiece`.
  The other builders are drawn: 360 to 600 a week, four in five with a counted masterpiece closed at a time of the week (a modest
  one first, a larger one later), so the ranking and its bars move while the week runs.
- Pages: `/play/masterpiece` (a view of Play's drawer; `?view=ranking`), `/masterpiece` (the board).
- Scenes: `scenes/masterpiece-scene.tsx`, `containers/masterpiece-strip.tsx` (the board's strip), the card in
  `containers/play-modes.tsx`.

## Not done

- Contracts and indexer: none. So no on-chain histogram (96 buckets, 5 % apart) either: the mock ranks every builder exactly.
- Seasons: weeks 3 and 7, the season's record of its two weeks, holidays and the Conquest move nothing.
- The Hall: the mock keeps each kind's best of the last eight weeks; nothing is engraved, no board replays move by move, no laurel
  on a profile.
- The week's tiles as a page of cards by day (the proposal's fourth screen): the week's view counts each day's tiles played, and the
  board's deck sheet lists the cards of the days opened.
- The spread's histogram on the ranking, and the builders' profiles from a line of it.
- The card's icon: the card shows the day; its scene is the proposal's hero image.
- A calibration of the figures (the floor of 8, the discard's cost, the tiers and their Cobbles): they are the proposal's.
