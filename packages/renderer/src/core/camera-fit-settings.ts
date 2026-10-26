/**
 * The camera's opening frame's settings and types (CAMERA-FIT, #678): what the renderer's settings and the stories need from
 * the start. The fit itself (`computeCameraFit`, `camera-fit.ts`) is a chunk of its own, loaded by the scene.
 */
/**
 * The HUD's room at each edge of the board's surface, in CSS px: the board is framed in what is left (CAMERA-FIT, #678).
 * The top bar at the top; the tile stack and its bubble at the bottom.
 */
export interface FrameInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * The game page's HUD (`BoardScene`), measured on the Storybook board at 375 x 812 and 1440 x 900: the top bar ends at
 * about 74 and 78 px, the tile stack with its hint starts about 140 px from the bottom. Below the `tablet` breakpoint
 * (640 px, `theme.css`) the phone's, from it the larger one's (their `tablet:` paddings and sizes).
 */
export const FRAME_INSETS = {
  phone: { top: 80, bottom: 144, left: 8, right: 8 },
  tablet: { top: 88, bottom: 144, left: 16, right: 16 },
} as const satisfies Record<string, FrameInsets>;

/** The width from which the larger HUD's insets apply: the app's `tablet` breakpoint, in CSS px. */
export const FRAME_TABLET_PX = 640;

/**
 * The frame's floor by width class, in cells (V2-PHONE-ZOOM, #791): a board smaller than `cells` x `cells` is framed as
 * that square widened by `margin` cells on each side. On a phone held upright the width binds, so a game opens on three
 * cells across (the starter and one cell on each side) and a third of a cell beyond each, about 3.7 cells. From the
 * `tablet` breakpoint (`FRAME_TABLET_PX`) the five cells of #678, no margin. A board that has outgrown the floor is framed
 * as its tiles and their ring, with no margin.
 */
export interface FrameFloor {
  cells: number;
  margin: number;
}

export const FRAME_FLOORS = {
  phone: { cells: 3, margin: 1 / 3 },
  tablet: { cells: 5, margin: 0 },
} as const satisfies Record<string, FrameFloor>;

/** The camera's opening frame (`RendererSettings.cameraFit`). */
export interface CameraFitSettings {
  /** Frame the board at the opening, on a resize while the player has not moved the camera, and on `recenter`. Off: the camera opens at `OPENING_DISTANCE` over the starter. */
  enabled: boolean;
  /**
   * The frame is at least this many cells wide and deep, so the starter alone never fills the screen, or `"auto"`:
   * `FRAME_FLOORS` by the surface's width (3 on a phone, 5 from `tablet`: the starter, its slots and one more ring).
   */
  floorCells: number | "auto";
  /** Cells added on each side of the floor when it binds, or `"auto"`: `FRAME_FLOORS` by width (a third on a phone, none from `tablet`). */
  marginCells: number | "auto";
  /** Free cells framed around the placed tiles: 1, the ring of their free slots. */
  ring: number;
  /** The HUD's room in CSS px, or `"auto"`: `FRAME_INSETS` by the surface's width. */
  insets: FrameInsets | "auto";
  /**
   * Re-fit after each move while the player has not moved the camera (the issue's open point, the owner's to rule). Off by
   * default: the frame is set at the opening, on a resize and on `recenter`.
   */
  followBoard: boolean;
}

export const DEFAULT_CAMERA_FIT_SETTINGS: CameraFitSettings = {
  enabled: true,
  floorCells: "auto",
  marginCells: "auto",
  ring: 1,
  insets: "auto",
  followBoard: false,
};

/** The tiles' extent, in grid cells (a tile's `worldX` and `worldZ`), inclusive. */
export interface CellExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CameraFitInput {
  /** The placed tiles' extent in cells; null for an empty board (framed around the starter's cell, 0 0). */
  cells: CellExtent | null;
  /** The surface's size in CSS px. */
  width: number;
  height: number;
  /** The camera's vertical field of view in degrees, and its zoom (the play camera's: 50 and 5). */
  fov?: number;
  zoom?: number;
  /** The tilt from straight down, in radians (`PLAY_DEFAULT_POLAR_ANGLE`); the camera leans towards +z. */
  polar?: number;
  insets?: FrameInsets;
  /** The floor and its margin, in cells; by default `FRAME_FLOORS` by `width`. */
  floorCells?: number;
  marginCells?: number;
  ring?: number;
  /** The closest and farthest the frame may put the camera (`CLOSEST_DISTANCE`, and today's opening, `OPENING_DISTANCE`). */
  minDistance?: number;
  maxDistance?: number;
}

/** What binds the distance: the frame's depth, its width, the ceiling (the board is larger than the screen) or the closest zoom. */
export type CameraFitLimit = "height" | "width" | "ceiling" | "closest";

export interface CameraFit {
  /** The point on the ground the camera looks at, in world units. */
  target: { x: number; z: number };
  /** The camera's distance from it, at the tilt given. */
  distance: number;
  /** The framed area on the ground, in world units: the tiles and their ring, widened to the floor and its margin, centred on them. */
  area: { minX: number; maxX: number; minZ: number; maxZ: number };
  limitedBy: CameraFitLimit;
}

/** The insets of a surface `width` px wide, for `"auto"`. */
export function frameInsetsFor(width: number): FrameInsets {
  return width >= FRAME_TABLET_PX ? FRAME_INSETS.tablet : FRAME_INSETS.phone;
}

/** The floor of a surface `width` px wide, for `"auto"`. */
export function frameFloorFor(width: number): FrameFloor {
  return width >= FRAME_TABLET_PX ? FRAME_FLOORS.tablet : FRAME_FLOORS.phone;
}
