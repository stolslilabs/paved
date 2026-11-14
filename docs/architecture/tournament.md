# The Tournament (client)

The weekly individual event, from the design proposal of 2026-11-09: knockout duels on the same cards, in brackets of 64. This note
says what the client runs today. Nothing is on chain: the whole event is the mock ledger's (`VITE_DATA_SOURCE=mock`), and on `chain`
Play shows no Tournament card.

## The calendar

One tournament every week (the owner's ask, as for the Joust, in place of the proposal's weeks 3 and 8 of a season): a new one starts
when one ends.

| When (UTC) | What |
|---|---|
| Monday 00:00 to 24:00 | Registration, in the player's league group. Last week's run is shown, its Cobbles claimed. |
| Tuesday 00:00 | The draw: the small groups are carried down, each group's brackets are drawn. |
| Tuesday to Sunday | One round a day, the round of 64 to the final. One game each, any time that day. |
| The day after a player's last match | Their Cobbles are claimed (a champion's on Monday). |

## The rules (`packages/game-core/src/tournament.ts`)

- A league group is a league's name (nine, Wood to Grand Master). A group with fewer than 16 registered players joins the group below,
  with those it carries (`tournamentGroups`).
- A group fills as few brackets of 64 seats as hold it, balanced (150 players: 3 brackets of 50). The players are shuffled and seated
  by the reversed bits of their turn (`tournamentDraw`, `tournamentSeatOf`), so the empty seats are spread out. No seeding.
- A duel is one game each of the round's 38 cards (every player's cards the same that round, each game in an order of its own), with no
  seasonal bonus. The higher score goes through; at an equal score, the earlier game; not playing loses to any game
  (`tournamentWinner`). A move past the round's end is refused; an unfinished game counts with its score at its last move, and only the game of the round still to decide resumes (Play then starts the next round's).
- A seat left empty by the draw is a bye: the player opposite skips the round. A seat left empty by a match nobody played is not: the
  player opposite goes through only by playing the round's game (`tournamentDuel`).
- Rewards: the Cobbles of the last round reached (5, 10, 20, 40, 80, 150; the champion 300), for a player who played at least one
  game. No XP, no chest.

## Where it lives

- Rules: `packages/game-core/src/tournament.ts`.
- Source and hooks: `packages/app/src/data/tournament-source.ts`, `tournament.ts`. A game's session is the Puzzle's (`useSeededSession`).
- Mock: `packages/app/src/data/mock/tournament.ts` (pure), run by `MockLedger` (`tournament*` methods), given by `mockTournament`. The
  community's players and a field of the mock's own (drawn names, no profile: 34 in Wood down to 2 in Grand Master, so the top groups
  are carried down) register by themselves and their games are drawn; the week is played again from its registrations at each read.
- Pages: `/play/tournament` (a view of Play's drawer; `?view=bracket&week=`, the bracket of that week's run), `/tournament/:gameId`, `/tournament/:gameId/over`.
- Scenes: `scenes/tournament-scene.tsx`, `containers/tournament-end.tsx`, the card in `containers/play-modes.tsx`. The board is the
  Puzzle's (`PuzzlePlay` in `routes/pages/board.tsx`), its meter the opponent's score when they played first.

## Readings of the proposal

Where the proposal leaves a rule open, the client takes the simplest reading:

- "Round of 64, played: 5 Cobbles": a player who never played a game claims nothing, whatever round a bye or an absent opponent took
  them to; one who played claims the Cobbles of the last round they were in, even if they did not play that one.
- "The earlier game" at an equal score is the game whose last move came first.
- A seat next to a bye and a vacant seat (a side of the bracket where nobody played) is vacant, not a bye.
- The league is read when the player registers, from their crowns.
- The opponent's score is shown as soon as they have played ("the one who played first gives the later one a target").
- The duel's sides use the Joust's colours (`--info`, `--joust-rival`): no new token.

## Not done

- Contracts and indexer: none. No `register`, `draw`, `spawn`, `settle` or `claim` on chain; the mock settles a round when it is read
  after its day.
- The champion's title in the profile's honours, and the gold frame around the avatar: the result card names the title, nothing else
  shows it.
- Seasons, holidays and the Conquest move nothing: one tournament each week.
- The whole bracket as a drawing: the bracket's view lists the player's path and the last eight.
- The card's own icon: it shows the HUD's trophy; its scene is the proposal's hero image.
- The other brackets of a group, and a ranking of the tournament: a player sees their own bracket.
