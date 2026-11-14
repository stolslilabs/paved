# The Conquest (client)

The season's finale, an allegiance event, from the design proposal of 8 and 9 November 2026: the registered allegiances share one
world cut into squares, a province each and free zones between them; three days of registration, three phases of a week
(Foundation, Awakening, Frontiers), then the results. This note says what the client runs today. Nothing is on chain: the whole event
is the mock ledger's (`VITE_DATA_SOURCE=mock`), and on `chain` Play shows no Conquest card.

## The calendar

The Conquest keeps its length and its phases, and loops (the owner's ask for every event, in place of the proposal's "at the end of
every season"): the next Conquest's registration opens when one ends, so one is always reachable. A cycle is 31 days, counted from
Monday 2 November 2026 00:00 UTC (`CONQUEST_EPOCH_S`).

| When (UTC) | What |
|---|---|
| 3 days | Registration, by an Officer or the Leader. The last Conquest's result is shown, its Cobbles claimed. |
| D1 to D6 | Foundation: explore and build inside the allegiance's own province. |
| D7 | A rest day: nobody builds or explores; Offerings give Knowledge, research stays open. Foundation's result is in. |
| D8 to D13, D14 | Awakening, then its rest day and its result. |
| D15 to D20 | Frontiers: every zone opens. The Offerings and the research end with D20. |
| D21 to D28 | The results: the final rank, the crest, the Cobbles. |

The weekly events (the Joust, the Expedition, the Masterpiece, the Colossus, the Tournament) keep running during a Conquest: the
proposal stops them, the client does not (the owner's "always reachable" rule, read for them too).

## The rules (`packages/game-core/src/conquest.ts`)

- **The world.** A checkerboard of zones of 25 by 25 cells: the smallest odd side (3 at least) whose provinces seat every registered
  allegiance (`conquestSide`). The provinces are the squares of one colour, the corners and the centre among them; the others are the
  free zones. The allegiances take the provinces from the centre outward, the best first (`conquestSeats`). A province has its
  capital in its middle (the allegiance's first tile, a game's starter plan) and two wonders; a free zone has a Great Wonder in its
  middle. The capital's eight neighbours are explored from the start; every other cell is in the fog.
- **The Offering.** One every 2 hours, 1 Knowledge each to the allegiance, 12 waiting at most (a full bowl starts its clock again
  when it is emptied). A member's first Offering of a day of play gives the allegiance one order, when they were a member as the day
  began: 50 a day at most, lost at midnight UTC. Devotion brings them faster, down to one an hour (`CONQUEST_OFFERINGS_A_DAY`).
- **Exploration.** One cell a day per member, on a day of play, in a zone open to the allegiance: its own province in Foundation and
  Awakening, every zone in Frontiers. The cell's Knowledge is drawn then (`conquestKnowledgeAt`, 5 to 100: 11 on average in a
  province, 20 in a free zone) and the cell opens for building, for everyone.
- **Building.** An Officer or the Leader asks for a tile on a cell (`request`): an open zone, an explored and empty cell, next to a
  tile of the allegiance by a side, the same edge on every built side. A request spends no order and replaces the allegiance's
  request on the cell. A member who holds the tile gives it (`give`): it is built at once in their name, spends one order, and pays
  them 1, 2 or 5 Cobbles by rarity. No demolition.
- **The majority.** A closed road, city or forest pays the allegiance with the most tiles in it; a wonder (itself and its eight
  neighbours, 9 tiles) the one with the most of those. A tie pays nobody. A structure still open at the end pays nothing.
- **The points.** `size x base x 1.0235^size`, and the bonus of the winner's branch at the moment the structure closes
  (`conquestPoints`).
- **The tree.** Five branches of ten levels (Roads, Cities, Forests, Wonders, Devotion), 40 to 1,400 Knowledge a level, 4,550 a
  branch, bought in order by an Officer or the Leader from D1 to the end of Frontiers.
- **The rewards.** After each phase and at the end, Cobbles per eligible member by the allegiance's place; the final podium wears a
  Gold, Silver or Bronze crest.

## The mock (`packages/app/src/data/mock/conquest.ts`)

Every allegiance of the guilds' world is in each Conquest, seated by its season's peak Joust rating (`historyOf(...).peaks`, the
Joust's note). The community's members play their part at times drawn for each day (about three in four come, one to three times):
they make their Offerings, explore next to their allegiance's tiles (in Frontiers, sometimes in the free zones round the province),
their Officers buy the cheapest next level and keep up to three requests open where a tile closes the most, and a member who holds
the tile (drawn by rarity) gives it once the request has waited ten minutes. The device's accounts' acts are stored and played
again among the community's by their times: a Conquest is played from its day 1 to the ledger's clock, kept in memory and moved on
as the clock does (a whole Conquest takes about a second). The account gives tiles of its own inventory, less those of its active
village.

## Where it lives

- Rules: `packages/game-core/src/conquest.ts` (`Conquest`, the calendar, the points, the tree).
- Source and hooks: `packages/app/src/data/conquest-source.ts`, `conquest.ts`.
- Mock: `packages/app/src/data/mock/conquest.ts` (pure), run by `MockLedger` (`conquest*` methods), given by `mockConquest`.
- Page: `/play/conquest`, a view of Play's drawer; the map (`?zone=`), the tree, the ranking and the members (`?view=`) are views
  of it. The card and the views' names: `routes/conquest-play.ts`; the page: `routes/pages/conquest.tsx`.
- Scenes: `scenes/conquest-scene.tsx`; `containers/conquest-map.tsx` (the world's checkerboard, a zone eight cells by eight at a
  time, the cell's action), `conquest-tree.tsx`, `conquest-ranks.tsx` (the ranking, the members, a phase's result, the final one);
  the card in `containers/play-modes.tsx`.

## Read differently from the proposal, or where it is silent

- **The calendar loops**, and the weekly events run during a Conquest (above).
- **Registration on the mock.** An allegiance led by an account that did not register is registered as the registration closes, so
  the event stays reachable; the Register button is real during the three days. An allegiance founded after day 1 began waits for
  the next Conquest; a player who joins an allegiance already in is in at once (their order counts from the next day).
- **The seats.** "The season's peak Joust rating places the allegiances" is read as: the best at the centre, then outward by
  distance. The Joust on the client has no season, so the peak is the all-time one.
- **Base points.** The proposal gives the city's (a city of 10 tiles is about 2,500 points: 200 a tile). A road and a forest take
  half (100), a wonder 500, a Great Wonder 2,000: placeholders.
- **A forest** is paid when it closes, whatever the roads along it (as the Colossus reads it).
- **Rewards' figures** are placeholders (an open point of the proposal): a phase pays 150, 100, 75, then 25 Cobbles per eligible
  member; the final rank 400, 250, 150, then 50. A member is eligible for a phase with Offerings on 3 of its days (the proposal
  gives only the 9 days of the whole Conquest, kept for the final rank).
- **Offerings past D20** are lost: Knowledge buys nothing after Frontiers.
- **Exploration** needs no neighbour: "anywhere in the open zones". A province nobody took is closed until Frontiers, and pays a
  province's odds.
- **A request that no longer fits** (the cell was built, an edge changed) is dropped when someone tries to give its tile.
- **Rest days** give no order: nobody builds.
- **Claims.** One Claim pays everything due for a Conquest (its phases over and, from D21, its final rank), for this Conquest and
  the one before it. An older one is not kept.
- **The map** is drawn in the drawer as a grid of tiles seen from above (the hand's chips), eight cells by eight at a time with
  arrows, not on the 3D board.

## Not done

- Contracts and indexer: none.
- The home's Conquest button with its badge and its tip; the entry is Play's card.
- The guild chat's live cards for a request and a tile built: the requests are listed on the Conquest's page and on the map.
- The phases' briefings as their own opening screens (they are a section of the page), and the reveal's animation after an
  exploration (a notice says what was found).
- The crest worn through the next season (the result names it; the allegiance's emblem does not draw it), and the season's calendar
  itself (the Conquest at a season's end, the holidays).
- The Great Wonders hidden until Awakening: they are on the map from day 1 (their zones are closed until Frontiers).
- A member's role of the day the Conquest began: the mock reads the allegiances' rosters as they are now.
- Two members giving the same request at the same moment: on the device there is one writer.
- The painted icons of the proposal (the Offering, the exploration, the gift, the tree's branches): the page uses the HUD's icons.
  The card's scene is the proposal's hero image.
- The figures' calibration by simulation (province size, Knowledge, costs, rewards), the proposal's own open point.
