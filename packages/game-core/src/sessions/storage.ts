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

/** `window.localStorage`, or null without a window or when the browser refuses it (the tutorial reads it this way). */
export function windowStore(): KeyValueStore | null {
  try {
    const window = (globalThis as { window?: { localStorage: KeyValueStore } }).window;
    return window === undefined ? null : window.localStorage;
  } catch {
    return null;
  }
}
