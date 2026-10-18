import { lightOf, WALL_DIRECTIONS, windowCells, type LightVolume, type OpeningKind, type VoxelGrid, type Window } from "@paved/renderer";

/**
 * An isometric view of a tile's voxel grid, drawn on a 2D canvas (the stories of NIGHT-WINDOWS, #513): the windows the detection
 * found, marked on the walls they open in, and the light volume read as the tile shader will read it, a face lit by the air cell in
 * front of it. Nothing here is WebGL, so it reads the same on software rendering. A cell (x, y, layer) is turned `rotation` quarter
 * turns about the tile's centre; the viewer looks from the south-east of the rotated tile.
 */

export interface IsoOptions {
  /** Quarter turns, 0 to 3. */
  rotation: number;
  /** The palette's colours, `[r, g, b]` per entry. */
  colors: ReadonlyArray<readonly [number, number, number]>;
  /** A cell's width in px along an iso axis (the tile is 40 of them across). */
  scale: number;
  /** Day colours as they are, or the night's dim, blue-grey colours the lights are added to. */
  night: boolean;
  /** The windows to mark (any kind in `marks`), with the openings the detection rejected, if given. */
  windows: readonly Window[];
  marks: ReadonlySet<OpeningKind | "unlit">;
  unlit: readonly Window[];
  /** The light: "none" draws no light, "windows" the openings' own faces only, "volume" the light volume. */
  light: "none" | "windows" | "volume";
  volume: LightVolume | null;
  /** The light's colour (sRGB hex) and its strength. */
  lightColor: string;
  intensity: number;
}

export const MARK_COLORS: Record<OpeningKind | "unlit", string> = { window: "#22d3ee", door: "#e879f9", gap: "#9ca3af", unlit: "#fb923c" };

const hex = (color: string): [number, number, number] => [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];

/** The palette image as `[r, g, b]` triples (a grey ramp where the image did not come). */
export function paletteRgb(image: CanvasImageSource | null): Array<[number, number, number]> {
  const ramp = Array.from({ length: 256 }, (_, i): [number, number, number] => [i, i, i]);
  if (!image) return ramp;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return ramp;
  context.drawImage(image, 0, 0, 256, 1);
  const { data } = context.getImageData(0, 0, 256, 1);
  return ramp.map((_, i) => [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!]);
}

const SHADE = { top: 1, left: 0.78, right: 0.58 };

/** Draws the grid, then the marks. Returns the size it drew at. */
export function drawIso(canvas: HTMLCanvasElement, grid: VoxelGrid, options: IsoOptions): void {
  const { rotation, colors, scale, night, light, volume } = options;
  const n = grid.sizeX;
  const [tw, th, vh] = [scale * 2, scale, scale * 1.15];
  const width = Math.ceil(n * tw + tw * 2);
  const height = Math.ceil(n * th + grid.layers * vh + th * 4);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = night ? "#0b1020" : "#e8eef2";
  context.fillRect(0, 0, width, height);

  const turn = (x: number, y: number): [number, number] => {
    let [px, py] = [x, y];
    for (let k = 0; k < rotation; k++) [px, py] = [n - py, px];
    return [px, py];
  };
  const turnCell = (x: number, y: number): [number, number] => {
    let [px, py] = [x, y];
    for (let k = 0; k < rotation; k++) [px, py] = [n - 1 - py, px];
    return [px, py];
  };
  // A rotated direction back to the grid's own.
  const unturn = (dx: number, dy: number): [number, number] => {
    let [px, py] = [dx, dy];
    for (let k = 0; k < (4 - rotation) % 4; k++) [px, py] = [-py, px];
    return [px, py];
  };
  const [ox, oy] = [width / 2, grid.layers * vh + th * 2];
  const project = (x: number, y: number, z: number): [number, number] => [ox + (x - y) * (tw / 2), oy + (x + y) * (th / 2) - z * vh];

  const lightRgb = hex(options.lightColor);
  const voxel = new Map<number, number>();
  for (let v = 0; v < grid.count; v++) voxel.set(grid.cells[v * 3]! + n * (grid.cells[v * 3 + 1]! + n * grid.cells[v * 3 + 2]!), v);
  const windowCell = new Set<number>();
  for (const w of options.windows) if (w.kind === "window" || w.kind === "door") for (const [x, y, l] of windowCells(w)) windowCell.add(x + n * (y + n * l));

  const order: number[] = [];
  for (let v = 0; v < grid.count; v++) if (grid.visible[v]) order.push(v);
  const key = (v: number) => {
    const [rx, ry] = turnCell(grid.cells[v * 3]!, grid.cells[v * 3 + 1]!);
    return (rx + ry) * 256 + grid.cells[v * 3 + 2]!;
  };
  order.sort((a, b) => key(a) - key(b));

  const faceColor = (v: number, shade: number, front: readonly [number, number, number]): string => {
    const [r, g, b] = colors[grid.entry[v]!]!;
    // The night: a dim blue-grey base the light is added to; the day: the palette as is.
    const base = night ? [r * 0.2 * shade, g * 0.24 * shade, b * 0.34 * shade] : [r * shade, g * shade, b * shade];
    let lit = 0;
    if (light !== "none") {
      const [fx, fy, fl] = front;
      if (light === "volume" && volume) lit = lightOf(volume, fx, fy, fl) / 255;
      else if (windowCell.has(fx + n * (fy + n * fl))) lit = 1;
    }
    const k = Math.min(1.5, lit * options.intensity);
    return `rgb(${Math.min(255, Math.round(base[0]! + lightRgb[0] * k))},${Math.min(255, Math.round(base[1]! + lightRgb[1] * k))},${Math.min(255, Math.round(base[2]! + lightRgb[2] * k))})`;
  };

  const polygon = (points: ReadonlyArray<readonly [number, number]>, fill: string) => {
    context.beginPath();
    points.forEach(([px, py], i) => (i ? context.lineTo(px, py) : context.moveTo(px, py)));
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = fill;
    context.lineWidth = 0.6;
    context.stroke();
  };

  for (const v of order) {
    const [x, y, l] = [grid.cells[v * 3]!, grid.cells[v * 3 + 1]!, grid.cells[v * 3 + 2]!];
    const [rx, ry] = turnCell(x, y);
    // The faces the viewer sees: the top, the one towards +y' (screen left) and the one towards +x' (screen right).
    const [tx, ty] = unturn(0, 1);
    const [sx, sy] = unturn(1, 0);
    polygon([project(rx, ry, l + 1), project(rx + 1, ry, l + 1), project(rx + 1, ry + 1, l + 1), project(rx, ry + 1, l + 1)], faceColor(v, SHADE.top, [x, y, l + 1]));
    polygon([project(rx, ry + 1, l + 1), project(rx + 1, ry + 1, l + 1), project(rx + 1, ry + 1, l), project(rx, ry + 1, l)], faceColor(v, SHADE.left, [x + tx, y + ty, l]));
    polygon([project(rx + 1, ry, l + 1), project(rx + 1, ry + 1, l + 1), project(rx + 1, ry + 1, l), project(rx + 1, ry, l)], faceColor(v, SHADE.right, [x + sx, y + sy, l]));
  }

  // The marks, on the opening's outer plane. An opening facing away from the viewer is drawn faint and dashed.
  const mark = (w: Window, color: string) => {
    const [dx, dy] = WALL_DIRECTIONS[w.facing]!;
    const cells = windowCells(w);
    const [first, last] = [cells[0]!, cells[cells.length - 1]!];
    const [x0, y0, x1, y1] = [Math.min(first[0], last[0]), Math.min(first[1], last[1]), Math.max(first[0], last[0]) + 1, Math.max(first[1], last[1]) + 1];
    const [px, py] = [dx > 0 ? x1 : dx < 0 ? x0 : 0, dy > 0 ? y1 : dy < 0 ? y0 : 0];
    const corners: Array<[number, number, number]> = dx !== 0
      ? [[px, y0, w.layer], [px, y1, w.layer], [px, y1, w.layer + w.height], [px, y0, w.layer + w.height]]
      : [[x0, py, w.layer], [x1, py, w.layer], [x1, py, w.layer + w.height], [x0, py, w.layer + w.height]];
    const [rdx, rdy] = turn(dx, dy);
    const [bx, by] = turn(0, 0);
    const away = rdx - bx <= 0 && rdy - by <= 0;
    const points = corners.map(([cx, cy, cz]) => {
      const [rx, ry] = turn(cx, cy);
      return project(rx, ry, cz);
    });
    context.beginPath();
    points.forEach(([qx, qy], i) => (i ? context.lineTo(qx, qy) : context.moveTo(qx, qy)));
    context.closePath();
    context.globalAlpha = away ? 0.35 : 0.95;
    context.setLineDash(away ? [3, 3] : []);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = color;
    context.globalAlpha = away ? 0.08 : 0.22;
    context.fill();
    context.globalAlpha = 1;
    context.setLineDash([]);
  };
  for (const w of options.windows) if (options.marks.has(w.kind)) mark(w, MARK_COLORS[w.kind]);
  if (options.marks.has("unlit")) for (const w of options.unlit) mark(w, MARK_COLORS.unlit);
}

/** One layer of the light volume as a heat map: the light 0 to 255 on a dark ground, the solid cells in grey, the openings ringed. */
export function drawSlice(canvas: HTMLCanvasElement, grid: VoxelGrid, volume: LightVolume, layer: number, cell = 10): void {
  const n = grid.sizeX;
  canvas.width = n * cell;
  canvas.height = grid.sizeY * cell;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#101010";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < grid.sizeY; y++) {
    for (let x = 0; x < n; x++) {
      const solid = grid.occupied[x + n * (y + n * layer)] === 1;
      const value = lightOf(volume, x, y, layer);
      context.fillStyle = solid ? "#4b5563" : `rgb(${value},${Math.round(value * 0.7)},${Math.round(value * 0.35)})`;
      context.fillRect(x * cell, y * cell, cell - 1, cell - 1);
    }
  }
  context.lineWidth = 2;
  context.strokeStyle = MARK_COLORS.window;
  for (const w of volume.sources) for (const [x, y, l] of windowCells(w)) if (l === layer) context.strokeRect(x * cell + 1, y * cell + 1, cell - 3, cell - 3);
}
