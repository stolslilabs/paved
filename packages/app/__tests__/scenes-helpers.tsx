import { LazyMotion, domMax } from "motion/react";
import type { ReactNode } from "react";
import { formatPoints } from "../src/components/elements/score";

/** The app's providers in miniature: `m` components and the nav's `layoutId` need a LazyMotion with `domMax`. */
export const wrap = (ui: ReactNode) => <LazyMotion features={domMax}>{ui}</LazyMotion>;

/** Points as the Score writes them. */
export const pts = (n: number) => formatPoints(n);

/** A turn of the event loop, for what a chunk's arrival scheduled. */
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The scenes' lazy chunks, loaded to the end. A file that renders a scene awaits its chunks before it ends (`afterAll`): a test
 * that finishes while one is still loading would have it load after the environment is torn down (CI: `EnvironmentTeardownError`,
 * `scroll-region.tsx` from `layout-board.tsx`). In the one file these were split from, the next group's tests kept it alive.
 */
async function settle(chunks: readonly Promise<unknown>[]) {
  await Promise.all(chunks);
  await turn();
}

/** The home scene's: the stage with the plan view (`layout-board`) and its edit panel, the dock, the League control, the shield's plate, the edges. */
export const settleHomeChunks = () =>
  settle([
    import("../src/components/containers/village-stage"),
    import("../src/components/containers/edit-panel"),
    import("../src/components/containers/app-nav"),
    import("../src/components/containers/league-control"),
    import("../src/components/elements/shield-plate"),
    import("../src/components/containers/home-edges"),
  ]);

/** The board scene's: the surrender dialog, the device's settings sheet, the deck sheet. */
export const settleBoardChunks = () =>
  settle([
    import("../src/components/containers/surrender-dialog"),
    import("../src/components/containers/device-settings-sheet"),
    import("../src/components/containers/deck-sheet"),
  ]);

/** The over scene's: the final board. */
export const settleOverChunks = () => settle([import("../src/components/containers/final-board")]);
