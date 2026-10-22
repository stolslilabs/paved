let webgl: boolean | undefined;

/**
 * Whether this browser gives a WebGL context, probed once on a throwaway canvas. Without one, three's renderer throws in
 * `GameCanvas`'s init, an unhandled rejection that leaves an empty box: `TileView` shows the tile art instead, and the
 * tile stack its CSS slabs (`canDrawStack`).
 */
export function hasWebGL(): boolean {
  if (webgl === undefined) {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      webgl = !!gl;
      // Release the probe's context at once: browsers cap the live WebGL contexts.
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
