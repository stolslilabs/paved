import { useMemo } from "react";
import { create } from "zustand";
import type { CompletionMemory } from "../components/containers/completion-toasts";
import type { CompletionKind, Trackable } from "../lib/quest-toasts";
import { addressKey } from "./keys";

// The completion toasts' memory, above the routes (P9, section 12's note): per player, the keys already toasted and the
// last list each scene read. A remount of the quests or achievements page compares its first read (often the cache's) with
// the list it last saw, so a cached-then-fresh read toasts nothing twice, and a completion made while the page was closed is
// announced on return. In memory only: a reload starts afresh, and its first read is not news.

interface Remembered {
  scope: string | number | undefined;
  entries: readonly Trackable[];
}

interface CompletionState {
  /** The keys toasted, by player (`addressKey`). */
  announced: Record<string, readonly string[]>;
  /** The last list read, by player and kind. */
  last: Record<string, Remembered>;
}

export const useCompletionStore = create<CompletionState>(() => ({ announced: {}, last: {} }));

/** The memory of one player's quest or achievement toasts, read and written in the store at call time. */
export function completionMemory(playerId: string, kind: CompletionKind): CompletionMemory {
  const player = addressKey(playerId);
  const slot = `${player}:${kind}`;
  const { getState, setState } = useCompletionStore;
  return {
    announced: () => new Set(getState().announced[player] ?? []),
    previous: (scope) => {
      const last = getState().last[slot];
      return last && last.scope === scope ? last.entries : null;
    },
    announce: (keys) => {
      if (keys.length > 0) setState((s) => ({ announced: { ...s.announced, [player]: [...(s.announced[player] ?? []), ...keys] } }));
    },
    remember: (scope, entries) =>
      setState((s) => ({ last: { ...s.last, [slot]: { scope, entries: entries.map(({ id, intervalId, completed }) => ({ id, intervalId, completed })) } } })),
  };
}

/** `completionMemory` for a scene's `toasts`; none for a guest. */
export function useCompletionMemory(playerId: string | null, kind: CompletionKind): CompletionMemory | undefined {
  return useMemo(() => (playerId === null ? undefined : completionMemory(playerId, kind)), [playerId, kind]);
}
