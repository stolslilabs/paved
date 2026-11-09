/**
 * The scenes' lazy chunks, loaded to the end, for a test file's `afterAll`. A test that renders a scene starts loading its lazy
 * chunks (`React.lazy`, a prefetch); one that ends while a chunk is still loading leaves the module runner fetching it, and the
 * fetch fails once the file's environment is torn down: `EnvironmentTeardownError: Cannot load 'src/lib/scroll-hint.ts' imported
 * from src/components/ui/scroll-region.tsx` (CI, home-columns.test, through `village-stage` and `layout-board`). Each file that
 * renders a scene awaits every chunk the scene can load, so no load is left when the environment goes. A load already done costs a
 * cache hit. `afterAll`, not `afterEach`: once the trees are unmounted a chunk's arrival renders nothing, so no assertion of a
 * test runs against a tree that changed after it.
 *
 * Kept apart from the scene helpers (which import Motion and the Score) so that any file can take it.
 */

/** A turn of the event loop, for what a chunk's arrival scheduled (a `setTimeout(0)`, React's lazy resolution). */
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

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
