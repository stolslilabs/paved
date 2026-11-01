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
  type WebGLRendererParameters,
  Vector3,
  type Material,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { cuboidGeometry, HEAD, type Cuboid } from "./avatar-cuboids";
import { KING_TRAITS, traitsText, type Traits } from "./avatar-look";
import { blend, EMOTE_S, envelope, emotePose, FROWN, Glances, GRIN, idle, OPEN, REST, type Emote, type Pose } from "./avatar-poses";
import { bodyCuboids, C, families, headCuboids, headFaces, headPalette, outfitTones, trackLimits, type TrackLimits } from "./avatar-traits";

export { EMOTES, type Emote } from "./avatar-poses";

/**
 * The avatar (AVATAR-LIVING): the king as his render target builds him, measured on it: a head cube painted on its six faces
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
export function kingTunic(tones = outfitTones(KING_TRAITS)): PaintedBox {
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
export function kingStrap(): Cuboid[] {
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
  return { head: headCuboids(traits), ...bodyCuboids(traits, kingStrap()) };
}

/** The painted boxes, whose faces count in the checks too: the tunic (the torso's) and the head cube. */
export const kingPaintedBoxes = (): { part: keyof typeof PIVOTS; box: Cuboid }[] => [
  { part: "torso", box: kingTunic().box },
  { part: "head", box: { from: [0, 0, 0], size: [HEAD, HEAD, HEAD], colour: 0xffffff, inflate: 0, name: "head-cube" } },
];

/** A backdrop's image, loaded once a URL (the live busts and the stills share it); a failed one is asked again next time. */
const backdrops = new Map<string, Promise<HTMLImageElement>>();
function loadBackdrop(url: string): Promise<HTMLImageElement> {
  let image = backdrops.get(url);
  if (!image) {
    image = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        backdrops.delete(url);
        reject(new Error(`The avatar's backdrop did not load: ${url}`));
      };
      img.src = url;
    });
    backdrops.set(url, image);
  }
  return image;
}

/**
 * The king's scene, the live bust's and the stills' alike: the lights, the rig on its turn, the camera as the view sets it, the
 * blurred backdrop, and the bust's meshes for some traits (`build` replaces them).
 */
class KingStage {
  readonly scene = new Scene();
  // A perspective camera, as the target's: what is nearer (the crown's corner, a pauldron) is larger.
  readonly camera = new PerspectiveCamera(30, 1, 5, 200);
  readonly rig = makeRig();
  /** The view (the calibration's, `KING_VIEW`). */
  view: KingView = { ...KING_VIEW };
  /** The eyelids over the eyes, shown for a blink. */
  readonly lids = new Group();
  /** The head cube's materials by the mouth they paint (none: the rest's). */
  private readonly heads = new Map<number | undefined, MeshLambertMaterial[]>();
  private headMesh: Mesh | null = null;
  private shownMouth: number | undefined;
  /** What the last build made, freed by the next build or `dispose`, and the meshes it put on the rig. */
  private built: { dispose(): void }[] = [];
  private placed: Mesh[] = [];
  private backdrop: CanvasTexture | null = null;
  /** The URL of the backdrop shown (none yet: null). */
  backdropUrl: string | null = null;

  constructor() {
    // Light as the target's: bright and soft, a sky over a warm ground, a key from above at the camera's left, a cool fill.
    // A warm ambient: the sides away from the key turn red-brown, as the target shades them.
    this.scene.add(new HemisphereLight(0xffd2c2, 0xa0604c, 1.6));
    // From the front right and above: the face and the tops lit, the head's left side (the viewer's) in the shade.
    const key = new DirectionalLight(0xffffff, 2.7);
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
    this.scene.add(this.rig.root);
    this.rig.pivots.head.add(this.lids);
    this.lids.visible = false;
  }

  /** Builds the bust for `traits`, in place of the last one. */
  build(traits: Traits): void {
    this.clear();
    const own = <T extends { dispose(): void }>(item: T): T => (this.built.push(item), item);
    const place = (part: keyof typeof PIVOTS, mesh: Mesh) => {
      mesh.castShadow = mesh.receiveShadow = true;
      this.rig.pivots[part].add(mesh);
      this.placed.push(mesh);
    };
    const painted = (item: PaintedBox, part: keyof typeof PIVOTS) => {
      const geometry = own(cuboidGeometry([item.box], PIVOTS[part]));
      for (let f = 0; f < 6; f++) geometry.addGroup(f * 6, 6, f);
      return geometry;
    };
    const material = own(blockMaterial());
    const parts = kingParts(traits);
    for (const part of ["torso", "armRight", "armLeft", "pauldronRight", "pauldronLeft"] as const) place(part, new Mesh(own(cuboidGeometry(parts[part], PIVOTS[part], PART_SALT[part])), material));
    const tunic = kingTunic(outfitTones(traits));
    place("torso", new Mesh(painted(tunic, "torso"), tunic.faces.map(({ tiles, width }) => own(Object.assign(blockMaterial(true), { map: own(paint(tiles, width)) })))));
    place("head", new Mesh(own(cuboidGeometry(parts.head, PIVOTS.head, PART_SALT.head)), material));
    const palette = headPalette(traits);
    const faces = (mouth?: number) => headFaces(traits, mouth, undefined, palette).map((pixels) => own(Object.assign(blockMaterial(true), { map: own(paint(pixels)) })));
    this.heads.set(undefined, faces());
    for (const mouth of [GRIN, OPEN, FROWN]) this.heads.set(mouth, faces(mouth));
    this.headMesh = new Mesh(painted({ box: kingPaintedBoxes()[1]!.box, faces: [] }, "head"), this.heads.get(undefined)!);
    this.shownMouth = undefined;
    place("head", this.headMesh);
    // The eyelids over the eyes (texel rows 6 and 7: y 4..5), a hair in front of the face.
    const lid = own(new MeshLambertMaterial({ color: new Color().setHex(families(traits).skin(C.skinShade), SRGBColorSpace) }));
    for (const x of [2, 6]) {
      const mesh = new Mesh(own(new PlaneGeometry(2.04, 1.29)), lid);
      mesh.position.set(x - PIVOTS.head[0], 4.625 - PIVOTS.head[1], HEAD - PIVOTS.head[2] + 0.02);
      this.lids.add(mesh);
    }
  }

  /** Shows the mouth an emote paints (none: the rest's). */
  setMouth(mouth: number | undefined): void {
    if (mouth === this.shownMouth || !this.headMesh) return;
    this.headMesh.material = this.heads.get(mouth) ?? this.heads.get(undefined)!;
    this.shownMouth = mouth;
  }

  /** Sets the view: the bust's turn (`yaw` when the avatar fixes one), the camera's pitch, aim, distance and field, the head's size. */
  setView(view: Partial<KingView>, yaw?: number): void {
    this.view = { ...this.view, ...view };
    const { pitch, target, distance, fov, head, stretch, pan } = this.view;
    this.rig.root.rotation.y = yaw ?? this.view.yaw;
    this.rig.pivots.head.scale.set(head, head * stretch, head);
    this.camera.fov = fov;
    // The depth range hugs the bust (it is within 25 units of its middle): the depth buffer's precision is spent there.
    this.camera.near = Math.max(1, distance - 40);
    this.camera.far = distance + 40;
    this.camera.position.set(pan, target + Math.sin(pitch) * distance, Math.cos(pitch) * distance);
    this.camera.lookAt(pan, target, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.rig.root.updateMatrixWorld(true);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** The backdrop behind the bust: `image` blurred by `blur` px at 512 px, drawn past its edges so the blur does not darken the rim. */
  setBackdrop(image: CanvasImageSource, blur: number, url: string | null = null): void {
    this.backdropUrl = url;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(image, -16, -16, 544, 544);
    this.backdrop?.dispose();
    this.backdrop = new CanvasTexture(canvas);
    this.backdrop.colorSpace = SRGBColorSpace;
    this.scene.background = this.backdrop;
  }

  dispose(): void {
    this.clear();
    this.backdrop?.dispose();
    this.backdrop = null;
    this.backdropUrl = null;
    this.scene.background = null;
  }

  private clear() {
    for (const mesh of this.placed) mesh.removeFromParent();
    for (const item of this.built) item.dispose();
    this.placed = [];
    this.built = [];
    this.lids.clear();
    this.heads.clear();
    this.headMesh = null;
  }
}

/** A renderer as the bust is drawn. */
function kingRenderer(parameters: WebGLRendererParameters): WebGLRenderer {
  const renderer = new WebGLRenderer({ antialias: true, ...parameters });
  // No tone mapping: a lit face shows its own colour (the neutral curve took an offset off every channel and crushed the darks'
  // blue, the hair and the beard turning orange-black).
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  // Variance shadows: smooth (three's PCF dithers its taps per pixel, which dotted the gold).
  renderer.shadowMap.type = VSMShadowMap;
  return renderer;
}

/** The passes: the scene multisampled first (the edges stay clean), then the ambient occlusion, then the output. */
function kingComposer(renderer: WebGLRenderer, stage: KingStage): EffectComposer {
  const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { samples: 4, type: HalfFloatType }));
  composer.addPass(new RenderPass(stage.scene, stage.camera));
  const ao = new GTAOPass(stage.scene, stage.camera, 512, 512);
  ao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.4, thickness: 3, scale: 1.4, samples: 16 });
  ao.blendIntensity = 0.45;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  return composer;
}

/** Frees a composer and its passes' targets and materials (the composer's own `dispose` frees only its two targets). */
function disposeComposer(composer: EffectComposer) {
  for (const pass of composer.passes) pass.dispose();
  composer.dispose();
}

/** A backdrop's URL by its name (the app's images): the scene behind the bust, blurred. */
export type BackdropUrl = (name: Traits["backdrop"]) => string;

export interface KingAvatarOptions {
  /** The backdrops' URLs by name (the traits pick one), blurred behind the bust (`blur` px at 512 px); none: the clear colour. */
  backdrops?: BackdropUrl;
  blur?: number;
  pixelRatio?: number;
  random?: () => number;
  /** The rest pose, no idle, no blink (a frame only when something changes, as under reduced motion). */
  still?: boolean;
  /** The bust's turn in radians (the view's three-quarter by default; 0 faces the camera). */
  yaw?: number;
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

/**
 * The living bust in a canvas filling `container`: its idle (a breath, a sway, glances), a blink, the emotes `play` asks, and on a
 * desktop its head following the cursor. One WebGL context; a frame every animation frame while it moves and is on screen, and
 * under reduced motion (or `still`) only when something changes. The canvas follows its container's size.
 */
export class KingAvatar {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly stage = new KingStage();
  private readonly glances: Glances;
  private emote: { name: Emote; start: number } | null = null;
  private frame = 0;
  private readonly start = performance.now();
  private last = 0;
  private nextBlink = 3.5;
  private disposed = false;
  private readonly motion: MediaQueryList | null;
  private readonly resizer: ResizeObserver | null;
  private readonly visibility: IntersectionObserver | null;
  /** Whether the canvas is on screen: no frame is drawn off it. */
  private shown = true;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: KingAvatarOptions = {},
  ) {
    const traits: Traits = { ...KING_TRAITS, ...options.traits };
    this.glances = new Glances(options.random ?? Math.random, 4.5);
    this.limits = trackLimits(traits);
    const media = (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches;
    this.tracksPointer = options.followPointer !== false && media("(hover: hover) and (pointer: fine)") && !media("(prefers-reduced-motion: reduce)");
    if (this.tracksPointer) {
      window.addEventListener("pointermove", this.onPointerMove, { passive: true });
      window.addEventListener("mouseout", this.onPointerOut);
      window.addEventListener("blur", this.onPointerGone);
    }
    this.motion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.motion?.addEventListener("change", this.request);
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%";
    container.appendChild(this.canvas);
    this.renderer = kingRenderer({ canvas: this.canvas });
    this.renderer.setPixelRatio(Math.min(2, options.pixelRatio ?? window.devicePixelRatio ?? 1));
    this.stage.build(traits);
    this.composer = kingComposer(this.renderer, this.stage);
    this.showBackdrop(traits);
    this.setView({});
    this.resizer = typeof ResizeObserver === "function" ? new ResizeObserver(this.onResize) : null;
    this.resizer?.observe(container);
    this.visibility =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver((entries) => {
            this.shown = entries.some((e) => e.isIntersecting);
            this.request();
          })
        : null;
    this.visibility?.observe(container);
    this.resize();
    this.request();
  }

  /** Sets the view (`KING_VIEW` by default: the calibration's). */
  setView(view: Partial<KingView>): void {
    this.stage.setView(view, this.options.yaw);
    this.request();
  }

  /** Where a point of a part, in the model's units, falls on the canvas, in CSS px from its top left. */
  screenOf(part: keyof typeof PIVOTS, point: [number, number, number]): [number, number] {
    this.stage.rig.root.updateMatrixWorld(true);
    const P = PIVOTS[part];
    const v = new Vector3(point[0] - P[0], point[1] - P[1], point[2] - P[2]).applyMatrix4(this.stage.rig.pivots[part].matrixWorld).project(this.stage.camera);
    const { clientWidth: w, clientHeight: h } = this.container;
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
  }

  /** Builds the bust for other traits (the creator's draft), in the same context; a new backdrop once its image is in. */
  setTraits(traits: Partial<Traits>): void {
    const all: Traits = { ...KING_TRAITS, ...traits };
    this.stage.build(all);
    this.limits = trackLimits(all);
    this.showBackdrop(all);
    this.request();
  }

  /** The traits' backdrop behind the bust, once loaded (the last asked wins); a failed one leaves the one shown. */
  private showBackdrop(traits: Traits) {
    const url = this.options.backdrops?.(traits.backdrop);
    if (!url || url === this.stage.backdropUrl) return;
    this.wantedBackdrop = url;
    loadBackdrop(url).then(
      (image) => {
        if (this.disposed || this.wantedBackdrop !== url) return;
        this.stage.setBackdrop(image, this.options.blur ?? 3, url);
        this.request();
      },
      () => {},
    );
  }
  private wantedBackdrop: string | null = null;

  /** Blends an emote in over the idle (a new one replaces the one playing). */
  play(emote: Emote): void {
    this.emote = { name: emote, start: this.now() };
    this.request();
  }

  /** The tracking's state: its weight and the head's turn and tilt from the camera's axis (radians), and whether it runs at all. */
  trackingState() {
    return { ...this.track, active: this.tracksPointer };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.motion?.removeEventListener("change", this.request);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("mouseout", this.onPointerOut);
    window.removeEventListener("blur", this.onPointerGone);
    this.resizer?.disconnect();
    this.visibility?.disconnect();
    this.stage.dispose();
    disposeComposer(this.composer);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private now() {
    return (performance.now() - this.start) / 1000;
  }

  private readonly onResize = () => {
    this.resize();
    this.request();
  };

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.stage.setAspect(w / h);
  }

  /** The next frame, once, while the canvas is on screen. */
  private readonly request = () => {
    if (this.disposed || this.frame || !this.shown) return;
    this.frame = requestAnimationFrame(this.tick);
  };

  /** How far an emote has blended in (0 at rest, 1 in it): the rest pose's own offsets (the arms' spread) give way to it. */
  private emoteWeight = 0;

  /** The pointer: where it was last seen (client px) and when (this clock's seconds); null when it left or never came. */
  private pointer: { x: number; y: number; at: number } | null = null;
  /** The tracking's weight (0: the idle's own head, 1: the cursor's) and its smoothed angles (the head's, from the camera's axis). */
  private track = { weight: 0, yaw: 0, pitch: 0 };
  private readonly tracksPointer: boolean;
  /** The neck's limits for the traits (the head's turn from the shoulders', its tilt). */
  private limits: TrackLimits;

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

  private pose(t: number, dt: number): Pose {
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
    const restYaw = this.stage.view.yaw + 0.02;
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
      pitch = -this.stage.view.pitch + Math.atan2(this.pointer.y - (rect.top + hy), depth);
      // Within the neck's limits for the traits: the turn from the shoulders' own (the bust's turn and the torso's), the tilt.
      const shoulders = this.stage.view.yaw + this.stage.view.torso;
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
    aimHead(this.stage.rig, this.stage.view, this.track.yaw, this.track.pitch, this.track.weight * (1 - 0.8 * this.emoteWeight));
  }


  private readonly tick = () => {
    this.frame = 0;
    const t = this.now();
    const dt = Math.min(0.1, t - this.last);
    this.last = t;
    const reduced = !!this.options.still || !!this.motion?.matches;
    const pose = reduced ? REST : this.pose(t, dt);
    poseRig(this.stage.rig, pose, this.stage.view, this.options.yaw === 0 ? 0 : 1, this.emoteWeight);
    if (!reduced) this.followPointer(t, dt);
    this.stage.setMouth(pose.mouth);
    if (!reduced && t >= this.nextBlink) {
      this.stage.lids.visible = true;
      if (t >= this.nextBlink + 0.11) {
        this.stage.lids.visible = false;
        this.nextBlink = t + 2.5 + Math.random() * 3;
      }
    }
    this.composer.render();
    if (!reduced) this.request();
  };
}

/** Resolves in a task of its own: the renders asked at once run a task each, so a tap is never kept waiting behind a grid. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface KingStillOptions {
  /** The image's side in CSS px. */
  size: number;
  /** Device px per CSS px; the device's own by default, at most 3. */
  pixelRatio?: number;
}

export interface KingStillStats {
  /** Stills rendered, and asks answered from the cache. */
  renders: number;
  hits: number;
  /** Contexts created (one at a time; released after `idleMs` without a render). */
  contexts: number;
  /** A render's milliseconds (building the bust, drawing it, reading it into an image): the last, the total, the worst. */
  lastMs: number;
  totalMs: number;
  maxMs: number;
  /** The cached images now. */
  cached: number;
}

export interface KingStillsOptions {
  /** The backdrops' URLs by name (the traits pick one), blurred behind each still (`blur` px at 512 px), as the live bust's. */
  backdrops?: BackdropUrl;
  blur?: number;
  /** How long the context lives without a render before it is released. */
  idleMs?: number;
  /** How many images the cache keeps (the oldest asked goes first). */
  maxEntries?: number;
  /** Tests: the clock. */
  now?: () => number;
}

/**
 * The menus' avatars: each traits and size drawn once, as the live bust's first frame (its rest pose, its light, its backdrop),
 * into an image (a PNG data URL) and kept. One WebGL context serves every render; it is created on the first and released once no
 * render came for `idleMs`, so a page of avatars holds at most one context, and none at rest. Renders run one at a time, a task
 * each.
 */
export class KingStills {
  private renderer: WebGLRenderer | null = null;
  private composer: EffectComposer | null = null;
  private stage: KingStage | null = null;
  private readonly cache = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();
  /** The renders asked, one after another. */
  private queue: Promise<unknown> = Promise.resolve();
  private idle: ReturnType<typeof setTimeout> | null = null;
  private readonly stats_: KingStillStats = { renders: 0, hits: 0, contexts: 0, lastMs: 0, totalMs: 0, maxMs: 0, cached: 0 };
  private readonly idleMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(private readonly options: KingStillsOptions = {}) {
    this.idleMs = options.idleMs ?? 2_000;
    this.maxEntries = options.maxEntries ?? 256;
    this.now = options.now ?? (() => performance.now());
  }

  /** The image's side in device px. */
  static pixels({ size, pixelRatio }: KingStillOptions): number {
    const ratio = pixelRatio ?? (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    return Math.max(1, Math.round(size * Math.min(3, ratio)));
  }

  /** The image already rendered for these, if any (no render). */
  peek(traits: Traits, options: KingStillOptions): string | undefined {
    return this.cache.get(this.keyOf(traits, options));
  }

  /** The traits' image: from the cache, else rendered (once the backdrop is in, after the renders asked before) and kept. */
  get(traits: Traits, options: KingStillOptions): Promise<string> {
    const key = this.keyOf(traits, options);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.stats_.hits++;
      // The most recently asked goes last: the cache drops from the front.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    let pending = this.pending.get(key);
    if (!pending) {
      const url = this.options.backdrops?.(traits.backdrop) ?? null;
      const backdrop = url ? loadBackdrop(url).then((image) => ({ image, url }), () => null) : Promise.resolve(null);
      pending = this.queue
        .then(nextTask)
        .then(() => backdrop)
        .then((image) => {
          const url = this.render(traits, KingStills.pixels(options), image);
          this.cache.set(key, url);
          while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value as string);
          return url;
        })
        .finally(() => this.pending.delete(key));
      this.queue = pending.catch(() => {});
      this.pending.set(key, pending);
    }
    return pending;
  }

  stats(): KingStillStats {
    return { ...this.stats_, cached: this.cache.size };
  }

  /** Whether a context is held now. */
  get live(): boolean {
    return this.renderer !== null;
  }

  /** Releases the context (the cache stays). */
  release(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    if (!this.renderer) return;
    this.stage?.dispose();
    if (this.composer) disposeComposer(this.composer);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer = null;
    this.composer = null;
    this.stage = null;
  }

  /** Releases the context and forgets every image. */
  dispose(): void {
    this.release();
    this.cache.clear();
  }

  private keyOf(traits: Traits, options: KingStillOptions): string {
    return `${traitsText(traits) || "king"}:${KingStills.pixels(options)}`;
  }

  /** Draws the bust at rest for `traits` on a `px` square and reads it, in the same task (the drawing buffer is not kept). */
  protected draw(traits: Traits, px: number, backdrop: { image: CanvasImageSource; url: string } | null): string {
    if (!this.renderer) {
      this.renderer = kingRenderer({ preserveDrawingBuffer: false });
      this.renderer.setPixelRatio(1);
      this.stage = new KingStage();
      this.stage.setView({});
      this.composer = kingComposer(this.renderer, this.stage);
      this.stats_.contexts++;
    }
    const stage = this.stage!;
    // The traits' backdrop, blurred once while it stays the same from one still to the next.
    if (backdrop && backdrop.url !== stage.backdropUrl) stage.setBackdrop(backdrop.image, this.options.blur ?? 3, backdrop.url);
    this.renderer.setSize(px, px, false);
    this.composer!.setSize(px, px);
    stage.setAspect(1);
    stage.build(traits);
    poseRig(stage.rig, REST, stage.view, 1, 0);
    this.composer!.render();
    return this.renderer.domElement.toDataURL("image/png");
  }

  private render(traits: Traits, px: number, backdrop: { image: CanvasImageSource; url: string } | null): string {
    const start = this.now();
    const url = this.draw(traits, px, backdrop);
    const ms = this.now() - start;
    this.stats_.renders++;
    this.stats_.lastMs = ms;
    this.stats_.totalMs += ms;
    this.stats_.maxMs = Math.max(this.stats_.maxMs, ms);
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.release(), this.idleMs);
    return url;
  }
}
