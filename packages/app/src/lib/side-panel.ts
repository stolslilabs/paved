import { useEffect, useState } from "react";

/** The side panel from this width (`--breakpoint-tablet`), the bottom sheet under it. */
const SIDE_PANEL_QUERY = "(min-width: 40rem)";

/** Whether the screen is wide enough for a side panel over the board instead of a bottom sheet. */
export function useSidePanel(): boolean {
  const [side, setSide] = useState(() => typeof matchMedia === "function" && matchMedia(SIDE_PANEL_QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia(SIDE_PANEL_QUERY);
    const on = () => setSide(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);
  return side;
}
