/**
 * The geometry the avatar's trait checks read (`avatar-traits.test.ts`): each part's matrix at a sample of the rig (a pose, an
 * emote's weight, an aim), a cuboid's corners, how far two boxes go into each other, and the faces of one plane that overlap.
 */
import { Euler, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { inflateOf, type Cuboid } from "../../src/core/avatar/avatar-cuboids";
import { aimHead, KING_VIEW, kingPaintedBoxes, makeRig, PART_SALT, PIVOTS, poseRig } from "../../src/core/avatar/avatar-king";
import type { Pose } from "../../src/core/avatar/avatar-poses";

export type Part = keyof typeof PIVOTS;
export const PARTS = Object.keys(PIVOTS) as Part[];
export interface Sample {
  label: string;
  pose: Pose;
  emoteWeight: number;
  /** The head's aim: its yaw and pitch from the camera's axis, and the aim's weight. */
  aim?: [number, number, number];
}

const rig = makeRig();
rig.root.rotation.y = KING_VIEW.yaw;
/** Each part's matrix (model units to the bust's frame) at a sample. */
export function partMatrices(s: Sample): Record<Part, Matrix4> {
  poseRig(rig, s.pose, KING_VIEW, 1, s.emoteWeight);
  if (s.aim) aimHead(rig, KING_VIEW, s.aim[0], s.aim[1], s.aim[2]);
  rig.root.updateMatrixWorld(true);
  const m = {} as Record<Part, Matrix4>;
  for (const part of PARTS) m[part] = rig.pivots[part].matrixWorld.clone().multiply(new Matrix4().makeTranslation(-PIVOTS[part][0], -PIVOTS[part][1], -PIVOTS[part][2]));
  return m;
}

/** A cuboid's own matrix (its turn about its pivot), in model units. */
export function boxMatrix(b: Cuboid): Matrix4 {
  const [w, h, d] = b.size;
  const pivot = b.pivot ?? [b.from[0] + w / 2, b.from[1] + h / 2, b.from[2] + d / 2];
  const [rx, ry, rz] = (b.rotation ?? [0, 0, 0]).map((a) => (a * Math.PI) / 180) as [number, number, number];
  return new Matrix4().makeTranslation(pivot[0], pivot[1], pivot[2]).multiply(new Matrix4().makeRotationFromEuler(new Euler(rx, ry, rz))).multiply(new Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
}

/** A cuboid's eight corners through a matrix. */
export function cornersOf(b: Cuboid, m: Matrix4): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < 8; i++) out.push(new Vector3(b.from[0] + (i & 1 ? b.size[0] : 0), b.from[1] + (i & 2 ? b.size[1] : 0), b.from[2] + (i & 4 ? b.size[2] : 0)).applyMatrix4(m));
  return out;
}

/** How far two convex boxes (8 corners each) go into each other: the least overlap over the separating axes (0: apart). */
export function penetration(a: Vector3[], b: Vector3[]): number {
  const edges = (c: Vector3[]) => [c[1]!.clone().sub(c[0]!), c[2]!.clone().sub(c[0]!), c[4]!.clone().sub(c[0]!)];
  const ea = edges(a);
  const eb = edges(b);
  const axes: Vector3[] = [];
  const add = (v: Vector3) => {
    const l = v.length();
    if (l > 1e-6) axes.push(v.divideScalar(l));
  };
  for (const [x, y] of [[0, 1], [1, 2], [2, 0]] as const) {
    add(ea[x]!.clone().cross(ea[y]!));
    add(eb[x]!.clone().cross(eb[y]!));
  }
  for (const x of ea) for (const y of eb) add(x.clone().cross(y));
  let least = Infinity;
  for (const axis of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of a) { const d = p.dot(axis); a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const p of b) { const d = p.dot(axis); b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    if (overlap <= 0) return 0;
    least = Math.min(least, overlap);
  }
  return least;
}

/** How deep any corner of `a` (world corners) goes into the box `b` (its cuboid and its world matrix): 0 when none is inside. */
export function vertexDepth(a: Vector3[], b: Cuboid, mb: Matrix4): number {
  const inv = mb.clone().invert();
  let deepest = 0;
  const q = new Vector3();
  for (const p of a) {
    q.copy(p).applyMatrix4(inv);
    const d = Math.min(q.x - b.from[0], b.from[0] + b.size[0] - q.x, q.y - b.from[1], b.from[1] + b.size[1] - q.y, q.z - b.from[2], b.from[2] + b.size[2] - q.z);
    deepest = Math.max(deepest, d);
  }
  return deepest;
}

/** The head's foot: its lowest band (head units 0 to 1.2), which rests on the shoulders as the target draws it. */
const isFoot = (part: Part, b: Cuboid) => part === "head" && b.from[1] >= -0.05 && b.from[1] < 1.2;
const SHOULDERS = new Set<Part>(["pauldronRight", "pauldronLeft", "armRight", "armLeft"]);
/** How far the foot may sink into a shoulder's top (the plates rise 0.65 over it; at rest the side beard is 0.34 in). */
export const FOOT_SINK = 0.7;
/** The strict limit for every other contact. */
export const DEPTH = 0.05;

/**
 * A contact's depth beyond what is allowed, or 0: the head's foot against a shoulder by how deep a corner sinks (beyond
 * `FOOT_SINK`), anything else by the separating axes (beyond `DEPTH`). The separating axes alone saturate at a thin block's
 * thickness, so a foot resting on a plate would read as deep as one through it.
 */
export function excess(pa: Part, a: Cuboid, ca: Vector3[], ma: Matrix4, pb: Part, b: Cuboid, cb: Vector3[], mb: Matrix4): number {
  const sat = penetration(ca, cb);
  if (sat <= DEPTH) return 0;
  if ((isFoot(pa, a) && SHOULDERS.has(pb)) || (isFoot(pb, b) && SHOULDERS.has(pa))) {
    const sink = Math.max(vertexDepth(ca, b, mb), vertexDepth(cb, a, ma));
    return sink > FOOT_SINK ? sink : 0;
  }
  return sat;
}

/** The camera, as `KingAvatar.setView` places it: the badge's circle is the canvas's inscribed circle (radius 1 in NDC). */
export function kingCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(KING_VIEW.fov, 1, Math.max(1, KING_VIEW.distance - 40), KING_VIEW.distance + 40);
  camera.position.set(KING_VIEW.pan, KING_VIEW.target + Math.sin(KING_VIEW.pitch) * KING_VIEW.distance, Math.cos(KING_VIEW.pitch) * KING_VIEW.distance);
  camera.lookAt(KING_VIEW.pan, KING_VIEW.target, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

interface Face { part: Part; name: string; n: Vector3; d: number; c: Vector3[] }
interface Solid { part: Part; name: string; inv: Matrix4; min: Vector3; max: Vector3 }
const QUADS = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
] as const;

/**
 * The faces that would flicker, at the matrices of one sample: two faces of one plane, facing one way, that overlap by more than
 * 0.001 square units (each cuboid inflated as it is drawn), unless the overlap is inside a third solid, where it is never seen.
 * The painted tunic and head cube count too.
 */
export function coplanarFaces(parts: Record<Part, Cuboid[]>, m: Record<Part, Matrix4>): string[] {
  const faces: Face[] = [];
  const solids: Solid[] = [];
  const add = (part: Part, b: Cuboid, index: number) => {
    const e = b.inflate ?? inflateOf(index, PART_SALT[part]);
    const w = m[part].clone().multiply(boxMatrix(b));
    const lo = new Vector3(b.from[0] - e, b.from[1] - e, b.from[2] - e);
    const sz = new Vector3(b.size[0] + 2 * e, b.size[1] + 2 * e, b.size[2] + 2 * e);
    solids.push({ part, name: b.name ?? `#${index}`, inv: w.clone().invert(), min: lo, max: lo.clone().add(sz) });
    for (const q of QUADS) {
      const c = q.c.map(([x, y, z]) => new Vector3(lo.x + x * sz.x, lo.y + y * sz.y, lo.z + z * sz.z).applyMatrix4(w));
      const n = new Vector3(...q.n).transformDirection(w);
      faces.push({ part, name: b.name ?? `#${index}`, n, d: n.dot(c[0]!), c });
    }
  };
  for (const part of PARTS) parts[part].forEach((b, i) => add(part, b, i));
  for (const { part, box } of kingPaintedBoxes()) add(part, box, -1);
  const inside = (p: Vector3, skip: Set<string>) =>
    solids.some((s) => {
      if (skip.has(`${s.part}:${s.name}`)) return false;
      const q = p.clone().applyMatrix4(s.inv);
      return q.x > s.min.x + 0.004 && q.y > s.min.y + 0.004 && q.z > s.min.z + 0.004 && q.x < s.max.x - 0.004 && q.y < s.max.y - 0.004 && q.z < s.max.z - 0.004;
    });
  const buckets = new Map<string, Face[]>();
  for (const f of faces) {
    const k = [f.n.x, f.n.y, f.n.z].map((x) => Math.round(x * 100)).join(",");
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(f);
  }
  const out: string[] = [];
  for (const list of buckets.values()) {
    list.sort((a, b) => a.d - b.d);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const fa = list[i]!, fb = list[j]!;
        if (fb.d - fa.d > 0.00025) break;
        if (fa.name === fb.name && fa.part === fb.part) continue;
        if (fa.n.dot(fb.n) < 0.9999) continue;
        const n = fa.n;
        const u = n.clone().cross(Math.abs(n.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0)).normalize();
        const v = n.clone().cross(u);
        const poly = (f: Face) => f.c.map((p) => [p.dot(u), p.dot(v)] as [number, number]);
        const { area, cx, cy } = areaOf(clip(poly(fa), poly(fb)));
        if (area <= 1e-3) continue;
        const point = u.clone().multiplyScalar(cx).add(v.clone().multiplyScalar(cy)).add(n.clone().multiplyScalar(fa.d));
        if (inside(point, new Set([`${fa.part}:${fa.name}`, `${fb.part}:${fb.name}`]))) continue;
        out.push(`${fa.part}:${fa.name} <-> ${fb.part}:${fb.name} (${area.toFixed(3)})`);
      }
  }
  return out;
}

/** Sutherland-Hodgman: the convex polygon `a` clipped by the convex polygon `b` (either winding). */
function clip(a: [number, number][], b: [number, number][]): [number, number][] {
  const sign = Math.sign(areaOf(b).signed) || 1;
  let poly = a;
  for (let i = 0; i < b.length && poly.length; i++) {
    const [p, q] = [b[i]!, b[(i + 1) % b.length]!];
    const side = (r: [number, number]) => sign * ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    const next: [number, number][] = [];
    for (let j = 0; j < poly.length; j++) {
      const [s, e] = [poly[j]!, poly[(j + 1) % poly.length]!];
      const [ds, de] = [side(s), side(e)];
      if (ds >= 0) next.push(s);
      if (ds >= 0 !== de >= 0) {
        const t = ds / (ds - de);
        next.push([s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t]);
      }
    }
    poly = next;
  }
  return poly;
}

function areaOf(p: [number, number][]) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]!, [x1, y1] = p[(i + 1) % p.length]!;
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  return { signed: a / 2, area: Math.abs(a / 2), cx: a ? cx / (3 * a) : 0, cy: a ? cy / (3 * a) : 0 };
}
