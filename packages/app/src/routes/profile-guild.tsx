import { GuildLine, GuildMemberActions, type GuildMemberAction } from "../components/containers/guild-profile";
import { useGuildBadge, useGuildWrites, usePlayerGuild, type GuildWriteRun } from "../data/guilds";
import { addressKey } from "../data/keys";
import { useOpenGuild } from "./open-guild";

// The guild parts of a player's public profile (#953), in the profile's chunk: the guild line and the rank actions.

/** A profile action as the guild source's write, on `target`. */
function memberWrite(action: GuildMemberAction, target: string): GuildWriteRun {
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

/** The ID as the guilds keep it, or the text as it came when it is not one. */
const keyOf = (address: string): string => {
  try {
    return addressKey(address);
  } catch {
    return address;
  }
};

/** The guild `address` is in, as their profile shows it: its emblem, name and their rank; a tap opens its page. */
export function ProfileGuildLine({ address, onOpened }: { address: string; onOpened?: () => void }) {
  const badge = useGuildBadge(address).data;
  const openGuild = useOpenGuild();
  if (!badge) return null;
  return (
    <GuildLine
      badge={badge}
      onOpen={(id) => {
        onOpened?.();
        openGuild(id);
      }}
    />
  );
}

/** The guild actions the connected player's rank allows on `address`'s profile: Invite, Promote, Demote, Kick, Make leader. */
export function ProfileGuildActions({ address, name, me, now }: { address: string; name: string | null; me: string | null; now: number }) {
  const mine = usePlayerGuild(me).data?.guild ?? null;
  const badge = useGuildBadge(address).data;
  const writes = useGuildWrites(me);
  if (me === null || mine === null || mine.rank === null || badge === undefined) return null;
  const target = keyOf(address);
  return (
    <GuildMemberActions
      viewer={{ address: keyOf(me), guild: { id: mine.id, name: mine.name, members: mine.members }, rank: mine.rank, nextKickAt: mine.nextKickAt }}
      target={{ address: target, name, guild: badge?.id ?? null, rank: badge?.rank ?? null, invited: mine.invitations?.some((i) => keyOf(i.profile.address) === target) ?? false }}
      now={now}
      onAction={(a) => writes.run(memberWrite(a, target))}
    />
  );
}
