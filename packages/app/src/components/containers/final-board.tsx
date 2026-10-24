import { useState } from "react";
import type { BoardTile } from "@paved/chain";
import type { RendererSettingsInput, TileSkins } from "@paved/renderer";
import { BoardMap } from "./board-map";
import { BoardViewport } from "./board-viewport";
import { hasWebGL } from "./tile-view";

export interface FinalBoardProps {
  /** The placed tiles of the finished game (the contracts' coordinates). */
  tiles: BoardTile[];
  /** The game's id: it picks each tile's skin variant, as on its board. */
  gameId?: number;
  skins?: TileSkins;
  /** Where the renderer finds its manifest and models (`BoardViewport`). */
  basePath?: string;
  settings?: RendererSettingsInput;
  /** The browser has WebGL (detected when omitted): the 3D board; else, and when the renderer cannot start, the plan view. */
  webgl?: boolean;
}

/**
 * The board of a finished game, read only (#539): pan and zoom, no hand, no plate, no ghost. Its own chunk, loaded by the
 * over scene as it opens (#720), so the scores do not wait for the renderer: it is their background once it is in. It stays
 * mounted under the scores: one WebGL context, the models loaded once, whatever the switches.
 */
export default function FinalBoard({ tiles, gameId, skins, basePath, settings, webgl }: FinalBoardProps) {
  const [view, setView] = useState<"3d" | "plan">(() => ((webgl ?? hasWebGL()) ? "3d" : "plan"));
  return view === "3d" ? (
    <BoardViewport tiles={tiles} gameId={gameId} skins={skins} basePath={basePath} settings={settings} tilePreview={false} placementHighlight={false} onError={() => setView("plan")} />
  ) : (
    <BoardMap tiles={tiles} highlight={false} />
  );
}
