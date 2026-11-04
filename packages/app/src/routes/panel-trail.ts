import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * The entries walked from the home's own, as the browser keeps them while the panel's host stays mounted: the home's key first,
 * then one per page opened in the panel, with the current one (`at`). Back and Forward move `at` inside it, so a Forward into the
 * panel after its close is placed again; a new page drops the entries after `at`, as the browser does. `null` when the way back
 * to the home is unknown (a link or a reload straight to a panel's page, a Back or a Forward from beyond the home's layout).
 */
export interface PanelTrail {
  keys: string[];
  at: number;
}

/** The trail after a move to `key` (`type`: the router's action); `onHome`: the move landed on the home. */
export function nextTrail(trail: PanelTrail | null, key: string, type: "PUSH" | "REPLACE" | "POP", onHome: boolean): PanelTrail | null {
  if (trail && trail.keys[trail.at] === key) return trail;
  if (type === "PUSH") return onHome ? { keys: [key], at: 0 } : trail && { keys: [...trail.keys.slice(0, trail.at + 1), key], at: trail.at + 1 };
  if (type === "REPLACE") {
    if (!trail || (onHome && trail.at > 0)) return onHome ? { keys: [key], at: 0 } : null;
    const keys = [...trail.keys];
    keys[trail.at] = key;
    return { keys, at: trail.at };
  }
  const at = trail ? trail.keys.indexOf(key) : -1;
  if (at >= 0) return { keys: trail!.keys, at };
  return onHome ? { keys: [key], at: 0 } : null;
}

/** The trail of the panel's (or the drawer's) pages walked from the home, kept across the moves while its host stays mounted. */
export function usePanelTrail(onHome: boolean) {
  const { key } = useLocation();
  const type = useNavigationType();
  const trail = useRef<PanelTrail | null>(null);
  useLayoutEffect(() => {
    trail.current = nextTrail(trail.current, key, type, onHome);
  }, [key, type, onHome]);
  return trail;
}
