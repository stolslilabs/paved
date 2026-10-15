import { useEffect, useRef } from "react";
import { newlyCompleted, completionKey, type Trackable } from "../../lib/quest-toasts";
import { Icon } from "../ui/icon";
import { toast } from "../ui/sonner";

export interface CompletionToast {
  title: string;
  icon: string;
  /** The line under the title: an achievement's points. */
  description?: string;
}

/**
 * Where the toasts' memory lives when it must outlast the scene (P9): the keys already toasted and the last list read, per
 * player, in the app's store (`data/completion-memory.ts`). A remount then compares the fresh read with the list the scene
 * last saw, so a completion made while it was unmounted is announced on return, and a cached-then-fresh read toasts nothing
 * twice. Without it, the hook keeps both in refs, for the life of the scene.
 */
export interface CompletionMemory {
  /** The keys already toasted (`completionKey`). */
  announced(): ReadonlySet<string>;
  /** The last list read for `scope`; null when none was, or it was for another scope. */
  previous(scope: string | number | undefined): readonly Trackable[] | null;
  announce(keys: readonly string[]): void;
  remember(scope: string | number | undefined, entries: readonly Trackable[]): void;
}

/**
 * A toast when a quest or an achievement completes between two reads of `entries`: "Quest completed: <title>" with its
 * icon, once per (id, interval) (`lib/quest-toasts.ts` decides which). `null` is a read on its way and changes nothing.
 * The `Toaster` is the app's, mounted once above the pages (`App.tsx`); without one the call shows nothing. The route
 * passes the indexer's list on each refresh. Reduced motion is the Toaster's.
 *
 * `scope` names what the entries are a read of (the day shown): when it changes, the last list is dropped, so stepping to
 * another day compares nothing with the day before. `live: false` (a past day's data) never toasts and forgets the last
 * list: only the current window's progress is news. `memory` keeps both above the scene (see `CompletionMemory`).
 */
export function useCompletionToasts<T extends Trackable>(
  kind: "quest" | "achievement",
  entries: readonly T[] | null,
  describe: (entry: T) => CompletionToast,
  { scope, live = true, memory }: { scope?: string | number; live?: boolean; memory?: CompletionMemory } = {},
) {
  const previous = useRef<readonly Trackable[] | null>(null);
  const scopeRef = useRef(scope);
  const announced = useRef(new Set<string>());
  // Read at effect time, so a `describe` or a memory that changes on each render does not re-run the effect.
  const describeRef = useRef(describe);
  describeRef.current = describe;
  const memoryRef = useRef(memory);
  memoryRef.current = memory;

  useEffect(() => {
    const store = memoryRef.current;
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      previous.current = null;
    }
    if (!live) {
      previous.current = null;
      return;
    }
    if (entries === null) return;
    const done = store ? store.announced() : announced.current;
    const fresh = newlyCompleted(kind, store ? store.previous(scope) : previous.current, entries, done);
    const keys = fresh.map((entry) => completionKey(kind, entry));
    if (store) store.announce(keys);
    else for (const key of keys) announced.current.add(key);
    fresh.forEach((entry, i) => {
      const { title, icon, description } = describeRef.current(entry);
      toast.success(`${kind === "quest" ? "Quest completed" : "Achievement earned"}: ${title}`, {
        id: keys[i],
        description,
        icon: <Icon name={icon} size="md" />,
      });
    });
    if (store) store.remember(scope, entries);
    else previous.current = entries;
  }, [kind, entries, scope, live]);
}
