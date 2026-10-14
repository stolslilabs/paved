/**
 * The renderer loads `<basePath>/models/<plan>.glb` for each of the 19 plans and takes no other model, and its loader has no
 * Draco decoder, which all 144 variants of `models/extended/` need (KHR_draco_mesh_compression). So, with no change to the
 * renderer, this answers the one request for the displayed plan with the variant, decoded to a plain GLB in the browser.
 * Only that exact URL is rewritten, only while a story has set it.
 */
let override: { from: string; to: string } | null = null;
let installed = false;

/** three's Draco decoder, at the version of the lockfile; the decoder is a wasm module that Vite does not copy. */
const DRACO_DECODER = "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/draco/gltf/";

async function decodeToPlainGlb(url: string): Promise<Response> {
  const [{ GLTFLoader }, { DRACOLoader }, { GLTFExporter }] = await Promise.all([
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/loaders/DRACOLoader.js"),
    import("three/addons/exporters/GLTFExporter.js"),
  ]);
  const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER);
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(url);
  const glb = await new GLTFExporter().parseAsync(gltf.scene, { binary: true });
  draco.dispose();
  return new Response(glb as ArrayBuffer, { headers: { "Content-Type": "model/gltf-binary" } });
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (override) {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (new URL(raw, window.location.href).pathname === override.from) return decodeToPlainGlb(override.to);
    }
    return realFetch(input, init);
  };
}

/** Serve `to` where the renderer asks for `from` (both paths on this origin). Idempotent; `null` clears it. */
export function setModelOverride(next: { from: string; to: string } | null) {
  install();
  override = next;
}
