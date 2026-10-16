import { useSyncExternalStore } from "react";

// A value kept on this device (section 6.4: local storage), as `welcomed` is: read with try/catch, and an in-memory twin
// for when storage is off (private mode, blocked site data), so a choice holds for the visit. One store per key, shared by
// every component that reads it (the settings page and the board, the theme page and the settings row).

type Storage_ = Pick<Storage, "getItem" | "setItem">;

export interface DeviceStore<T> {
  /** The value now: the stored one, `fallback` when none or when it does not parse. Same object while the stored text is. */
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
  /** For the tests: forget the in-memory twin and the cache. */
  reset(): void;
}

/**
 * A store over `key`. `parse` turns the stored text into a value, or null for a text it does not know (a bad value is the
 * fallback, never an error); `serialize` is its inverse.
 */
export function createDeviceStore<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | null,
  serialize: (value: T) => string,
  storage: () => Storage_ | null = () => globalThis.localStorage ?? null,
): DeviceStore<T> {
  const listeners = new Set<() => void>();
  // The twin: set once a read or a write threw, then it is the truth until a later write succeeds.
  let twin: { value: T } | null = null;
  let cache: { raw: string | null; value: T } | null = null;

  const emit = () => listeners.forEach((l) => l());

  const get = (): T => {
    if (twin) return twin.value;
    let raw: string | null;
    try {
      raw = storage()?.getItem(key) ?? null;
    } catch {
      twin = { value: cache?.value ?? fallback };
      return twin.value;
    }
    if (cache && cache.raw === raw) return cache.value;
    const parsed = raw === null ? null : parse(raw);
    cache = { raw, value: parsed ?? fallback };
    return cache.value;
  };

  return {
    get,
    set(value) {
      try {
        const store = storage();
        if (!store) throw new Error("no storage");
        store.setItem(key, serialize(value));
        // Storage took the write: it is the truth again, not the twin an earlier failure left.
        twin = null;
      } catch {
        twin = { value };
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      // Another tab's change.
      const onStorage = (e: StorageEvent) => e.key === key && listener();
      globalThis.addEventListener?.("storage", onStorage);
      return () => {
        listeners.delete(listener);
        globalThis.removeEventListener?.("storage", onStorage);
      };
    },
    reset() {
      twin = null;
      cache = null;
      emit();
    },
  };
}

/** The store's value in a component, kept current. */
export function useDeviceStore<T>(store: DeviceStore<T>): [T, (value: T) => void] {
  const value = useSyncExternalStore(store.subscribe, store.get, store.get);
  return [value, store.set];
}
