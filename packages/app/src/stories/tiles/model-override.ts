/**
 * The renderer loads `<basePath>/models/<plan>.glb` for each of the 19 plans and takes no other model. To show a variant
 * of `models/extended/` through the same renderer, this answers the one request for the displayed plan with the
 * variant's file: a URL rewrite only (the renderer decodes the Draco itself, with the decoder served at `<basePath>/draco/`).
 * Only that exact URL is rewritten, only while a story has set it.
 */
let override: { from: string; to: string } | null = null;
let installed = false;

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (override) {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (new URL(raw, window.location.href).pathname === override.from) return realFetch(override.to, init);
    }
    return realFetch(input, init);
  };
}

/** Serve `to` where the renderer asks for `from` (both paths on this origin). Idempotent; `null` clears it. */
export function setModelOverride(next: { from: string; to: string } | null) {
  install();
  override = next;
}
