# The Expedition (client)

The weekly individual event, from the design proposal of 2026-11-09: one board for the whole week, six tiles a day, four landmarks to
reach, four score tiers and no ranking. This note says what the client runs today. Nothing is on chain: the whole event is the mock
ledger's (`VITE_DATA_SOURCE=mock`), and on `chain` Play shows no Expedition card.

## The calendar

One expedition every week (the owner's ask of 2026-11-10 for the weekly events, in place of the proposal's first week of a season): a
new one starts when one ends.

| When (UTC) | What |
|---|---|
| Monday 00:00 to Sunday 24:00 | The board is open. Each day brings 6 tiles, drawn at the day's first visit. |
| From the next Monday | The week's tier is shown and its Cobbles claimed, beside the new week's map. |

The four seasons' maps come in turn, a week each (winter, spring, summer, autumn), whatever the real season.

## The rules (`packages/game-core/src/expedition.ts`)

- **The ration.** 6 tiles a day, the hand holds 12. The board keeps the last day it drew; a draw brings the rations due since then, up
  to 12 in hand, and the rest is lost. The whole hand is in view and laid in any order.
- **The bag.** 42 cards, the same for every explorer of the week, each board drawing them in an order of its own (its seed). The bag
  holds the cards the map's objectives need, then cards of the base deck kept by the week's seed.
- **The map.** 11 by 12 cells, the camp (a game's starter) at its centre row, the landmarks written at the start. A cell outside takes
  no tile. Every map has the two villages on the camp's road, the ruin and the old crossroads; the season's landmark is the farthest:
  the ruined citadel (winter), the old road (spring), the great wonder (summer), the sacred wood (autumn).
- **The trail.** A tile is laid next to the camp, a tile already laid or a landmark already reached, and matches every tile it touches.
  A landmark is reached by a tile laid against one of its tiles; until then it anchors nothing.
- **The objectives.** Reach the old crossroads (+300), surround the ruin (+600), link the two villages by one closed road (+900), the
  season's landmark (+1,500). A bonus is added once, beside the structure's own points.
- **The score.** The board's structures as in a Training game, less 50 per discard, plus the bonuses.
- **The tiers.** Scout 4,000 (20 Cobbles), Pathfinder 6,000 (40), Explorer 8,000 (70), Cartographer 10,000 (100). The highest tier
  reached pays, claimed from the next Monday at level 3. No XP, no chest.

The board is a village's game on the engine (`EngineGame.village`: tiles given one by one, the map's cells as its territory); the
engine itself is unchanged.

## Where it lives

- Rules: `packages/game-core/src/expedition.ts` (`Expedition`, its log played again).
- Source and hooks: `packages/app/src/data/expedition-source.ts`, `expedition.ts`; the board on the page, `expedition-game.ts`
  (`ExpeditionGame`: the hand's pick is the tile the board places, each move applied at once and sent in order).
- Mock: `packages/app/src/data/mock/expedition.ts` (pure), run by `MockLedger` (`expedition*` methods), given by `mockExpedition`.
- Pages: `/play/expedition` (a view of Play's drawer), `/expedition` (the account's board of the week).
- Scenes: `scenes/expedition-scene.tsx`, `containers/expedition-hand.tsx` (the board's strip), the card in
  `containers/play-modes.tsx`; the board is the boards' scene (`BoardScene`, mode `expedition`).

## Read differently from the proposal

- One map per season, not four drawn in turn; the seasons come by the week, not by the calendar.
- The bag always holds the cards the map's objectives need; the proposal checks each layout with a planning bot instead.
- The sacred wood's grove is a wonder tile (the deck has no plain forest tile): closing its ring also scores the wonder's 900.
- The board's whole order is drawn at its first visit from its seed; on chain each day's ration is drawn at that day's first call.
- The result's shares ("78 % reached the crossroads") and its count of explorers are drawn from the week: no other explorer plays.

## Not done

- Contracts and indexer: none.
- The season's calendar: week 1 of each season, the holidays' weeks, the Conquest.
- The week's map shown as a picture before the first visit (its landmarks are listed), and the landmarks marked on the board (the
  strip names them and what is done).
- The distance to each landmark ("3 tiles away") and the bag left by kind; the board's deck sheet lists the week's bag.
- The profile's journal stamp for a season's landmark closed.
- The card's icon; its scene is the proposal's hero image.
- Unclaimed tiers older than last week: the view shows last week's result only.
