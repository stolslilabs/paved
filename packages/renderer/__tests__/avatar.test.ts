import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebGLRenderer } from "three";
import { decodePng } from "./helpers/png";
import {
  AVATAR_PARTS,
  AVATAR_PART_KEYS,
  AVATAR_USED_BITS,
  AVATAR_VALUE_BITS,
  DEFAULT_AVATAR,
  type Avatar,
  type AvatarPart,
  avatarKey,
  decodeAvatar,
  encodeAvatar,
  randomAvatar,
  seededRandom,
} from "../src/core/avatar/avatar-format";
import { AVATAR_PALETTE } from "../src/core/avatar/avatar-palette";
import { FACES, HEAD, PAINTED_VARIANTS, VoxelHead, buildHead, faceGrids, faceVoxel } from "../src/core/avatar/avatar-model";
import { BACKGROUND_COUNT, BACKGROUND_GRID, backgroundPixels } from "../src/core/avatar/avatar-backgrounds";
import { AvatarStills, buildAvatarObject, voxelGeometry } from "../src/core/avatar/avatar-render";

const MODELS = fileURLToPath(new URL("../../app/asset-sources/models", import.meta.url));
/** The Starknet field's prime: a felt252 holds any value below it. */
const FELT_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n;

const voxelsOf = (head: VoxelHead) => [...head.voxels()].map(([x, y, z, hex]) => `${x},${y},${z}:${hex}`).sort().join(" ");

describe("the avatar's format", () => {
  it("packs the version and a byte a part into 88 of a u128's bits, under a felt252", () => {
    expect(AVATAR_USED_BITS).toBe(88);
    expect(AVATAR_USED_BITS).toBeLessThanOrEqual(AVATAR_VALUE_BITS);
    const max = Object.fromEntries(AVATAR_PART_KEYS.map((p) => [p, AVATAR_PARTS[p].length - 1])) as Avatar;
    const value = encodeAvatar(max);
    expect(value < 1n << 88n).toBe(true);
    expect(value < FELT_PRIME).toBe(true);
    expect(encodeAvatar(DEFAULT_AVATAR)).toBe(1n);
  });

  it("lays the parts out in the stated order, a byte each above the version", () => {
    const avatar = { ...DEFAULT_AVATAR, skin: 2, hairColour: 3, background: 16 };
    expect(encodeAvatar(avatar)).toBe(1n | (2n << 8n) | (3n << 16n) | (16n << 80n));
    expect(avatarKey(avatar)).toBe(`0x${encodeAvatar(avatar).toString(16)}`);
  });

  it("decodes what it encodes", () => {
    const random = seededRandom(626);
    for (let i = 0; i < 200; i++) {
      const avatar = randomAvatar(random);
      expect(decodeAvatar(encodeAvatar(avatar))).toEqual(avatar);
    }
  });

  it("gives the default for no avatar (0), another version, a negative or a too wide value", () => {
    expect(decodeAvatar(0n)).toEqual(DEFAULT_AVATAR);
    expect(decodeAvatar(2n | (3n << 8n))).toEqual(DEFAULT_AVATAR);
    expect(decodeAvatar(-1n)).toEqual(DEFAULT_AVATAR);
    expect(decodeAvatar(1n | (1n << 130n))).toEqual(DEFAULT_AVATAR);
  });

  it("reads an id past a part's list (a newer client's variant) as that part's default, and keeps the others", () => {
    const value = 1n | (200n << 8n) | (2n << 16n);
    expect(decodeAvatar(value)).toEqual({ ...DEFAULT_AVATAR, skin: 0, hairColour: 2 });
  });

  it("refuses to encode an id the part does not have", () => {
    expect(() => encodeAvatar({ ...DEFAULT_AVATAR, eyes: AVATAR_PARTS.eyes.length })).toThrow(RangeError);
    expect(() => encodeAvatar({ ...DEFAULT_AVATAR, mouth: -1 })).toThrow(RangeError);
    expect(() => encodeAvatar({ ...DEFAULT_AVATAR, hair: 1.5 })).toThrow(RangeError);
  });

  it("draws every variant evenly and repeats a seed", () => {
    const a = Array.from({ length: 5 }, () => randomAvatar(seededRandom(7)));
    expect(new Set(a.map(avatarKey)).size).toBe(1);
    const seen = new Set<number>();
    const random = seededRandom(1);
    for (let i = 0; i < 500; i++) seen.add(randomAvatar(random).background);
    expect(seen.size).toBe(AVATAR_PARTS.background.length);
  });
});

describe("the avatar's parts", () => {
  it("paints as many variants as the format lists", () => {
    for (const [part, count] of Object.entries(PAINTED_VARIANTS)) expect(count, part).toBe(AVATAR_PARTS[part as AvatarPart].length);
    expect(BACKGROUND_COUNT).toBe(AVATAR_PARTS.background.length);
  });

  it("gives every variant of a part a look of its own, and the same avatar the same voxels", () => {
    const base: Avatar = { ...DEFAULT_AVATAR, skin: 1, hairColour: 2, eyebrows: 1 };
    for (const part of AVATAR_PART_KEYS) {
      if (part === "background") continue;
      const looks = AVATAR_PARTS[part].map((_, id) => voxelsOf(buildHead({ ...base, [part]: id })));
      expect(new Set(looks).size, part).toBe(looks.length);
    }
    expect(voxelsOf(buildHead(base))).toBe(voxelsOf(buildHead({ ...base })));
    const backgrounds = AVATAR_PARTS.background.map((_, id) => backgroundPixels(id).join());
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
    for (let id = 0; id < BACKGROUND_COUNT; id++) expect(backgroundPixels(id)).toHaveLength(BACKGROUND_GRID ** 2);
  });

  it("keeps the head a whole cube and every part close round it", () => {
    const random = seededRandom(31);
    for (let i = 0; i < 300; i++) {
      const head = buildHead(randomAvatar(random));
      for (let x = 0; x < HEAD; x++) for (let y = 0; y < HEAD; y++) for (let z = 0; z < HEAD; z++) expect(head.has(x, y, z)).toBe(true);
      for (const [x, y, z] of head.voxels()) {
        expect(x).toBeGreaterThanOrEqual(-3);
        expect(x).toBeLessThanOrEqual(HEAD + 2);
        expect(z).toBeGreaterThanOrEqual(-2);
        expect(z).toBeLessThanOrEqual(HEAD + 2);
        expect(y).toBeGreaterThanOrEqual(-4);
        expect(y).toBeLessThanOrEqual(HEAD + 9);
      }
    }
  });

  it("paints with the base tile models' palette: each colour is its entry's", () => {
    const glb = readFileSync(`${MODELS}/ccccccccc.glb`);
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
    const bin = glb.subarray(20 + glb.readUInt32LE(12) + 8);
    const view = json.bufferViews[json.images[0].bufferView];
    const { rgba } = decodePng(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    for (const [name, { entry, hex }] of Object.entries(AVATAR_PALETTE)) {
      const texel = (rgba[entry * 4] << 16) | (rgba[entry * 4 + 1] << 8) | rgba[entry * 4 + 2];
      expect(texel.toString(16).padStart(6, "0"), name).toBe(hex.toString(16).padStart(6, "0"));
    }
  });
});

describe("the grid look's face grids", () => {
  it("reads the surface under each pixel and the outermost voxel out of it", () => {
    const head = buildHead({ ...DEFAULT_AVATAR, accessory: 1 });
    const { surface, outer } = faceGrids(head, "front");
    expect(surface).toHaveLength(64);
    // Row 3 (the glasses' bar) stands one voxel out of the face.
    expect(outer[3 * 8]).toBe(head.get(0, 4, HEAD));
    expect(surface[4 * 8 + 1]).toBe(AVATAR_PALETTE.white.hex);
    for (const face of FACES) {
      const [x, y, z] = faceVoxel(face, 0, 0, 0);
      expect(VoxelHead.inHead(x, y, z), face).toBe(true);
      const [ox, oy, oz] = faceVoxel(face, 0, 0, 1);
      expect(VoxelHead.inHead(ox, oy, oz), face).toBe(false);
    }
  });
});

describe("the head's geometry", () => {
  it("draws only the faces no voxel covers", () => {
    const one = new VoxelHead();
    one.set(0, 0, 0, 0xffffff);
    expect(voxelGeometry(one).index?.count).toBe(6 * 6);
    one.set(1, 0, 0, 0xffffff);
    expect(voxelGeometry(one).index?.count).toBe(10 * 6);
  });

  it("is one draw in the voxel look and at most twelve in the grid look, and disposes what it made", () => {
    const voxel = buildAvatarObject(DEFAULT_AVATAR, "voxel");
    expect(voxel.draws).toBe(1);
    const grid = buildAvatarObject({ ...DEFAULT_AVATAR, headwear: 6 }, "grid");
    expect(grid.draws).toBeGreaterThan(6);
    expect(grid.draws).toBeLessThanOrEqual(12);
    voxel.dispose();
    grid.dispose();
    expect(voxel.object.children).toHaveLength(0);
    expect(grid.object.children).toHaveLength(0);
  });
});

describe("the menus' stills", () => {
  afterEach(() => vi.useRealTimers());

  function fakes() {
    const renderer = {
      domElement: {},
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      setClearColor: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
    };
    let images = 0;
    const ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    const stills = new AvatarStills({
      idleMs: 1_000,
      maxEntries: 3,
      createRenderer: () => renderer as unknown as WebGLRenderer,
      createCanvas: () => ({ getContext: () => ctx, toDataURL: () => `data:image/png;base64,${++images}` }) as unknown as HTMLCanvasElement,
    });
    return { stills, renderer, ctx };
  }

  it("renders an avatar once per size and look, then answers from the cache, on one context", () => {
    const { stills, renderer } = fakes();
    const a = stills.get(DEFAULT_AVATAR, { size: 40, pixelRatio: 2 });
    expect(stills.get(DEFAULT_AVATAR, { size: 40, pixelRatio: 2 })).toBe(a);
    expect(stills.peek(DEFAULT_AVATAR, { size: 40, pixelRatio: 2 })).toBe(a);
    expect(stills.get(DEFAULT_AVATAR, { size: 64, pixelRatio: 2 })).not.toBe(a);
    expect(stills.get(DEFAULT_AVATAR, { size: 40, pixelRatio: 2, style: "grid" })).not.toBe(a);
    expect(renderer.render).toHaveBeenCalledTimes(3);
    expect(renderer.setSize).toHaveBeenCalledWith(80, 80, false);
    expect(stills.stats()).toMatchObject({ renders: 3, hits: 1, contexts: 1 });
  });

  it("draws the background under the head unless asked not to", () => {
    const { stills, ctx } = fakes();
    stills.get(DEFAULT_AVATAR, { size: 40, pixelRatio: 1 });
    expect(ctx.fillRect).toHaveBeenCalledTimes(BACKGROUND_GRID ** 2);
    stills.get(DEFAULT_AVATAR, { size: 40, pixelRatio: 1, background: false });
    expect(ctx.fillRect).toHaveBeenCalledTimes(BACKGROUND_GRID ** 2);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  it("releases the context once no render came for idleMs, and makes a new one for the next", () => {
    vi.useFakeTimers();
    const { stills, renderer } = fakes();
    stills.get(DEFAULT_AVATAR, { size: 40, pixelRatio: 1 });
    expect(stills.live).toBe(true);
    vi.advanceTimersByTime(999);
    expect(stills.live).toBe(true);
    vi.advanceTimersByTime(1);
    expect(stills.live).toBe(false);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    stills.get(DEFAULT_AVATAR, { size: 40, pixelRatio: 1 });
    expect(stills.get(DEFAULT_AVATAR, { size: 64, pixelRatio: 1 })).toBeDefined();
    expect(stills.stats().contexts).toBe(2);
    stills.dispose();
    expect(stills.stats().cached).toBe(0);
  });

  it("keeps the most recently asked images, up to maxEntries", () => {
    const { stills } = fakes();
    const sizes = [10, 20, 30];
    for (const size of sizes) stills.get(DEFAULT_AVATAR, { size, pixelRatio: 1 });
    stills.get(DEFAULT_AVATAR, { size: 10, pixelRatio: 1 });
    stills.get(DEFAULT_AVATAR, { size: 40, pixelRatio: 1 });
    expect(stills.peek(DEFAULT_AVATAR, { size: 20, pixelRatio: 1 })).toBeUndefined();
    expect(stills.peek(DEFAULT_AVATAR, { size: 10, pixelRatio: 1 })).toBeDefined();
    expect(stills.stats().cached).toBe(3);
  });
});
