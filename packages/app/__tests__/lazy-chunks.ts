/**
 * The scenes' lazy chunks, loaded to the end, for a test file's `afterAll`. A test that renders a scene starts loading its lazy
 * chunks (`React.lazy`, a prefetch); one that ends while a chunk is still loading leaves the module runner fetching it, and the
 * fetch fails once the file's environment is torn down: `EnvironmentTeardownError: Cannot load 'src/lib/scroll-hint.ts' imported
 * from src/components/ui/scroll-region.tsx` (CI, home-columns.test, through `village-stage` and `layout-board`). Each file that
 * renders a scene awaits every chunk the scene can load, so no load is left when the environment goes. A load already done costs a
 * cache hit. The chunks are awaited in `afterAll`: once the trees are unmounted a chunk's arrival renders nothing.
 *
 * Each test also ends with `flushPending` (`afterEach`): what the test's render scheduled (an effect, a `setTimeout(0)`, a lazy
 * chunk's resolution already under way) runs inside `act`, before the setup's `cleanup` unmounts the tree, so nothing a test
 * started is left to run after it, in the next test or after the environment is gone.
 *
 * Kept apart from the scene helpers (which import Motion and the Score) so that any file can take it.
 */
import { act } from "@testing-library/react";
import { vi } from "vitest";

/** A turn of the event loop, for what a chunk's arrival scheduled (a `setTimeout(0)`, React's lazy resolution). */
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * For a file's `afterEach`: the pending timers and effects of the test that ends, flushed inside `act` while its tree is still
 * mounted (a file's own `afterEach` runs before the setup's `cleanup`). Under fake timers, the timers due now run (no real wait,
 * which fake timers would never end).
 */
export async function flushPending() {
  await act(async () => {
    if (vi.isFakeTimers()) vi.runOnlyPendingTimers();
    else await turn();
  });
}

async function settle(chunks: readonly Promise<unknown>[]) {
  await Promise.all(chunks);
  await turn();
}

/** The village stage's: its edit panel (edit mode's points too), the long press's bubbles. */
const stageChunks = () => [
  import("../src/components/containers/village-stage"),
  import("../src/components/containers/edit-panel"),
  import("../src/components/containers/tile-bubble"),
  import("../src/components/containers/press-bubble"),
];

/** For a file that renders `VillageStage` alone. */
export const settleStageChunks = () => settle(stageChunks());

/**
 * The home scene's: the stage (with `layout-board`, `scroll-region` and `scroll-hint`) and its own, the dock, the League control
 * (the badge's rim), the badge's level bar and avatars, the shield's plate, the edges, the village's score count, the balances.
 */
export const settleHomeChunks = () =>
  settle([
    ...stageChunks(),
    import("../src/components/containers/app-nav"),
    import("../src/components/containers/league-control"),
    import("../src/components/elements/level-bar"),
    import("../src/components/elements/saved-avatar"),
    import("../src/components/elements/live-avatar"),
    import("../src/components/elements/shield-plate"),
    import("../src/components/containers/home-edges"),
    import("../src/components/elements/score-count"),
    import("../src/components/containers/balances"),
  ]);

/** The board scene's: the surrender dialog (prefetched once the board is idle), the device's settings sheet, the deck sheet, the tile bubble. */
export const settleBoardChunks = () =>
  settle([
    import("../src/components/containers/surrender-dialog"),
    import("../src/components/containers/device-settings-sheet"),
    import("../src/components/containers/deck-sheet"),
    import("../src/components/containers/tile-bubble"),
  ]);

/** The over scene's: the final board. */
export const settleOverChunks = () => settle([import("../src/components/containers/final-board")]);
