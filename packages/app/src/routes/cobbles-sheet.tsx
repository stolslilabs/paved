import { Suspense, lazy, useCallback, useState, type ReactNode } from "react";

/** The packs' sheet and the Cobbles page in it, their own chunk: loaded on the first Get Cobbles. */
const CobblesSheetHost = lazy(() => import("./cobbles-sheet-host"));

/**
 * BACK-RULE (#783, no page opens another page): a page's way to the Cobble packs (a theme's Buy Cobbles, the tile shop's Get
 * Cobbles, the avatar's) opens them in place, in a sheet over the page, not as the `/cobbles` page. No entry is pushed: the
 * close leaves the player where they were. `sheet` goes beside the page's scene.
 */
export function useCobblesSheet(): { open: () => void; sheet: ReactNode } {
  // Undefined until the first Get Cobbles: the sheet's chunk is not loaded before.
  const [open, setOpen] = useState<boolean>();
  return {
    open: useCallback(() => setOpen(true), []),
    sheet: open !== undefined && (
      <Suspense fallback={null}>
        <CobblesSheetHost open={open} onClose={() => setOpen(false)} />
      </Suspense>
    ),
  };
}
