# The Colossus (client)

The weekly collective event, from the design proposal of 2026-11-10: one site for the whole server for one week, three tiles a day each,
every closed structure setting its tiles as stones of the monument, a gauge that pays every builder and a top 10 paid on top. This note
says what the client runs today. Nothing is on chain: the whole event is the mock ledger's (`VITE_DATA_SOURCE=mock`), and on `chain`
Play shows no Colossus card.

## The calendar

One Colossus every week (the owner's ask of 2026-11-10 for the weekly events, in place of the proposal's week 4 of a season): a new
site opens when one closes.

| When (UTC) | What |
|---|---|
| Monday 00:00 to Sunday 24:00 | The site is open. Each day at 00:00 brings every builder 3 tiles. A tier is claimed from the time it is reached. |
| From the next Monday | Last week's plaque is shown, its tiers and its top 10 claimed, beside the new week's site. |

The four seasons' monuments come in turn, a week each (the Citadel, the Great Road, the Colossal Wonder, the Sacred Wood), whatever
the real season.

## The rules (`packages/game-core/src/colossus.ts`)

- **The site.** A heart of 16 by 16 cells and districts of 8 by 8 around it, in rings: `2 x rings + 2` lots a side, the four middle
  ones the heart. Each board starts with 28 tiles and 36 holes for 64 cells. The size follows the builders of the last Colossus, 10
  holes each (`colossusRingsFor`, `colossusSize`: the proposal's table). The mock's site has one ring: 12 districts, 1,024 cells.
- **The wall.** A wall runs round the heart and every district: an edge facing it counts as closed (`Board.wall`, an option of the
  engine's structure state that no other game sets). A full board has no open structure, so all its tiles are stones.
- **The hand.** 3 tiles a day from the day's seed and the player's address (`colossusRation`), drawn from the 72 cards of the base
  deck. A day's tiles wait until the next day's end: 6 in hand at most. No discard: a tile left expires at no cost.
- **Placing.** A hole, a side neighbour, the same edge on every side. The heart takes tiles once the gauge reached 50%.
- **Fair play.** The enclosure rule: a tile may not close a neighbouring hole on its fourth side unless a card of the deck still fits
  it. The pair rule: it may not leave two facing holes that no pair of cards fills. Of the 81 ways to close a hole on four sides, 26
  fit no card (`colossusFitting`, tested).
- **The seal.** A hole that no card can take under these rules becomes a wall, and the structures round it can close.
- **Stones.** When a structure closes (a road, a city, a forest, a wonder with its eight neighbours), each of its tiles not yet
  counted becomes a stone, the pre-built ones included, to the builder whose tile closed it. The gauge is the stones over the site's
  cells; 100% is every hole filled.
- **Rewards.** The tiers at 25, 50, 75 and 100%: 10, 15, 20 and 30 Cobbles to every builder who laid at least one tile that week,
  whenever the tier came. The top 10 by stones set: 150, 100, 75, then 50 each, a tie to the earlier total. No XP, no chest.
- **The name.** 9 tiles in the week: the scene says the builder's name wears the season's stone (the chat does not draw it yet).

## The mock (`packages/app/src/data/mock/colossus.ts`)

The community's first 56 players are the server's builders. Each tries about seven in ten of their tiles, at a time of day of their own
(the day the tile comes, and once more the day after when it fitted nowhere), where the site hints: the legal placement that touches
the most tiles (`Colossus.suggest`). A week's site is played again from its start, the device's accounts' stored tiles among the
builders' by their times, kept in memory and moved on as the clock does; a whole week takes about 0.1 s. With that pace the heart
opens around Wednesday or Thursday and the site is complete, or nearly, by Sunday.

## Where it lives

- Rules: `packages/game-core/src/colossus.ts` (`Colossus`, `ColossusBoard`); the wall in `engine/structures.ts`.
- Source and hooks: `packages/app/src/data/colossus-source.ts`, `colossus.ts`.
- Mock: `packages/app/src/data/mock/colossus.ts` (pure), run by `MockLedger` (`colossus*` methods), given by `mockColossus`.
- Page: `/play/colossus`, a view of Play's drawer; its builders (`?view=builders`) and a board (`?lot=`, 0 the heart) are views of it.
- Scenes: `scenes/colossus-scene.tsx`; `containers/colossus-site.tsx` (the gauge, the map), `colossus-board.tsx` (a board and the
  hand), `colossus-plaque.tsx` (last week's result, the builders' list); the card in `containers/play-modes.tsx`.

## Read differently from the proposal

- Every board is drawn from the week's seed (a whole legal tiling, less its holes, the season's kind of tile favoured); the proposal
  has a hand-drawn heart and eight hand-made district templates per season.
- The structures the pre-built tiles already close are stones of nobody from Monday (about 12% of the site), so that 100% stays "every
  hole filled".
- The seal is applied at once, after the tile that makes a hole dead, by nobody's call; a sealed hole counts as a stone of nobody.
  The proposal lets anyone call it.
- A forest's stones are set when the forest closes, whatever the roads along it (the engine scores a forest only once those roads
  are closed).
- A hard hole is a hole closed on its four sides that one or two of the 72 cards fit; the state lists the five hardest, with the
  builders who hold a fitting tile today.
- A hand's draw mixes the day's seed and the address by a plain hash (one Poseidon a day); on chain, a Poseidon of both.
- Claims: this week's tiers and last week's tiers and place. A week older than the last is not kept.
- The board is drawn in the drawer as a grid of tiles seen from above (the hand's chips), not on the 3D board; the heart is shown a
  quarter at a time.

## Not done

- Contracts and indexer: none (`open_day`, `raise`, `place`, `seal`, `claim`; the engine's wide tile ids).
- The season's calendar: week 4 of each season, the holidays' weeks, the Conquest.
- The name in the season's stone and the plaque's gilded names in the chat and on the profile; the Colossus's mark beside a name.
- The archive: a past week's board and its replay; the plaque drawn at the heart of the monument.
- The rules shown as their own screen at the first opening (they are a section of the site's view).
- Two builders taking the same hole at the same moment: on the device there is one writer.
- A site sized from the last week's builders: the mock's is always one ring.
- The card's icon; its scene is the proposal's hero image.
