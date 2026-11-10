import type { ReactNode } from "react";
import { JOUST_BAND, JOUST_GAMES, JOUST_LOSS_COBBLES, JOUST_TILES, JOUST_TOP, JOUST_WIN_COBBLES, formatInteger, joustBandOf, type ScoreBoost } from "@paved/game-core";
import type { JoustGuild, JoustJouster, JoustMatch, JoustMe, JoustRanking, JoustResult, JoustSide, JoustState } from "../../data/joust-source";
import { cn } from "../../lib/utils";
import { DrawerFooter } from "../containers/hud-drawer";
import { formatShortRemaining } from "../elements/countdown";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { SectionTitle } from "../elements/section-title";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";

/** The Joust's views in Play's drawer: the week, both top 10, the allegiances' ranking. */
export type JoustView = "joust" | "top" | "ranking";

export interface JoustSceneProps {
  /** The week as the viewer sees it; null while it is read. */
  state: JoustState | null;
  /** Why it could not be read, with Retry. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** Seconds since the epoch: the phase's time left. */
  now: number;
  /** The viewer: their row lit in their side's top 10. */
  me?: string | null;
  view?: JoustView;
  /** The allegiances by rating (the ranking's view); null while it is read. */
  ranking?: JoustRanking | null;
  /** The write on its way: its button waits. */
  busy?: "register" | "start" | "claim" | null;
  onRegister?: () => void;
  /** The player's next game, or their game still open. */
  onPlay?: () => void;
  /** The Cobbles of last week's joust. */
  onClaim?: (week: number) => void;
  onTop?: () => void;
  onRanking?: () => void;
  /** Today's deck: the deck sheet on the day's 38 cards. */
  onDeck?: () => void;
  /** Without an allegiance: the Allegiance page, to find one. */
  onAllegiance?: () => void;
  onOpenPlayer?: (address: string) => void;
}

/** Whether two player IDs are one, whatever their leading zeros. */
function sameAddress(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return a === b;
  }
}

/** The sides' colours: the viewer's allegiance in blue, its opponent in red, in words and in bars (never the colour alone: each is named). */
const OWN = "text-info";
const THEIRS = "text-destructive-text";

const BOOST: Record<ScoreBoost, { title: string; line: string; cap: string }> = {
  roads: { title: "A roads joust: roads score ×2", line: "A road scores as a city of its size. The next joust doubles cities.", cap: "Roads" },
  cities: { title: "A cities joust: cities score ×2", line: "Cities score double. The next joust doubles roads.", cap: "Cities" },
};

/** One figure of a carved row: the figure outlined, its word under it. */
function Figure({ value, word, tone, name = false }: { value: ReactNode; word: string; tone?: string; /** A name, not a number: the body's face. */ name?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1">
      <span className={cn("text-outline max-w-full truncate text-lg leading-tight font-bold", !name && "numeric", tone)}>{value}</span>
      <span className="text-center text-xs font-semibold text-muted-foreground">{word}</span>
    </div>
  );
}

/** Both sides' share of a whole as one bar, the viewer's from the left: the totals, the expected result. */
function SplitBar({ own, label }: { own: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, own)) * 100);
  return (
    <div role="img" aria-label={label} className="flex h-2.5 overflow-hidden rounded-full bg-destructive">
      <span className="bg-info" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The week's phase on a tag: the registration's in blue, the live joust's in red. */
function PhaseTag({ live, children }: { live: boolean; children: ReactNode }) {
  return <span className={cn("w-fit rounded-md px-2 py-0.5 text-xs leading-4 font-extrabold tracking-widest uppercase", live ? "bg-destructive text-destructive-foreground" : "bg-info text-background")}>{children}</span>;
}

/** The viewer's allegiance: its emblem, its name, its rating and band, the members who may joust. */
function GuildCard({ guild }: { guild: NonNullable<JoustState["guild"]> }) {
  const band = joustBandOf(guild.rating);
  return (
    <div data-slot="joust-guild" className="drawer-carved flex items-center gap-3 rounded-2xl px-3.5 py-2.5">
      <GuildEmblem emblem={guild.emblem} size="md" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-outline truncate text-base leading-tight font-bold">{guild.name}</span>
        <span className="text-[0.8125rem] font-semibold text-muted-foreground">
          Rating <span className="numeric">{formatInteger(guild.rating)}</span> · band <span className="numeric">{formatInteger(band)}</span> to <span className="numeric">{formatInteger(band + JOUST_BAND - 1)}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="numeric text-outline text-xl leading-none font-bold text-primary">{formatInteger(guild.members)}</span>
        <span className="text-xs font-semibold text-muted-foreground">jousters</span>
      </span>
    </div>
  );
}

/** The joust's boost, on the gold wash: the structure it doubles. */
function BoostCard({ boost }: { boost: ScoreBoost }) {
  return (
    <div data-slot="joust-boost" className="drawer-carved flex items-center gap-3 rounded-2xl bg-linear-to-b from-primary/15 to-primary/5 px-3.5 py-2.5">
      <UiIcon name="tile-stack" px={36} className="drawer-icon size-9 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-outline text-base leading-tight font-bold">{BOOST[boost].title}</span>
        <span className="text-[0.8125rem] font-semibold text-muted-foreground">{BOOST[boost].line}</span>
      </span>
    </div>
  );
}

const STEPS: readonly [string, string][] = [
  ["Friday:", "an allegiance of your band is drawn as your opponent."],
  ["Friday to Sunday:", `every member plays up to ${JOUST_GAMES} games. Their best counts.`],
  ["Monday:", `the higher total of the ${JOUST_TOP} best jousters wins.`],
];

/** How the weekend goes, in three steps. */
function HowItGoes() {
  return (
    <section aria-labelledby="joust-how" className="flex flex-col gap-2">
      <SectionTitle id="joust-how">How it goes</SectionTitle>
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

/** A side's name and emblem over its total. */
function SideHead({ side, tone, end = false }: { side: { guild: JoustGuild; total: number }; tone: string; end?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-1", end && "items-end text-right")}>
      <span className={cn("flex min-w-0 items-center gap-2", end && "flex-row-reverse")}>
        <GuildEmblem emblem={side.guild.emblem} size="sm" />
        <span className="text-outline truncate text-sm font-bold">{side.guild.name}</span>
      </span>
      <span className={cn("numeric text-outline text-3xl leading-none font-bold", tone)}>{formatInteger(side.total)}</span>
    </div>
  );
}

/**
 * What a better game would change: the best the viewer needs to pass the jouster above them in their side (the 10th place when they
 * are out of the top 10, any score while it has an empty place), and the total it would lift their allegiance to. Null: nothing to
 * say (no game left, already first).
 */
export function joustLift(side: JoustSide, me: JoustMe): { best: number; total: number } | null {
  if (!me.eligible || (me.left === 0 && !me.open) || me.place === 1) return null;
  const inTop = me.place !== null && me.place <= JOUST_TOP;
  // The jouster to pass, and the score the total loses for it: the viewer's own best, or the 10th's they would push out.
  const above = inTop ? side.top[me.place! - 2] : side.top[JOUST_TOP - 1];
  if (!above) return null;
  const best = above.best + 10;
  return { best, total: side.total - (inTop ? (me.best ?? 0) : above.best) + best };
}

/** The live match: both totals, their share on a bar, each side's jousters and games left; then the expected result from the ratings. */
function MatchCard({ match }: { match: JoustMatch }) {
  const { own, opponent } = match;
  const expected = Math.round(match.expected * 100);
  if (!opponent)
    return (
      <div data-slot="joust-match" className="drawer-carved flex flex-col gap-2 rounded-2xl px-3.5 py-3">
        <SideHead side={own} tone={OWN} />
        <p className="text-sm font-semibold text-muted-foreground">A bye this week: no opponent was left in your band. It pays as a win to every jouster who plays.</p>
      </div>
    );
  const sum = own.total + opponent.total;
  return (
    <div data-slot="joust-match" className="drawer-carved flex flex-col gap-2.5 rounded-2xl bg-linear-to-b from-primary/10 to-transparent px-3.5 py-3">
      <p className="text-center text-xs font-semibold text-muted-foreground">Sum of each side's top {JOUST_TOP}</p>
      <div className="flex items-end gap-3">
        <SideHead side={own} tone={OWN} />
        <SideHead side={opponent} tone={THEIRS} end />
      </div>
      <SplitBar own={sum === 0 ? 0.5 : own.total / sum} label={`${own.guild.name} ${formatInteger(own.total)}, ${opponent.guild.name} ${formatInteger(opponent.total)}`} />
      <div className="flex justify-between gap-3 text-xs font-semibold text-muted-foreground">
        <span>
          <span className="numeric">{formatInteger(own.jousters)}</span> jousters · <span className="numeric">{formatInteger(own.gamesLeft)}</span> games left
        </span>
        <span className="text-right">
          <span className="numeric">{formatInteger(opponent.jousters)}</span> jousters · <span className="numeric">{formatInteger(opponent.gamesLeft)}</span> games left
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-xs font-semibold text-muted-foreground">
        <span>
          Expected from the ratings (<span className="numeric">{formatInteger(own.rating)}</span> vs <span className="numeric">{formatInteger(opponent.rating)}</span>)
        </span>
        <span className="whitespace-nowrap">
          <span className={cn("numeric font-bold", OWN)}>{expected} %</span> · <span className={cn("numeric font-bold", THEIRS)}>{100 - expected} %</span>
        </span>
      </div>
    </div>
  );
}

/** Last week's joust: the verdict, both totals, the rating's move, the viewer's part, and their Cobbles to claim. */
function ResultCard({ result, claiming, onClaim, onRanking }: { result: JoustResult; claiming: boolean; onClaim?: (week: number) => void; onRanking?: () => void }) {
  const won = result.outcome === "win" || result.outcome === "bye";
  const verdict = result.outcome === "win" ? "Victory!" : result.outcome === "bye" ? "A bye" : result.outcome === "draw" ? "A draw" : "Defeat";
  const move = result.ratingAfter - result.ratingBefore;
  return (
    <section aria-label="Last week's joust" data-slot="joust-result" data-outcome={result.outcome} className="drawer-carved flex flex-col gap-3 rounded-2xl px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <PhaseTag live={false}>Last week · the result</PhaseTag>
        <h3 className={cn("text-outline font-display text-2xl leading-none font-bold", won ? OWN : result.outcome === "draw" ? "text-foreground" : THEIRS)}>{verdict}</h3>
      </div>
      <div className="flex items-end gap-3">
        <SideHead side={result.own} tone={OWN} />
        {result.opponent && (
          <>
            <span className="pb-1 font-display text-base font-bold text-muted-foreground">vs</span>
            <SideHead side={result.opponent} tone={THEIRS} end />
          </>
        )}
      </div>
      <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <UiIcon name="trophy" px={24} className="drawer-icon size-6 shrink-0" />
        <span className="flex-1">
          Joust rating <span className="numeric text-foreground">{formatInteger(result.ratingBefore)}</span> → <span className="numeric text-foreground">{formatInteger(result.ratingAfter)}</span>
          {result.opponent && <> ({Math.round(result.expected * 100)} % expected)</>}
        </span>
        <span className={cn("numeric text-base font-bold", move > 0 ? "text-success" : move < 0 ? THEIRS : "text-muted-foreground")}>
          {move > 0 ? "+" : move < 0 ? "−" : ""}
          {formatInteger(Math.abs(move))}
        </span>
      </p>
      <div role="group" aria-label="Your joust" className="flex">
        <Figure value={result.best === null ? "—" : formatInteger(result.best)} word="your best" />
        <Figure value={result.place === null ? "—" : `#${formatInteger(result.place)}`} word="in our jousters" />
        <Figure name value={result.champion?.name ?? "—"} word={result.champion ? `champion · ${formatInteger(result.champion.score)}` : "champion"} />
      </div>
      <div className="flex flex-wrap gap-2">
        {result.cobbles > 0 &&
          (result.claimed ? (
            <span className="flex h-11 flex-1 items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground">
              <Icon name="check" size="sm" /> {formatInteger(result.cobbles)} Cobbles claimed
            </span>
          ) : (
            <Button className="flex-1 bg-success text-background" loading={claiming} onClick={() => onClaim?.(result.week)}>
              <TokenIcon kind="cobbles" size="md" className="size-6" px={24} />
              Claim +{formatInteger(result.cobbles)} Cobbles
            </Button>
          ))}
        <Button variant="secondary" className="flex-1" onClick={onRanking}>
          Joust ranking
        </Button>
      </div>
      {result.cobbles === 0 && <p className="text-xs font-semibold text-muted-foreground">You did not joust last week: the Cobbles go to the jousters who played.</p>}
    </section>
  );
}

/** A jouster's games played, as dots: lit for each played, of `JOUST_GAMES`. */
function Dots({ played }: { played: number }) {
  return (
    <span role="img" aria-label={`${played} of ${JOUST_GAMES} games played`} className="flex gap-1">
      {Array.from({ length: JOUST_GAMES }, (_, i) => (
        <span key={i} className={cn("size-2 rounded-full", i < played ? "bg-foreground/80" : "bg-foreground/20")} />
      ))}
    </span>
  );
}

/** One side's top 10: each jouster's place, name, games played and best. */
function TopList({ side, tone, me, onOpenPlayer }: { side: JoustSide; tone: string; me: string | null; onOpenPlayer?: (address: string) => void }) {
  return (
    <section aria-label={`${side.guild.name}'s top ${JOUST_TOP}`} className="flex min-w-0 flex-1 flex-col gap-2">
      <SideHead side={side} tone={tone} />
      {side.top.length === 0 ? (
        <p className="drawer-carved rounded-xl px-3 py-4 text-center text-xs font-semibold text-muted-foreground">No game finished yet.</p>
      ) : (
        <ol className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
          {side.top.map((j: JoustJouster, i) => {
            const own = me !== null && sameAddress(j.profile.address, me);
            return (
              <li key={j.profile.address}>
                <button type="button" onClick={() => onOpenPlayer?.(j.profile.address)} data-own={own || undefined} className={cn("state-layer flex min-h-11 w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left", own && "bg-info/15")}>
                  <span className="numeric w-5 shrink-0 text-xs font-bold text-muted-foreground">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm leading-none font-semibold">{j.profile.name ?? "Jouster"}</span>
                    <Dots played={j.played} />
                  </span>
                  <span className="numeric text-outline text-sm font-bold">{formatInteger(j.best)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The allegiances by rating, each with its last joust's move; the viewer's own lit, and its peak. */
function RankingList({ ranking }: { ranking: JoustRanking | null }) {
  if (ranking === null)
    return (
      <div aria-busy className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  return (
    <section aria-labelledby="joust-ranking" className="flex flex-col gap-2">
      <SectionTitle id="joust-ranking">Allegiances by rating</SectionTitle>
      <p className="text-sm font-semibold text-muted-foreground">
        After <span className="numeric">{formatInteger(ranking.jousts)}</span> {ranking.jousts === 1 ? "joust" : "jousts"}. Everyone starts at 1,000; a win against a stronger allegiance moves more.
      </p>
      {ranking.entries.length === 0 ? (
        <p className="drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">No allegiance has jousted yet.</p>
      ) : (
        <ol aria-label="Joust ranking" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
          {ranking.entries.map((e) => {
            const own = e.guild.id === ranking.own;
            return (
              <li key={e.guild.id} data-own={own || undefined} className={cn("flex min-h-14 items-center gap-3 px-3 py-1.5", own && "bg-info/15")}>
                <span className="numeric w-6 shrink-0 text-sm font-bold text-muted-foreground">{e.place}</span>
                <GuildEmblem emblem={e.guild.emblem} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-bold">{e.guild.name}</span>
                  {own && <span className={cn("text-xs font-semibold", OWN)}>your allegiance</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="numeric text-outline text-base leading-tight font-bold">{formatInteger(e.rating)}</span>
                  {e.change !== null && (
                    <span className={cn("numeric text-xs font-bold", e.change > 0 ? "text-success" : e.change < 0 ? THEIRS : "text-muted-foreground")}>
                      {e.change > 0 ? "+" : e.change < 0 ? "−" : ""}
                      {formatInteger(Math.abs(e.change))}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {ranking.peak !== null && (
        <p className="drawer-carved rounded-xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
          Your allegiance's <strong className="text-foreground">peak rating</strong> is <span className="numeric text-foreground">{formatInteger(ranking.peak)}</span>. A peak cannot be lowered by losing on purpose.
        </p>
      )}
    </section>
  );
}

/**
 * The Joust (`/play/joust`, Play's Limited mode; the design proposal of 2026-11-09, one joust a week on the client): a view of Play's
 * drawer, as the Puzzle's. The week's phase and its time left; last week's result while there is one (the verdict, the totals, the
 * rating's move, the viewer's part, Claim for the jousters who played); the viewer's allegiance (or, without one, the way to find one).
 * From Monday to Thursday: how the weekend goes, the structure this joust doubles, and Register for an Officer or the Leader. From
 * Friday: the match (both totals, the expected result), the viewer's games (played, left, their best and its place), today's deck,
 * what a better game would change, and in the footer Both top 10 and the gold Play. Its two other views: both top 10 side by side
 * (dots: games played of three) and the allegiances by rating.
 */
export function JoustScene({ state, error, errorDetail, onRetry, now, me = null, view = "joust", ranking = null, busy = null, onRegister, onPlay, onClaim, onTop, onRanking, onDeck, onAllegiance, onOpenPlayer }: JoustSceneProps) {
  if (error)
    return (
      <InlineError
        title="The Joust"
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
  if (view === "ranking") return <RankingList ranking={ranking} />;
  if (state === null)
    return (
      <div aria-busy aria-label="Joust" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  const live = state.phase === "live";
  const match = state.match;
  if (view === "top" && match)
    return (
      <section aria-label="Both top 10" className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <TopList side={match.own} tone={OWN} me={me} onOpenPlayer={onOpenPlayer} />
          {match.opponent && <TopList side={match.opponent} tone={THEIRS} me={me} onOpenPlayer={onOpenPlayer} />}
        </div>
        <p className="drawer-carved flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
          <Dots played={1} />
          <span>Dots: games played of {JOUST_GAMES}. A jouster with games left can still raise their side's total.</span>
        </p>
      </section>
    );
  const mine = state.me;
  const lift = match && mine ? joustLift(match.own, mine) : null;
  const canPlay = live && match !== null && mine !== null && mine.eligible && (mine.left > 0 || mine.open !== null);
  const left = formatShortRemaining((live ? state.endsAt : state.opensAt) - now);
  return (
    <section aria-label="Joust" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <PhaseTag live={live}>{live ? "Live · Friday to Sunday" : "Registration · Mon to Thu"}</PhaseTag>
        <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">This weekend's Joust</h2>
        <p role="timer" className="text-sm font-semibold text-muted-foreground">
          {live ? "Ends Sunday at 24:00 UTC" : "Registration closes Thursday at 24:00 UTC"} · in <span className="numeric text-foreground">{left}</span>
        </p>
      </header>

      {state.result && <ResultCard result={state.result} claiming={busy === "claim"} onClaim={onClaim} onRanking={onRanking} />}

      {state.guild ? (
        <GuildCard guild={state.guild} />
      ) : (
        <div data-slot="joust-guildless" className="drawer-carved flex flex-col items-start gap-2 rounded-2xl px-3.5 py-3">
          <p className="text-sm font-semibold text-muted-foreground">The Joust is an allegiance against an allegiance. Join one before Friday 00:00 UTC to joust this weekend.</p>
          <Button variant="secondary" onClick={onAllegiance}>
            Find an allegiance
          </Button>
        </div>
      )}

      {live && match && <MatchCard match={match} />}
      {live && state.guild && !match && (
        <p data-slot="joust-out" className="drawer-carved rounded-2xl px-3.5 py-3 text-sm font-semibold text-muted-foreground">
          {state.guild.name} was not registered this week and sits this joust out. The next registration opens on Monday.
        </p>
      )}

      {live && match && mine && (
        <section aria-labelledby="joust-games" className="flex flex-col gap-2">
          <SectionTitle id="joust-games">Your games</SectionTitle>
          {mine.eligible ? (
            <div role="group" aria-label="Your games" className="drawer-carved flex rounded-2xl py-1.5">
              <Figure value={formatInteger(mine.played)} word="played" />
              <Figure value={formatInteger(mine.left)} word="left" tone="text-primary" />
              <Figure value={mine.best === null ? "—" : formatInteger(mine.best)} word={mine.place === null ? "your best" : `your best · #${formatInteger(mine.place)}`} />
            </div>
          ) : (
            <p className="drawer-carved rounded-2xl px-3.5 py-3 text-sm font-semibold text-muted-foreground">You joined after Friday 00:00 UTC: you joust from the next one.</p>
          )}
          <button type="button" onClick={onDeck} className="drawer-tile state-layer flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left">
            <UiIcon name="tile-stack" px={36} className="drawer-icon size-9 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-outline text-base leading-tight font-bold">
                Today's deck · <span className="numeric">{JOUST_TILES}</span> tiles
              </span>
              <span className="text-[0.8125rem] font-semibold text-muted-foreground">The same cards for every jouster today, in an order of your own. {BOOST[state.boost].cap} ×2.</span>
            </span>
            <Icon name="chevron-right" size="sm" className="text-muted-foreground" />
          </button>
          {lift && (
            <p data-slot="joust-lift" className="drawer-carved flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
              <UiIcon name="crown" px={28} className="drawer-icon size-7 shrink-0" />
              <span>
                A best of <span className="numeric font-bold text-foreground">{formatInteger(lift.best)}</span> would lift {match.own.guild.name} to <span className="numeric font-bold text-primary">{formatInteger(lift.total)}</span>.
              </span>
            </p>
          )}
        </section>
      )}

      {!live && (
        <>
          <HowItGoes />
          <BoostCard boost={state.boost} />
          <p className="text-[0.8125rem] font-medium text-muted-foreground">
            Members who join after Friday 00:00 cannot joust this weekend. A game counts for the allegiance it was started for. The winners' jousters claim {JOUST_WIN_COBBLES} Cobbles each, the others {JOUST_LOSS_COBBLES}.
          </p>
        </>
      )}

      {state.guild && (
        <DrawerFooter>
          <div data-slot="joust-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
            {!live ? (
              state.registered ? (
                <span className="flex flex-1 items-center justify-center gap-2 text-base font-bold">
                  <Icon name="check" size="sm" className="text-success" /> {state.guild.name} is registered. The draw is on Friday.
                </span>
              ) : state.guild.canRegister ? (
                <Button variant="ghost" style={GOLD_ACTION} className="relative h-12 flex-1 px-2 text-lg font-black text-foreground" disabled={busy === "register"} aria-busy={busy === "register" || undefined} onClick={onRegister}>
                  {busy !== "register" && <GoldShine />}
                  Register {state.guild.name}
                </Button>
              ) : (
                <span className="flex-1 text-center text-sm font-semibold text-muted-foreground">Not registered yet: an Officer or the Leader registers {state.guild.name}.</span>
              )
            ) : match ? (
              <>
                <Button variant="secondary" className="h-12 flex-1" onClick={onTop}>
                  Both top {JOUST_TOP}
                </Button>
                {canPlay ? (
                  <Button variant="ghost" style={GOLD_ACTION} className="relative h-12 flex-1 px-1 text-lg font-black text-foreground" disabled={busy === "start"} aria-busy={busy === "start" || undefined} onClick={onPlay}>
                    {busy !== "start" && <GoldShine />}
                    {mine!.open ? "Resume" : `Play game ${mine!.played + 1}`}
                  </Button>
                ) : (
                  <span className="flex-1 text-center text-sm font-semibold text-muted-foreground">{mine?.eligible ? "No game left" : "You joust from the next one"}</span>
                )}
              </>
            ) : (
              <Button variant="secondary" className="h-12 flex-1" onClick={onRanking}>
                Joust ranking
              </Button>
            )}
          </div>
        </DrawerFooter>
      )}
    </section>
  );
}
