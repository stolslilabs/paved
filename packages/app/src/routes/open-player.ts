import { useCallback } from "react";
import { useLocation, useSearchParams } from "react-router";
import { PLAYER_PARAM, viewsOf, type PlayerSheetState } from "./player-param";

/**
 * Opens a player's public profile (#952) over the current page: `?player=<id>`, a new history entry. DRAWER-NAV-IN-PLACE (#1064): in
 * the open drawer's place (a guild's member: in place of the guild, which Back shows again).
 */
export function useOpenPlayer(): (address: string) => void {
  const [, setParams] = useSearchParams();
  const { state } = useLocation();
  return useCallback(
    (address: string) => {
      void import("./page-views-host").then(() => import("./player-profile-sheet"));
      setParams(
        (params) => {
          const next = new URLSearchParams(params);
          // One page at a time: the profile in the guild's place (`GUILD_PARAM`, as a literal).
          next.delete("guild");
          next.set(PLAYER_PARAM, address);
          return next;
        },
        { state: { playerSheet: true, views: viewsOf(state) + 1 } satisfies PlayerSheetState, preventScrollReset: true },
      );
    },
    [setParams, state],
  );
}
