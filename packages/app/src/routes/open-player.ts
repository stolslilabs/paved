import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { PLAYER_PARAM, type PlayerSheetState } from "./player-profile";

/** Opens a player's public profile (#952) over the current page: `?player=<id>`, a new history entry. */
export function useOpenPlayer(): (address: string) => void {
  const [, setParams] = useSearchParams();
  return useCallback(
    (address: string) => {
      void import("./player-profile-host").then(() => import("./player-profile-sheet"));
      setParams(
        (params) => {
          const next = new URLSearchParams(params);
          next.set(PLAYER_PARAM, address);
          return next;
        },
        { state: { playerSheet: true } satisfies PlayerSheetState, preventScrollReset: true },
      );
    },
    [setParams],
  );
}
