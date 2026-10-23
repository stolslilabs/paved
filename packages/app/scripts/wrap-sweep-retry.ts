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

export interface StoryFinding {
  kind: string;
  element: string;
}

/** What `sweepStory` needs of the browser, so a test can stand in for it. */
export interface StoryDeps<P> {
  render: (page: P, id: string) => Promise<string | null>;
  fresh: (old: P) => Promise<P>;
  setWidth: (page: P, width: number) => Promise<void>;
  settle: (page: P) => Promise<void>;
  inspect: (page: P) => Promise<StoryFinding[]>;
  wait: (page: P, ms: number) => Promise<void>;
  log: (message: string) => void;
}

/**
 * One story at every width: render it (a navigation timeout retried once, see `renderWithRetry`), then inspect it.
 * A render error is a finding at each width; wrap findings come from `inspect` and are reported as they are, with no
 * retry of the navigation.
 */
export async function sweepStory<P>(
  page: P,
  id: string,
  widths: number[],
  deps: StoryDeps<P>,
): Promise<{ page: P; findings: (StoryFinding & { story: string; width: number })[] }> {
  await deps.setWidth(page, widths[0]);
  const rendered = await renderWithRetry(page, (p) => deps.render(p, id), deps.fresh, deps.log, `${id} ${widths[0]}`);
  page = rendered.page;
  const findings: (StoryFinding & { story: string; width: number })[] = [];
  for (const width of widths) {
    await deps.setWidth(page, width);
    if (rendered.error) {
      findings.push({ story: id, width, kind: "error", element: rendered.error });
      continue;
    }
    await deps.settle(page);
    let found = await deps.inspect(page);
    if (found.length) {
      // Something late (a font swap, a layout animation) can settle after the first look: look again once, after a
      // second, before reporting.
      await deps.wait(page, 1000);
      found = await deps.inspect(page);
    }
    for (const f of found) findings.push({ story: id, width, ...f });
  }
  return { page, findings };
}
