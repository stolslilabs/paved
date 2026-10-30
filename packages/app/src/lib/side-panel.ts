import { useEffect, useState } from "react";

/** The side panel from this width (`--breakpoint-tablet`), the bottom sheet under it. */
const SIDE_PANEL_QUERY = "(min-width: 40rem)";

/** Whether the screen is wide enough for a side panel over the board instead of a bottom sheet; `query` sets another width. */
export function useSidePanel(query: string = SIDE_PANEL_QUERY): boolean {
  return useMediaQuery(query);
}

/** Whether a media query matches, kept up to date (false where there is no `matchMedia`). */
export function useMediaQuery(query: string): boolean {
  const [side, setSide] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query);
    const on = () => setSide(list.matches);
    list.addEventListener("change", on);
    return () => list.removeEventListener("change", on);
  }, [query]);
  return side;
}
