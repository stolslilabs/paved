/**
 * Which quests (or achievements) just completed, between two reads of the player's progress: the function a toast hangs
 * on. Pure: called on each indexer refresh with the list it had and the list it got (`useCompletionToasts`).
 */

/** What the function reads of a quest or an achievement. A quest repeats per interval; an achievement has no interval (0). */
export interface Trackable {
  id: number;
  intervalId?: number;
  completed: boolean;
}

/** One toast per (id, interval): the key a completion is remembered by. */
export const completionKey = (kind: "quest" | "achievement", t: Trackable): string => `${kind}:${t.id}:${t.intervalId ?? 0}`;

/**
 * The entries of `next` that reached their target since `prev`: complete now, and present and not complete in `prev`.
 * Nothing before a first read (`prev` null): what was already complete when the page opened is not news. An entry that was
 * absent from `prev` (a new interval, a new definition) is not news either: progress was not seen reaching the target.
 * `announced` holds the keys already toasted, so a refresh of the same data, or progress that goes down and up again
 * within one interval, shows nothing twice. The caller adds the returned keys to `announced`.
 */
export function newlyCompleted<T extends Trackable>(
  kind: "quest" | "achievement",
  prev: readonly Trackable[] | null,
  next: readonly T[],
  announced: ReadonlySet<string> = new Set(),
): T[] {
  if (prev === null) return [];
  const before = new Map(prev.map((t) => [completionKey(kind, t), t]));
  return next.filter((t) => {
    const key = completionKey(kind, t);
    if (!t.completed || announced.has(key)) return false;
    const was = before.get(key);
    return was !== undefined && !was.completed;
  });
}
