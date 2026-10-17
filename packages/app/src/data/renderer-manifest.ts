/**
 * Where the board's renderer finds its assets, at this path in dev, preview and the build (`vite/renderer-assets.ts`): the
 * meshopt-compressed models and the 256 px tile images under content-hashed names, and the `manifest.json` that lists them.
 */
export const RENDERER_ASSETS = `${import.meta.env.BASE_URL}renderer-assets`;

/** The manifest reads in flight, one per base path. */
const bodies = new Map<string, Promise<unknown>>();

/**
 * The body of `<base>/manifest.json`, asked for once per page (LOAD-FAST): the board's route starts it with the board's code
 * (`routes/page-loaders.ts`), the renderer takes it (`provideManifest`, `routes/pages/board.tsx`), and the tile chips read
 * their images from it (`useTileArt`), so one request serves all three, and the scene does not wait for its own. Null when
 * there is none: a 404, a body that is not JSON (a dev server's index.html for an unknown path), or a base path with no
 * host. A network or server error rejects and is not kept: the next caller asks again.
 */
export function manifestBody(base: string): Promise<unknown> {
  let body = bodies.get(base);
  if (!body) {
    const attempt = readManifest(base);
    bodies.set(base, attempt);
    attempt.catch(() => {
      if (bodies.get(base) === attempt) bodies.delete(base);
    });
    body = attempt;
  }
  return body;
}

async function readManifest(base: string): Promise<unknown> {
  let url: string;
  try {
    url = new URL(`${base}/manifest.json`, (globalThis as { location?: { href: string } }).location?.href).href;
  } catch {
    return null;
  }
  // Revalidated on every load: the manifest is the one renderer file whose name does not change with its content.
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`manifest: ${url} answered ${response.status}`);
  }
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/** For tests: forget what was read. */
export function resetManifestBodies(): void {
  bodies.clear();
}
