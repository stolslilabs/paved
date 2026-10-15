import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * Whether an earlier in-app entry exists. A browser router writes its index into `window.history.state` (`idx`), and
 * the browser keeps it across a reload and a replace, so `idx > 0` is the truth there. Without one (a memory router,
 * the tests) the tracker's own count of entries decides.
 */
export function earlierEntryExists(idx: unknown, tracked: readonly string[]): boolean {
  return typeof idx === "number" ? idx > 0 : tracked.length > 1;
}

/** The keys of the entries this session has seen: only the fallback of `earlierEntryExists`. */
const Stack = createContext<{ current: string[] }>({ current: [] });

/** Keeps the fallback stack from the location changes: a push adds, a replace swaps the top, a pop goes to a known entry. */
export function HistoryTracker({ children }: { children: ReactNode }) {
  const { key } = useLocation();
  const type = useNavigationType();
  const stack = useRef<string[]>([]);
  useLayoutEffect(() => {
    const s = stack.current;
    if (s[s.length - 1] === key) return;
    if (type === "PUSH") s.push(key);
    else if (type === "REPLACE" && s.length > 0) s[s.length - 1] = key;
    else {
      // A pop to an entry this stack knows truncates to it; to an unknown one (a reload came between) nothing is known
      // before it, so it is never pushed as if it had a predecessor.
      const at = s.indexOf(key);
      if (at >= 0) s.length = at + 1;
      else s.splice(0, s.length, key);
    }
  }, [key, type]);
  return <Stack.Provider value={stack}>{children}</Stack.Provider>;
}

/** Read when Back is pressed. */
export function useCanGoBack(): () => boolean {
  const stack = useContext(Stack);
  return () => earlierEntryExists(window.history.state?.idx, stack.current);
}
