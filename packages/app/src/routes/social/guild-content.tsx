import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { GUILD_SIZES, GuildFinder, GuildInvitations, NO_GUILD_FILTERS, type GuildFinderAction, type GuildFinderFilters } from "../../components/containers/guild-finder";
import { GuildFindSheet } from "../../components/containers/guild-page-sheets";
import { SocialEmpty, SocialUnavailable } from "../../components/containers/social-empty";
import { Skeleton } from "../../components/ui/skeleton";
import { InlineError } from "../../components/elements/inline-error";
import { useGuildRanking, useGuildSearch, useGuildWrites, usePlayerGuild, useSuggestedGuilds, type GuildWriteRun } from "../../data/guilds";
import { usePlayerProgress } from "../../data/player-progress";
import { usePvpLeagueOf } from "../../data/pvp-standing";
import type { GuildSummary } from "../../data/social-source";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { errorDetail } from "../error-detail";
import { GUILD_PARAM, guildParamOf, type GuildSheetState } from "../guild-param";
import { useNow } from "../now";
import { useOpenGuild } from "../open-guild";
import { useOpenPlayer } from "../open-player";
import { GuildSheet, OwnGuild } from "./guild-view";

// The guild page's content (#953; the Social page's Guild tab until #973): the player's guild with its header, menu and tabs
// (#973), or the finder of a player in none; any other guild's page in a sheet over it (`?guild=`). The guild's page
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
  // The member's Find guilds (#973): the finder's search and lists, in a sheet over their guild.
  const [finding, setFinding] = useState(false);
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

  // Another guild's page, at `?guild=`: kept in the sheet while it slides out.
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const asked = guildParamOf(params.get(GUILD_PARAM));
  const own = player.data?.guild?.id ?? null;
  const [shown, setShown] = useState<number | null>(asked);
  if (asked !== null && asked !== shown) setShown(asked);
  const closeGuild = useCallback(() => {
    if ((location.state as GuildSheetState | null)?.guildSheet) return void navigate(-1);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(GUILD_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [location.state, navigate, setParams]);
  // The player's own guild is the page itself: no sheet over it.
  const sheetOpen = asked !== null && asked !== own;

  if (player.unavailable) return <SocialUnavailable>Guilds are not on this network yet.</SocialUnavailable>;
  if (me === null) return <SocialEmpty page="guild" />;

  const state = player.data;
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
            onFindGuilds={() => setFinding(true)}
          />
          <GuildFindSheet
            open={finding}
            onOpenChange={setFinding}
            candidate={candidate}
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            results={listOf(results)}
            suggested={listOf(suggested)}
            ranking={listOf(ranking)}
            onOpenGuild={openGuild}
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
      {shown !== null && shown !== own && (
        <GuildSheet key={shown} id={shown} me={me} player={state ?? null} candidate={candidate} now={now} open={sheetOpen} onClose={closeGuild} writes={writes} onOpenPlayer={openPlayer} />
      )}
    </div>
  );
}
