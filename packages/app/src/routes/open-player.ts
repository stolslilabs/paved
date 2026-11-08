import { useCallback } from "react";
import { useLocation, useSearchParams } from "react-router";
import { PLAYER_PARAM, type PageView, type PlayerSheetState } from "./player-param";

/**
 * Opens a player's public profile (#952) over the current page: `?player=<id>`, a new history entry. DRAWER-NAV-IN-PLACE (#1064): in
 * the open drawer's place, over the page shown (a guild: its member), which the entry keeps under it (`below`), so Back shows it again
 * as it was.
 */
export function useOpenPlayer(): (address: string) => void {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  return useCallback(
    (address: string) => {
      void import("./page-views-host").then(() => import("./player-profile-sheet"));
      const held = state as PlayerSheetState | null;
      // `GUILD_PARAM`, as a literal.
      const player = params.get(PLAYER_PARAM);
      const guild = params.get("guild");
      const top: PageView | null = player !== null ? { kind: "player", id: player } : guild !== null ? { kind: "guild", id: guild } : null;
      const next = new URLSearchParams(params);
      next.delete("guild");
      next.set(PLAYER_PARAM, address);
      setParams(next, {
        state: { playerSheet: true, views: (held?.views ?? 0) + 1, below: top ? [...(held?.below ?? []), top] : [] } satisfies PlayerSheetState,
        preventScrollReset: true,
      });
    },
    [params, setParams, state],
  );
}
