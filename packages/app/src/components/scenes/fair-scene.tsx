import type { ReactNode } from "react";
import { FAIR_FLOOR, FAIR_OFFERS, FAIR_STALLS, FAIR_TIERS, FAIR_TRIES, fairInStall, fairIsMythic, fairPlanCodeOf, formatInteger, type FairOffer, type FairSeason } from "@paved/game-core";
import type { FairChampion, FairRanking, FairResult, FairState } from "../../data/fair-source";
import { cn } from "../../lib/utils";
import { DrawerFooter } from "../containers/hud-drawer";
import { formatShortRemaining } from "../elements/countdown";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { RARITY_NAME, RarityBadge, rarityOf } from "../elements/rarity-badge";
import { SectionTitle } from "../elements/section-title";
import { TileRender, tileName, type TileRenders } from "../elements/tile-render";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";

/** The Fair's views in Play's drawer: the week, the open try's draft, the live ranking. */
export type FairView = "fair" | "draft" | "ranking";

/** The open try's draft as the scene shows it: the offer on the table, the next one, the deck so far (market cards). */
export interface FairDraftView {
  offer: FairOffer;
  next: FairOffer | null;
  deck: number[];
  /** The offers a mythic passed so far. */
  passed: number;
  season: FairSeason;
}

export interface FairSceneProps {
  /** The week as the viewer sees it; null while it is read. */
  state: FairState | null;
  /** Why it could not be read, with Retry. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** Seconds since the epoch: the week's time left. */
  now: number;
  /** The viewer: their row lit in the ranking. */
  me?: string | null;
  view?: FairView;
  /** The week's ranking (its view); null while it is read. */
  ranking?: FairRanking | null;
  /** The open try's draft (its view); null while it is read, or with no draft open. */
  draft?: FairDraftView | null;
  /** The tiles' build-time renders; without them a tile is its plan's chip. */
  renders?: TileRenders;
  /** The write on its way: its button waits. */
  busy?: "start" | "claim" | "abandon" | null;
  /** The player's next try, or their try still open (its draft, or its game). */
  onPlay?: () => void;
  /** Takes tile `choice` (0 to 2) of the offer on the table. */
  onPick?: (choice: number) => void;
  /** Leaves the open try during its draft: it is spent. */
  onAbandon?: () => void;
  /** The Cobbles of last week's Fair. */
  onClaim?: (week: number) => void;
  onRanking?: () => void;
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

const SEASON_NAME: Record<FairSeason, string> = { winter: "Winter", spring: "Spring", summer: "Summer", autumn: "Autumn" };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** One figure of a carved row: the figure outlined, its word under it. */
function Figure({ value, word, tone }: { value: ReactNode; word: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1">
      <span className={cn("numeric text-outline text-lg leading-tight font-bold", tone)}>{value}</span>
      <span className="text-center text-xs font-semibold text-muted-foreground">{word}</span>
    </div>
  );
}

/** The week's tag: the Fair's own colour (`--fair-stall`, the stalls' green), a state, never an error's. */
function Tag({ children }: { children: ReactNode }) {
  return <span className="w-fit rounded-md bg-fair-stall px-2 py-0.5 text-xs leading-4 font-extrabold tracking-widest text-background uppercase">{children}</span>;
}

/** A deck's cards by plan, the most copies first: each plan's code and its count. */
export function deckByPlan(cards: readonly number[]): { plan: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(fairPlanCodeOf(card), (counts.get(fairPlanCodeOf(card)) ?? 0) + 1);
  return [...counts].map(([plan, count]) => ({ plan, count })).sort((a, b) => b.count - a.count || a.plan - b.plan);
}

/** A deck as a line of figures: its tiles, its mythics, its tiles from the season's stall. */
function deckLine(cards: readonly number[], season: FairSeason): string {
  const mythics = cards.filter(fairIsMythic).length;
  const stall = cards.filter((card) => fairInStall(card, season)).length;
  return `${formatInteger(cards.length)} tiles · ${formatInteger(mythics)} ${mythics === 1 ? "mythic" : "mythics"} · ${formatInteger(stall)} from the ${SEASON_NAME[season].toLowerCase()} stall`;
}

/** A deck's tiles by plan: each plan's render, its count on it, its name under it. */
function DeckGrid({ cards, renders, label }: { cards: readonly number[]; renders?: TileRenders; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-4 gap-2 tablet:grid-cols-5">
      {deckByPlan(cards).map(({ plan, count }) => (
        <li key={plan} className="flex min-w-0 flex-col items-center gap-1">
          <span className="relative block aspect-square w-full overflow-hidden rounded-lg">
            <TileRender plan={plan} theme={0} renders={renders} top alt="" />
            <span className="numeric text-outline absolute right-1 bottom-0.5 text-sm font-bold">×{count}</span>
          </span>
          <span className="w-full text-center text-xs leading-tight font-semibold text-muted-foreground">{tileName(plan)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The season's stall, on the green wash: the structure whose tiles every offer holds. */
function StallCard({ season }: { season: FairSeason }) {
  const stall = FAIR_STALLS[season];
  return (
    <div data-slot="fair-stall" className="drawer-carved flex items-center gap-3 rounded-2xl bg-linear-to-b from-fair-stall/20 to-fair-stall/5 px-3.5 py-2.5">
      <UiIcon name="tile-stack" px={36} className="drawer-icon size-9 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-outline text-base leading-tight font-bold">
          {SEASON_NAME[season]}'s stall: {stall.structure}
        </span>
        <span className="text-[0.8125rem] font-semibold text-muted-foreground">{stall.line} One tile of every offer comes from it.</span>
      </span>
    </div>
  );
}

const STEPS: readonly [string, string][] = [
  ["Draft:", `${FAIR_OFFERS} offers of three tiles. You take one of each: the tiles you take are your deck.`],
  ["A mythic costs two picks:", "take one and the next offer, already shown, passes."],
  ["Play:", "the starter, then your deck, in an order drawn tile by tile. No spare: a tile that fits nowhere is discarded."],
  ["Rank:", `${FAIR_TRIES} tries a day; your best of the week counts from ${formatInteger(FAIR_FLOOR)} points.`],
];

/** The week's rules, in four steps. */
function HowItGoes() {
  return (
    <section aria-labelledby="fair-how" className="flex flex-col gap-2">
      <SectionTitle id="fair-how">How it goes</SectionTitle>
      <ol className="flex flex-col gap-2">
        {STEPS.map(([head, text], i) => (
          <li key={head} className="flex items-start gap-3">
            <span aria-hidden className="numeric grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
              {i + 1}
            </span>
            <span className="text-sm leading-snug font-medium text-foreground/90">
              <strong className="font-bold text-foreground">{head}</strong> {text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The reward tiers: each one's Cobbles, and its bar so far when the ranking gives it; the viewer's own lit. */
function Tiers({ bars, mine }: { bars?: readonly (number | null)[]; mine?: number | null }) {
  return (
    <ul aria-label="Reward tiers" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
      {FAIR_TIERS.map((tier, i) => (
        <li key={tier.name} data-own={mine === i || undefined} className={cn("flex min-h-10 items-center gap-3 px-3.5 py-1.5", mine === i && "bg-info/15")}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-bold">{i === FAIR_TIERS.length - 1 ? "A counted try below" : tier.name}</span>
            {bars && (
              <span className="text-xs font-semibold text-muted-foreground">
                {bars[i] == null ? "nobody yet" : <>from <span className="numeric">{formatInteger(bars[i]!)}</span></>}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <TokenIcon kind="cobbles" size="sm" px={20} />
            <span className="numeric text-outline text-base font-bold text-primary">{formatInteger(tier.cobbles)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The week's champion: their name, their score and their deck. */
function ChampionCard({ champion, season, renders, onOpenPlayer }: { champion: FairChampion; season: FairSeason; renders?: TileRenders; onOpenPlayer?: (address: string) => void }) {
  const name = champion.profile.name ?? "A player";
  return (
    <div data-slot="fair-champion" className="flex flex-col gap-2 border-t border-border/60 pt-2.5">
      <button type="button" onClick={() => onOpenPlayer?.(champion.profile.address)} className="state-layer flex min-h-11 cursor-pointer items-center gap-3 rounded-xl text-left">
        <UiIcon name="crown" px={28} className="drawer-icon size-7 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span title={name} className="text-outline truncate text-base leading-tight font-bold">
            {name}
          </span>
          <span className="text-xs font-semibold text-muted-foreground">The week's champion · {deckLine(champion.cards, season)}</span>
        </span>
        <span className="numeric text-outline shrink-0 text-lg font-bold text-primary">{formatInteger(champion.score)}</span>
      </button>
      <DeckGrid cards={champion.cards} renders={renders} label="The champion's deck" />
    </div>
  );
}

/** Last week's Fair: the viewer's tier and place, their best, their Cobbles to claim, and the champion with their deck. */
function ResultCard({ result, claiming, renders, onClaim, onOpenPlayer }: { result: FairResult; claiming: boolean; renders?: TileRenders; onClaim?: (week: number) => void; onOpenPlayer?: (address: string) => void }) {
  const tier = result.tier === null ? null : FAIR_TIERS[result.tier]!;
  return (
    <section aria-label="Last week's Fair" data-slot="fair-result" className="drawer-carved flex flex-col gap-3 rounded-2xl px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <Tag>Last week · the result</Tag>
        <h3 className={cn("text-outline font-display text-2xl leading-none font-bold", tier ? "text-primary" : "text-foreground")}>{tier ? (result.tier === FAIR_TIERS.length - 1 ? "Counted" : tier.name) : "Not counted"}</h3>
      </div>
      <div role="group" aria-label="Your week" className="flex">
        <Figure value={result.best === null ? "—" : formatInteger(result.best)} word="your best try" />
        <Figure value={result.place === null ? "—" : `#${formatInteger(result.place)}`} word={`of ${formatInteger(result.players)} players`} />
      </div>
      {result.cobbles > 0 ? (
        result.claimed ? (
          <span className="flex h-11 items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground">
            <Icon name="check" size="sm" /> {formatInteger(result.cobbles)} Cobbles claimed
          </span>
        ) : (
          <Button className="bg-success text-background" loading={claiming} onClick={() => onClaim?.(result.week)}>
            <TokenIcon kind="cobbles" size="md" className="size-6" px={24} />
            Claim +{formatInteger(result.cobbles)} Cobbles
          </Button>
        )
      ) : (
        <p className="text-xs font-semibold text-muted-foreground">
          A best try of <span className="numeric">{formatInteger(FAIR_FLOOR)}</span> points or more counts: yours stayed under it.
        </p>
      )}
      {result.champion && <ChampionCard champion={result.champion} season={result.season} renders={renders} onOpenPlayer={onOpenPlayer} />}
    </section>
  );
}

/** The week's ranking so far: the tiers' bars, then its first places, the viewer's own lit. */
function RankingList({ ranking, me, onOpenPlayer }: { ranking: FairRanking | null; me: string | null; onOpenPlayer?: (address: string) => void }) {
  if (ranking === null)
    return (
      <div aria-busy className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  return (
    <section aria-labelledby="fair-ranking" className="flex flex-col gap-3">
      <SectionTitle id="fair-ranking">The week so far</SectionTitle>
      <p className="text-sm font-semibold text-muted-foreground">
        <span className="numeric">{formatInteger(ranking.players)}</span> {ranking.players === 1 ? "player" : "players"} with a best try of <span className="numeric">{formatInteger(FAIR_FLOOR)}</span> or more. The bars move until Sunday's end.
      </p>
      {ranking.me && (
        <p data-slot="fair-me" className="drawer-carved flex items-center gap-3 rounded-2xl bg-info/15 px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
          <UiIcon name="star" px={28} className="drawer-icon size-7 shrink-0" />
          <span className="flex-1">
            You are <span className="numeric font-bold text-foreground">#{formatInteger(ranking.me.place)}</span> with <span className="numeric font-bold text-foreground">{formatInteger(ranking.me.score)}</span>
          </span>
          <span className="shrink-0 font-bold text-primary">{FAIR_TIERS[ranking.me.tier]!.name}</span>
        </p>
      )}
      <Tiers bars={ranking.bars} mine={ranking.me?.tier ?? null} />
      {ranking.entries.length === 0 ? (
        <p className="drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">No try counts yet this week.</p>
      ) : (
        <ol aria-label="Fair ranking" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
          {ranking.entries.map((e) => {
            const own = me !== null && sameAddress(e.profile.address, me);
            return (
              <li key={e.profile.address}>
                <button type="button" onClick={() => onOpenPlayer?.(e.profile.address)} data-own={own || undefined} className={cn("state-layer flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-1.5 text-left", own && "bg-info/15")}>
                  <span className="numeric w-7 shrink-0 text-sm font-bold text-muted-foreground">{e.place}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span title={e.profile.name ?? undefined} className="truncate text-sm font-bold">
                      {e.profile.name ?? "Player"}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">{FAIR_TIERS[e.tier]!.name}</span>
                  </span>
                  <span className="numeric text-outline shrink-0 text-base font-bold">{formatInteger(e.score)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** One tile of the offer on the table: its render, its name, where it comes from; a mythic says its price. */
function OfferTile({ card, stall, season, renders, passes, disabled, onPick }: { card: number; stall: boolean; season: FairSeason; renders?: TileRenders; /** The offer a mythic would pass; null: none left. */ passes: number | null; disabled: boolean; onPick?: () => void }) {
  const plan = fairPlanCodeOf(card);
  const rarity = rarityOf(plan);
  const mythic = fairIsMythic(card);
  const name = tileName(plan);
  return (
    <li className="flex min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        data-slot="fair-offer-tile"
        data-mythic={mythic || undefined}
        aria-label={`Take ${name}, ${RARITY_NAME[rarity].toLowerCase()}${stall ? `, from the ${SEASON_NAME[season].toLowerCase()} stall` : ""}${mythic && passes !== null ? `: offer ${passes} passes` : ""}`}
        className={cn("drawer-tile state-layer flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-2xl p-2 text-center disabled:cursor-default", stall && "bg-linear-to-b from-fair-stall/25 to-transparent")}
      >
        <span className="block aspect-square w-full overflow-hidden rounded-lg">
          <TileRender plan={plan} theme={0} renders={renders} top alt="" />
        </span>
        <span className="text-outline text-sm leading-tight font-bold">{name}</span>
        <RarityBadge rarity={rarity} />
        <span className="text-xs leading-tight font-semibold text-muted-foreground">{mythic ? (passes !== null ? "2 picks" : "Mythic") : stall ? `${SEASON_NAME[season]} stall` : "Market"}</span>
      </button>
    </li>
  );
}

/** The open try's draft: the offer on the table, the next one (what a mythic would pass), the deck so far, and the way out. */
function DraftView({ draft, renders, busy, onPick, onAbandon }: { draft: FairDraftView; renders?: TileRenders; busy: boolean; onPick?: (choice: number) => void; onAbandon?: () => void }) {
  const { offer, next, deck } = draft;
  const mythicOnTable = offer.cards.some(fairIsMythic);
  return (
    <section aria-label="Draft" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <Tag>
          Pick {offer.number} of {FAIR_OFFERS}
        </Tag>
        <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">Take one tile</h2>
        <p className="text-sm font-semibold text-muted-foreground">The tiles you take are your deck. A tile you take leaves the market.</p>
      </header>

      <ul aria-label={`Offer ${offer.number}`} className="flex items-stretch gap-2">
        {offer.cards.map((card, i) => (
          <OfferTile key={card} card={card} stall={offer.stall && i === 0} season={draft.season} renders={renders} passes={next?.number ?? null} disabled={busy} onPick={() => onPick?.(i)} />
        ))}
      </ul>

      {next && (
        <section aria-labelledby="fair-next" data-slot="fair-next" data-at-stake={mythicOnTable || undefined} className="drawer-carved flex flex-col gap-2 rounded-2xl px-3.5 py-2.5">
          <h3 id="fair-next" className="text-sm font-bold">
            Next: offer <span className="numeric">{next.number}</span>
          </h3>
          <ul className="flex gap-2">
            {next.cards.map((card) => (
              <li key={card} className="flex min-w-0 flex-1 items-center gap-2">
                <span className="block size-10 shrink-0 overflow-hidden rounded-md">
                  <TileRender plan={fairPlanCodeOf(card)} theme={0} renders={renders} top alt="" />
                </span>
                <span className="min-w-0 text-xs leading-tight font-semibold text-muted-foreground">{tileName(fairPlanCodeOf(card))}</span>
              </li>
            ))}
          </ul>
          {mythicOnTable && <p className="text-xs font-semibold text-fair-price">A mythic costs two picks: take it and this offer passes.</p>}
        </section>
      )}

      <section aria-labelledby="fair-deck" className="flex flex-col gap-2">
        <SectionTitle id="fair-deck">Your deck</SectionTitle>
        {deck.length === 0 ? (
          <p className="drawer-carved rounded-xl px-4 py-5 text-center text-sm font-semibold text-muted-foreground">No tile yet: the starter is on the board, your picks follow it.</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-muted-foreground">
              {deckLine(deck, draft.season)}
              {draft.passed > 0 && (
                <>
                  {" "}
                  · <span className="numeric">{formatInteger(draft.passed)}</span> {draft.passed === 1 ? "offer" : "offers"} passed
                </>
              )}
            </p>
            <DeckGrid cards={deck} renders={renders} label="Your deck so far" />
          </>
        )}
      </section>

      <DrawerFooter>
        <div data-slot="fair-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
          <span className="min-w-0 flex-1 text-sm font-semibold text-muted-foreground">This try is spent: leaving it ends it with no score.</span>
          <Button variant="secondary" className="h-12 shrink-0" loading={busy} onClick={onAbandon}>
            Leave this try
          </Button>
        </div>
      </DrawerFooter>
    </section>
  );
}

/**
 * The Fair (`/play/fair`, Play's Limited mode; the design proposal of 2026-11-09, one Fair a week on the client): a view of Play's
 * drawer, as the Joust's. The week: its day and its time left; last week's result while there is one (the tier, the place, Claim, the
 * champion with their deck); the season's stall; the viewer's week (tries left today, their best, its place and tier); the rules and
 * the tiers; in the footer the ranking and the gold Play (a new try, or the one still open). Its two other views: the open try's
 * draft (the offer of three tiles, the next offer, the deck so far) and the live ranking with each tier's bar.
 */
export function FairScene({ state, error, errorDetail, onRetry, now, me = null, view = "fair", ranking = null, draft = null, renders, busy = null, onPlay, onPick, onAbandon, onClaim, onRanking, onOpenPlayer }: FairSceneProps) {
  if (error)
    return (
      <InlineError
        title="The Fair"
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
  if (view === "ranking") return <RankingList ranking={ranking} me={me} onOpenPlayer={onOpenPlayer} />;
  if (view === "draft" && draft) return <DraftView draft={draft} renders={renders} busy={busy === "abandon"} onPick={onPick} onAbandon={onAbandon} />;
  if (state === null || view === "draft")
    return (
      <div aria-busy aria-label="Fair" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  const mine = state.me;
  const open = mine?.open ?? null;
  const canPlay = mine !== null && (open !== null || mine.triesLeft > 0);
  const tier = mine?.tier == null ? null : FAIR_TIERS[mine.tier]!;
  return (
    <section aria-label="Fair" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <Tag>
          {DAYS[state.day]} · day {state.day + 1} of 7
        </Tag>
        <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">This week's Fair</h2>
        <p role="timer" className="text-sm font-semibold text-muted-foreground">
          Ends Sunday at 24:00 UTC · in <span className="numeric text-foreground">{formatShortRemaining(state.endsAt - now)}</span>
        </p>
      </header>

      {state.result && <ResultCard result={state.result} claiming={busy === "claim"} renders={renders} onClaim={onClaim} onOpenPlayer={onOpenPlayer} />}

      <StallCard season={state.season} />

      {mine && (
        <section aria-labelledby="fair-week" className="flex flex-col gap-2">
          <SectionTitle id="fair-week">Your week</SectionTitle>
          <div role="group" aria-label="Your week" className="drawer-carved flex rounded-2xl py-1.5">
            <Figure value={formatInteger(mine.triesLeft)} word={mine.triesLeft === 1 ? "try left today" : "tries left today"} tone="text-primary" />
            <Figure value={mine.best === null ? "—" : formatInteger(mine.best)} word="your best try" />
            <Figure value={mine.place === null ? "—" : `#${formatInteger(mine.place)}`} word={tier ? tier.name : `of ${formatInteger(state.players)}`} />
          </div>
          {mine.best !== null && mine.place === null && (
            <p className="text-xs font-semibold text-muted-foreground">
              A best try counts from <span className="numeric">{formatInteger(FAIR_FLOOR)}</span> points.
            </p>
          )}
          {open && (
            <p data-slot="fair-open" className="drawer-carved flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground">
              <UiIcon name="tile-stack" px={28} className="drawer-icon size-7 shrink-0" />
              {open.stage === "draft" ? (
                <span>
                  Your draft waits at pick <span className="numeric font-bold text-foreground">{formatInteger(open.offers + 1)}</span>: <span className="numeric">{formatInteger(open.tiles)}</span> {open.tiles === 1 ? "tile" : "tiles"} in your deck.
                </span>
              ) : (
                <span>
                  Your game is on, a deck of <span className="numeric">{formatInteger(open.tiles)}</span> tiles: <span className="numeric font-bold text-foreground">{formatInteger(open.score)}</span> points so far.
                </span>
              )}
            </p>
          )}
        </section>
      )}

      <HowItGoes />

      <section aria-labelledby="fair-tiers" className="flex flex-col gap-2">
        <SectionTitle id="fair-tiers">Rewards</SectionTitle>
        <Tiers mine={mine?.tier ?? null} />
        <p className="text-[0.8125rem] font-medium text-muted-foreground">Claimed on Monday, by your best try's place among the week's players. No XP and no chest: the week pays in Cobbles.</p>
      </section>

      <DrawerFooter>
        <div data-slot="fair-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
          <Button variant="secondary" className="h-12 flex-1" onClick={onRanking}>
            Ranking
          </Button>
          {canPlay ? (
            <Button variant="ghost" style={GOLD_ACTION} className="relative h-12 flex-1 px-1 text-lg font-black text-foreground" disabled={busy === "start"} aria-busy={busy === "start" || undefined} onClick={onPlay}>
              {busy !== "start" && <GoldShine />}
              {open ? (open.stage === "draft" ? "Resume draft" : "Resume game") : `Start try ${mine!.triesToday + 1}`}
            </Button>
          ) : (
            <span className="flex-1 text-center text-sm font-semibold text-muted-foreground">{mine ? "No try left today" : "Sign in to play"}</span>
          )}
        </div>
      </DrawerFooter>
    </section>
  );
}
