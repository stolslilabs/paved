import { Suspense, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useNavigationType, useOutlet } from "react-router";
import PagePanel from "../components/containers/page-panel";
import { useRoutePage } from "./handle";
import type { PageDef } from "./pages";
import { useAppNavigate } from "./ref";

/**
 * The entries walked since the home's own, while the panel's host stays mounted: the home's key first, then one per page opened
 * in the panel. `null` when the way back to the home is unknown (a link or a reload straight to a panel's page, a Back from
 * further than the home's layout).
 */
function usePanelTrail(onHome: boolean) {
  const { key } = useLocation();
  const type = useNavigationType();
  const trail = useRef<string[] | null>(null);
  useLayoutEffect(() => {
    if (onHome) {
      trail.current = [key];
      return;
    }
    const t = trail.current;
    if (!t || t[t.length - 1] === key) return;
    if (type === "PUSH") t.push(key);
    else if (type === "REPLACE") t[t.length - 1] = key;
    else {
      const at = t.indexOf(key);
      if (at > 0) t.length = at + 1;
      else trail.current = null;
    }
  }, [key, type, onHome]);
  return trail;
}

/**
 * The side panel of the home's route from `desktop` (DESK-PANELS, #762), its own chunk with the panel's frame: mounted over the
 * home for as long as the layout is at that width. A child of the home's route (`PageDef.panel`) opens in it (`PagePanel`).
 * Closing it (its `xmark`, Escape, a click on the village) goes back to the home's entry when the panel's pages were walked from
 * it, so Back never reopens it; reached by a link or a reload, it replaces the entry with the home's. While it slides out the
 * panel keeps the page it showed.
 */
export default function HomePanelHost() {
  const page = useRoutePage();
  const outlet = useOutlet();
  const { key } = useLocation();
  const navigate = useNavigate();
  const go = useAppNavigate();
  const onHome = page === null || page.path === "";
  const trail = usePanelTrail(onHome);
  // The page the panel shows, kept as the panel closes (its slide out).
  const [shown, setShown] = useState<{ key: string; page: PageDef; outlet: ReactNode } | null>(null);
  if (!onHome && page && shown?.key !== key) setShown({ key, page, outlet });
  const onClose = useCallback(() => {
    const t = trail.current;
    if (t && t.length > 1) navigate(-(t.length - 1));
    else go("/", { replace: true });
  }, [trail, navigate, go]);
  const current = onHome ? shown : { key, page: page!, outlet };
  if (!current) return null;
  return (
    <PagePanel open={!onHome} title={current.page.title} top={!current.page.parent} onClose={onClose}>
      {/* The page's own code may still be on its way: the panel holds its place, the village stays. */}
      <Suspense fallback={null}>{current.outlet}</Suspense>
    </PagePanel>
  );
}
