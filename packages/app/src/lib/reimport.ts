/**
 * The URL a failed `import()` names: Chromium ("Failed to fetch dynamically imported module: <url>") and Firefox ("error
 * loading dynamically imported module: <url>") give it; Safari ("Importing a module script failed.") does not.
 */
export function failedModuleUrl(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = /dynamically imported module:?\s*(\S+)/i.exec(message);
  if (!match) return null;
  try {
    return new URL(match[1]!).href;
  } catch {
    return null;
  }
}

/**
 * A chunk whose download failed, asked for again (#539 review). The browser keeps a failed module in its module map for the
 * page's life: the same `import()` rejects again at once, without a request. The same file under another URL (a query that
 * changes each try) is a new module, so it is fetched. Rejects with `error` when the failure names no URL (Safari): the
 * page has to be reloaded there.
 */
export function reimport<T>(error: unknown, attempt: number = Date.now(), load: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url)): Promise<T> {
  const url = failedModuleUrl(error);
  if (!url) return Promise.reject(error);
  const again = new URL(url);
  again.searchParams.set("retry", String(attempt));
  return load(again.href) as Promise<T>;
}
