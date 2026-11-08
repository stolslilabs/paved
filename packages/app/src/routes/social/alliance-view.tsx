import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { ALLIANCE_ACTOR_RANK, inviteGuildRefusal } from "@paved/game-core";
import { AlliancePage, type AlliancePageAction } from "../../components/containers/alliance-page";
import { GuildPicker, NoAlliance, type NoAllianceAction, type NoAllianceView } from "../../components/containers/alliance-finder";
import { AllianceGuildActions, AllianceLine, AllianceTile, type AllianceGuildAction, type AllianceGuildState } from "../../components/containers/alliance-parts";
import { EMPTY } from "../../components/containers/guild-page";
import { useDrawerView } from "../../components/containers/hud-drawer";
import { Skeleton } from "../../components/ui/skeleton";
import { InlineError } from "../../components/elements/inline-error";
import { useAlliance, useAllianceSearch, useAllianceWrites, useGuildAlliance, usePlayerAlliance, type AllianceWriteRun } from "../../data/alliances";
import { useGuildSearch } from "../../data/guilds";
import { ALLIANCE_REFUSALS } from "../../lib/alliance-text";
import { errorDetail } from "../error-detail";
import { allianceApply } from "./alliance-apply";

// ALLIANCES: the alliance views of the guild page's drawer, in its chunk: an alliance's page (`?alliance=<id>`), the player's own
// Alliance (`?view=alliance`: their guild's alliance, or "No alliance"), and what the guild pages show of the alliances (a guild's
// alliance under its tag, the member's Alliance tile, the alliance leader's actions on another guild). Each action is a write of the
// alliance source (`useAllianceWrites`).

/** An alliance page's action as the alliance source's write, for alliance `id`. */
export function allianceWrite(action: AlliancePageAction, id: number): AllianceWriteRun {
  switch (action.type) {
    case "request":
      return (a, me) => a.requestAlliance(me, id);
    case "cancel-request":
      return (a, me) => a.cancelAllianceRequest(me);
    case "answer-invitation":
      return (a, me) => a.answerAllianceInvitation(me, id, action.accept);
    case "answer-request":
      return (a, me) => a.answerAllianceRequest(me, action.guild, action.accept);
    case "settings":
      return (a, me) => a.editAlliance(me, action.settings);
    case "leave":
      return (a, me) => a.leaveAlliance(me);
  }
}

/** A "No alliance" action as the alliance source's write. */
function noAllianceWrite(action: NoAllianceAction): AllianceWriteRun {
  switch (action.type) {
    case "create":
      return (a, me) => a.createAlliance(me, action.draft);
    case "answer-invitation":
      return (a, me) => a.answerAllianceInvitation(me, action.alliance, action.accept);
    case "cancel-request":
      return (a, me) => a.cancelAllianceRequest(me);
  }
}

/** While a view's page is read: its title on the drawer's header and its Back, over the loading state or why it is not there. */
function Waiting({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useDrawerView("Alliance", onClose);
  return <>{children}</>;
}

export interface AllianceViewsProps {
  me: string;
  now: number;
  /** The alliance asked for (`?alliance=`), or null: the player's own (`?view=alliance`). */
  id: number | null;
  /** Back out of the view: to where it was opened from. */
  onClose: () => void;
  /** Opens a guild's page over the drawer (a row of the alliance's). */
  onOpenGuild: (id: number) => void;
  /** Opens another alliance's page (Find an alliance, an invitation). */
  onOpenAlliance: (id: number) => void;
}

/** Invite a guild's content: the guild search by name or tag (the guild page's source), every guild by score while it is empty. */
function InviteGuilds({ onOpenGuild }: { onOpenGuild: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const read = useGuildSearch({ query });
  return <GuildPicker query={query} onQueryChange={setQuery} guilds={read.data ?? null} error={read.error?.message ?? null} errorDetail={read.error ? errorDetail(read.error) : undefined} onOpenGuild={onOpenGuild} />;
}

/** The alliance views (ALLIANCES), in the guild page's place in its drawer: an alliance's page, or the player's own Alliance. */
export function AllianceViews({ id, ...props }: AllianceViewsProps) {
  return id === null ? <OwnAlliance {...props} /> : <AllianceRoute id={id} {...props} />;
}

/** An alliance's page, as the connected player sees it: what their guild may do there, if they lead it. */
function AllianceRoute({ id, me, now, onClose, onOpenGuild }: Omit<AllianceViewsProps, "id" | "onOpenAlliance"> & { id: number }) {
  const read = useAlliance(id, me);
  const player = usePlayerAlliance(me);
  const writes = useAllianceWrites(me);
  const alliance = read.data;
  if (!alliance)
    return (
      <Waiting onClose={onClose}>
        <InlineError title="Alliance" message={read.error?.message} detail={read.error ? errorDetail(read.error) : undefined} />
        {alliance === null ? <p className={EMPTY}>This alliance is not there any more.</p> : !read.error && <Skeleton aria-busy className="h-48 rounded-xl" />}
      </Waiting>
    );
  return (
    <AlliancePage
      key={alliance.id}
      alliance={alliance}
      myGuild={player.data?.guild?.id ?? null}
      now={now}
      apply={player.data ? allianceApply(alliance, player.data) : undefined}
      onAction={(a) => writes.run(allianceWrite(a, alliance.id))}
      onOpenGuild={onOpenGuild}
      invite={<InviteGuilds onOpenGuild={onOpenGuild} />}
      onClose={onClose}
    />
  );
}

/**
 * The player's own Alliance (the guild page's tile): their guild's alliance's page, or "No alliance" (its leader: the invitations, the
 * request, Create, Find). The first visit of a guild's leader starts the mock's invitation (a minute later).
 */
function OwnAlliance({ me, now, onClose, onOpenGuild, onOpenAlliance }: Omit<AllianceViewsProps, "id">) {
  const player = usePlayerAlliance(me);
  const writes = useAllianceWrites(me);
  const [query, setQuery] = useState("");
  const search = useAllianceSearch(query);
  // The view shown (Create, Find) kept in the history entry: Back from an alliance opened in Find comes back to Find.
  const location = useLocation();
  const navigate = useNavigate();
  const entry = location.state as { allianceSub?: NoAllianceView } | null;
  const keepView = (view: NoAllianceView | null) => void navigate({ search: location.search }, { replace: true, preventScrollReset: true, state: { ...entry, allianceSub: view ?? undefined } });
  const leader = player.data?.guild ? player.data.guild.rank >= ALLIANCE_ACTOR_RANK : false;
  const { run, unavailable } = writes;
  useEffect(() => {
    if (leader && !unavailable) void run((a, p) => a.visitAlliance(p)).catch(() => undefined);
  }, [leader, unavailable, run]);
  const state = player.data;
  if (!state)
    return (
      <Waiting onClose={onClose}>
        <InlineError title="Alliance" message={player.error?.message} detail={player.error ? errorDetail(player.error) : undefined} />
        {!player.error && <Skeleton aria-busy className="h-48 rounded-xl" />}
      </Waiting>
    );
  if (state.alliance)
    return (
      <AlliancePage
        key={state.alliance.id}
        alliance={state.alliance}
        myGuild={state.guild?.id ?? null}
        now={now}
        onAction={(a) => writes.run(allianceWrite(a, state.alliance!.id))}
        onOpenGuild={onOpenGuild}
        invite={<InviteGuilds onOpenGuild={onOpenGuild} />}
        onClose={onClose}
      />
    );
  return (
    <NoAlliance
      player={state}
      onAction={(a) => writes.run(noAllianceWrite(a))}
      onOpenAlliance={onOpenAlliance}
      query={query}
      onQueryChange={setQuery}
      list={{ alliances: search.data ?? null, error: search.error?.message ?? null, errorDetail: search.error ? errorDetail(search.error) : undefined, onRetry: search.refetch }}
      onClose={onClose}
      initialView={entry?.allianceSub}
      onViewChange={keepView}
    />
  );
}

/** A guild's alliance under its tag, once read (`AllianceLine`); nothing while read or without an alliance part. */
export function GuildAllianceLine({ guild, onOpen }: { guild: number; onOpen: (id: number) => void }) {
  const badge = useGuildAlliance(guild);
  if (badge.unavailable || badge.data === undefined) return null;
  return <AllianceLine badge={badge.data} onOpen={onOpen} />;
}

/** The member's Alliance tile, its count what waits for them (`AllianceTile`); nothing without an alliance part. */
export function GuildAllianceTile({ me, onOpen }: { me: string; onOpen: () => void }) {
  const player = usePlayerAlliance(me);
  if (player.unavailable) return null;
  return <AllianceTile count={player.data?.badge ?? 0} onOpen={onOpen} />;
}

/**
 * What the alliance's leader may do to another guild, on its page (`AllianceGuildActions`): Invite, Invited, or Make head and Remove;
 * nothing for anyone else, or while read.
 */
export function GuildAllianceActions({ me, guild }: { me: string; guild: { id: number; name: string } }) {
  const player = usePlayerAlliance(me);
  const target = useGuildAlliance(guild.id);
  const writes = useAllianceWrites(me);
  const mine = player.data?.alliance;
  if (!mine?.leads || target.data === undefined || !player.data?.guild || guild.id === player.data.guild.id) return null;
  let state: AllianceGuildState;
  if (target.data?.id === mine.id) state = { kind: "member" };
  else if (mine.invitations?.some((i) => i.guild.id === guild.id)) state = { kind: "invited" };
  else {
    const actor = { guild: player.data.guild.id, rank: player.data.guild.rank, alliance: mine.id, role: mine.role };
    const refused = inviteGuildRefusal(actor, { id: mine.id, guilds: mine.guilds }, { id: guild.id, alliance: target.data?.id ?? null, invited: false });
    state = { kind: "invite", refused: refused ? ALLIANCE_REFUSALS[refused] : null };
  }
  const write = (action: AllianceGuildAction): AllianceWriteRun => {
    switch (action.type) {
      case "invite":
        return (a, p) => a.inviteGuild(p, guild.id);
      case "make-head":
        return (a, p) => a.makeHeadGuild(p, guild.id);
      case "remove":
        return (a, p) => a.removeGuild(p, guild.id);
    }
  };
  return <AllianceGuildActions alliance={mine.name} guild={guild.name} state={state} onAction={(a) => writes.run(write(a))} />;
}
