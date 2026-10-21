import { act, renderHook } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_OVER_HOLD_MS, GAME_OVER_HOLD_REDUCED_MS, useAfterGameOver } from "../src/routes/game-over";

const motion = (reducedMotion: "never" | "always") => ({ children }: { children: ReactNode }) => <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>;

/** The hook on a board whose game is `over`, under `reducedMotion`; `onOver` counts its calls. */
function board(over: boolean, reducedMotion: "never" | "always" = "never") {
  const onOver = vi.fn();
  const view = renderHook(({ over }) => useAfterGameOver(over, onOver), { initialProps: { over }, wrapper: motion(reducedMotion) });
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
