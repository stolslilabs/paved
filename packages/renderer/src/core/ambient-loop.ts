// No three here: the ambient loop is a clock and a list, in the board's chunk. The effects that read it are chunks of their own.
import { AMBIENT_FPS } from "./ambient-settings";

/**
 * One ambient effect (the particles, #572; the next ones, #573 and #574): it moves on its own in its shader, from the loop's
 * time uniform (`AmbientLoop.time`), and says on each step whether it drew anything that moved.
 */
export interface AmbientEffect {
  /**
   * The loop stepped to `seconds` of ambient time (the time uniform holds it already). True when the effect has something on
   * the board that moves, so the step draws a frame; false lets the board stay idle.
   */
  step(seconds: number): boolean;
}

/** Why the loop is paused: the tab is hidden, or the board is covered (a full-screen sheet, the score panel). */
export type AmbientPause = "hidden" | "covered";

/** A rate within 0.9 of its interval steps (a 60 Hz frame of 16.7 ms twice is 33.3 ms: within 30 a second's). */
const INTERVAL_SLACK = 0.9;
/** The most ambient time one step moves: a resume after a long frame or a pause does not jump. */
const MAX_STEP_SECONDS = 0.1;

/**
 * The one ambient loop (#572): every ambient effect moves on it, never on a loop of its own. It runs no timer and no
 * `requestAnimationFrame`: `GameScene`'s render loop calls `tick(now)` on each of its ticks, and a tick that steps asks for a
 * frame. It steps at most `fps` times a second (about 30 by default), and not at all while it is off (the settings, the Low
 * tier, reduced motion: `GameScene` decides), paused (the tab hidden, the board covered) or with no effect that moves. The time
 * it gives the effects (`time`, one uniform every effect's material shares) moves only while it runs: a pause freezes them.
 *
 * An effect plugs in with `register(effect)` (which returns its unregister) and reads `time` in its shader.
 */
export class AmbientLoop {
  /** The ambient time in seconds, as a uniform: every ambient material puts this object in its uniforms. */
  readonly time: { value: number } = { value: 0 };
  private readonly effects = new Set<AmbientEffect>();
  private readonly pauses = new Set<AmbientPause>();
  private enabled = false;
  private fps = AMBIENT_FPS;
  /** When the loop last stepped (`performance.now()`), null when it has not since it last started. */
  private lastStep: number | null = null;
  /** The steps taken, for the stories' readout and the tests. */
  steps = 0;
  private unbindVisibility: (() => void) | null = null;

  /** Adds an effect; returns its removal. */
  register(effect: AmbientEffect): () => void {
    this.effects.add(effect);
    return () => this.effects.delete(effect);
  }

  /** The effects on or off (the settings, the tier, reduced motion). Off, the loop steps no more. */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.lastStep = null;
  }

  /** The rate cap, in steps a second. */
  setRate(fps: number): void {
    this.fps = fps > 0 ? fps : AMBIENT_FPS;
  }

  getRate(): number {
    return this.fps;
  }

  /** Pauses (or resumes) the loop for `reason`; it runs only while no reason holds. */
  setPaused(reason: AmbientPause, paused: boolean): void {
    if (paused) this.pauses.add(reason);
    else if (this.pauses.delete(reason)) this.lastStep = null;
  }

  isPaused(reason?: AmbientPause): boolean {
    return reason ? this.pauses.has(reason) : this.pauses.size > 0;
  }

  /** On, not paused, with an effect: the loop steps at its rate. */
  get running(): boolean {
    return this.enabled && this.pauses.size === 0 && this.effects.size > 0;
  }

  /**
   * Called on each tick of the render loop (`now`: `performance.now()`). Steps when the loop runs and its interval has passed:
   * moves `time` by the time since the last step (at most `MAX_STEP_SECONDS`), steps every effect, and returns true when one
   * of them wants a frame.
   */
  tick(now: number): boolean {
    if (!this.running) return false;
    if (this.lastStep !== null && now - this.lastStep < (1000 / this.fps) * INTERVAL_SLACK) return false;
    const elapsed = this.lastStep === null ? 0 : Math.min(MAX_STEP_SECONDS, (now - this.lastStep) / 1000);
    this.lastStep = now;
    this.time.value += elapsed;
    this.steps++;
    let moved = false;
    for (const effect of this.effects) if (effect.step(this.time.value)) moved = true;
    return moved;
  }

  /** Pauses the loop while the document is hidden (`visibilitychange`). Returns the unbind; `dispose` unbinds too. */
  followVisibility(doc: Pick<Document, "hidden" | "addEventListener" | "removeEventListener"> | undefined = globalThis.document): () => void {
    this.unbindVisibility?.();
    this.unbindVisibility = null;
    if (!doc || typeof doc.addEventListener !== "function") return () => {};
    const onChange = () => this.setPaused("hidden", doc.hidden);
    onChange();
    doc.addEventListener("visibilitychange", onChange);
    const unbind = () => doc.removeEventListener("visibilitychange", onChange);
    this.unbindVisibility = unbind;
    return unbind;
  }

  dispose(): void {
    this.unbindVisibility?.();
    this.unbindVisibility = null;
    this.effects.clear();
    this.pauses.clear();
    this.enabled = false;
    this.lastStep = null;
  }
}
