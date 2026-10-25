import type { GameScene, RendererSettingsInput, TileSkins } from "@paved/renderer";
import type { LayoutBoardView } from "../components/containers/layout-board";
import { useLayoutCanvas } from "../components/containers/village-layout-canvas";
import { BoardCanvas } from "./board-canvas";

export interface VillageCanvasProps {
  /** The editor's state (`useLayoutEditor`): the layout, its plates, the tile under the bubble, the bubble, and the taps. */
  view: LayoutBoardView;
  /** The renderer's settings (the board's, `useBoardSettings`): quality, the day and night, the weather, the fog. */
  settings?: RendererSettingsInput;
  skins?: TileSkins;
  onScene?: (scene: GameScene | null) => void;
  /** The renderer could not start: the stage falls back to the plan view (`LayoutBoard`). */
  onError?: (error: unknown) => void;
}

/**
 * The home's 3D village (#753, #756), its own chunk: the editor's layout, plates, tile and bubble (`useLayoutCanvas`) on the
 * board module's canvas (`BoardCanvas`, which also gives the renderer the route's manifest), as the boards draw theirs. The
 * village's stage and the editor's overlays stay its own (#772, open point 3). The home's overlays paint before it, over a
 * placeholder sky.
 */
export default function VillageCanvas({ view, settings, skins, onScene, onError }: VillageCanvasProps) {
  return <BoardCanvas {...useLayoutCanvas(view)} board={{ renderer: settings, onScene }} skins={skins} onError={onError} />;
}
