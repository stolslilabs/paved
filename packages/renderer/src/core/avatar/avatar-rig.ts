import {
  ACESFilmicToneMapping,
  NeutralToneMapping,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PCFSoftShadowMap,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SpotLight,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import type { Avatar } from "./avatar-format";
import { HEAD, VoxelHead, buildHead } from "./avatar-model";
import { ARM_W, HD, kingBust, type HdMouth } from "./avatar-hd";
import { hexOf, shade } from "./avatar-palette";

/**
 * AVATAR-LIVING (exploration, not wired): the avatar as a living bust. The head of `avatar-model.ts` on a Minecraft-proportioned
 * torso and two arms, each part its own mesh on a pivot (the hips, the neck, the shoulders), so procedural clips move it: an idle
 * that breathes, sways, blinks and now and then looks left and right, and emotes (wave, cheer, dance, think, sad, clap) that
 * blend in and out. The look is the stills' voxels with what they lack: ambient occlusion baked per vertex from every part at
 * rest, a warm key light that casts soft shadows (the head's on the shoulders, an arm's on the chest), a cool sky fill and a warm
 * rim light from behind, filmic tone mapping, and a faint per-voxel tint so the blocks read as painted, not flat.
 */

/** The torso's and the arms' size in voxels: Minecraft's 8 x 12 x 4 and 4 x 12 x 4 beside an 8 voxel head. */
const TORSO = { w: 8, h: 12, d: 4 };
const ARM = { w: 4, h: 12, d: 4 };

/** The outfits a bust may wear (the format has no part for it yet: the exploration derives it from the avatar). */
const OUTFITS = [
  { cloth: hexOf("navy"), trim: hexOf("gold") },
  { cloth: hexOf("pine"), trim: hexOf("straw") },
  { cloth: hexOf("brick"), trim: hexOf("amber") },
  { cloth: hexOf("violet"), trim: hexOf("gold") },
  { cloth: hexOf("sky"), trim: hexOf("white") },
  { cloth: hexOf("slate"), trim: hexOf("steel") },
] as const;
const LEATHER = 0x6b4428;

/** A small hash of a voxel's coordinates, in [0, 1). */
const hash = (x: number, y: number, z: number) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The parts of a bust, in the head's voxel space (x right, y up, z towards the viewer; the head is 0..7 on each axis). */
export interface BustParts {
  head: VoxelHead;
  torso: VoxelHead;
  armRight: VoxelHead;
  armLeft: VoxelHead;
}

/** The bust's voxels: the avatar's head, and a tunic with a strap and sleeves, skin hands, on Minecraft's proportions. */
export function buildBust(avatar: Avatar, mouth?: number): BustParts {
  const head = buildHead(mouth === undefined ? avatar : { ...avatar, mouth });
  const outfit = OUTFITS[(avatar.hairColour + avatar.background) % OUTFITS.length]!;
  const skin = head.get(0, 0, HEAD - 1) ?? hexOf("sand");
  const torso = new VoxelHead();
  const z0 = (HEAD - TORSO.d) / 2;
  for (let x = 0; x < TORSO.w; x++) {
    for (let y = -TORSO.h; y < 0; y++) {
      for (let z = z0; z < z0 + TORSO.d; z++) {
        let hex: number = outfit.cloth;
        const front = z === z0 + TORSO.d - 1;
        // A collar: the neck's skin in a V, its edge in the trim.
        if (front && y >= -2 && x >= 3 && x <= 4) hex = skin;
        else if (front && y === -3 && x >= 3 && x <= 4) hex = outfit.trim;
        else if (front && y === -1 && (x === 2 || x === 5)) hex = outfit.trim;
        // A strap from the left shoulder to the right hip, front and back; a belt.
        if (Math.abs(x - (7 + (y + 1) * 0.6)) < 0.9 && (front || z === z0) && !(hex === skin)) hex = LEATHER;
        if (y === -9) hex = LEATHER;
        if (y === -9 && x >= 3 && x <= 4 && front) hex = outfit.trim;
        torso.set(x, y, z, hex);
      }
    }
  }
  const arm = (x0: number): VoxelHead => {
    const cells = new VoxelHead();
    for (let x = x0; x < x0 + ARM.w; x++) {
      for (let y = -ARM.h; y < 0; y++) {
        for (let z = z0; z < z0 + ARM.d; z++) {
          // The sleeve to the elbow, its cuff in the trim, then the forearm and the hand.
          const hex = y >= -6 ? outfit.cloth : y === -7 ? outfit.trim : y >= -10 ? skin : shade(skin, 0.92);
          cells.set(x, y, z, hex);
        }
      }
    }
    return cells;
  };
  // The bust's right arm is on the viewer's left (x < 0): the character faces the viewer.
  return { head, torso, armRight: arm(-ARM.w), armLeft: arm(TORSO.w) };
}

/** Each direction's quad: the normal, its four corners in a unit cube (counter-clockwise from outside), and its two tangent axes. */
const QUADS: readonly { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

/** The light a vertex keeps from its occlusion level (3: open, 0: in a corner). */
const AO_LIGHT = [0.66, 0.78, 0.9, 1];

/**
 * One part's voxels as a geometry, shifted by `origin` (its pivot), each vertex's colour darkened by its ambient occlusion, read
 * from `solid` (every part's voxels at rest, so the neck darkens under the chin and the shoulders by the head), and tinted a little
 * per voxel. The quads whose occlusion runs across them are split along the other diagonal (no streaks).
 */
export function aoGeometry(cells: VoxelHead, solid: (x: number, y: number, z: number) => boolean, origin: [number, number, number]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  const uvs: number[] = [];
  const edges: number[] = [];
  const indices: number[] = [];
  const colour = new Color();
  for (const [x, y, z, hex] of cells.voxels()) {
    const tint = 0.975 + hash(x, y, z) * 0.05;
    for (const { n, c } of QUADS) {
      if (solid(x + n[0], y + n[1], z + n[2])) continue;
      const base = positions.length / 3;
      const ao: number[] = [];
      // Which of the quad's edges end its surface (no voxel beside it in its plane): only those are bevelled, so a plane of
      // blocks reads as one painted plane with its rim bevelled, not a grid. In the quad's own axes: u from corner 0 to 1, v
      // from corner 0 to 3.
      const u = c[1]!.map((v, i) => v - c[0]![i]!);
      const v = c[3]!.map((w, i) => w - c[0]![i]!);
      const open = (d: number[]) => (solid(x + d[0]!, y + d[1]!, z + d[2]!) ? 0 : 1);
      const mask = [open(u.map((a) => -a)), open(u), open(v.map((a) => -a)), open(v)];
      for (const [i, corner] of c.entries()) {
        uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
        edges.push(...mask);
        // The two sides and the corner beside this vertex, in the layer the face looks into.
        const off = corner.map((v, i) => (n[i] !== 0 ? n[i]! : v === 0 ? -1 : 1)) as [number, number, number];
        const axes = [0, 1, 2].filter((i) => n[i] === 0);
        const at = (dx: number, dy: number, dz: number) => solid(x + dx, y + dy, z + dz);
        const side = (i: number) => {
          const d: [number, number, number] = [n[0], n[1], n[2]];
          d[i] = off[i]!;
          return at(...d);
        };
        const s1 = side(axes[0]!);
        const s2 = side(axes[1]!);
        const k = at(...off);
        const level = s1 && s2 ? 0 : 3 - (Number(s1) + Number(s2) + Number(k));
        ao.push(level);
        colour.setHex(hex, SRGBColorSpace).multiplyScalar(tint * AO_LIGHT[level]!);
        positions.push(x + corner[0]! - origin[0], y + corner[1]! - origin[1], z + corner[2]! - origin[2]);
        normals.push(...n);
        colours.push(colour.r, colour.g, colour.b);
      }
      if (ao[0]! + ao[2]! < ao[1]! + ao[3]!) indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
  geometry.setAttribute("faceUv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("edgeMask", new Float32BufferAttribute(edges, 4));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * The voxels' material: Lambert with the vertex colours, and, with `bevel`, each block's face darkened towards its edges (the
 * blocks read one by one, as the painted targets show them), from the quad's own coordinates (`faceUv`).
 */
export function voxelMaterial(bevel: boolean): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true });
  if (!bevel) return material;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 faceUv;\nattribute vec4 edgeMask;\nvarying vec2 vFaceUv;\nvarying vec4 vEdge;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFaceUv = faceUv;\nvEdge = edgeMask;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFaceUv;\nvarying vec4 vEdge;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // The distance to the nearest edge that ends the surface (an inner edge counts as far).
        float edge = 1.0;
        edge = min(edge, mix(1.0, vFaceUv.x, vEdge.x));
        edge = min(edge, mix(1.0, 1.0 - vFaceUv.x, vEdge.y));
        edge = min(edge, mix(1.0, vFaceUv.y, vEdge.z));
        edge = min(edge, mix(1.0, 1.0 - vFaceUv.y, vEdge.w));
        float bevel = 1.0 - smoothstep(0.0, 0.11, edge);
        // A bevel catches the light on its rim, then turns away: a thin highlight outside a thin shade.
        diffuseColor.rgb *= 1.0 + bevel * (smoothstep(0.05, 0.0, edge) * 0.18 - 0.1);`,
      );
  };
  return material;
}

/** A pose: each pivot's rotation (radians) and the torso's lift (voxels); the mouth an emote shows (a mouth id), if any. */
export interface Pose {
  lift: number;
  torso: [number, number, number];
  head: [number, number, number];
  armRight: [number, number, number];
  armLeft: [number, number, number];
  mouth?: number;
}

export const REST: Pose = { lift: 0, torso: [0, 0, 0], head: [0, 0, 0], armRight: [0, 0, 0.06], armLeft: [0, 0, -0.06] };

export type Emote = "wave" | "cheer" | "dance" | "think" | "sad" | "clap";
export const EMOTES: readonly Emote[] = ["wave", "cheer", "dance", "think", "sad", "clap"];

/** Each emote's length in seconds (a loop's: the dance plays two). */
export const EMOTE_S: Record<Emote, number> = { wave: 2.4, cheer: 1.8, dance: 4, think: 2.6, sad: 2.6, clap: 2 };

/** The mouths the emotes show (`AVATAR_PARTS.mouth` ids): grin, open, frown. */
export const GRIN = 2;
export const OPEN = 3;
export const FROWN = 5;

/** In and out of an emote: 0 at its ends, 1 inside, eased over `edge` seconds. */
export const envelope = (t: number, length: number, edge = 0.3) => {
  const e = Math.min(1, t / edge, (length - t) / edge);
  return e <= 0 ? 0 : e * e * (3 - 2 * e);
};

/** The idle's pose at `t` seconds: breathing, a slow sway, the arms hanging and moving with the breath. */
export function idle(t: number): Pose {
  const breath = Math.sin(t * 2.1);
  return {
    lift: breath * 0.12,
    torso: [0, Math.sin(t * 0.45) * 0.05, Math.sin(t * 0.9) * 0.02],
    head: [Math.sin(t * 2.1 + 0.8) * 0.03, 0, Math.sin(t * 0.7) * 0.025],
    armRight: [Math.sin(t * 1.3) * 0.03, 0, 0.06 + breath * 0.02],
    armLeft: [Math.sin(t * 1.3 + 1) * 0.03, 0, -0.06 - breath * 0.02],
  };
}

/** An emote's pose at `t` seconds into it (before blending with the idle). */
export function emotePose(emote: Emote, t: number): Pose {
  const p: Pose = { ...REST, torso: [0, 0, 0], head: [0, 0, 0], armRight: [0, 0, 0.06], armLeft: [0, 0, -0.06] };
  switch (emote) {
    case "wave": {
      // The right hand up beside the head, waving from the elbow (the arm swings about its raised position).
      p.armRight = [0, 0, -2.55 + Math.sin(t * 11) * 0.32];
      // The head tilted away from the raised arm (towards it, its side's hair met the arm: the exploration's `clearance.ts`).
      p.head = [0, 0.18, -0.1];
      p.torso = [0, 0.08, 0.04];
      p.mouth = GRIN;
      break;
    }
    case "cheer": {
      const hop = Math.abs(Math.sin(t * 5.5));
      p.lift = hop * 1.4;
      p.armRight = [0, 0, -2.75 + hop * 0.2];
      p.armLeft = [0, 0, 2.75 - hop * 0.2];
      p.head = [-0.18, 0, 0];
      p.mouth = OPEN;
      break;
    }
    case "dance": {
      const beat = t * Math.PI * 2;
      p.lift = Math.abs(Math.sin(beat)) * 0.7;
      p.torso = [0, Math.sin(beat / 2) * 0.25, Math.sin(beat) * 0.12];
      p.head = [Math.abs(Math.sin(beat)) * -0.1, Math.sin(beat / 2) * 0.3, -Math.sin(beat) * 0.15];
      p.armRight = [Math.sin(beat) * 0.9, 0, -1.2 - Math.sin(beat) * 0.6];
      p.armLeft = [-Math.sin(beat) * 0.9, 0, 1.2 - Math.sin(beat) * 0.6];
      p.mouth = GRIN;
      break;
    }
    case "think": {
      // The right hand up to the chin, the eyes to the sky.
      // Raised forward to the chin's height (about x: up and forward), turned in towards the middle (about z, applied first).
      p.armRight = [-1.35, 0, 0.42];
      p.head = [-0.22, 0.28, 0.12 + Math.sin(t * 1.5) * 0.03];
      break;
    }
    case "sad": {
      p.lift = -0.35;
      p.head = [0.38, -0.1, 0.05];
      p.torso = [0.12, 0, 0];
      p.armRight = [0.1, 0, 0.02];
      p.armLeft = [0.1, 0, -0.02];
      p.mouth = FROWN;
      break;
    }
    case "clap": {
      // The arms forward, swung in (about z: a turn about y does nothing to an arm hanging down) till the hands meet in front of
      // the chest, then apart, nine times a second.
      // (raised to 1.15: at 1.3 the hands met right under the chin, in a long beard)
      const c = Math.abs(Math.sin(t * 9));
      p.armRight = [-1.15, 0, 0.44 - c * 0.24];
      p.armLeft = [-1.15, 0, -0.44 + c * 0.24];
      p.head = [-0.08, 0, 0];
      p.mouth = GRIN;
      break;
    }
  }
  return p;
}

const lerp3 = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

/** `a` towards `b` by `k`; the mouth `b`'s once past halfway. */
export function blend(a: Pose, b: Pose, k: number): Pose {
  return {
    lift: a.lift + (b.lift - a.lift) * k,
    torso: lerp3(a.torso, b.torso, k),
    head: lerp3(a.head, b.head, k),
    armRight: lerp3(a.armRight, b.armRight, k),
    armLeft: lerp3(a.armLeft, b.armLeft, k),
    mouth: k > 0.5 ? b.mouth : a.mouth,
  };
}

/** The idle's glances: a yaw the head turns to now and then (left or right), held a moment, then back to the front. */
export class Glances {
  private next: number;
  private target = 0;
  private until = 0;
  yaw = 0;
  /** `first`: the seconds before the first glance. */
  constructor(
    private readonly random: () => number,
    first = 2.5,
  ) {
    this.next = first;
  }
  update(t: number, dt: number): number {
    if (t >= this.next && this.target === 0) {
      this.target = (this.random() < 0.5 ? -1 : 1) * (0.38 + this.random() * 0.22);
      this.until = t + 0.9 + this.random() * 0.9;
    } else if (this.target !== 0 && t >= this.until) {
      this.target = 0;
      this.next = t + 3.5 + this.random() * 4.5;
    }
    // A quick, damped turn, as a head does.
    this.yaw += (this.target - this.yaw) * (1 - Math.exp(-dt * 7));
    return this.yaw;
  }
}

export interface LivingAvatarOptions {
  /** Device px per CSS px; the device's own by default, at most 2. */
  pixelRatio?: number;
  /** The bust's turn (radians): a three-quarter view by default. */
  yaw?: number;
  /** Soft shadows from the key light (the head's on the shoulders). */
  shadows?: boolean;
  /** Tests and stories: the random the glances draw from. */
  random?: () => number;
  /** The bust: the catalogue's (the avatar's parts, 8 voxel head) or the HD king (16 voxel head, the render target's). */
  model?: "catalogue" | "hd-king";
  /** The lighting: "v1" a sun key; "v2" a close spot key (a gradient across flat faces, a perspective shadow) and bevelled blocks. */
  look?: "v1" | "v2";
  /** The HD king's face as 16 x 16 colours (rows from the top): a painted face over the drawn one. */
  face?: readonly number[];
}

/** Each pivot in the head's voxel space: the hips, the neck (the head's bottom middle), the shoulders. */
const PIVOT = {
  torso: [TORSO.w / 2, -TORSO.h, HEAD / 2] as [number, number, number],
  head: [HEAD / 2, 0, HEAD / 2] as [number, number, number],
  armRight: [-ARM.w / 2, -2, HEAD / 2] as [number, number, number],
  armLeft: [TORSO.w + ARM.w / 2, -2, HEAD / 2] as [number, number, number],
};

type Pivots = Record<keyof typeof PIVOT, [number, number, number]>;

/** A bust's model: its parts (a mouth's version for an emote), pivots and lids in its voxels, and its voxel's size in the scene. */
interface BustModel {
  parts(mouth?: number): BustParts;
  pivots: Pivots;
  scale: number;
  /** The eyelids, as rectangles on the face (centre x, y, width, height) and the face's z (its front). */
  lids: { x: number; y: number; w: number; h: number }[];
  face: number;
  /** A skin voxel, for the lids' colour. */
  skinAt: [number, number, number];
  /** The framing: half the height shown (scene units), where the camera aims, and the bust's turn. */
  frame: { half: number; targetY: number; yaw: number };
}

const catalogueModel = (avatar: Avatar): BustModel => ({
  parts: (mouth) => buildBust(avatar, mouth),
  pivots: PIVOT,
  scale: 1,
  lids: [{ x: HEAD / 2, y: 3, w: HEAD - 2, h: 2 }],
  face: HEAD,
  skinAt: [0, 0, HEAD - 1],
  frame: { half: 12, targetY: 2, yaw: -0.62 },
});

/** The HD king's pivots: the catalogue's at twice the resolution. */
const HD_PIVOT: Pivots = { torso: [HD / 2, -24, HD / 2], head: [HD / 2, 0, HD / 2], armRight: [-ARM_W / 2, -3, HD / 2], armLeft: [HD + ARM_W / 2, -3, HD / 2] };
const HD_MOUTHS: Record<number, HdMouth> = { 2: "grin", 3: "open", 5: "frown" };

const hdKingModel = (face?: readonly number[]): BustModel => ({
  parts: (mouth) => kingBust(mouth === undefined ? "closed" : (HD_MOUTHS[mouth] ?? "closed"), face),
  pivots: HD_PIVOT,
  scale: 0.5,
  lids: [
    { x: 4.5, y: 10.5, w: 3, h: 3 },
    { x: 11.5, y: 10.5, w: 3, h: 3 },
  ],
  face: HD,
  skinAt: [7, 13, HD - 1],
  // Closer than the catalogue's, the head larger in the circle and turned less, as the target frames it.
  frame: { half: 11.6, targetY: 2.4, yaw: 0.3 },
});

/**
 * A living bust in a canvas filling `container`: one WebGL context, a frame each animation frame while shown (off under reduced
 * motion: the rest pose, drawn once). `play(emote)` blends an emote in over the idle and back. `dispose` releases the context.
 */
export class LivingAvatar {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-10, 10, 10, -10, 1, 200);
  private readonly root = new Group();
  private readonly pivots: Record<keyof typeof PIVOT, Group>;
  private readonly heads = new Map<number | undefined, Mesh>();
  private readonly lids = new Group();
  private readonly lidMaterial = new MeshLambertMaterial({ color: 0xffffff });
  private model: BustModel;
  private readonly owned: { dispose(): void }[] = [];
  private readonly glances: Glances;
  private readonly reduced: boolean;
  private emote: { name: Emote; start: number } | null = null;
  private shownMouth: number | undefined = undefined;
  private frame = 0;
  private start = performance.now();
  private last = 0;
  private nextBlink = 3.5;
  private disposed = false;
  /** The last frame's milliseconds (the render alone), and frames drawn. */
  frameMs = 0;
  frames = 0;

  constructor(
    private readonly container: HTMLElement,
    private avatar: Avatar,
    private readonly options: LivingAvatarOptions = {},
  ) {
    const random = options.random ?? Math.random;
    this.glances = new Glances(random);
    this.reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%";
    container.appendChild(this.canvas);
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, options.pixelRatio ?? window.devicePixelRatio ?? 1));
    this.renderer.setClearColor(0x000000, 0);
    // v2: Khronos's neutral curve, which keeps the hues and the saturation ACES washes out of the skin and the cloth.
    this.renderer.toneMapping = options.look === "v2" ? NeutralToneMapping : ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = options.look === "v2" ? 0.95 : 1.05;
    this.renderer.outputColorSpace = SRGBColorSpace;
    if (options.shadows !== false) {
      this.renderer.shadowMap.enabled = true;
      // v2: PCF with a radius: soft edges, as a large light casts.
      this.renderer.shadowMap.type = options.look === "v2" ? PCFShadowMap : PCFSoftShadowMap;
    }
    this.model = options.model === "hd-king" ? hdKingModel(options.face) : catalogueModel(avatar);
    // The lights: a cool sky over a warm ground, a warm key from the top left that casts the shadows, a warm rim from behind.
    const v2 = options.look === "v2";
    this.scene.add(new HemisphereLight(v2 ? 0xb9d6ee : 0xe8eeff, 0x86684c, v2 ? 1.45 : 1.7));
    if (v2) {
      // A close spot: its light falls off across the face (lit at the upper left, darker to the lower right), as a painter shades.
      // A key three times the fill, 45 degrees above, on the side the face turns to (the HD bust turns right: the key is right of
      // the camera, so the face is the brightest plane and the head's far side a half tone, as in the target).
      const key = new SpotLight(0xffe0ae, 175, 0, 0.6, 1, 1);
      const side = (this.options.yaw ?? (this.options.model === "hd-king" ? 0.3 : -0.62)) > 0 ? 1 : -1;
      key.position.set(14 * side, 28, 25);
      key.target.position.set(0, 2, 0);
      this.scene.add(key.target);
      key.castShadow = options.shadows !== false;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.radius = 3;
      // Soft shadows: the crown's and the fringe's on the face stay a shade, as under a large light, never a dark band.
      key.shadow.intensity = 0.5;
      key.shadow.blurSamples = 12;
      key.shadow.bias = -0.0006;
      key.shadow.normalBias = 0.03;
      key.shadow.camera.near = 10;
      key.shadow.camera.far = 80;
      this.scene.add(key);
    } else {
      const key = new DirectionalLight(0xffe0b0, 2.2);
      key.position.set(-8, 14, 12);
      key.castShadow = options.shadows !== false;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = key.shadow.camera.bottom = -14;
      key.shadow.camera.right = key.shadow.camera.top = 14;
      key.shadow.radius = 6;
      key.shadow.blurSamples = 12;
      key.shadow.bias = -0.0008;
      key.shadow.normalBias = 0.04;
      this.scene.add(key);
    }
    const rim = new DirectionalLight(0xffc98a, v2 ? 0.9 : 2.2);
    // Behind, on the side away from the key.
    rim.position.set(v2 && (this.options.yaw ?? (this.options.model === "hd-king" ? 0.3 : -0.62)) > 0 ? -10 : 10, 6, -12);
    this.scene.add(rim);
    this.scene.add(this.root);
    this.root.rotation.y = options.yaw ?? this.model.frame.yaw;
    this.pivots = { torso: new Group(), head: new Group(), armRight: new Group(), armLeft: new Group() };
    this.root.add(this.pivots.torso);
    for (const part of ["head", "armRight", "armLeft"] as const) this.pivots.torso.add(this.pivots[part]);
    this.lids.visible = false;
    this.owned.push(this.lidMaterial);
    this.build();
    const { targetY } = this.model.frame;
    const pitch = this.options.model === "hd-king" ? 0.06 : 0.16;
    this.camera.position.set(0, targetY + Math.sin(pitch) * 60, Math.cos(pitch) * 60);
    this.camera.lookAt(0, targetY, 0);
    this.resize();
    this.request();
  }

  setAvatar(avatar: Avatar): void {
    this.avatar = avatar;
    if (this.options.model !== "hd-king") this.model = catalogueModel(avatar);
    this.build();
    this.request();
  }

  /** Blends an emote in over the idle (one at a time: a new one replaces the one playing). */
  play(emote: Emote): void {
    this.emote = { name: emote, start: this.now() };
    this.request();
  }

  get playing(): Emote | null {
    return this.emote?.name ?? null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.clearParts();
    for (const item of this.owned) item.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private now() {
    return (performance.now() - this.start) / 1000;
  }

  private clearParts() {
    for (const pivot of Object.values(this.pivots)) {
      for (const child of [...pivot.children]) {
        if (child instanceof Mesh) {
          child.geometry.dispose();
          (child.material as MeshLambertMaterial).dispose();
          pivot.remove(child);
        }
      }
    }
    for (const mesh of this.heads.values()) mesh.geometry.dispose();
    this.heads.clear();
    for (const lid of [...this.lids.children]) {
      (lid as Mesh).geometry.dispose();
      this.lids.remove(lid);
    }
  }

  /** Builds the parts' meshes, the head once per mouth an emote shows, and the eyelids. */
  private build() {
    this.clearParts();
    const model = this.model;
    const P = model.pivots;
    const rest = model.parts();
    const all = [rest.head, rest.torso, rest.armRight, rest.armLeft];
    const solid = (x: number, y: number, z: number) => all.some((p) => p.has(x, y, z));
    const bevel = this.options.look === "v2";
    const place = (part: keyof typeof PIVOT, cells: VoxelHead) => {
      const mesh = new Mesh(aoGeometry(cells, solid, P[part]), voxelMaterial(bevel));
      mesh.castShadow = mesh.receiveShadow = true;
      this.pivots[part].add(mesh);
      return mesh;
    };
    this.root.scale.setScalar(model.scale);
    // Each pivot sits where its part joins its parent.
    this.pivots.torso.position.set(0, P.torso[1] - P.head[1], 0);
    this.pivots.head.position.set(P.head[0] - P.torso[0], P.head[1] - P.torso[1], 0);
    this.pivots.armRight.position.set(P.armRight[0] - P.torso[0], P.armRight[1] - P.torso[1], 0);
    this.pivots.armLeft.position.set(P.armLeft[0] - P.torso[0], P.armLeft[1] - P.torso[1], 0);
    place("torso", rest.torso);
    place("armRight", rest.armRight);
    place("armLeft", rest.armLeft);
    const own = place("head", rest.head);
    this.heads.set(undefined, own);
    for (const mouth of [GRIN, OPEN, FROWN]) {
      if (this.options.model !== "hd-king" && mouth === this.avatar.mouth) continue;
      const mesh = new Mesh(aoGeometry(model.parts(mouth).head, solid, P.head), own.material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.visible = false;
      this.pivots.head.add(mesh);
      this.heads.set(mouth, mesh);
    }
    this.shownMouth = undefined;
    // The eyelids: the skin's shade over the eyes, just in front of the face, shown for a blink.
    const skin = rest.head.get(...model.skinAt) ?? 0xdfcfa3;
    this.lidMaterial.color.setHex(shade(skin, 0.88), SRGBColorSpace);
    for (const lid of model.lids) {
      const mesh = new Mesh(new PlaneGeometry(lid.w, lid.h), this.lidMaterial);
      mesh.position.set(lid.x - P.head[0], lid.y - P.head[1], model.face - P.head[2] + 0.02);
      this.lids.add(mesh);
    }
    this.pivots.head.add(this.lids);
    void ShadowMaterial;
    void BufferGeometry;
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const half = this.model.frame.half;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  private request() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(this.tick);
  }

  private pose(t: number, dt: number): Pose {
    let pose = idle(t);
    const yaw = this.glances.update(t, dt);
    pose.head = [pose.head[0], pose.head[1] + yaw, pose.head[2]];
    if (this.emote) {
      const into = t - this.emote.start;
      const length = EMOTE_S[this.emote.name];
      if (into >= length) this.emote = null;
      else {
        const target = emotePose(this.emote.name, into);
        // The emote's moves ride on the idle's breathing.
        const k = envelope(into, length);
        pose = blend(pose, { ...target, lift: target.lift + pose.lift * 0.5 }, k);
      }
    }
    return pose;
  }

  private apply(pose: Pose) {
    const { torso, head, armRight, armLeft } = this.pivots;
    const P = this.model.pivots;
    // The lift is in the catalogue's voxels: the HD model's are half as large.
    torso.position.y = P.torso[1] - P.head[1] + pose.lift / this.model.scale;
    torso.rotation.set(...pose.torso);
    head.rotation.set(...pose.head);
    armRight.rotation.set(...pose.armRight);
    armLeft.rotation.set(...pose.armLeft);
    if (pose.mouth !== this.shownMouth) {
      for (const [mouth, mesh] of this.heads) mesh.visible = mouth === (this.heads.has(pose.mouth) ? pose.mouth : undefined);
      this.shownMouth = pose.mouth;
    }
  }

  private readonly tick = () => {
    this.frame = 0;
    const t = this.now();
    const dt = Math.min(0.1, t - this.last);
    this.last = t;
    if (this.reduced) this.apply(REST);
    else {
      this.apply(this.pose(t, dt));
      // A blink every few seconds, a tenth of a second long.
      if (t >= this.nextBlink) {
        this.lids.visible = true;
        if (t >= this.nextBlink + 0.11) {
          this.lids.visible = false;
          this.nextBlink = t + 2.5 + Math.random() * 3;
        }
      }
    }
    const start = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.frameMs = performance.now() - start;
    this.frames++;
    if (!this.reduced) this.request();
  };
}
