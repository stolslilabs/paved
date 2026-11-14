# The Fair (client)

The weekly individual event, from the design proposal of 2026-11-09: the season's deck-building event. A try is a draft, then a game
on the deck drafted. This note says what the client runs today. Nothing is on chain: the whole event is the mock ledger's
(`VITE_DATA_SOURCE=mock`), and on `chain` Play shows no Fair card.

## The calendar

One Fair every week (the owner's ask of 2026-11-10, in place of the proposal's one a season): a new one starts when one ends.

| When (UTC) | What |
|---|---|
| Monday 00:00 to Sunday 24:00 | The Fair: 3 tries a day, the best of the week ranks. Last week's result is shown, its Cobbles claimed. |
| Each 00:00 | The day's tries come back; none is carried over. |

The stall turns with the weeks, a season each: winter (cities), spring (roads), summer (wonders), autumn (forests).

## The rules (`packages/game-core/src/fair.ts`)

- The market is the base deck's 72 cards. A draft is 20 offers of 3 cards of 3 plans, drawn among the cards left (so at the base
  deck's odds); the first of every offer among the season's stall. The player takes one of each: it leaves the market.
- The next offer is drawn with the one on the table and never shows one of its cards. The client does not show it (the owner's
  ask of 2026-11-14: a draft does not show what comes next); a segmented bar shows the draft's progress, its mythics and the offers
  they passed.
- A mythic (a plan with one or two copies: 4 plans, 6 cards) costs two picks: the offer after it passes, the deck holds one tile fewer.
- The game is a Training game on the drafted deck (`EngineConfig.cards`): the starter, then the deck in an order drawn tile by tile,
  with the three-tile queue. The engine's own points, no boost.
- 3 tries a day, one open at a time. A try is spent from its first offer; left during its draft, it scores nothing.
- The ranking is each player's best try of the week, from 1,000 points; a tie goes to the earlier end.
- Rewards: 300, 150, 60, 20 Cobbles for the top 1%, 5%, 20%, 50%, and 5 for a counted try below. No XP, no chest.

## Readings of the proposal

Where the proposal left a rule open, the simplest reading was taken:

- **The starter's card.** The market holds all 72 cards, the starter's own copy included (the stalls' counts of the proposal add up
  to it); the starter on the board is one more.
- **A mythic at the last offer.** No offer is left to pass, so the last offer shows no mythic.
- **A stall sold out** (summer's six wonders): the offer's first card comes from the whole market.
- **A tier's size** is its share of the counted players, rounded up: the first place is always in the first tier.
- **A try open at the week's end** counts nowhere: its draft takes no more pick, its game only a surrender. It does not block the new
  week's tries. A try started one day may be finished another: only its start counts against that day's three.
- **The rules' sheet** is part of the week's view ("How it goes"), not a screen of its own at the first opening.

## Where it lives

- Rules: `packages/game-core/src/fair.ts`; the drafted deck in `engine/game.ts` (`cards`) and `sessions/seeded-challenge.ts`.
- Source and hooks: `packages/app/src/data/fair-source.ts`, `fair.ts`. A try's game is the Puzzle's session (`useSeededSession`). A
  pick is shown at once (the draft replays from the try's seed and its picks), then sent, each naming the offer it answers.
- Mock: `packages/app/src/data/mock/fair.ts` (pure), run by `MockLedger` (`fair*` methods), given by `mockFair`. A try's offers come
  from a mix of its seed, in place of the VRF's. The community's bests of each week are drawn (never played), and a week's champion's
  deck is drafted by a bot.
- Pages: `/play/fair` (a view of Play's drawer; `?view=draft`, `?view=ranking`), `/fair/:gameId`, `/fair/:gameId/over`. The ranking
  has three tabs as the app's bottom navigation: this week (the first places, or the first three and the places around the viewer),
  friends (the mutual follows) and the viewer's own tries.
- Scenes: `scenes/fair-scene.tsx`, `containers/fair-end.tsx`, the card in `containers/play-modes.tsx`.

## Not done

- Contracts and indexer: none. The draws are not the VRF's: a try's offers and its game's order follow from its seed, which the
  client reads.
- Seasons: the stall follows the week, not the calendar's season; holidays and the Conquest move nothing.
- Calibration: every figure is the proposal's (the deck's length, the mythic's price, autumn's stall, the floor, the tiers).
- The ranking's histogram: the bars are read from the whole ranking, and the mock's community is a few dozen players.
- The Fair tab of Ranking: the ranking is a view of the Fair (`/play/fair?view=ranking`). A ranked player's row names their deck's
  size and mythics, not the mythic itself ("the crossroads").
- The game's own header strip (the deck's tiles left by kind, the week's best beside the score): the board shows the try's number,
  the best on the score meter, and the deck sheet lists what is left.
- The stalls' icons. The card's icon is a market basket of its own, not the proposal's stall of three tiles (the owner's ask of
  2026-11-14); its scene is the proposal's hero image. The icon's source is
  `docs/architecture/fair-icon.svg`, rasterised at 256 px to `packages/app/ui-sources/play/mode-fair.webp`.
