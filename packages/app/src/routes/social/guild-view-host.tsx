import { useGuildWrites, usePlayerGuild } from "../../data/guilds";
import { usePlayerProgress } from "../../data/player-progress";
import { usePvpLeagueOf } from "../../data/pvp-standing";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { useNow } from "../now";
import { useOpenAlliance, useOpenOwnAlliance } from "../open-alliance";
import { useOpenPlayer } from "../open-player";
import { GuildSheet } from "./guild-view";

/**
 * A guild's page at the URL's `?guild=` on any page (#953; DRAWER-NAV-IN-PLACE, #1064: in the open drawer's place, else in the pages'
 * own drawer, `page-views-host.tsx`, which says whether it is open and how it closes), read as the connected player sees it. The
 * player's own guild too, in place, as its guild page draws it (its tabs, its menu): a profile's guild line opens it where the profile
 * was, with Back to it.
 */
export function GuildView({ id, open, onClose }: { id: number; open: boolean; onClose: () => void }) {
  const wallet = useAccount();
  const sources = useDataSources();
  const me = sources.signer?.address ?? wallet.address ?? null;
  const now = useNow();
  const player = usePlayerGuild(me);
  const writes = useGuildWrites(me);
  const openPlayer = useOpenPlayer();
  // ALLIANCES: a guild's alliance line, and the player's own guild's Alliance tile, open the alliance views of the guild page.
  const openAlliance = useOpenAlliance();
  const openOwnAlliance = useOpenOwnAlliance();
  // The level and crowns the requirements read: the home's reads and cache.
  const level = usePlayerProgress(me).data?.level;
  const league = usePvpLeagueOf(sources, me ?? "0x0");
  const candidate = me !== null && level !== undefined && league ? { level, crowns: league.crowns } : null;
  return <GuildSheet id={id} me={me} player={player.data ?? null} candidate={candidate} now={now} open={open} onClose={onClose} writes={writes} onOpenPlayer={openPlayer} onOpenAlliance={openAlliance} onOpenOwnAlliance={openOwnAlliance} />;
}
