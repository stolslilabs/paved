import {
  GUILD_KICK_REASON_MAX,
  demoteRefusal,
  inviteRefusal,
  kickRefusal,
  makeLeaderRefusal,
  promoteRefusal,
  rankAbove,
  rankBelow,
  type GuildRank,
} from "@paved/game-core";
import type { ReactNode } from "react";
import type { GuildWriteRun } from "../../data/guilds";
import type { GuildBadge } from "../../data/social-source";
import { RANK_RIGHTS, REFUSALS, rankName } from "../../lib/guild-text";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError } from "../elements/inline-error";
import { UiIcon } from "../elements/ui-icon";
import { useGuildActions } from "./guild-sheets";
import { ActionTile } from "./profile-action";

/** The guild on a profile (#953): its emblem, name and the player's rank; a tap opens its page. */
export function GuildLine({ badge, onOpen }: { badge: GuildBadge; onOpen?: (id: number) => void }) {
  return (
    <button
      type="button"
      data-slot="guild-line"
      aria-label={`${badge.name}, ${rankName(badge.rank)}`}
      onClick={() => onOpen?.(badge.id)}
      className="state-layer flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left outline-none"
    >
      <GuildEmblem emblem={badge.emblem} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="min-w-0 font-semibold wrap-anywhere">{badge.name}</span>
        <span className="text-xs text-muted-foreground">
          {rankName(badge.rank)} · <span className="numeric">{badge.tag}</span>
        </span>
      </span>
      <Icon name="chevron-right" size="xs" className="shrink-0 text-muted-foreground" />
    </button>
  );
}

/** The viewer's own guild, as the profile's actions read it. */
export interface GuildViewer {
  address: string;
  guild: { id: number; name: string; members: number };
  rank: GuildRank;
  /** When they may kick next (an officer's 20 minutes), in seconds; null: they may not kick. */
  nextKickAt: number | null;
}

/** The player whose profile it is, as the actions read them. */
export interface GuildTarget {
  address: string;
  /** Their name, or null (their short address). */
  name: string | null;
  /** The guild they are in, or null; their rank in it. */
  guild: number | null;
  rank: GuildRank | null;
  /** They hold an open invitation from the viewer's guild. */
  invited: boolean;
}

/** The profile's guild actions. */
export type GuildMemberAction = { type: "invite" } | { type: "promote" } | { type: "demote" } | { type: "kick"; reason: string } | { type: "make-leader" };

/**
 * A rank action on `target` as the guild source's write (#953): from their profile, and from their row on the guild page's
 * Members (#973).
 */
export function memberWrite(action: GuildMemberAction, target: string): GuildWriteRun {
  switch (action.type) {
    case "invite":
      return (g, me) => g.invite(me, target);
    case "promote":
      return (g, me) => g.promote(me, target);
    case "demote":
      return (g, me) => g.demote(me, target);
    case "kick":
      return (g, me) => g.kick(me, target, action.reason.trim());
    case "make-leader":
      return (g, me) => g.makeLeader(me, target);
  }
}

export interface GuildMemberActionsProps {
  viewer: GuildViewer;
  target: GuildTarget;
  now: number;
  onAction?: (action: GuildMemberAction) => Promise<unknown> | void;
  /**
   * `buttons` (the default), or `tiles` (FRIENDS-PAGE, the owner's ask of 2026-11-05: another player's
   * profile, the Profile's raised tiles, a row of three columns under its own).
   */
  look?: "buttons" | "tiles";
}

/** A mark over a tile's icon, at its lower right, in a disc: what the action does to the rank. */
const MARK = "absolute -right-1.5 -bottom-1 grid size-5 place-items-center rounded-full text-primary-foreground ring-2 ring-secondary";

/** "5 min": the wait to an officer's next kick. */
const minutes = (s: number) => `${Math.max(1, Math.ceil(s / 60))} min`;

/**
 * The guild actions on another player's profile (#953), only those the viewer's rank allows: Invite, for a player in no guild or
 * in another; Promote, Demote, Kick (with an optional reason) and Make leader, for a member of the viewer's guild. Each one,
 * Invite included, asks to confirm. An officer's kick waits 20 minutes after the last one: the button says how long.
 */
export function GuildMemberActions({ viewer, target, now, onAction, look = "buttons" }: GuildMemberActionsProps) {
  const { ask, dialog, pending, error } = useGuildActions(onAction);
  const who = target.name ?? "this player";
  const actor = { address: viewer.address, rank: viewer.rank };
  const same = target.guild === viewer.guild.id && target.rank !== null;
  if (look === "tiles") return <GuildActionTiles {...{ viewer, target, now, who, actor, same, ask, dialog, pending, error }} />;
  const buttons: ReactNode[] = [];
  if (!same) {
    const refused = inviteRefusal(viewer.rank, { id: viewer.guild.id, members: viewer.guild.members }, { guild: target.guild, blockedInviter: false, invited: target.invited });
    if (refused !== "rank")
      buttons.push(
        <Button key="invite" variant="outline" disabled={refused !== null || pending} onClick={() => ask({ title: `Invite ${who} to ${viewer.guild.name}?`, text: "The invitation waives the guild's requirements and lapses after 7 days.", confirm: "Invite" }, () => ({ type: "invite" }))}>
          <Icon name={refused === "invited-already" ? "check" : "plus"} size="xs" />
          {refused === "invited-already" ? `Invited to ${viewer.guild.name}` : `Invite to ${viewer.guild.name}`}
        </Button>,
      );
    if (refused !== null && refused !== "rank" && refused !== "invited-already") buttons.push(<p key="why" className="text-center text-xs text-muted-foreground">{REFUSALS[refused]}</p>);
  } else {
    const t = { address: target.address, rank: target.rank! };
    // GUILD-PAGE's five ranks: one rank up or down, named.
    const up = rankAbove(t.rank);
    const down = rankBelow(t.rank);
    if (up !== null && promoteRefusal(actor, t) === null)
      buttons.push(
        <Button key="promote" variant="outline" onClick={() => ask({ title: `Promote ${who}?`, text: RANK_RIGHTS[up], confirm: `Promote to ${rankName(up)}` }, () => ({ type: "promote" }))}>
          <Icon name="arrow-trend-up" size="xs" />
          Promote to {rankName(up)}
        </Button>,
      );
    if (down !== null && demoteRefusal(actor, t) === null)
      buttons.push(
        <Button key="demote" variant="outline" onClick={() => ask({ title: `Demote ${who}?`, text: `They become a ${rankName(down)}.`, confirm: `Demote to ${rankName(down)}` }, () => ({ type: "demote" }))}>
          <Icon name="chevron-left" size="xs" />
          Demote to {rankName(down)}
        </Button>,
      );
    if (makeLeaderRefusal(actor, t) === null)
      buttons.push(
        <Button key="leader" variant="outline" onClick={() => ask({ title: `Make ${who} the leader?`, text: "They lead the guild; you become an Officer.", confirm: "Make leader" }, () => ({ type: "make-leader" }))}>
          <Icon name="crown" size="xs" />
          Make leader
        </Button>,
      );
    if (kickRefusal({ ...actor, lastKick: null }, t, now) === null) {
      const wait = viewer.nextKickAt !== null && viewer.nextKickAt > now ? viewer.nextKickAt - now : 0;
      buttons.push(
        <Button
          key="kick"
          variant="destructive"
          disabled={wait > 0}
          onClick={() => ask({ title: `Kick ${who}?`, text: `They leave ${viewer.guild.name} at once.`, confirm: "Kick", destructive: true, field: { label: "Reason", max: GUILD_KICK_REASON_MAX, optional: true } }, (reason) => ({ type: "kick", reason }))}
        >
          <Icon name="right-from-bracket" size="xs" />
          {wait > 0 ? `Kick again in ${minutes(wait)}` : "Kick"}
        </Button>,
      );
    }
  }
  if (buttons.length === 0) return null;
  return (
    <div data-slot="guild-actions" className="flex flex-col gap-2">
      {buttons}
      <InlineError title="Guild" message={error} />
      {dialog}
    </div>
  );
}

/**
 * The same actions as the Profile's tiles (FRIENDS-PAGE): Invite (the guild's banners, a plus; Invited, a check), and, drawn by
 * Codex in the HUD's rendering (`friends-art.ts`, the owner's ask of 2026-11-05), Promote (the shield, a rising arrow), Demote (the
 * shield, an arrow down), Leader (the guild's banner crowned), Kick (a boot kicking). Their names are the buttons' ("Promote to
 * Officer", "Kick again in 5 min"); their words short, under the icon.
 */
function GuildActionTiles({ viewer, target, now, who, actor, same, ask, dialog, pending, error }: {
  viewer: GuildViewer;
  target: GuildTarget;
  now: number;
  who: string;
  actor: { address: string; rank: GuildRank };
  same: boolean;
  ask: ReturnType<typeof useGuildActions<GuildMemberAction>>["ask"];
  dialog: ReactNode;
  pending: boolean;
  error: string | null;
}) {
  const tiles: ReactNode[] = [];
  const notes: ReactNode[] = [];
  if (!same) {
    const refused = inviteRefusal(viewer.rank, { id: viewer.guild.id, members: viewer.guild.members }, { guild: target.guild, blockedInviter: false, invited: target.invited });
    if (refused !== "rank") {
      const invited = refused === "invited-already";
      tiles.push(
        <ActionTile
          key="invite"
          art="guild"
          label={invited ? "Invited" : "Invite"}
          name={invited ? `Invited to ${viewer.guild.name}` : `Invite to ${viewer.guild.name}`}
          disabled={refused !== null || pending}
          onClick={() => ask({ title: `Invite ${who} to ${viewer.guild.name}?`, text: "The invitation waives the guild's requirements and lapses after 7 days.", confirm: "Invite" }, () => ({ type: "invite" }))}
        >
          {invited ? (
            <span className={`${MARK} bg-success`}>
              <Icon name="check" size="xs" />
            </span>
          ) : (
            <UiIcon name="plus" px={20} className="absolute -right-1.5 -bottom-1 size-5" />
          )}
        </ActionTile>,
      );
    }
    if (refused !== null && refused !== "rank" && refused !== "invited-already") notes.push(<p key="why" className="col-span-3 text-center text-xs text-muted-foreground">{REFUSALS[refused]}</p>);
  } else {
    const t = { address: target.address, rank: target.rank! };
    // GUILD-PAGE's five ranks: one rank up or down, named.
    const up = rankAbove(t.rank);
    const down = rankBelow(t.rank);
    if (up !== null && promoteRefusal(actor, t) === null)
      tiles.push(
        <ActionTile key="promote" art="guild-promote" label="Promote" name={`Promote to ${rankName(up)}`} onClick={() => ask({ title: `Promote ${who}?`, text: RANK_RIGHTS[up], confirm: `Promote to ${rankName(up)}` }, () => ({ type: "promote" }))} />,
      );
    if (down !== null && demoteRefusal(actor, t) === null)
      tiles.push(
        <ActionTile key="demote" art="guild-demote" label="Demote" name={`Demote to ${rankName(down)}`} onClick={() => ask({ title: `Demote ${who}?`, text: `They become a ${rankName(down)}.`, confirm: `Demote to ${rankName(down)}` }, () => ({ type: "demote" }))} />,
      );
    if (makeLeaderRefusal(actor, t) === null)
      tiles.push(<ActionTile key="leader" art="guild-leader" label="Leader" name="Make leader" onClick={() => ask({ title: `Make ${who} the leader?`, text: "They lead the guild; you become an Officer.", confirm: "Make leader" }, () => ({ type: "make-leader" }))} />);
    if (kickRefusal({ ...actor, lastKick: null }, t, now) === null) {
      const wait = viewer.nextKickAt !== null && viewer.nextKickAt > now ? viewer.nextKickAt - now : 0;
      tiles.push(
        <ActionTile
          key="kick"
          art="guild-kick"
          label={wait > 0 ? `Kick in ${minutes(wait)}` : "Kick"}
          name={wait > 0 ? `Kick again in ${minutes(wait)}` : "Kick"}
          disabled={wait > 0}
          onClick={() => ask({ title: `Kick ${who}?`, text: `They leave ${viewer.guild.name} at once.`, confirm: "Kick", destructive: true, field: { label: "Reason", max: GUILD_KICK_REASON_MAX, optional: true } }, (reason) => ({ type: "kick", reason }))}
        />,
      );
    }
  }
  if (tiles.length === 0 && notes.length === 0) return null;
  return (
    <div data-slot="guild-actions" className="grid grid-cols-3 gap-1.5">
      {tiles}
      {notes}
      <InlineError title="Guild" message={error} className="col-span-3" />
      {dialog}
    </div>
  );
}
