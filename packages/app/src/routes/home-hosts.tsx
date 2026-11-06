import { Suspense, lazy, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useOutlet } from "react-router";
import { useChests } from "../data/free-village-base";
import { useDataSources } from "../data/sources";
import { DrawerRouteContext } from "./drawer-route";
import { useRoutePage } from "./handle";
import { usePanelTrail } from "./panel-trail";
import { useAppNavigate } from "./ref";

/** The side panel's host and frame (the history it walks, the Radix dialog, the slide): their own chunk, from `desktop` only. */
const HomePanelHost = lazy(() => import("./home-panel-host"));
/** A chest left to open, drawn or won, asked over the home (END-CHEST): its own chunk, only while the read says one waits. */
const ChestPrompt = lazy(() => import("./chest-prompt"));

/**
 * The hosts of the home's pages (`home-layout.tsx`), one small chunk mounted with the home at every width (the entry carries one lazy
 * host, the bundle rule): the drawers' pages' everywhere, and from `desktop` the side panel's (`home-panel-host.tsx`, DESK-PANELS #762).
 */
export default function HomeHosts({ desktop }: { desktop: boolean }) {
  return (
    <>
      <HomeDrawerHost />
      <ChestPromptHost />
      {desktop && (
        <Suspense fallback={null}>
          <HomePanelHost />
        </Suspense>
      )}
    </>
  );
}

/**
 * END-CHEST (the owner's asks of 2026-11-06: every chest is opened, where it is won; the Chests page gone): a chest left to open comes
 * back over the home, in front of everything (`chest-prompt.tsx`): one drawn whose tile was not taken (the app closed or reloaded during
 * its reveal), or one won and not opened (the game's end left before its tap). Only on the home itself, never over a page or a drawer;
 * closed before its tap, it waits for the app's next run. Kept until its Claim, so the tile kept is said once the read has none left.
 */
function ChestPromptHost() {
  const me = useDataSources().signer?.address ?? null;
  const view = useChests(me).data;
  const page = useRoutePage();
  // A chest to open: one drawn and left, or won and not opened (the game's end left before its tap): every chest is opened (END-CHEST).
  const waiting = view != null && (view.open != null || view.pending.length > 0);
  const [held, setHeld] = useState(false);
  // Closed before its tap (the cross, Escape): not asked again until the app runs again.
  const [dismissed, setDismissed] = useState(false);
  if (waiting && !held && !dismissed) setHeld(true);
  // On the home itself: never over a page or a drawer it opened.
  const home = page === null || page.path === "";
  if (!held || !me || !home) return null;
  return (
    <Suspense fallback={null}>
      <ChestPrompt
        me={me}
        onDone={() => setHeld(false)}
        onDismiss={() => {
          setDismissed(true);
          setHeld(false);
        }}
      />
    </Suspense>
  );
}

/**
 * The host of the drawers' pages (`PageDef.drawer`, MISSIONS-PAGE), mounted with the home at every width: the page draws itself in the HUD's drawer (`HudDrawer`) over the home's village, which stays mounted under it, as the
 * profile does (the owner's pattern of 2026-11-02): a full page with Back on a phone, a side panel from `tablet`. The host says
 * whether the page's route is the current one and how it closes (`DrawerRouteContext`): back to the home's entry when it was walked
 * from it, so Back never reopens it; reached by a link or a reload, the entry replaced with the home's (the side panel's rule,
 * `home-panel-host.tsx`). While it slides out (the home, or a page of the dock reached) the host keeps the page it showed. The focus
 * goes back to the home's control that opened it (`returnFocus`), as the side panel's does.
 */
function HomeDrawerHost() {
  const page = useRoutePage();
  const outlet = useOutlet();
  const { key } = useLocation();
  const navigate = useNavigate();
  const go = useAppNavigate();
  const onHome = page === null || page.path === "";
  const drawer = page?.drawer === true;
  const trail = usePanelTrail(onHome);
  // The page the drawer shows, kept as it closes (its slide out).
  const [shown, setShown] = useState<{ key: string; outlet: ReactNode } | null>(null);
  if (drawer && shown?.key !== key) setShown({ key, outlet });
  const onClose = useCallback(() => {
    const t = trail.current;
    if (t && t.at > 0) navigate(-t.at);
    else go("/", { replace: true });
  }, [trail, navigate, go]);
  // The drawer opens with the route, not from a dialog trigger: the element that had the focus as it opened (the right column's
  // Missions) takes it back on its close. A layout effect, before the drawer moves the focus into itself.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (drawer) opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }, [drawer]);
  const returnFocus = useCallback(() => (opener.current?.isConnected ? opener.current : null), []);
  const value = useMemo(() => ({ open: drawer, onClose, returnFocus }), [drawer, onClose, returnFocus]);
  if (!shown) return null;
  return (
    <DrawerRouteContext.Provider value={value}>
      {/* The page's own code may still be on its way: the village stays until it comes. */}
      <Suspense fallback={null}>{drawer ? outlet : shown.outlet}</Suspense>
    </DrawerRouteContext.Provider>
  );
}
