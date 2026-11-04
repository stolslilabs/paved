import { Suspense, lazy, type ReactNode } from "react";
import { useOutlet } from "react-router";
import { useSidePanel } from "../lib/side-panel";
import { useRoutePage } from "./handle";

/**
 * The home's pages' hosts (`home-hosts.tsx`), their own chunk (the bundle rule): the drawers' pages' (MISSIONS-PAGE) at every width,
 * the side panel's (its own chunk again) from `desktop`.
 */
const HomeHosts = lazy(() => import("./home-hosts"));

/** From `desktop` (theme.css `--breakpoint-desktop`): the pages of the overlay open in the side panel. */
export const DESKTOP_QUERY = "(min-width: 64rem)";

/**
 * The home's route (`/` and its children, DESK-PANELS, #762, the owner's decisions of 2026-10-25). Below `desktop` a child is a
 * full page, as before, and the home shows on `/` alone. From `desktop` the home stays mounted, its village in view, and a
 * child (a page of the route map's `panel`: the Chests, the Shop, the Vault, the League and its defence log, Settings
 * and its pages, Play's mode choice, the Cobbles) opens in the side panel on the right, over it (`home-panel-host.tsx`, loaded
 * with the desktop's home); the URL names the page, so a link, Back and a reload work.
 * MISSIONS-PAGE: a drawer's page (`PageDef.drawer`, Missions) is the HUD's drawer over the home at every width, as the profile is:
 * the home stays mounted under it on a phone too (`home-hosts.tsx`).
 */
export function HomeLayout({ home }: { home: ReactNode }) {
  const desktop = useSidePanel(DESKTOP_QUERY);
  const page = useRoutePage();
  const outlet = useOutlet();
  const onHome = page === null || page.path === "";
  if (!desktop && !onHome && !page.drawer) return outlet;
  return (
    <>
      {home}
      <Suspense fallback={null}>
        <HomeHosts desktop={desktop} />
      </Suspense>
    </>
  );
}
