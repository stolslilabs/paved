import { createContext, useContext, useRef, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router";

/** The in-app history: the keys of the entries this session has seen, so Back knows whether an earlier one exists. */
const Stack = createContext<{ current: string[] }>({ current: [] });

/**
 * Tracks the entries of this app's history from the location changes (a push adds one, a replace swaps the top, a pop
 * goes to a known entry). `location.key` alone cannot say "opened directly": a page reached by a redirect or a replace
 * has a fresh key and still nothing before it. Idempotent per render, so StrictMode's second render changes nothing.
 */
export function HistoryTracker({ children }: { children: ReactNode }) {
  const { key } = useLocation();
  const type = useNavigationType();
  const stack = useRef<string[]>([]);
  const s = stack.current;
  if (s[s.length - 1] !== key) {
    if (type === "PUSH" || s.length === 0) s.push(key);
    else if (type === "REPLACE") s[s.length - 1] = key;
    else {
      const at = s.indexOf(key);
      if (at >= 0) s.length = at + 1;
      else s.push(key);
    }
  }
  return <Stack.Provider value={stack}>{children}</Stack.Provider>;
}

/** Whether an earlier in-app entry exists to go back to. Read when Back is pressed. */
export function useCanGoBack(): () => boolean {
  const stack = useContext(Stack);
  return () => stack.current.length > 1;
}
