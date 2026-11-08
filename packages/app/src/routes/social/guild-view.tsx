import { useEffect, useState, type ReactNode } from "react";
import { GUILD_RIGHTS, type GuildCandidate } from "@paved/game-core";
import { GuildPage, type GuildPageAction } from "../../components/containers/guild-page";
import { PlayerSearch } from "../../components/containers/player-search";
import { HudDrawer } from "../../components/containers/hud-drawer";
import { Skeleton } from "../../components/ui/skeleton";
import { InlineError } from "../../components/elements/inline-error";
import { useChatOverview } from "../../data/chat-overview";
import { useGuild, type GuildWrites, type GuildWriteRun } from "../../data/guilds";
import { usePlayerSearch } from "../../data/social";
import type { GuildView, PlayerGuild } from "../../data/social-source";
import { errorDetail } from "../error-detail";
import { openingGuildTab, storeGuildTab, type GuildTab } from "../guild-tab";
import { useAppNavigate } from "../ref";
import { guildApply } from "./guild-apply";

// The guild's page (#953), in the guild page's chunk: the connected player's guild on their guild page, with its header, menu
// and tabs (#973), and any other guild in a sheet over it (`?guild=`). Each action of the page is a write of the guild source
// (`useGuildWrites`).

/** A page action as the guild source's write, for guild `id`. */
export function pageWrite(action: GuildPageAction, id: number): GuildWriteRun {
  switch (action.type) {
    case "join":
      return (g, me) => g.joinGuild(me, id);
    case "request":
      return (g, me) => g.requestToJoin(me, id, action.message.trim());
    case "cancel-request":
      return (g, me) => g.cancelRequest(me);
    case "answer-invitation":
      return (g, me) => g.answerInvitation(me, id, action.accept, action.leaving);
    case "post":
      return (g, me) => g.postAnnouncement(me, action.text);
    case "edit-announcement":
      return (g, me) => g.editAnnouncement(me, action.id, action.text);
    case "delete-announcement":
      return (g, me) => g.deleteAnnouncement(me, action.id);
    case "answer-request":
      return (g, me) => g.answerRequest(me, action.applicant, action.accept);
    case "settings": {
      const { emblem, description, joinType, requirements } = action.draft;
      return (g, me) => g.editGuild(me, { emblem, description, joinType, requirements });
    }
    case "leave":
      return (g, me) => g.leaveGuild(me);
  }
}

export interface OwnGuildProps {
  guild: GuildView;
  me: string;
  now: number;
  /** Their guild's announcements they have not read: the page opens on them, and marks them read once shown. */
  unread: number;
  writes: GuildWrites;
  onOpenPlayer?: (address: string) => void;
  /** The menu's Find guilds: the finder's search, Suggested and the ranking, in its view (the page's). */
  find?: ReactNode;
}

/**
 * Invite a player (#973), in the menu's view: the player search, a result opening their profile (over the drawer), where Invite is.
 * Mounted while its view is shown: its query starts empty each time.
 */
function InviteSearch({ me, onOpenPlayer }: { me: string; onOpenPlayer?: (address: string) => void }) {
  const [query, setQuery] = useState("");
  const search = usePlayerSearch(query, me);
  return (
    <PlayerSearch
      query={query}
      onQueryChange={setQuery}
      results={search.data ?? null}
      error={search.error?.message ?? null}
      errorDetail={search.error ? errorDetail(search.error) : undefined}
      onRetry={search.refetch}
      unavailable={search.unavailable}
      onOpen={onOpenPlayer}
    />
  );
}

/**
 * The connected player's guild, on the guild page (#973): it opens on Announcements while one is unread, else on the last tab used
 * on this device, the first time on Members. Announcements shown, they are read (the Guild button's count drops them).
 */
export function OwnGuild({ guild, me, now, unread, writes, onOpenPlayer, find }: OwnGuildProps) {
  const { run } = writes;
  const go = useAppNavigate();
  // GUILD-PAGE's five ranks: the Requests tab for those who answer them (a Veteran and above), Invite a player from a Member.
  const answers = guild.rank !== null && guild.rank >= GUILD_RIGHTS.answer;
  const invites = guild.rank !== null && guild.rank >= GUILD_RIGHTS.invite;
  const [tab, setTab] = useState<GuildTab>(() => openingGuildTab(unread, answers));
  // The header's Chat counts the guild chat's unread messages (GUILD-PAGE, the book's badge): the chat's overview, the home's read.
  const chatUnread = useChatOverview(me).data?.conversations.find((c) => c.kind === "guild")?.unread ?? 0;
  useEffect(() => {
    if (tab === "announcements" && unread > 0) void run((g, p) => g.readAnnouncements(p)).catch(() => undefined);
  }, [tab, unread, guild.id, run]);
  return (
    <GuildPage
      guild={guild}
      me={me}
      now={now}
      tab={tab}
      onTabChange={(next) => {
        setTab(next);
        storeGuildTab(next);
      }}
      unread={unread}
      chatUnread={chatUnread}
      onAction={(a) => writes.run(pageWrite(a, guild.id))}
      onOpenPlayer={onOpenPlayer}
      // The chat page on Guild (`chatTabPath`, as a literal: the chat's URL module stays out of this chunk).
      onOpenChat={() => go("/chat/guild")}
      invite={invites ? <InviteSearch me={me} onOpenPlayer={onOpenPlayer} /> : undefined}
      find={find}
    />
  );
}

export interface GuildSheetProps {
  id: number;
  me: string | null;
  /** The connected player's guild state (what they may do here); null: a guest, or still read. */
  player: PlayerGuild | null;
  candidate: Pick<GuildCandidate, "level" | "crowns"> | null;
  now: number;
  open: boolean;
  onClose: () => void;
  writes: GuildWrites;
  onOpenPlayer?: (address: string) => void;
}

/**
 * A guild's page (`?guild=`): read as the connected player sees it, with Join, Request, Cancel or the invitation's answer, or
 * why not. Joined, it closes on the page it covered. The player's own guild is drawn as their guild page draws it (`OwnGuild`). DRAWER-NAV-IN-PLACE (#1064): opened from a drawer (the guild page, the ranking,
 * a profile's guild line, the chat), in that drawer's place, with Back; with none open, its own drawer.
 */
export function GuildSheet({ id, me, player, candidate, now, open, onClose, writes, onOpenPlayer }: GuildSheetProps) {
  const read = useGuild(id, me);
  // The player's own guild (a guildmate's profile, its guild line): their guild page itself, its tabs and menu (`OwnGuild`).
  const mine = me !== null && player?.guild?.id === id ? player.guild : null;
  const guild = mine ?? read.data;
  const apply = guild && player && me !== null && guild.rank === null ? guildApply(guild, player, candidate) : undefined;
  return (
    <HudDrawer open={open} onOpenChange={(next) => !next && onClose()} title={
        guild ? (
          // The page names the guild under it: the header says what it is, screen readers hear its name.
          <>
            <span aria-hidden>Allegiance</span>
            <span className="sr-only">{guild.name}</span>
          </>
        ) : guild === null ? (
          "Allegiance not found"
        ) : (
          "Allegiance"
        )
      } side="right" slot="guild-sheet" inPlace>
      <div data-slot="guild-sheet" className="flex flex-col gap-4">
        {guild === null && <p className="text-sm font-semibold text-muted-foreground">No allegiance has this tag any more.</p>}
        {guild === undefined && read.unavailable && <p className="text-sm font-semibold text-muted-foreground">Allegiances are not on this network yet.</p>}
        {guild === undefined && read.isPending && <Skeleton aria-busy className="h-48 rounded-xl" />}
        {!mine && <InlineError title="Allegiance" message={read.error?.message} detail={read.error ? errorDetail(read.error) : undefined} />}
        {mine && me !== null && <OwnGuild guild={mine} me={me} now={now} unread={player?.unread ?? 0} writes={writes} onOpenPlayer={onOpenPlayer} />}
        {guild && !mine && (
          <GuildPage
            guild={guild}
            me={me}
            now={now}
            apply={apply}
            onOpenPlayer={onOpenPlayer}
            onAction={async (a) => {
              await writes.run(pageWrite(a, guild.id));
              if ((a.type === "join" || (a.type === "answer-invitation" && a.accept)) && guild.rank === null) onClose();
            }}
          />
        )}
      </div>
    </HudDrawer>
  );
}
