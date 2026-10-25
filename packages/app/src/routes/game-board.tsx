import { useState } from "react";
import type { BoardTile } from "@paved/chain";
import { provideManifest, type TileSkins } from "@paved/renderer";
import { BoardViewport, type BoardBubble, type BoardViewportProps } from "../components/containers/board-viewport";
import { StackView, canDrawStack } from "../components/containers/stack-view";
import { hasWebGL } from "../components/containers/tile-view";
import type { BoardSceneProps } from "../components/scenes/board-scene";
import { useBoardSettings } from "../data/board-settings";
import { usePlacement, type Slot } from "../data/placement";
import { RENDERER_ASSETS, manifestBody } from "../data/renderer-manifest";
import { useTileArt } from "../data/tile-art";
import { useTileRenders } from "../data/tile-renders";

/**
 * The renderer reads the manifest the route asked for with this code (`data/renderer-manifest.ts`), not one of its own. If
 * a model does not load, or the browser has no WebGL, the board falls back to the plan view, which plays the same game.
 */
provideManifest(RENDERER_ASSETS, manifestBody(RENDERER_ASSETS));

/** What the boards' placement reads of the session (`usePlacement`'s input but the confirm fade, the board settings'). */
export interface GameBoardPlacement {
  /** The plan of the tile to place; null: nothing to place (no hand, a read-only board, a Story level's intro). */
  plan: number | null;
  slotsAt: (orientation: number) => Slot[];
  orientationsAt: (cell: Slot) => number[];
  /** Changes whenever the session's state does. */
  version: unknown;
  /** Changes with a new tile in hand (or a new game): the slot and rotation chosen go. */
  resetKey: unknown;
}

/** What the board draws, from the session, once the page has its bubble. */
export interface GameBoardInput {
  tiles: BoardTile[];
  closed?: BoardViewportProps["closed"];
  gameId?: number;
  /** The tile placed and not yet sent: the canvas's bubble, or the scene's own in the plan view. */
  bubble: BoardBubble | null;
}

/** The board scene's props the module gives: the 3D board or its plan view, the stack, the season dial, the placement. */
export type GameBoardSceneProps = Pick<
  BoardSceneProps,
  "tiles" | "canvas" | "renderHandStack" | "seasonWheel" | "placementHighlight" | "tileArt" | "tileRenders" | "skins" | "slots" | "ghost" | "confirmed" | "bubble" | "onSlotClick"
>;

/**
 * The one board of every game (#772): from one set of inputs, the 3D board (`BoardViewport`, with the renderer's settings,
 * the skins, the fog, the weather and the day and night) or its plan view fallback (the scene's `BoardMap`, without WebGL or
 * once the renderer cannot start), the stack's 3D tiles (`StackView`) or its CSS pile, the season dial, and the placement
 * (`usePlacement`: the plates, the ghost, the hold to confirm). `resetKey` starts the season wheel again (a new game, a
 * restarted level). The page builds its bubble from `placement`, then spreads `scene(...)` into `BoardScene`: no route draws
 * `BoardViewport` or `StackView` itself.
 */
export function useGameBoard({ skins, resetKey, placement: input }: { skins?: TileSkins; resetKey?: unknown; placement: GameBoardPlacement }) {
  const settings = useBoardSettings(resetKey);
  // The 3D board, unless this browser has no WebGL or the renderer cannot start (its models not served): the plan view.
  const [view, setView] = useState<"3d" | "plan">(() => (hasWebGL() ? "3d" : "plan"));
  // The hand's tile chip draws the 256 px copy the manifest lists (the plan's areas until it is read).
  const tileArt = useTileArt(view === "3d" ? RENDERER_ASSETS : undefined);
  const renders = useTileRenders(RENDERER_ASSETS);
  const placement = usePlacement({ ...input, confirmMs: settings.renderer?.placement?.motion?.confirmMs });
  const { slots, ghost, confirmed } = placement;

  const scene = ({ tiles, closed, gameId, bubble }: GameBoardInput): GameBoardSceneProps => ({
    tiles,
    tileArt,
    tileRenders: renders,
    skins,
    renderHandStack: view === "3d" && canDrawStack() ? (v) => <StackView {...v} basePath={RENDERER_ASSETS} skins={skins} /> : undefined,
    slots,
    ghost,
    confirmed,
    bubble,
    onSlotClick: placement.choose,
    placementHighlight: settings.placementHighlight,
    seasonWheel: settings.wheel,
    canvas:
      view === "3d" ? (
        <BoardViewport
          settings={settings.renderer}
          onScene={settings.onScene}
          tilePreview={settings.tilePreview}
          placementHighlight={settings.placementHighlight}
          skins={skins}
          tiles={tiles}
          closed={closed}
          gameId={gameId}
          basePath={RENDERER_ASSETS}
          slots={slots}
          ghost={ghost}
          confirmed={confirmed}
          bubble={bubble}
          onCellClick={placement.choose}
          onCellPress={placement.choose}
          onCellHover={placement.setHovered}
          onError={() => setView("plan")}
        />
      ) : undefined,
  });

  return { placement, renders, scene };
}
