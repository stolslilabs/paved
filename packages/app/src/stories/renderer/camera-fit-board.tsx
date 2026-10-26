import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardTile } from "@paved/chain";
import { frameFloorFor, frameInsetsFor, type GameScene, type RendererSettingsInput } from "@paved/renderer";
import { BoardViewport } from "../../components/containers/board-viewport";
import { APP_ASSETS } from "../../mocks/assets";
import { BOARD_38 } from "../../mocks/board";
import { PVP_V2_ATTACK } from "../../mocks/pvp-v2";
import { LAYOUT_START } from "../../mocks/village-v2";

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

/** A village's cells counted from the board's centre, as the home's canvas draws them (`village-layout-canvas.tsx`). */
const onBoard = (tiles: readonly BoardTile[]): BoardTile[] => tiles.map((t) => ({ ...t, x: CENTER + t.x, y: CENTER + t.y }));

/**
 * The boards of the issues: the starter alone (a game's start), 10 tiles, the bench's 38, a long board (#678), and the
 * openings of an attack (its starter alone) and of a small village (the starter and the first 2 tiles of a new layout, #791).
 */
export const FIT_BOARDS = {
  "1 tile": [STARTER],
  "attack start": PVP_V2_ATTACK.start.tiles,
  "small village": onBoard(LAYOUT_START.tiles.slice(0, 3)),
  "10 tiles": BOARD_38.tiles.slice(0, 10),
  "38 tiles": BOARD_38.tiles,
  "long board": LONG_BOARD,
} satisfies Record<string, BoardTile[]>;
export type FitBoard = keyof typeof FIT_BOARDS;

export interface CameraFitBoardProps {
  viewport: FitViewport;
  board: FitBoard;
  /** The floor N: at least N x N cells framed; "auto", by width (3 on a phone, 5 from 640 px, #791). */
  floorCells: number | "auto";
  /** Cells added on each side of the floor; "auto", by width (a third on a phone, none from 640 px). */
  marginCells?: number | "auto";
  /** Free cells framed around the tiles (1: their slots). */
  ring: number;
  /** Re-fit after each move while the camera is untouched (the open point; off by default). */
  followBoard: boolean;
  /** The frame on (the default), or off: today's fixed 240 over the starter, to compare. */
  enabled: boolean;
  /** Shade the HUD's room (the insets the frame keeps clear). */
  showInsets: boolean;
  /** Draw the outlines on software WebGL too (captures), where "auto" leaves them off. */
  forceOutlines: boolean;
}

/** The HUD's room, shaded. */
const SHADE = { position: "absolute", background: "rgb(0 0 0 / 0.25)" } as const;

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
export function CameraFitBoard({ viewport, board, floorCells, marginCells = "auto", ring, followBoard, enabled, showInsets, forceOutlines }: CameraFitBoardProps) {
  const size = FIT_VIEWPORTS[viewport];
  const tiles = FIT_BOARDS[board];
  const settings = useMemo<RendererSettingsInput>(
    () => ({ cameraFit: { enabled, floorCells, marginCells, ring, followBoard }, ...(forceOutlines ? { outlines: { force: "on" as const } } : {}) }),
    [enabled, floorCells, marginCells, ring, followBoard, forceOutlines],
  );
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
  const floor = frameFloorFor(size.width);
  const n = floorCells === "auto" ? floor.cells : floorCells;
  const m = marginCells === "auto" ? floor.margin : marginCells;
  return (
    // Inline styles: a story class the app does not use would grow the app's CSS (Tailwind scans the stories).
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 8, minHeight: "100dvh", overflow: "auto", background: "var(--background)", color: "var(--foreground)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, fontFamily: "var(--font-mono)", fontSize: 12 }} data-testid="camera-fit-readout">
        <span>
          {viewport} · {board} · N {n}
          {m > 0 ? ` + ${(2 * m).toFixed(2)}` : ""}
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
        <button type="button" style={{ border: "1px solid currentColor", borderRadius: 4, padding: "2px 8px" }} onClick={() => scene?.recenter()}>
          Re-centre
        </button>
      </div>
      <div style={{ position: "relative", flexShrink: 0, overflow: "hidden", width: size.width, height: size.height }} data-testid="camera-fit-box">
        {/* A new board opens fresh, as a game does. */}
        <BoardViewport key={board} tiles={tiles} gameId={1} basePath={APP_ASSETS} settings={settings} tilePreview={false} placementHighlight={false} onScene={setScene} />
        {showInsets && enabled && (
          <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <div style={{ ...SHADE, left: 0, right: 0, top: 0, height: insets.top }} />
            <div style={{ ...SHADE, left: 0, right: 0, bottom: 0, height: insets.bottom }} />
            <div style={{ ...SHADE, left: 0, top: insets.top, bottom: insets.bottom, width: insets.left }} />
            <div style={{ ...SHADE, right: 0, top: insets.top, bottom: insets.bottom, width: insets.right }} />
          </div>
        )}
      </div>
    </div>
  );
}
