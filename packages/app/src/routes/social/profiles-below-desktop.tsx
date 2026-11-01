import { lazy, Suspense } from "react";
import { useSidePanel } from "../../lib/side-panel";
import { DESKTOP_QUERY } from "../home-layout";

/** The public profile's host (#952), its own chunk: fetched with the page's code, not after it renders. */
const loadHost = () => import("../player-profile-host");
const PlayerProfileHost = lazy(loadHost);
void loadHost().catch(() => {});

/**
 * The players' profiles (`?player=`, #952) over a social page below `desktop`, where the page is the whole screen; from `desktop`
 * the home's host, under the side panel, serves.
 */
export function ProfilesBelowDesktop() {
  const desktop = useSidePanel(DESKTOP_QUERY);
  if (desktop) return null;
  return (
    <Suspense fallback={null}>
      <PlayerProfileHost />
    </Suspense>
  );
}
