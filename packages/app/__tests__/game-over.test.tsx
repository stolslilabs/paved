import { act, renderHook } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_OVER_HOLD_MS, GAME_OVER_HOLD_REDUCED_MS, useAfterGameOver, type AfterGameOverOptions } from "../src/routes/game-over";

const motion = (reducedMotion: "never" | "always") => ({ children }: { children: ReactNode }) => <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>;

type Props = { over: boolean | null } & AfterGameOverOptions;

/** The hook on a board whose game is `over` (null: not read yet), under `reducedMotion`; `onOver` counts its calls. */
function board(over: boolean | null, reducedMotion: "never" | "always" = "never", options: AfterGameOverOptions = {}) {
  const onOver = vi.fn();
  const view = renderHook(({ over, ...rest }: Props) => useAfterGameOver(over, onOver, rest), { initialProps: { over, ...options } as Props, wrapper: motion(reducedMotion) });
  return { onOver, ...view };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAfterGameOver: the board before the scores", () => {
  it("a game that ends on the board stays there for the hold, then goes on", () => {
    const { onOver, rerender } = board(false);
    rerender({ over: true });
    act(() => vi.advanceTimersByTime(GAME_OVER_HOLD_MS - 1));
    expect(onOver).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onOver).toHaveBeenCalledTimes(1);
  });

  it("under reduced motion the hold is shorter: no drop to wait for", () => {
    const { onOver, rerender } = board(false, "always");
    rerender({ over: true });
    act(() => vi.advanceTimersByTime(GAME_OVER_HOLD_REDUCED_MS - 1));
    expect(onOver).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onOver).toHaveBeenCalledTimes(1);
    expect(GAME_OVER_HOLD_REDUCED_MS).toBeLessThan(GAME_OVER_HOLD_MS);
  });

  it("a game already over as the board opens goes on at once: no last move to watch", () => {
    const { onOver } = board(true);
    expect(onOver).toHaveBeenCalledTimes(1);
  });

  it("leaving the board during the hold cancels it", () => {
    const { onOver, rerender, unmount } = board(false);
    rerender({ over: true });
    unmount();
    act(() => vi.advanceTimersByTime(GAME_OVER_HOLD_MS));
    expect(onOver).not.toHaveBeenCalled();
  });

  it("a game read after the board opened (null first) and found over goes on at once: a link to a finished Challenge game", () => {
    const { onOver, rerender } = board(null);
    rerender({ over: true });
    expect(onOver).toHaveBeenCalledTimes(1);
  });

  it("a game read in play that then ends on the board holds", () => {
    const { onOver, rerender } = board(null);
    rerender({ over: false });
    rerender({ over: true });
    act(() => vi.advanceTimersByTime(GAME_OVER_HOLD_MS - 1));
    expect(onOver).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onOver).toHaveBeenCalledTimes(1);
  });

  it("the chain still to confirm (a predicted last move): the scores wait for it after the hold", () => {
    const { onOver, rerender } = board(false, "never", { settled: false });
    rerender({ over: true, settled: false });
    act(() => vi.advanceTimersByTime(GAME_OVER_HOLD_MS * 2));
    expect(onOver).not.toHaveBeenCalled();
    rerender({ over: true, settled: true });
    expect(onOver).toHaveBeenCalledTimes(1);
  });

  it("confirmed before the hold ends: the hold still runs, from the move", () => {
    const { onOver, rerender } = board(false, "never", { settled: false });
    rerender({ over: true, settled: false });
    act(() => vi.advanceTimersByTime(1000));
    rerender({ over: true, settled: true });
    expect(onOver).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(GAME_OVER_HOLD_MS - 1000));
    expect(onOver).toHaveBeenCalledTimes(1);
  });

  it("no hold (a surrender): the scores once the game is over and settled", () => {
    const { onOver, rerender } = board(false, "never", { hold: false, settled: false });
    rerender({ over: true, hold: false, settled: true });
    expect(onOver).toHaveBeenCalledTimes(1);
  });

  it("a predicted end rolled back (the chain refused the last move) cancels the hold", () => {
    const { onOver, rerender } = board(false, "never", { settled: false });
    rerender({ over: true, settled: false });
    act(() => vi.advanceTimersByTime(1000));
    rerender({ over: false, settled: true });
    act(() => vi.advanceTimersByTime(GAME_OVER_HOLD_MS));
    expect(onOver).not.toHaveBeenCalled();
  });

  it("over on opening, then a new game that ends on the board: that one holds", () => {
    const { onOver, rerender } = board(true);
    onOver.mockClear();
    rerender({ over: false });
    rerender({ over: true });
    expect(onOver).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(GAME_OVER_HOLD_MS));
    expect(onOver).toHaveBeenCalledTimes(1);
  });
});
