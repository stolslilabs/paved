import { createContext, useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router";

/** One entry of the history this session walked: its router key and the path it shows. */
export interface TrackedEntry {
  key: string;
  path: string;
}

/** Where the tracked entries are kept across a reload of the same entry (the browser keeps its history, not ours). */
const STORE = "paved:history";

/**
 * The entries this session walked, as the browser keeps them: `at` is the current one's. A push drops the entries after `at` and
 * adds one, a replace swaps the current one, a pop moves `at` to a known entry (Back and Forward keep the others). A pop to an
 * unknown entry (a reload came between) knows nothing around it, so it is never given a predecessor.
 */
export interface TrackedHistory {
  entries: TrackedEntry[];
  at: number;
}

/** The history after a move to `entry` (`type`: the router's action). */
export function nextHistory(history: TrackedHistory | null, entry: TrackedEntry, type: "PUSH" | "REPLACE" | "POP"): TrackedHistory {
  if (!history) return { entries: [entry], at: 0 };
  const { entries, at } = history;
  if (entries[at]?.key === entry.key || type === "REPLACE") return { entries: entries.map((e, i) => (i === at ? entry : e)), at };
  if (type === "PUSH") return { entries: [...entries.slice(0, at + 1), entry], at: at + 1 };
  const known = entries.findIndex((e) => e.key === entry.key);
  return known >= 0 ? { entries, at: known } : { entries: [entry], at: 0 };
}

/**
 * BACK-RULE (#783): how many entries back the nearest earlier entry showing `path` is (a negative step for `navigate`), or
 * `null` when none of the known entries before the current one shows it. `path` and the entries compare without the
 * referral's `?ref=`, which every link carries.
 */
export function stepsBackTo({ entries, at }: TrackedHistory, path: string): number | null {
  const want = withoutRef(path);
  for (let i = at - 1; i >= 0; i--) if (withoutRef(entries[i]!.path) === want) return i - at;
  return null;
}

function withoutRef(path: string): string {
  const at = path.indexOf("?");
  if (at < 0) return path;
  const params = new URLSearchParams(path.slice(at));
  params.delete("ref");
  const rest = params.toString();
  return rest ? `${path.slice(0, at)}?${rest}` : path.slice(0, at);
}

function stored(key: string): TrackedHistory | null {
  // A memory history's first entry is "default", every one alike: never one to restore.
  if (key === "default") return null;
  try {
    const history = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as TrackedHistory | null;
    return history && Array.isArray(history.entries) && history.entries[history.at]?.key === key ? history : null;
  } catch {
    return null;
  }
}

function store(history: TrackedHistory) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(history));
  } catch {
    // Storage off: a reload forgets the entries before it, and Back goes up by replacing.
  }
}

/** The history this session has walked; `null` before its first entry (a plain router, the stories'). */
const History = createContext<{ current: TrackedHistory | null }>({ current: null });

/**
 * Keeps the entries from the location changes, for Back (`useUpTo`): which earlier entry shows the page Back goes up to. Kept in
 * `sessionStorage`, so a reload of the same entry still knows the ones before it.
 */
export function HistoryTracker({ children }: { children: ReactNode }) {
  const { key, pathname, search } = useLocation();
  const type = useNavigationType();
  const history = useRef<TrackedHistory | null>(null);
  useLayoutEffect(() => {
    const entry = { key, path: pathname + search };
    history.current = history.current === null ? (stored(key) ?? nextHistory(null, entry, type)) : nextHistory(history.current, entry, type);
    store(history.current);
  }, [key, pathname, search, type]);
  return <History.Provider value={history}>{children}</History.Provider>;
}

/** Read when Back is pressed: the step back to the nearest earlier entry showing `path`, or `null`. */
export function useStepsBackTo(): (path: string) => number | null {
  const history = useContext(History);
  return useCallback((path) => (history.current ? stepsBackTo(history.current, path) : null), [history]);
}
