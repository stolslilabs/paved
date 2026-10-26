import { createContext, useContext } from "react";

/**
 * A page drawn in the side panel (DESK-PANELS, #762): what its header needs. `top`: a page of the overlay itself (Missions, the
 * Chests), whose header has no Back (a click outside the panel or Escape closes it, #782); a page reached from another in the
 * panel (a theme, the defence log) keeps Back to it.
 */
export interface PagePanelValue {
  top: boolean;
}

/**
 * Given by the panel's frame (`page-panel.tsx`); absent on a full page. A file apart from the frame, and of no import, so the
 * shell's first load (the balances read it) carries not the panel's chunk (the Radix dialog, the slide).
 */
const PagePanelContext = createContext<PagePanelValue | null>(null);
export const PagePanelProvider = PagePanelContext.Provider;

/** The panel the page is drawn in, or `null` on a full page. */
export function usePagePanel(): PagePanelValue | null {
  return useContext(PagePanelContext);
}
