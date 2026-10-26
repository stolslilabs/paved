import { Suspense, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useNavigationType, useOutlet } from "react-router";
import PagePanel from "../components/containers/page-panel";
import { useRoutePage } from "./handle";
import type { PageDef } from "./pages";
import { pageAt, useAppNavigate } from "./ref";

/**
 * The entries walked from the home's own, as the browser keeps them while the panel's host stays mounted: the home's key first,
 * then one per page opened in the panel, with the current one (`at`). Back and Forward move `at` inside it, so a Forward into the
 * panel after its close is placed again; a new page drops the entries after `at`, as the browser does. `null` when the way back
 * to the home is unknown (a link or a reload straight to a panel's page, a Back or a Forward from beyond the home's layout).
 */
export interface PanelTrail {
  keys: string[];
  at: number;
}

/** The trail after a move to `key` (`type`: the router's action); `onHome`: the move landed on the home. */
export function nextTrail(trail: PanelTrail | null, key: string, type: "PUSH" | "REPLACE" | "POP", onHome: boolean): PanelTrail | null {
  if (trail && trail.keys[trail.at] === key) return trail;
  if (type === "PUSH") return onHome ? { keys: [key], at: 0 } : trail && { keys: [...trail.keys.slice(0, trail.at + 1), key], at: trail.at + 1 };
  if (type === "REPLACE") {
    if (!trail || (onHome && trail.at > 0)) return onHome ? { keys: [key], at: 0 } : null;
    const keys = [...trail.keys];
    keys[trail.at] = key;
    return { keys, at: trail.at };
  }
  const at = trail ? trail.keys.indexOf(key) : -1;
  if (at >= 0) return { keys: trail!.keys, at };
  return onHome ? { keys: [key], at: 0 } : null;
}

function usePanelTrail(onHome: boolean) {
  const { key } = useLocation();
  const type = useNavigationType();
  const trail = useRef<PanelTrail | null>(null);
  useLayoutEffect(() => {
    trail.current = nextTrail(trail.current, key, type, onHome);
  }, [key, type, onHome]);
  return trail;
}

/**
 * The side panel of the home's route from `desktop` (DESK-PANELS, #762), its own chunk with the panel's frame: mounted over the
 * home for as long as the layout is at that width. A child of the home's route (`PageDef.panel`) opens in it (`PagePanel`).
 * Closing it (Escape, a click or a tap on the village; no close button, #782) goes back to the home's entry when the panel's pages were walked from
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
    if (t && t.at > 0) navigate(-t.at);
    else go("/", { replace: true });
  }, [trail, navigate, go]);
  const current = onHome ? shown : { key, page: page!, outlet };
  if (!current) return null;
  // A sheet (BACK-RULE #783) is drawn over its page, which the panel shows: the panel takes that page's title.
  const under = current.page.sheet ? (pageAt(current.page.parent!) ?? current.page) : current.page;
  return (
    <PagePanel open={!onHome} title={under.title} top={!under.parent} onClose={onClose}>
      {/* The page's own code may still be on its way: the panel holds its place, the village stays. */}
      <Suspense fallback={null}>{current.outlet}</Suspense>
    </PagePanel>
  );
}
