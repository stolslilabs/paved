import { Suspense, lazy, useState, type ReactNode } from "react";
import { useRoutePage } from "./handle";

/** The sheets' host and frame (the Radix dialog, the slide), their own chunk: the router's entry does not carry them. */
const PageSheetHost = lazy(() => import("./page-sheet-host"));

/**
 * A page and the sheets over it (BACK-RULE #783, `PageDef.sheet`): the page always, and from the first sheet opened the sheets'
 * host, which keeps a sheet on screen while it slides out. The route's matches name the sheet: the deepest page with `sheet`.
 */
export function PageWithSheets({ page }: { page: ReactNode }) {
  const sheet = useRoutePage()?.sheet === true;
  const [hosted, setHosted] = useState(sheet);
  if (sheet && !hosted) setHosted(true);
  return (
    <>
      {page}
      {hosted && (
        <Suspense fallback={null}>
          <PageSheetHost />
        </Suspense>
      )}
    </>
  );
}
