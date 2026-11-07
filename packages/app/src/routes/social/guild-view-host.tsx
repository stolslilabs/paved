import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useGuildWrites, usePlayerGuild } from "../../data/guilds";
import { usePlayerProgress } from "../../data/player-progress";
import { usePvpLeagueOf } from "../../data/pvp-standing";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { GUILD_PARAM, guildParamOf, type GuildSheetState } from "../guild-param";
import { useNow } from "../now";
import { useOpenPlayer } from "../open-player";
import { useAppNavigate } from "../ref";
import { GuildSheet } from "./guild-view";

/**
 * Another guild's page, at the URL's `?guild=` on any page (#953; DRAWER-NAV-IN-PLACE, #1064: in the open drawer's place, else in the
 * pages' own drawer, `page-views-host.tsx`), read as the connected player sees it. The last guild shown stays while it slides out.
 * Closed by Back when the app opened it (`useOpenGuild`), else by dropping the parameter in place (a link from outside). The player's
 * own guild is the guild page itself: asked elsewhere, the guild page opens in its place.
 */
export default function GuildViewHost() {
  const wallet = useAccount();
  const sources = useDataSources();
  const me = sources.signer?.address ?? wallet.address ?? null;
  const now = useNow();
  const player = usePlayerGuild(me);
  const writes = useGuildWrites(me);
  const openPlayer = useOpenPlayer();
  // The level and crowns the requirements read: the home's reads and cache.
  const level = usePlayerProgress(me).data?.level;
  const league = usePvpLeagueOf(sources, me ?? "0x0");
  const candidate = me !== null && level !== undefined && league ? { level, crowns: league.crowns } : null;

  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const go = useAppNavigate();
  const location = useLocation();
  const asked = guildParamOf(params.get(GUILD_PARAM));
  const own = player.data?.guild?.id ?? null;
  const [shown, setShown] = useState<number | null>(asked);
  if (asked !== null && asked !== shown) setShown(asked);
  const close = useCallback(() => {
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
  // The player's own guild, asked away from its page: the guild page, in this entry's place.
  const elsewhere = asked !== null && asked === own && location.pathname !== "/guild";
  useEffect(() => {
    if (elsewhere) void go("/guild", { replace: true });
  }, [elsewhere, go]);
  if (shown === null || shown === own) return null;
  return <GuildSheet key={shown} id={shown} me={me} player={player.data ?? null} candidate={candidate} now={now} open={asked !== null && asked === shown} onClose={close} writes={writes} onOpenPlayer={openPlayer} />;
}
