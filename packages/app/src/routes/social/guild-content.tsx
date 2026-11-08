import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { GUILD_SIZES, GuildBrowse, GuildFinder, GuildInvitations, NO_GUILD_FILTERS, type GuildFinderAction, type GuildFinderFilters } from "../../components/containers/guild-finder";
import { SocialUnavailable } from "../../components/containers/social-empty";
import { Skeleton } from "../../components/ui/skeleton";
import { InlineError } from "../../components/elements/inline-error";
import { useGuildRanking, useGuildSearch, useGuildWrites, usePlayerGuild, useSuggestedGuilds, type GuildWriteRun } from "../../data/guilds";
import { usePlayerProgress } from "../../data/player-progress";
import { usePvpLeagueOf } from "../../data/pvp-standing";
import type { GuildSummary } from "../../data/social-source";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { GUILD_PARAM } from "../guild-param";
import { useNow } from "../now";
import { useOpenGuild } from "../open-guild";
import { useOpenPlayer } from "../open-player";
import { ALLIANCE_PARAM, ALLIANCE_VIEW, VIEW_PARAM, allianceParamOf, type AllianceViewState } from "../open-alliance";
import { AllianceViews } from "./alliance-view";
import { OwnGuild } from "./guild-view";

// The guild page's content (#953; the Social page's Guild tab until #973): the player's guild with its header, menu and tabs
// (#973), or the finder of a player in none; any other guild's page (`?guild=`) is drawn in its drawer's place by the pages' host
// (`page-views-host.tsx`, DRAWER-NAV-IN-PLACE); an alliance's page in the guild page's place (ALLIANCES, `?alliance=`). The guild's page
// (`guild-view.tsx`) is in the page's chunk since #973: a chunk of its own put one more name in the first load's preload map.

/** A finder action as the guild source's write. */
function finderWrite(action: GuildFinderAction): GuildWriteRun {
  switch (action.type) {
    case "create":
      return (g, me) => g.createGuild(me, action.draft);
    case "answer-invitation":
      return (g, me) => g.answerInvitation(me, action.guild, action.accept, action.leaving);
    case "cancel-request":
      return (g, me) => g.cancelRequest(me);
  }
}

/** A list read as the finder shows it. */
const listOf = (read: { data: readonly GuildSummary[] | undefined; error: Error | null; refetch: () => void }) => ({
  guilds: read.data ?? null,
  error: read.error?.message ?? null,
  errorDetail: read.error ? errorDetail(read.error) : undefined,
  onRetry: read.refetch,
});

export function GuildContent() {
  const wallet = useAccount();
  const sources = useDataSources();
  const me = sources.signer?.address ?? wallet.address ?? null;
  const now = useNow();
  const player = usePlayerGuild(me);
  const writes = useGuildWrites(me);
  const openPlayer = useOpenPlayer();
  const openGuild = useOpenGuild();
  // The level and crowns the requirements read: the home's reads and cache.
  const level = usePlayerProgress(me).data?.level;
  const league = usePvpLeagueOf(sources, me ?? "0x0");
  const candidate = me !== null && level !== undefined && league ? { level, crowns: league.crowns } : null;

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<GuildFinderFilters>(NO_GUILD_FILTERS);
  const size = GUILD_SIZES[filters.size];
  const results = useGuildSearch({ query, joinType: filters.joinType ?? undefined, meetsFor: filters.meets && me ? me : undefined, minMembers: size.min, maxMembers: size.max });
  const suggested = useSuggestedGuilds(me);
  const ranking = useGuildRanking();

  // The first visit to the guild page (open point 10's default: the mock's invitation a minute later).
  const { run, unavailable } = writes;
  useEffect(() => {
    if (!unavailable) void run((g, p) => g.visitGuildTab(p)).catch(() => undefined);
  }, [unavailable, run]);

  // ALLIANCES: an alliance's page (`?alliance=<id>`) or the player's own Alliance (`?view=alliance`), views of the drawer in the guild
  // page's place; Back goes back where it was opened from (a history entry), or drops the parameter on a link or a reload.
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const own = player.data?.guild?.id ?? null;
  const allianceId = allianceParamOf(params.get(ALLIANCE_PARAM));
  const ownAlliance = params.get(VIEW_PARAM) === ALLIANCE_VIEW;
  const openAlliance = useCallback(
    (id: number) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete(VIEW_PARAM);
          next.delete(GUILD_PARAM);
          next.set(ALLIANCE_PARAM, String(id));
          return next;
        },
        { state: { allianceView: true } satisfies AllianceViewState, preventScrollReset: true },
      ),
    [setParams],
  );
  const openOwnAlliance = useCallback(
    () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete(ALLIANCE_PARAM);
          next.set(VIEW_PARAM, ALLIANCE_VIEW);
          return next;
        },
        { state: { allianceView: true } satisfies AllianceViewState, preventScrollReset: true },
      ),
    [setParams],
  );
  const closeAlliance = useCallback(() => {
    if ((location.state as AllianceViewState | null)?.allianceView) return void navigate(-1);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(ALLIANCE_PARAM);
        next.delete(VIEW_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [location.state, navigate, setParams]);
  // A guild of an alliance's page opens in the drawer's place, Back to the alliance (DRAWER-NAV-IN-PLACE); the player's own guild,
  // the view opened from their guild page, is the page under it: Back to it.
  const openGuildOver = useCallback(
    (id: number) => {
      if (id === own && !(location.state as AllianceViewState | null)?.outside) return closeAlliance();
      openGuild(id);
    },
    [own, closeAlliance, location.state, openGuild],
  );

  if (player.unavailable) return <SocialUnavailable>Guilds are not on this network yet.</SocialUnavailable>;
  // The account still read (NO-GUEST: every player has one): the guild's loading.
  if (me === null) return <Skeleton aria-busy className="h-40 rounded-xl" />;

  const state = player.data;
  const find = (
    <GuildBrowse
      candidate={candidate}
      query={query}
      onQueryChange={setQuery}
      filters={filters}
      onFiltersChange={setFilters}
      results={listOf(results)}
      suggested={listOf(suggested)}
      ranking={listOf(ranking)}
      onOpenGuild={openGuild}
      suggestedEmpty="No other guild to suggest right now: search one, or see the ranking."
    />
  );
  if (allianceId !== null || ownAlliance)
    return (
      <div className="flex flex-col gap-5">
        <AllianceViews key={allianceId ?? "own"} id={allianceId} me={me} now={now} onClose={closeAlliance} onOpenGuild={openGuildOver} onOpenAlliance={openAlliance} />
      </div>
    );
  return (
    <div className="flex flex-col gap-5">
      <InlineError title="Guild" message={player.error?.message} detail={player.error ? errorDetail(player.error) : undefined} />
      {!state && !player.error && <Skeleton aria-busy className="h-40 rounded-xl" />}
      {state?.guild ? (
        <>
          <GuildInvitations invitations={state.invitations} current={state.guild.name} now={now} onOpenGuild={openGuild} onAction={(a) => writes.run(finderWrite(a))} />
          <OwnGuild
            guild={state.guild}
            me={me}
            now={now}
            unread={state.unread}
            writes={writes}
            onOpenPlayer={openPlayer}
            // The member's Find guilds (#973): the finder's search and lists, in its view in the drawer (GUILD-PAGE); a guild found
            // opens in its place.
            find={find}
            onOpenAlliance={openAlliance}
            onOpenOwnAlliance={openOwnAlliance}
          />
        </>
      ) : (
        state && (
          <GuildFinder
            player={state}
            now={now}
            candidate={candidate}
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            results={listOf(results)}
            suggested={listOf(suggested)}
            ranking={listOf(ranking)}
            onOpenGuild={openGuild}
            onAction={(a) => writes.run(finderWrite(a))}
          />
        )
      )}
    </div>
  );
}
