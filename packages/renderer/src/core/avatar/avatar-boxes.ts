import {
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Euler,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Matrix3,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  NeutralToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  SpotLight,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import type { Avatar } from "./avatar-format";
import { FACES, HEAD, buildHead, faceGrids } from "./avatar-model";
import { shade } from "./avatar-palette";
import { blend, EMOTE_S, envelope, emotePose, FROWN, Glances, GRIN, idle, OPEN, REST, type Emote, type Pose } from "./avatar-rig";

/**
 * AVATAR-LIVING (exploration, third approach, after the owner's note of 2026-10-31: "what counts is cubes that interpenetrate and
 * stand freely in space, not strictly on a grid"): the bust as Blockbench builds a Minecraft model. A head cube of 8 painted with
 * the catalogue's own 8 x 8 face grids (so every trait keeps working), and around it free cuboids: any size, anywhere (between
 * grid cells), turned about their own pivot, biting into each other: locks and a fringe over the skull, a beard and a moustache
 * out of the jaw, a crown of diamond points with a ruby, pauldrons tilted off the shoulders, a strap across the chest. Every face
 * shows texels a unit wide (a faint grain, as a Minecraft texture), its edges bevelled; the ambient occlusion is the screen's
 * (GTAO), so it darkens where cubes meet, whatever their angle.
 */

/** A cuboid in the head's units (one per Minecraft pixel): its corner, size, turn about its pivot (degrees), and colour. */
export interface Cuboid {
  from: [number, number, number];
  size: [number, number, number];
  /** Turn in degrees about `pivot` (its own centre by default), in x, y, z order. */
  rotation?: [number, number, number];
  pivot?: [number, number, number];
  colour: number;
  /**
   * How far each face stands out of the cuboid's size, in units (Blockbench's "inflate"). By default a few thousandths, distinct
   * from one cuboid to the next of its part: no two faces ever lie in one plane, so none flickers between two cuboids (z-fighting).
   */
  inflate?: number;
  /** How much its unit tiles vary in tone (0.1: a tenth darker or lighter), for a material's mosaic; a little by default. */
  grain?: number;
  /** What it is, for the checks' reports (no effect on the drawing). */
  name?: string;
}

/**
 * The default inflate of a mesh's `index`-th cuboid, its mesh's `salt` added: 0.002 to 0.031 units in 97 steps 0.0003 apart, all
 * distinct over 97 consecutive indices (the old 0.003 * (1 + (7i mod 10)) repeated every ten cuboids, so a cuboid and the one ten
 * places on shared their faces' planes). Meshes that touch (an arm and its pauldron) take different salts.
 */
export const inflateOf = (index: number, salt = 0) => 0.002 + 0.0003 * (((index + salt) * 37) % 97);

/** The six faces of a unit box: normal, corners (counter-clockwise from outside), and which size axes span u and v. */
const FACE_QUADS: readonly { n: [number, number, number]; c: [number, number, number][]; u: number; v: number }[] = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], u: 2, v: 1 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], u: 2, v: 1 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], u: 0, v: 2 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], u: 0, v: 2 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], u: 0, v: 1 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], u: 0, v: 1 },
];

const seedOf = (b: Cuboid) => ((b.from[0] * 31.7 + b.from[1] * 17.3 + b.from[2] * 7.9 + b.size[0] * 3.1) % 97) / 97;

/**
 * Cuboids as one geometry, shifted by `origin` (their part's pivot): each face's corners turned and placed, coloured per face
 * (tops a little lighter, undersides darker, as paint shades a block), with its size in units (`faceSize`, for the grain and the
 * bevel in units, whatever the cuboid's size) and its cuboid's seed.
 */
export function cuboidGeometry(boxes: readonly Cuboid[], origin: [number, number, number], salt = 0): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  const uvs: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];
  const kinds: number[] = [];
  const grains: number[] = [];
  const indices: number[] = [];
  const colour = new Color();
  const matrix = new Matrix4();
  const normalMatrix = new Matrix3();
  const p = new Vector3();
  const n = new Vector3();
  for (const [index, box] of boxes.entries()) {
    const [w, h, d] = box.size;
    const e = box.inflate ?? inflateOf(index, salt);
    const centre: [number, number, number] = [box.from[0] + w / 2, box.from[1] + h / 2, box.from[2] + d / 2];
    const pivot = box.pivot ?? centre;
    const [rx, ry, rz] = (box.rotation ?? [0, 0, 0]).map((a) => (a * Math.PI) / 180) as [number, number, number];
    matrix
      .makeTranslation(pivot[0] - origin[0], pivot[1] - origin[1], pivot[2] - origin[2])
      .multiply(new Matrix4().makeRotationFromEuler(new Euler(rx, ry, rz)))
      .multiply(new Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
    normalMatrix.getNormalMatrix(matrix);
    const seed = seedOf(box);
    for (const { n: normal, c, u, v } of FACE_QUADS) {
      const base = positions.length / 3;
      const tone = normal[1] > 0 ? 1.06 : normal[1] < 0 ? 0.82 : 1;
      colour.setHex(box.colour, SRGBColorSpace).multiplyScalar(tone);
      n.set(...normal).applyMatrix3(normalMatrix).normalize();
      c.forEach((corner, i) => {
        p.set(box.from[0] - e + corner[0]! * (w + 2 * e), box.from[1] - e + corner[1]! * (h + 2 * e), box.from[2] - e + corner[2]! * (d + 2 * e)).applyMatrix4(matrix);
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        colours.push(colour.r, colour.g, colour.b);
        uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
        sizes.push(box.size[u]!, box.size[v]!);
        seeds.push(seed);
        // Which way the face looked before its turn: 0 a side (its v runs up), 1 a top, 2 an underside.
        kinds.push(normal[1] > 0 ? 1 : normal[1] < 0 ? 2 : 0);
        grains.push(box.grain ?? 0.025);
      });
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("faceSize", new Float32BufferAttribute(sizes, 2));
  geometry.setAttribute("seed", new Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("faceKind", new Float32BufferAttribute(kinds, 1));
  geometry.setAttribute("grain", new Float32BufferAttribute(grains, 1));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * The cuboids' material: Lambert on the face colours, with a grain of texels a unit wide (each a few percent lighter or darker,
 * as a Minecraft texture's pixels), and every face's rim bevelled (a thin highlight, then a shade), its width in units.
 */
export function cuboidMaterial(): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 faceSize;\nattribute float seed;\nvarying vec2 vFaceUv;\nvarying vec2 vFaceSize;\nvarying float vSeed;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFaceUv = uv;\nvFaceSize = faceSize;\nvSeed = seed;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vFaceUv;
varying vec2 vFaceSize;
varying float vSeed;
float cubeHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + vSeed * 43.17) * 43758.5453); }`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 units = vFaceUv * vFaceSize;
        diffuseColor.rgb *= 0.88 + 0.22 * cubeHash(floor(units + 0.001));
        vec2 toEdge = min(units, vFaceSize - units);
        float edge = min(toEdge.x, toEdge.y);
        diffuseColor.rgb *= 1.0 + smoothstep(0.07, 0.0, edge) * 0.16 - smoothstep(0.16, 0.07, edge) * 0.08;`,
      );
  };
  return material;
}

/** A face grid as an 8 x 8 texture, nearest-filtered (rows from the top); clear where undefined. */
function faceTexture(pixels: readonly (number | undefined)[]): DataTexture {
  const data = new Uint8Array(HEAD * HEAD * 4);
  pixels.forEach((hex, i) => {
    if (hex === undefined) return;
    const at = ((HEAD - 1 - Math.floor(i / HEAD)) * HEAD + (i % HEAD)) * 4;
    data[at] = (hex >> 16) & 0xff;
    data[at + 1] = (hex >> 8) & 0xff;
    data[at + 2] = hex & 0xff;
    data[at + 3] = 255;
  });
  const texture = new DataTexture(data, HEAD, HEAD, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The king's front, painted at the catalogue's 8 x 8 (rows from the top): hair at the top and the temples, thick brows, cream
 * whites with dark pupils inside, a nose in shade, the moustache over a light mouth, the beard along the jaw. Per mouth an emote
 * shows (the catalogue's ids: 2 grin, 3 open, 5 frown).
 */
function kingFront(mouth?: number): number[] {
  const H = 0x5a3420, h = 0x6e4229, B = 0x3a2216, s = 0xeda56a, L = 0xf6bb80, d = 0xc9824e, W = 0xfff2d6, P = 0x2a1a10;
  const m = 0x4a2a19, l = 0xe9a27a, T = 0xfff4e4, O = 0x5c2418;
  const lips = mouth === 2 ? [m, T, T, T, T, m] : mouth === 3 ? [m, O, O, O, O, m] : mouth === 5 ? [l, m, m, m, m, l] : [m, l, l, l, l, m];
  return [
    H, h, H, H, h, H, H, h,
    H, L, L, L, L, L, L, H,
    h, B, B, s, s, B, B, h,
    s, W, P, s, s, P, W, s,
    s, s, s, L, L, s, s, s,
    h, s, m, d, d, m, s, h,
    H, h, ...lips.slice(1, 5), h, H,
    H, H, h, H, H, h, H, H,
  ];
}

/** The head cube's six textured materials (Lambert, bevelled rims), the catalogue's face grids of `avatar`, its front `front` if given. */
function headMaterials(avatar: Avatar, front?: readonly number[]): MeshLambertMaterial[] {
  const head = buildHead(avatar);
  return FACES.map((face) => {
    const material = new MeshLambertMaterial({ map: faceTexture(face === "front" && front ? front : faceGrids(head, face).surface) });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec2 units = vMapUv * 8.0;
        vec2 toEdge = min(units, 8.0 - units);
        float edge = min(toEdge.x, toEdge.y);
        diffuseColor.rgb *= 1.0 + smoothstep(0.07, 0.0, edge) * 0.14 - smoothstep(0.16, 0.07, edge) * 0.07;`,
      );
    };
    return material;
  });
}

/** The king's colours. */
const K = {
  hair: 0x6a4029,
  hairDark: 0x4a2b1b,
  gold: 0xf2b83c,
  goldLight: 0xffd768,
  goldDark: 0xc98d26,
  ruby: 0xd3242a,
  rubyLight: 0xff5a45,
  tunic: 0x3b74c8,
  tunicDark: 0x2c5ca6,
  sleeve: 0x2d3742,
  leather: 0x7c4a2a,
  leatherDark: 0x5e351e,
  skin: 0xd89357,
};

export const mirrorX = (b: Cuboid, about = HEAD / 2): Cuboid => ({
  ...b,
  from: [2 * about - b.from[0] - b.size[0], b.from[1], b.from[2]],
  rotation: b.rotation ? [b.rotation[0], -b.rotation[1], -b.rotation[2]] : undefined,
  pivot: b.pivot ? [2 * about - b.pivot[0], b.pivot[1], b.pivot[2]] : undefined,
});

/**
 * The king's free cuboids around his head cube (0..8 on each axis, the face at z = 8), with slopes: the hair hangs out at the
 * back and the sides from pivots on the skull's top edges, the fringe leans forward over the brow, the nose's bridge slants out,
 * the beard runs forward under the chin, the moustache droops at its ends, the crown's band flares out and its points with it.
 * `left` is drawn on the viewer's left and mirrored to the right; `centre` once.
 */
export function kingHeadBoxes(): Cuboid[] {
  const centre: Cuboid[] = [
    // The hair: a cap over the skull, two tufts tilted on the crown, the back hanging out from the skull's back top edge.
    { from: [-0.35, 7.0, -0.35], size: [8.7, 1.4, 8.7], colour: K.hair },
    { from: [1.0, 7.9, 0.8], size: [3.8, 1.1, 4.4], rotation: [-14, 10, 0], pivot: [2.9, 8.4, 3], colour: K.hairDark },
    { from: [4.4, 7.8, 2.6], size: [3.2, 0.9, 3.6], rotation: [0, -8, 12], pivot: [6, 8.3, 4.4], colour: K.hair },
    { from: [-0.4, 2.0, -0.55], size: [8.8, 6.2, 1.3], rotation: [10, 0, 0], pivot: [4, 8.2, -0.5], colour: K.hairDark },
    // The fringe: three chunks leaning forward and down from the hairline, of uneven widths and turns.
    { from: [-0.1, 6.3, 7.4], size: [3.3, 1.9, 0.9], rotation: [-14, 0, -8], pivot: [1.5, 8.2, 7.9], colour: K.hair },
    { from: [3.0, 6.6, 7.45], size: [2.4, 1.6, 0.85], rotation: [-12, 0, 6], pivot: [4.2, 8.2, 7.9], colour: K.hairDark },
    { from: [5.0, 6.2, 7.4], size: [3.1, 2.0, 0.95], rotation: [-15, 0, 10], pivot: [6.5, 8.2, 7.9], colour: K.hair },
    // The nose: its bridge slanting out of the brow down to its tip.
    { from: [3.35, 3.0, 7.75], size: [1.3, 1.8, 0.7], rotation: [-14, 0, 0], pivot: [4, 4.8, 8.0], colour: 0xf2b07a },
    // The beard's front: a band along the chin, leaning out, and a wedge running forward under it.
    { from: [0.5, -0.8, 7.45], size: [7.0, 1.2, 0.9], rotation: [-12, 0, 0], pivot: [4, 0.4, 7.9], colour: K.hair },
    { from: [2.4, -2.0, 6.9], size: [3.2, 1.6, 1.4], rotation: [-30, 0, 0], pivot: [4, -0.4, 7.6], colour: K.hairDark },
    // The crown's front and back: the band flaring out from its lower edge, the points on it leaning further, the ruby on it.
    { from: [-0.7, 8.1, 7.9], size: [9.4, 1.8, 0.75], rotation: [10, 0, 0], pivot: [4, 8.1, 8.3], colour: K.gold },
    { from: [-0.7, 8.1, -0.65], size: [9.4, 1.8, 0.75], rotation: [-10, 0, 0], pivot: [4, 8.1, -0.3], colour: K.goldDark },
    { from: [3.1, 9.8, 7.85], size: [1.8, 2.1, 0.8], rotation: [16, 0, 0], pivot: [4, 8.1, 8.3], colour: K.gold },
    { from: [3.5, 11.75, 7.9], size: [1.0, 1.1, 0.7], rotation: [16, 0, 0], pivot: [4, 8.1, 8.3], colour: K.goldLight },
    { from: [3.3, 9.8, -0.65], size: [1.4, 1.3, 0.8], rotation: [-14, 0, 0], pivot: [4, 8.1, -0.3], colour: K.goldDark },
    { from: [3.25, 8.35, 8.3], size: [1.5, 1.6, 0.95], rotation: [10, 0, 0], pivot: [4, 8.1, 8.3], colour: K.ruby },
    { from: [3.2, 9.35, 8.95], size: [0.65, 0.65, 0.5], rotation: [10, 0, 0], pivot: [4, 8.1, 8.3], colour: K.rubyLight },
  ];
  const left: Cuboid[] = [
    // The side hair hanging out from the skull's top side edge, a front lock steeper, a flick at the nape.
    { from: [-0.6, 2.8, 0.0], size: [1.3, 5.4, 4.8], rotation: [0, 0, -8], pivot: [0.05, 8.2, 2.4], colour: K.hair },
    { from: [-0.7, 4.4, 4.7], size: [1.3, 3.6, 2.1], rotation: [0, 0, -11], pivot: [-0.05, 8.0, 5.7], colour: K.hairDark },
    { from: [-0.85, 1.8, 0.9], size: [1.2, 2.0, 2.6], rotation: [10, 0, -18], pivot: [-0.3, 3.8, 2.2], colour: K.hairDark },
    // A brow, out of the brow ridge, its outer end a little higher.
    { from: [0.8, 5.0, 7.85], size: [2.4, 0.9, 0.5], rotation: [0, 0, 4], pivot: [2, 5.45, 8.1], colour: K.hairDark },
    // The jaw's beard, running forward as it goes down; half the moustache, drooping to its end.
    { from: [-0.35, -0.6, 4.0], size: [0.95, 3.2, 4.3], rotation: [-14, 0, 6], pivot: [0.1, 2.6, 6.1], colour: K.hairDark },
    { from: [1.4, 2.05, 7.8], size: [2.7, 0.75, 0.6], rotation: [0, 0, 5], pivot: [4.1, 2.4, 8.1], colour: K.hairDark },
    // The crown's side, flaring out, its point and its ruby with it; the front corner point, leaning out and turned.
    { from: [-0.7, 8.1, -0.6], size: [0.75, 1.8, 9.2], rotation: [0, 0, 10], pivot: [-0.3, 8.1, 4], colour: K.gold },
    { from: [-0.8, 9.8, 3.3], size: [0.8, 1.3, 1.4], rotation: [0, 0, 14], pivot: [-0.3, 8.1, 4], colour: K.gold },
    { from: [-1.05, 8.5, 3.5], size: [0.6, 0.9, 1.0], rotation: [0, 0, 10], pivot: [-0.3, 8.1, 4], colour: K.ruby },
    { from: [-0.6, 9.8, 7.85], size: [1.4, 1.5, 0.8], rotation: [16, 0, -8], pivot: [0.1, 8.1, 8.3], colour: K.gold },
  ];
  return [...centre, ...left, ...left.map((b) => mirrorX(b))];
}

/**
 * The torso (8 x 12 x 4 under the head, z 2..6): the tunic, its shoulders sloping from the neck, a gold V collar over the skin,
 * the strap across with its buckle, the belt.
 */
export function kingTorsoBoxes(): Cuboid[] {
  const centre: Cuboid[] = [
    { from: [0, -12, 2], size: [8, 12, 4], colour: K.tunic },
    { from: [3.2, -2.3, 5.85], size: [1.6, 2.3, 0.3], colour: K.skin },
    // The strap from the viewer's right shoulder to the left hip: one long cuboid turned across the chest, front and back.
    { from: [3.2, -12.4, 5.75], size: [1.6, 13.5, 0.55], rotation: [0, 0, -32], pivot: [4, -5.6, 6], colour: K.leather },
    { from: [3.2, -12.4, 1.7], size: [1.6, 13.5, 0.55], rotation: [0, 0, 32], pivot: [4, -5.6, 2], colour: K.leatherDark },
    // The buckle: a gold square on its corner, a leather one inside it.
    { from: [2.7, -6.9, 6.05], size: [2.6, 2.6, 0.5], rotation: [0, 0, 45], colour: K.goldLight },
    { from: [3.35, -6.25, 6.3], size: [1.3, 1.3, 0.45], rotation: [0, 0, 45], colour: K.leatherDark },
    { from: [-0.1, -10.3, 1.9], size: [8.2, 1.2, 4.2], colour: K.leather },
  ];
  const left: Cuboid[] = [
    // The shoulder sloping down from the neck (a cuboid on the torso's top corner, turned about its inner end).
    { from: [-0.2, -0.9, 1.9], size: [3.4, 1.1, 4.2], rotation: [0, 0, 24], pivot: [3.2, 0, 4], colour: K.tunicDark },
    // The collar's side: a gold bar from the shoulder down to the V's point.
    { from: [2.1, -3.0, 5.8], size: [0.65, 3.1, 0.5], rotation: [0, 0, 26], pivot: [2.4, 0, 6], colour: K.gold },
  ];
  return [...centre, ...left, ...left.map((b) => mirrorX(b))];
}

/** An arm (`x0`, 4 wide): the sleeve, a gold cuff, the hand; its pauldron in three plates stepping down and out, ever steeper. */
export function kingArmBoxes(x0: number, outward: 1 | -1): Cuboid[] {
  return [
    { from: [x0, -12, 2], size: [4, 12, 4], colour: K.sleeve },
    { from: [x0, -12, 2], size: [4, 2.8, 4], colour: K.skin, inflate: 0.03 },
    { from: [x0, -9.2, 2], size: [4, 1.1, 4], colour: K.gold, inflate: 0.12 },
    { from: [x0 - 0.7, -1.1, 1.3], size: [5.4, 2.3, 5.4], rotation: [0, 0, -24 * outward], pivot: [x0 + 2, -0.1, 4], colour: K.gold },
    { from: [x0 - 0.85, -1.35, 1.15], size: [5.7, 0.55, 5.7], rotation: [0, 0, -24 * outward], pivot: [x0 + 2, -0.1, 4], colour: K.goldDark },
    { from: [x0 - 0.3, -2.9, 1.6], size: [4.7, 1.5, 4.8], rotation: [0, 0, -38 * outward], pivot: [x0 + 2, -1.8, 4], colour: K.gold },
    { from: [x0 + 0.1, -4.2, 1.9], size: [4.1, 1.2, 4.2], rotation: [0, 0, -50 * outward], pivot: [x0 + 2, -3.2, 4], colour: K.goldDark },
    { from: [x0 + 1.5, 0.9, 1.9], size: [1.0, 0.5, 4.2], rotation: [0, 0, -24 * outward], pivot: [x0 + 2, -0.1, 4], colour: K.goldLight },
  ];
}

/** Each pivot in the head's units (the catalogue bust's): the hips, the neck, the shoulders. */
const PIVOTS = {
  torso: [4, -12, 4] as [number, number, number],
  head: [4, 0, 4] as [number, number, number],
  armRight: [-2, -2, 4] as [number, number, number],
  armLeft: [10, -2, 4] as [number, number, number],
};

export interface BoxAvatarOptions {
  /** The painted backdrop, drawn as the scene's background (so the ambient occlusion and the frame see one picture). */
  backdrop?: string;
  /** Screen-space ambient occlusion (GTAO): where cubes meet. On by default; "debug" shows the occlusion alone. */
  ao?: boolean | "debug";
  pixelRatio?: number;
  random?: () => number;
}

/**
 * The king as free cuboids, living: one WebGL context, the rig's idle and emotes (`avatar-rig.ts`'s clips), a blink, the mouth an
 * emote shows painted on the head cube (the catalogue's mouths: the head's textures swap).
 */
export class BoxAvatar {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-10, 10, 10, -10, 1, 200);
  private readonly root = new Group();
  private readonly pivots = { torso: new Group(), head: new Group(), armRight: new Group(), armLeft: new Group() };
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
  frameMs = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly avatar: Avatar,
    private readonly options: BoxAvatarOptions = {},
  ) {
    this.glances = new Glances(options.random ?? Math.random, 4.5);
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;width:100%;height:100%";
    container.appendChild(this.canvas);
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, options.pixelRatio ?? window.devicePixelRatio ?? 1));
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    if (options.backdrop) {
      new TextureLoader().load(options.backdrop, (texture) => {
        texture.colorSpace = SRGBColorSpace;
        this.scene.background = texture;
        this.request();
        this.owned.push(texture);
      });
    }
    // The lights of the HD study: a sky fill, a key on the side the face turns to (soft shadows), a warm rim behind.
    this.scene.add(new HemisphereLight(0xc4dcf0, 0x8a6c50, 1.7));
    const key = new SpotLight(0xffe0ae, 175, 0, 0.6, 1, 1);
    key.position.set(14, 28, 25);
    key.target.position.set(0, 2, 0);
    this.scene.add(key.target);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 3;
    key.shadow.intensity = 0.5;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.03;
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 80;
    this.scene.add(key);
    const rim = new DirectionalLight(0xffc98a, 0.9);
    rim.position.set(-10, 6, -12);
    this.scene.add(rim);
    this.scene.add(this.root);
    this.root.rotation.y = 0.32;
    this.root.add(this.pivots.torso);
    for (const part of ["head", "armRight", "armLeft"] as const) this.pivots.torso.add(this.pivots[part]);
    this.build();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (options.ao !== false) {
      const ao = new GTAOPass(this.scene, this.camera, 512, 512);
      ao.updateGtaoMaterial({ radius: 3.2, distanceExponent: 1.6, thickness: 6, scale: 2.2, samples: 16 });
      ao.blendIntensity = 1;
      if (options.ao === "debug") ao.output = GTAOPass.OUTPUT.Denoise;
      this.composer.addPass(ao);
    }
    this.composer.addPass(new OutputPass());
    this.camera.position.set(0, 3.4 + Math.sin(0.06) * 60, Math.cos(0.06) * 60);
    this.camera.lookAt(0, 3.4, 0);
    this.resize();
    this.request();
  }

  play(emote: Emote): void {
    this.emote = { name: emote, start: this.now() };
    this.request();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    for (const item of this.owned) item.dispose();
    for (const materials of this.heads.values()) for (const m of materials) (m.map?.dispose(), m.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private now() {
    return (performance.now() - this.start) / 1000;
  }

  private build() {
    const material = cuboidMaterial();
    this.owned.push(material);
    const place = (part: keyof typeof PIVOTS, boxes: Cuboid[]) => {
      const geometry = cuboidGeometry(boxes, PIVOTS[part]);
      this.owned.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      this.pivots[part].add(mesh);
    };
    const P = PIVOTS;
    this.pivots.torso.position.set(0, P.torso[1] - P.head[1], 0);
    this.pivots.head.position.set(P.head[0] - P.torso[0], P.head[1] - P.torso[1], 0);
    // The head a fifth larger than the body's proportion (the target's), about the neck.
    this.pivots.head.scale.setScalar(1.2);
    this.pivots.armRight.position.set(P.armRight[0] - P.torso[0], P.armRight[1] - P.torso[1], 0);
    this.pivots.armLeft.position.set(P.armLeft[0] - P.torso[0], P.armLeft[1] - P.torso[1], 0);
    place("torso", kingTorsoBoxes());
    place("armRight", kingArmBoxes(-4, -1));
    place("armLeft", kingArmBoxes(8, 1));
    place("head", kingHeadBoxes());
    // The head cube, painted with the catalogue's face grids (the crown left to the cuboids); a set per mouth an emote shows.
    const painted = { ...this.avatar, headwear: 0 };
    this.heads.set(undefined, headMaterials(painted, kingFront()));
    for (const mouth of [GRIN, OPEN, FROWN]) this.heads.set(mouth, headMaterials({ ...painted, mouth }, kingFront(mouth)));
    const cube = cuboidGeometry([{ from: [0, 0, 0], size: [HEAD, HEAD, HEAD], colour: 0xffffff, inflate: 0 }], P.head);
    // A single box's six faces, one material each (the geometry's groups, in FACE_QUADS' order, which is three's).
    for (let f = 0; f < 6; f++) cube.addGroup(f * 6, 6, f);
    this.owned.push(cube);
    this.headMesh = new Mesh(cube, this.heads.get(undefined)! as Material[]);
    this.headMesh.castShadow = this.headMesh.receiveShadow = true;
    this.pivots.head.add(this.headMesh);
    // The eyelids: the skin's shade over the eyes' row, a hair in front of the face.
    const skin = buildHead(painted).get(0, 0, HEAD - 1) ?? 0xd89357;
    const lid = new MeshLambertMaterial({ color: new Color().setHex(shade(skin, 0.9), SRGBColorSpace) });
    this.owned.push(lid);
    for (const x of [2, 6]) {
      const plane = new PlaneGeometry(2, 1.15);
      this.owned.push(plane);
      const mesh = new Mesh(plane, lid);
      mesh.position.set(x - P.head[0], 4.5 - P.head[1], HEAD - P.head[2] + 0.02);
      this.lids.add(mesh);
    }
    this.lids.visible = false;
    this.pivots.head.add(this.lids);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const half = 15.2;
    const aspect = w / h;
    Object.assign(this.camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.camera.updateProjectionMatrix();
  }

  /** The next frame, once: every frame while the idle runs, under reduced motion only when something changes. */
  private request() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(this.tick);
  }

  private pose(t: number, dt: number): Pose {
    let pose = idle(t);
    pose.head = [pose.head[0], pose.head[1] + this.glances.update(t, dt), pose.head[2]];
    if (this.emote) {
      const into = t - this.emote.start;
      const length = EMOTE_S[this.emote.name];
      if (into >= length) this.emote = null;
      else {
        const target = emotePose(this.emote.name, into);
        pose = blend(pose, { ...target, lift: target.lift + pose.lift * 0.5 }, envelope(into, length));
      }
    }
    return pose;
  }

  private readonly tick = () => {
    this.frame = 0;
    const t = this.now();
    const dt = Math.min(0.1, t - this.last);
    this.last = t;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pose = reduced ? REST : this.pose(t, dt);
    const P = PIVOTS;
    this.pivots.torso.position.y = P.torso[1] - P.head[1] + pose.lift;
    this.pivots.torso.rotation.set(pose.torso[0], pose.torso[1] - 0.14, pose.torso[2]);
    this.pivots.head.rotation.set(pose.head[0], pose.head[1] + 0.08, pose.head[2]);
    this.pivots.armRight.rotation.set(...pose.armRight);
    this.pivots.armLeft.rotation.set(...pose.armLeft);
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
    const start = performance.now();
    this.composer.render();
    this.frameMs = performance.now() - start;
    if (!reduced) this.request();
  };
}
