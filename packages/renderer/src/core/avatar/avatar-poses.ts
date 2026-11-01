/**
 * The avatar's poses: the idle (a breath, a sway), six emotes as key poses blended over it, and the idle's glances. A pose turns
 * the rig's pivots (`avatar-king.ts`); the checks sample them (`__tests__/avatar-traits.test.ts`).
 */

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
