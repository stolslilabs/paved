import { Suspense, useState, type ReactNode } from "react";
import { useLocation, useOutlet } from "react-router";
import PageSheet from "../components/containers/page-sheet";
import { useSidePanel } from "../lib/side-panel";
import { useRoutePage } from "./handle";
import { DESKTOP_QUERY } from "./home-layout";
import type { PageDef } from "./pages";
import { useBack } from "./ref";

/**
 * The sheets over a page (BACK-RULE #783), their own chunk with the sheet's frame. The route's sheet opens in `PageSheet`, from the
 * bottom below `desktop` and from the right from it (over the side panel). Its close is Back (`useBack`): up to the page under it,
 * back through the history when the sheet was opened from it, in place of the sheet's entry after a link or a reload. While it
 * slides out the sheet keeps what it showed.
 */
export default function PageSheetHost() {
  const page = useRoutePage();
  const outlet = useOutlet();
  const { key } = useLocation();
  const desktop = useSidePanel(DESKTOP_QUERY);
  const onClose = useBack();
  const open = page?.sheet === true;
  const [shown, setShown] = useState<{ key: string; page: PageDef; outlet: ReactNode } | null>(null);
  if (open && shown?.key !== key) setShown({ key, page: page!, outlet });
  const current = open ? { key, page: page!, outlet } : shown;
  if (!current) return null;
  return (
    <PageSheet open={open} title={current.page.title} side={desktop ? "right" : "bottom"} onClose={onClose}>
      {/* The sheet's own code may still be on its way: the sheet holds its place, the page under it stays. */}
      <Suspense fallback={null}>{current.outlet}</Suspense>
    </PageSheet>
  );
}
