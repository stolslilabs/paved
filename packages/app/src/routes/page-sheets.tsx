import { Suspense, lazy, useState, type ReactNode } from "react";
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
  const [hosted, setHosted] = useState(sheet);
  if (sheet && !hosted) setHosted(true);
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
