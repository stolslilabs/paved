import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { BalancesOf } from "../components/containers/balances-of";
import { useRoutePage } from "./handle";

/** The sheets' host and frame (the Radix dialog, the slide), their own chunk: loaded with the first sheet. */
const PageSheetHost = lazy(() => import("./page-sheet-host"));

/**
 * A page and the sheets over it (BACK-RULE #783, `PageDef.sheet`): the page always, and from the first sheet opened the sheets'
 * host, which keeps a sheet on screen while it slides out. The route's matches name the sheet: the deepest page with `sheet`.
 * Its own chunk, as the pages it holds (`router.tsx`): the first load does not carry it. The page under its sheets keeps its own
 * balances (#855, its route, `path`: Settings none under Themes), the open sheet's being the shell's.
 */
export default function PageWithSheets({ page, path }: { page: ReactNode; path: string }) {
  const sheet = useRoutePage()?.sheet === true;
  // The host comes a commit after the page (PLAY-PAGE): a page drawn as a modal of its own (Play's drawer) takes its layer first, so
  // the sheet over it is the top one; mounted in the same commit, each would hide the other from assistive technology.
  const [hosted, setHosted] = useState(false);
  useEffect(() => {
    if (sheet) setHosted(true);
  }, [sheet]);
  return (
    <>
      <BalancesOf page={path}>{page}</BalancesOf>
      {hosted && (
        <Suspense fallback={null}>
          <PageSheetHost />
        </Suspense>
      )}
    </>
  );
}
