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
 * A toast when a quest or an achievement completes between two renders of `entries`: "Quest completed: <title>" with its
 * icon, once per (id, interval) (`lib/quest-toasts.ts` decides which). `null` is a read on its way and changes nothing.
 * The `Toaster` is the app's, mounted once above the pages; without one the call shows nothing. P9 passes the indexer's
 * list on each refresh. Reduced motion is the Toaster's.
 *
 * `scope` names what the entries are a read of (the day shown): when it changes, the last list is dropped, so stepping to
 * another day compares nothing with the day before. `live: false` (a past day's data) never toasts and forgets the last
 * list: only the current window's progress is news.
 */
export function useCompletionToasts<T extends Trackable>(
  kind: "quest" | "achievement",
  entries: readonly T[] | null,
  describe: (entry: T) => CompletionToast,
  { scope, live = true }: { scope?: string | number; live?: boolean } = {},
) {
  const previous = useRef<readonly T[] | null>(null);
  const scopeRef = useRef(scope);
  const announced = useRef(new Set<string>());
  // Read at effect time, so a `describe` that changes on each render does not re-run the effect.
  const describeRef = useRef(describe);
  describeRef.current = describe;

  useEffect(() => {
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      previous.current = null;
    }
    if (!live) {
      previous.current = null;
      return;
    }
    if (entries === null) return;
    for (const entry of newlyCompleted(kind, previous.current, entries, announced.current)) {
      const key = completionKey(kind, entry);
      announced.current.add(key);
      const { title, icon, description } = describeRef.current(entry);
      toast.success(`${kind === "quest" ? "Quest completed" : "Achievement earned"}: ${title}`, {
        id: key,
        description,
        icon: <Icon name={icon} size="md" />,
      });
    }
    previous.current = entries;
  }, [kind, entries, scope, live]);
}
