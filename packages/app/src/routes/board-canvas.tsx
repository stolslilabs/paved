import { provideManifest, type GameScene, type RendererSettingsInput } from "@paved/renderer";
import { BoardViewport, type BoardViewportProps } from "../components/containers/board-viewport";
import { RENDERER_ASSETS, manifestBody } from "../data/renderer-manifest";

/**
 * The renderer reads the manifest the route asked for with this code (`data/renderer-manifest.ts`), not one of its own. If
 * a model does not load, or the browser has no WebGL, the board falls back to the plan view, which plays the same game.
 */
provideManifest(RENDERER_ASSETS, manifestBody(RENDERER_ASSETS));

/** What the board settings give every canvas (`useBoardSettings`): the renderer's settings, the scene's handle, the two board switches. */
export interface BoardCanvasSettings {
  renderer?: RendererSettingsInput;
  onScene?: (scene: GameScene | null) => void;
  /** Unset: on, as `BoardViewport`'s. */
  tilePreview?: boolean;
  /** Unset: on, as `BoardViewport`'s. */
  placementHighlight?: boolean;
}

export interface BoardCanvasProps extends Omit<BoardViewportProps, "basePath" | "settings" | "onScene" | "tilePreview" | "placementHighlight"> {
  board: BoardCanvasSettings;
}

/**
 * The 3D board of the board module (#772): the renderer's canvas (`BoardViewport`) on the app's served models, with the board
 * settings. Every game (`useGameBoard`) and the home's village (`home-canvas.tsx`) draw their board through it; no route draws
 * `BoardViewport` itself.
 */
export function BoardCanvas({ board, ...content }: BoardCanvasProps) {
  return (
    <BoardViewport
      {...content}
      basePath={RENDERER_ASSETS}
      settings={board.renderer}
      onScene={board.onScene}
      tilePreview={board.tilePreview}
      placementHighlight={board.placementHighlight}
    />
  );
}
