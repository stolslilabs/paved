import { describe, expect, it } from "vitest";
import { Euler, Quaternion, Vector3 } from "three";
import type { Cuboid } from "../src/core/avatar/avatar-cuboids";
import { contrast, distance } from "../src/core/avatar/avatar-colour";
import { aimHead, KING_VIEW, kingParts, makeRig, poseRig, TRACK } from "../src/core/avatar/avatar-king";
import { blend, EMOTE_S, EMOTES, emotePose, envelope, idle, REST, type Emote } from "../src/core/avatar/avatar-poses";
import { C, families, headPalette, KING_TRAITS, outfitTones, SHAPE_TRAITS, TRACK_LIMITS, trackLimits, TRAIT_OPTIONS, traitsFrom, traitsText, type Traits } from "../src/core/avatar/avatar-traits";
import { boxMatrix, coplanarFaces, cornersOf, excess, kingCamera, PARTS, partMatrices, type Part, type Sample } from "./helpers/avatar-geometry";

/** Every combination of the given traits' values, the king's for the others. */
function* product<K extends keyof Traits>(keys: readonly K[]): Generator<Pick<Traits, K>> {
  if (keys.length === 0) return yield {} as Pick<Traits, K>;
  const [head, ...rest] = keys;
  for (const value of TRAIT_OPTIONS[head!]) for (const tail of product(rest)) yield { [head!]: value, ...tail } as Pick<Traits, K>;
}
const combos = <K extends keyof Traits>(keys: readonly K[]) => [...product(keys)].map((s) => ({ ...KING_TRAITS, ...s }) as Traits);
/** Every shape the head and shoulders can take (the colours change no cuboid). */
const SHAPES = combos(SHAPE_TRAITS);
const idOf = (t: Traits) => traitsText(t) || "king";

// The poses: the rest, each emote at 25 moments, and for each set of the neck's limits the combinations have, its corners, edges
// and middle (the yaw from the shoulders' own turn), alone and within emotes, where the cursor keeps a fifth of its pull. A
// combination is judged on the rest, the emotes and the samples of its own limits.
const withEmote = (e: Emote, t: number) => {
  const base = idle(t);
  const target = emotePose(e, t);
  const w = envelope(t, EMOTE_S[e]);
  return { pose: blend(base, { ...target, lift: target.lift + base.lift * 0.5 }, w), emoteWeight: w };
};
const ALL = "all";
const limitsKey = (t: Traits) => JSON.stringify(trackLimits(t));
const SAMPLES: (Sample & { tag: string })[] = [{ label: "rest", pose: idle(0), emoteWeight: 0, tag: ALL }];
for (const e of EMOTES) for (let k = 0; k <= 24; k++) SAMPLES.push({ label: `${e}@${((k / 24) * EMOTE_S[e]).toFixed(2)}`, ...withEmote(e, (k / 24) * EMOTE_S[e]), tag: ALL });
const SHOULDERS = KING_VIEW.yaw + KING_VIEW.torso;
for (const tag of new Set(SHAPES.map(limitsKey))) {
  const L = JSON.parse(tag) as typeof TRACK_LIMITS;
  for (const y of [-L.yaw, -L.yaw / 2, 0, L.yaw / 2, L.yaw])
    for (const p of [L.pitchMin, 0, L.pitchMax / 2, L.pitchMax]) SAMPLES.push({ label: `aim(${y.toFixed(2)},${p.toFixed(2)})`, pose: idle(0), emoteWeight: 0, aim: [SHOULDERS + y, p, 1], tag });
  for (const e of EMOTES)
    for (const k of [0.25, 0.5, 0.75])
      for (const y of [-L.yaw, L.yaw])
        for (const p of [L.pitchMin, L.pitchMax]) SAMPLES.push({ label: `${e}@${k}+aim(${y.toFixed(2)},${p.toFixed(2)})`, ...withEmote(e, k * EMOTE_S[e]), aim: [SHOULDERS + y, p, 0.2], tag });
}

// The union of the cuboids the combinations draw, each once (keyed by its part, name and shape: a recoloured cuboid is the same).
interface Entry { key: string; part: Part; box: Cuboid }
const keyOf = (part: Part, b: Cuboid) => `${part}:${b.name ?? "?"}|${JSON.stringify([b.from, b.size, b.rotation ?? null, b.pivot ?? null])}`;
const ENTRIES = new Map<string, Entry>();
const KEYS = new Map<Traits, Set<string>>();
for (const t of SHAPES) {
  const parts = kingParts(t);
  const keys = new Set<string>();
  for (const part of PARTS)
    for (const box of parts[part]) {
      const key = keyOf(part, box);
      keys.add(key);
      if (!ENTRIES.has(key)) ENTRIES.set(key, { key, part, box });
    }
  KEYS.set(t, keys);
}
const short = (key: string) => key.split("|")[0]!;

/**
 * The frame: the badge's circle, radius 1. At rest and while the head follows the cursor nothing crosses it; in an emote (a hop,
 * a nod) a tip may cross it by up to 6 % of its radius for a moment, under the badge's ring.
 */
const FRAME = { still: 1.0, emote: 1.06 };
/**
 * The sweeps' ceilings. Measured on the Mac (12 cores, load 2.6, 2026-10-31): the faces 0.39 s, the contacts 0.30 s, the circle
 * 0.20 s, the colours (75,000 combinations) 3.3 s, the whole file 4.7 s at a 352 MB peak; vitest's 5 s default would leave the
 * colours no margin on a loaded runner.
 */
const SWEEP_MS = 10_000;
const COLOURS_MS = 30_000;

describe("the avatar's traits", () => {
  it("reads and writes its traits as text, the king's left out, what it does not know ignored", () => {
    expect(traitsText(KING_TRAITS)).toBe("");
    expect(traitsFrom("")).toEqual(KING_TRAITS);
    const wizard: Traits = { ...KING_TRAITS, beard: "long", headwear: "wizard", eyes: "green" };
    expect(traitsFrom(traitsText(wizard))).toEqual(wizard);
    expect(traitsFrom("beard-long.beard-purple.cape-red.__proto__-x.constructor-y")).toEqual({ ...KING_TRAITS, beard: "long" });
    for (const t of SHAPES) expect(traitsFrom(traitsText(t))).toEqual(t);
  });

  it("narrows the neck's limits for what hangs below the chin, and only for that", () => {
    expect(trackLimits(KING_TRAITS)).toEqual(TRACK_LIMITS);
    expect(trackLimits({ ...KING_TRAITS, beard: "long" })).toEqual({ yaw: 0.4, pitchMin: TRACK_LIMITS.pitchMin, pitchMax: 0.3 });
    expect(trackLimits({ ...KING_TRAITS, beard: "goatee" })).toEqual({ ...TRACK_LIMITS, yaw: 0.5 });
    expect(new Set(SHAPES.map(limitsKey)).size).toBe(3);
  });

  it("has no two faces of one plane overlap where they show, in any combination of shapes", () => {
    const rest = partMatrices(SAMPLES[0]!);
    const failures: string[] = [];
    // The faces depend on the head's layers and on whether there are pauldrons (their colour changes nothing).
    const seen = new Set<string>();
    for (const t of SHAPES) {
      const id = `${t.hairStyle}.${t.beard}.${t.headwear}.${t.accessory}.${t.pauldrons === "none" ? "none" : "some"}`;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const pair of coplanarFaces(kingParts(t), rest)) failures.push(`${idOf(t)}: ${pair}`);
    }
    expect(seen.size).toBe(3 * 5 * 6 * 4 * 2);
    expect(failures).toEqual([]);
  }, SWEEP_MS);

  it("has nothing go into the head or what it wears: in each emote, at the neck's limits, or both", () => {
    const all = [...ENTRIES.values()];
    const local = all.map((e) => boxMatrix(e.box));
    // The worst depth of each pair of cuboids, by the samples' tag.
    const hits = new Map<string, { a: string; b: string; tag: string; depth: number; sample: string }>();
    for (const s of SAMPLES) {
      const m = partMatrices(s);
      const world = all.map((e, i) => m[e.part].clone().multiply(local[i]!));
      const corners = all.map((e, i) => cornersOf(e.box, world[i]!));
      const bounds = corners.map((c) => {
        const lo = c[0]!.clone(), hi = c[0]!.clone();
        for (const p of c) (lo.min(p), hi.max(p));
        return [lo, hi] as const;
      });
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const A = all[i]!, B = all[j]!;
          // Within a part the cuboids are placed by hand; between two body parts the pauldrons ride on their arm by design.
          if (A.part === B.part || (A.part !== "head" && B.part !== "head")) continue;
          const [la, ha] = bounds[i]!, [lb, hb] = bounds[j]!;
          if (la.x > hb.x || lb.x > ha.x || la.y > hb.y || lb.y > ha.y || la.z > hb.z || lb.z > ha.z) continue;
          const depth = excess(A.part, A.box, corners[i]!, world[i]!, B.part, B.box, corners[j]!, world[j]!);
          if (depth <= 0) continue;
          const k = `${A.key}~${B.key}~${s.tag}`;
          if (depth > (hits.get(k)?.depth ?? 0)) hits.set(k, { a: A.key, b: B.key, tag: s.tag, depth, sample: s.label });
        }
    }
    const failures: string[] = [];
    for (const t of SHAPES) {
      const keys = KEYS.get(t)!;
      const own = new Set([ALL, limitsKey(t)]);
      for (const h of hits.values()) if (own.has(h.tag) && keys.has(h.a) && keys.has(h.b)) failures.push(`${idOf(t)}: ${short(h.a)} <-> ${short(h.b)} ${h.depth.toFixed(2)} at ${h.sample}`);
    }
    expect(failures.slice(0, 20)).toEqual([]);
  }, SWEEP_MS);

  it("keeps the head and what it wears inside the badge's circle", () => {
    const camera = kingCamera();
    const heads = [...ENTRIES.values()].filter((e) => e.part === "head");
    // Each head cuboid's farthest upper-half corner from the circle's middle, by the samples' tag: still (the rest and the
    // tracking alone) and in any sample. The circle crops the bust's lower half by design.
    const reach = new Map<string, { still: number; any: number; at: string }>();
    const v = new Vector3();
    for (const s of SAMPLES) {
      const m = partMatrices(s);
      const still = s.emoteWeight === 0;
      for (const e of heads) {
        const k = `${e.key}~${s.tag}`;
        const r = reach.get(k) ?? { still: 0, any: 0, at: "" };
        for (const c of cornersOf(e.box, m.head.clone().multiply(boxMatrix(e.box)))) {
          v.copy(c).project(camera);
          if (v.y < 0) continue;
          const d = Math.hypot(v.x, v.y);
          if (still) r.still = Math.max(r.still, d);
          if (d > r.any) Object.assign(r, { any: d, at: s.label });
        }
        reach.set(k, r);
      }
    }
    const failures: string[] = [];
    for (const t of SHAPES) {
      const own = [ALL, limitsKey(t)];
      for (const key of KEYS.get(t)!)
        for (const tag of own) {
          const r = reach.get(`${key}~${tag}`);
          if (r && (r.still > FRAME.still || r.any > FRAME.emote)) failures.push(`${idOf(t)}: ${short(key)} still ${r.still.toFixed(3)}, ${r.any.toFixed(3)} at ${r.at}`);
        }
    }
    expect(failures.slice(0, 20)).toEqual([]);
  }, SWEEP_MS);

  it("keeps each feature readable on what it sits on, in every combination of colours", () => {
    const mean = (tones: readonly number[]) => {
      const c = [0, 0, 0];
      for (const t of tones) (c[0]! += (t >> 16) & 255, c[1]! += (t >> 8) & 255, c[2]! += t & 255);
      return c.map((x) => Math.round(x / tones.length)).reduce((a, x) => (a << 8) | x, 0);
    };
    // The headwear's main tone over the hair (the hood covers the hair: only the brows and the beard show, read on the skin).
    const HEADWEAR: Partial<Record<Traits["headwear"], number>> = { crown: C.gold, helmet: 0x737c87, wizard: 0x343a86, feathered: 0x3f6b35 };
    const STRAP = 0x6e3e27;
    const PAULDRON = 0xdf9334;
    const failures: string[] = [];
    const all = combos(["skin", "hair", "eyes", "outfit", "pauldrons", "headwear", "beard"] as const);
    for (const t of all) {
      const p = headPalette(t);
      const f = families(t);
      const tunic = mean(outfitTones(t).tunic);
      const skin = mean(p.skin);
      const checks: [string, number, number][] = [
        ["pupil on the eye's white (contrast)", contrast(p.pupil, p.eyeWhite), 3],
        ["brow on the skin", distance(p.brow, skin), 0.1],
        ["beard on the skin", distance(mean(p.beard), skin), 0.1],
        t.beard === "none" ? ["mouth on the skin", distance(p.mouth, skin), 0.1] : ["moustache on the mouth", distance(p.moustache, p.mouth), 0.1],
        ["outfit on the strap", distance(tunic, STRAP), 0.08],
        ["outfit by the skin", distance(tunic, skin), 0.08],
      ];
      const wear = HEADWEAR[t.headwear];
      if (wear !== undefined) checks.push(["hair under the headwear", distance(mean(p.hair), t.headwear === "helmet" ? f.steel(wear) : wear), 0.08]);
      if (t.pauldrons !== "none") checks.push(["pauldron on the outfit", distance(f.pauldron(PAULDRON), tunic), 0.1], ["pauldron on the strap", distance(f.pauldron(PAULDRON), STRAP), 0.08]);
      for (const [check, value, limit] of checks) if (value < limit) failures.push(`${idOf(t)}: ${check} ${value.toFixed(3)} < ${limit}`);
    }
    expect(all.length).toBe(5 * 5 * 5 * 5 * 4 * 6 * 5);
    expect(failures.slice(0, 20)).toEqual([]);
  }, COLOURS_MS);
});

describe("the avatar's head, following the cursor", () => {
  const rig = makeRig();
  rig.root.rotation.y = KING_VIEW.yaw;
  const posed = () => {
    poseRig(rig, REST, KING_VIEW, 1, 0);
    rig.root.updateMatrixWorld(true);
  };
  const turn = () => rig.pivots.head.getWorldQuaternion(new Quaternion());
  /** The face's direction (the head's +z) and its across axis (+x), in the bust's frame. */
  const axes = (q: Quaternion) => ({ front: new Vector3(0, 0, 1).applyQuaternion(q), across: new Vector3(1, 0, 0).applyQuaternion(q) });

  it("leaves the pose's own head at no weight", () => {
    posed();
    const before = turn();
    aimHead(rig, KING_VIEW, 0.9, 0.3, 0);
    expect(turn().angleTo(before)).toBeLessThan(1e-6);
  });

  it("turns the face to the aim, in the camera's frame, with no roll", () => {
    posed();
    const rest = turn();
    // The pose's own motion from the head's rest (the bust's turn), which rides on top of the aim.
    const motion = new Quaternion().setFromEuler(new Euler(0, KING_VIEW.yaw + 0.02, 0, "YXZ")).invert().multiply(rest);
    for (const yaw of [-0.2, 0.3, 0.9])
      for (const pitch of [-0.3, 0, 0.4]) {
        posed();
        aimHead(rig, KING_VIEW, yaw, pitch, 1);
        const want = new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, "YXZ")).multiply(motion);
        expect(turn().angleTo(want)).toBeLessThan(1e-4);
        // Looking down while turned does not tilt the head sideways: the across axis stays as level as at rest.
        expect(Math.abs(axes(turn()).across.y - axes(rest).across.y)).toBeLessThan(0.02);
      }
  });

  it("lets the torso take its share of the turn", () => {
    posed();
    const torso = rig.pivots.torso.rotation.y;
    aimHead(rig, KING_VIEW, KING_VIEW.yaw + 0.02 + 0.5, 0, 1);
    expect(rig.pivots.torso.rotation.y - torso).toBeCloseTo(0.5 * TRACK.torso, 6);
  });
});
