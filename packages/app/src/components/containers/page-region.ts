import { createContext, useContext } from "react";

/**
 * PAGES-SCROLL (#782): the page is drawn in a scrolling region, the tab pages' (`TabFrame`) or the side panel's body
 * (`PagePanel`), not in a document that scrolls. A bar written for a flow (`TopBar`) then leaves the document's hint alone: the
 * region drives the page's hints (`pageScrollHintRef`). A file of no import, so the first load carries nothing more.
 */
const PageRegionContext = createContext(false);
export const PageRegionProvider = PageRegionContext.Provider;

/** Whether the page scrolls in a region (`true`) or as the document (`false`, a full-screen flow). */
export function useInPageRegion(): boolean {
  return useContext(PageRegionContext);
}
