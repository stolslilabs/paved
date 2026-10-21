import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardTile } from "@paved/chain";
import { frameInsetsFor, type GameScene, type RendererSettingsInput } from "@paved/renderer";
import { BoardViewport } from "../../components/containers/board-viewport";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";

/** The viewports of the issue (#678), phone first. */
export const FIT_VIEWPORTS = {
  "375x812": { width: 375, height: 812 },
  "390x844": { width: 390, height: 844 },
  "768x1024": { width: 768, height: 1024 },
  "1440x900": { width: 1440, height: 900 },
  "1920x1080": { width: 1920, height: 1080 },
} as const;
export type FitViewport = keyof typeof FIT_VIEWPORTS;

const CENTER = 2_147_483_647;
const STARTER = BOARD_38.tiles.find((t) => t.x === CENTER && t.y === CENTER) ?? BOARD_38.tiles[0]!;

/** A road of 24 tiles east to west through the starter, two rows deep: a long, flat board (the plans are the recorded board's). */
const LONG_BOARD: BoardTile[] = Array.from({ length: 48 }, (_, i) => {
  const source = BOARD_38.tiles[i % BOARD_38.tiles.length]!;
  return { ...source, id: i + 1, x: CENTER - 12 + (i % 24), y: CENTER - Math.floor(i / 24) };
});

/** The boards of the issue: the starter alone (a game's start), 10 tiles, the bench's 38, and a long board. */
export const FIT_BOARDS = {
  "1 tile": [STARTER],
  "10 tiles": BOARD_38.tiles.slice(0, 10),
  "38 tiles": BOARD_38.tiles,
  "long board": LONG_BOARD,
} satisfies Record<string, BoardTile[]>;
export type FitBoard = keyof typeof FIT_BOARDS;

export interface CameraFitBoardProps {
  viewport: FitViewport;
  board: FitBoard;
  /** The floor N: at least N x N cells framed (5 proposed). */
  floorCells: number;
  /** Free cells framed around the tiles (1: their slots). */
  ring: number;
  /** Re-fit after each move while the camera is untouched (the open point; off by default). */
  followBoard: boolean;
  /** The frame on (the default), or off: today's fixed 240 over the starter, to compare. */
  enabled: boolean;
  /** Shade the HUD's room (the insets the frame keeps clear). */
  showInsets: boolean;
}

interface Readout {
  distance: number;
  fit: number;
  limitedBy: string;
  tilePx: number;
  openingTilePx: number;
  opacity: number;
}

/**
 * The board in a box of the viewport's size, as the game opens it (`BoardViewport`), with the HUD's room shaded and the
 * frame's figures: the distance, what binds it, the tile's size against S (the outlines' reference at 240) and the
 * outlines' opacity there.
 */
export function CameraFitBoard({ viewport, board, floorCells, ring, followBoard, enabled, showInsets }: CameraFitBoardProps) {
  const size = FIT_VIEWPORTS[viewport];
  const tiles = FIT_BOARDS[board];
  const settings = useMemo<RendererSettingsInput>(() => ({ cameraFit: { enabled, floorCells, ring, followBoard } }), [enabled, floorCells, ring, followBoard]);
  const [scene, setScene] = useState<GameScene | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const read = useCallback(() => {
    if (!scene) return;
    const zoom = scene.getZoom();
    const fit = scene.getCameraFit();
    setReadout({
      distance: zoom.distance,
      fit: fit?.distance ?? 0,
      limitedBy: fit?.limitedBy ?? "",
      tilePx: zoom.tilePx,
      openingTilePx: zoom.openingTilePx,
      opacity: zoom.outline.opacity,
    });
  }, [scene]);
  useEffect(() => {
    if (!scene) return;
    read();
    return scene.onCameraChange(read);
  }, [scene, read]);
  const insets = frameInsetsFor(size.width);
  return (
    <div className="flex min-h-dvh flex-col items-start gap-2 overflow-auto bg-background p-2 text-foreground">
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs" data-testid="camera-fit-readout">
        <span>
          {viewport} · {board} · N {floorCells}
        </span>
        {readout && (
          <>
            <span>distance {readout.distance.toFixed(1)}</span>
            <span>
              frame {readout.fit.toFixed(1)} ({readout.limitedBy})
            </span>
            <span>
              tile {readout.tilePx.toFixed(0)} px, S {readout.openingTilePx.toFixed(0)} px
            </span>
            <span>outlines {readout.opacity.toFixed(2)}</span>
          </>
        )}
        <button type="button" className="rounded border px-2 py-0.5" onClick={() => scene?.recenter()}>
          Re-centre
        </button>
      </div>
      <div className="relative shrink-0 overflow-hidden border border-border" style={{ width: size.width, height: size.height }} data-testid="camera-fit-box">
        {/* A new board opens fresh, as a game does. */}
        <BoardViewport key={board} tiles={tiles} gameId={1} basePath={APP_ASSETS} settings={settings} tilePreview={false} placementHighlight={false} onScene={setScene} />
        {showInsets && enabled && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 bg-black/25" style={{ height: insets.top }} />
            <div className="absolute inset-x-0 bottom-0 bg-black/25" style={{ height: insets.bottom }} />
            <div className="absolute left-0 bg-black/25" style={{ top: insets.top, bottom: insets.bottom, width: insets.left }} />
            <div className="absolute right-0 bg-black/25" style={{ top: insets.top, bottom: insets.bottom, width: insets.right }} />
          </div>
        )}
      </div>
    </div>
  );
}
