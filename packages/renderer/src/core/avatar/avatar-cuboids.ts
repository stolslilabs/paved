import { BufferGeometry, Color, Euler, Float32BufferAttribute, Matrix3, Matrix4, SRGBColorSpace, Vector3 } from "three";

/**
 * The avatar's cuboids: the king is built as Blockbench builds a Minecraft model, a head cube of 8 and free cuboids around it
 * (any size, anywhere, turned about their own pivot, biting into each other), every face a mosaic of unit tiles.
 */

/** The head cube's side, in units (one per Minecraft pixel). */
export const HEAD = 8;

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

/** The cuboid mirrored across the head's middle (x = 4): the viewer's left drawn on the right. */
export const mirrorX = (b: Cuboid, about = HEAD / 2): Cuboid => ({
  ...b,
  from: [2 * about - b.from[0] - b.size[0], b.from[1], b.from[2]],
  rotation: b.rotation ? [b.rotation[0], -b.rotation[1], -b.rotation[2]] : undefined,
  pivot: b.pivot ? [2 * about - b.pivot[0], b.pivot[1], b.pivot[2]] : undefined,
});
