import { useCallback } from "react";
import { useLocation, useSearchParams } from "react-router";
import { GUILD_PARAM, type GuildSheetState } from "./guild-param";

/**
 * Opens a guild's page (#953) from anywhere: `?guild=<id>` on the current page, a new history entry, so Back closes it.
 * DRAWER-NAV-IN-PLACE (#1064): in the open drawer's place (a profile's guild line: in place of the profile, which Back shows again).
 * The player's own guild is the guild page itself (`social/guild-view-host.tsx`).
 */
export function useOpenGuild(): (id: number) => void {
  const [, setParams] = useSearchParams();
  const { state } = useLocation();
  return useCallback(
    (id: number) => {
      void import("./page-views-host");
      setParams(
        (params) => {
          const next = new URLSearchParams(params);
          // One page at a time: the guild in the profile's place (`PLAYER_PARAM`, as a literal).
          next.delete("player");
          next.set(GUILD_PARAM, String(id));
          return next;
        },
        { state: { guildSheet: true, views: ((state as GuildSheetState | null)?.views ?? 0) + 1 } satisfies GuildSheetState, preventScrollReset: true },
      );
    },
    [setParams, state],
  );
}
