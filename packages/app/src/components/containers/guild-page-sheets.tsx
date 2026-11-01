import { useState, type ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import type { GuildMember, GuildView } from "../../data/social-source";
import { useSidePanel } from "../../lib/side-panel";
import { rankName } from "../../lib/guild-text";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Crowns } from "../elements/crowns";
import { PlayerAvatar } from "../elements/player-avatar";
import { PlayerName } from "../elements/player-name";
import { Presence } from "../elements/presence";
import { GuildBrowse, type GuildBrowseProps } from "./guild-finder";
import { GuildMemberActions, type GuildMemberAction } from "./guild-profile";
import { PlayerSearch, type PlayerSearchProps } from "./player-search";

/** The side panel from `desktop`; the bottom sheet under it. */
const DESKTOP_QUERY = "(min-width: 64rem)";

/** A sheet of the guild page: the side panel from `desktop`, a bottom sheet under it. */
function PageSheet({ open, onOpenChange, slot, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; slot: string; title: string; description: string; children: ReactNode }) {
  const desktop = useSidePanel(DESKTOP_QUERY);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={desktop ? "right" : "bottom"} data-sheet={slot} className={desktop ? undefined : "max-h-[92dvh]"}>
        <SheetHeader>
          <SheetTitle className="wrap-anywhere">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <ScrollRegion className="-mx-6 min-h-0 px-6">
          <div className="flex flex-col gap-4 pt-1 pb-2">{children}</div>
        </ScrollRegion>
      </SheetContent>
    </Sheet>
  );
}

export interface GuildInviteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildName: string;
  /** The player search (#952): a result picked opens their profile, where Invite is. */
  search: Omit<PlayerSearchProps, "onOpen" | "renderAction" | "className">;
  onOpenPlayer?: (address: string) => void;
}

/**
 * Invite a player (#973), from the guild page's menu (officers and the leader): the player search; a player picked opens their
 * profile, whose Invite says whether they may be invited (a player in another guild, one invited already) and asks to confirm.
 */
export function GuildInviteSheet({ open, onOpenChange, guildName, search, onOpenPlayer }: GuildInviteSheetProps) {
  return (
    <PageSheet open={open} onOpenChange={onOpenChange} slot="guild-invite" title="Invite a player" description={`Find a player, then invite them to ${guildName} from their profile. An invitation waives the requirements and lapses after 7 days.`}>
      <PlayerSearch
        {...search}
        onOpen={(address) => {
          onOpenChange(false);
          onOpenPlayer?.(address);
        }}
      />
    </PageSheet>
  );
}

export type GuildFindSheetProps = GuildBrowseProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Find guilds (#973), from the guild page's menu: the guild search and its filters, Suggested or the Ranking (#953). */
export function GuildFindSheet({ open, onOpenChange, onOpenGuild, ...browse }: GuildFindSheetProps) {
  return (
    <PageSheet open={open} onOpenChange={onOpenChange} slot="guild-find" title="Find guilds" description="Search the guilds by name or tag, or see the ranking by score.">
      <GuildBrowse
        {...browse}
        suggestedEmpty="No other guild to suggest right now: search one, or see the ranking."
        onOpenGuild={(id) => {
          onOpenChange(false);
          onOpenGuild?.(id);
        }}
      />
    </PageSheet>
  );
}

/** An item of the guild's menu. */
export interface GuildMenuItem {
  label: string;
  icon: string;
  onSelect: () => void;
  /** Leave and Disband. */
  destructive?: boolean;
  /** Why it is not offered now (a leader with members cannot leave): shown under it, the item disabled. */
  refused?: string;
}

export interface GuildMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildName: string;
  items: readonly GuildMenuItem[];
}

/**
 * The guild page's menu (#973), from its header: what the viewer's rank allows, Invite a player (officers and the leader),
 * Guild settings (the leader), Find guilds, then Leave or Disband. An item picked closes the menu first.
 */
export function GuildMenuSheet({ open, onOpenChange, guildName, items }: GuildMenuSheetProps) {
  return (
    <PageSheet open={open} onOpenChange={onOpenChange} slot="guild-menu" title="Guild menu" description={guildName}>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.label} className="flex flex-col gap-1">
            <Button
              variant={item.destructive ? "outline" : "secondary"}
              disabled={item.refused !== undefined}
              className={item.destructive ? "justify-start text-destructive" : "justify-start"}
              onClick={() => {
                onOpenChange(false);
                item.onSelect();
              }}
            >
              <Icon name={item.icon} size="xs" fixedWidth />
              {item.label}
            </Button>
            {item.refused && <p className="px-1 text-xs text-muted-foreground">{item.refused}</p>}
          </li>
        ))}
      </ul>
    </PageSheet>
  );
}

export interface GuildMemberSheetProps {
  /** The member whose row was tapped; null: closed. */
  member: GuildMember | null;
  onOpenChange: (open: boolean) => void;
  guild: GuildView;
  /** The viewer's ID: their own row offers their profile only. */
  me: string | null;
  now: number;
  /** Their public profile; the sheet closes first. */
  onOpenPlayer?: (address: string) => void;
  /** A rank action on the member, as the source's write; done, the sheet closes. */
  onAction?: (address: string, action: GuildMemberAction) => Promise<unknown> | void;
}

/**
 * A member's row tapped on the guild page (#973, as in Clash of Clans): who they are, their Profile, then the actions the viewer's
 * rank allows on theirs (Promote, Demote, Kick, Make leader), each confirmed first. Their profile keeps the same actions.
 */
export function GuildMemberSheet({ member: asked, onOpenChange, guild, me, now, onOpenPlayer, onAction }: GuildMemberSheetProps) {
  // The last member stays drawn while the sheet slides out, so an action's confirmation closes before its sheet goes.
  const [last, setLast] = useState(asked);
  if (asked !== null && asked !== last) setLast(asked);
  const member = asked ?? last;
  const p = member?.profile;
  const own = p !== undefined && me !== null && p.address === me;
  return (
    <PageSheet open={asked !== null} onOpenChange={onOpenChange} slot="guild-member-sheet" title={p ? (p.name ?? "A member") : "A member"} description={member ? `${rankName(member.rank)} of ${guild.name}` : ""}>
      {member && p && (
        <>
          <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
            <PlayerAvatar player={{ name: p.name, address: p.address }} look={p.look} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <PlayerName name={p.name} address={p.address} className="max-w-full min-w-0 truncate font-semibold" />
              <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>
                  Level <span className="numeric">{formatInteger(p.level)}</span>
                </span>
                <Crowns value={p.crowns} size="sm" tone="muted" />
              </span>
              <Presence lastSeen={p.lastSeen} now={now} />
            </span>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
              onOpenPlayer?.(p.address);
            }}
          >
            <Icon name="user" size="xs" />
            Profile
          </Button>
          {!own && me !== null && guild.rank !== null && (
            <GuildMemberActions
              viewer={{ address: me, guild: { id: guild.id, name: guild.name, members: guild.members }, rank: guild.rank, nextKickAt: guild.nextKickAt }}
              target={{ address: p.address, name: p.name, guild: guild.id, rank: member.rank, invited: false }}
              now={now}
              onAction={async (a) => {
                await onAction?.(p.address, a);
                onOpenChange(false);
              }}
            />
          )}
        </>
      )}
    </PageSheet>
  );
}
