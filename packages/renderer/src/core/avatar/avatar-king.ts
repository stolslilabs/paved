import {
  CanvasTexture,
  Color,
  DataTexture,
  DirectionalLight,
  Euler,
  Group,
  HalfFloatType,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  NoToneMapping,
  PerspectiveCamera,
  VSMShadowMap,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  WebGLRenderTarget,
  Vector3,
  type Material,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { cuboidGeometry, type Cuboid } from "./avatar-boxes";
import { HEAD } from "./avatar-model";
import { bodyCuboids, C, families, headCuboids, headFaces, headPalette, KING_TRAITS, outfitTones, trackLimits, type TrackLimits, type Traits } from "./avatar-traits";

export { KING_TRAITS, TRAIT_OPTIONS, traitsFrom, traitsText, type Traits } from "./avatar-traits";
import { blend, EMOTE_S, envelope, emotePose, FROWN, Glances, GRIN, idle, OPEN, REST, type Emote, type Pose } from "./avatar-rig";

/**
 * AVATAR-LIVING (exploration, v4): the king as the Codex target builds him, measured on it: a head cube painted on its six faces
 * at 8 x 8 (its front: hair, thick brows, a white and a dark pixel an eye, the moustache over a light mouth, the beard), hair in
 * upright stepped blocks just proud of the skull, a crown of five points round a ruby set in a socket, chunky gold pauldrons, a
 * blue tunic with a strap over the shoulder and one across with a large buckle. The colours are the target's (sampled). Every
 * face is a mosaic of three tones a unit wide, its top edge lit and its lower edge shaded in a crisp line; the image is
 * multisampled before the ambient occlusion, the backdrop blurred behind the bust.
 */

/**
 * The material of the cuboids and of the painted boxes (the head, the tunic, the sleeves): untextured, each unit a tile a little
 * darker, as is or lighter (by the cuboid's `grain`); every face's top edge lit and its lower edge shaded in a crisp line (a side's;
 * a top's edges all lit), so the blocks read one by one as in the target. `textured`: a painted box (its tiles are its texture's).
 */
function blockMaterial(textured = false): MeshLambertMaterial {
  const material = new MeshLambertMaterial(textured ? {} : { vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec2 faceSize;\nattribute float seed;\nattribute float faceKind;\nattribute float grain;\nvarying vec2 vFaceUv;\nvarying vec2 vFaceSize;\nvarying float vSeed;\nvarying float vKind;\nvarying float vGrain;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFaceUv = uv;\nvFaceSize = faceSize;\nvSeed = seed;\nvKind = faceKind;\nvGrain = grain;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vFaceUv;
varying vec2 vFaceSize;
varying float vSeed;
varying float vKind;
varying float vGrain;
// A tile's hash: its cell and its box's seed, both rounded to whole numbers first, so the value is the same at every pixel of the
// tile (an interpolated seed differs a little from pixel to pixel, and the hash turned that into a dotted noise).
float texelHash(vec2 cell) {
  vec2 p = cell + floor(vSeed * 97.0 + 0.5) * vec2(7.0, 13.0);
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}`,
      )
      .replace(
        textured ? "#include <map_fragment>" : "#include <color_fragment>",
        `${textured ? "#include <map_fragment>" : "#include <color_fragment>"}
        vec2 units = vFaceUv * vFaceSize;
        ${textured ? "" : "float h = texelHash(floor(units + 0.001)); diffuseColor.rgb *= h < 0.25 ? 1.0 - vGrain : h < 0.75 ? 1.0 : 1.0 + vGrain;"}
        float w = 0.075;
        if (vKind < 0.5) {
          if (units.y > vFaceSize.y - w) diffuseColor.rgb *= 1.22;
          else if (units.y < w) diffuseColor.rgb *= 0.78;
          else if (units.x < w || units.x > vFaceSize.x - w) diffuseColor.rgb *= 0.92;
        } else if (vKind < 1.5) {
          diffuseColor.rgb *= 1.1;
          if (min(min(units.x, vFaceSize.x - units.x), min(units.y, vFaceSize.y - units.y)) < w) diffuseColor.rgb *= 1.12;
        }`,
      );
  };
  return material;
}

/** An 8 x 8 texture of colours in rows from the top, nearest-filtered. */
function paint(pixels: readonly number[], width = Math.round(Math.sqrt(pixels.length))): DataTexture {
  const height = pixels.length / width;
  const data = new Uint8Array(width * height * 4);
  pixels.forEach((hex, i) => {
    const at = ((height - 1 - Math.floor(i / width)) * width + (i % width)) * 4;
    data.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], at);
  });
  const texture = new DataTexture(data, width, height, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** A hash of a tile's place, in [0, 1). */
const tileHash = (a: number, b: number, salt: number) => {
  let h = Math.imul(a * 73856093 ^ b * 19349663 ^ salt * 83492791, 1274126177);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

/** A face's tiles, `w` x `h` (rows from the top), each a tone of `tones` picked by place; `at` overrides a tile. */
function tilesOf(w: number, h: number, tones: readonly number[], salt: number, at?: (x: number, y: number) => number | undefined): number[] {
  return Array.from({ length: w * h }, (_, i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    return at?.(x, y) ?? tones[Math.floor(tileHash(x, y, salt) * tones.length)]!;
  });
}

/** A painted box: a cuboid and its six faces' tiles (three's order: right, left, top, bottom, front, back) and their widths. */
interface PaintedBox {
  box: Cuboid;
  faces: { tiles: number[]; width: number }[];
}

/** A box `size` units painted with `tones` on every face, a tile a unit (`front` overrides the front's tiles). */
function painted(box: Cuboid, tones: readonly number[], salt: number, front?: (x: number, y: number) => number | undefined): PaintedBox {
  const [w, h, d] = box.size.map((v) => Math.max(1, Math.round(v)));
  const face = (fw: number, fh: number, k: number, at?: (x: number, y: number) => number | undefined) => ({ tiles: tilesOf(fw, fh, tones, salt * 7 + k, at), width: fw });
  return { box, faces: [face(d!, h!, 1), face(d!, h!, 2), face(w!, d!, 3), face(w!, d!, 4), face(w!, h!, 5, front), face(w!, h!, 6)] };
}

/** The tunic (8 x 12 x 4, z 2..6): the outfit's tiles, a square neckline of skin framed by a dark collar, the head's shade on top. */
export function kingV4Tunic(tones = outfitTones(KING_TRAITS)): PaintedBox {
  return painted({ from: [0, -12, 2], size: [8, 12, 4], colour: 0xffffff, inflate: 0 }, tones.tunic, 1, (x, y) => {
    if (y <= 1 && x >= 3 && x <= 4) return tones.skin[(x + y) % 2];
    if ((y <= 2 && (x === 2 || x === 5)) || (y === 2 && x >= 3 && x <= 4)) return tones.collar;
    if (y <= 3) return tones.shaded[Math.floor(tileHash(x, y, 9) * tones.shaded.length)];
    return undefined;
  });
}

const LEATHERS = [0x7a3f22, 0x86462a, 0x6e391e, 0x8e4f2b, 0x74401f];

/**
 * The diagonal strap as the target draws it: a staircase of leather blocks from the viewer's right shoulder by the neck (u 6.9,
 * 1.2 down) to the left hip (u 1, 7.2 down), two blocks across, each its own tone; the ring buckle on it at u 4.5, 4.6 down.
 */
export function kingV5Strap(): Cuboid[] {
  const out: Cuboid[] = [];
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    const u = 6.9 - (i * 5.9) / (steps - 1);
    const v = -1.2 - (i * 6.0) / (steps - 1);
    out.push({ from: [u - 1.0, v - 1.0, 6.05], size: [1.1, 1.05, 0.45], colour: LEATHERS[(i * 2) % 5]!, grain: 0.05, name: `strap-${i}-a` });
    // (set back from the dark block's front, so their fronts never meet in one plane)
    out.push({ from: [u - 0.1, v - 0.6, 6.08], size: [0.9, 0.95, 0.32], colour: LEATHERS[(i * 2 + 3) % 5]!, grain: 0.05, name: `strap-${i}-b` });
  }
  const centre: [number, number, number] = [4.5, -4.6, 6.6];
  const ring = 2.5;
  const bar = 0.65;
  for (const [dx, dy, w, h, c] of [
    // The buckle's gold, more orange than the crown's (measured: the target's #eb942c).
    [-ring / 2, ring / 2 - bar, ring, bar, 0xf2a53a],
    [-ring / 2, -ring / 2, ring, bar, 0xe0912c],
    [-ring / 2, -ring / 2 + bar, bar, ring - 2 * bar, 0xf2a53a],
    [ring / 2 - bar, -ring / 2 + bar, bar, ring - 2 * bar, 0xe0912c],
  ] as const) {
    out.push({ from: [centre[0] + dx, centre[1] + dy, 6.5], size: [w, h, 0.55], rotation: [0, 0, 45], pivot: centre, colour: c, grain: 0.06, name: `buckle-${out.length}` });
  }
  out.push({ from: [centre[0] - 0.62, centre[1] - 0.62, 6.35], size: [1.24, 1.24, 0.35], rotation: [0, 0, 45], pivot: centre, colour: C.leatherDark, name: "buckle-leather" });
  return out;
}

export const PIVOTS = {
  torso: [4, -12, 4] as [number, number, number],
  head: [4, 0, 4] as [number, number, number],
  armRight: [-2, -2, 4] as [number, number, number],
  armLeft: [10, -2, 4] as [number, number, number],
  // The pauldrons turn about the shoulder joint as the arms do, but are the torso's: they follow an arm's raise in part.
  pauldronRight: [-2, -2, 4] as [number, number, number],
  pauldronLeft: [10, -2, 4] as [number, number, number],
};

/** Each part's inflate salt (`inflateOf`): parts that touch never give their cuboids one inflate. */
export const PART_SALT: Record<keyof typeof PIVOTS, number> = { torso: 0, head: 13, armRight: 29, armLeft: 29, pauldronRight: 53, pauldronLeft: 53 };

/** How much of an arm's movement its pauldron follows (it rides up on the shoulder, never swings round with the arm). */
export const PAULDRON_FOLLOW = 0.35;

/**
 * The view, fitted to the target (by the exploration's calibration script, not committed): its head's six corners within 11 px
 * rms of the target's. The camera below the head looking up 21 degrees, a long lens; the head a tenth larger than the body's
 * proportion and 5 % taller than wide. `torso`, `roll`, `shift`: the torso turned, leaned, shifted under the head (turned and moved back to its place).
 */
export const KING_VIEW = { yaw: 0.532, pitch: -0.362, target: 5.05, distance: 123.6, fov: 11.92, head: 1.1, stretch: 1.053, pan: 0.766, torso: -0.1, arms: 0, spread: 0.25, roll: 0, shift: 0 };
export type KingView = typeof KING_VIEW;

/** The bust's parts as a hierarchy of pivots: the root (the bust's turn), the torso, and on it the head, the arms, the pauldrons. */
export interface KingRig {
  root: Group;
  pivots: Record<keyof typeof PIVOTS, Group>;
}

/** A rig with its pivots where the model's are (each part's cuboids are drawn about its pivot). */
export function makeRig(): KingRig {
  const root = new Group();
  const pivots = { torso: new Group(), head: new Group(), armRight: new Group(), armLeft: new Group(), pauldronRight: new Group(), pauldronLeft: new Group() };
  root.add(pivots.torso);
  for (const part of ["head", "armRight", "armLeft", "pauldronRight", "pauldronLeft"] as const) pivots.torso.add(pivots[part]);
  const P = PIVOTS;
  pivots.torso.position.set(0, P.torso[1] - P.head[1], 0);
  pivots.head.position.set(P.head[0] - P.torso[0], P.head[1] - P.torso[1], 0);
  pivots.armRight.position.set(P.armRight[0] - P.torso[0], P.armRight[1] - P.torso[1], 0);
  pivots.armLeft.position.set(P.armLeft[0] - P.torso[0], P.armLeft[1] - P.torso[1], 0);
  pivots.pauldronRight.position.copy(pivots.armRight.position);
  pivots.pauldronLeft.position.copy(pivots.armLeft.position);
  return { root, pivots };
}

/**
 * Puts a pose on the rig as a frame draws it: the torso lifted, turned by `view.torso` against the bust's turn (`lead`: 0 when
 * the bust faces the camera), leaned and shifted under the head, which is turned and moved back to its calibrated place; the
 * arms a little away from the body (less in an emote: `emoteWeight`); the pauldrons following a part of the arms' movement.
 */
export function poseRig({ pivots }: KingRig, pose: Pose, view: KingView, lead: number, emoteWeight: number): void {
  const P = PIVOTS;
  pivots.torso.position.y = P.torso[1] - P.head[1] + pose.lift;
  const { torso, arms, roll, shift } = view;
  const spread = view.spread * (1 - emoteWeight);
  pivots.torso.rotation.set(pose.torso[0], pose.torso[1] + torso * lead, pose.torso[2] + roll * lead);
  pivots.torso.position.x = shift * lead;
  pivots.head.position.x = P.head[0] - P.torso[0] - shift * lead;
  pivots.head.rotation.set(pose.head[0], pose.head[1] + (0.02 - torso) * lead, pose.head[2] - roll * lead);
  pivots.head.scale.set(view.head, view.head * view.stretch, view.head);
  pivots.armRight.rotation.set(pose.armRight[0] + arms, pose.armRight[1], pose.armRight[2] - spread);
  pivots.armLeft.rotation.set(pose.armLeft[0] + arms, pose.armLeft[1], pose.armLeft[2] + spread);
  // The pauldrons: at rest as the arms, then a part of the arms' movement from rest (they ride up as an arm rises).
  const follow = (arm: Group, rest: [number, number, number], pauldron: Group) =>
    pauldron.rotation.set(
      rest[0] + (arm.rotation.x - rest[0]) * PAULDRON_FOLLOW,
      rest[1] + (arm.rotation.y - rest[1]) * PAULDRON_FOLLOW,
      rest[2] + (arm.rotation.z - rest[2]) * PAULDRON_FOLLOW,
    );
  follow(pivots.armRight, [REST.armRight[0] + arms, REST.armRight[1], REST.armRight[2] - view.spread], pivots.pauldronRight);
  follow(pivots.armLeft, [REST.armLeft[0] + arms, REST.armLeft[1], REST.armLeft[2] + view.spread], pivots.pauldronLeft);
  liftHead({ root: pivots.torso.parent as Group, pivots });
}

/**
 * The head's foot over the shoulders: its underside's side edges where the pauldrons and the arms' tops are under them (the
 * shoulders span z 1.8 to 6.7, the head's own units from its pivot -2 to 2.5), the side beard's included. The head is wider than
 * the shoulders and overhangs them: tilted (a roll above all), an edge would sink into a pauldron. Its front and back corners
 * are clear of them (over the chest, behind the back).
 */
const FOOT = [
  [-4.3, 0, -2],
  [-4.3, 0, 2.5],
  [4.3, 0, -2],
  [4.3, 0, 2.5],
].map(([x, y, z]) => new Vector3(x, y, z));
const footPoint = new Vector3();

/**
 * Lifts the head on its neck by as much as its foot over the shoulders went down from rest (a turn about the vertical moves none),
 * so a tilt never sinks it into them; the neck runs up inside the head, no gap shows. Called once the head's turn is set.
 */
export function liftHead({ pivots }: KingRig): void {
  const head = pivots.head;
  let low = 0;
  for (const corner of FOOT) low = Math.min(low, footPoint.copy(corner).multiply(head.scale).applyQuaternion(head.quaternion).y);
  head.position.y = PIVOTS.head[1] - PIVOTS.torso[1] - low;
}

const AIM = { now: new Quaternion(), parent: new Quaternion(), rest: new Quaternion(), aim: new Quaternion(), euler: new Euler() };

/**
 * Turns the head to `yaw` and `pitch` from the camera's axis (radians; 0, 0 the head's rest), by `w` (0: the pose's own head),
 * the torso taking `TRACK.torso` of the turn. The aim is set in the camera's frame (yaw about the vertical, then pitch about the
 * head's own across axis), not added to its angles in the torso's turned frame, where a pitch also rolls the head; the pose's own
 * motion from rest (read before the torso takes its share) rides on top.
 */
export function aimHead({ root, pivots }: KingRig, view: KingView, yaw: number, pitch: number, w: number): void {
  const restYaw = view.yaw + 0.02;
  const head = pivots.head;
  root.updateMatrixWorld(true);
  const now = head.getWorldQuaternion(AIM.now);
  const motion = AIM.rest.setFromEuler(AIM.euler.set(0, restYaw, 0, "YXZ")).invert().multiply(now);
  const aim = AIM.aim.setFromEuler(AIM.euler.set(pitch, yaw, 0, "YXZ")).multiply(motion);
  head.getWorldQuaternion(now).slerp(aim, w);
  pivots.torso.rotation.y += (yaw - restYaw) * w * TRACK.torso;
  pivots.torso.updateMatrixWorld(true);
  const parent = head.parent!.getWorldQuaternion(AIM.parent);
  head.quaternion.copy(parent.invert().multiply(now));
  liftHead({ root, pivots });
}

/** The king's parts for the traits (the king's own by default), each a list of cuboids in the model's units (the checks read them). */
export function kingParts(traits: Traits = KING_TRAITS): Record<keyof typeof PIVOTS, Cuboid[]> {
  // The body from Codex's decomposition of the target (`avatar-king-body.ts`), but for what the target measures otherwise: the
  // tunic's tiles a unit (not two), the diagonal strap a staircase of blocks from the shoulder by the neck, the buckle higher.
  return { head: headCuboids(traits), ...bodyCuboids(traits, kingV5Strap()) };
}

/** The painted boxes, whose faces count in the checks too: the tunic (the torso's) and the head cube. */
export const kingPaintedBoxes = (): { part: keyof typeof PIVOTS; box: Cuboid }[] => [
  { part: "torso", box: kingV4Tunic().box },
  { part: "head", box: { from: [0, 0, 0], size: [HEAD, HEAD, HEAD], colour: 0xffffff, inflate: 0, name: "head-cube" } },
];

export interface KingAvatarOptions {
  /** The backdrop, blurred behind the bust (a CSS blur of `blur` px at the canvas's size). */
  backdrop?: string;
  blur?: number;
  pixelRatio?: number;
  random?: () => number;
  /** Tests and comparisons: the rest pose, no idle, no blink. */
  still?: boolean;
  /** The bust's turn in radians (a three-quarter view by default; 0 faces the camera). */
  yaw?: number;
  /** Checks: the eyes kept shut (the lids shown). */
  eyesShut?: boolean;
  /** The eyes' white as painted (its rendered tone is checked against the target's). */
  eyeWhite?: number;
  /** Checks: the key's and the fill's intensities. */
  light?: { key?: number; fill?: number };
  /**
   * The head follows the mouse's cursor (on by default): only where the device has one (`hover: hover` and `pointer: fine`, so
   * never on a touch screen) and never under reduced motion.
   */
  followPointer?: boolean;
  /** The avatar's traits (the king's where left out): its colours and its layers (hair, beard, headwear, accessory, pauldrons). */
  traits?: Partial<Traits>;
}

/** The pointer tracking's limits and pace. */
export const TRACK = {
  /** The share of the turn the torso takes (the shoulders follow the head a little). */
  torso: 0.2,
  /** Seconds without a move before the head goes back to its idle. */
  idleAfter: 5,
  /** How fast the head turns to the cursor, and how fast the tracking fades in and out (per second). */
  turnRate: 9,
  fadeRate: 4,
};

/** The king, v4: the rig's idle and emotes, a blink, the painted mouth an emote shows. */
export class KingAvatar {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new Scene();
  // A perspective camera, as the target's: what is nearer (the crown's corner, a pauldron) is larger.
  private readonly camera = new PerspectiveCamera(30, 1, 5, 200);
  private readonly rig = makeRig();
  private readonly root = this.rig.root;
  private readonly pivots = this.rig.pivots;
  private readonly heads = new Map<number | undefined, MeshLambertMaterial[]>();
  private headMesh!: Mesh;
  private readonly lids = new Group();
  private readonly owned: { dispose(): void }[] = [];
  private readonly glances: Glances;
  private emote: { name: Emote; start: number } | null = null;
  private shownMouth: number | undefined;
  private frame = 0;
  private readonly start = performance.now();
  private last = 0;
  private nextBlink = 3.5;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: KingAvatarOptions = {},
  ) {
    this.glances = new Glances(options.random ?? Math.random, 4.5);
    this.limits = trackLimits({ ...KING_TRAITS, ...options.traits });
    const media = (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches;
    this.tracksPointer = options.followPointer !== false && media("(hover: hover) and (pointer: fine)") && !media("(prefers-reduced-motion: reduce)");
    this.motion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.motion?.addEventListener("change", this.request);
    if (this.tracksPointer) {
      window.addEventListener("pointermove", this.onPointerMove, { passive: true });
      window.addEventListener("mouseout", this.onPointerOut);
      window.addEventListener("blur", this.onPointerGone);
    }
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%";
    container.appendChild(this.canvas);
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, options.pixelRatio ?? window.devicePixelRatio ?? 1));
    // No tone mapping: a lit face shows its own colour (the neutral curve took an offset off every channel and crushed the
    // darks' blue, the hair and the beard turning orange-black).
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    // Variance shadows: smooth (three's PCF dithers its taps per pixel, which dotted the gold).
    this.renderer.shadowMap.type = VSMShadowMap;
    if (options.backdrop) this.loadBackdrop(options.backdrop, options.blur ?? 3);
    // Light as the target's: bright and soft, a sky over a warm ground, a key from above at the camera's left, a cool fill.
    // A warm ambient: the sides away from the key turn red-brown, as the target shades them.
    this.scene.add(new HemisphereLight(0xffd2c2, 0xa0604c, this.options.light?.fill ?? 1.6));
    // From the front right and above, as in the target: the face and the crown's front lit, the head's left side in shade.
    const key = new DirectionalLight(0xffffff, this.options.light?.key ?? 2.7);
    // From the front right and above: the face and the tops lit, the head's left side (the viewer's) in the shade.
    key.position.set(10, 14, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    key.shadow.radius = 4;
    key.shadow.blurSamples = 12;
    key.shadow.intensity = 0.2;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.04;
    this.scene.add(key);
    const fill = new DirectionalLight(0xe6eeff, 0.0);
    fill.position.set(-12, 4, 6);
    this.scene.add(fill);
    this.scene.add(this.root);
    this.root.rotation.y = options.yaw ?? 0.56;
    this.build();
    // Multisampled before the ambient occlusion: the edges stay clean.
    const target = new WebGLRenderTarget(1, 1, { samples: 4, type: HalfFloatType });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const ao = new GTAOPass(this.scene, this.camera, 512, 512);
    ao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.4, thickness: 3, scale: 1.4, samples: 16 });
    ao.blendIntensity = 0.45;
    this.composer.addPass(ao);
    this.composer.addPass(new OutputPass());
    // From a little above (the crown's and the pauldrons' tops in view, as in the target).
    // Far enough for 26 units of height at the bust (the frame's), a little above it.
    this.setView({});
    this.resize();
    this.request();
  }

  /** The view: the bust's turn, the camera's pitch (negative: below, looking up), where it aims, its distance and its field. */
  // Fitted to the target (`KING_VIEW`, above).
  private view: KingView = { ...KING_VIEW };

  /** Sets the view (the calibration's: see the exploration's report). */
  setView(view: Partial<KingAvatar["view"]>): void {
    this.view = { ...this.view, ...view };
    this.request();
    const { yaw, pitch, target, distance, fov, head, stretch, pan } = this.view;
    if (this.options.yaw === undefined) this.root.rotation.y = yaw;
    this.pivots.head.scale.set(head, head * stretch, head);
    this.camera.fov = fov;
    // The depth range hugs the bust (it is within 25 units of its middle): the depth buffer's precision is spent there.
    this.camera.near = Math.max(1, distance - 40);
    this.camera.far = distance + 40;
    this.camera.position.set(pan, target + Math.sin(pitch) * distance, Math.cos(pitch) * distance);
    this.camera.lookAt(pan, target, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
  }

  /** Checks: where a point of a part, in the model's units, falls on the canvas, in CSS px from its top left. */
  screenOf(part: keyof typeof PIVOTS, point: [number, number, number]): [number, number] {
    this.root.updateMatrixWorld(true);
    const P = PIVOTS[part];
    const v = new Vector3(point[0] - P[0], point[1] - P[1], point[2] - P[2]).applyMatrix4(this.pivots[part].matrixWorld).project(this.camera);
    const { clientWidth: w, clientHeight: h } = this.container;
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
  }

  play(emote: Emote): void {
    this.emote = { name: emote, start: this.now() };
    this.request();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.motion?.removeEventListener("change", this.request);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("mouseout", this.onPointerOut);
    window.removeEventListener("blur", this.onPointerGone);
    for (const item of this.owned) item.dispose();
    for (const materials of this.heads.values()) for (const m of materials) (m.map?.dispose(), m.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private loadBackdrop(url: string, blur: number) {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext("2d")!;
      // Blurred past its edges: drawn larger so the blur does not darken the rim.
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(image, -16, -16, 544, 544);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      this.scene.background = texture;
      this.owned.push(texture);
      this.request();
    };
    image.src = url;
  }

  private now() {
    return (performance.now() - this.start) / 1000;
  }

  private build() {
    const material = blockMaterial();
    this.owned.push(material);
    const place = (part: keyof typeof PIVOTS, boxes: Cuboid[]) => {
      const geometry = cuboidGeometry(boxes, PIVOTS[part], PART_SALT[part]);
      this.owned.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      this.pivots[part].add(mesh);
    };
    const P = PIVOTS;
    const traits: Traits = { ...KING_TRAITS, ...this.options.traits };
    const parts = kingParts(traits);
    for (const part of ["torso", "armRight", "armLeft", "pauldronRight", "pauldronLeft"] as const) place(part, parts[part]);
    const placePainted = (part: keyof typeof PIVOTS, item: PaintedBox) => {
      const geometry = cuboidGeometry([item.box], PIVOTS[part]);
      for (let f = 0; f < 6; f++) geometry.addGroup(f * 6, 6, f);
      this.owned.push(geometry);
      const materials = item.faces.map(({ tiles, width }) => Object.assign(blockMaterial(true), { map: paint(tiles, width) }));
      for (const m of materials) this.owned.push(m.map!, m);
      const mesh = new Mesh(geometry, materials);
      mesh.castShadow = mesh.receiveShadow = true;
      this.pivots[part].add(mesh);
    };
    placePainted("torso", kingV4Tunic(outfitTones(traits)));
    place("head", parts.head);
    const palette = headPalette(traits);
    const faces = (mouth?: number) => headFaces(traits, mouth, this.options.eyeWhite, palette).map((pixels) => Object.assign(blockMaterial(true), { map: paint(pixels) }));
    this.heads.set(undefined, faces());
    for (const mouth of [GRIN, OPEN, FROWN]) this.heads.set(mouth, faces(mouth));
    const cube = cuboidGeometry([kingPaintedBoxes()[1]!.box], P.head);
    for (let f = 0; f < 6; f++) cube.addGroup(f * 6, 6, f);
    this.owned.push(cube);
    this.headMesh = new Mesh(cube, this.heads.get(undefined)! as Material[]);
    this.headMesh.castShadow = this.headMesh.receiveShadow = true;
    this.pivots.head.add(this.headMesh);
    // The eyelids over the eyes (texel rows 6 and 7: y 4..5), a hair in front of the face.
    const lid = new MeshLambertMaterial({ color: new Color().setHex(families(traits).skin(C.skinShade), SRGBColorSpace) });
    this.owned.push(lid);
    for (const x of [2, 6]) {
      const plane = new PlaneGeometry(2.04, 1.29);
      this.owned.push(plane);
      const mesh = new Mesh(plane, lid);
      mesh.position.set(x - P.head[0], 4.625 - P.head[1], HEAD - P.head[2] + 0.02);
      this.lids.add(mesh);
    }
    this.lids.visible = !!this.options.eyesShut;
    this.pivots.head.add(this.lids);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * The next frame, once. While still (the `still` option, or reduced motion) a frame is drawn only when something changes (the
   * view, the backdrop, an emote asked, a hold, the motion setting); otherwise every frame, the idle being alive.
   */
  private readonly request = () => {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(this.tick);
  };
  private readonly motion: MediaQueryList | null;

  /** How far an emote has blended in (0 at rest, 1 in it): the rest pose's own offsets (the arms' spread) give way to it. */
  private emoteWeight = 0;

  /** The pointer: where it was last seen (client px) and when (this clock's seconds); null when it left or never came. */
  private pointer: { x: number; y: number; at: number } | null = null;
  /** The tracking's weight (0: the idle's own head, 1: the cursor's) and its smoothed angles (the head's, from the camera's axis). */
  private track = { weight: 0, yaw: 0, pitch: 0 };
  private readonly tracksPointer: boolean;
  /** The neck's limits for the traits (the head's turn from the shoulders', its tilt). */
  private readonly limits: TrackLimits;

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    this.pointer = { x: event.clientX, y: event.clientY, at: this.now() };
  };
  private readonly onPointerGone = () => {
    this.pointer = null;
  };
  /** The pointer left the window (a `mouseout` with nothing to enter). */
  private readonly onPointerOut = (event: MouseEvent) => {
    if (!event.relatedTarget) this.pointer = null;
  };

  /** Checks: the tracking's state (its weight and the head's turn and tilt from the camera's axis, radians). */
  trackingState() {
    return { ...this.track, active: this.tracksPointer };
  }

  /** Checks: an emote held at a moment (its pose in full, over the idle at rest), or none. */
  private held: { emote: Emote; t: number } | null = null;
  hold(emote: Emote | null, t = 0): void {
    this.held = emote ? { emote, t } : null;
    this.request();
  }

  private pose(t: number, dt: number): Pose {
    if (this.held) {
      this.emoteWeight = 1;
      return blend(idle(0), emotePose(this.held.emote, this.held.t), 1);
    }
    let pose = idle(t);
    this.emoteWeight = 0;
    // The idle's glances give way to the cursor while the head follows it.
    pose.head = [pose.head[0], pose.head[1] + this.glances.update(t, dt) * (1 - this.track.weight), pose.head[2]];
    if (this.emote) {
      const into = t - this.emote.start;
      const length = EMOTE_S[this.emote.name];
      if (into >= length) this.emote = null;
      else {
        const target = emotePose(this.emote.name, into);
        this.emoteWeight = envelope(into, length);
        pose = blend(pose, { ...target, lift: target.lift + pose.lift * 0.5 }, this.emoteWeight);
      }
    }
    return pose;
  }

  /**
   * Turns the head to the cursor: its target from the cursor's offset to the head on screen (as if the cursor stood in a plane a
   * little in front of the screen: farther for a larger avatar), the camera's own angle taken off so a cursor on the head is met
   * eye to eye; smoothed, within the neck's limits, the torso taking a share. Fades in on a move, out after `TRACK.idleAfter`
   * still seconds or when the pointer leaves, and gives way to an emote.
   */
  private followPointer(t: number, dt: number) {
    if (!this.tracksPointer) return;
    const active = this.pointer !== null && t - this.pointer.at < TRACK.idleAfter;
    const fade = 1 - Math.exp(-dt * TRACK.fadeRate);
    this.track.weight += ((active ? 1 : 0) - this.track.weight) * fade;
    if (this.track.weight < 0.001 && !active) return;
    // The head's resting turn and tilt from the camera's axis: the bust's turn, and the camera below looking up.
    const restYaw = this.view.yaw + 0.02;
    const restPitch = 0;
    let yaw = restYaw;
    let pitch = restPitch;
    if (this.pointer) {
      const rect = this.container.getBoundingClientRect();
      // The head's middle as the torso carries it (the head's own turn left out: no feedback from the turn it is making).
      const [hx, hy] = this.screenOf("torso", [4, 4.5, 4]);
      const depth = 150 + 1.2 * rect.width;
      yaw = Math.atan2(this.pointer.x - (rect.left + hx), depth);
      // Looking straight at the viewer means tilting down by the camera's angle below the head.
      pitch = -this.view.pitch + Math.atan2(this.pointer.y - (rect.top + hy), depth);
      // Within the neck's limits for the traits: the turn from the shoulders' own (the bust's turn and the torso's), the tilt.
      const shoulders = this.view.yaw + this.view.torso;
      const L = this.limits;
      yaw = Math.min(shoulders + L.yaw, Math.max(shoulders - L.yaw, yaw));
      pitch = Math.min(L.pitchMax, Math.max(L.pitchMin, pitch));
    }
    // From a still start, the head sets off from where it rests.
    if (this.track.weight < 0.01) Object.assign(this.track, { yaw: restYaw, pitch: restPitch });
    const turn = 1 - Math.exp(-dt * TRACK.turnRate);
    this.track.yaw += (yaw - this.track.yaw) * turn;
    this.track.pitch += (pitch - this.track.pitch) * turn;
    // In an emote the emote leads: the cursor keeps a fifth of its pull.
    aimHead(this.rig, this.view, this.track.yaw, this.track.pitch, this.track.weight * (1 - 0.8 * this.emoteWeight));
  }

  private readonly tick = () => {
    this.frame = 0;
    const t = this.now();
    const dt = Math.min(0.1, t - this.last);
    this.last = t;
    const reduced = !!this.options.still || !!this.motion?.matches;
    const pose = reduced ? REST : this.pose(t, dt);
    poseRig(this.rig, pose, this.view, this.options.yaw === 0 ? 0 : 1, this.emoteWeight);
    if (!reduced) this.followPointer(t, dt);
    if (pose.mouth !== this.shownMouth) {
      this.headMesh.material = (this.heads.get(pose.mouth) ?? this.heads.get(undefined))! as Material[];
      this.shownMouth = pose.mouth;
    }
    if (!reduced && t >= this.nextBlink) {
      this.lids.visible = true;
      if (t >= this.nextBlink + 0.11) {
        this.lids.visible = false;
        this.nextBlink = t + 2.5 + Math.random() * 3;
      }
    }
    this.composer.render();
    if (!reduced) this.request();
  };
}
