import type { ReactNode } from "react";
import {
  CONQUEST_ELIGIBLE_DAYS,
  CONQUEST_LAST_DAY,
  CONQUEST_OFFERINGS_WAITING,
  CONQUEST_ORDERS,
  CONQUEST_PHASE_DAYS,
  formatInteger,
  type ConquestBranch,
  type ConquestPhase,
  type ConquestPlayPhase,
  type ConquestStructure,
} from "@paved/game-core";
import type { ConquestGiven, ConquestMemberRow, ConquestOptions, ConquestRanking, ConquestScoredState, ConquestState, ConquestZoneState } from "../../data/conquest-source";
import { cn } from "../../lib/utils";
import { ConquestWorld, ConquestZoneMap } from "../containers/conquest-map";
import { CONQUEST_PHASE_NAME, ConquestFinalCard, ConquestMembers, ConquestPhaseCard, ConquestRanks } from "../containers/conquest-ranks";
import { ConquestTree } from "../containers/conquest-tree";
import { DrawerFooter } from "../containers/hud-drawer";
import { formatShortRemaining } from "../elements/countdown";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { RARITY_NAME } from "../elements/rarity-badge";
import { formatPoints } from "../elements/score";
import { SectionTitle } from "../elements/section-title";
import { TileChip, type TileArt } from "../elements/tile-chip";
import { tileName } from "../elements/tile-render";
import { TokenIcon } from "../elements/token-icon";
import type { UiIconName } from "../elements/ui-art";
import { UiIcon } from "../elements/ui-icon";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

/** The Conquest's views in Play's drawer: its page, the map (a zone), the knowledge tree, the allegiances' ranking, the members. */
export type ConquestView = "hub" | "map" | "tree" | "ranking" | "members";

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
  /** The Cobbles of a Conquest: its phases over and its final rank. */
  onClaim?: (conquest: number) => void;
  onZone?: (zone: number) => void;
  onCell?: (cell: { x: number; y: number } | null) => void;
  onView?: (view: ConquestView) => void;
  /** Without an allegiance: the Allegiance page, to find one. */
  onAllegiance?: () => void;
  onOpenPlayer?: (address: string) => void;
}

const PHASE_NAME: Record<ConquestPhase, string> = { registration: "Registration", ...CONQUEST_PHASE_NAME, results: "Results" };
const STRUCTURE_NAME: Record<ConquestStructure, string> = { road: "road", city: "city", forest: "forest", wonder: "wonder", great: "Great Wonder" };

/** A line of a briefing or of the rules, with its painting. */
interface Rule { art: UiIconName; text: string }

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

function Figure({ value, word, tone }: { value: ReactNode; word: string; tone?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col items-center px-1 text-center">
      <span className={cn("numeric text-outline text-xl leading-tight font-bold", tone)}>{value}</span>
      <span className="text-xs leading-tight font-semibold text-muted-foreground">{word}</span>
    </span>
  );
}

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
              ? ["Level bought", `${notice.branch[0]!.toUpperCase()}${notice.branch.slice(1)} is level ${notice.level}.`]
              : notice.kind === "register"
                ? ["Registered", "Your allegiance gets its province when day 1 begins."]
                : [`+${formatInteger(notice.cobbles)} Cobbles`, "Claimed."];
  return (
    <Notice tone="info" title={title}>
      <span data-slot="conquest-notice">{body}</span>
    </Notice>
  );
}

/**
 * The Conquest (`/play/conquest`, Play's Limited mode; the design proposal of 8 and 9 November 2026, looped on the client): a view of
 * Play's drawer, as the Joust's. Its page: the phase, its day and its time left; the registration and the allegiances registered; the
 * allegiance's rank, points, Knowledge and orders; the daily ritual (the Offerings, the exploration, the orders); the open build
 * requests, each given with one tap by a member who holds its tile; the last structures closed; the phases' results and the final
 * one with Claim; the phase's briefing and the rules. Its other views: the map (the world's checkerboard and one zone, where a cell
 * is explored and a tile asked for), the knowledge tree, the allegiances' ranking and the allegiance's members.
 */
export function ConquestScene({
  state,
  error,
  errorDetail,
  onRetry,
  now,
  view = "hub",
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

  if (view === "ranking")
    return (
      <section aria-label="Ranking" className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-muted-foreground">The allegiances by points: Foundation, Awakening and Frontiers under each name, their total at the right. A closed structure pays the allegiance with the most tiles in it.</p>
        {ranking!.rows.length === 0 ? <p className="drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">The world is drawn when day 1 begins.</p> : <ConquestRanks rows={ranking!.rows} label="Allegiances by points" />}
      </section>
    );
  if (view === "members")
    return (
      <section aria-label="Members" className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-muted-foreground">Who built, explored and brought the most. A member is paid at the end with Offerings on {CONQUEST_ELIGIBLE_DAYS} days.</p>
        {members!.length === 0 ? <p className="drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">Your allegiance is not in this Conquest.</p> : <ConquestMembers rows={members!} onOpenPlayer={onOpenPlayer} />}
      </section>
    );
  if (view === "tree")
    return (
      <section aria-label="Knowledge tree" className="flex flex-col gap-3">
        {notice && <ActNotice notice={notice} />}
        {mine ? (
          <>
            <div role="group" aria-label="Knowledge" className="drawer-carved flex rounded-2xl py-1.5">
              <Figure value={formatInteger(mine.knowledge)} word="Knowledge to spend" tone="text-primary" />
              <Figure value={formatInteger(mine.earned)} word="earned in all" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              {state.leads ? "You buy the levels, in order, until the end of Frontiers." : "The Leader and the Officers buy the levels, in order, until the end of Frontiers."} A structure scores with the level of the moment it closes.
            </p>
            <ConquestTree levels={mine.levels} knowledge={mine.knowledge} leads={state.leads} open={state.day >= 1 && state.day <= CONQUEST_LAST_DAY} busy={busy === "research" ? researching : null} onResearch={onResearch} />
          </>
        ) : (
          <p className="drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">Your allegiance has no tree in this Conquest.</p>
        )}
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

  const phaseDays = playing ? CONQUEST_PHASE_DAYS[state.phase as ConquestPlayPhase] : null;
  return (
    <section aria-label="Conquest" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <span className="w-fit rounded-md bg-background/70 px-2 py-px text-xs font-extrabold tracking-widest uppercase">{state.day > 0 ? `Day ${state.day} of 28` : "Before day 1"}</span>
        <h2 className="text-outline font-display text-[1.75rem] leading-tight font-bold">{PHASE_NAME[state.phase]}</h2>
        <p role="timer" className="text-sm font-semibold text-muted-foreground">
          {state.phase === "registration"
            ? "The world is drawn"
            : state.phase === "results"
              ? "The next Conquest's registration opens"
              : state.rest
                ? "A rest day: nobody builds or explores. The next phase begins"
                : state.day === phaseDays!.last
                  ? "The last day of play of the phase. It ends"
                  : "The phase ends"}{" "}
          in <span className="numeric text-foreground">{formatShortRemaining(state.phaseEndsAt - now)}</span>
        </p>
      </header>

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
      ) : state.phase === "registration" ? (
        <div data-slot="conquest-register" className="drawer-carved flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3.5 py-3">
          <GuildEmblem emblem={state.guild.emblem} size="md" />
          <p className="min-w-36 flex-1 text-sm font-semibold text-muted-foreground">
            <strong title={state.guild.name} className="block truncate text-foreground">
              {state.guild.name}
            </strong>
            {state.entered ? "Registered: its province is drawn when day 1 begins." : state.leads ? "Not registered yet." : "Not registered yet: an Officer or the Leader registers it."}
          </p>
          {!state.entered && state.leads && (
            <Button variant="ghost" style={GOLD_ACTION} className="relative ml-auto h-12 shrink-0 px-4 text-lg font-black text-foreground" disabled={busy !== null} aria-busy={busy === "register" || undefined} onClick={onRegister}>
              {busy === null && <GoldShine />}
              Register
            </Button>
          )}
        </div>
      ) : !state.entered ? (
        <Notice tone="warning" title="Your allegiance is not in this Conquest">
          It was founded after the registration closed. It takes part in the next one.
        </Notice>
      ) : null}

      {state.phase === "registration" && (
        <section aria-labelledby="conquest-registered" className="flex flex-col gap-2">
          <SectionTitle id="conquest-registered">Registered</SectionTitle>
          {state.registered.length === 0 ? (
            <p className="drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground">No allegiance registered yet.</p>
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

      {mine && (
        <section aria-labelledby="conquest-allegiance" className="flex flex-col gap-2">
          <SectionTitle
            id="conquest-allegiance"
            end={
              <Button size="sm" variant="secondary" className="h-11" onClick={() => onView?.("members")}>
                Members
              </Button>
            }
          >
            Allegiance
          </SectionTitle>
          <p title={state.guild?.name} className="truncate text-sm font-bold">
            {state.guild?.name}
          </p>
          <div role="group" aria-label="Your allegiance" className="drawer-carved grid grid-cols-2 gap-y-2 rounded-2xl py-2">
            <Figure value={`#${mine.place}`} word={`of ${mine.of}`} tone="text-primary" />
            <Figure value={formatPoints(mine.score)} word="points" />
            <Figure value={formatInteger(mine.knowledge)} word="Knowledge" />
            <Figure value={formatInteger(mine.tiles)} word={mine.tiles === 1 ? "tile" : "tiles"} />
          </div>
        </section>
      )}

      {mine && me && playing && (
        <section aria-labelledby="conquest-ritual" className="flex flex-col gap-2">
          <SectionTitle id="conquest-ritual">Daily ritual</SectionTitle>
          <ul className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
            <li data-slot="conquest-offering" className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2">
              <UiIcon name="sun" px={28} className="drawer-icon size-7 shrink-0" />
              <p className="min-w-36 flex-1 text-sm font-semibold text-muted-foreground">
                <strong className="block text-foreground">
                  <span className="numeric">{me.waiting}</span> {me.waiting === 1 ? "Offering waits" : "Offerings wait"}
                </strong>
                {me.nextAt !== null ? (
                  <>
                    The next in <span className="numeric text-foreground">{formatShortRemaining(Math.max(0, me.nextAt - now))}</span>
                  </>
                ) : me.waiting >= CONQUEST_OFFERINGS_WAITING ? (
                  "The bowl is full"
                ) : (
                  "No more Offering"
                )}
                {!me.orderToday && !state.rest && " · your first gives an order"}
              </p>
              <Button variant="ghost" style={GOLD_ACTION} className="relative ml-auto h-12 shrink-0 px-3 text-base font-black text-foreground" disabled={me.waiting === 0 || busy !== null} aria-busy={busy === "offer" || undefined} aria-label={me.waiting > 0 ? `Offer +${me.waiting}` : "Offer"} onClick={onOffer}>
                {busy === null && me.waiting > 0 && <GoldShine />}
                Offer{me.waiting > 0 && <span className="numeric"> +{me.waiting}</span>}
              </Button>
            </li>
            <li data-slot="conquest-exploration" className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2">
              <UiIcon name="explore" px={28} className="drawer-icon size-7 shrink-0" />
              <p className="min-w-36 flex-1 text-sm font-semibold text-muted-foreground">
                <strong className="block text-foreground">Exploration</strong>
                {state.rest ? "Nobody explores on a rest day" : me.exploredToday ? "Made today: one cell a day" : "One cell today, anywhere in the open zones"}
              </p>
              <Button variant="secondary" className="ml-auto h-12 shrink-0" disabled={state.home === null} onClick={() => state.home !== null && onZone?.(state.home)}>
                {me.exploredToday || state.rest ? "Map" : "Explore"}
              </Button>
            </li>
            <li data-slot="conquest-orders" className="flex min-h-14 items-center gap-3 px-3.5 py-2">
              <UiIcon name="hammer" px={28} className="drawer-icon size-7 shrink-0" />
              <p className="min-w-0 flex-1 text-sm font-semibold text-muted-foreground">
                <strong className="block text-foreground">
                  <span className="numeric">{mine.orders.left}</span> {mine.orders.left === 1 ? "order" : "orders"} left
                </strong>
                {state.rest ? (
                  "Nobody builds on a rest day"
                ) : (
                  <>
                    <span className="numeric">{mine.orders.given}</span> given by today's first Offerings, <span className="numeric">{mine.orders.used}</span> used
                  </>
                )}
              </p>
            </li>
          </ul>
        </section>
      )}

      {mine && playing && (
        <section aria-labelledby="conquest-requests" className="flex flex-col gap-2">
          <SectionTitle id="conquest-requests">Requests</SectionTitle>
          {state.requests.length === 0 ? (
            <p className="drawer-carved rounded-xl px-4 py-5 text-center text-sm font-semibold text-muted-foreground">{state.rest ? "No request on a rest day." : state.leads ? "No open request. Ask for a tile on the map." : "No open request. An Officer or the Leader asks for the tiles."}</p>
          ) : (
            <ul aria-label="Open requests" className="drawer-carved drawer-rows flex flex-col overflow-hidden rounded-2xl">
              {state.requests.map((r) => (
                <li key={r.id} data-request={r.id} className="flex min-h-14 items-center gap-3 px-3 py-1.5">
                  <TileChip plan={r.plan} orientation={r.orientation} art={tileArt} className="size-11" />
                  <button type="button" onClick={() => onZone?.(r.zone)} className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col items-start justify-center text-left">
                    <span className="text-sm font-bold">
                      {tileName(r.plan)} · {r.zoneName}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {RARITY_NAME[r.rarity]} · <span className="numeric">{r.holders}</span> {r.holders === 1 ? "member holds" : "members hold"} one
                      {r.held > 0 && <strong className="text-info"> · you do</strong>}
                    </span>
                  </button>
                  <Button className="h-11 shrink-0" disabled={r.held === 0 || mine.orders.left < 1 || busy !== null} aria-busy={busy === "give" || undefined} aria-label={`Give ${tileName(r.plan)} for ${r.cobbles} ${r.cobbles === 1 ? "Cobble" : "Cobbles"}`} onClick={() => onGive?.(r.id)}>
                    Give
                    <span className="flex items-center gap-0.5">
                      <span className="numeric">+{r.cobbles}</span>
                      <TokenIcon kind="cobbles" size="sm" px={16} className="size-4" />
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
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

      {(state.final || state.results.length > 0) && (
        <section aria-labelledby="conquest-results" className="flex flex-col gap-2">
          <SectionTitle id="conquest-results">Rewards</SectionTitle>
          {state.final && <ConquestFinalCard final={state.final} title="This Conquest" claiming={busy === "claim"} onClaim={onClaim} />}
          {[...state.results].reverse().map((r) => (
            <ConquestPhaseCard key={r.phase} result={r} />
          ))}
          {!state.final && state.toClaim > 0 && (
            <Button className="h-11 w-full" disabled={busy !== null} aria-busy={busy === "claim" || undefined} aria-label={`Claim +${formatInteger(state.toClaim)} Cobbles`} onClick={() => onClaim?.(state.conquest)}>
              Claim
              <span className="flex items-center gap-0.5">
                <span className="numeric">+{formatInteger(state.toClaim)}</span>
                <TokenIcon kind="cobbles" size="sm" px={16} className="size-4" />
              </span>
            </Button>
          )}
        </section>
      )}

      {state.previous && <ConquestFinalCard final={state.previous} title="The last Conquest" claiming={busy === "claim"} onClaim={onClaim} />}

      <Rules id="conquest-briefing" title="Briefing" rules={BRIEFING[state.phase]} />
      <Rules id="conquest-rules" title="The rules" rules={RULES} />

      <DrawerFooter>
        <div data-slot="conquest-footer" className="flex min-h-16 items-center gap-2 px-4 py-2">
          <Button variant="secondary" className="h-12 flex-1 px-1" onClick={() => onView?.("ranking")}>
            Ranking
          </Button>
          <Button variant="secondary" className="h-12 flex-1 px-1" disabled={!mine} onClick={() => onView?.("tree")}>
            Tree
          </Button>
          <Button variant="ghost" style={GOLD_ACTION} className="relative h-12 flex-1 px-1 text-lg font-black text-foreground" disabled={state.side === 0} onClick={() => onZone?.(state.home ?? Math.floor((state.side * state.side) / 2))}>
            {state.side > 0 && <GoldShine />}
            Map
          </Button>
        </div>
      </DrawerFooter>
    </section>
  );
}
