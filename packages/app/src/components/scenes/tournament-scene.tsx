import type { ReactNode } from "react";
import { TOURNAMENT_CHAMPION_COBBLES, TOURNAMENT_COBBLES, TOURNAMENT_ROUNDS, TOURNAMENT_SEATS, TOURNAMENT_TILES, formatDate, formatInteger, tournamentRoundDay, tournamentRoundName } from "@paved/game-core";
import type { TournamentMatch, TournamentPlayed, TournamentPlayer, TournamentRun, TournamentState, TournamentStep } from "../../data/tournament-source";
import { cn } from "../../lib/utils";
import { DrawerFooter } from "../containers/hud-drawer";
import { formatShortRemaining } from "../elements/countdown";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { SectionTitle } from "../elements/section-title";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";

/** The Tournament's views in Play's drawer: the week, and the bracket (the player's path and the last eight). */
export type TournamentView = "tournament" | "bracket";

export interface TournamentSceneProps {
  /** The week as the viewer sees it; null while it is read. */
  state: TournamentState | null;
  /** Why it could not be read, with Retry. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** Seconds since the epoch: the day's time left. */
  now: number;
  /** The viewer: their rows lit in the last eight. */
  me?: string | null;
  view?: TournamentView;
  /** The write on its way: its button waits. */
  busy?: "register" | "start" | "claim" | null;
  onRegister?: () => void;
  /** Today's game, or the player's game still open. */
  onPlay?: () => void;
  /** The Cobbles of a run that is over. */
  onClaim?: (week: number) => void;
  onBracket?: () => void;
  /** Today's deck, the round's 38 cards. */
  onDeck?: () => void;
  onOpenPlayer?: (address: string) => void;
}

/** The duel's colours: the viewer in blue, their opponent in red (`--joust-rival`, a side's colour, never the errors'); each is named, never the colour alone. */
const OWN = "text-info";
const THEIRS = "text-joust-rival";

/** A moment of a round's day, in UTC: "09:12 UTC". */
const timeOf = (at: number): string => formatDate(at * 1000, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

/** The week's phase on a tag: the registration's in blue, a round's in red. */
function PhaseTag({ live, children }: { live: boolean; children: ReactNode }) {
  return <span className={cn("w-fit rounded-md px-2 py-0.5 text-xs leading-4 font-extrabold tracking-widest uppercase", live ? "bg-joust-rival-fill text-foreground" : "bg-info text-background")}>{children}</span>;
}

/** A bracket's player by name: a button to their profile when they have one. A long name is cut, its whole text in its title (WRAP360). */
function PlayerName({ player, className, onOpenPlayer }: { player: TournamentPlayer; className?: string; onOpenPlayer?: (address: string) => void }) {
  if (!player.profile) return <span title={player.name} className={cn("min-w-0 truncate", className)}>{player.name}</span>;
  return (
    <button type="button" title={player.name} onClick={() => onOpenPlayer?.(player.address)} className={cn("state-layer -my-2 min-w-0 cursor-pointer truncate rounded-md py-2 text-left underline decoration-foreground/30 underline-offset-2", className)}>
      {player.name}
    </button>
  );
}

const STEPS: readonly [string, string][] = [
  ["Monday:", "register in your league. The brackets are drawn at midnight."],
  ["Tuesday to Sunday:", "one duel a day, one game each on the same cards. The better score goes through."],
  ["Sunday:", "the final. Your Cobbles are claimed the day after your last duel."],
];

/** How the week goes, in three steps. */
function HowItGoes() {
  return (
    <section aria-labelledby="tournament-how" className="flex flex-col gap-2">
      <SectionTitle id="tournament-how">How it goes</SectionTitle>
      <ol className="flex flex-col gap-2">
        {STEPS.map(([day, text], i) => (
          <li key={day} className="flex items-start gap-3">
            <span aria-hidden className="numeric grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
              {i + 1}
            </span>
            <span className="text-sm leading-snug font-medium text-foreground/90">
              <strong className="font-bold text-foreground">{day}</strong> {text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The Cobbles by the round reached, the champion's last; `reached` lights the viewer's row. */
function Prizes({ reached = null, champion = false }: { reached?: number | null; champion?: boolean }) {
  const rows = [...TOURNAMENT_COBBLES.map((cobbles, i) => ({ name: i === 0 ? `${tournamentRoundName(1)}, played` : tournamentRoundName(i + 1), cobbles, own: !champion && reached === i + 1 })), { name: "Champion", cobbles: TOURNAMENT_CHAMPION_COBBLES, own: champion }];
  return (
    <section aria-labelledby="tournament-prizes" className="flex flex-col gap-2">
      <SectionTitle id="tournament-prizes">Cobbles by the round reached</SectionTitle>
      <ul className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
        {rows.map((row) => (
          <li key={row.name} data-own={row.own || undefined} className={cn("flex min-h-9 items-center justify-between gap-3 px-3.5 py-1 text-sm font-semibold", row.own && "bg-info/15")}>
            <span className={cn(row.name === "Champion" && "font-bold text-primary")}>{row.name}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="numeric text-outline font-bold">{formatInteger(row.cobbles)}</span>
              <TokenIcon kind="cobbles" size="sm" className="size-5" px={20} />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[0.8125rem] font-medium text-muted-foreground">Free to enter. No XP and no chest per game, as the Training and the Puzzle.</p>
    </section>
  );
}

/** A side of today's duel: who, their score in their colour, and its line under it. */
function DuelSide({ name, score, tone, line, end = false }: { name: ReactNode; score: number | null; tone: string; line: string; end?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-1", end && "items-end text-right")}>
      <span className="text-outline flex max-w-full min-w-0 text-sm font-bold">{name}</span>
      <span className={cn("numeric text-outline text-3xl leading-none font-bold", score === null ? "text-muted-foreground" : tone)}>{score === null ? "—" : formatInteger(score)}</span>
      <span className="text-xs font-semibold text-muted-foreground">{line}</span>
    </div>
  );
}

const playedLine = (played: TournamentPlayed | null, own: boolean): string => (!played ? (own ? "to play" : "has not played yet") : played.over ? `played at ${timeOf(played.at)}` : "in play");

/** The Cobbles a step secures by going through: the next round's, the champion's in the final. */
const securesOf = (round: number): number => (round >= TOURNAMENT_ROUNDS ? TOURNAMENT_CHAMPION_COBBLES : TOURNAMENT_COBBLES[round]!);

/** Today's duel: the round, both sides and their games, what winning secures; a walkover's game, or a bye's wait. */
function DuelCard({ step, firstDuel, onOpenPlayer }: { step: TournamentStep; firstDuel: number | null; onOpenPlayer?: (address: string) => void }) {
  const name = tournamentRoundName(step.round);
  if (step.kind === "bye")
    return (
      <div data-slot="tournament-duel" data-kind="bye" className="drawer-carved flex items-center gap-3 rounded-2xl px-3.5 py-3">
        <UiIcon name="shield" px={36} className="drawer-icon size-9 shrink-0" />
        <p className="text-sm font-semibold text-muted-foreground">
          <strong className="text-foreground">No duel today.</strong> The seat opposite yours was left empty by the draw: you skip the {name.toLowerCase()}
          {firstDuel !== null && firstDuel > step.round ? ` and start on ${tournamentRoundDay(firstDuel)}, in the ${tournamentRoundName(firstDuel).toLowerCase()}.` : "."}
        </p>
      </div>
    );
  return (
    <div data-slot="tournament-duel" data-kind={step.kind} className="drawer-carved flex flex-col gap-2.5 rounded-2xl bg-linear-to-b from-primary/10 to-transparent px-3.5 py-3">
      <p className="text-center text-xs font-semibold text-muted-foreground">
        {tournamentRoundDay(step.round)}'s {name.toLowerCase()} · one game each
      </p>
      <div className="flex items-start gap-3">
        <DuelSide name="You" score={step.own?.score ?? null} tone={OWN} line={playedLine(step.own, true)} />
        <span className="pt-6 font-display text-base font-bold text-muted-foreground">vs</span>
        {step.opponent ? (
          <DuelSide name={<PlayerName player={step.opponent} onOpenPlayer={onOpenPlayer} />} score={step.theirs?.score ?? null} tone={THEIRS} line={playedLine(step.theirs, false)} end />
        ) : (
          <DuelSide name="Nobody" score={null} tone={THEIRS} line="the match opposite was not played" end />
        )}
      </div>
      <p className="flex items-center gap-2 border-t border-border/60 pt-2 text-xs font-semibold text-muted-foreground">
        <TokenIcon kind="cobbles" size="sm" className="size-5 shrink-0" px={20} />
        <span>
          {step.kind === "walkover" ? "Play the round's game to go through: " : ""}
          <span className="numeric font-bold text-foreground">{formatInteger(securesOf(step.round))}</span> Cobbles {step.round >= TOURNAMENT_ROUNDS ? "as champion" : "if you go through"}. At an equal score, the earlier game wins.
        </span>
      </p>
    </div>
  );
}

/** A run that is over: where it ended, the champion's title, its Cobbles and their Claim. */
function RunOver({ run, label, claiming, onClaim, onBracket }: { run: TournamentRun; label: string; claiming: boolean; onClaim?: (week: number) => void; onBracket?: () => void }) {
  const champion = run.status === "champion";
  const last = run.path[run.path.length - 1]!;
  const wins = run.path.filter((s) => s.outcome === "won").length;
  return (
    <section aria-label={label} data-slot="tournament-result" data-status={run.status} className="drawer-carved flex flex-col gap-3 rounded-2xl px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <PhaseTag live={false}>{label}</PhaseTag>
        <h3 className={cn("text-outline font-display text-2xl leading-none font-bold", champion ? "text-primary" : "text-foreground")}>{champion ? "Champion!" : `Out in the ${tournamentRoundName(run.reached).toLowerCase()}`}</h3>
      </div>
      <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <UiIcon name={champion ? "crown" : "trophy"} px={24} className="drawer-icon size-6 shrink-0" />
        <span className="flex-1">
          {champion ? (
            <>
              <strong className="text-foreground">Champion of the Tournament, {run.league} league.</strong> {formatInteger(wins)} {wins === 1 ? "duel" : "duels"} won.
            </>
          ) : (
            <>
              {run.league} league · {formatInteger(wins)} {wins === 1 ? "duel" : "duels"} won.{" "}
              {last.own ? (
                <>
                  Your <span className="numeric text-foreground">{formatInteger(last.own.score)}</span>
                  {last.theirs && (
                    <>
                      {" "}
                      against <span className="numeric text-foreground">{formatInteger(last.theirs.score)}</span>
                    </>
                  )}
                  .
                </>
              ) : (
                "You did not play your last duel."
              )}
            </>
          )}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {run.cobbles > 0 &&
          (run.claimed ? (
            <span className="flex h-11 flex-1 items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground">
              <Icon name="check" size="sm" /> {formatInteger(run.cobbles)} Cobbles claimed
            </span>
          ) : (
            <Button className="flex-1 bg-success text-background" loading={claiming} onClick={() => onClaim?.(run.week)}>
              <TokenIcon kind="cobbles" size="md" className="size-6" px={24} />
              Claim +{formatInteger(run.cobbles)} Cobbles
            </Button>
          ))}
        <Button variant="secondary" className="flex-1" onClick={onBracket}>
          The bracket
        </Button>
      </div>
      {run.cobbles === 0 && <p className="text-xs font-semibold text-muted-foreground">You played no game: the Cobbles go to the players who did.</p>}
    </section>
  );
}

const OUTCOME: Record<TournamentStep["outcome"], { word: string; tone: string }> = {
  won: { word: "Won", tone: "text-success" },
  lost: { word: "Lost", tone: THEIRS },
  skipped: { word: "Bye", tone: "text-muted-foreground" },
  pending: { word: "Today", tone: "text-primary" },
};

/** The viewer's path: each round they were in, its opponent, both scores and how it went. */
function Path({ run, onOpenPlayer }: { run: TournamentRun; onOpenPlayer?: (address: string) => void }) {
  return (
    <section aria-labelledby="tournament-path" className="flex flex-col gap-2">
      <SectionTitle id="tournament-path">Your path</SectionTitle>
      <ol className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
        {run.path.map((step) => (
          <li key={step.round} data-outcome={step.outcome} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm leading-tight font-bold">
                {tournamentRoundDay(step.round)} · {tournamentRoundName(step.round)}
              </span>
              <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
                {step.kind === "bye" ? (
                  "an empty seat: no duel"
                ) : step.opponent ? (
                  <>
                    <span className="shrink-0">vs</span>
                    <PlayerName player={step.opponent} onOpenPlayer={onOpenPlayer} />
                  </>
                ) : (
                  "nobody opposite: through by playing"
                )}
              </span>
            </span>
            {step.kind !== "bye" && (
              <span className="numeric shrink-0 text-sm font-bold whitespace-nowrap">
                <span className={OWN}>{step.own ? formatInteger(step.own.score) : "—"}</span>
                {step.opponent && (
                  <>
                    <span className="text-muted-foreground"> : </span>
                    <span className={THEIRS}>{step.theirs ? formatInteger(step.theirs.score) : "—"}</span>
                  </>
                )}
              </span>
            )}
            <span className={cn("w-11 shrink-0 text-right text-xs font-extrabold tracking-wide uppercase", OUTCOME[step.outcome].tone)}>{OUTCOME[step.outcome].word}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One side of a match of the last eight: the player and their score, lit when they went through. */
function MatchSide({ side, won, me, onOpenPlayer }: { side: TournamentMatch["a"]; won: boolean; me: boolean; onOpenPlayer?: (address: string) => void }) {
  return (
    <span data-own={me || undefined} className={cn("flex min-h-9 items-center justify-between gap-2 px-3 py-0.5 text-sm", won ? "font-bold" : "font-medium text-foreground/80", me && "bg-info/15")}>
      {side ? <PlayerName player={side.player} onOpenPlayer={onOpenPlayer} /> : <span className="text-muted-foreground">An empty seat</span>}
      <span className="flex shrink-0 items-center gap-1.5">
        {side && <span className="numeric">{side.score === null ? "—" : formatInteger(side.score)}</span>}
        {won && <Icon name="check" size="xs" label="went through" className="text-success" />}
      </span>
    </span>
  );
}

/** The last eight of the viewer's bracket: the quarter-finals, the semi-finals and the final, as far as they are known. */
function LastEight({ run, me, onOpenPlayer }: { run: TournamentRun; me: string | null; onOpenPlayer?: (address: string) => void }) {
  const mine = (side: TournamentMatch["a"]) => me !== null && side !== null && BigInt(side.player.address) === BigInt(me);
  return (
    <section aria-labelledby="tournament-eight" className="flex flex-col gap-2">
      <SectionTitle id="tournament-eight">The last eight</SectionTitle>
      {[4, 5, 6].map((round) => {
        const matches = run.finals.filter((m) => m.round === round);
        return (
          <div key={round} role="group" aria-label={tournamentRoundName(round)} className="flex flex-col gap-1.5">
            <h4 className="text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
              {tournamentRoundDay(round)} · {tournamentRoundName(round)}
            </h4>
            {matches.length === 0 ? (
              <p className="drawer-carved rounded-xl px-3 py-2.5 text-xs font-semibold text-muted-foreground">Decided once {tournamentRoundDay(round - 1)} is over.</p>
            ) : (
              matches.map((match, i) => (
                <div key={i} data-slot="tournament-match" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-xl">
                  <MatchSide side={match.a} won={match.winner === "a"} me={mine(match.a)} onOpenPlayer={onOpenPlayer} />
                  <MatchSide side={match.b} won={match.winner === "b"} me={mine(match.b)} onOpenPlayer={onOpenPlayer} />
                </div>
              ))
            )}
          </div>
        );
      })}
    </section>
  );
}

/** The run to show in the bracket's view: this week's, else last week's. */
const shownRun = (state: TournamentState): TournamentRun | null => state.run ?? state.last;

/**
 * The Tournament (`/play/tournament`, Play's Limited mode; the design proposal of 2026-11-09, one tournament a week on the client): a
 * view of Play's drawer, as the Joust's. The day's phase and its time left; a run that is over with its Cobbles to claim (last week's,
 * or this week's once out). On Monday: the viewer's league and the players registered in it, how the week goes, the Cobbles by round,
 * and Register in the footer. From Tuesday: the viewer's bracket, today's duel (the opponent, their game, what winning secures; a bye's
 * wait; a walkover's game), today's deck, and in the footer The bracket and the gold Play. Its other view is the bracket: the viewer's
 * path round by round and the last eight.
 */
export function TournamentScene({ state, error, errorDetail, onRetry, now, view = "tournament", busy = null, onRegister, onPlay, onClaim, onBracket, onDeck, onOpenPlayer, me = null }: TournamentSceneProps) {
  if (error)
    return (
      <InlineError
        title="The Tournament"
        message={error}
        detail={errorDetail}
        action={
          onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      />
    );
  if (state === null)
    return (
      <div aria-busy aria-label="Tournament" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  if (view === "bracket") {
    const run = shownRun(state);
    if (!run) return <p className="drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">The brackets are drawn on Tuesday at 00:00 UTC, for the players registered on Monday.</p>;
    return (
      <section aria-label="Bracket" className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-muted-foreground">
          {run.league} league · bracket <span className="numeric">{formatInteger(run.bracket)}</span> of <span className="numeric">{formatInteger(run.brackets)}</span> · <span className="numeric">{formatInteger(run.players)}</span> players in {TOURNAMENT_SEATS} seats
        </p>
        <Path run={run} onOpenPlayer={onOpenPlayer} />
        <LastEight run={run} me={me} onOpenPlayer={onOpenPlayer} />
      </section>
    );
  }
  const registration = state.phase === "registration";
  const run = state.run;
  const today = run && run.status !== "out" && run.status !== "champion" ? (run.path[run.path.length - 1] ?? null) : null;
  const canPlay = run !== null && (run.status === "to-play" || run.status === "playing");
  const left = formatShortRemaining(state.endsAt - now);
  const day = tournamentRoundDay(state.round);
  // Last week's run on Monday, and after it while its Cobbles wait.
  const last = state.last && (registration || state.last.claimable) ? state.last : null;
  return (
    <section aria-label="Tournament" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <PhaseTag live={!registration}>{registration ? "Registration · Monday" : `${day} · ${tournamentRoundName(state.round)}`}</PhaseTag>
        <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">This week's Tournament</h2>
        <p role="timer" className="text-sm font-semibold text-muted-foreground">
          {registration ? "Registration closes at 24:00 UTC" : "The round ends at 24:00 UTC"} · in <span className="numeric text-foreground">{left}</span>
        </p>
      </header>

      {last && <RunOver run={last} label="Last week" claiming={busy === "claim"} onClaim={onClaim} onBracket={onBracket} />}

      {registration ? (
        <>
          <div data-slot="tournament-league" className="drawer-carved flex items-center gap-3 rounded-2xl px-3.5 py-2.5">
            <UiIcon name="trophy" px={36} className="drawer-icon size-9 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-outline text-base leading-tight font-bold">{state.league ? `${state.league} league` : "Your league"}</span>
              <span className="text-[0.8125rem] font-semibold text-muted-foreground">Your village's league today. Brackets of {TOURNAMENT_SEATS}, drawn within it.</span>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="numeric text-outline text-xl leading-none font-bold text-primary">{formatInteger(state.entrants)}</span>
              <span className="text-xs font-semibold text-muted-foreground">registered</span>
            </span>
          </div>
          <HowItGoes />
          <Prizes />
        </>
      ) : run ? (
        <>
          <p data-slot="tournament-bracket" className="drawer-carved flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
            <UiIcon name="trophy" px={28} className="drawer-icon size-7 shrink-0" />
            <span>
              <strong className="text-foreground">{run.league} league</strong> · bracket <span className="numeric">{formatInteger(run.bracket)}</span> of <span className="numeric">{formatInteger(run.brackets)}</span> · <span className="numeric">{formatInteger(run.players)}</span> players
              {run.registeredIn !== run.league && <>. Too few {run.registeredIn} players registered: your group joined {run.league}'s.</>}
            </span>
          </p>
          {today ? <DuelCard step={today} firstDuel={run.firstDuel} onOpenPlayer={onOpenPlayer} /> : <RunOver run={run} label="This week" claiming={busy === "claim"} onClaim={onClaim} onBracket={onBracket} />}
          {today && today.kind !== "bye" && (
            <button type="button" onClick={onDeck} className="drawer-tile state-layer flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left">
              <UiIcon name="tile-stack" px={36} className="drawer-icon size-9 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-outline text-base leading-tight font-bold">
                  The round's deck · <span className="numeric">{TOURNAMENT_TILES}</span> tiles
                </span>
                <span className="text-[0.8125rem] font-semibold text-muted-foreground">The same cards for both of you, each in an order of your own.</span>
              </span>
              <Icon name="chevron-right" size="sm" className="text-muted-foreground" />
            </button>
          )}
          {run.status === "played" && <p className="text-[0.8125rem] font-medium text-muted-foreground">Your game is played. Midnight decides: the better score goes through to {state.round >= TOURNAMENT_ROUNDS ? "the title" : `${tournamentRoundDay(state.round + 1)}'s ${tournamentRoundName(state.round + 1).toLowerCase()}`}.</p>}
          <Prizes reached={run.reached} />
        </>
      ) : (
        <>
          <p data-slot="tournament-out" className="drawer-carved rounded-2xl px-3.5 py-3 text-sm font-semibold text-muted-foreground">You did not register on Monday: this week's brackets are drawn without you. The next registration opens on Monday at 00:00 UTC.</p>
          <HowItGoes />
          <Prizes />
        </>
      )}

      <DrawerFooter>
        <div data-slot="tournament-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
          {registration ? (
            state.registered ? (
              <span className="flex min-w-0 flex-1 items-center justify-center gap-2 text-base font-bold">
                <Icon name="check" size="sm" className="text-success" /> You are registered. The draw is on Tuesday.
              </span>
            ) : (
              <Button variant="ghost" style={GOLD_ACTION} className="relative h-12 min-w-0 flex-1 px-2 text-lg font-black text-foreground" disabled={busy === "register"} aria-busy={busy === "register" || undefined} onClick={onRegister}>
                {busy !== "register" && <GoldShine />}
                Register
              </Button>
            )
          ) : run ? (
            <>
              <Button variant="secondary" className="h-12 flex-1" onClick={onBracket}>
                The bracket
              </Button>
              {canPlay ? (
                <Button variant="ghost" style={GOLD_ACTION} className="relative h-12 flex-1 px-1 text-lg font-black text-foreground" disabled={busy === "start"} aria-busy={busy === "start" || undefined} onClick={onPlay}>
                  {busy !== "start" && <GoldShine />}
                  {run.status === "playing" ? "Resume" : "Play"}
                </Button>
              ) : (
                <span className="flex-1 text-center text-sm font-semibold text-muted-foreground">{run.status === "played" ? "Played today" : run.status === "waiting" ? "No duel today" : run.status === "champion" ? "Champion" : "Out"}</span>
              )}
            </>
          ) : (
            <span className="min-w-0 flex-1 text-center text-sm font-semibold text-muted-foreground">Registration reopens on Monday.</span>
          )}
        </div>
      </DrawerFooter>
    </section>
  );
}
