import type { ReactNode } from "react";
import { FAIR_FLOOR, FAIR_OFFERS, FAIR_STALLS, FAIR_TIERS, FAIR_TRIES, fairInStall, fairIsMythic, fairPlanCodeOf, formatInteger, type FairOffer, type FairSeason } from "@paved/game-core";
import type { FairChampion, FairEntry, FairRanking, FairResult, FairState, FairTryLine } from "../../data/fair-source";
import { LEAGUES, leagueOf } from "../../lib/pvp-rules";
import { cn } from "../../lib/utils";
import { FooterTab, FooterTabsList } from "../containers/footer-tabs";
import { DrawerFooter } from "../containers/hud-drawer";
import { RankPlace } from "../containers/leaderboard";
import { LeaguePortrait } from "../containers/league-control";
import { formatShortRemaining } from "../elements/countdown";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { PlayerName } from "../elements/player-name";
import { RARITY_NAME, RarityBadge, rarityOf } from "../elements/rarity-badge";
import { SectionTitle } from "../elements/section-title";
import { TileRender, tileName, type TileRenders } from "../elements/tile-render";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent } from "../ui/tabs";

/** The Fair's views in Play's drawer: the week, the open try's draft, the live ranking. */
export type FairView = "fair" | "draft" | "ranking";

/** The ranking's tabs, its bottom navigation: the week's ranking, the viewer among their friends, their own tries. */
export const FAIR_RANKING_TABS = ["week", "friends", "tries"] as const;
export type FairRankingTab = (typeof FAIR_RANKING_TABS)[number];

/** The open try's draft as the scene shows it: the offer on the table, the deck so far (market cards), the offers passed. */
export interface FairDraftView {
  offer: FairOffer;
  deck: number[];
  /** The offers a mythic passed so far, by number. */
  passed: number[];
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
  /** The ranking's tab shown, and its change. */
  rankingTab?: FairRankingTab;
  onRankingTab?: (tab: FairRankingTab) => void;
  /** One of the viewer's own tries, from their list: its end, or the try still open. */
  onOpenTry?: (tryId: number) => void;
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

/** A tile's copies in a deck: the Collection's red badge (`tiles-scene.tsx`'s `DeckCount`), at the tile's top right corner. */
function DeckCount({ count }: { count: number }) {
  return (
    <span data-slot="tile-deck-count" className="numeric absolute top-0 right-0 grid h-5 min-w-5 place-items-center rounded-[0.3rem] bg-dock-badge px-1 text-xs leading-none font-bold text-foreground ring-2 ring-background">
      {formatInteger(count)}
    </span>
  );
}

/** A deck's tiles by plan: each plan's render, its count on the Collection's badge, its name under it. */
function DeckGrid({ cards, renders, label }: { cards: readonly number[]; renders?: TileRenders; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-3 gap-2 mobile:grid-cols-4 tablet:grid-cols-5">
      {deckByPlan(cards).map(({ plan, count }) => (
        <li key={plan} className="flex min-w-0 flex-col items-center gap-1">
          <span className="relative block aspect-square w-full">
            <span className="block size-full overflow-hidden rounded-lg">
              <TileRender plan={plan} theme={0} renders={renders} top alt="" />
            </span>
            <DeckCount count={count} />
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
  ["A mythic costs two picks:", "take one and the next offer passes."],
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

/**
 * The reward tiers (the proposal's rows): each one's name, a bar and its Cobbles. In the week's rules the bar is the tier's share of
 * the first one's Cobbles; in the ranking (`bars`, each tier's least score so far) it is that score's share of the best one (`top`),
 * with "from 4,700" under it and "you" on the viewer's own tier, lit.
 */
function Tiers({ bars, top = 0, mine }: { bars?: readonly (number | null)[]; top?: number; mine?: number | null }) {
  return (
    <ul aria-label="Reward tiers" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
      {FAIR_TIERS.map((tier, i) => {
        const from = bars ? (bars[i] ?? null) : null;
        const fill = bars ? (from === null || top <= 0 ? 0 : from / top) : tier.cobbles / FAIR_TIERS[0]!.cobbles;
        return (
          <li key={tier.name} data-own={mine === i || undefined} className={cn("flex min-h-11 items-center gap-3 px-3.5 py-1.5", mine === i && "bg-primary/15")}>
            <span className="w-16 shrink-0 text-sm font-bold">{tier.name}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-foreground/15">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%` }} />
              </span>
              {bars && (
                <span className="text-xs font-semibold text-muted-foreground">
                  {from === null ? "nobody yet" : <>from <span className="numeric">{formatInteger(from)}</span></>}
                  {mine === i && <span className="font-bold text-primary"> · you</span>}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <TokenIcon kind="cobbles" size="sm" px={20} />
              <span className="numeric text-outline min-w-8 text-right text-base font-bold text-primary">{formatInteger(tier.cobbles)}</span>
            </span>
          </li>
        );
      })}
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
        <div data-slot="fair-claim" className="flex min-h-11 items-center gap-3">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <TokenIcon kind="cobbles" size="md" className="size-7 shrink-0" px={28} />
            <span className="text-outline text-lg leading-tight font-bold">
              <span className="numeric text-primary">+{formatInteger(result.cobbles)}</span> Cobbles
            </span>
          </span>
          {result.claimed ? (
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-muted-foreground">
              <Icon name="check" size="sm" /> Claimed
            </span>
          ) : (
            <Button className="shrink-0 bg-success px-6 text-background" loading={claiming} onClick={() => onClaim?.(result.week)}>
              Claim
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs font-semibold text-muted-foreground">
          A best try of <span className="numeric">{formatInteger(FAIR_FLOOR)}</span> points or more counts: yours stayed under it.
        </p>
      )}
      {result.champion && <ChampionCard champion={result.champion} season={result.season} renders={renders} onOpenPlayer={onOpenPlayer} />}
    </section>
  );
}

/** A deck in a row's second line: "18 tiles · 2 mythics". */
const deckWords = (tiles: number, mythics: number): string => `${formatInteger(tiles)} ${tiles === 1 ? "tile" : "tiles"} · ${mythics === 0 ? "no mythic" : `${formatInteger(mythics)} ${mythics === 1 ? "mythic" : "mythics"}`}`;

/** A ranking row, the Ranking page's (`leaderboard.tsx`): its press layer rounded as the carved list it sits in; the viewer's own on the gold wash. */
const RANK_ROW = "state-layer flex w-full min-w-0 cursor-pointer items-center gap-3 px-3 py-2 text-left outline-none";
const PORTRAIT = { fontSize: "3rem" } as const;

/** A player of the Fair's ranking: their place, their portrait in their league's rim, their name over their deck, their best try. */
function RankRow({ entry, own, onOpen }: { entry: FairEntry; own: boolean; onOpen?: () => void }) {
  const { profile } = entry;
  const league = LEAGUES[profile.league] ?? leagueOf(profile.crowns);
  const deck = deckWords(entry.tiles, entry.mythics);
  return (
    <button type="button" data-slot="fair-player" data-own={own || undefined} aria-label={`${formatInteger(entry.place)}. ${profile.name ?? "A player"}${own ? " (you)" : ""}, ${formatInteger(entry.score)} points, ${deck}`} onClick={onOpen} className={cn(RANK_ROW, own && "bg-primary/15")}>
      <RankPlace place={entry.place} />
      <LeaguePortrait player={{ name: profile.name, address: profile.address }} look={profile.look} league={league} slot="ranking-rim" style={PORTRAIT} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <PlayerName name={profile.name} address={profile.address} className="text-outline max-w-full min-w-0 pr-0.5 text-sm leading-snug font-bold" />
        <span className="flex max-w-full flex-wrap items-center gap-x-1.5 text-xs font-semibold text-muted-foreground">
          {deck}
          {own && <span className="shrink-0 rounded-md bg-medal-1 px-1.5 leading-tight font-bold text-primary-foreground">You</span>}
        </span>
      </span>
      <span aria-hidden className="numeric text-outline shrink-0 text-base font-bold">
        {formatInteger(entry.score)}
      </span>
    </button>
  );
}

/** Rows left out of a list: the proposal's three dots. */
const Gap = () => (
  <li aria-hidden data-slot="fair-gap" className="py-0.5 text-center text-base leading-none font-bold tracking-widest text-muted-foreground">
    ···
  </li>
);

/** A list of ranked players, on the carved surface; `gapAfter`, the rows after which places are left out. */
function RankList({ label, entries, me, gapAfter = [], onOpenPlayer }: { label: string; entries: readonly FairEntry[]; me: string | null; gapAfter?: readonly number[]; onOpenPlayer?: (address: string) => void }) {
  return (
    <ol aria-label={label} className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
      {entries.flatMap((e, i) => [
        <li key={e.profile.address}>
          <RankRow entry={e} own={me !== null && sameAddress(e.profile.address, me)} onOpen={() => onOpenPlayer?.(e.profile.address)} />
        </li>,
        ...(gapAfter.includes(i) ? [<Gap key={`gap-${i}`} />] : []),
      ])}
    </ol>
  );
}

/** How many first places show over the viewer's own neighbourhood when they stand past the list (the proposal's three). */
const PODIUM = 3;

const NOTE = "drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground";
const STAGE_WORDS = { draft: "Draft in progress", game: "Game in progress", abandoned: "Left during its draft" } as const;

/** The viewer's own tries of the week, the newest first: its day and number, its deck, its score; the week's best tagged. A tap opens it. */
function TryList({ tries, onOpenTry }: { tries: readonly FairTryLine[]; onOpenTry?: (tryId: number) => void }) {
  if (tries.length === 0) return <p className={NOTE}>No try yet this week.</p>;
  return (
    <ol aria-label="Your tries" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
      {[...tries].reverse().map((t) => {
        const scored = t.over && t.stage === "game";
        const line = scored ? deckWords(t.tiles, t.mythics) : STAGE_WORDS[t.stage];
        return (
          <li key={t.id}>
            <button type="button" data-slot="fair-try" data-best={t.best || undefined} disabled={t.stage === "abandoned"} aria-label={`${DAYS[t.day]}, try ${t.try}: ${scored ? `${formatInteger(t.score)} points, ` : ""}${line}${t.best ? ", your best" : ""}`} onClick={() => onOpenTry?.(t.id)} className={cn(RANK_ROW, "min-h-14 disabled:cursor-default", t.best && "bg-primary/15")}>
              <UiIcon name="tile-stack" px={32} className="drawer-icon size-8 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="text-outline text-sm leading-snug font-bold">
                  {DAYS[t.day]} · try <span className="numeric">{t.try}</span>
                </span>
                <span className="flex max-w-full flex-wrap items-center gap-x-1.5 text-xs font-semibold text-muted-foreground">
                  {line}
                  {t.best && <span className="shrink-0 rounded-md bg-medal-1 px-1.5 leading-tight font-bold text-primary-foreground">Best</span>}
                </span>
              </span>
              <span aria-hidden className="numeric text-outline shrink-0 text-base font-bold">
                {scored ? formatInteger(t.score) : "—"}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const TAB_ART = { week: "trophy", friends: "friends", tries: "tile-stack" } as const;
const TAB_LABEL: Record<FairRankingTab, string> = { week: "This week", friends: "Friends", tries: "My tries" };

/**
 * The Fair's ranking (the proposal's screen, its tabs as the app's bottom navigation, `FooterTabsList`). This week: the first places
 * (the first three, then the places around the viewer when they stand past the list), each player's portrait, deck and best try, then
 * each tier's bar so far and the count of players. Friends: the viewer among the players they follow who follow them back. My tries:
 * the viewer's own tries of the week.
 */
function RankingView({ ranking, me, now, endsAt, tab, onTab, onOpenPlayer, onOpenTry }: { ranking: FairRanking | null; me: string | null; now: number; endsAt: number | null; tab: FairRankingTab; onTab?: (tab: FairRankingTab) => void; onOpenPlayer?: (address: string) => void; onOpenTry?: (tryId: number) => void }) {
  const far = ranking !== null && ranking.around.length > 0;
  const shown = ranking === null ? [] : far ? [...ranking.entries.slice(0, PODIUM), ...ranking.around] : ranking.entries;
  const last = shown[shown.length - 1];
  return (
    <Tabs
      value={tab}
      // Radix calls it twice on a press (pointer down, then focus): a change to the tab shown is no change.
      onValueChange={(next) => {
        if (next !== tab && (FAIR_RANKING_TABS as readonly string[]).includes(next)) onTab?.(next as FairRankingTab);
      }}
      className="flex flex-col gap-3"
    >
      {endsAt !== null && (
        <span role="timer" className="w-fit rounded-md bg-info px-2 py-0.5 text-xs leading-4 font-extrabold tracking-widest text-background uppercase">
          Live · <span className="numeric">{formatShortRemaining(endsAt - now)}</span> left
        </span>
      )}
      {ranking === null ? (
        <div aria-busy className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <TabsContent value="week" className="flex flex-col gap-3">
            {shown.length === 0 ? <p className={NOTE}>No try counts yet this week.</p> : <RankList label="Fair ranking" entries={shown} me={me} gapAfter={far ? [PODIUM - 1, ...(last && last.place < ranking.players ? [shown.length - 1] : [])] : []} onOpenPlayer={onOpenPlayer} />}
            <section aria-labelledby="fair-tiers-live" className="flex flex-col gap-2">
              <SectionTitle id="fair-tiers-live">The tiers so far</SectionTitle>
              <Tiers bars={ranking.bars} top={ranking.entries[0]?.score ?? 0} mine={ranking.me?.tier ?? null} />
              <p className="text-[0.8125rem] font-medium text-muted-foreground">
                <span className="numeric">{formatInteger(ranking.players)}</span> {ranking.players === 1 ? "player has" : "players have"} a best try of <span className="numeric">{formatInteger(FAIR_FLOOR)}</span> or more. The bars move until Sunday; Monday fixes them.
              </p>
            </section>
          </TabsContent>
          <TabsContent value="friends" className="flex flex-col gap-3">
            {ranking.friends.length === 0 ? <p className={NOTE}>No friend has a counted try yet: friends are the players you follow who follow you back.</p> : <RankList label="Friends' ranking" entries={ranking.friends} me={me} onOpenPlayer={onOpenPlayer} />}
          </TabsContent>
          <TabsContent value="tries" className="flex flex-col gap-3">
            <TryList tries={ranking.tries} onOpenTry={onOpenTry} />
          </TabsContent>
        </>
      )}
      <DrawerFooter>
        <FooterTabsList aria-label="Fair ranking">
          {FAIR_RANKING_TABS.map((id) => (
            <FooterTab key={id} value={id} label={TAB_LABEL[id]} art={<UiIcon name={TAB_ART[id]} px={36} className="drawer-icon size-9" />} />
          ))}
        </FooterTabsList>
      </DrawerFooter>
    </Tabs>
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
          <TileRender plan={plan} theme={0} renders={renders} alt="" />
        </span>
        <span className="text-outline text-sm leading-tight font-bold">{name}</span>
        <RarityBadge rarity={rarity} />
        <span className="text-xs leading-tight font-semibold text-muted-foreground">{mythic ? (passes !== null ? "2 picks" : "Mythic") : stall ? `${SEASON_NAME[season]} stall` : "Market"}</span>
      </button>
    </li>
  );
}

/** What became of each of the draft's offers, 1 to `FAIR_OFFERS`: a tile taken, a mythic taken, passed by a mythic, on the table, to come. */
export function draftSteps(draft: Pick<FairDraftView, "offer" | "deck" | "passed">): ("taken" | "mythic" | "passed" | "current" | "todo")[] {
  let picked = 0;
  return Array.from({ length: FAIR_OFFERS }, (_, i) => {
    const number = i + 1;
    if (number === draft.offer.number) return "current";
    if (number > draft.offer.number) return "todo";
    if (draft.passed.includes(number)) return "passed";
    return fairIsMythic(draft.deck[picked++]!) ? "mythic" : "taken";
  });
}

const STEP = { taken: "bg-primary", mythic: "bg-fair-mythic", passed: "bg-fair-mythic/35", current: "bg-foreground", todo: "bg-foreground/15" } as const;

/** The draft's progress, a segment per offer (the proposal's bar): gold for a tile taken, purple for a mythic and, paler, the offer it passed. */
function DraftProgress({ draft }: { draft: FairDraftView }) {
  const steps = draftSteps(draft);
  const mythics = steps.filter((s) => s === "mythic").length;
  return (
    <div role="img" data-slot="fair-progress" aria-label={`Offer ${draft.offer.number} of ${FAIR_OFFERS}: ${draft.deck.length} taken${mythics ? `, ${mythics} mythic` : ""}${draft.passed.length ? `, ${draft.passed.length} passed` : ""}`} className="flex gap-1">
      {steps.map((step, i) => (
        <span key={i} data-step={step} className={cn("h-2 min-w-0 flex-1 rounded-full", STEP[step])} />
      ))}
    </div>
  );
}

/** The open try's draft: its progress, the offer on the table, the deck so far, and the way out. The next offer is not shown (the owner's ask of 2026-11-14: a draft does not show what comes next). */
function DraftView({ draft, renders, busy, onPick, onAbandon }: { draft: FairDraftView; renders?: TileRenders; busy: boolean; onPick?: (choice: number) => void; onAbandon?: () => void }) {
  const { offer, deck } = draft;
  const mythicOnTable = offer.cards.some(fairIsMythic);
  return (
    <section aria-label="Draft" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <Tag>
          Pick {offer.number} of {FAIR_OFFERS}
        </Tag>
        <DraftProgress draft={draft} />
        <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">Take one tile</h2>
        <p className="text-sm font-semibold text-muted-foreground">The tiles you take are your deck. A tile you take leaves the market.</p>
      </header>

      <ul aria-label={`Offer ${offer.number}`} className="flex items-stretch gap-2">
        {offer.cards.map((card, i) => (
          <OfferTile key={card} card={card} stall={offer.stall && i === 0} season={draft.season} renders={renders} passes={offer.number < FAIR_OFFERS ? offer.number + 1 : null} disabled={busy} onPick={() => onPick?.(i)} />
        ))}
      </ul>

      {mythicOnTable && offer.number < FAIR_OFFERS && <p data-slot="fair-price" className="text-sm font-semibold text-fair-price">A mythic costs two picks: take it and the next offer passes.</p>}

      <section aria-labelledby="fair-deck" className="flex flex-col gap-2">
        <SectionTitle id="fair-deck">Your deck</SectionTitle>
        {deck.length === 0 ? (
          <p className="drawer-carved rounded-xl px-4 py-5 text-center text-sm font-semibold text-muted-foreground">No tile yet: the starter is on the board, your picks follow it.</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-muted-foreground">
              {deckLine(deck, draft.season)}
              {draft.passed.length > 0 && (
                <>
                  {" "}
                  · <span className="numeric">{formatInteger(draft.passed.length)}</span> {draft.passed.length === 1 ? "offer" : "offers"} passed
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
 * draft (its progress bar, the offer of three tiles, the deck so far) and the live ranking with each tier's bar.
 */
export function FairScene({ state, error, errorDetail, onRetry, now, me = null, view = "fair", ranking = null, rankingTab = "week", onRankingTab, onOpenTry, draft = null, renders, busy = null, onPlay, onPick, onAbandon, onClaim, onRanking, onOpenPlayer }: FairSceneProps) {
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
  if (view === "ranking") return <RankingView ranking={ranking} me={me} now={now} endsAt={state?.endsAt ?? null} tab={rankingTab} onTab={onRankingTab} onOpenPlayer={onOpenPlayer} onOpenTry={onOpenTry} />;
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
              {/* One word (the owner's ask of 2026-11-14): the page says which try and what is open. */}
              {open ? "Resume" : "Start"}
            </Button>
          ) : (
            <span className="flex-1 text-center text-sm font-semibold text-muted-foreground">{mine ? "No try left today" : "Sign in to play"}</span>
          )}
        </div>
      </DrawerFooter>
    </section>
  );
}
