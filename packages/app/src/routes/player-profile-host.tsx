import { lazy, Suspense, useCallback, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { PLAYER_PARAM, type PlayerSheetState } from "./player-profile";

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
  const [shown, setShown] = useState<string | null>(id);
  if (id !== null && id !== shown) setShown(id);
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
      <PlayerProfile playerId={id ?? shown} open={id !== null} onClose={close} />
    </Suspense>
  );
}

