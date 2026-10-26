import { createContext, useContext } from "react";

/**
 * A page drawn in the side panel (DESK-PANELS, #762): what its header needs. `top`: a page of the overlay itself (Missions, the
 * Chests), whose header has no Back, the panel's close in its place (a sheet over a page, `PageSheet`, too); otherwise the header
 * keeps Back beside the close.
 */
export interface PagePanelValue {
  onClose: () => void;
  top: boolean;
}

/**
 * Given by the panel's frame (`page-panel.tsx`); absent on a full page. A file apart from the frame, and of no import, so the
 * shell's first load (the balances read it) carries neither the panel's chunk (the Radix dialog, the slide) nor its close.
 */
const PagePanelContext = createContext<PagePanelValue | null>(null);
export const PagePanelProvider = PagePanelContext.Provider;

/** The panel the page is drawn in, or `null` on a full page. */
export function usePagePanel(): PagePanelValue | null {
  return useContext(PagePanelContext);
}
