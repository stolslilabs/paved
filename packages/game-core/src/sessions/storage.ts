/** The part of the browser's `Storage` the sessions use (this package has no DOM types). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** `localStorage`, or null when the browser refuses it (private mode, blocked site data, no window). */
export function browserStore(): KeyValueStore | null {
  try {
    const store = (globalThis as { localStorage?: KeyValueStore }).localStorage;
    return store === undefined ? null : store;
  } catch {
    return null;
  }
}
