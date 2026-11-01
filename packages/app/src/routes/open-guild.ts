import { useCallback } from "react";
import { useAppNavigate } from "./ref";
import { GUILD_PARAM, type GuildSheetState } from "./guild-param";

/**
 * Opens a guild's page (#953) from anywhere: the guild page at `?guild=<id>` (#973), a new history entry, so Back closes it.
 * The player's own guild is the guild page itself.
 */
export function useOpenGuild(): (id: number) => void {
  const go = useAppNavigate();
  return useCallback((id: number) => void go(`/guild?${GUILD_PARAM}=${id}`, { state: { guildSheet: true } satisfies GuildSheetState }), [go]);
}
