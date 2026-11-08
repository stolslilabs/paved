import { useCallback } from "react";
import { useAppNavigate } from "./ref";

// ALLIANCES: an alliance's page is a view of the guild page's drawer, at `/guild?alliance=<id>`; the guild page's own Alliance (the
// player's alliance, or "No alliance") at `/guild?view=alliance`. Literals and small functions: the Leaderboard's chunk opens them too.

/** The search parameter that holds the alliance whose page is open. */
export const ALLIANCE_PARAM = "alliance";
/** The guild page's own Alliance view: `?view=alliance`. */
export const VIEW_PARAM = "view";
export const ALLIANCE_VIEW = "alliance";

/** What an opening leaves in the history entry: Back then goes back, so the entry before is not left twice. */
export interface AllianceViewState {
  allianceView?: true;
  /**
   * Opened from outside the guild page's own views (the Leaderboard, a guild's page in a drawer's place): the player's own guild then
   * opens in the drawer's place, as any guild; else it is the guild page under the view, and its row goes Back to it.
   */
  outside?: true;
}

/** The alliance ID a parameter names, or null. */
export const allianceParamOf = (value: string | null): number | null => (value !== null && /^\d{1,12}$/.test(value) ? Number(value) : null);

/** Opens an alliance's page from anywhere (the Leaderboard's rows, a guild's alliance line): a new history entry, so Back closes it. */
export function useOpenAlliance(): (id: number) => void {
  const go = useAppNavigate();
  return useCallback((id: number) => void go(`/guild?${ALLIANCE_PARAM}=${id}`, { state: { allianceView: true, outside: true } satisfies AllianceViewState }), [go]);
}

/** Opens the player's own Alliance from anywhere (their guild's page in a drawer's place: its Alliance tile): Back closes it. */
export function useOpenOwnAlliance(): () => void {
  const go = useAppNavigate();
  return useCallback(() => void go(`/guild?${VIEW_PARAM}=${ALLIANCE_VIEW}`, { state: { allianceView: true, outside: true } satisfies AllianceViewState }), [go]);
}
