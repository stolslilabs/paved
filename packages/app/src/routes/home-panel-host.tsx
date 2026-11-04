import { Suspense, useCallback, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useOutlet } from "react-router";
import PagePanel from "../components/containers/page-panel";
import { useRoutePage } from "./handle";
import type { PageDef } from "./pages";
import { usePanelTrail } from "./panel-trail";
import { pageAt, useAppNavigate } from "./ref";

export { nextTrail, type PanelTrail } from "./panel-trail";

/**
 * The side panel of the home's route from `desktop` (DESK-PANELS, #762), its own chunk with the panel's frame: mounted over the
 * home for as long as the layout is at that width. A child of the home's route (`PageDef.panel`) opens in it (`PagePanel`).
 * Closing it (Escape, a click or a tap on the village; no close button, #782) goes back to the home's entry when the panel's pages were walked from
 * it, so Back never reopens it; reached by a link or a reload, it replaces the entry with the home's. While it slides out the
 * panel keeps the page it showed. A drawer's page (`PageDef.drawer`, Missions) is not its: the panel stays closed under it, as on the
 * home (`home-hosts.tsx` draws it).
 */
export default function HomePanelHost() {
  const page = useRoutePage();
  const outlet = useOutlet();
  const { key } = useLocation();
  const navigate = useNavigate();
  const go = useAppNavigate();
  // The home, or a drawer's page over it (`home-hosts.tsx`): no page of the panel.
  const onHome = page === null || page.path === "" || page.drawer === true;
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
    <PagePanel open={!onHome} title={under.title} top={!under.parent} side={under.panelSide} onClose={onClose}>
      {/* The page's own code may still be on its way: the panel holds its place, the village stays. */}
      <Suspense fallback={null}>{current.outlet}</Suspense>
    </PagePanel>
  );
}
