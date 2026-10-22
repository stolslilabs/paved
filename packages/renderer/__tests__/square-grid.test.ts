import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BACKDROP_PATTERNS,
  DEFAULT_SQUARE_GRID_SETTINGS,
  ETERNUM_SCALE,
  HIGHLIGHT_LAYERS,
  HIGHLIGHT_STYLES,
  HIGHLIGHT_Y,
  LAUNCH_GLOW,
  MX_NOISE_GLSL,
  ROLLOUT,
  SquareGridRenderer,
  backdropLight,
  backdropShown,
  createHighlightGeometry,
  dimAt,
  dimmedPixel,
  distanceField,
  grayscaleAt,
  gridLineAt,
  gridLineColor,
  gridLineUniforms,
  highlightPulse,
  highlightShown,
  highlightTurns,
  highlightsOf,
  launchGlowAt,
  layerOpacities,
  resolveSquareGridSettings,
  rolloutScale,
  seasonVeil,
  squareEdgeDistance,
  stackedOpacity,
  upwardIrradiance,
  type SquareGridSettingsInput,
} from "../src/core/square-grid";
import { OverlayPass, createOverlayDepth, overlayDepthTest, type Overlay } from "../src/core/overlay-pass";
import { Effects } from "../src/core/Effects";
import { FogOfWar } from "../src/core/fog-of-war";
import { resolveFogSettings } from "../src/core/fog-of-war-settings";
import { GameScene } from "../src/core/GameScene";
import { LOOK_PRESETS } from "../src/core/look";
import { FinishPass, finishDefines } from "../src/core/post-shaders";
import { PLATE_Y, PlacementRenderer, resolvePlacementSettings } from "../src/core/placement";
import { DEFAULT_RENDERER_SETTINGS, resolveRendererSettings } from "../src/core/settings";
import { TILE_SIZE } from "../src/core/types";

const on = (input: SquareGridSettingsInput = {}) => resolveSquareGridSettings({ enabled: true, ...input });

/** A grid renderer with the settings given (on by default). */
function gridOf(input: SquareGridSettingsInput = {}) {
  const grid = new SquareGridRenderer();
  grid.setSettings(on(input));
  return grid;
}

/** The highlight's instanced layers, by their draw order (route 5, middle 6, top 7, logo 8). */
const layersOf = (grid: SquareGridRenderer) => {
  const meshes = grid.overlay.children.filter((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
  const by = (order: number) => meshes.find((m) => m.renderOrder === order);
  return { route: by(5), middle: by(6), top: by(7), logo: by(8) };
};
const matrixAt = (mesh: THREE.InstancedMesh, i: number) => new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, i * 16);
const turnOf = (mesh: THREE.InstancedMesh, i: number) => {
  const q = new THREE.Quaternion();
  matrixAt(mesh, i).decompose(new THREE.Vector3(), q, new THREE.Vector3());
  // Undo the lay onto the ground: what is left is the turn about the shape's own axis.
  const local = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2).invert().multiply(q);
  return 2 * Math.atan2(local.z, local.w);
};
const deg = Math.PI / 180;

describe("the square grid's settings", () => {
  it("is off in the renderer by default; on, its backdrop and highlight show", () => {
    expect(DEFAULT_RENDERER_SETTINGS.squareGrid).toEqual(DEFAULT_SQUARE_GRID_SETTINGS);
    expect(DEFAULT_SQUARE_GRID_SETTINGS.enabled).toBe(false);
    expect(backdropShown(DEFAULT_SQUARE_GRID_SETTINGS)).toBe(false);
    expect(highlightShown(DEFAULT_SQUARE_GRID_SETTINGS)).toBe(false);
    expect(backdropShown(on())).toBe(true);
    expect(highlightShown(on())).toBe(true);
    expect(backdropShown(on({ backdrop: { enabled: false } }))).toBe(false);
    expect(highlightShown(on({ highlight: { enabled: false } }))).toBe(false);
  });

  it("keeps Realms' fog in Paved's colours, its tone map's exposure, and neutral fillers with Paved's P", () => {
    expect(ETERNUM_SCALE).toBeCloseTo(TILE_SIZE / Math.sqrt(3), 12);
    expect(DEFAULT_SQUARE_GRID_SETTINGS.backdrop).toEqual({
      enabled: true,
      ground: "#0e100d",
      veil: "#a4ab80",
      veilStrength: 0.68,
      mist: 0.24,
      motion: 1,
      energy: 0.045,
      energyColor: "#f0bf5b",
      energyGlow: "#f6d8a1",
      lineColor: "#747970",
      lineStrength: 0.2,
      exposure: 0.8,
      grayFrom: 1.5,
      grayTo: 6,
      pattern: "voxels",
      voxels: 8,
      seasonShare: 0.6,
    });
    const { highlight } = DEFAULT_SQUARE_GRID_SETTINGS;
    // The app's brown, green and white (amber-700, meadow-400 of theme.css), bottom to top; the P white, off.
    expect(highlight.colors).toEqual({ route: "#914e02", middle: "#6eca6f", top: "#ffffff", logo: "#ffffff" });
    const theme = readFileSync(fileURLToPath(new URL("../../app/src/styles/theme.css", import.meta.url)), "utf8");
    for (const [token, color] of [["amber-700", highlight.colors.route], ["meadow-400", highlight.colors.middle]]) {
      expect(theme).toContain(`--color-${token}: `);
      expect(theme.match(new RegExp(`--color-${token}: oklch\\([^)]*\\); /\\* (#[0-9A-F]{6}) \\*/`))![1]!.toLowerCase()).toBe(color);
    }
    expect(highlight.logo).toMatchObject({ enabled: false, text: "P" });
    expect(highlight.logo.font).toContain('"Almendra"');
    expect(highlight).toMatchObject({ style: "twist", twist: 12, opacity: 0.4, pulse: true, rollout: true, dim: { saturation: 0.15, opacity: 0.4, ms: 200 } });
  });

  it("takes each group's fields over the defaults', the nested ones too, and keeps the base's style for an unknown one", () => {
    const s = resolveSquareGridSettings({ enabled: true, highlight: { style: "frame", dim: { opacity: 0.6 }, colors: { top: "#eeeeee" }, logo: { text: "Q" } }, backdrop: { mist: 0.12 } });
    const base = DEFAULT_SQUARE_GRID_SETTINGS.highlight;
    expect(s.highlight).toEqual({ ...base, style: "frame", dim: { ...base.dim, opacity: 0.6 }, colors: { ...base.colors, top: "#eeeeee" }, logo: { ...base.logo, text: "Q" } });
    expect(s.backdrop).toEqual({ ...DEFAULT_SQUARE_GRID_SETTINGS.backdrop, mist: 0.12 });
    expect(resolveSquareGridSettings({ highlight: { style: "nope" as never } }).highlight.style).toBe("twist");
    expect(resolveSquareGridSettings({ backdrop: { pattern: "nope" as never } }).backdrop.pattern).toBe("voxels");
    expect(resolveRendererSettings({ squareGrid: { enabled: true } }).squareGrid).toEqual(on());
  });
});

describe("the lines (Realms' terrain border; the landscape ground's while the backdrop is off)", () => {
  it("measures the distance to the nearest cell edge: half a cell at a centre, 0 on an edge or a corner, the same in every cell", () => {
    expect(squareEdgeDistance(0, 0)).toBeCloseTo(TILE_SIZE / 2, 12);
    expect(squareEdgeDistance(TILE_SIZE / 2, 0)).toBeCloseTo(0, 12);
    expect(squareEdgeDistance(TILE_SIZE / 2, TILE_SIZE / 2)).toBeCloseTo(0, 12);
    expect(squareEdgeDistance(0.3 + 5 * TILE_SIZE, 1.1 - 3 * TILE_SIZE)).toBeCloseTo(squareEdgeDistance(0.3, 1.1), 9);
  });

  it("covers the half width each side of the edge fully, then fades over 1.2 px; it is made of the ground's colour", () => {
    const half = DEFAULT_SQUARE_GRID_SETTINGS.lines.halfWidth;
    expect(gridLineAt(half, 0.05, half)).toBe(1);
    expect(gridLineAt(half + 0.03, 0.05, half)).toBeCloseTo(0.5, 9);
    expect(gridLineAt(half + 0.06, 0.05, half)).toBe(0);
    gridLineColor([0.4, 0.4, 0.4], 0).forEach((c) => expect(c).toBeCloseTo(0.18, 9));
    gridLineColor([0.01, 0.01, 0.01], 0).forEach((c) => expect(c).toBeCloseTo(0.14, 9));
  });

  it("lies in the landscape's ground: its shader shades the ground's colour with it, the fog takes its uniforms and draws again once", () => {
    const fog = new FogOfWar({ value: 0 }, resolveFogSettings({ enabled: true, landscape: { enabled: true } }));
    const onChange = vi.fn();
    fog.onChange = onChange;
    const ground = (fog as any).groundMesh.material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <color_fragment>\n#include <fog_fragment>",
    };
    ground.onBeforeCompile(shader as any, undefined as any);
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = squareGridShade(diffuseColor.rgb, vFogBoard);");
    expect(gridLineUniforms(DEFAULT_SQUARE_GRID_SETTINGS).strength).toBe(0);
    fog.setGrid(gridLineUniforms(on()));
    expect(shader.uniforms.uGridLine!.value).toBe(0.42);
    expect(onChange).toHaveBeenCalledTimes(1);
    fog.setGrid(gridLineUniforms(on()));
    expect(onChange).toHaveBeenCalledTimes(1);
    fog.dispose();
  });
});

describe("the backdrop (Realms' world map fog, in Paved's colours)", () => {
  it("runs Realms' fog: MaterialX Perlin noise, its two octaves, its veil scaled by the mist, its energy, its cell border", () => {
    const grid = gridOf();
    const floor = grid.group.getObjectByName("square-grid-backdrop") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    const { fragmentShader, uniforms } = floor.material;
    expect(fragmentShader).toContain(MX_NOISE_GLSL);
    expect(MX_NOISE_GLSL).toContain("0xdeadbeefu + (3u << 2u) + 13u");
    expect(MX_NOISE_GLSL).toContain("return 0.982 * result;");
    expect(fragmentShader).toContain("float broad = mxPerlin(vec3(ground.x * 0.16 + drift * 0.06, ground.y * 0.16 - drift * 0.04, drift * 0.025));");
    expect(fragmentShader).toContain("vec3 color = mix(uGround, veilColor, smoothstep(0.18, 0.86, mist) * uMist * uVeilStrength);");
    expect(uniforms.uGround!.value.equals(new THREE.Color("#0e100d"))).toBe(true);
    expect(uniforms.uVeil!.value.equals(new THREE.Color("#a4ab80"))).toBe(true);
    expect(uniforms.uEnergyColor!.value.equals(new THREE.Color("#f0bf5b"))).toBe(true);
    expect([uniforms.uVeilStrength!.value, uniforms.uMist!.value, uniforms.uEnergy!.value, uniforms.uLineStrength!.value]).toEqual([0.68, 0.24, 0.045, 0.2]);
    expect(floor.material.fog).toBe(false);
    expect(grid.step(0)).toBe(true);
    grid.setSettings(on({ backdrop: { enabled: false } }));
    expect(grid.stats().backdrop).toBe(false);
    expect(grid.step(1)).toBe(false);
  });

  it("draws one of its patterns, each its own program: Realms' veil, paving stones, contour lines or voxel blocks", () => {
    expect(BACKDROP_PATTERNS).toEqual(["realms", "cobbles", "contours", "voxels"]);
    const grid = gridOf();
    const floor = grid.group.getObjectByName("square-grid-backdrop") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    const { fragmentShader } = floor.material;
    expect(fragmentShader).toContain("#if PATTERN == 1");
    expect(fragmentShader).toContain("#elif PATTERN == 2");
    expect(fragmentShader).toContain("#elif PATTERN == 3");
    // Voxels by default (the owner's pick).
    expect(floor.material.defines.PATTERN).toBe(3);
    BACKDROP_PATTERNS.forEach((pattern, i) => {
      const version = floor.material.version;
      const changed = floor.material.defines.PATTERN !== i;
      grid.setSettings(on({ backdrop: { pattern } }));
      expect(floor.material.defines.PATTERN).toBe(i);
      // A new pattern compiles once; the same one again does not.
      expect(floor.material.version).toBe(changed ? version + 1 : version);
      grid.setSettings(on({ backdrop: { pattern } }));
      expect(floor.material.version).toBe(changed ? version + 1 : version);
    });
  });

  it("computes only the noise its pattern reads, and none in low power (Realms' low tier: no mist)", () => {
    const grid = gridOf();
    const floor = grid.group.getObjectByName("square-grid-backdrop") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    const shader = floor.material.fragmentShader;
    // The voxels read the mist at each block's middle only, not at the pixel too.
    const voxels = shader.slice(shader.indexOf("#elif PATTERN == 3"), shader.indexOf("#else"));
    expect(voxels.match(/fogMist\(/g)).toHaveLength(1);
    // With no mist, the ground alone: the branch calls no noise.
    const none = shader.slice(shader.indexOf("#if MIST == 0"), shader.indexOf("#elif PATTERN == 3"));
    expect(none).toContain("vec3 color = uGround;");
    expect(none).not.toMatch(/fogMist|mxPerlin|fogFlow/);
    expect(floor.material.defines.MIST).toBe(1);
    const version = floor.material.version;
    expect(grid.setLowPower(true)).toBe(true);
    expect(floor.material.defines.MIST).toBe(0);
    expect(floor.material.version).toBe(version + 1);
    expect(grid.setLowPower(true)).toBe(false);
    expect(grid.setLowPower(false)).toBe(true);
    expect(floor.material.defines.MIST).toBe(1);
  });

  it("draws its voxels eight a cell's side (five of the tiles' voxels each), with no glint, a gap between the blocks", () => {
    const grid = gridOf();
    const floor = grid.group.getObjectByName("square-grid-backdrop") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    expect(floor.material.uniforms.uVoxels!.value).toBe(8);
    const voxels = floor.material.fragmentShader.slice(floor.material.fragmentShader.indexOf("#elif PATTERN == 3"), floor.material.fragmentShader.indexOf("#else"));
    expect(voxels).toContain("vec2 bp = vBoard * (uVoxels / 3.0);");
    expect(voxels).not.toMatch(/glint|uEnergy/);
    expect(voxels).toContain("float gap = smoothstep(0.5 - max(fwidth(bp.x), 1e-4) * 1.5, 0.5, max(inBlock.x, inBlock.y));");
    grid.setSettings(on({ backdrop: { voxels: 40 } }));
    expect(floor.material.uniforms.uVoxels!.value).toBe(40);
  });

  it("is lit as the board's tops are now against the look's own light, its veil in the season's hue", () => {
    const sun = (y: number) => new THREE.Vector3(0, y, 1);
    const look = [
      { color: new THREE.Color(1, 1, 1), intensity: 0.25 },
      { color: new THREE.Color(0.5, 0.6, 1), intensity: 1 },
      { color: new THREE.Color(1, 0.9, 0.7), intensity: 3, direction: sun(1) },
    ];
    // An upward surface takes an ambient or a sky light whole, a directional one by its cosine; none from below.
    const e = upwardIrradiance(look);
    expect(e.r).toBeCloseTo(0.25 + 0.5 + 3 * Math.SQRT1_2, 9);
    expect(upwardIrradiance([{ color: new THREE.Color(1, 1, 1), intensity: 2, direction: sun(-1) }]).r).toBe(0);
    // The look's own lights: as bright as is.
    expect(backdropLight(look, look)).toBe(1);
    // A moonlit night: darker, a brightness only (a blue light and a grey one as bright give the same).
    const night = backdropLight([{ color: new THREE.Color(0.3, 0.4, 0.8), intensity: 0.5 }], look);
    expect(night).toBeLessThan(0.2);
    const grey = 0.3 * 0.2126 + 0.4 * 0.7152 + 0.8 * 0.0722;
    expect(backdropLight([{ color: new THREE.Color(grey, grey, grey), intensity: 0.5 }], look)).toBeCloseTo(night, 9);
    // The season's ground colour at the veil's lightness, its hue kept.
    const veil = new THREE.Color("#a4ab80");
    const autumn = seasonVeil(new THREE.Color("#3a2c1c"), veil);
    const luma = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    expect(luma(autumn)).toBeCloseTo(luma(veil), 9);
    expect(autumn.r / autumn.b).toBeCloseTo(new THREE.Color("#3a2c1c").r / new THREE.Color("#3a2c1c").b, 9);
    const grid = gridOf();
    const u = (grid.group.getObjectByName("square-grid-backdrop") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>).material.uniforms;
    expect(u.uSeasonVeil!.value.equals(veil)).toBe(true);
    expect(u.uSeasonShare!.value).toBe(0.6);
    expect(grid.setLight(night, new THREE.Color("#3a2c1c"))).toBe(true);
    expect(u.uLight!.value).toBe(night);
    expect(u.uSeasonVeil!.value.equals(autumn)).toBe(true);
    expect(grid.setLight(night, new THREE.Color("#3a2c1c"))).toBe(false);
    // With no season (the cycle off), the veil's own hue.
    grid.setLight(1, null);
    expect(u.uSeasonVeil!.value.equals(veil)).toBe(true);
    expect((grid.group.getObjectByName("square-grid-backdrop") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>).material.fragmentShader).toContain("* uLight, 1.0);");
  });

  it("turns grey away from the placed tiles: in colour within grayFrom cells, grey past grayTo", () => {
    expect(grayscaleAt(0, 1.5, 6)).toBe(1);
    expect(grayscaleAt(1.5, 1.5, 6)).toBe(1);
    expect(grayscaleAt(3.75, 1.5, 6)).toBeCloseTo(0.5, 12);
    expect(grayscaleAt(6, 1.5, 6)).toBe(0);
    expect(grayscaleAt(20, 1.5, 6)).toBe(0);
  });

  it("reads the tiles' distance field, built over their bounds and its reach, grey at its border", () => {
    const field = distanceField([{ x: 0, y: 0 }, { x: 2, y: 0 }], 8);
    expect([field.minX, field.minY, field.width, field.height]).toEqual([-8, -8, 19, 17]);
    const at = (x: number, y: number) => (field.data[(y - field.minY) * field.width + (x - field.minX)]! / 255) * field.reach;
    expect(at(0, 0)).toBe(0);
    expect(at(1, 0)).toBeCloseTo(1, 1);
    expect(at(1, 3)).toBeCloseTo(Math.hypot(1, 3), 1);
    expect(at(-8, -8)).toBe(8);
    expect(distanceField([], 8)).toMatchObject({ width: 1, height: 1, data: new Uint8Array([0]) });
    const grid = gridOf();
    grid.setTileCells([{ x: 0, y: 0 }]);
    const floor = grid.group.getObjectByName("square-grid-backdrop") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    const u = floor.material.uniforms;
    // The reach is past grayTo (6): the border is grey.
    expect(u.uDistReach!.value).toBe(8);
    expect(u.uDistRect!.value.toArray()).toEqual([-8, -8, 1 / 17, 1 / 17]);
    expect((u.uDistField!.value as THREE.DataTexture).image.width).toBe(17);
    expect(grid.setTileCells([{ x: 0, y: 0 }])).toBe(false);
  });
});

describe("the highlight (Realms' allowed moves, neutral, with Paved's P)", () => {
  it("lights every playable slot, none where no rotation fits and none under the tile in hand, from the board's first tile out", () => {
    const slots = [
      { x: 0, y: 2 },
      { x: 1, y: 0, legal: false },
      { x: 0, y: 1 },
      { x: -1, y: 0, legal: true },
    ];
    expect(highlightsOf(slots, null)).toEqual([
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
    ]);
    expect(highlightsOf(slots, { x: 0, y: 1 })).toEqual([
      { x: -1, y: 0 },
      { x: 0, y: 2 },
    ]);
  });

  it("stacks three squares, the middle one between the others", () => {
    expect(HIGHLIGHT_LAYERS.route).toEqual({ opacity: 0.16, pulse: 1.25, scale: 0.98, order: 5 });
    expect(HIGHLIGHT_LAYERS.middle).toEqual({ opacity: 0.1, pulse: 1.3, scale: 0.77, order: 6 });
    expect(HIGHLIGHT_LAYERS.top).toEqual({ opacity: 0.22, pulse: 1.5, scale: 0.56, order: 7 });
  });

  it("keeps the top square's opacity over the middle one: the stack shows what Realms' route and endpoint show, at rest and at the pulse's height", () => {
    for (const pulse of [0, 1 / 32, 1 / 16]) {
      const o = layerOpacities(pulse, 0.5);
      const realms = stackedOpacity(0.16 + pulse * 1.25, 0.22 + pulse * 1.5);
      expect(stackedOpacity(o.route, o.middle, o.top)).toBeCloseTo(realms, 12);
      expect(o.top).toBeGreaterThan(0);
    }
    expect(layerOpacities(0, 0.5).logo).toBe(0.5);
    expect(layerOpacities(1 / 16, 0.5).logo).toBeCloseTo(0.5 + 1.5 / 16, 12);
  });

  it("breathes on Realms' pulse at a phase of the pending tile's: |sin πφ| / 16, at its height when the tile is most opaque", () => {
    expect(highlightPulse(0)).toBe(0);
    expect(highlightPulse(0.5)).toBeCloseTo(1 / 16, 12);
    expect(highlightPulse(1)).toBeCloseTo(0, 12);
  });

  it("turns the top square by the style and the middle one the other way", () => {
    expect(HIGHLIGHT_STYLES).toEqual(["plain", "twist", "diamond", "breathe", "frame"]);
    expect(highlightTurns("plain", 12, 1 / 16)).toEqual({ top: 0, middle: 0 });
    const twist = highlightTurns("twist", 12, 0);
    expect(twist.top).toBeCloseTo(12 * deg, 12);
    expect(twist.middle).toBeCloseTo(-12 * deg, 12);
    expect(highlightTurns("frame", 12, 0).middle).toBeCloseTo(-12 * deg, 12);
    const diamond = highlightTurns("diamond", 12, 0);
    expect(diamond.top).toBeCloseTo(Math.PI / 4, 12);
    expect(diamond.middle).toBeCloseTo(-12 * deg, 12);
    expect(highlightTurns("breathe", 12, 0).top).toBe(0);
    const breathe = highlightTurns("breathe", 12, 1 / 32);
    expect(breathe.top).toBeCloseTo(6 * deg, 12);
    expect(breathe.middle).toBeCloseTo(-6 * deg, 12);
  });

  it("rolls a new cell in from 1 % over 180 ms, 18 ms after the one before, with a flash on the first", () => {
    expect(rolloutScale(0, 0)).toBeCloseTo(ROLLOUT.from, 12);
    expect(rolloutScale(ROLLOUT.entryMs, 0)).toBe(1);
    expect(rolloutScale(90, 0)).toBeCloseTo(0.01 + 0.99 * 0.75, 12);
    expect(launchGlowAt(LAUNCH_GLOW.riseMs).opacity).toBeCloseTo(LAUNCH_GLOW.peak, 12);
    expect(launchGlowAt(LAUNCH_GLOW.ms).opacity).toBe(0);
  });

  it("fades once a tile is placed: a smoothstep over its time, the opacity times the setting", () => {
    expect(dimAt(0, 1, 100, 200)).toBeCloseTo(0.5, 12);
    expect(dimAt(0, 1, 200, 200)).toBe(1);
    const dim = dimmedPixel([0.6, 0.6, 0.6], 0.5, 1, { saturation: 0.15, opacity: 0.4 });
    expect(dim.rgb).toEqual([0.6, 0.6, 0.6].map((c) => expect.closeTo(c, 12)));
    expect(dim.alpha).toBeCloseTo(0.2, 12);
    // At the fillers' opacity (0.4 by default): as faint with no tile placed as they were dimmed, fainter again once one is.
    const { highlight } = DEFAULT_SQUARE_GRID_SETTINGS;
    expect(dimmedPixel([0.6, 0.6, 0.6], 0.5, 0, highlight.dim, highlight.opacity).alpha).toBeCloseTo(0.2, 12);
    expect(dimmedPixel([0.6, 0.6, 0.6], 0.5, 1, highlight.dim, highlight.opacity).alpha).toBeCloseTo(0.08, 12);
  });

  it("is a rounded square at 97.5 % of the cell; the frame is its ring, open in the middle", () => {
    const fill = createHighlightGeometry();
    fill.computeBoundingBox();
    expect(fill.boundingBox!.max.x).toBeCloseTo(0.975 * (TILE_SIZE / 2), 5);
    const frame = createHighlightGeometry(true);
    const p = frame.getAttribute("position");
    let nearest = Infinity;
    for (let i = 0; i < p.count; i++) nearest = Math.min(nearest, Math.max(Math.abs(p.getX(i)), Math.abs(p.getY(i))));
    // The hole's nearest points are its rounded corners' middles.
    const inner = (0.975 - 0.14) * (TILE_SIZE / 2);
    expect(nearest).toBeCloseTo(inner - 0.15 * inner * (1 - Math.SQRT1_2), 5);
  });
});

describe("the square grid renderer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws nothing while off", () => {
    const grid = new SquareGridRenderer();
    grid.setSlots([{ x: 1, y: 0 }]);
    grid.setGhost({ x: 1, y: 0, placed: true });
    expect(grid.stats()).toMatchObject({ backdrop: false, route: 0, middle: 0, top: 0, logo: 0, rolling: false });
    expect(grid.step(1)).toBe(false);
  });

  it("clears the cells it drew before it was turned off when it is on again with no slot", () => {
    const settings = { backdrop: { enabled: false }, highlight: { rollout: false } };
    const grid = gridOf(settings);
    grid.setSlots([{ x: 2, y: 0 }, { x: 0, y: 1 }]);
    expect(grid.stats()).toMatchObject({ route: 2, middle: 2, top: 2 });
    grid.setSettings(resolveSquareGridSettings({ enabled: false }));
    grid.setSlots([]);
    grid.setSettings(on(settings));
    expect(grid.stats()).toMatchObject({ route: 0, middle: 0, top: 0, logo: 0 });
  });

  it("draws three squares on each lit cell, in the grid's plane, brown, green and white, the middle and the top turned opposite ways", () => {
    const grid = gridOf({ backdrop: { enabled: false }, highlight: { rollout: false } });
    grid.setSlots([{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1, legal: false }]);
    expect(grid.stats()).toMatchObject({ route: 2, middle: 2, top: 2 });
    const { route, middle, top } = layersOf(grid);
    const at = new THREE.Vector3();
    const scale = new THREE.Vector3();
    matrixAt(route!, 1).decompose(at, new THREE.Quaternion(), scale);
    expect([at.x, at.z]).toEqual([2 * TILE_SIZE, 0]);
    expect(at.y).toBeCloseTo(PLATE_Y, 6);
    expect(HIGHLIGHT_Y).toBeCloseTo(PLATE_Y, 12);
    expect(scale.x).toBeCloseTo(0.98, 5);
    matrixAt(middle!, 1).decompose(at, new THREE.Quaternion(), scale);
    expect(scale.x).toBeCloseTo(0.77, 5);
    matrixAt(top!, 1).decompose(at, new THREE.Quaternion(), scale);
    expect(scale.x).toBeCloseTo(0.56, 5);
    expect(turnOf(route!, 1)).toBeCloseTo(0, 5);
    expect(turnOf(middle!, 1)).toBeCloseTo(-12 * deg, 5);
    expect(turnOf(top!, 1)).toBeCloseTo(12 * deg, 5);
    const colorOf = (mesh: THREE.InstancedMesh) => (mesh.material as THREE.MeshBasicMaterial).color;
    expect(colorOf(route!).equals(new THREE.Color("#914e02"))).toBe(true);
    expect(colorOf(middle!).equals(new THREE.Color("#6eca6f"))).toBe(true);
    expect(colorOf(top!).equals(new THREE.Color("#ffffff"))).toBe(true);
    const o = layerOpacities(0, 0.5);
    expect([route, middle, top].map((m) => (m!.material as THREE.MeshBasicMaterial).opacity)).toEqual([o.route, o.middle, o.top]);
    // No canvas here: no logo.
    expect(grid.stats().logo).toBe(0);
    expect(grid.group.getObjectsByProperty("isInstancedMesh", true)).toEqual([]);
  });

  it("draws Paved's P (off by default) at the middle of each lit cell, square to the board, from its font once the font is in", async () => {
    const drawn: Array<{ text: string; font: string }> = [];
    const ctx = {
      font: "",
      fillStyle: "",
      textAlign: "",
      textBaseline: "",
      clearRect: vi.fn(),
      measureText: () => ({ width: 100, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 100, actualBoundingBoxAscent: 140, actualBoundingBoxDescent: 0 }),
      fillText: vi.fn((text: string) => drawn.push({ text, font: ctx.font })),
    };
    let fontIn: () => void = () => {};
    const load = vi.fn(() => new Promise<void>((resolve) => (fontIn = resolve)));
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }), fonts: { load } });
    const off = gridOf({ backdrop: { enabled: false }, highlight: { rollout: false } });
    off.setSlots([{ x: 0, y: 1 }]);
    expect(off.stats().logo).toBe(0);
    expect(drawn).toHaveLength(0);
    off.dispose();
    const grid = gridOf({ backdrop: { enabled: false }, highlight: { rollout: false, logo: { enabled: true } } });
    const onChange = vi.fn();
    grid.onChange = onChange;
    grid.setSlots([{ x: 0, y: 1 }]);
    expect(grid.stats().logo).toBe(1);
    expect(drawn.at(-1)).toEqual({ text: "P", font: DEFAULT_SQUARE_GRID_SETTINGS.highlight.logo.font });
    expect(load).toHaveBeenCalledWith(DEFAULT_SQUARE_GRID_SETTINGS.highlight.logo.font, "P");
    const { logo } = layersOf(grid);
    expect((logo!.material as THREE.MeshBasicMaterial).map).toBeInstanceOf(THREE.CanvasTexture);
    const scale = new THREE.Vector3();
    matrixAt(logo!, 0).decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.x).toBeCloseTo(0.42 * TILE_SIZE, 5);
    expect(turnOf(logo!, 0)).toBeCloseTo(0, 5);
    const before = drawn.length;
    fontIn();
    await Promise.resolve();
    await Promise.resolve();
    expect(drawn.length).toBe(before + 1);
    expect(onChange).toHaveBeenCalledTimes(1);
    grid.setSettings(on({ backdrop: { enabled: false }, highlight: { rollout: false, logo: { enabled: false } } }));
    expect(grid.stats().logo).toBe(0);
    grid.dispose();
  });

  it("draws the frame's ring under the others in the frame style, the fill again in another", () => {
    const grid = gridOf({ backdrop: { enabled: false }, highlight: { rollout: false, style: "frame" } });
    grid.setSlots([{ x: 0, y: 1 }]);
    const fill = layersOf(grid).top!.geometry;
    expect(layersOf(grid).route!.geometry).not.toBe(fill);
    grid.setSettings(on({ backdrop: { enabled: false }, highlight: { rollout: false, style: "plain" } }));
    expect(layersOf(grid).route!.geometry).toBe(fill);
    expect(turnOf(layersOf(grid).top!, 0)).toBeCloseTo(0, 5);
  });

  it("breathes on the phase it is given (the pending tile's), turning the squares with it in the breathe style", () => {
    const grid = gridOf({ backdrop: { enabled: false }, highlight: { style: "breathe" } });
    grid.setSlots([{ x: 0, y: 1 }], Number.NaN);
    const { route, middle, top } = layersOf(grid);
    expect(grid.update(0, 0.5)).toBe(false);
    expect((route!.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(layerOpacities(1 / 16, 0.5).route, 9);
    expect(turnOf(top!, 0)).toBeCloseTo(12 * deg, 5);
    expect(turnOf(middle!, 0)).toBeCloseTo(-12 * deg, 5);
    grid.update(10, 0);
    expect((route!.material as THREE.MeshBasicMaterial).opacity).toBe(0.16);
    expect(turnOf(top!, 0)).toBeCloseTo(0, 5);
    expect(grid.step(0)).toBe(true);
    grid.setSettings(on({ backdrop: { enabled: false }, highlight: { pulse: false } }));
    grid.update(20, 0.5);
    expect(grid.stats().pulse).toBe(0);
    expect(grid.step(1)).toBe(false);
  });

  it("drops the cell under the tile in hand and brings it back at once when it moves on; fades the others once the tile is placed", () => {
    const grid = gridOf({ backdrop: { enabled: false } });
    grid.setSlots([{ x: 0, y: 1 }, { x: 0, y: 2 }], Number.NaN);
    grid.setGhost({ x: 0, y: 1, placed: false }, 0);
    expect(grid.highlights()).toEqual([{ x: 0, y: 2 }]);
    grid.setGhost({ x: 0, y: 2, placed: false }, 10);
    expect(grid.highlights()).toEqual([{ x: 0, y: 1 }]);
    expect(grid.stats().rolling).toBe(false);
    grid.setGhost({ x: 0, y: 2, placed: true }, 1000);
    expect(grid.update(1100)).toBe(true);
    expect(grid.stats().dim).toBeCloseTo(0.5, 9);
    expect(grid.update(1200)).toBe(true);
    expect(grid.stats().dim).toBe(1);
    expect(grid.update(1300)).toBe(false);
    grid.setGhost(null, 2000);
    grid.update(2200);
    expect(grid.stats().dim).toBe(0);
    expect(grid.highlights()).toEqual([{ x: 0, y: 1 }, { x: 0, y: 2 }]);
  });

  it("rolls a new set in from the board's first tile out, the first with a flash; nothing rolls under reduced motion", () => {
    const grid = gridOf({ backdrop: { enabled: false } });
    grid.setSlots([{ x: 0, y: 2 }, { x: 0, y: 1 }], 0);
    expect(grid.stats().rolling).toBe(true);
    const { route } = layersOf(grid);
    const scaleOf = (i: number) => new THREE.Vector3().setFromMatrixScale(matrixAt(route!, i)).x;
    expect(scaleOf(0)).toBeCloseTo(0.98 * ROLLOUT.from, 5);
    const glow = grid.overlay.children.find((c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh))!;
    expect(grid.update(60)).toBe(true);
    expect(glow.visible).toBe(true);
    grid.update(1000);
    expect(grid.stats().rolling).toBe(false);
    expect(glow.visible).toBe(false);
    expect(scaleOf(1)).toBeCloseTo(0.98, 5);
    const reduced = gridOf({ backdrop: { enabled: false } });
    reduced.setReducedMotion(true);
    reduced.setSlots([{ x: 0, y: 1 }, { x: 0, y: 2 }], 0);
    expect(reduced.stats().rolling).toBe(false);
    reduced.setGhost({ x: 0, y: 1, placed: true }, 100);
    expect(reduced.stats().dim).toBe(1);
  });

  it("frees what it made", () => {
    const grid = gridOf({ highlight: { style: "frame" } });
    grid.setTileCells([{ x: 0, y: 0 }]);
    grid.setSlots([{ x: 1, y: 0 }]);
    const resources = new Set<{ dispose: () => void }>();
    for (const root of [grid.group, grid.overlay]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) resources.add(m.geometry);
        if (m.material) resources.add(m.material as THREE.Material);
      });
    }
    const floor = grid.group.getObjectByName("square-grid-backdrop") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    resources.add(floor.material.uniforms.uDistField!.value as THREE.Texture);
    const freed = [...resources].map((r) => vi.spyOn(r, "dispose"));
    grid.dispose();
    for (const spy of freed) expect(spy).toHaveBeenCalled();
    expect(grid.stats()).toMatchObject({ backdrop: false, route: 0, middle: 0, top: 0, rolling: false });
  });
});

describe("the overlay and the underlay: drawn as Realms draws them", () => {
  /** A renderer as far as the composer reads it before drawing. */
  const fakeRenderer = () =>
    ({
      getPixelRatio: () => 2,
      getSize: (v: THREE.Vector2) => v.set(400, 300),
      getDrawingBufferSize: (v: THREE.Vector2) => v.set(800, 600),
      domElement: { width: 800, height: 600 },
    }) as unknown as THREE.WebGLRenderer;
  const overlayOf = (parts: { scene?: boolean; underlay?: boolean }): Overlay => ({
    scene: parts.scene ? new THREE.Scene() : null,
    depth: createOverlayDepth(),
    underlay: parts.underlay ? new THREE.Scene() : null,
    underlayExposure: 0.8,
  });

  it("adds its pass before the finish, reads the scene's depth for the overlay, and lays the two over and under the scene", () => {
    const effects = new Effects();
    // The Low tier: no AO, so no depth texture until the overlay asks for one.
    effects.setLook(LOOK_PRESETS.mockup, "low");
    effects.init(fakeRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(effects.getComposer()!.renderTarget1.depthTexture).toBeNull();
    effects.setOverlay(overlayOf({ scene: true, underlay: true }));
    expect(effects.getPassNames()).toEqual(["render", "overlay", "finish"]);
    const composer = effects.getComposer()!;
    expect(composer.renderTarget1.depthTexture).toBeInstanceOf(THREE.DepthTexture);
    const pass = composer.passes.find((p) => p instanceof OverlayPass) as OverlayPass;
    const finish = composer.passes.find((p) => p instanceof FinishPass) as FinishPass;
    expect(finish.material.defines).toMatchObject({ OVERLAY: "", UNDERLAY: "" });
    expect(finish.material.uniforms.tOverlay!.value).toBe(pass.target!.texture);
    expect(finish.material.uniforms.tUnderlay!.value).toBe(pass.underTarget!.texture);
    expect(finish.material.uniforms.underlayExposure!.value).toBe(0.8);
    // After the tone map, the grade and the vignette: the underlay with Realms' ACES, the overlay as given.
    const shader = finish.material.fragmentShader;
    const after = (a: string, b: string) => expect(shader.lastIndexOf(a)).toBeGreaterThan(shader.indexOf(b));
    after("#ifdef UNDERLAY", "#ifdef VIGNETTE");
    after("#ifdef OVERLAY", "#ifdef UNDERLAY");
    expect(shader).toContain("ACESFilmicToneMapping(texture2D(tUnderlay, vUv).rgb * (underlayExposure / max(toneMappingExposure, 1e-6)))");
    // The underlay alone: no depth texture, no overlay target.
    effects.setOverlay(overlayOf({ underlay: true }));
    const alone = effects.getComposer()!.passes.find((p) => p instanceof OverlayPass) as OverlayPass;
    expect(alone.target).toBeNull();
    expect(effects.getComposer()!.renderTarget1.depthTexture).toBeNull();
    effects.setOverlay(null);
    expect(effects.getPassNames()).toEqual(["render", "finish"]);
    effects.dispose();
  });

  it("lays the underlay in the day and night backdrop's place", () => {
    const look = LOOK_PRESETS.mockup;
    expect(finishDefines(look, false, true)).toHaveProperty("BACKDROP");
    expect(finishDefines(look, false, true, false, true)).not.toHaveProperty("BACKDROP");
    expect(finishDefines(look, false, true, false, true)).toHaveProperty("UNDERLAY");
  });

  it("draws each part into its own target, cleared to nothing, the overlay with the scene's depth, and leaves the renderer as it was", () => {
    const overlay = overlayOf({ scene: true, underlay: true });
    const pass = new OverlayPass(overlay, new THREE.PerspectiveCamera());
    const calls: string[] = [];
    let clearAlpha = 1;
    const renderer = {
      autoClear: true,
      getClearAlpha: () => clearAlpha,
      getClearColor: (c: THREE.Color) => c.set(0x123456),
      setClearColor: (_c: unknown, a: number) => {
        clearAlpha = a;
        calls.push(`clearColor ${a}`);
      },
      setRenderTarget: (t: unknown) => calls.push(t === pass.target ? "overlay" : t === pass.underTarget ? "underlay" : "other"),
      clear: () => calls.push(`clear ${clearAlpha}`),
      render: (scene: unknown) => calls.push(`render ${scene === overlay.scene ? "overlay" : "underlay"} autoClear=${renderer.autoClear}`),
    };
    const depth = new THREE.DepthTexture(800, 600);
    const read = { depthTexture: depth, width: 800, height: 600 } as unknown as THREE.WebGLRenderTarget;
    pass.render(renderer as unknown as THREE.WebGLRenderer, read, read);
    expect(calls).toEqual(["clearColor 0", "underlay", "clear 0", "render underlay autoClear=false", "overlay", "clear 0", "render overlay autoClear=false", "clearColor 1"]);
    expect(renderer.autoClear).toBe(true);
    expect(overlay.depth.uSceneDepth.value).toBe(depth);
    expect(overlay.depth.uSceneSize.value.toArray()).toEqual([800, 600]);
    pass.dispose();
  });

  it("drops a fragment behind the scene's surface, and adds the extra lines after the colour is written", () => {
    const depth = createOverlayDepth();
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: "", fragmentShader: "void main() {\n  gl_FragColor = vec4(1.0);\n  #include <dithering_fragment>\n}" };
    overlayDepthTest(depth, { uniforms: { uDim: { value: 0 } }, declarations: "uniform float uDim;", output: "gl_FragColor.a *= 0.5;" })(shader as any);
    expect(shader.uniforms.uSceneDepth).toBe(depth.uSceneDepth);
    expect(shader.fragmentShader).toContain("if ( gl_FragCoord.z > texture2D( uSceneDepth, gl_FragCoord.xy / uSceneSize ).r ) discard;");
    expect(shader.fragmentShader.indexOf("gl_FragColor.a *= 0.5;")).toBeGreaterThan(shader.fragmentShader.indexOf("#include <dithering_fragment>"));
  });
});

describe("the pending tile's pulse phase", () => {
  it("is null with no tile pending, then runs from its placing over its period", () => {
    const placement = new PlacementRenderer();
    placement.setSettings(resolvePlacementSettings({ tints: { pendingPulseMs: 1600 }, motion: { reducedMotion: false } }));
    expect(placement.pulsePhase(0)).toBeNull();
    placement.setGhost({ x: 0, y: 1, kind: "pending" }, 1000);
    expect(placement.pulsePhase(1000)).toBe(0);
    expect(placement.pulsePhase(1800)).toBeCloseTo(0.5, 12);
    expect(placement.pulsePhase(2600)).toBeCloseTo(0, 12);
    placement.setReducedMotion(true);
    expect(placement.pulsePhase(1800)).toBeNull();
  });
});

describe("the square grid in the scene", () => {
  it("turns the plates off while its highlight takes their place, and gives the effects its overlay and underlay while they show", () => {
    const scene = new GameScene();
    const setPlacementSettings = vi.spyOn(scene.tiles, "setPlacementSettings");
    const setOverlay = vi.spyOn(scene.effects, "setOverlay");
    const plates = () => setPlacementSettings.mock.lastCall![0].plates.enabled;
    scene.setSettings({ squareGrid: { enabled: true } });
    expect(plates()).toBe(false);
    const given = setOverlay.mock.lastCall![0]!;
    expect(given).toMatchObject({ depth: scene.squareGrid.overlayDepth, underlayExposure: 0.8 });
    expect(given.scene!.getObjectByName("square-grid-overlay")).toBe(scene.squareGrid.overlay);
    expect(given.underlay!.getObjectByName("square-grid")).toBe(scene.squareGrid.group);
    scene.setSettings({ squareGrid: { enabled: true, highlight: { enabled: false } } });
    expect(plates()).toBe(true);
    expect(setOverlay.mock.lastCall![0]).toMatchObject({ scene: null });
    scene.setSettings({});
    expect(setOverlay).toHaveBeenLastCalledWith(null);
  });

  it("lights its backdrop as the board: the look's lights give it its own brightness, dimmer lights darken it", () => {
    const scene = new GameScene();
    (scene as any).setupLighting();
    const setLight = vi.spyOn(scene.squareGrid, "setLight");
    scene.setSettings({ squareGrid: { enabled: true } });
    expect(setLight.mock.lastCall![0]).toBeCloseTo(1, 6);
    expect(setLight.mock.lastCall![1]).toBeNull();
    // The cycle's night (here by hand): the lights drop, the backdrop with them.
    (scene as any).directionalLight.intensity = 0;
    (scene as any).hemisphereLight.intensity *= 0.3;
    (scene as any).syncGridLight();
    expect(setLight.mock.lastCall![0]).toBeLessThan(0.5);
  });

  it("draws its backdrop with no mist on the Low tier and on software WebGL", () => {
    const scene = new GameScene();
    const mist = () => (scene.squareGrid.group.getObjectByName("square-grid-backdrop") as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>).material.defines.MIST;
    scene.setSettings({ quality: "high", squareGrid: { enabled: true } });
    expect(mist()).toBe(1);
    scene.setSettings({ quality: "low", squareGrid: { enabled: true } });
    expect(mist()).toBe(0);
    (scene as any).webgl = { renderer: "SwiftShader", software: true, reason: "test" };
    scene.setSettings({ quality: "high", squareGrid: { enabled: true } });
    expect(mist()).toBe(0);
  });

  it("takes the whole sun while the cycle crossfades it between the key light and its twin", () => {
    const scene = new GameScene();
    (scene as any).setupLighting();
    const key = (scene as any).directionalLight as THREE.DirectionalLight;
    const whole = backdropLight((scene as any).sceneLights(), (scene as any).sceneLights());
    expect(whole).toBe(1);
    // The key holds a share of the sun (the rest is its twin's): read whole, the brightness does not move.
    const sun = { direction: key.position.clone().normalize().toArray() as [number, number, number], intensity: key.intensity };
    const look = (scene as any).sceneLights();
    key.intensity *= 0.3;
    expect(backdropLight((scene as any).sceneLights(), look)).toBeLessThan(1);
    expect(backdropLight((scene as any).sceneLights(sun), look)).toBeCloseTo(1, 6);
  });

  it("keeps the fog of war, the background and the distance fog off while its backdrop shows", () => {
    const scene = new GameScene();
    const fog = { setSettings: vi.fn(), setGrid: vi.fn(), setMode: vi.fn(), setRevealed: vi.fn(), setCycle: vi.fn() };
    (scene as any).fog = fog;
    const setClearColor = vi.fn();
    (scene as any).renderer = { setClearColor };
    scene.setFogReveal([{ x: 0, y: 0 }]);
    scene.setSettings({ fog: { enabled: true }, squareGrid: { enabled: true } });
    expect(fog.setMode).toHaveBeenLastCalledWith("off");
    expect(scene.scene.background).toBeNull();
    expect(scene.scene.fog).toBeNull();
    expect(setClearColor).toHaveBeenLastCalledWith(0x000000, 0);
    scene.setSettings({ fog: { enabled: true }, squareGrid: { enabled: true, backdrop: { enabled: false } } });
    expect(fog.setMode).not.toHaveBeenLastCalledWith("off");
    expect(scene.scene.background).not.toBeNull();
  });

  it("hands it the tiles, the slots and the tile in hand, breathes it on the pending tile's phase, and turns both parts with the compass", () => {
    const scene = new GameScene();
    scene.setSettings({ squareGrid: { enabled: true } });
    const setTileCells = vi.spyOn(scene.squareGrid, "setTileCells");
    // A tile renderer that draws nothing: no model to load here.
    (scene as any).tiles = { updateTiles: vi.fn(), setHover: vi.fn(), setAvailableSlots: vi.fn(), updateBoardFrame: vi.fn(), pulsePhase: vi.fn(() => 0.25) };
    scene.updateTiles([{ game_id: 1, id: 1, player_id: "0x0", plan: 0, orientation: 0, x: 0, y: 0, worldX: 2, worldZ: -1 } as any]);
    expect(setTileCells).toHaveBeenLastCalledWith([{ x: 2, y: -1 }]);
    scene.setAvailableSlots([{ x: 0, y: 1 }, { x: 1, y: 0 }]);
    scene.setHoveredTile({ x: 0, y: 1, valid: true, idle: true, placed: true, planIndex: 0, orientation: 0 } as any);
    expect(scene.squareGrid.highlights()).toEqual([{ x: 1, y: 0 }]);
    expect(scene.getSquareGrid()).toMatchObject({ backdrop: true, route: 1, middle: 1, top: 1 });
    expect((scene as any).pulsePhase(5000)).toBe(0.25);
    (scene as any).tiles.pulsePhase = vi.fn(() => null);
    expect((scene as any).pulsePhase(800)).toBeCloseTo(0.5, 12);
    scene.setCompassRotation(Math.PI / 2);
    expect(scene.squareGrid.overlay.parent!.rotation.y).toBe(Math.PI / 2);
    expect(scene.squareGrid.group.parent!.rotation.y).toBe(Math.PI / 2);
  });
});
