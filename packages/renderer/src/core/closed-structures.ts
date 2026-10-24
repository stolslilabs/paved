import * as THREE from "three";
import {
  DEFAULT_CLOSING_SETTINGS,
  PULSE_RISE,
  pulseLevel,
  shineAllowed,
  shineInterval,
  structureHash,
  sweepAxis,
  sweepExtent,
  sweepRunning,
  type ClosingSettings,
} from "./closing-settings";

/**
 * A closed structure as the board hands it (`GameScene.setClosedStructures`): a stable id (the same structure keeps it from
 * one call to the next) and its areas on each of its tiles, as `setLitAreas` takes them.
 */
export interface ClosedStructure {
  id: string;
  areas: ReadonlyArray<{ gameId: number; id: number; areas: number }>;
}

/** How a call treats the structures it brings: `pulse` (the default after the first call) or shining at once (`false`). */
export interface ClosedStructuresOptions {
  pulse?: boolean;
}

/** The structures one area of a tile can show at once (the channels of a texel of `uClosedMap`). */
export const CLOSED_SLOTS = 4;

/** The tallest tile's height, world units (`TALLEST_TILE_HEIGHT`): a structure's box for its extent across the sweep. */
const STRUCTURE_HEIGHT = 2.625;

/** One structure on its clock: its masks by tile key, when its pulse starts (null: none) and its shine, ms on the layer's clock. */
interface Tracked {
  index: number;
  areas: Map<string, number>;
  hash: number;
  pulseAt: number | null;
  shineAt: number;
}

/**
 * The closed structures' layer (CLOSE-SHINE, #722), beside the lit structure of `setLitAreas`: each closed structure pulses
 * once (if it closed while the board was shown), then shines for the rest of the game, on its own clock. The tile shader reads
 * it (`CLOSED_GLSL`) from two maps:
 *
 * - `uClosedMap`: one RGBA float texel per area of each cell of the smallest rectangle that holds the closed tiles (9 a cell,
 *   area `a` at `x * 9 + a - 1`), the indexes (from 1) of up to `CLOSED_SLOTS` structures that hold it, 0 for none;
 * - `uClosedData`: two texels per structure: its clock (pulse start, shine start, interval, all in seconds on `uClosedTime`'s
 *   clock, and whether it pulses) and its extent across the sweep.
 *
 * A (tile, area) held by several structures (a wonder's tiles count whole, so a road on one is held by both) draws each on its
 * own clock: each pulses and sweeps it in its turn, the brightest winning where two overlap. Past `CLOSED_SLOTS` (a tile among
 * more than three wonders' rings with a structure of its own), the earliest are left out. The maps are built again only when the
 * structures, their cells or the settings change; between sweeps nothing moves and no frame is asked for (`update`).
 */
export class ClosedStructuresLayer {
  readonly uniforms = {
    uClosedOn: { value: 0 },
    uClosedMap: { value: emptyTexture(THREE.RGBAFormat, CLOSED_SLOTS) },
    uClosedRect: { value: new THREE.Vector4(0, 0, 0, 0) },
    uClosedData: { value: emptyTexture(THREE.RGBAFormat, 4) },
    uClosedTime: { value: 0 },
    uPulseColor: { value: new THREE.Color() },
    uPulseStrength: { value: 0 },
    uPulseGlow: { value: 0 },
    uPulseDuration: { value: 1 },
    uShineOn: { value: 0 },
    uShineColor: { value: new THREE.Color() },
    uShineStrength: { value: 0 },
    uShineWidth: { value: 1 },
    uShineDuration: { value: 1 },
    uShineAxis: { value: new THREE.Vector3(1, 0, 0) },
  };
  private tracked = new Map<string, Tracked>();
  private settings: ClosingSettings = DEFAULT_CLOSING_SETTINGS;
  private reduced = false;
  private lowPower = false;
  private calls = 0;
  /** The maps' content as last built (`build`): built again only when it changes. */
  private builtKey = "";
  /** Whether a pulse or a sweep ran at the last `update`: the frame after its end clears it. */
  private wasActive = false;
  /** The layer's clock starts here (ms, `performance.now()`'s): the shader's times stay small. */
  private readonly epoch: number;

  constructor(now: number) {
    this.epoch = now;
    this.setSettings(DEFAULT_CLOSING_SETTINGS, false, false);
  }

  /** How many closed structures the layer holds. */
  get size(): number {
    return this.tracked.size;
  }

  /**
   * The closed structures now, in closing order. A structure seen for the first time pulses (staggered as the closing feed's
   * lines, by its order among the new ones), then shines from its pulse's end; the first call's (a board loaded mid-game)
   * shine at once, each at its own phase. `options.pulse` overrides that. A structure no longer listed is dropped.
   */
  set(structures: readonly ClosedStructure[], now: number, options: ClosedStructuresOptions = {}): void {
    const pulse = options.pulse ?? this.calls > 0;
    this.calls++;
    const next = new Map<string, Tracked>();
    let fresh = 0;
    structures.forEach((structure, index) => {
      const areas = new Map<string, number>();
      for (const { gameId, id, areas: mask } of structure.areas) areas.set(`${gameId}-${id}`, (areas.get(`${gameId}-${id}`) ?? 0) | mask);
      const known = this.tracked.get(structure.id);
      if (known) {
        next.set(structure.id, { ...known, index, areas });
        return;
      }
      const hash = structureHash(structure.id);
      if (pulse) {
        const pulseAt = now + fresh++ * this.settings.pulse.staggerMs;
        next.set(structure.id, { index, areas, hash, pulseAt, shineAt: pulseAt + this.pulseMs() });
      } else {
        // Its own phase: somewhere in its first interval, so a board of many closed structures does not sweep all at once.
        next.set(structure.id, { index, areas, hash, pulseAt: null, shineAt: now - hash * shineInterval(hash, this.settings.shine) });
      }
    });
    this.tracked = next;
    this.uniforms.uClosedOn.value = next.size ? 1 : 0;
  }

  /** The settings, reduced motion (a short pulse, no shine) and low power (the Low tier, software WebGL: no shine). */
  setSettings(settings: ClosingSettings, reducedMotion: boolean, lowPower: boolean): void {
    this.settings = settings;
    this.reduced = reducedMotion;
    this.lowPower = lowPower;
    const { pulse, shine } = settings;
    const u = this.uniforms;
    u.uPulseColor.value.set(pulse.color);
    u.uPulseStrength.value = settings.enabled ? pulse.strength : 0;
    u.uPulseGlow.value = settings.enabled ? pulse.glow : 0;
    u.uPulseDuration.value = Math.max(1, this.pulseMs()) / 1000;
    u.uShineOn.value = this.shineOn() ? 1 : 0;
    u.uShineColor.value.set(shine.color);
    u.uShineStrength.value = shine.strength;
    u.uShineWidth.value = Math.max(0.01, shine.width);
    u.uShineDuration.value = Math.max(1, shine.durationMs) / 1000;
    u.uShineAxis.value.set(...sweepAxis(shine.angle));
  }

  private pulseMs(): number {
    return this.reduced ? this.settings.pulse.reducedMs : this.settings.pulse.ms;
  }

  private shineOn(): boolean {
    return shineAllowed(this.settings, this.reduced, this.lowPower);
  }

  /**
   * The maps (`uClosedMap`, `uClosedData`) from the structures and the tiles' cells (tile key to cell), built again only when
   * one of them or the settings changed. A tile with no cell yet (not given) is left out until it comes.
   */
  build(cells: ReadonlyMap<string, readonly [number, number]>): void {
    const placed: Array<{ tracked: Tracked; cells: Array<[number, number, number]> }> = [];
    for (const tracked of [...this.tracked.values()].sort((a, b) => a.index - b.index)) {
      const at: Array<[number, number, number]> = [];
      for (const [key, mask] of tracked.areas) {
        const cell = cells.get(key);
        if (cell && mask) at.push([cell[0], cell[1], mask]);
      }
      placed.push({ tracked, cells: at });
    }
    const { shine } = this.settings;
    const key = JSON.stringify([placed.map((p) => [p.tracked.pulseAt, p.tracked.shineAt, p.tracked.hash, p.cells]), shine.angle, shine.intervalMinMs, shine.intervalMaxMs, shine.durationMs]);
    if (key === this.builtKey) return;
    this.builtKey = key;
    const u = this.uniforms;
    const all = placed.flatMap((p) => p.cells);
    u.uClosedMap.value.dispose();
    u.uClosedData.value.dispose();
    if (!all.length) {
      u.uClosedMap.value = emptyTexture(THREE.RGBAFormat, CLOSED_SLOTS);
      u.uClosedData.value = emptyTexture(THREE.RGBAFormat, 4);
      u.uClosedRect.value.set(0, 0, 0, 0);
      return;
    }
    const [minX, minZ] = [Math.min(...all.map((c) => c[0])), Math.min(...all.map((c) => c[1]))];
    const width = Math.max(...all.map((c) => c[0])) - minX + 1;
    const depth = Math.max(...all.map((c) => c[1])) - minZ + 1;
    const map = new Float32Array(width * 9 * depth * CLOSED_SLOTS);
    const data = new Float32Array(placed.length * 2 * 4);
    const axis = sweepAxis(shine.angle);
    placed.forEach(({ tracked, cells: at }, i) => {
      for (const [x, z, mask] of at) {
        for (let area = 1; area <= 9; area++) {
          if (!(mask & (1 << (area - 1)))) continue;
          const o = ((z - minZ) * width * 9 + (x - minX) * 9 + area - 1) * CLOSED_SLOTS;
          // The first free slot; all full, the earliest goes and the later ones move up.
          let slot = 0;
          while (slot < CLOSED_SLOTS && map[o + slot]) slot++;
          if (slot === CLOSED_SLOTS) {
            map.copyWithin(o, o + 1, o + CLOSED_SLOTS);
            slot = CLOSED_SLOTS - 1;
          }
          map[o + slot] = i + 1;
        }
      }
      const [low, high] = sweepExtent(at.map(([x, z]) => [x, z] as const), axis, TILE_UNITS, STRUCTURE_HEIGHT);
      const o = i * 8;
      data[o] = ((tracked.pulseAt ?? 0) - this.epoch) / 1000;
      data[o + 1] = (tracked.shineAt - this.epoch) / 1000;
      data[o + 2] = shineInterval(tracked.hash, shine) / 1000;
      data[o + 3] = tracked.pulseAt === null ? 0 : 1;
      data[o + 4] = low;
      data[o + 5] = high;
    });
    u.uClosedMap.value = dataTexture(map, width * 9, depth, THREE.RGBAFormat);
    u.uClosedData.value = dataTexture(data, 2, placed.length, THREE.RGBAFormat);
    u.uClosedRect.value.set(minX, minZ, width, depth);
  }

  /** The pulse's level of structure `id` at `now` (0 to 1): what the shader draws, for the tests and the stories. */
  pulseAt(id: string, now: number): number {
    const tracked = this.tracked.get(id);
    if (!tracked || tracked.pulseAt === null || !this.settings.enabled) return 0;
    return pulseLevel(now - tracked.pulseAt, this.pulseMs());
  }

  /** Whether structure `id` is sweeping at `now`. */
  sweepingAt(id: string, now: number): boolean {
    const tracked = this.tracked.get(id);
    if (!tracked || !this.shineOn()) return false;
    return sweepRunning(now - tracked.shineAt, shineInterval(tracked.hash, this.settings.shine), this.settings.shine.durationMs);
  }

  /**
   * The shader's clock to `now`; true while a pulse or a sweep runs (a frame is wanted), and once more on the frame after the
   * last one ends, so it leaves no tint behind. Between sweeps, false: the board is still.
   */
  update(now: number): boolean {
    this.uniforms.uClosedTime.value = (now - this.epoch) / 1000;
    let active = false;
    for (const [id, tracked] of this.tracked) {
      if (tracked.pulseAt !== null && now >= tracked.pulseAt && now < tracked.pulseAt + this.pulseMs() && this.settings.enabled) active = true;
      else if (this.sweepingAt(id, now)) active = true;
      if (active) break;
    }
    const wanted = active || this.wasActive;
    this.wasActive = active;
    return wanted;
  }

  dispose(): void {
    this.uniforms.uClosedMap.value.dispose();
    this.uniforms.uClosedData.value.dispose();
    this.tracked.clear();
    this.builtKey = "";
  }
}

/** A tile's side, world units (`TILE_SIZE`; not imported, so this module stays free of the board's types). */
const TILE_UNITS = 3;

function dataTexture(data: Float32Array, width: number, height: number, format: THREE.PixelFormat): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, format, THREE.FloatType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function emptyTexture(format: THREE.PixelFormat, channels: number): THREE.DataTexture {
  return dataTexture(new Float32Array(channels), 1, 1, format);
}

/** The uniforms the tile shader declares for the layer (`CLOSED_GLSL`). */
export const CLOSED_UNIFORMS_GLSL = /* glsl */ `
uniform float uClosedOn;
uniform sampler2D uClosedMap;
uniform vec4 uClosedRect;
uniform sampler2D uClosedData;
uniform float uClosedTime;
uniform vec3 uPulseColor;
uniform float uPulseStrength;
uniform float uPulseGlow;
uniform float uPulseDuration;
uniform float uShineOn;
uniform vec3 uShineColor;
uniform float uShineStrength;
uniform float uShineWidth;
uniform float uShineDuration;
uniform vec3 uShineAxis;
float closedEase(float p) {
  float x = clamp(p, 0.0, 1.0);
  float t = x;
  for (int i = 0; i < 5; i++) {
    float u = 1.0 - t;
    float bx = 3.0 * u * u * t * 0.4 + 3.0 * u * t * t * 0.2 + t * t * t;
    float dx = 3.0 * u * u * 0.4 + 6.0 * u * t * (0.2 - 0.4) + 3.0 * t * t * (1.0 - 0.2);
    if (abs(dx) < 1e-6) break;
    t = clamp(t - (bx - x) / dx, 0.0, 1.0);
  }
  float u = 1.0 - t;
  return 3.0 * u * t * t + t * t * t;
}
`;

/**
 * The layer's term, after the feature highlight, on the palette's colour (`labelGlsl` reads the fragment's area, as the
 * highlight does): the area's structures in the closed map at the tile's cell (`vCell`), then each one's clock (the brightest
 * of their pulses and of their bands wins). The pulse moves the
 * colour to `uPulseColor` (`pulseLevel`'s curve) and adds its glow; the shine adds a soft band of light (`closedShine`, the
 * emissive term) where the fragment's place across the sweep (`vClosedBoard`, the board's frame, on `uShineAxis`) meets the
 * band's, which crosses the structure's extent in `uShineDuration` (`sweepEase`). Off (`uClosedOn` 0, no closed structure),
 * it skips the whole block.
 */
export function closedGlsl(labelGlsl: string): string {
  return /* glsl */ `
  float closedPulse = 0.0;
  float closedShine = 0.0;
  if (uClosedOn > 0.5) {
    ${labelGlsl}
    ivec2 closedCell = ivec2(floor(vCell - uClosedRect.xy + 0.5));
    if (labelArea > 0 && all(greaterThanEqual(closedCell, ivec2(0))) && all(lessThan(closedCell, ivec2(uClosedRect.zw + 0.5)))) {
      vec4 closedSlots = texelFetch(uClosedMap, ivec2(closedCell.x * 9 + labelArea - 1, closedCell.y), 0);
      for (int slot = 0; slot < ${CLOSED_SLOTS}; slot++) {
        int closedIndex = int(closedSlots[slot] + 0.5);
        if (closedIndex == 0) break;
        vec4 closedClock = texelFetch(uClosedData, ivec2(0, closedIndex - 1), 0);
        vec4 closedExtent = texelFetch(uClosedData, ivec2(1, closedIndex - 1), 0);
        float pulseElapsed = (uClosedTime - closedClock.x) / uPulseDuration;
        if (closedClock.w > 0.5 && pulseElapsed >= 0.0 && pulseElapsed < 1.0) {
          closedPulse = max(closedPulse, pulseElapsed < ${PULSE_RISE.toFixed(2)} ? pulseElapsed / ${PULSE_RISE.toFixed(2)} : 1.0 - smoothstep(${PULSE_RISE.toFixed(2)}, 1.0, pulseElapsed));
        }
        float shineSince = uClosedTime - closedClock.y;
        if (uShineOn > 0.5 && shineSince >= 0.0) {
          float sweep = mod(shineSince, closedClock.z);
          if (sweep < uShineDuration) {
            float centre = mix(closedExtent.x - uShineWidth, closedExtent.y + uShineWidth, closedEase(sweep / uShineDuration));
            float across = abs(dot(vClosedBoard, uShineAxis) - centre) / (0.5 * uShineWidth);
            closedShine = max(closedShine, 1.0 - smoothstep(0.0, 1.0, across));
          }
        }
      }
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, uPulseColor, closedPulse * uPulseStrength);
  }
`;
}
