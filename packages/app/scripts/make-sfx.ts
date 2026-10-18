/**
 * The sound effects (AUDIO-SETTINGS, #541), synthesised: `node scripts/make-sfx.ts` writes `public/sfx/*.wav` (mono, 16-bit,
 * 22.05 kHz). The sounds are written for Paved from sine, triangle and noise (no sample, no third-party file), so they carry
 * no licence of anyone else's: CC0 1.0, credited on the Credits page as "written for Paved". The run is deterministic
 * (a fixed noise seed): the same script gives the same bytes. Node 24 runs it as is; the syntax stays erasable.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx");

type Wave = "sine" | "triangle";
interface Note {
  /** Start in seconds, and frequency in Hz (end frequency for a sweep). */
  at: number;
  hz: number;
  hzEnd?: number;
  dur: number;
  gain?: number;
  wave?: Wave;
  /** Seconds of noise mixed in (a click or a breath), 0 for none. */
  noise?: number;
}

let seed = 1;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000 - 0.5;
};

/** The notes as samples: a 4 ms attack, an exponential decay to the note's end. */
export function render(notes: Note[], length: number): Int16Array {
  const out = new Float32Array(Math.ceil(length * RATE));
  for (const n of notes) {
    const start = Math.floor(n.at * RATE);
    const count = Math.floor(n.dur * RATE);
    let phase = 0;
    for (let i = 0; i < count && start + i < out.length; i++) {
      const t = i / count;
      const hz = n.hzEnd ? n.hz + (n.hzEnd - n.hz) * t : n.hz;
      phase += (2 * Math.PI * hz) / RATE;
      const tone = n.wave === "triangle" ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase);
      const attack = Math.min(1, i / (0.004 * RATE));
      const decay = Math.exp(-5 * t);
      const breath = n.noise && i < n.noise * RATE ? rand() * 2 * (1 - i / (n.noise * RATE)) : 0;
      out[start + i]! += (tone + breath) * attack * decay * (n.gain ?? 0.5);
    }
  }
  return Int16Array.from(out, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767));
}

/** A 16-bit mono PCM WAV file. */
export function wav(samples: Int16Array): Buffer {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** Notes C4 E4 G4 ... as a run, `step` seconds apart. */
const run = (hzs: number[], step: number, dur: number, extra: Partial<Note> = {}): Note[] => hzs.map((hz, i) => ({ at: i * step, hz, dur, ...extra }));

/** The set: the name is the file's, and the key `SfxName` of `lib/audio/sfx.ts`. */
export const SOUNDS: Record<string, { length: number; notes: Note[] }> = {
  tap: { length: 0.08, notes: [{ at: 0, hz: 1500, dur: 0.06, gain: 0.35 }] },
  select: { length: 0.18, notes: run([660, 880], 0.07, 0.11, { gain: 0.4 }) },
  rotate: { length: 0.16, notes: [{ at: 0, hz: 320, hzEnd: 640, dur: 0.14, gain: 0.35, wave: "triangle", noise: 0.04 }] },
  place: { length: 0.3, notes: [{ at: 0, hz: 150, hzEnd: 90, dur: 0.26, gain: 0.7, noise: 0.03 }, { at: 0, hz: 900, dur: 0.05, gain: 0.25 }] },
  invalid: { length: 0.26, notes: run([220, 175], 0.1, 0.14, { gain: 0.4, wave: "triangle" }) },
  discard: { length: 0.3, notes: [{ at: 0, hz: 520, hzEnd: 180, dur: 0.26, gain: 0.35, wave: "triangle", noise: 0.12 }] },
  road: { length: 0.4, notes: run([523, 659], 0.1, 0.28, { gain: 0.35, wave: "triangle" }) },
  city: { length: 0.55, notes: run([392, 523, 659], 0.1, 0.32, { gain: 0.35 }) },
  forest: { length: 0.5, notes: run([330, 392, 494], 0.12, 0.32, { gain: 0.4, wave: "triangle" }) },
  wonder: { length: 0.8, notes: run([523, 659, 784, 1047], 0.11, 0.45, { gain: 0.3 }) },
  cobbles: { length: 0.4, notes: run([1320, 1760], 0.07, 0.3, { gain: 0.3 }) },
  gameover: { length: 0.95, notes: run([440, 392, 330, 262], 0.17, 0.4, { gain: 0.4, wave: "triangle" }) },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const [name, s] of Object.entries(SOUNDS)) {
    seed = 1;
    const bytes = wav(render(s.notes, s.length));
    writeFileSync(join(OUT, `${name}.wav`), bytes);
    total += bytes.length;
    console.log(`${name}.wav ${bytes.length} B`);
  }
  console.log(`total ${total} B`);
}
