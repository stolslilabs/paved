import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as m from "motion/react-m";
import { GUILD_JOIN_TYPES, formatAgo, formatInteger, type GuildCandidate, type GuildDraft, type GuildJoinType } from "@paved/game-core";
import type { GuildInvitation, GuildSummary, PlayerGuild } from "../../data/social-source";
import { JOIN_TYPES } from "../../lib/guild-text";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { DrawerRow } from "../elements/drawer-row";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { PlayerName } from "../elements/player-name";
import { SectionTitle } from "../elements/section-title";
import { UiIcon } from "../elements/ui-icon";
import { GuildCard } from "./guild-card";
import { GuildForm, NEW_GUILD, useGuildActions } from "./guild-sheets";
import { ViewHeader, useDrawerView } from "./hud-drawer";

/** The search's member-count filter: any, small (under 10), mid (10 to 29), large (30 and more). */
export type GuildSizeFilter = "any" | "small" | "mid" | "large";
export const GUILD_SIZES: Record<GuildSizeFilter, { label: string; min?: number; max?: number }> = {
  any: { label: "Any size" },
  small: { label: "Under 10", max: 9 },
  mid: { label: "10 to 29", min: 10, max: 29 },
  large: { label: "30+", min: 30 },
};

/** The search's filters (#953): the join type, "requirements I meet", the member count. */
export interface GuildFinderFilters {
  joinType: GuildJoinType | null;
  meets: boolean;
  size: GuildSizeFilter;
}
export const NO_GUILD_FILTERS: GuildFinderFilters = { joinType: null, meets: false, size: "any" };
const filtered = (f: GuildFinderFilters) => f.joinType !== null || f.meets || f.size !== "any";

/** A list's state: read, still read (null), or failed. */
export interface GuildList {
  guilds: readonly GuildSummary[] | null;
  error?: string | null;
  errorDetail?: ErrorDetail;
  onRetry?: () => void;
}

/** The Guild tab's actions outside a guild page: create, answer an invitation, cancel the request. */
export type GuildFinderAction = { type: "create"; draft: GuildDraft } | { type: "answer-invitation"; guild: number; accept: boolean; leaving: boolean } | { type: "cancel-request" };

/** An empty list's line, in the panel's place (the battle logs', the guild page's). */
const EMPTY = "drawer-carved rounded-xl px-4 py-6 text-center text-xs font-semibold text-muted-foreground";
/** A raised button of the finder (Accept, Decline, Cancel): the drawer's raised grey, its words outlined. */
const RAISED_BUTTON = "state-layer drawer-raised text-outline h-10 cursor-pointer gap-1.5 rounded-xl px-4 text-sm font-bold";

/** A section of the finder, the drawer's: its engraved title in the display font and a count at its end, then its content. */
function FinderSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <SectionTitle>
        {title}
        {count !== undefined && <span className="numeric font-sans text-base font-bold text-muted-foreground">{formatInteger(count)}</span>}
      </SectionTitle>
      {children}
    </section>
  );
}

/** A list of guilds, the drawer's carved list (a rule between its rows), its states: read, still read, empty, failed. */
function Cards({ list, player, ranked, empty, onOpen }: { list: GuildList; player: Pick<GuildCandidate, "level" | "crowns"> | null; ranked?: boolean; empty: string; onOpen?: (id: number) => void }) {
  return (
    <>
      <InlineError
        title="Guilds"
        message={list.error}
        detail={list.errorDetail}
        action={
          list.onRetry && (
            <Button size="sm" variant="secondary" onClick={list.onRetry}>
              Try again
            </Button>
          )
        }
      />
      {list.guilds === null && !list.error && (
        <div aria-busy className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}
      {list.guilds?.length === 0 && <p className={EMPTY}>{empty}</p>}
      {list.guilds && list.guilds.length > 0 && (
        <ul className="drawer-carved flex flex-col rounded-xl">
          {list.guilds.map((g, i) => (
            <li key={g.id} className={cn("flex", i > 0 && "border-t border-border")}>
              <GuildCard guild={g} place={ranked ? i + 1 : undefined} player={player} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export interface GuildInvitationsProps {
  invitations: readonly GuildInvitation[];
  /** The guild the player is in (they confirm leaving it to accept), or null. */
  current: string | null;
  now: number;
  onAction?: (action: GuildFinderAction) => Promise<unknown> | void;
  onOpenGuild?: (id: number) => void;
}

/**
 * The invitations a player holds (#953), newest first: each guild's card, who sent it and when it lapses; Accept or Decline. GUILD-PAGE:
 * under the drawer's engraved title, each on a carved panel, Accept and Decline raised.
 */
export function GuildInvitations({ invitations, current, now, onAction, onOpenGuild }: GuildInvitationsProps) {
  const { run, ask, dialog, pending, error } = useGuildActions(onAction);
  if (invitations.length === 0) return null;
  return (
    <FinderSection title="Invitations" count={invitations.length}>
      <ul className="flex flex-col gap-2">
        {invitations.map((inv) => (
          <li key={inv.guild.id} data-slot="guild-invitation" className="drawer-carved flex flex-col gap-2 rounded-xl pb-3">
            <GuildCard guild={inv.guild} onOpen={onOpenGuild} />
            <p className="px-3 text-xs font-semibold wrap-anywhere text-muted-foreground">
              From <PlayerName name={inv.inviterName} address={inv.inviter} className="font-bold whitespace-normal text-foreground" />, {formatAgo(inv.sentAt - now)}. Lapses in {Math.max(1, Math.ceil((inv.expiresAt - now) / 86_400))}d; no requirement applies.
            </p>
            <div className="grid grid-cols-2 gap-2 px-3">
              <Button
                variant="ghost"
                className={RAISED_BUTTON}
                disabled={pending}
                onClick={() =>
                  current
                    ? ask({ title: `Leave ${current}?`, text: `To join ${inv.guild.name}, you leave ${current} first.`, confirm: "Leave and join", destructive: true }, () => ({ type: "answer-invitation", guild: inv.guild.id, accept: true, leaving: true }))
                    : void run({ type: "answer-invitation", guild: inv.guild.id, accept: true, leaving: false })
                }
              >
                <Icon name="check" size="xs" className="text-success" />
                Accept
              </Button>
              <Button variant="ghost" className={RAISED_BUTTON} disabled={pending} onClick={() => void run({ type: "answer-invitation", guild: inv.guild.id, accept: false, leaving: false })}>
                <Icon name="xmark" size="xs" />
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <InlineError title="Invitation" message={error} />
      {dialog}
    </FinderSection>
  );
}

export interface GuildFinderProps {
  /** The player's guild state: guildless here; their invitations and their request. */
  player: PlayerGuild;
  now: number;
  /** Their level and crowns: the cards say which requirements they miss. Null: not known. */
  candidate: Pick<GuildCandidate, "level" | "crowns"> | null;
  query: string;
  onQueryChange?: (query: string) => void;
  filters: GuildFinderFilters;
  onFiltersChange?: (filters: GuildFinderFilters) => void;
  /** The search's results (by name or tag, the filters applied), while a query or a filter is set. */
  results: GuildList;
  suggested: GuildList;
  ranking: GuildList;
  onOpenGuild?: (id: number) => void;
  onAction?: (action: GuildFinderAction) => Promise<unknown> | void;
  /** Where it starts: the finder, or Create a guild's view (its story). */
  initialCreating?: boolean;
}

/**
 * The Guild page of a player in no guild (#953): the invitations they hold, their waiting request, Create, and the search by
 * name or `#` tag with its filters (join type, requirements met, size); without a query, the guilds suggested to them (those
 * they may join, the most active first) or the ranking by score. Each card opens the guild's page. GUILD-PAGE: in the drawer's style
 * (the owner's ask of 2026-11-05), each part under its engraved title, on carved panels; Create a guild a raised row opening its view in
 * the drawer (the form, `GuildForm`), Back to the finder.
 */
export function GuildFinder({ player, now, candidate, query, onQueryChange, filters, onFiltersChange, results, suggested, ranking, onOpenGuild, onAction, initialCreating = false }: GuildFinderProps) {
  const [creating, setCreating] = useState(initialCreating);
  const [moved, setMoved] = useState(false);
  const { run, pending, error } = useGuildActions(onAction);
  const open = (next: boolean) => {
    setMoved(true);
    setCreating(next);
  };
  const inDrawer = useDrawerView(creating ? "Create a guild" : null, () => open(false));
  // A move between the finder and Create starts at the top of the drawer's body, as the guild page's views (#1030): Create takes the
  // focus on its view, the finder gives it back to the Create row it left from (else the focus falls to the drawer, the next Tab to Back).
  const shown = useRef<HTMLDivElement>(null);
  const createRow = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!moved) return;
    const region = shown.current?.closest("[data-hud-drawer-body]");
    if (region) region.scrollTop = 0;
    if (creating) shown.current?.focus({ preventScroll: true });
    else createRow.current?.focus();
  }, [creating, moved]);
  return (
    <div data-slot="guild-finder" className="flex flex-col gap-5">
      {!inDrawer && creating && <ViewHeader title="Create a guild" onBack={() => open(false)} />}
      <m.div
        key={creating ? "create" : "finder"}
        ref={shown}
        tabIndex={-1}
        data-slot="guild-finder-view"
        data-view={creating ? "create" : "finder"}
        initial={moved && { x: creating ? 48 : -48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="flex flex-col gap-5 outline-none"
      >
        {creating ? (
          <>
            <p className="text-sm font-semibold text-muted-foreground">Free for now. You become its Leader.</p>
            <GuildForm mode="create" initial={NEW_GUILD} pending={pending} error={error} onSubmit={(draft) => void run({ type: "create", draft }).then((done) => done && open(false))} />
          </>
        ) : (
          <>
            <GuildInvitations invitations={player.invitations} current={null} now={now} onAction={onAction} onOpenGuild={onOpenGuild} />

            {player.request && (
              <FinderSection title="Your request">
                <div className="drawer-carved flex flex-col gap-2 rounded-xl pb-3">
                  <GuildCard guild={player.request.guild} onOpen={onOpenGuild} />
                  <div className="flex items-center justify-between gap-2 px-3">
                    <span className="text-xs font-semibold text-muted-foreground">Sent {formatAgo(player.request.sentAt - now)}; waiting for an answer.</span>
                    <Button variant="ghost" className={RAISED_BUTTON} loading={pending} onClick={() => void run({ type: "cancel-request" })}>
                      Cancel
                    </Button>
                  </div>
                </div>
                <InlineError title="Request" message={error} />
              </FinderSection>
            )}

            <div data-slot="guild-none" className="drawer-carved flex flex-col gap-3 rounded-xl p-3">
              <div className="flex flex-col gap-1">
                <p className="text-outline font-display text-xl leading-tight tracking-wide">You are in no guild</p>
                <p className="text-sm font-semibold text-muted-foreground">Join one to share announcements and climb its ranking, or found your own.</p>
              </div>
              <DrawerRow ref={createRow} art="plus" label="Create a guild" next onClick={() => open(true)} />
            </div>

            <GuildBrowse
              candidate={candidate}
              query={query}
              onQueryChange={onQueryChange}
              filters={filters}
              onFiltersChange={onFiltersChange}
              results={results}
              suggested={suggested}
              ranking={ranking}
              onOpenGuild={onOpenGuild}
            />
          </>
        )}
      </m.div>
    </div>
  );
}

/** The guild search and its lists (#953): what the finder shows under Create, and the guild page's Find guilds (#973). */
export type GuildBrowseProps = Pick<GuildFinderProps, "candidate" | "query" | "onQueryChange" | "filters" | "onFiltersChange" | "results" | "suggested" | "ranking" | "onOpenGuild"> & {
  /** What Suggested says with no guild to suggest. */
  suggestedEmpty?: string;
};

/** A filter's choice, on the filters' carved panel: no key face, the one on lit (the white 15% and the gold words). */
const FILTER = "bg-transparent font-bold";

/**
 * The search by name or `#` tag with its filters (join type, requirements met, size); without a query, the guilds suggested to the
 * player (those they may join, the most active first) or the ranking by score. Each card opens the guild's page. GUILD-PAGE: under the
 * drawer's engraved title; the search carved with the painted magnifier; the filters on a carved panel, the join types under their
 * painted icons; Suggested and Ranking the Shop's word tabs; the guilds the drawer's carved list.
 */
export function GuildBrowse({ candidate, query, onQueryChange, filters, onFiltersChange, results, suggested, ranking, onOpenGuild, suggestedEmpty = "No guild you can join right now: search one, or create yours." }: GuildBrowseProps) {
  const [list, setList] = useState<"suggested" | "ranking">("suggested");
  const searching = query.trim() !== "" || filtered(filters);
  const set = (change: Partial<GuildFinderFilters>) => onFiltersChange?.({ ...filters, ...change });
  return (
    <FinderSection title="Find a guild">
      <label className="drawer-carved flex min-h-11 items-center gap-2 rounded-xl px-3">
        <UiIcon name="find" px={24} className="size-6" />
        <input
          type="search"
          aria-label="Guild name or tag"
          placeholder="Guild name or #tag"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          onChange={(e) => onQueryChange?.(e.target.value)}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query !== "" && (
          <Button size="icon" variant="ghost" className="-mr-3 shrink-0" aria-label="Clear the search" onClick={() => onQueryChange?.("")}>
            <Icon name="xmark" size="xs" />
          </Button>
        )}
      </label>
      <div data-slot="guild-filters" className="drawer-carved flex flex-col gap-1 rounded-xl p-2">
        <ToggleGroup type="single" size="sm" aria-label="Join type" className="flex-wrap gap-1" value={filters.joinType ?? "all"} onValueChange={(v) => v && set({ joinType: v === "all" ? null : (v as GuildJoinType) })}>
          <ToggleGroupItem value="all" className={FILTER}>
            All
          </ToggleGroupItem>
          {GUILD_JOIN_TYPES.map((t) => (
            <ToggleGroupItem key={t} value={t} className={cn(FILTER, "gap-1")}>
              <UiIcon name={JOIN_TYPES[t].art} px={16} className="size-4" />
              {JOIN_TYPES[t].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup type="single" size="sm" aria-label="Members" className="flex-wrap gap-1" value={filters.size} onValueChange={(v) => v && set({ size: v as GuildSizeFilter })}>
          {(Object.keys(GUILD_SIZES) as GuildSizeFilter[]).map((s) => (
            <ToggleGroupItem key={s} value={s} className={FILTER}>
              {GUILD_SIZES[s].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <label className="flex min-h-11 items-center justify-between gap-3 px-2 text-sm font-bold">
          Requirements I meet
          <Switch checked={filters.meets} onCheckedChange={(meets) => set({ meets })} aria-label="Requirements I meet" />
        </label>
      </div>
      {searching ? (
        <Cards list={results} player={candidate} empty="No guild found." onOpen={onOpenGuild} />
      ) : (
        <Tabs value={list} onValueChange={(v) => setList(v as typeof list)} className="gap-3">
          <TabsList aria-label="Guilds" className="h-auto w-full bg-transparent p-0" indicatorClassName="top-auto bottom-0 h-1 rounded-full bg-primary">
            <TabsTrigger value="suggested" className="text-outline h-11 text-lg font-bold">
              Suggested
            </TabsTrigger>
            <TabsTrigger value="ranking" className="text-outline h-11 text-lg font-bold">
              Ranking
            </TabsTrigger>
          </TabsList>
          <TabsContent value="suggested" className="flex flex-col gap-2">
            <Cards list={suggested} player={candidate} empty={suggestedEmpty} onOpen={onOpenGuild} />
          </TabsContent>
          <TabsContent value="ranking" className="flex flex-col gap-2">
            <Cards list={ranking} player={candidate} ranked empty="No guild yet." onOpen={onOpenGuild} />
          </TabsContent>
        </Tabs>
      )}
    </FinderSection>
  );
}
