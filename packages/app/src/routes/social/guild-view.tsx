import { useEffect } from "react";
import type { GuildCandidate } from "@paved/game-core";
import { GuildPage, type GuildPageAction } from "../../components/containers/guild-page";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { Skeleton } from "../../components/ui/skeleton";
import { InlineError } from "../../components/elements/inline-error";
import { useGuild, type GuildWrites, type GuildWriteRun } from "../../data/guilds";
import type { GuildView, PlayerGuild } from "../../data/social-source";
import { useSidePanel } from "../../lib/side-panel";
import { errorDetail } from "../error-detail";
import { DESKTOP_QUERY } from "../home-layout";
import { guildApply } from "./guild-apply";

// The guild's page (#953), its own chunk: the connected player's guild in their Guild tab, and any other guild in a sheet over
// it (`?guild=`). Each action of the page is a write of the guild source (`useGuildWrites`).

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
  /** Their guild's announcements they have not read: the page marks them read once shown. */
  unread: number;
  writes: GuildWrites;
  onOpenPlayer?: (address: string) => void;
}

/** The connected player's guild, in their Guild tab: shown, its announcements are read (the tab's badge drops them). */
export function OwnGuild({ guild, me, now, unread, writes, onOpenPlayer }: OwnGuildProps) {
  const { run } = writes;
  useEffect(() => {
    if (unread > 0) void run((g, p) => g.readAnnouncements(p)).catch(() => undefined);
  }, [unread, guild.id, run]);
  return <GuildPage guild={guild} me={me} now={now} onAction={(a) => writes.run(pageWrite(a, guild.id))} onOpenPlayer={onOpenPlayer} />;
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
 * Another guild's page, over the Guild tab (`?guild=`): read as the connected player sees it, with Join, Request, Cancel or
 * the invitation's answer, or why not. Joined, the sheet closes on their own guild, now the tab's.
 */
export function GuildSheet({ id, me, player, candidate, now, open, onClose, writes, onOpenPlayer }: GuildSheetProps) {
  const desktop = useSidePanel(DESKTOP_QUERY);
  const read = useGuild(id, me);
  const guild = read.data;
  const apply = guild && player && me !== null && guild.rank === null ? guildApply(guild, player, candidate) : undefined;
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side={desktop ? "right" : "bottom"} data-slot="guild-sheet" className="max-h-[92dvh] overflow-y-auto desktop:max-w-md">
        <SheetHeader className={guild ? "sr-only" : undefined}>
          <SheetTitle>{guild ? guild.name : guild === null ? "Guild not found" : "Guild"}</SheetTitle>
          <SheetDescription>{guild ? `${guild.tag}, ${guild.members} members` : guild === null ? "No guild has this tag any more." : read.unavailable ? "Guilds are not on this network yet." : "Looking for this guild…"}</SheetDescription>
        </SheetHeader>
        {guild === undefined && read.isPending && <Skeleton aria-busy className="h-48 rounded-xl" />}
        <InlineError title="Guild" message={read.error?.message} detail={read.error ? errorDetail(read.error) : undefined} />
        {guild && (
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
      </SheetContent>
    </Sheet>
  );
}
