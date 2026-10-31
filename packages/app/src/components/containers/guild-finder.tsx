import { useState } from "react";
import { GUILD_JOIN_TYPES, formatAgo, type GuildCandidate, type GuildDraft, type GuildJoinType } from "@paved/game-core";
import type { GuildInvitation, GuildSummary, PlayerGuild } from "../../data/social-source";
import { JOIN_TYPES } from "../../lib/guild-text";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { PlayerName } from "../elements/player-name";
import { GuildCard } from "./guild-card";
import { GuildFormSheet, NEW_GUILD, useGuildActions } from "./guild-sheets";

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
      {list.guilds?.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>}
      {list.guilds && list.guilds.length > 0 && (
        <ul className="flex flex-col gap-2">
          {list.guilds.map((g, i) => (
            <li key={g.id}>
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

/** The invitations a player holds (#953), newest first: each guild's card, who sent it and when it lapses; Accept or Decline. */
export function GuildInvitations({ invitations, current, now, onAction, onOpenGuild }: GuildInvitationsProps) {
  const { run, ask, dialog, pending, error } = useGuildActions(onAction);
  if (invitations.length === 0) return null;
  return (
    <section aria-label="Invitations" className="flex flex-col gap-2">
      <h3 className="font-semibold">
        Invitations <span className="numeric ml-1 text-sm text-muted-foreground">{invitations.length}</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {invitations.map((inv) => (
          <li key={inv.guild.id} data-slot="guild-invitation" className="flex flex-col gap-2 rounded-xl border border-primary/60 bg-secondary/60 p-2">
            <GuildCard guild={inv.guild} onOpen={onOpenGuild} />
            <p className="px-1 text-xs wrap-anywhere text-muted-foreground">
              From <PlayerName name={inv.inviterName} address={inv.inviter} className="font-semibold whitespace-normal text-foreground" />, {formatAgo(inv.sentAt - now)}. Lapses in {Math.max(1, Math.ceil((inv.expiresAt - now) / 86_400))}d; no requirement applies.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  current
                    ? ask({ title: `Leave ${current}?`, text: `To join ${inv.guild.name}, you leave ${current} first.`, confirm: "Leave and join", destructive: true }, () => ({ type: "answer-invitation", guild: inv.guild.id, accept: true, leaving: true }))
                    : void run({ type: "answer-invitation", guild: inv.guild.id, accept: true, leaving: false })
                }
              >
                <Icon name="check" size="xs" />
                Accept
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => void run({ type: "answer-invitation", guild: inv.guild.id, accept: false, leaving: false })}>
                <Icon name="xmark" size="xs" />
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <InlineError title="Invitation" message={error} />
      {dialog}
    </section>
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
}

/**
 * The Guild tab of a player in no guild (#953): the invitations they hold, their waiting request, Create, and the search by
 * name or `#` tag with its filters (join type, requirements met, size); without a query, the guilds suggested to them (those
 * they may join, the most active first) or the ranking by score. Each card opens the guild's page.
 */
export function GuildFinder({ player, now, candidate, query, onQueryChange, filters, onFiltersChange, results, suggested, ranking, onOpenGuild, onAction }: GuildFinderProps) {
  const [list, setList] = useState<"suggested" | "ranking">("suggested");
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(0);
  const { run, pending, error } = useGuildActions(onAction);
  const searching = query.trim() !== "" || filtered(filters);
  const set = (change: Partial<GuildFinderFilters>) => onFiltersChange?.({ ...filters, ...change });
  return (
    <div data-slot="guild-finder" className="flex flex-col gap-5">
      <GuildInvitations invitations={player.invitations} current={null} now={now} onAction={onAction} onOpenGuild={onOpenGuild} />

      {player.request && (
        <section aria-label="Your request" className="flex flex-col gap-2">
          <h3 className="font-semibold">Your request</h3>
          <GuildCard guild={player.request.guild} onOpen={onOpenGuild} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Sent {formatAgo(player.request.sentAt - now)}; waiting for an officer.</span>
            <Button size="sm" variant="outline" loading={pending} onClick={() => void run({ type: "cancel-request" })}>
              Cancel
            </Button>
          </div>
          <InlineError title="Request" message={creating ? null : error} />
        </section>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <p className="font-semibold">You are in no guild</p>
        <p className="text-sm text-muted-foreground">Join one to share announcements and climb its ranking, or found your own.</p>
        <Button
          onClick={() => {
            setOpening(opening + 1);
            setCreating(true);
          }}
        >
          <Icon name="plus" size="xs" />
          Create a guild
        </Button>
      </div>

      <section aria-label="Find a guild" className="flex flex-col gap-3">
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-input bg-secondary/60 px-3 focus-within:ring-2 focus-within:ring-ring">
          <Icon name="magnifying-glass" size="xs" className="shrink-0 text-muted-foreground" />
          <input
            type="search"
            aria-label="Guild name or tag"
            placeholder="Guild name or #tag"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            value={query}
            onChange={(e) => onQueryChange?.(e.target.value)}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query !== "" && (
            <Button size="icon" variant="ghost" className="-mr-3 shrink-0" aria-label="Clear the search" onClick={() => onQueryChange?.("")}>
              <Icon name="xmark" size="xs" />
            </Button>
          )}
        </label>
        <div data-slot="guild-filters" className="flex flex-col gap-2">
          <ToggleGroup type="single" size="sm" aria-label="Join type" className="flex-wrap" value={filters.joinType ?? "all"} onValueChange={(v) => v && set({ joinType: v === "all" ? null : (v as GuildJoinType) })}>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            {GUILD_JOIN_TYPES.map((t) => (
              <ToggleGroupItem key={t} value={t}>
                {JOIN_TYPES[t].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup type="single" size="sm" aria-label="Members" className="flex-wrap" value={filters.size} onValueChange={(v) => v && set({ size: v as GuildSizeFilter })}>
            {(Object.keys(GUILD_SIZES) as GuildSizeFilter[]).map((s) => (
              <ToggleGroupItem key={s} value={s}>
                {GUILD_SIZES[s].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            Requirements I meet
            <Switch checked={filters.meets} onCheckedChange={(meets) => set({ meets })} aria-label="Requirements I meet" />
          </label>
        </div>
        {searching ? (
          <Cards list={results} player={candidate} empty="No guild found." onOpen={onOpenGuild} />
        ) : (
          <>
            <ToggleGroup type="single" aria-label="Guilds" className="w-full" value={list} onValueChange={(v) => v && setList(v as typeof list)}>
              <ToggleGroupItem value="suggested" className="flex-1">
                <Icon name="star" size="xs" />
                Suggested
              </ToggleGroupItem>
              <ToggleGroupItem value="ranking" className="flex-1">
                <Icon name="ranking-star" size="xs" />
                Ranking
              </ToggleGroupItem>
            </ToggleGroup>
            {list === "suggested" ? (
              <Cards list={suggested} player={candidate} empty="No guild you can join right now: search one, or create yours." onOpen={onOpenGuild} />
            ) : (
              <Cards list={ranking} player={candidate} ranked empty="No guild yet." onOpen={onOpenGuild} />
            )}
          </>
        )}
      </section>

      <GuildFormSheet
        key={opening}
        open={creating}
        onOpenChange={setCreating}
        mode="create"
        initial={NEW_GUILD}
        pending={pending}
        error={creating ? error : null}
        onSubmit={(draft) => void run({ type: "create", draft }).then((done) => done && setCreating(false))}
      />
    </div>
  );
}
