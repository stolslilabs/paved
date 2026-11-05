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
import { DrawerRow } from "../elements/drawer-row";
import { GuildEmblem } from "../elements/guild-emblem";
import { InlineError } from "../elements/inline-error";
import type { UiIconName } from "../elements/ui-art";
import { useGuildActions } from "./guild-sheets";

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
   * How they are drawn: the profile's buttons, or the drawer's raised rows with their painted icons (GUILD-PAGE: a member's view on
   * the guild page, the owner's ask of 2026-11-05). Left out, buttons.
   */
  layout?: "buttons" | "rows";
}

/** "5 min": the wait to an officer's next kick. */
const minutes = (s: number) => `${Math.max(1, Math.ceil(s / 60))} min`;

/** One of the actions, drawn as a button or a row. */
interface MemberActionItem {
  key: string;
  label: string;
  /** Font Awesome's, on a button. */
  icon: string;
  /** The painted one, on a row. */
  art: UiIconName;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * The guild actions on another player's profile (#953), only those the viewer's rank allows: Invite, for a player in no guild or
 * in another; Promote, Demote, Kick (with an optional reason) and Make leader, for a member of the viewer's guild. Each one,
 * Invite included, asks to confirm. An officer's kick waits 20 minutes after the last one: the button says how long.
 */
export function GuildMemberActions({ viewer, target, now, onAction, layout = "buttons" }: GuildMemberActionsProps) {
  const { ask, dialog, pending, error } = useGuildActions(onAction);
  const who = target.name ?? "this player";
  const actor = { address: viewer.address, rank: viewer.rank };
  const same = target.guild === viewer.guild.id && target.rank !== null;
  const items: MemberActionItem[] = [];
  let why: string | null = null;
  if (!same) {
    const refused = inviteRefusal(viewer.rank, { id: viewer.guild.id, members: viewer.guild.members }, { guild: target.guild, blockedInviter: false, invited: target.invited });
    if (refused !== "rank")
      items.push({
        key: "invite",
        label: refused === "invited-already" ? `Invited to ${viewer.guild.name}` : `Invite to ${viewer.guild.name}`,
        icon: refused === "invited-already" ? "check" : "plus",
        art: "invite-player",
        disabled: refused !== null || pending,
        onClick: () => ask({ title: `Invite ${who} to ${viewer.guild.name}?`, text: "The invitation waives the guild's requirements and lapses after 7 days.", confirm: "Invite" }, () => ({ type: "invite" })),
      });
    if (refused !== null && refused !== "rank" && refused !== "invited-already") why = REFUSALS[refused];
  } else {
    const t = { address: target.address, rank: target.rank! };
    // GUILD-PAGE's five ranks: one rank up or down, named.
    const up = rankAbove(t.rank);
    const down = rankBelow(t.rank);
    if (up !== null && promoteRefusal(actor, t) === null)
      items.push({
        key: "promote",
        label: `Promote to ${rankName(up)}`,
        icon: "arrow-trend-up",
        art: "promote",
        onClick: () => ask({ title: `Promote ${who}?`, text: RANK_RIGHTS[up], confirm: `Promote to ${rankName(up)}` }, () => ({ type: "promote" })),
      });
    if (down !== null && demoteRefusal(actor, t) === null)
      items.push({
        key: "demote",
        label: `Demote to ${rankName(down)}`,
        icon: "chevron-left",
        art: "demote",
        onClick: () => ask({ title: `Demote ${who}?`, text: `They become a ${rankName(down)}.`, confirm: `Demote to ${rankName(down)}` }, () => ({ type: "demote" })),
      });
    if (makeLeaderRefusal(actor, t) === null)
      items.push({
        key: "leader",
        label: "Make leader",
        icon: "crown",
        art: "crown",
        onClick: () => ask({ title: `Make ${who} the leader?`, text: "They lead the guild; you become an Officer.", confirm: "Make leader" }, () => ({ type: "make-leader" })),
      });
    if (kickRefusal({ ...actor, lastKick: null }, t, now) === null) {
      const wait = viewer.nextKickAt !== null && viewer.nextKickAt > now ? viewer.nextKickAt - now : 0;
      items.push({
        key: "kick",
        label: wait > 0 ? `Kick again in ${minutes(wait)}` : "Kick",
        icon: "right-from-bracket",
        art: "kicked",
        destructive: true,
        disabled: wait > 0,
        onClick: () => ask({ title: `Kick ${who}?`, text: `They leave ${viewer.guild.name} at once.`, confirm: "Kick", destructive: true, field: { label: "Reason", max: GUILD_KICK_REASON_MAX, optional: true } }, (reason) => ({ type: "kick", reason })),
      });
    }
  }
  const buttons: ReactNode[] = items.map((item) =>
    layout === "rows" ? (
      <DrawerRow key={item.key} art={item.art} label={item.label} tone={item.destructive ? "danger" : "default"} disabled={item.disabled} onClick={item.onClick} />
    ) : (
      <Button key={item.key} variant={item.destructive ? "destructive" : "outline"} disabled={item.disabled} onClick={item.onClick}>
        <Icon name={item.icon} size="xs" />
        {item.label}
      </Button>
    ),
  );
  if (why) buttons.push(<p key="why" className="text-center text-xs text-muted-foreground">{why}</p>);
  if (buttons.length === 0) return null;
  return (
    <div data-slot="guild-actions" className="flex flex-col gap-2">
      {buttons}
      <InlineError title="Guild" message={error} />
      {dialog}
    </div>
  );
}
