import { lazy, Suspense, useCallback, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { PLAYER_PARAM, type PlayerSheetState } from "./player-param";

// The public profile's host (#952): which player the URL names and how the sheet closes. Its own small chunk, so the first load
// carries no list of the sheet's modules; the sheet and its reads are the next chunk (`player-profile-sheet.tsx`).

const PlayerProfile = lazy(() => import("./player-profile-sheet"));

/**
 * The profile of the URL's `?player=`, over any page. The last player shown stays in the sheet while it slides out. Closed by
 * Back when the app opened it (`useOpenPlayer`), else by dropping the parameter in place (a link from outside).
 */
export default function PlayerProfileHost() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const id = params.get(PLAYER_PARAM);
  // The player shown (kept while the sheet slides out), and which opening it is: each opening, of the same player too, mounts
  // the profile afresh, so its read and its clock are those of the moment it opens.
  const [shown, setShown] = useState<{ id: string; opening: number; open: boolean } | null>(id === null ? null : { id, opening: 0, open: true });
  if (id !== null && (shown === null || id !== shown.id || !shown.open)) setShown({ id, opening: (shown?.opening ?? 0) + 1, open: true });
  if (id === null && shown?.open) setShown({ ...shown, open: false });
  const close = useCallback(() => {
    if ((location.state as PlayerSheetState | null)?.playerSheet) return void navigate(-1);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(PLAYER_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [location.state, navigate, setParams]);
  return shown === null ? null : (
    <Suspense fallback={null}>
      <PlayerProfile key={shown.opening} playerId={shown.id} open={id !== null} onClose={close} />
    </Suspense>
  );
}

