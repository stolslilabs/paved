import { describe, expect, it } from "vitest";
import { Euler, Quaternion, Vector3 } from "three";
import type { Cuboid } from "../src/core/avatar/avatar-cuboids";
import { contrast, distance } from "../src/core/avatar/avatar-colour";
import { aimHead, KING_VIEW, kingParts, makeRig, poseRig, TRACK } from "../src/core/avatar/avatar-king";
import { blend, EMOTE_S, EMOTES, emotePose, envelope, idle, REST, type Emote } from "../src/core/avatar/avatar-poses";
import { BODY_TRAITS, families, HEAD_TRAITS, headPalette, KING_TRAITS, outfitTones, SHAPE_TRAITS, TRACK_LIMITS, trackLimits, TRAIT_OPTIONS, traitsFrom, traitsText, type Traits } from "../src/core/avatar/avatar-traits";
import { boxMatrix, coplanarFaces, cornersOf, excess, kingCamera, PARTS, partMatrices, type Part, type Sample } from "./helpers/avatar-geometry";

/** Every combination of the given traits' values, the king's for the others. */
function* product<K extends keyof Traits>(keys: readonly K[]): Generator<Pick<Traits, K>> {
  if (keys.length === 0) return yield {} as Pick<Traits, K>;
  const [head, ...rest] = keys;
  for (const value of TRAIT_OPTIONS[head!]) for (const tail of product(rest)) yield { [head!]: value, ...tail } as Pick<Traits, K>;
}
const combos = <K extends keyof Traits>(keys: readonly K[]) => [...product(keys)].map((s) => ({ ...KING_TRAITS, ...s }) as Traits);
const idOf = (t: Traits) => traitsText(t) || "king";

// The shapes split in two: the head's (hair style, beard, headwear, accessory) and the body's (outfit, pauldrons, and the
// accessory again: the medal is the chest's). A look is a head and a body of the same accessory: the checks run on each head
// and each body once, then judge every look from them, never building the looks one by one.
const HEADS = combos(HEAD_TRAITS);
const BODIES = combos(BODY_TRAITS);
const look = (head: Traits, body: Traits): Traits => ({ ...head, outfit: body.outfit, pauldrons: body.pauldrons });
const LOOKS = HEADS.length * BODIES.filter((b) => b.accessory === KING_TRAITS.accessory).length;

// The neck's limits: a look's are the widest narrowed by each of its traits (`trackLimits`), its head's and its body's.
const limitsKey = (t: Traits) => JSON.stringify(trackLimits(t));
const TAGS = new Set<string>();
for (const head of HEADS) for (const body of BODIES) if (body.accessory === head.accessory) TAGS.add(limitsKey(look(head, body)));

// The poses: the rest, each emote at 25 moments, and for each set of the neck's limits its corners, edges and middle (the yaw
// from the shoulders' own turn), alone and within emotes, where the cursor keeps a fifth of its pull. A look is judged on the
// rest, the emotes and the samples of its own limits.
const withEmote = (e: Emote, t: number) => {
  const base = idle(t);
  const target = emotePose(e, t);
  const w = envelope(t, EMOTE_S[e]);
  return { pose: blend(base, { ...target, lift: target.lift + base.lift * 0.5 }, w), emoteWeight: w };
};
const ALL = "all";
const SAMPLES: (Sample & { tag: string })[] = [{ label: "rest", pose: idle(0), emoteWeight: 0, tag: ALL }];
for (const e of EMOTES) for (let k = 0; k <= 24; k++) SAMPLES.push({ label: `${e}@${((k / 24) * EMOTE_S[e]).toFixed(2)}`, ...withEmote(e, (k / 24) * EMOTE_S[e]), tag: ALL });
const SHOULDERS = KING_VIEW.yaw + KING_VIEW.torso;
for (const tag of TAGS) {
  const L = JSON.parse(tag) as typeof TRACK_LIMITS;
  for (const y of [-L.yaw, -L.yaw / 2, 0, L.yaw / 2, L.yaw])
    for (const p of [L.pitchMin, 0, L.pitchMax / 2, L.pitchMax]) SAMPLES.push({ label: `aim(${y.toFixed(2)},${p.toFixed(2)})`, pose: idle(0), emoteWeight: 0, aim: [SHOULDERS + y, p, 1], tag });
  for (const e of EMOTES)
    for (const k of [0.25, 0.5, 0.75])
      for (const y of [-L.yaw, L.yaw])
        for (const p of [L.pitchMin, L.pitchMax]) SAMPLES.push({ label: `${e}@${k}+aim(${y.toFixed(2)},${p.toFixed(2)})`, ...withEmote(e, k * EMOTE_S[e]), aim: [SHOULDERS + y, p, 0.2], tag });
}
const MATRICES = SAMPLES.map(partMatrices);

// Each head's and each body's cuboids, each cuboid once (keyed by its part, name and shape: a recoloured cuboid is the same).
interface Entry { key: string; part: Part; box: Cuboid }
const keyOf = (part: Part, b: Cuboid) => `${part}:${b.name ?? "?"}|${JSON.stringify([b.from, b.size, b.rotation ?? null, b.pivot ?? null])}`;
const ENTRIES = new Map<string, Entry>();
function keysOf(t: Traits, parts: readonly Part[]): Set<string> {
  const built = kingParts(t);
  const keys = new Set<string>();
  for (const part of parts)
    for (const box of built[part]) {
      const key = keyOf(part, box);
      keys.add(key);
      if (!ENTRIES.has(key)) ENTRIES.set(key, { key, part, box });
    }
  return keys;
}
const HEAD_KEYS = HEADS.map((t) => keysOf(t, ["head"]));
const BODY_KEYS = BODIES.map((t) => keysOf(t, PARTS.filter((p) => p !== "head")));
const short = (key: string) => key.split("|")[0]!;

/**
 * The frame: the badge's circle, radius 1. At rest and while the head follows the cursor nothing crosses it; in an emote (a hop,
 * a nod) a tip may cross it by up to 6 % of its radius for a moment, under the badge's ring.
 */
const FRAME = { still: 1.0, emote: 1.06 };
/** The sweeps' ceilings: a few seconds each on the Mac (the file's measure is in its PR); vitest's 5 s default is too close. */
const SWEEP_MS = 60_000;

describe("the avatar's traits", () => {
  it("reads and writes its traits as text, the king's left out, what it does not know ignored", () => {
    expect(traitsText(KING_TRAITS)).toBe("");
    expect(traitsFrom("")).toEqual(KING_TRAITS);
    const wizard: Traits = { ...KING_TRAITS, beard: "long", headwear: "wizard", eyes: "green", backdrop: "night" };
    expect(traitsFrom(traitsText(wizard))).toEqual(wizard);
    expect(traitsFrom("beard-long.beard-purple.cape-red.__proto__-x.constructor-y")).toEqual({ ...KING_TRAITS, beard: "long" });
    for (const t of HEADS) expect(traitsFrom(traitsText(t))).toEqual(t);
  });

  it("narrows the neck's limits for what hangs below the chin, and only for that", () => {
    expect(trackLimits(KING_TRAITS)).toEqual(TRACK_LIMITS);
    expect(trackLimits({ ...KING_TRAITS, beard: "long" })).toEqual({ yaw: 0.4, pitchMin: TRACK_LIMITS.pitchMin, pitchMax: 0.3 });
    expect(trackLimits({ ...KING_TRAITS, beard: "goatee" })).toEqual({ ...TRACK_LIMITS, yaw: 0.5 });
  });

  it("splits the shapes in two: every look is a head and a body, neither changing the other's cuboids", () => {
    expect([...new Set([...HEAD_TRAITS, ...BODY_TRAITS])].sort()).toEqual([...SHAPE_TRAITS].sort());
    expect(LOOKS).toBe(SHAPE_TRAITS.reduce((n, t) => n * TRAIT_OPTIONS[t].length, 1));
    expect(kingParts({ ...KING_TRAITS, outfit: "plate", pauldrons: "dragon" }).head).toEqual(kingParts(KING_TRAITS).head);
    const { head: _h, ...body } = kingParts({ ...KING_TRAITS, headwear: "tophat", beard: "long", hairStyle: "bald" });
    const { head: _k, ...king } = kingParts(KING_TRAITS);
    expect(body).toEqual(king);
  });

  it("has no two faces of one plane overlap where they show: every head, every body, every pair of options", () => {
    const rest = MATRICES[0]!;
    const failures: string[] = [];
    const check = (t: Traits) => {
      for (const pair of coplanarFaces(kingParts(t), rest)) failures.push(`${idOf(t)}: ${pair}`);
    };
    // Each head with the king's body and each body with the king's head (the head is scaled and lifted off the body: their
    // faces never share a plane), then looks that cover every pair of two traits' options.
    for (const t of HEADS) check(t);
    for (const t of BODIES) check(t);
    for (const t of pairwise()) check(t);
    expect(failures.slice(0, 20)).toEqual([]);
  }, SWEEP_MS);

  it("has nothing go into the head or what it wears: in each emote, at the neck's limits, or both", () => {
    const all = [...ENTRIES.values()];
    const heads = all.filter((e) => e.part === "head");
    const bodies = all.filter((e) => e.part !== "head");
    const local = new Map(all.map((e) => [e.key, boxMatrix(e.box)]));
    // The worst depth of each pair of cuboids, by the samples' tag.
    const hits = new Map<string, { a: string; b: string; tag: string; depth: number; sample: string }>();
    for (const [si, s] of SAMPLES.entries()) {
      const m = MATRICES[si]!;
      const placed = new Map(
        all.map((e) => {
          const world = m[e.part].clone().multiply(local.get(e.key)!);
          const corners = cornersOf(e.box, world);
          const lo = corners[0]!.clone(), hi = corners[0]!.clone();
          for (const p of corners) (lo.min(p), hi.max(p));
          return [e.key, { world, corners, lo, hi }];
        }),
      );
      const test = (A: Entry, B: Entry) => {
        const a = placed.get(A.key)!, b = placed.get(B.key)!;
        if (a.lo.x > b.hi.x || b.lo.x > a.hi.x || a.lo.y > b.hi.y || b.lo.y > a.hi.y || a.lo.z > b.hi.z || b.lo.z > a.hi.z) return;
        const depth = excess(A.part, A.box, a.corners, a.world, B.part, B.box, b.corners, b.world);
        if (depth <= 0) return;
        const k = `${A.key}~${B.key}~${s.tag}`;
        if (depth > (hits.get(k)?.depth ?? 0)) hits.set(k, { a: A.key, b: B.key, tag: s.tag, depth, sample: s.label });
      };
      // Between two body parts the arms swing over the chest and into their own pauldron's shell by design (the opaque arm hides
      // what it passes through): only what reaches the head counts.
      for (const A of heads) for (const B of bodies) test(A, B);
    }
    // A hit fails every look that has both cuboids and the hit's limits (any limits, for the rest and the emotes).
    const failures: string[] = [];
    for (const h of hits.values()) {
      const onHead = ENTRIES.get(h.a)!.part === "head";
      const looks: Traits[] = [];
      for (const [bi, body] of BODIES.entries()) {
        if (!BODY_KEYS[bi]!.has(h.b) || (!onHead && !BODY_KEYS[bi]!.has(h.a))) continue;
        for (const [hi, head] of HEADS.entries()) {
          if (head.accessory !== body.accessory || (onHead && !HEAD_KEYS[hi]!.has(h.a))) continue;
          if (h.tag === ALL || limitsKey(look(head, body)) === h.tag) looks.push(look(head, body));
        }
      }
      if (looks.length) failures.push(`${idOf(looks[0]!)} (and ${looks.length - 1} more): ${short(h.a)} <-> ${short(h.b)} ${h.depth.toFixed(2)} at ${h.sample}`);
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
    for (const [si, s] of SAMPLES.entries()) {
      const m = MATRICES[si]!;
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
    for (const [hi, head] of HEADS.entries()) {
      const tags = new Set([ALL, ...BODIES.filter((b) => b.accessory === head.accessory).map((b) => limitsKey(look(head, b)))]);
      for (const key of HEAD_KEYS[hi]!)
        for (const tag of tags) {
          const r = reach.get(`${key}~${tag}`);
          if (r && (r.still > FRAME.still || r.any > FRAME.emote)) failures.push(`${idOf(head)}: ${short(key)} still ${r.still.toFixed(3)}, ${r.any.toFixed(3)} at ${r.at}`);
        }
    }
    expect(failures.slice(0, 20)).toEqual([]);
  }, SWEEP_MS);

  it("keeps each feature readable on what it sits on, in every combination of the traits it reads", () => {
    const mean = (tones: readonly number[]) => {
      const c = [0, 0, 0];
      for (const t of tones) (c[0]! += (t >> 16) & 255, c[1]! += (t >> 8) & 255, c[2]! += t & 255);
      return c.map((x) => Math.round(x / tones.length)).reduce((a, x) => (a << 8) | x, 0);
    };
    const STRAP = 0x6e3e27;
    const PAULDRON = 0xdf9334;
    const failures: string[] = [];
    const fail = (t: Traits, check: string, value: number, limit: number) => {
      if (value < limit) failures.push(`${idOf(t)}: ${check} ${value.toFixed(3)} < ${limit}`);
    };
    // Each check over the product of the traits it reads, the others the king's.
    for (const t of combos(["eyes"])) fail(t, "pupil on the eye's white (contrast)", contrast(headPalette(t).pupil, headPalette(t).eyeWhite), 3);
    for (const t of combos(["skin", "hair", "beard"])) {
      const p = headPalette(t);
      const skin = mean(p.skin);
      fail(t, "brow on the skin", distance(p.brow, skin), 0.1);
      fail(t, "beard on the skin", distance(mean(p.beard), skin), 0.1);
      if (t.beard === "none") fail(t, "mouth on the skin", distance(p.mouth, skin), 0.1);
      else fail(t, "moustache on the mouth", distance(p.moustache, p.mouth), 0.1);
    }
    for (const t of combos(["skin", "outfit"])) {
      const tunic = mean(outfitTones(t).tunic);
      if (t.outfit !== "plate") fail(t, "outfit on the strap", distance(tunic, STRAP), 0.08);
      fail(t, "outfit by the skin", distance(tunic, mean(headPalette(t).skin)), 0.08);
    }
    for (const t of combos(["skin", "hair", "headwear"])) for (const tone of families(t).headwear(t.headwear)) fail(t, "hair under the headwear", distance(mean(headPalette(t).hair), tone), 0.08);
    for (const t of combos(["outfit", "pauldrons"])) {
      if (t.pauldrons === "none") continue;
      const f = families(t);
      fail(t, "pauldron on the outfit", distance(f.pauldron(PAULDRON), mean(outfitTones(t).tunic)), 0.1);
      if (t.outfit !== "plate") fail(t, "pauldron on the strap", distance(f.pauldron(PAULDRON), STRAP), 0.08);
    }
    expect(failures.slice(0, 20)).toEqual([]);
  }, SWEEP_MS);
});

/** Looks covering every pair of two traits' options (greedy, seeded): the faces' check across the head and the body. */
function pairwise(): Traits[] {
  const keys = Object.keys(TRAIT_OPTIONS) as (keyof Traits)[];
  const pairsOf = (t: Traits) => keys.flatMap((k, i) => keys.slice(i + 1).map((l) => `${k}=${t[k]}|${l}=${t[l]}`));
  const uncovered = new Set(keys.flatMap((k, i) => keys.slice(i + 1).flatMap((l) => TRAIT_OPTIONS[k].flatMap((a) => TRAIT_OPTIONS[l].map((b) => `${k}=${a}|${l}=${b}`)))));
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Traits[] = [];
  while (uncovered.size) {
    let best: Traits | null = null;
    let gain = -1;
    for (let k = 0; k < 200; k++) {
      const t = Object.fromEntries(keys.map((key) => [key, TRAIT_OPTIONS[key][Math.floor(rand() * TRAIT_OPTIONS[key].length)]])) as Traits;
      for (const part of [...uncovered][0]!.split("|")) {
        const [key, value] = part.split("=") as [keyof Traits, string];
        (t as Record<string, string>)[key] = value;
      }
      const g = pairsOf(t).filter((p) => uncovered.has(p)).length;
      if (g > gain) (gain = g), (best = t);
    }
    out.push(best!);
    for (const p of pairsOf(best!)) uncovered.delete(p);
  }
  return out;
}

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
