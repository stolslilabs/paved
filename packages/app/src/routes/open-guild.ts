import { useCallback } from "react";
import { useLocation, useSearchParams } from "react-router";
import { GUILD_PARAM, type GuildSheetState } from "./guild-param";
import type { PageView } from "./player-param";

/**
 * Opens a guild's page (#953) from anywhere: `?guild=<id>` on the current page, a new history entry, so Back closes it.
 * DRAWER-NAV-IN-PLACE (#1064): in the open drawer's place, over the page shown (a profile: its guild line), which the entry keeps under
 * it (`below`), so Back shows it again as it was. The player's own guild too, as its guild page draws it.
 * The covered page is read inline (`useOpenPlayer` reads it the same way): importing a shared module put one more chunk name in the
 * first load's preload map.
 */
export function useOpenGuild(): (id: number) => void {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  return useCallback(
    (id: number) => {
      void import("./page-views-host");
      const held = state as GuildSheetState | null;
      // `PLAYER_PARAM`, as a literal.
      const player = params.get("player");
      const guild = params.get(GUILD_PARAM);
      const top: PageView | null = player !== null ? { kind: "player", id: player } : guild !== null ? { kind: "guild", id: guild } : null;
      const next = new URLSearchParams(params);
      next.delete("player");
      next.set(GUILD_PARAM, String(id));
      setParams(next, {
        state: { guildSheet: true, views: (held?.views ?? 0) + 1, below: top ? [...(held?.below ?? []), top] : [] } satisfies GuildSheetState,
        preventScrollReset: true,
      });
    },
    [params, setParams, state],
  );
}
