# The Joust (client)

The weekly allegiance event, from the design proposal of 2026-11-09: an allegiance against an allegiance over a weekend. This note
says what the client runs today. Nothing is on chain: the whole event is the mock ledger's (`VITE_DATA_SOURCE=mock`), and on `chain`
Play shows no Joust card.

## The calendar

One joust every week (the owner's ask of 2026-11-10, in place of the proposal's two a season): a new one starts when one ends.

| When (UTC) | What |
|---|---|
| Monday 00:00 to Thursday 24:00 | Registration, by an Officer or the Leader. Last week's result is shown, its Cobbles claimed. |
| Friday 00:00 | The draw: the registered allegiances are paired inside bands of 100 rating points. |
| Friday 00:00 to Sunday 24:00 | The joust: each member plays up to 3 games; their best counts. |

Roads and cities are doubled in turn, a week each.

## The rules (`packages/game-core/src/joust.ts`)

- A game is a Training game's 38 tiles on the day's deck (every jouster's cards the same that day, each in an order of their own), with
  the week's boost (`EngineConfig.boost`): `roads`, a road scores on the city's base; `cities`, a city scores double.
- An allegiance's score is the sum of its 10 best jousters' bests. A tie goes to the 11th best, then to the jousters who played. A
  total of zero is a loss.
- Rating: an Elo from 1,000, K 32. A bye moves no rating and pays as a win.
- Rewards: 50 Cobbles to each jouster who played on the winning side, 15 on the other. No XP, no chest.
- A member who joined after Friday 00:00 does not joust that week; a player jousts for one allegiance a week.

## Where it lives

- Rules: `packages/game-core/src/joust.ts`; the boost in `engine/game.ts` and `sessions/seeded-challenge.ts`.
- Source and hooks: `packages/app/src/data/joust-source.ts`, `joust.ts`. A game's session is the Puzzle's (`useSeededSession`).
- Mock: `packages/app/src/data/mock/joust.ts` (pure), run by `MockLedger` (`joust*` methods), given by `mockJoust`. The seeded
  allegiances register by themselves and their members' games are drawn; every week since the mock's first is played again at each
  read.
- Pages: `/play/joust` (a view of Play's drawer; `?view=top`, `?view=ranking`), `/joust/:gameId`, `/joust/:gameId/over`.
- Scenes: `scenes/joust-scene.tsx`, `containers/joust-end.tsx`, the card in `containers/play-modes.tsx`.

## Not done

- Contracts and indexer: none.
- Seasons: the ratings are never pulled back toward 1,000, and the ranking has no season. Holidays and the Conquest move nothing.
- The Joust tab of Ranking: the ranking is a view of the Joust (`/play/joust?view=ranking`).
- The opponent's reveal as its own screen: the match card shows the opponent and the expected result.
- The card's icon (the crossed banners): the card shows the two allegiances' emblems; its scene is the proposal's hero image.
