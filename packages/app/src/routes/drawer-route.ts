import { createContext, useContext } from "react";

/**
 * What the home's drawer host (`home-hosts.tsx`) hands a drawer's page (`PageDef.drawer`, MISSIONS-PAGE): whether its route is
 * the current one (false while it slides out, the home or another page reached), and its close (back along the pages walked from the
 * home, else to the home). Absent (a story's or a test's route), the page is open and closes with its Back.
 */
export interface DrawerRoute {
  open: boolean;
  onClose: () => void;
  /** Where the focus goes back as it closes: the HUD's control that opened it (the right column's Missions), still on the home. */
  returnFocus: () => HTMLElement | null;
}

export const DrawerRouteContext = createContext<DrawerRoute | null>(null);

export const useDrawerRoute = (): DrawerRoute | null => useContext(DrawerRouteContext);
