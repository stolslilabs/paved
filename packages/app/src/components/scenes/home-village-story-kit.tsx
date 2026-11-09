import type { Meta } from "@storybook/react-vite";
import type { GameScene } from "@paved/renderer";
import { fn } from "storybook/test";
import { useBoardSettings } from "../../data/board-settings";
import { APP_ASSETS, originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { HALL_OF_FAME, PLAYER_STATUS, RECORDS } from "../../mocks/scenes";
import { PROGRESS } from "../../mocks/players";
import { HOME_VILLAGE } from "../../mocks/village-v2";
import { BalancesProvider } from "../containers/balances-context";
import type { LayoutSlotsProps } from "../containers/layout-slots-strip";
import VillageStage from "../containers/village-stage";
import { ProfileProvider } from "../containers/profile-context";
import { BoardViewport } from "../containers/board-viewport";
import type { LayoutBoardView } from "../containers/layout-board";
import { useFramedSettings, useLayoutCanvas } from "../containers/village-layout-canvas";
import { HomeVillageScene, type HomeVillageSceneProps } from "./home-village-scene";

// What the Home stories share (`home-village-*.stories.tsx`, one title, `Scenes/Home`): the meta's component, args and decorators,
// the saved layouts' args, and the village drawn on the board's renderer.

/** The Home stories' meta but its title (each file names it, `Scenes/Home`, so the story ids stay `scenes-home--*`). */
export const HOME_STORY_META = {
  component: HomeVillageScene,
  parameters: { layout: "fullscreen" },
  args: {
    ...HOME_VILLAGE.view,
    tileArt: originalTileArt(SOURCE_ASSETS),
    holdMs: 300,
    onEditingChange: fn(),
    onPlay: fn(),
    onMissions: fn(),
    onShop: fn(),
    onVault: fn(),
    onFriends: fn(),
    onTiles: fn(),
    onChat: fn(),
    onLeague: fn(),
    onSettings: fn(),
    onNavigate: fn(),
    onResume: fn(),
    onRetry: fn(),
    onFound: fn(),
    onSave: fn(),
    onDismissSaved: fn(),
    onDismissRefusal: fn(),
  },
  decorators: [
    // `parameters.look`: the avatar the player saved (the home's badge draws it living); none, their initial.
    (Story, { args, parameters }) => (
      <ProfileProvider
        value={{
          state: { status: "connected", data: PLAYER_STATUS },
          look: (parameters.look as bigint | undefined) ?? null,
          progress: PROGRESS.partWay,
          league: { crowns: 1_172, league: 5, unranked: false },
          follows: { followers: 12, followed: 9 },
          // The profile's Hall of Fame and Stats (PROFILE-PAGE): the app's mock, as its profile reads it.
          hallOfFame: HALL_OF_FAME,
          records: RECORDS,
          onCopy: fn(async () => {}),
          onEditAvatar: fn(),
          onOpenLeague: fn(),
          onOpenTiles: fn(),
          onOpenInvite: fn(),
        }}
      >
        <BalancesProvider value={{ state: { status: "ready", usdc: 100_000_000n, paved: 129_110_000_000_000_000_000n, cobbles: 640 }, faucet: false }}>
          <Story />
        </BalancesProvider>
      </ProfileProvider>
    ),
  ],
} satisfies Omit<Meta<typeof HomeVillageScene>, "title">;

/**
 * A home state with the saved layouts (#804; EDIT-VILLAGE: the carousel above the inventory, Use in the bar): the page's stage reads
 * them itself (`routes/layout-slots.ts`); the stories hand the scene's own stage the fixture's.
 */
export function slots<A extends { layoutSlots: LayoutSlotsProps }>({ layoutSlots, ...args }: A) {
  return { args, render: (story: HomeVillageSceneProps) => <HomeVillageScene {...story} renderStage={(stage) => <VillageStage {...stage} layoutSlots={layoutSlots} />} /> };
}

/** The village on the board's canvas as the board module draws it (`home-canvas.tsx`), on Storybook's assets. */
export function StoryVillageCanvas({
  view,
  board,
  onReady,
  onScene,
}: {
  view: LayoutBoardView;
  board: ReturnType<typeof useBoardSettings>;
  onReady?: () => void;
  onScene?: (scene: GameScene | null) => void;
}) {
  return <BoardViewport {...useLayoutCanvas(view, { onScene, onReady })} basePath={APP_ASSETS} settings={useFramedSettings(board.renderer, view.frame)} />;
}

/**
 * The scene as the page wires it: the board's renderer under the overlays, with its settings (`useBoardSettings`).
 * `held`: the canvas's ready signal never reaches the stage (the fog stays).
 */
export function InScene({ held, ...args }: HomeVillageSceneProps & { held?: boolean }) {
  const board = useBoardSettings();
  return (
    <HomeVillageScene
      {...args}
      renderCanvas={(view, onDrawn) => <StoryVillageCanvas view={view} board={board} onReady={held ? undefined : onDrawn} />}
    />
  );
}
