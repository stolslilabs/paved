import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import { formatInteger } from "@paved/game-core";
import type { AlliancePlace, AllianceSummary, GuildPlace, GuildSummary, PlayerRanking } from "../../data/social-source";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent } from "../ui/tabs";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { rankingArtSources } from "../elements/ranking-art";
import { SectionTitle } from "../elements/section-title";
import { UiIcon } from "../elements/ui-icon";
import { FooterTab, FooterTabsList } from "../containers/footer-tabs";
import { DrawerFooter, HudDrawer } from "../containers/hud-drawer";
import { AllianceRankRow, GuildRankRow, PlayerRankRow } from "../containers/leaderboard";
import { listRowShape } from "../elements/list-row";

/** The Leaderboard's tabs (`?tab=`): Alliances live since ALLIANCES. */
export type LeaderboardTab = "players" | "guilds" | "alliances" | "friends";

export const LEADERBOARD_TABS: readonly LeaderboardTab[] = ["players", "guilds", "alliances", "friends"];

/** A ranking's read as the scene shows it: the list (null while read), or why it failed, with Retry. */
export interface RankingRead<T> {
  data: T | null;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
}

export interface LeaderboardSceneProps {
  /** The tab shown. */
  tab: LeaderboardTab;
  onTabChange?: (tab: LeaderboardTab) => void;
  /** The players by crowns and the viewer's place. */
  players: RankingRead<PlayerRanking>;
  /** The guilds by score, the sum of their members' crowns: the first `GUILD_LIST_LIMIT`. */
  guilds: RankingRead<readonly GuildSummary[]>;
  /** The alliances by score, the sum of their guilds' scores (ALLIANCES): the first `ALLIANCE_LIST_LIMIT`. */
  alliances: RankingRead<readonly AllianceSummary[]>;
  /** The viewer among their friends (the mutual follows) by crowns, and their place among them; no friend, an empty ranking. */
  friends: RankingRead<PlayerRanking>;
  /** The viewer's guild (its row in gold), or null: in none. */
  myGuild?: number | null;
  /** The viewer's guild's place in the whole ranking and its summary (null: in none, or still read): pinned when past the list's end. */
  myGuildPlace?: GuildPlace | null;
  /** The viewer's alliance, through their guild (its row in gold), or null: in none. */
  myAlliance?: number | null;
  /** The viewer's alliance's place in the whole ranking and its summary (null: in none, or still read): pinned when past the list's end. */
  myAlliancePlace?: AlliancePlace | null;
  /** No ranking on this network: no social source. */
  unavailable?: boolean;
  /** A player's row: their profile (Friends' profile sheet, `?player=`). */
  onOpenPlayer?: (address: string) => void;
  /** A guild's row: its page. */
  onOpenGuild?: (id: number) => void;
  /** An alliance's row: its page (ALLIANCES). */
  onOpenAlliance?: (id: number) => void;
  /** Whether the drawer is shown (its route is the current one); false while it slides out. Omitted, shown. */
  open?: boolean;
  /** The drawer's close: Back on a phone, the red cross from `tablet`, Escape, a tap on the village. */
  onBack?: () => void;
  returnFocus?: () => HTMLElement | null;
}

/** A press outside the drawer that is no tap on the village: on a dialog drawn over it (a player's profile). */
function keepForDialogs(event: Event) {
  if (event.target instanceof Element && event.target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) event.preventDefault();
}

/**
 * The footer's tabs (FOOTER-TABS, the Vault's bottom navigation): Players, Guilds, Alliances (live since ALLIANCES), and Friends at
 * the right end (the owner's ask of 2026-11-07). Each its painted icon at 36 px: the player and the handshake of `ui-art.ts`; the
 * Guilds' shield and the Alliances' two shields over a laurel, the ranking's own (`ranking-art.ts`, the owner's asks of 2026-11-07).
 */
type TabArt = "user" | "guilds" | "alliances" | "friends";
const TABS: readonly { id: LeaderboardTab; label: string; art: TabArt }[] = [
  { id: "players", label: "Players", art: "user" },
  { id: "guilds", label: "Guilds", art: "guilds" },
  { id: "alliances", label: "Alliances", art: "alliances" },
  { id: "friends", label: "Friends", art: "friends" },
];

/** A tab's painted icon, 36 px (the drawers' icons' look, `drawer-icon`). */
const tabArt = (art: TabArt) =>
  art === "alliances" || art === "guilds" ? <img {...rankingArtSources(art, 36)} alt="" draggable={false} decoding="async" className="drawer-icon size-9" /> : <UiIcon name={art} px={36} className="drawer-icon size-9" />;

/** An empty list's words, or the network's: on the drawer's carved surface (the friends' lists'). */
const NOTE = "drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground";

/** The side of the drawer's view the viewer's own row has left: above it (pinned at the body's top) or below it (pinned at the foot). */
export type OutOfViewSide = "above" | "below";

/**
 * Which side of the scrolling body (`data-hud-drawer-body`) an observed row has left, from an `IntersectionObserver` entry: null while
 * 95 % of it or more shows; above when its top is above the body's top (`boundingClientRect` against `rootBounds`), below otherwise
 * (and without the root's bounds).
 */
export function outOfViewSide(entry: Pick<IntersectionObserverEntry, "isIntersecting" | "intersectionRatio" | "boundingClientRect" | "rootBounds">): OutOfViewSide | null {
  if (entry.isIntersecting && entry.intersectionRatio >= 0.95) return null;
  return entry.rootBounds && entry.boundingClientRect.top < entry.rootBounds.top ? "above" : "below";
}

/**
 * The side of its drawer's view `el` is out of (`outOfViewSide`), or null while it is shown: the viewer's own row, pinned on that side
 * while it is out. Null without an element, or where no `IntersectionObserver` is (jsdom): the row counts as shown.
 */
function useOutOfView(el: HTMLElement | null): OutOfViewSide | null {
  const [side, setSide] = useState<OutOfViewSide | null>(null);
  useEffect(() => {
    setSide(null);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const root = el.closest<HTMLElement>("[data-hud-drawer-body]");
    let out = false;
    const observer = new IntersectionObserver(
      (entries) => {
        // Several crossings can come at once: the last is the row's place now.
        const next = outOfViewSide(entries[entries.length - 1]!);
        out = next !== null;
        setSide(next);
      },
      { root, threshold: [0, 0.95] },
    );
    observer.observe(el);
    // A jump from one side to the other (scrolled to the top at once) crosses no threshold: while out, each scroll reads the side again.
    let frame = 0;
    const onScroll = () => {
      if (!out || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!out || !root) return;
        const row = el.getBoundingClientRect();
        const view = root.getBoundingClientRect();
        const shown = Math.max(0, Math.min(row.bottom, view.bottom) - Math.max(row.top, view.top));
        const next = outOfViewSide({ isIntersecting: shown > 0, intersectionRatio: row.height > 0 ? shown / row.height : 0, boundingClientRect: row, rootBounds: view });
        out = next !== null;
        setSide(next);
      });
    };
    root?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      root?.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [el]);
  return el === null ? null : side;
}

/** A list's states: still read (its skeletons), failed (Retry), empty, or its rows on the carved panel; its title with its count, unless `count` is false. */
function RankedList<T>({ title, read, empty, label, rows, count = true }: { title: string; read: RankingRead<T>; empty: string; label: string; rows: (data: T) => ReactNode[]; count?: boolean }) {
  const items = read.data === null ? null : rows(read.data);
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <SectionTitle>
        {title}
        {count && items !== null && <span className="numeric font-sans text-base font-bold text-muted-foreground">{formatInteger(items.length)}</span>}
      </SectionTitle>
      <InlineError
        title={`Could not load the ${title.toLowerCase()}`}
        message={read.error}
        detail={read.errorDetail}
        action={
          read.onRetry && (
            <Button size="sm" variant="outline" onClick={read.onRetry}>
              Retry
            </Button>
          )
        }
      />
      {items === null && !read.error && (
        <div role="status" aria-label={`Loading the ${title.toLowerCase()}`} className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      )}
      {items?.length === 0 && <p className={NOTE}>{empty}</p>}
      {items && items.length > 0 && (
        <ol aria-label={label} className="drawer-carved flex flex-col rounded-xl">
          {items}
        </ol>
      )}
    </section>
  );
}

/** The top pin's strip: the foot's near-black line turned over, along its bottom, where the list goes under it. */
const TOP_PIN: CSSProperties = { boxShadow: "0 1px 0 var(--hud-outline)" };

/** A row of a carved list: the near-black rule above every row but the first (the Guild members'). */
const rowRule = (index: number) => cn("flex", index > 0 && "border-t border-border");

/**
 * The Leaderboard (LEADERBOARD-PAGE, `/ranking`, the dock's Ranking; the Paved UX Book draws none: the integrated pages' style, the Guild
 * members' rows above all). The HUD's drawer, docked at the right from `tablet` as the dock's other pages, a full page with Back on a
 * phone. Its tabs at its foot, the Vault's bottom navigation (`FooterTabsList`): Players (by crowns, the points the HUD and the guilds
 * show), Guilds (by score, the sum of their members' crowns), Alliances (ALLIANCES: by score, the sum of their guilds' scores, each
 * on its laurel), and Friends at the right end (the viewer among their friends, by the same crowns). Each tab a section title
 * with its count (Alliances without one, the owner's word of 2026-11-08), then the ranking on a carved list, a row per place: the first three in the medals' colours, the viewer's own on the
 * Guild page's gold wash with its tag. While the viewer's row is out of view, it is pinned on the side it left (the owner's decision of
 * 2026-11-07): at the top of the body, under the header, when it is above the view, the list scrolling under it; at the foot over the
 * tabs when it is below, or past the list's end. A tap brings it into view (past the list, opens their profile).
 */
export function LeaderboardScene({ tab, onTabChange, players, guilds, alliances, friends, myGuild = null, myGuildPlace = null, myAlliance = null, myAlliancePlace = null, unavailable = false, onOpenPlayer, onOpenGuild, onOpenAlliance, open = true, onBack, returnFocus }: LeaderboardSceneProps) {
  const reduced = useReducedMotionConfig();
  // The viewer's own row in the list shown, observed while it is mounted.
  const [ownRow, setOwnRow] = useState<HTMLButtonElement | null>(null);
  const outOfView = useOutOfView(ownRow);
  // Where the pinned row stands: at the body's top while the row is above the view; at the foot otherwise (below it, past the list).
  let pinSide: OutOfViewSide = "below";

  // The players' list shown (Players or Friends) and the viewer's place in it.
  const ranked = tab === "players" ? players.data : tab === "friends" ? friends.data : null;
  const me = ranked?.me ?? null;
  const guildList = guilds.data;
  const guildPlace = myGuild === null || !guildList ? -1 : guildList.findIndex((g) => g.id === myGuild);
  const reveal = () => {
    ownRow?.scrollIntoView?.({ block: "center", behavior: reduced ? "auto" : "smooth" });
    ownRow?.focus({ preventScroll: true });
  };

  // A players' list's rows (Players, Friends): the viewer's own, at their place, on the gold wash.
  const playerRows = (ranking: PlayerRanking) =>
    ranking.players.map((p, i) => {
      const own = ranking.me !== null && ranking.me.place === i + 1;
      return (
        <li key={p.address} className={rowRule(i)}>
          <PlayerRankRow ref={own ? setOwnRow : undefined} profile={p} place={i + 1} own={own} onOpen={() => onOpenPlayer?.(p.address)} className={listRowShape(i, ranking.players.length)} />
        </li>
      );
    });

  // The pinned row: the viewer's, while their row is out of view; past the list's end (a place beyond it), always.
  let pinned: ReactNode = null;
  if (!unavailable && me && ranked) {
    const listed = me.place <= ranked.players.length;
    if (!listed || outOfView) pinned = <PlayerRankRow profile={me.profile} place={me.place} own onOpen={listed ? reveal : () => onOpenPlayer?.(me.profile.address)} />;
    if (listed && outOfView) pinSide = outOfView;
  }
  // The viewer's guild: while its row is out of view, on the side it left; past the list's end (its place in the whole ranking beyond
  // it), always, at the foot, a tap opening its page.
  if (!unavailable && tab === "guilds" && guildList) {
    if (guildPlace >= 0) {
      if (outOfView) {
        pinned = <GuildRankRow guild={guildList[guildPlace]!} place={guildPlace + 1} own onOpen={reveal} />;
        pinSide = outOfView;
      }
    } else if (myGuildPlace && myGuildPlace.guild.id === myGuild && myGuildPlace.place > guildList.length) {
      const { guild, place } = myGuildPlace;
      pinned = <GuildRankRow guild={guild} place={place} own onOpen={() => onOpenGuild?.(guild.id)} />;
    }
  }
  // The viewer's alliance (ALLIANCES): the guilds' rule, its row out of view on the side it left, past the list's end at the foot.
  const allianceList = alliances.data;
  const alliancePlace = myAlliance === null || !allianceList ? -1 : allianceList.findIndex((a) => a.id === myAlliance);
  if (!unavailable && tab === "alliances" && allianceList) {
    if (alliancePlace >= 0) {
      if (outOfView) {
        pinned = <AllianceRankRow alliance={allianceList[alliancePlace]!} place={alliancePlace + 1} own onOpen={reveal} />;
        pinSide = outOfView;
      }
    } else if (myAlliancePlace && myAlliancePlace.alliance.id === myAlliance && myAlliancePlace.place > allianceList.length) {
      const { alliance, place } = myAlliancePlace;
      pinned = <AllianceRankRow alliance={alliance} place={place} own onOpen={() => onOpenAlliance?.(alliance.id)} />;
    }
  }
  // The pin's strip (FOOTER-TABS' rule, the Vault's bill): on the body's charcoal, full width, the row carved as the list it stands for.
  const pin = pinned && (
    <div data-slot="ranking-pinned" data-side={pinSide === "above" ? "top" : "foot"} className="bg-secondary px-4 py-2">
      <div className="drawer-carved flex rounded-xl">{pinned}</div>
    </div>
  );
  // The body's top fade (`scroll-hint`, a mask on the scroller itself) would dim the top pin, drawn inside it: off while it shows, the
  // list under the pin hidden by it anyway.
  const pinnedOnTop = pinned !== null && pinSide === "above";
  useLayoutEffect(() => {
    const body = pinnedOnTop ? ownRow?.closest<HTMLElement>("[data-hud-drawer-body]") : null;
    if (!body) return;
    body.style.setProperty("--scroll-hint-start", "0px");
    return () => {
      body.style.removeProperty("--scroll-hint-start");
    };
  }, [pinnedOnTop, ownRow]);

  return (
    <HudDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onBack?.();
      }}
      title="Ranking"
      side="right"
      slot="ranking"
      returnFocus={returnFocus}
      onInteractOutside={keepForDialogs}
    >
      <Tabs
        value={tab}
        // Radix calls it twice on a press (pointer down, then focus): a change to the tab shown is no change.
        onValueChange={(next) => {
          if (next !== tab && (LEADERBOARD_TABS as readonly string[]).includes(next)) onTabChange?.(next as LeaderboardTab);
        }}
        className="flex flex-col gap-3"
      >
        {/* The top pin: a strip of no height stuck to the body's top (its padding and the tabs' gap taken back), the row drawn over the
            list from it, full width; the list scrolls under it and the real row, coming back, shows where the pin stood. */}
        <div data-slot="ranking-top" className="sticky -top-4 z-10 -mx-4 -mt-4 -mb-3 h-0">
          {pinSide === "above" && (
            <div style={TOP_PIN} className="absolute inset-x-0 top-0">
              {pin}
            </div>
          )}
        </div>
        {unavailable ? (
          <p className={NOTE}>Rankings are not on this network yet.</p>
        ) : (
          <>
            <TabsContent value="players" className="flex flex-col">
              <RankedList
                title="Players"
                label="Players by crowns"
                read={players}
                empty="No player is ranked yet."
                rows={playerRows}
              />
            </TabsContent>
            <TabsContent value="guilds" className="flex flex-col">
              <RankedList
                title="Guilds"
                label="Guilds by score"
                read={guilds}
                empty="No guild is ranked yet."
                rows={(list) =>
                  list.map((g, i) => {
                    const own = g.id === myGuild;
                    return (
                      <li key={g.id} className={rowRule(i)}>
                        <GuildRankRow ref={own ? setOwnRow : undefined} guild={g} place={i + 1} own={own} onOpen={() => onOpenGuild?.(g.id)} className={listRowShape(i, list.length)} />
                      </li>
                    );
                  })
                }
              />
            </TabsContent>
            <TabsContent value="alliances" className="flex flex-col">
              <RankedList
                title="Alliances"
                count={false}
                label="Alliances by score"
                read={alliances}
                empty="No alliance is ranked yet: a guild's leader creates one from the guild's Alliance."
                rows={(list) =>
                  list.map((a, i) => {
                    const own = a.id === myAlliance;
                    return (
                      <li key={a.id} className={rowRule(i)}>
                        <AllianceRankRow ref={own ? setOwnRow : undefined} alliance={a} place={i + 1} own={own} onOpen={() => onOpenAlliance?.(a.id)} className={listRowShape(i, list.length)} />
                      </li>
                    );
                  })
                }
              />
            </TabsContent>
            <TabsContent value="friends" className="flex flex-col">
              <RankedList title="Friends" label="Friends by crowns" read={friends} empty="No friend to rank yet: friends are the players you follow who follow you back." rows={playerRows} />
            </TabsContent>
          </>
        )}
        <DrawerFooter>
          <div data-slot="ranking-footer" className="flex flex-col">
            {/* The viewer's row over the tabs, below the view or past the list: flush with the bar, so the current tab hangs from it. */}
            {pinSide === "below" && pin}
            <FooterTabsList aria-label="Ranking">
              {TABS.map(({ id, label, art }) => (
                <FooterTab key={id} value={id} label={label} art={tabArt(art)} />
              ))}
            </FooterTabsList>
          </div>
        </DrawerFooter>
      </Tabs>
    </HudDrawer>
  );
}
