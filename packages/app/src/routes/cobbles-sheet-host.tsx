import { Suspense, lazy } from "react";
import PageSheet from "../components/containers/page-sheet";
import { useSidePanel } from "../lib/side-panel";
import { DESKTOP_QUERY } from "./home-layout";

/** `/cobbles`'s page, its own chunk as every page's (reached only through `import()`). */
const CobblesPage = lazy(() => import("./pages/cobbles"));

/** The Cobble packs (`/cobbles`'s page) in a sheet over the page that asked for them (`useCobblesSheet`, BACK-RULE #783). */
export default function CobblesSheetHost({ open, onClose }: { open: boolean; onClose: () => void }) {
  const desktop = useSidePanel(DESKTOP_QUERY);
  return (
    <PageSheet open={open} title="Cobbles" side={desktop ? "right" : "bottom"} onClose={onClose}>
      <Suspense fallback={null}>
        <CobblesPage />
      </Suspense>
    </PageSheet>
  );
}
