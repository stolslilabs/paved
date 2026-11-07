import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotionConfig } from "motion/react";
import { formatInteger } from "@paved/game-core";
import type { GuildSummary, PlayerRanking } from "../../data/social-source";
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
import { GuildRankRow, PlayerRankRow } from "../containers/leaderboard";

/** The Leaderboard's tabs (`?tab=`); Alliances is shown, disabled, until the game has alliances. */
export type LeaderboardTab = "players" | "guilds" | "friends";

export const LEADERBOARD_TABS: readonly LeaderboardTab[] = ["players", "guilds", "friends"];

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
  /** The guilds by score, the sum of their members' crowns. */
  guilds: RankingRead<readonly GuildSummary[]>;
  /** The viewer among their friends (the mutual follows) by crowns, and their place among them; no friend, an empty ranking. */
  friends: RankingRead<PlayerRanking>;
  /** The viewer's guild (its row in gold), or null: in none. */
  myGuild?: number | null;
  /** No ranking on this network: no social source. */
  unavailable?: boolean;
  /** A player's row: their profile (Friends' profile sheet, `?player=`). */
  onOpenPlayer?: (address: string) => void;
  /** A guild's row: its page. */
  onOpenGuild?: (id: number) => void;
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
 * The footer's tabs (FOOTER-TABS, the Vault's bottom navigation): Players, Guilds, Alliances in its place, coming soon, and Friends at
 * the right end (the owner's ask of 2026-11-07). Each its painted icon at 36 px: the player and the handshake of `ui-art.ts`; the
 * Guilds' shield and the Alliances' two shields over a laurel, the ranking's own (`ranking-art.ts`, the owner's asks of 2026-11-07).
 */
type TabArt = "user" | "guilds" | "alliances" | "friends";
const TABS: readonly { id: LeaderboardTab | "alliances"; label: string; art: TabArt; soon?: true }[] = [
  { id: "players", label: "Players", art: "user" },
  { id: "guilds", label: "Guilds", art: "guilds" },
  { id: "alliances", label: "Alliances", art: "alliances", soon: true },
  { id: "friends", label: "Friends", art: "friends" },
];

/** A tab's painted icon, 36 px (the drawers' icons' look, `drawer-icon`). */
const tabArt = (art: TabArt) =>
  art === "alliances" || art === "guilds" ? <img {...rankingArtSources(art, 36)} alt="" draggable={false} decoding="async" className="drawer-icon size-9" /> : <UiIcon name={art} px={36} className="drawer-icon size-9" />;

/** An empty list's words, or the network's: on the drawer's carved surface (the friends' lists'). */
const NOTE = "drawer-carved rounded-xl px-4 py-6 text-center text-sm font-semibold text-muted-foreground";

/**
 * Whether `el` is out of its drawer's view, not wholly in the scrolling body (`data-hud-drawer-body`): the viewer's own row, pinned at
 * the foot while it is. False without an element, or where no `IntersectionObserver` is (jsdom): the row counts as shown.
 */
function useOutOfView(el: HTMLElement | null): boolean {
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOut(!entry!.isIntersecting || entry!.intersectionRatio < 0.95), { root: el.closest("[data-hud-drawer-body]"), threshold: [0, 0.95] });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return el !== null && out;
}

/** A list's states: still read (its skeletons), failed (Retry), empty, or its rows on the carved panel. */
function RankedList<T>({ title, read, empty, label, rows }: { title: string; read: RankingRead<T>; empty: string; label: string; rows: (data: T) => ReactNode[] }) {
  const items = read.data === null ? null : rows(read.data);
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <SectionTitle>
        {title}
        {items !== null && <span className="numeric font-sans text-base font-bold text-muted-foreground">{formatInteger(items.length)}</span>}
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

/** A row of a carved list: the near-black rule above every row but the first (the Guild members'). */
const rowRule = (index: number) => cn("flex", index > 0 && "border-t border-border");

/**
 * The Leaderboard (LEADERBOARD-PAGE, `/ranking`, the dock's Ranking; the Paved UX Book draws none: the integrated pages' style, the Guild
 * members' rows above all). The HUD's drawer, docked at the right from `tablet` as the dock's other pages, a full page with Back on a
 * phone. Its tabs at its foot, the Vault's bottom navigation (`FooterTabsList`): Players (by crowns, the points the HUD and the guilds
 * show), Guilds (by score, the sum of their members' crowns), Alliances in its place, disabled, its carved "Soon" (`FooterTab`'s `soon`),
 * until the game has them, and Friends at the right end (the viewer among their friends, by the same crowns). Each tab a section title
 * with its count, then the ranking on a carved list, a row per place: the first three in the medals' colours, the viewer's own on the
 * Guild page's gold wash with its tag. While the viewer's row is out of view (or past the list's end), it is pinned at the foot over the
 * tabs: a tap brings it into view (past the list, opens their profile).
 */
export function LeaderboardScene({ tab, onTabChange, players, guilds, friends, myGuild = null, unavailable = false, onOpenPlayer, onOpenGuild, open = true, onBack, returnFocus }: LeaderboardSceneProps) {
  const reduced = useReducedMotionConfig();
  // The viewer's own row in the list shown, observed while it is mounted.
  const [ownRow, setOwnRow] = useState<HTMLButtonElement | null>(null);
  const outOfView = useOutOfView(ownRow);

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
          <PlayerRankRow ref={own ? setOwnRow : undefined} profile={p} place={i + 1} own={own} onOpen={() => onOpenPlayer?.(p.address)} />
        </li>
      );
    });

  // The pinned row: the viewer's, while their row is out of view; past the list's end (a place beyond it), always.
  let pinned: ReactNode = null;
  if (!unavailable && me && ranked) {
    const listed = me.place <= ranked.players.length;
    if (!listed || outOfView) pinned = <PlayerRankRow profile={me.profile} place={me.place} own onOpen={listed ? reveal : () => onOpenPlayer?.(me.profile.address)} />;
  }
  if (!unavailable && tab === "guilds" && guildList && guildPlace >= 0 && outOfView) pinned = <GuildRankRow guild={guildList[guildPlace]!} place={guildPlace + 1} own onOpen={reveal} />;

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
                        <GuildRankRow ref={own ? setOwnRow : undefined} guild={g} place={i + 1} own={own} onOpen={() => onOpenGuild?.(g.id)} />
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
            {/* The viewer's row over the tabs (FOOTER-TABS' rule, the Vault's bill): on the body's charcoal, full width, flush with the
                bar, so the current tab hangs from it; the row carved as the list it stands for. */}
            {pinned && (
              <div data-slot="ranking-pinned" className="bg-secondary px-4 py-2">
                <div className="drawer-carved flex rounded-xl">{pinned}</div>
              </div>
            )}
            <FooterTabsList aria-label="Ranking">
              {TABS.map(({ id, label, art, soon }) => (
                <FooterTab key={id} value={id} label={label} soon={soon} art={tabArt(art)} />
              ))}
            </FooterTabsList>
          </div>
        </DrawerFooter>
      </Tabs>
    </HudDrawer>
  );
}
