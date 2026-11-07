import { useState, type CSSProperties, type ReactNode } from "react";
import * as m from "motion/react-m";
import { formatInteger } from "@paved/game-core";
import type { TileSkins } from "@paved/renderer";
import type { GuildBadge } from "../../data/social-source";
import type { AttackDeckSheet } from "../../lib/attack-deck-sheet";
import { useDeferred } from "../../lib/deferred";
import { cn } from "../../lib/utils";
import { STAR_PERCENTS, leagueOf, type CrownStakes, type PvpPlayer, type PvpVillage } from "../../lib/pvp-rules";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { attackArtSources } from "../elements/attack-art";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { GuildEmblem } from "../elements/guild-emblem";
import { HudFrame } from "../elements/hud-frame";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { PlayerName } from "../elements/player-name";
import { formatHoursMinutes, shieldLabel } from "../elements/shield-time";
import type { TileArt } from "../elements/tile-chip";
import type { TileRenders } from "../elements/tile-render";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { BoardMap } from "../containers/board-map";
import { toastError } from "../containers/error-toast";
import { HudDrawer } from "../containers/hud-drawer";
import { LeaguePortrait } from "../containers/league-control";
import { errorDetail } from "../../routes/error-detail";

const loadDeckSheet = () => import("../containers/deck-sheet");

/** PvP v2's attack deck (#740): ceil(1.15 x S) tiles, the defender's placed tiles and extras from the base deck. */
export interface ScoutDeck {
  /** The defender's slots, S = 8 + level. */
  slots: number;
  /** The tiles the attack will draw: ceil(1.15 x S). */
  size: number;
  /** Of them, the defender's placed tiles (the starter is not drawn); the rest are extras. */
  placed: number;
}

export interface PvpScoutSceneProps {
  defender: PvpPlayer;
  /** The defender's village: its territory, its tiles, its score (the target). */
  village: PvpVillage;
  stakes: CrownStakes;
  /** The defender's tiles the attack draws (the starter is not drawn); `village.tiles.length` when left out. */
  tilesToPlay?: number;
  /** An NPC village (#643): its Story level's board, open, with no territory. */
  openBoard?: boolean;
  /**
   * PvP v2 (#740): the deck the attack will have, sized on the defender's slots, played on an unbounded board (no territory
   * drawn). v1's defender's tiles on their cells when left out.
   */
  deck?: ScoutDeck | null;
  /** The village's tile list (#788): the attack's deck (#789) before the first tile; the deck over the village opens it. None in v1. */
  deckSheet?: AttackDeckSheet | null;
  /** The rival's guild, as their profile shows it (`useGuildBadge`): its emblem and tag beside their level; null or left out, an empty shield. */
  guild?: GuildBadge | null;
  /** The deck page is open (the route's `?view=deck`); left out, the scene keeps it itself. */
  deckOpen?: boolean;
  onDeckOpenChange?: (open: boolean) => void;
  /** The deck page's real view: the board's tile art, renders and skins (`useScoutBoard`). */
  tileArt?: TileArt;
  tileRenders?: TileRenders;
  skins?: TileSkins;
  /** The star marks in whole percent of the village's score: v1's 70 / 85 / 110 % when left out, v2's 80 / 90 / 100 %. */
  starPercents?: readonly number[];
  /** "Next": another village for `price` Cobbles; `balance` is the attacker's. */
  next: { price: number; balance: number };
  /** The attacker's own shield, while it lasts (seconds since the epoch): attacking drops it (owner decision). */
  shieldEndsAt?: number | null;
  now: number;
  /** `next`: another village is on its way; `attacking`: the attack is being opened (#643's `attack()`). */
  pending?: "next" | "attacking" | null;
  error?: string | null;
  errorDetail?: ErrorDetail;
  /** The 3D board, given by the page (`FinalBoard`'s viewport, read only); the plan view without it. */
  canvas?: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  /**
   * The defender cannot be attacked now (shielded since the draw): a free search for another village, in place of Attack. A
   * paid Next stays offered.
   */
  onSearchAgain?: () => void;
  /** `onSearchAgain`'s search is on its way. */
  searching?: boolean;
  onAttack?: () => void;
}

/** The header's controls, Back and the info: the HUD drawer's 44 px round target. */
const CONTROL = "state-layer grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none";

/** Next, a price's raised grey (the Shop's `PriceButton`), inline: the one stylesheet keeps no one-off. */
const RAISED: CSSProperties = {
  backgroundImage: "linear-gradient(var(--layer, transparent), var(--layer, transparent)), linear-gradient(var(--drawer-raised), var(--secondary))",
  boxShadow: "inset 0 1px 0 var(--drawer-bevel), 0 0 0 1px var(--hud-outline), 0 2px 0 1px var(--hud-outline)",
};

/** A count on the deck: the dock's red square at its top right, as the home's buttons' (`home-edges.tsx`). */
function DeckCount({ count }: { count: number }) {
  return (
    <span aria-hidden className="numeric absolute top-0 right-0 grid h-5 min-w-5 place-items-center rounded-[0.3rem] bg-dock-badge px-1 text-xs leading-none font-bold text-foreground ring-2 ring-background">
      {count}
    </span>
  );
}

/**
 * The PvP scout (#647), after the Paved UX Book's "scout" (ATTACK-SCOUT): the rival's village fills the screen at every width. At the
 * top the book's header on the HUD's frame (Back, Scout, the attacker's shield and its time while it lasts, the info, the Cobbles). At
 * the bottom right, over the village, the deck (the user's ask: a pile of tiles and their count, which opens the deck page, the attack's
 * tiles); under it the book's panel, the rival first (the user's ask: no card of their own at the top; their avatar in its league rim,
 * the league's crest on its corner and no other, two lines: their name, then their guild's tag; no level, no village score: the user's
 * asks), then the crowns at
 * stake in a carved row, each case
 * its stars, its points and the crowns it wins, the defeat's loss first (the user's ask), the line that attacking drops the shield, then
 * Next at its Cobble price and the gold Attack. How an attack goes is behind the info.
 */
export function PvpScoutScene(props: PvpScoutSceneProps) {
  const { defender, village, stakes, next, now } = props;
  const percents = props.starPercents ?? STAR_PERCENTS;
  // The least whole score of each mark, in integers.
  const marks = percents.map((p) => Math.floor((p * village.score + 99) / 100));
  const deck = props.deck ?? null;
  const tiles = deck?.size ?? props.tilesToPlay ?? village.tiles.length;
  const shielded = props.shieldEndsAt != null && props.shieldEndsAt > now;
  const short = next.balance < next.price;
  const busy = props.pending != null;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ownDeckOpen, setOwnDeckOpen] = useState(false);
  const deckOpen = props.deckOpen ?? ownDeckOpen;
  const setDeckOpen = props.onDeckOpenChange ?? setOwnDeckOpen;
  const deckPage = useDeferred(loadDeckSheet, deckOpen, (e) => {
    setDeckOpen(false);
    toastError({ title: "Deck", message: "The village's tiles could not load. Check your connection and try again.", detail: errorDetail(e) });
  });
  const list = props.deckSheet ?? null;
  const league = leagueOf(defender.crowns);
  const left = shielded ? formatHoursMinutes(props.shieldEndsAt! - now) : null;
  const stars = (n: number) => `${n} ${n === 1 ? "star" : "stars"}`;
  return (
    <div className="relative h-dvh min-h-[36rem] overflow-hidden bg-board text-foreground">
      <div data-scout-board className="absolute inset-0">
        {props.canvas ?? (
          <BoardMap tiles={[...village.tiles]} territory={deck ? undefined : village.cells} highlight={false} fit className="px-3 pt-20 pb-80 tablet:px-6" />
        )}
      </div>

      {/* The overlay: the header at the top, the deck and the panel (the rival in it) at the bottom; between them the village takes the board's gestures. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] tablet:p-4">
        <div className="flex w-full flex-col items-center">
          <header data-scout-top className="pointer-events-auto relative isolate flex w-full max-w-2xl items-center gap-0.5 py-1 pr-2 pl-1">
            <HudFrame px={13} />
            <button type="button" aria-label="Back" className={CONTROL} onClick={props.onBack}>
              <Icon name="chevron-left" className="drawer-icon" />
            </button>
            {/* Every control of the book's header holds at 320 px: the title, the shield and the balance a step smaller under 360. */}
            <h1 className="text-outline -ml-1 shrink-0 font-display text-lg leading-tight tracking-wide mobile:text-2xl">Scout</h1>
            {/* The attacker's own shield, while it lasts: its time, whose tap tells the rule (attacking drops it). */}
            {left && (
              <button type="button" data-shield className="state-layer flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-full px-1 outline-none" onClick={() => setRulesOpen(true)}>
                <UiIcon name="shield" px={28} className="drawer-icon size-6 mobile:size-7" />
                <span className="sr-only">Attacking drops your shield</span>
                <span role="timer" aria-label={shieldLabel(props.shieldEndsAt!, now)} className="text-outline text-sm font-bold tabular-nums mobile:text-base">
                  {left}
                </span>
              </button>
            )}
            <button type="button" aria-label="How an attack works" className={CONTROL} onClick={() => setRulesOpen(true)}>
              <UiIcon name="info" px={32} className="drawer-icon size-8" />
            </button>
            <span role="img" aria-label={`${formatInteger(next.balance)} ${next.balance === 1 ? "Cobble" : "Cobbles"}`} className="ml-auto flex shrink-0 items-center gap-1">
              <span aria-hidden className="text-outline text-lg leading-none font-bold tabular-nums mobile:text-xl">
                {formatInteger(next.balance)}
              </span>
              <TokenIcon kind="cobbles" size="lg" className="size-6 mobile:size-8" />
            </span>
          </header>
        </div>

        <div className="relative flex w-full max-w-2xl flex-col items-center desktop:max-w-none">
          {/* The deck over the village, at the bottom right (the user's ask): the pile and its count; the deck page at a tap. Above the
              panel on a phone, beside it in the corner from desktop. */}
          <DeckButton tiles={tiles} onOpen={list ? () => setDeckOpen(true) : undefined} />

          <section aria-label="Attack" data-input-surface className="pointer-events-auto relative isolate flex w-full max-w-2xl flex-col gap-2 p-2">
            <HudFrame px={16} />
            {/* The rival in the panel (the user's asks of 2026-11-07), on two lines: their avatar in its league's rim and crest, their name on
                the first line, their guild under it. No level, no village score (the 3 stars' points say the target). */}
            <section aria-label="Rival" data-scout-rival className="flex min-w-0 items-center gap-2.5 px-1 pt-0.5">
              <LeaguePortrait player={defender} look={defender.look ?? null} league={league} style={{ fontSize: "3rem" }} />
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Two lines at most (the user's ask of 2026-11-07): the name on the first, on one line, cut with its whole in its title
                    rather than wrapped; no level. */}
                {defender.name ? (
                  <span title={defender.name} className="text-outline min-w-0 truncate pr-0.5 text-lg leading-snug font-bold">
                    {defender.name}
                  </span>
                ) : (
                  <PlayerName name={null} address={defender.address} className="text-outline min-w-0 pr-0.5 text-lg leading-snug font-bold" />
                )}
                {/* Their guild (the user's asks): its emblem and its tag, or an empty shield without one. */}
                <span data-guild className="flex min-w-0 items-center">
                  {props.guild ? (
                    <span role="img" aria-label={`${props.guild.name} guild, ${props.guild.tag}`} title={props.guild.name} className="flex min-w-0 items-center gap-x-1">
                      <GuildEmblem emblem={props.guild.emblem} size="sm" />
                      <span aria-hidden className="text-outline min-w-0 truncate pr-0.5 text-sm leading-tight font-bold">
                        {props.guild.tag}
                      </span>
                    </span>
                  ) : (
                    <NoGuild />
                  )}
                </span>
              </div>
            </section>
            {/* The crowns at stake (the user's ask of 2026-11-07): each case its stars, its points and the crowns it wins, the defeat first,
                under the first star's points, and the crowns it loses. */}
            <ul aria-label="Crowns at stake" className="drawer-carved drawer-rule grid grid-cols-4 rounded-xl">
              <Stake label={`No star, under ${formatInteger(marks[0]!)} points`} points={`< ${formatInteger(marks[0]!)}`} crowns={-stakes.loss}>
                <UiIcon name="star" px={20} className="drawer-icon size-4.5 opacity-40 grayscale tablet:size-5" />
              </Stake>
              {marks.map((points, i) => (
                <Stake key={i} label={`${stars(i + 1)}, ${formatInteger(points)} points`} points={formatInteger(points)} crowns={stakes.win[i]!}>
                  {Array.from({ length: i + 1 }, (_, k) => (
                    <UiIcon key={k} name="star" px={20} className="drawer-icon -mx-0.5 size-4.5 tablet:size-5" />
                  ))}
                </Stake>
              ))}
            </ul>

            <InlineError title="Scout" message={props.error} detail={props.errorDetail} />

            {/* The attacker's own shield, while it lasts (#806, open point 1): Attack drops it, said in one line. */}
            {left && !props.onSearchAgain && (
              <p data-shield-warning className="px-1 text-center text-sm leading-snug font-semibold text-muted-foreground">
                Attacking drops your shield, <span className="text-foreground tabular-nums">{left}</span> left
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="ghost"
                style={RAISED}
                className="h-12 min-w-0 flex-1 gap-1.5 rounded-xl px-2 mobile:gap-2"
                onClick={props.onNext}
                disabled={short || busy}
                loading={props.pending === "next"}
                aria-label={`Next village for ${next.price} Cobbles${short ? ", not enough Cobbles" : ""}`}
              >
                <span className="text-outline text-lg font-black mobile:text-xl">Next</span>
                <span className="flex items-center gap-1">
                  <TokenIcon kind="cobbles" size="sm" className="mobile:size-6" />
                  <span className="text-outline text-lg font-bold tabular-nums">{formatInteger(next.price)}</span>
                </span>
              </Button>
              {props.onSearchAgain ? (
                <GoldButton label="Search again, free" onClick={props.onSearchAgain} disabled={busy || props.searching} loading={props.searching} art={<UiIcon name="rotate" px={28} className="size-7" />}>
                  Search again
                </GoldButton>
              ) : (
                <GoldButton onClick={props.onAttack} disabled={busy} loading={props.pending === "attacking"} art={<UiIcon name="swords" px={32} className="size-8" />}>
                  Attack
                </GoldButton>
              )}
            </div>
          </section>
        </div>
      </div>

      <HudDrawer open={rulesOpen} onOpenChange={setRulesOpen} title="How an attack works" side="right" phone="sheet" slot="attack-rules">
        <p className="text-sm leading-snug font-semibold text-muted-foreground">
          {deck
            ? `You play the village's ${deck.placed} tiles and ${Math.max(0, deck.size - deck.placed)} extras, shuffled, on an open board. You see the tile in hand and the next two.`
            : props.openBoard
              ? "You play the village's tiles, drawn at random, on an open board."
              : "You play the defender's tiles, drawn at random, on their cells."}
        </p>
        {shielded && <p className="text-sm leading-snug font-semibold text-muted-foreground">Attacking drops your shield.</p>}
      </HudDrawer>

      {deckPage && list && (
        <deckPage.default open={deckOpen} onOpenChange={setDeckOpen} tiles={[]} attack={list} tileArt={props.tileArt} renders={props.tileRenders} skins={props.skins} edge="right" />
      )}
    </div>
  );
}

/** The guild emblem's shield (`GuildEmblem`'s), its outline only. */
const SHIELD = "M20 2 37 8v14c0 11-7 19-17 24C10 41 3 33 3 22V8Z";

/**
 * No guild (the user's asks of 2026-11-07): the guild emblem's shield, empty, its rim round the drawer's raised grey, at the small
 * emblem's size, so the row keeps its shape with a guild or without one; "No guild" beside it, in the muted grey, quieter than a tag.
 */
function NoGuild() {
  return (
    <span role="img" aria-label="No guild" data-slot="no-guild" className="flex min-w-0 items-center gap-x-1">
      <span aria-hidden className="relative inline-block h-8 w-7 shrink-0">
        <svg viewBox="0 0 40 48" className="absolute inset-0 size-full">
          <path d={SHIELD} fill="var(--drawer-raised)" stroke="var(--emblem-rim)" strokeWidth="3" strokeLinejoin="round" />
        </svg>
      </span>
      <span aria-hidden className="min-w-0 truncate pr-0.5 text-sm leading-tight font-semibold text-muted-foreground">
        No guild
      </span>
    </span>
  );
}

/**
 * One case of the attack's outcome in the panel's carved row: its stars (the defeat's a grey star), the points it takes (the defeat's
 * "under" the first star's), and the crowns it wins or loses, the painted crown beside the signed figure, gained in the success
 * colour, lost in the warning one. Named in full for screen readers (`label`: "2 stars, 2,895 points: +20 crowns").
 */
function Stake({ label, points, crowns, children }: { label: string; points: string; crowns: number; children: ReactNode }) {
  const sign = crowns > 0 ? "+" : crowns < 0 ? "\u2212" : "";
  const figure = `${sign}${formatInteger(Math.abs(crowns))}`;
  return (
    <li aria-label={`${label}: ${crowns < 0 ? "-" : "+"}${formatInteger(Math.abs(crowns))} crowns`} className="flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-2">
      <span aria-hidden className="flex h-5 items-center">
        {children}
      </span>
      <span aria-hidden className="text-outline text-base leading-tight font-bold whitespace-nowrap tabular-nums tablet:text-lg">
        {points}
      </span>
      <span aria-hidden data-crowns={crowns} className={cn("flex items-center gap-1 text-sm leading-tight font-bold tabular-nums", crowns < 0 ? "text-warning" : "text-success")}>
        <UiIcon name="crown" px={20} className="drawer-icon size-4.5" />
        <span className="text-outline">{figure}</span>
      </span>
    </li>
  );
}

/**
 * The deck over the village (the user's ask of 2026-11-07): the painted pile of tiles over its name, the home's buttons' way (no box:
 * `home-edges.tsx`), the tiles the attack draws in the dock's red square. A tap opens the deck page; v1 has no tile list, so there it
 * only counts.
 */
function DeckButton({ tiles, onOpen }: { tiles: number; onOpen?: () => void }) {
  const body = (
    <>
      <span aria-hidden className="flex flex-col items-center">
        <img {...attackArtSources("deck-stack", 56)} alt="" draggable={false} decoding="async" className="drawer-icon size-14" />
        <span className="text-outline -mt-1 text-sm leading-none font-black tracking-tight">Deck</span>
      </span>
      <DeckCount count={tiles} />
    </>
  );
  const place = "pointer-events-auto absolute right-0 bottom-full mb-2 grid size-18 place-items-center desktop:bottom-0 desktop:mb-0";
  return onOpen ? (
    <m.button type="button" data-deck whileTap={{ scale: 0.92 }} aria-label={`Deck, ${tiles} tiles`} onClick={onOpen} className={cn(place, "cursor-pointer outline-none")}>
      {body}
    </m.button>
  ) : (
    <span role="img" data-deck aria-label={`${tiles} tiles`} className={place}>
      {body}
    </span>
  );
}

/** The panel's main action, Attack (or Search again): the book's gold pill, its painting before the word, Play's passing light. */
function GoldButton({ children, art, label, onClick, disabled, loading }: { children: ReactNode; art: ReactNode; label?: string; onClick?: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Button variant="ghost" style={GOLD_ACTION} aria-label={label} className="relative h-12 min-w-0 flex-[1.2] gap-2 px-1 text-lg font-black text-foreground mobile:text-xl" onClick={onClick} disabled={disabled} loading={loading}>
      {!disabled && !loading && <GoldShine />}
      {!loading && <span className="drawer-icon flex">{art}</span>}
      {children}
    </Button>
  );
}
