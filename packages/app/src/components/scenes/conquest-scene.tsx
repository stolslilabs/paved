import type { ReactNode } from "react";
import {
  CONQUEST_ELIGIBLE_DAYS,
  CONQUEST_LAST_DAY,
  CONQUEST_OFFERINGS_WAITING,
  CONQUEST_ORDERS,
  CONQUEST_PHASES,
  CONQUEST_PHASE_DAYS,
  formatInteger,
  type ConquestBranch,
  type ConquestPhase,
  type ConquestPlayPhase,
  type ConquestStructure,
} from "@paved/game-core";
import type { ConquestGiven, ConquestMemberRow, ConquestOptions, ConquestRanking, ConquestScoredState, ConquestState, ConquestZoneState } from "../../data/conquest-source";
import { rankName } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import { ConquestWorld, ConquestZoneMap } from "../containers/conquest-map";
import { CONQUEST_PHASE_NAME, ConquestFinalEnd, ConquestMembers, ConquestPhaseEnd, ConquestRanks, ConquestResultRow, type ConquestMemberBy, type ConquestRankBy } from "../containers/conquest-ranks";
import { ConquestTree, conquestBranchName, conquestNextLevel } from "../containers/conquest-tree";
import { FooterTab, FooterTabsList } from "../containers/footer-tabs";
import { DrawerFooter } from "../containers/hud-drawer";
import { ConquestArt, KnowledgeIcon, ordinal } from "../elements/conquest-art";
import { formatShortRemaining } from "../elements/countdown";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { modeSceneSources, type ConquestArtName } from "../elements/play-art";
import { RARITY_NAME } from "../elements/rarity-badge";
import { formatPoints } from "../elements/score";
import { SectionTitle } from "../elements/section-title";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { TokenIcon } from "../elements/token-icon";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent } from "../ui/tabs";

/** The Conquest's views in Play's drawer: its page, the map (a zone), the knowledge tree, the ranking, the members, the requests, the rules, a result. */
export type ConquestView = "hub" | "map" | "tree" | "ranking" | "members" | "requests" | "rules" | "result";
/** The result a result's view shows: a phase's, this Conquest's final one, or the last Conquest's. */
export type ConquestResultOf = ConquestPlayPhase | "final" | "last";

/** What the viewer's last act did, said at the top of the view. */
export type ConquestNotice =
  | { kind: "offer"; knowledge: number; order: boolean }
  | { kind: "explore"; knowledge: number }
  | { kind: "request" }
  | { kind: "give"; given: ConquestGiven }
  | { kind: "research"; branch: ConquestBranch; level: number }
  | { kind: "register" }
  | { kind: "claim"; cobbles: number };

export interface ConquestSceneProps {
  /** The Conquest as the viewer sees it; null while it is read. */
  state: ConquestState | null;
  /** Why it could not be read, with Retry. */
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
  /** Seconds since the epoch: the phase's time left, the next Offering. */
  now: number;
  view?: ConquestView;
  /** The result shown (the result's view). */
  result?: ConquestResultOf | null;
  /** The zone shown (the map's view); null while it is read. */
  zone?: ConquestZoneState | null;
  /** The cell picked on the map, and what fits it. */
  cell?: { x: number; y: number } | null;
  options?: ConquestOptions | null;
  /** The allegiances by points (the ranking's view); null while it is read. */
  ranking?: ConquestRanking | null;
  /** The allegiance's members (the members' view); null while it is read. */
  members?: readonly ConquestMemberRow[] | null;
  /** The write on its way: its button waits. */
  busy?: "register" | "offer" | "explore" | "request" | "give" | "research" | "claim" | null;
  /** The branch being bought. */
  researching?: ConquestBranch | null;
  notice?: ConquestNotice | null;
  tileArt?: TileArt;
  onRegister?: () => void;
  onOffer?: () => void;
  onExplore?: (cell: { x: number; y: number }) => void;
  onRequest?: (tile: { x: number; y: number; plan: number; orientation: number }) => void;
  onGive?: (request: number) => void;
  onResearch?: (branch: ConquestBranch) => void;
  /** The Cobbles of a Conquest: one part of it (a phase, the final rank), or everything due. */
  onClaim?: (conquest: number, part?: ConquestPlayPhase | "final") => void;
  onZone?: (zone: number) => void;
  onCell?: (cell: { x: number; y: number } | null) => void;
  onView?: (view: ConquestView) => void;
  /** A result's view: a phase's, the final one, the last Conquest's. */
  onResult?: (of: ConquestResultOf) => void;
  /** Without an allegiance: the Allegiance page, to find one. */
  onAllegiance?: () => void;
  onOpenPlayer?: (address: string) => void;
}

const PHASE_NAME: Record<ConquestPhase, string> = { registration: "Registration", ...CONQUEST_PHASE_NAME, results: "Results" };
const STRUCTURE_NAME: Record<ConquestStructure, string> = { road: "road", city: "city", forest: "forest", wonder: "wonder", great: "Great Wonder" };

/** A line of a briefing or of the rules, with its painting. */
interface Rule {
  art: UiIconName;
  text: string;
}

/** Each phase's briefing: its goals and its rules. */
const BRIEFING: Record<ConquestPhase, readonly Rule[]> = {
  registration: [
    { art: "guild", text: "An Officer or the Leader registers the allegiance during these three days. Every registered allegiance gets a province of its own in one shared world." },
    { art: "crown", text: "The provinces are given by the season's best Joust rating: the best allegiance at the centre of the world." },
    { art: "season", text: "Then three phases of a week each: Foundation, Awakening, Frontiers. Six days of play, then a rest day." },
  ],
  foundation: [
    { art: "explore", text: "Explore your province: one cell a day each. A cell must be explored before anyone builds on it." },
    { art: "village", text: "Grow from your capital: a tile goes next to one of yours, edges matching, and can never be taken back." },
    { art: "wonder", text: "Reach your two province wonders: a wonder closes when its eight neighbours are built." },
  ],
  awakening: [
    { art: "city", text: "Close your structures: a closed road, city, forest or wonder pays the allegiance with the most tiles in it. An open one pays nothing." },
    { art: "wonder", text: "The Great Wonders appear in the middle of the free zones: scout the way to yours." },
    { art: "shield", text: "Ready your borders: in Frontiers every zone opens, and your neighbours can build next to your structures." },
  ],
  frontiers: [
    { art: "swords", text: "Everything opens: explore and build in the free zones and in the other provinces, always next to a tile of yours." },
    { art: "trophy", text: "The majority wins: out-number a rival in its structure to take it, or tie it so that nobody scores." },
    { art: "lock", text: `Close before day ${CONQUEST_LAST_DAY} ends: a structure still open then scores nothing.` },
  ],
  results: [
    { art: "trophy", text: "The Conquest is over: the final rank pays Cobbles to every member with enough days of Offerings, and the podium wears its crest for the whole next season." },
    { art: "season", text: "A new world is drawn at the next Conquest: its registration opens when this one's results end." },
  ],
};

const RULES: readonly Rule[] = [
  { art: "sun", text: `The Offering: one every 2 hours, 1 Knowledge each, up to ${CONQUEST_OFFERINGS_WAITING} waiting. Your first of the day also gives the allegiance one order, if you were a member when the day began.` },
  { art: "explore", text: "Exploration: one cell a day in the open zones. Its Knowledge is drawn when you explore it: 11 on average in a province, 20 in a free zone." },
  { art: "hammer", text: `Building: an Officer or the Leader asks for a tile on a cell; a member who holds it gives it and it is built at once, for one order (${CONQUEST_ORDERS} a day at most, lost at midnight UTC). A gift is final and pays Cobbles: 1, 2 or 5 by rarity.` },
  { art: "medal", text: `Rewards: Cobbles after each phase and at the end, for the members with Offerings on enough days (${CONQUEST_ELIGIBLE_DAYS} for the final rank).` },
];

function Rules({ id, title, rules }: { id: string; title: string; rules: readonly Rule[] }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <SectionTitle id={id}>{title}</SectionTitle>
      <ul className="drawer-carved flex flex-col gap-2.5 rounded-2xl px-3.5 py-3">
        {rules.map((rule) => (
          <li key={rule.text} className="flex items-start gap-3 text-[0.8125rem] font-semibold text-muted-foreground">
            <UiIcon name={rule.art} px={24} className="drawer-icon size-6 shrink-0" />
            <span>{rule.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const scoredLine = (s: ConquestScoredState): string =>
  `A ${STRUCTURE_NAME[s.kind]} of ${s.size} closed, ${s.own} to ${s.rival}: ${s.won ? `yours, +${formatPoints(s.points)}` : s.winner ? `won by ${s.winner.name}` : "a tie, nobody scores"}.`;

/** What the last act did, in a line or two. */
function ActNotice({ notice }: { notice: ConquestNotice }) {
  const [title, body]: [string, ReactNode] =
    notice.kind === "offer"
      ? [`+${formatInteger(notice.knowledge)} Knowledge`, notice.order ? "Your first Offering of the day gave the allegiance one order." : "Your Offerings are made."]
      : notice.kind === "explore"
        ? [`+${formatInteger(notice.knowledge)} Knowledge`, notice.knowledge >= 40 ? "A rare find! The cell is open for building." : "The cell is explored: it is open for building."]
        : notice.kind === "request"
          ? ["Request posted", "Any member who holds the tile can give it: it is built at once."]
          : notice.kind === "give"
            ? [`Tile built · +${notice.given.cobbles} ${notice.given.cobbles === 1 ? "Cobble" : "Cobbles"}`, notice.given.scored.length > 0 ? notice.given.scored.map(scoredLine).join(" ") : `Built in your name. ${notice.given.ordersLeft} ${notice.given.ordersLeft === 1 ? "order" : "orders"} left today.`]
            : notice.kind === "research"
              ? ["Level bought", `${conquestBranchName(notice.branch)} is level ${notice.level}.`]
              : notice.kind === "register"
                ? ["Registered", "Your allegiance gets its province when day 1 begins."]
                : [`+${formatInteger(notice.cobbles)} Cobbles`, "Claimed."];
  return (
    <Notice tone="info" title={title}>
      <span data-slot="conquest-notice">{body}</span>
    </Notice>
  );
}

/** A page's one action, in one word, gold; what it does is said before it. */
function Primary({ word, name, busy = false, disabled = false, onAct, className }: { word: string; /** The accessible name, where the word alone says too little. */ name?: string; busy?: boolean; disabled?: boolean; onAct?: () => void; className?: string }) {
  return (
    <Button variant="ghost" style={disabled ? undefined : GOLD_ACTION} className={cn("relative h-12 px-4 text-lg font-black text-foreground", disabled && "bg-secondary", className)} disabled={disabled || busy} aria-busy={busy || undefined} aria-label={name} onClick={onAct}>
      {!disabled && !busy && <GoldShine />}
      {word}
    </Button>
  );
}

/** The Cobbles a Claim pays, said before its button. */
function Reward({ cobbles, children }: { cobbles: number; children?: ReactNode }) {
  return (
    <span data-slot="conquest-reward" className="flex min-w-0 flex-1 flex-col">
      <span className="flex items-center gap-1.5">
        <TokenIcon kind="cobbles" size="sm" px={24} className="size-6" />
        <span className="numeric text-outline text-xl leading-none font-bold">+{formatInteger(cobbles)}</span>
        <span className="text-sm font-semibold text-muted-foreground">Cobbles</span>
      </span>
      {children && <span className="text-xs font-semibold text-muted-foreground">{children}</span>}
    </span>
  );
}

/** One of the daily ritual's three cards: its painting, its name, what waits, then its one action. */
function Ritual({ slot, art, title, lead, sub, word, name, disabled, busy, onAct }: { slot: string; art: ConquestArtName; title: string; lead: ReactNode; sub: ReactNode; word: string; name: string; disabled?: boolean; busy?: boolean; onAct?: () => void }) {
  return (
    <li data-slot={slot} className="drawer-carved flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1.5 pt-2.5 pb-1.5 text-center">
      <ConquestArt name={art} px={56} className="rounded-xl" />
      <span className="text-outline text-sm leading-tight font-bold wrap-anywhere">{title}</span>
      <span className="text-[0.8125rem] leading-tight font-bold text-primary">{lead}</span>
      <span className="min-h-8 text-xs leading-tight font-semibold text-muted-foreground">{sub}</span>
      <Primary word={word} name={name} disabled={disabled} busy={busy} onAct={onAct} className="mt-auto h-11 w-full px-1 text-base" />
    </li>
  );
}

const RANK_TABS: readonly { id: ConquestRankBy; label: string; art: UiIconName }[] = [
  { id: "foundation", label: "Foundation", art: "village" },
  { id: "awakening", label: "Awakening", art: "sun" },
  { id: "frontiers", label: "Frontiers", art: "swords" },
  { id: "final", label: "Final", art: "trophy" },
];
const MEMBER_TABS: readonly { id: ConquestMemberBy; label: string }[] = [
  { id: "tiles", label: "Tiles" },
  { id: "knowledge", label: "Knowledge" },
  { id: "explored", label: "Explored" },
];

/**
 * The Conquest (`/play/conquest`, Play's Limited mode; the design proposal of 8 and 9 November 2026, looped on the client): a view of
 * Play's drawer, as the Joust's. Its page, as the proposal draws it: the phase on the world's painting with its day and its time left,
 * the allegiance's row, the day's orders, the daily ritual's three cards (the Offering, the Exploration, the Requests), each with one
 * action in one word, the results over, and the Knowledge's row. Its other views: the map, the knowledge tree, the ranking (a tab of
 * the foot per phase), the members (a tab per figure), the open requests, the goals and rules, and a result (a phase over, the
 * Conquest over), whose Cobbles are said before its Claim.
 */
export function ConquestScene({
  state,
  error,
  errorDetail,
  onRetry,
  now,
  view = "hub",
  result = null,
  zone = null,
  cell = null,
  options = null,
  ranking = null,
  members = null,
  busy = null,
  researching = null,
  notice = null,
  tileArt,
  onRegister,
  onOffer,
  onExplore,
  onRequest,
  onGive,
  onResearch,
  onClaim,
  onZone,
  onCell,
  onView,
  onResult,
  onAllegiance,
  onOpenPlayer,
}: ConquestSceneProps) {
  if (error)
    return (
      <InlineError
        title="The Conquest"
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
  if (state === null || (view === "map" && zone === null) || (view === "ranking" && ranking === null) || (view === "members" && members === null))
    return (
      <div aria-busy aria-label="Conquest" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  const mine = state.allegiance;
  const me = state.me;
  const playing = state.phase !== "registration" && state.phase !== "results";
  const empty = (text: string) => <p className="drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">{text}</p>;

  if (view === "result") {
    const phase = result !== null && result !== "final" && result !== "last" ? state.results.find((r) => r.phase === result) : undefined;
    const final = result === "last" ? state.previous : result === "final" ? state.final : null;
    if (phase) {
      const after = CONQUEST_PHASES[CONQUEST_PHASES.indexOf(phase.phase) + 1];
      const next = after ? `Next: ${CONQUEST_PHASE_NAME[after]}, from day ${CONQUEST_PHASE_DAYS[after].first}.` : "Next: the final rank and its crest.";
      const due = phase.claimed ? 0 : phase.cobbles;
      return (
        <>
          {notice && <ActNotice notice={notice} />}
          <ConquestPhaseEnd result={phase} rest={state.rest && state.day === CONQUEST_PHASE_DAYS[phase.phase].result} next={next} />
          <DrawerFooter>
            <div data-slot="conquest-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
              {due > 0 ? <Reward cobbles={due}>for {ordinal(phase.place)} place</Reward> : <span className="flex-1 text-sm font-semibold text-muted-foreground">{phase.claimed ? "Cobbles claimed." : "No Cobbles: not enough days of Offerings."}</span>}
              <Primary word="Claim" name={`Claim ${formatInteger(due)} Cobbles`} disabled={due === 0} busy={busy === "claim"} onAct={() => onClaim?.(state.conquest, phase.phase)} />
            </div>
          </DrawerFooter>
        </>
      );
    }
    if (final) {
      const last = result === "last";
      // This Conquest's final rank alone; the last Conquest's, with whatever of its phases was left.
      const due = last ? final.toClaim : final.claimed ? 0 : final.cobbles;
      return (
        <>
          {notice && <ActNotice notice={notice} />}
          <ConquestFinalEnd final={final} last={last} />
          {!last && (
            <Button variant="secondary" className="mt-3 h-12 w-full" onClick={() => onView?.("ranking")}>
              See the final ranking
            </Button>
          )}
          <DrawerFooter>
            <div data-slot="conquest-footer" className="flex min-h-16 items-center gap-3 px-4 py-2">
              {due > 0 ? <Reward cobbles={due}>for {ordinal(final.place)} place</Reward> : <span className="flex-1 text-sm font-semibold text-muted-foreground">{final.claimed ? "Cobbles claimed." : "No Cobbles: not enough days of Offerings."}</span>}
              <Primary word="Claim" name={`Claim ${formatInteger(due)} Cobbles`} disabled={due === 0} busy={busy === "claim"} onAct={() => onClaim?.(final.conquest, last ? undefined : "final")} />
            </div>
          </DrawerFooter>
        </>
      );
    }
    return empty("This result is not in yet.");
  }

  if (view === "ranking") {
    const now_ = state.phase === "registration" ? "final" : state.phase === "results" ? "final" : state.phase;
    return (
      <Tabs defaultValue={now_} className="flex flex-col gap-3">
        <SectionTitle>World {state.world}</SectionTitle>
        {RANK_TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="flex flex-col gap-3">
            {ranking!.rows.length === 0 ? empty("The world is drawn when day 1 begins.") : <ConquestRanks rows={ranking!.rows} by={tab.id} label={`Allegiances by ${tab.id === "final" ? "points" : `${tab.label}'s points`}`} />}
            <p className="flex items-start gap-3 rounded-2xl border border-primary/50 bg-card px-3.5 py-3 text-sm font-semibold text-muted-foreground">
              <TokenIcon kind="cobbles" size="sm" px={24} className="size-6 shrink-0" />
              <span>
                <strong className="text-foreground">{tab.id === "final" ? "The final podium" : "Top 3 of the phase"}:</strong> {tab.id === "final" ? "a crest for the whole next season, and Cobbles for each eligible member by the allegiance's place." : "more Cobbles for each eligible member; every allegiance is paid."}
                {tab.id === state.phase && (
                  <>
                    {" "}
                    The phase closes in <span className="numeric text-foreground">{formatShortRemaining(state.phaseEndsAt - now)}</span>.
                  </>
                )}
              </span>
            </p>
          </TabsContent>
        ))}
        <DrawerFooter>
          <FooterTabsList aria-label="Ranking">
            {RANK_TABS.map((tab) => (
              <FooterTab key={tab.id} value={tab.id} label={tab.label} art={<UiIcon name={tab.art} px={36} className="drawer-icon size-9" />} />
            ))}
          </FooterTabsList>
        </DrawerFooter>
      </Tabs>
    );
  }

  if (view === "members") {
    if (members!.length === 0) return empty("Your allegiance is not in this Conquest.");
    const days = me?.days ?? 0;
    const eligible = days >= CONQUEST_ELIGIBLE_DAYS;
    return (
      <Tabs defaultValue="tiles" className="flex flex-col gap-3">
        <p title={state.guild?.name} className="text-outline truncate font-display text-2xl leading-tight tracking-wide">
          {state.guild?.name}
        </p>
        {MEMBER_TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            <ConquestMembers rows={members!} by={tab.id} onOpenPlayer={onOpenPlayer} />
          </TabsContent>
        ))}
        <p data-slot="conquest-eligibility" className="drawer-carved flex items-start gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold text-muted-foreground">
          <Icon name={eligible ? "check" : "info"} size="sm" className={cn("mt-0.5", eligible ? "text-success" : "text-warning")} />
          <span>
            {eligible ? "You are eligible for the final rewards" : "Not eligible for the final rewards yet"}: Offerings on <strong className="numeric text-foreground">{days}</strong> {days === 1 ? "day" : "days"} so far (<span className="numeric">{CONQUEST_ELIGIBLE_DAYS}</span> needed by D
            <span className="numeric">{CONQUEST_LAST_DAY}</span>).
          </span>
        </p>
        <DrawerFooter>
          <FooterTabsList aria-label="Members">
            <FooterTab value="tiles" label="Tiles" art={<UiIcon name="hammer" px={36} className="drawer-icon size-9" />} />
            <FooterTab value="knowledge" label="Knowledge" art={<KnowledgeIcon px={36} />} />
            <FooterTab value="explored" label="Explored" art={<UiIcon name="explore" px={36} className="drawer-icon size-9" />} />
          </FooterTabsList>
        </DrawerFooter>
      </Tabs>
    );
  }

  if (view === "tree")
    return (
      <section aria-label="Knowledge tree" className="flex flex-col gap-3">
        {notice && <ActNotice notice={notice} />}
        {mine ? (
          <>
            <ConquestTree levels={mine.levels} knowledge={mine.knowledge} earned={mine.earned} leads={state.leads} open={state.day >= 1 && state.day <= CONQUEST_LAST_DAY} busy={busy === "research" ? researching : null} onResearch={onResearch} />
            {!state.leads && <p className="text-xs font-semibold text-muted-foreground">The Leader and the Officers buy the levels, in order, until the end of Frontiers.</p>}
          </>
        ) : (
          empty("Your allegiance has no tree in this Conquest.")
        )}
      </section>
    );

  if (view === "requests")
    return (
      <section aria-label="Requests" className="flex flex-col gap-3">
        {notice && <ActNotice notice={notice} />}
        <p className="text-sm font-semibold text-muted-foreground">
          An Officer or the Leader asks for a tile on a cell. Give one you hold: it is built at once, in your name, for one order.{" "}
          {mine && (
            <>
              <strong className="numeric text-foreground">{mine.orders.left}</strong> {mine.orders.left === 1 ? "order" : "orders"} left today.
            </>
          )}
        </p>
        {state.requests.length === 0 ? (
          empty(state.rest ? "No request on a rest day." : state.leads ? "No open request. Ask for a tile on the map." : "No open request. An Officer or the Leader asks for the tiles.")
        ) : (
          <ul aria-label="Open requests" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
            {state.requests.map((r) => (
              <li key={r.id} data-request={r.id} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                <TileChip plan={r.plan} orientation={r.orientation} art={tileArt} className="size-11" />
                <button type="button" onClick={() => onZone?.(r.zone)} className="flex min-h-11 min-w-32 flex-1 cursor-pointer flex-col items-start justify-center text-left">
                  <span className="text-sm font-bold">
                    {tileName(r.plan)} · {r.zoneName}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {RARITY_NAME[r.rarity]} · <span className="numeric">{r.holders}</span> {r.holders === 1 ? "member holds" : "members hold"} one · {r.held > 0 ? <strong className="text-info">you hold {r.held}</strong> : "you hold none"}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-bold text-primary">
                    <TokenIcon kind="cobbles" size="sm" px={14} className="size-3.5" />
                    <span className="numeric">+{r.cobbles}</span> for the gift
                  </span>
                </button>
                <Primary word="Give" name={`Give ${tileName(r.plan)} for ${r.cobbles} ${r.cobbles === 1 ? "Cobble" : "Cobbles"}`} disabled={r.held === 0 || (mine?.orders.left ?? 0) < 1} busy={busy === "give"} onAct={() => onGive?.(r.id)} className="ml-auto h-11 text-base" />
              </li>
            ))}
          </ul>
        )}
      </section>
    );

  if (view === "rules")
    return (
      <section aria-label="Goals and rules" className="flex flex-col gap-4">
        <Rules id="conquest-briefing" title={PHASE_NAME[state.phase]} rules={BRIEFING[state.phase]} />
        <Rules id="conquest-rules" title="The rules" rules={RULES} />
      </section>
    );

  if (view === "map" && zone)
    return (
      <section aria-label={`Zone ${zone.zone.name}`} className="flex flex-col gap-3">
        {notice && <ActNotice notice={notice} />}
        <ConquestWorld side={state.side} zones={state.zones} selected={zone.zone.index} onZone={onZone} />
        <p data-slot="conquest-zone-head" className="text-sm font-semibold text-muted-foreground">
          <strong className="text-foreground">{zone.zone.name}</strong> · {zone.zone.mine ? "your province" : zone.zone.guild ? `the province of ${zone.zone.guild.name}` : zone.zone.province ? "an empty province" : "a free zone"} · <span className="numeric text-foreground">{formatInteger(zone.zone.explored)}</span> explored ·{" "}
          <span className="numeric text-foreground">{formatInteger(zone.zone.tiles)}</span> {zone.zone.tiles === 1 ? "tile" : "tiles"}
          {mine && (
            <>
              {" "}
              · <span className="numeric text-foreground">{mine.orders.left}</span> {mine.orders.left === 1 ? "order" : "orders"} left
            </>
          )}
        </p>
        <ConquestZoneMap zone={zone} leads={state.leads} orders={mine?.orders.left ?? 0} cell={cell} onCell={onCell} options={options} busy={busy === "explore" || busy === "request" || busy === "give" ? busy : null} onExplore={onExplore} onRequest={onRequest} onGive={onGive} tileArt={tileArt} />
        <p className="text-xs font-medium text-muted-foreground">Your allegiance's tiles are outlined in blue, the others' in red. A light cell is explored, a dark one is in the fog; a framed tile is a request.</p>
      </section>
    );

  // The page.
  const phaseDays = playing ? CONQUEST_PHASE_DAYS[state.phase as ConquestPlayPhase] : null;
  const nextPhase = playing ? CONQUEST_PHASES[CONQUEST_PHASES.indexOf(state.phase as ConquestPlayPhase) + 1] : undefined;
  const next = mine ? conquestNextLevel(mine.levels) : null;
  const held = state.requests.filter((r) => r.held > 0).length;
  const headline = state.phase === "registration" ? "Before day 1" : state.phase === "results" ? `Day ${state.day} of 28` : `Day ${state.day} of ${CONQUEST_LAST_DAY}`;
  const left = formatShortRemaining(state.phaseEndsAt - now);
  return (
    <section aria-label="Conquest" className="flex flex-col gap-3">
      <header data-slot="conquest-phase" className="relative isolate flex min-h-32 flex-col justify-end gap-1 overflow-hidden rounded-2xl px-3.5 py-3">
        <img {...modeSceneSources("conquest", 380)} alt="" draggable={false} decoding="async" className="absolute inset-0 -z-20 size-full object-cover" />
        <span aria-hidden className="absolute inset-0 -z-10 bg-linear-to-r from-card/95 via-card/70 to-card/20" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-md bg-primary px-2 py-px text-xs font-extrabold tracking-widest text-primary-foreground uppercase">{playing ? `Phase ${CONQUEST_PHASES.indexOf(state.phase as ConquestPlayPhase) + 1} · ${PHASE_NAME[state.phase]}` : PHASE_NAME[state.phase]}</span>
          <Button size="sm" variant="secondary" className="h-11 rounded-full" onClick={() => onView?.("rules")}>
            Goals and rules
          </Button>
        </div>
        <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">{headline}</h2>
        <p role="timer" className="text-outline text-sm font-semibold">
          {state.phase === "registration" ? (
            <>
              The world is drawn in <span className="numeric">{left}</span>
            </>
          ) : state.phase === "results" ? (
            <>
              The next registration opens in <span className="numeric">{left}</span>
            </>
          ) : state.rest ? (
            <>
              A rest day: nobody builds or explores · <span className="numeric">{left}</span> left
            </>
          ) : (
            <>
              <span className="numeric">{left}</span> left{state.day === phaseDays!.last ? ", the last day of play" : ""} · {nextPhase ? `${CONQUEST_PHASE_NAME[nextPhase]} opens on D${CONQUEST_PHASE_DAYS[nextPhase].first}` : `the results on D${CONQUEST_LAST_DAY + 1}`}
            </>
          )}
        </p>
      </header>
      {state.day > 0 && (
        <div aria-hidden data-slot="conquest-progress" className="grid grid-cols-[6fr_1fr_6fr_1fr_6fr] gap-1.5">
          {[1, 7, 8, 14, 15].map((first, i) => {
            const last = [6, 7, 13, 14, CONQUEST_LAST_DAY][i]!;
            const share = Math.max(0, Math.min(1, (state.day - first + 1) / (last - first + 1)));
            return (
              <span key={first} className="h-2 overflow-hidden rounded-full bg-background/70">
                <span className={cn("block h-full rounded-full", i === 0 ? "bg-info" : i === 2 ? "bg-primary" : i === 4 ? "bg-joust-rival" : "bg-muted-foreground")} style={{ width: `${share * 100}%` }} />
              </span>
            );
          })}
        </div>
      )}

      {notice && <ActNotice notice={notice} />}

      {!state.guild ? (
        <Notice
          tone="info"
          title="The Conquest is played by allegiances"
          action={
            <Button size="sm" variant="secondary" onClick={onAllegiance}>
              Find an allegiance
            </Button>
          }
        >
          Join one to make Offerings, explore and build with it.
        </Notice>
      ) : (
        <div data-slot="conquest-allegiance" className="drawer-carved flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3.5 py-2.5">
          <button type="button" disabled={!mine} onClick={() => onView?.("members")} aria-label={`${state.guild.name}: members`} className="flex min-h-11 min-w-40 flex-1 cursor-pointer items-center gap-3 text-left disabled:cursor-default">
            <GuildEmblem emblem={state.guild.emblem} size="md" />
            <span className="flex min-w-0 flex-col">
              <span title={state.guild.name} className="text-outline truncate text-base leading-tight font-bold">
                {state.guild.name}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                {mine && (
                  <>
                    <span className="numeric">{mine.members}</span> {mine.members === 1 ? "member" : "members"} ·{" "}
                  </>
                )}
                you are {state.rank !== null && /^[aeiou]/i.test(rankName(state.rank)) ? "an" : "a"} {state.rank !== null ? rankName(state.rank) : "member"}
              </span>
            </span>
          </button>
          {mine ? (
            <span role="group" aria-label="Your allegiance" className="ml-auto flex flex-col items-end">
              <span className="numeric text-outline text-xl leading-tight font-bold text-primary">#{mine.place}</span>
              <span className="text-xs font-semibold text-muted-foreground">
                <span className="numeric">{formatPoints(mine.score)}</span> pts
              </span>
            </span>
          ) : state.phase === "registration" ? (
            <span data-slot="conquest-register" className="ml-auto flex items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground">{state.entered ? "Registered: its province is drawn when day 1 begins." : state.leads ? "Not registered yet." : "Not registered yet: an Officer or the Leader registers it."}</span>
              {!state.entered && state.leads && <Primary word="Register" busy={busy === "register"} onAct={onRegister} />}
            </span>
          ) : null}
        </div>
      )}
      {state.guild && !mine && state.phase !== "registration" && (
        <Notice tone="warning" title="Your allegiance is not in this Conquest">
          It was founded after the registration closed. It takes part in the next one.
        </Notice>
      )}

      {state.phase === "registration" && (
        <section aria-labelledby="conquest-registered" className="flex flex-col gap-2">
          <SectionTitle id="conquest-registered">Registered</SectionTitle>
          {state.registered.length === 0 ? (
            empty("No allegiance registered yet.")
          ) : (
            <ul aria-label="Allegiances registered" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
              {state.registered.map((g) => (
                <li key={g.id} data-mine={g.id === state.guild?.id || undefined} className={cn("flex min-h-12 items-center gap-2.5 px-3 py-1.5", g.id === state.guild?.id && "bg-info/15")}>
                  <GuildEmblem emblem={g.emblem} size="sm" />
                  <span title={g.name} className="min-w-0 flex-1 truncate text-sm font-bold">
                    {g.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {mine && playing && (
        <div data-slot="conquest-orders" className="drawer-carved flex flex-col gap-2 rounded-2xl px-3.5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-outline text-base font-bold">Orders today</span>
            <span className="text-sm font-semibold text-muted-foreground">
              <strong className="text-success">
                <span className="numeric">{mine.orders.left}</span> left
              </strong>{" "}
              · <span className="numeric">{mine.orders.given}</span> received, <span className="numeric">{mine.orders.used}</span> built
            </span>
          </div>
          <div role="progressbar" aria-label="Orders used" aria-valuemin={0} aria-valuemax={Math.max(1, mine.orders.given)} aria-valuenow={mine.orders.used} className="h-2 overflow-hidden rounded-full bg-background/70">
            <span className="block h-full rounded-full bg-success" style={{ width: `${mine.orders.given > 0 ? (mine.orders.used * 100) / mine.orders.given : 0}%` }} />
          </div>
          <p className="text-xs font-semibold text-muted-foreground">{state.rest ? "A rest day: nobody builds, no order is given." : "One per member, with their first Offering of the day."}</p>
        </div>
      )}

      {mine && me && playing && (
        <ul aria-label="Daily ritual" className="grid grid-cols-3 gap-2">
          <Ritual
            slot="conquest-offering"
            art="offering"
            title="Offering"
            lead={
              <>
                <span className="numeric">{me.waiting}</span> waiting
              </>
            }
            sub={
              me.nextAt !== null ? (
                <>
                  next in <span className="numeric">{formatShortRemaining(Math.max(0, me.nextAt - now))}</span>
                </>
              ) : me.waiting >= CONQUEST_OFFERINGS_WAITING ? (
                "the bowl is full"
              ) : (
                "no more today"
              )
            }
            word="Offer"
            name={me.waiting > 0 ? `Offer: ${me.waiting} Knowledge` : "Offer"}
            disabled={me.waiting === 0}
            busy={busy === "offer"}
            onAct={onOffer}
          />
          <Ritual
            slot="conquest-exploration"
            art="exploration"
            title="Exploration"
            lead={
              <>
                <span className="numeric">{state.rest || me.exploredToday ? 0 : 1}</span> left
              </>
            }
            sub={state.rest ? "a rest day" : "today"}
            word="Explore"
            name="Explore: the map of your province"
            disabled={state.rest || me.exploredToday || state.home === null}
            onAct={() => state.home !== null && onZone?.(state.home)}
          />
          <Ritual
            slot="conquest-requests"
            art="gift"
            title="Requests"
            lead={
              <>
                <span className="numeric">{state.requests.length}</span> open
              </>
            }
            sub={
              <>
                you hold <span className="numeric">{held}</span>
              </>
            }
            word="Build"
            name="Build: the open requests"
            disabled={state.requests.length === 0}
            onAct={() => onView?.("requests")}
          />
        </ul>
      )}

      {state.final && state.guild && <ConquestResultRow title="The Conquest is over" place={state.final.place} of={state.final.of} waiting={state.final.claimed ? 0 : state.final.cobbles} guild={state.guild} onOpen={() => onResult?.("final")} />}
      {state.guild &&
        [...state.results].reverse().map((r) => <ConquestResultRow key={r.phase} title={`${CONQUEST_PHASE_NAME[r.phase]} is over`} place={r.place} of={r.of} waiting={r.claimed ? 0 : r.cobbles} guild={state.guild!} onOpen={() => onResult?.(r.phase)} />)}
      {state.previous && <ConquestResultRow title={`World ${state.previous.world} is over`} place={state.previous.place} of={state.previous.of} waiting={state.previous.toClaim} guild={state.previous.guild} onOpen={() => onResult?.("last")} />}

      {mine && (
        <button type="button" data-slot="conquest-knowledge-row" onClick={() => onView?.("tree")} className="state-layer drawer-carved flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-2 text-left">
          <KnowledgeIcon px={40} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-outline text-base leading-tight font-bold">
              Knowledge <span className="numeric text-primary">{formatInteger(mine.knowledge)}</span>
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {next ? (
                <>
                  Next: {conquestBranchName(next.branch)} level <span className="numeric">{next.level}</span> for <span className="numeric">{formatInteger(next.cost)}</span>
                </>
              ) : (
                "The tree is complete"
              )}
            </span>
          </span>
          <Icon name="chevron-right" size="sm" className="text-muted-foreground" />
        </button>
      )}

      {state.scored.length > 0 && (
        <section aria-labelledby="conquest-scored" className="flex flex-col gap-2">
          <SectionTitle id="conquest-scored">Last closings</SectionTitle>
          <ul className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
            {state.scored.map((s, i) => (
              <li key={i} data-won={s.won || undefined} className="flex min-h-11 items-center px-3.5 py-1.5 text-[0.8125rem] font-semibold text-muted-foreground">
                <span>
                  <span className="numeric">D{s.day}</span> · {scoredLine(s)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DrawerFooter>
        <div data-slot="conquest-footer" className="flex min-h-16 items-center gap-2 px-4 py-2">
          <Button variant="secondary" className="h-12 flex-1 gap-2 px-1" disabled={state.side === 0} onClick={() => onZone?.(state.home ?? Math.floor((state.side * state.side) / 2))}>
            <UiIcon name="explore" px={24} className="size-6" />
            Map
          </Button>
          <Button variant="secondary" className="h-12 flex-1 gap-2 px-1" onClick={() => onView?.("ranking")}>
            <UiIcon name="trophy" px={24} className="size-6" />
            Ranks
          </Button>
        </div>
      </DrawerFooter>
    </section>
  );
}
