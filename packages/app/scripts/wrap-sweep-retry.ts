/**
 * The wrap sweep's one retry: a story whose `page.goto` times out is opened again on a fresh page before it counts as
 * a finding. Kept apart from `wrap-sweep.ts` (which runs the sweep on import) so a test can import it.
 * Node 24 runs it as is (type stripping): the syntax stays erasable.
 */

/** The message Playwright gives a navigation that did not finish in time. Only this one is retried. */
export function isNavigationTimeout(message: string | null): boolean {
  return message !== null && /^page\.goto: Timeout \d+ms exceeded/.test(message);
}

/**
 * Renders a story with `attempt`; on a navigation timeout, takes a fresh page with `fresh` (which retires the old one)
 * and renders once more. Resolves to the error (null when clean) and the page to keep using. Any other result, a wrap
 * finding included, comes from `attempt` as is and is never retried; a second timeout is returned as the error.
 */
export async function renderWithRetry<P>(
  page: P,
  attempt: (page: P) => Promise<string | null>,
  fresh: (old: P) => Promise<P>,
  onRetry: (message: string) => void,
  label: string,
): Promise<{ error: string | null; page: P }> {
  const first = await attempt(page);
  if (!isNavigationTimeout(first)) return { error: first, page };
  onRetry(`retried after navigation timeout: ${label}`);
  const next = await fresh(page);
  return { error: await attempt(next), page: next };
}
