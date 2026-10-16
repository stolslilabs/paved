import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Effects, type FaceAntialiasing } from "../src/core/Effects";
import { LOOK_PRESETS, QUALITY_TIERS } from "../src/core/look";

/**
 * A renderer that draws nothing and records every render target bound. three allocates a target's buffers on its first
 * bind (`setRenderTarget`), so a target never bound is never allocated.
 */
function recordingRenderer() {
  const bound: (THREE.WebGLRenderTarget | null)[] = [];
  let current: THREE.WebGLRenderTarget | null = null;
  const clear = new THREE.Color();
  const known = {
    bound,
    autoClear: true,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace,
    shadowMap: { enabled: false },
    capabilities: { isWebGL2: true, maxSamples: 4 },
    extensions: { has: () => true, get: () => null },
    state: { buffers: { color: { setMask: () => {}, setLocked: () => {}, setClear: () => {} }, depth: { setTest: () => {}, setMask: () => {}, setLocked: () => {} }, stencil: { setTest: () => {}, setMask: () => {}, setFunc: () => {}, setOp: () => {}, setClear: () => {}, setLocked: () => {} } } },
    getPixelRatio: () => 2,
    getSize: (v: THREE.Vector2) => v.set(400, 300),
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(800, 600),
    domElement: { width: 800, height: 600 },
    getContext: () => ({}),
    setRenderTarget: (t: THREE.WebGLRenderTarget | null) => {
      current = t;
      bound.push(t);
    },
    getRenderTarget: () => current,
    getClearColor: (c: THREE.Color) => c.copy(clear),
    getClearAlpha: () => 1,
    setClearColor: () => {},
    setClearAlpha: () => {},
    clear: () => {},
    clearDepth: () => {},
    render: () => {},
  };
  // Anything else a pass calls does nothing.
  return new Proxy(known, { get: (o, k) => (k in o ? (o as any)[k] : () => {}) }) as unknown as THREE.WebGLRenderer & { bound: typeof bound };
}

function framesFor(antialiasing: FaceAntialiasing, tier: (typeof QUALITY_TIERS)[number]) {
  const renderer = recordingRenderer();
  const effects = new Effects();
  effects.setLook(LOOK_PRESETS.mockup, tier);
  effects.init(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), "play", antialiasing);
  const composer = effects.getComposer()!;
  const { renderTarget1, renderTarget2 } = composer;
  for (let frame = 0; frame < 4; frame++) effects.render();
  return { bound: renderer.bound, renderTarget1, renderTarget2, composer };
}

describe("the composer's targets (Q3-GPU)", () => {
  afterEach(() => vi.unstubAllGlobals());

  for (const antialiasing of ["off", "msaa"] as const) {
    for (const tier of QUALITY_TIERS) {
      it(`binds one of its two targets, never the other, over frames: ${antialiasing}, ${tier}`, () => {
        const { bound, renderTarget1, renderTarget2, composer } = framesFor(antialiasing, tier);
        // The scene lands in the read buffer every frame; the write buffer is never bound, so never allocated.
        expect(bound).toContain(composer.readBuffer);
        expect(bound.filter((t) => t === renderTarget1 || t === renderTarget2).every((t) => t === composer.readBuffer)).toBe(true);
        expect(bound).not.toContain(composer.writeBuffer);
        if (antialiasing === "msaa") expect(composer.readBuffer.samples).toBeGreaterThan(0);
      });
    }
  }

  it("binds both with SMAA, which reads what the finish pass wrote", () => {
    vi.stubGlobal("Image", class { src = ""; onload: (() => void) | null = null; });
    const { bound, renderTarget1, renderTarget2 } = framesFor("smaa", "medium");
    expect(bound).toContain(renderTarget1);
    expect(bound).toContain(renderTarget2);
  });
});
