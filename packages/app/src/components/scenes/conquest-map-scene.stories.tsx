import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { BoardTile } from "@paved/chain";
import { BoardViewport } from "../containers/board-viewport";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { CONQUEST_MAP } from "../../mocks/conquest";
import { ConquestMapScene } from "./conquest-map-scene";

/**
 * The Conquest's map (`/conquest`, the season's finale): the board's scene on the world round a zone, with the World grid and Back to
 * my zone at its side and the picked cell's action at its foot. One story per state; the Viewport control reframes it. The first
 * draws the 3D board; the others the zone as a grid, as a browser without WebGL does.
 */
const meta = {
  title: "Scenes/ConquestMap",
  component: ConquestMapScene,
  parameters: { layout: "fullscreen" },
  args: { tileArt: originalTileArt(SOURCE_ASSETS), onBack: fn(), onWorld: fn(), onZone: fn(), onHome: fn(), onCell: fn(), onExplore: fn(), onRequest: fn(), onGive: fn(), onPreview: fn(), onRetry: fn() },
} satisfies Meta<typeof ConquestMapScene>;
export default meta;
type Story = StoryObj<typeof meta>;

const CENTER = 2_147_483_647;
const { area, state } = CONQUEST_MAP.home;
/** The area on the board, its origin the middle of the viewer's province (as the page maps it). */
const home = state.zones[state.home!]!;
const origin = { x: home.col * 25 + 12, y: home.row * 25 + 12 };
const onBoard = (c: { x: number; y: number }) => ({ x: CENTER + c.x - origin.x, y: CENTER + c.y - origin.y });
const tiles = area.tiles.map((t) => ({ id: t.y * 4096 + t.x + 1, plan: t.plan, orientation: t.orientation, ...onBoard(t) }) as BoardTile);
const canvas = (
  <BoardViewport
    basePath={SOURCE_ASSETS}
    tiles={tiles}
    reveal={[...area.explored, ...area.tiles].map(onBoard)}
    slots={[...area.requests, ...area.frontier].map(onBoard)}
    otherPlates={false}
    settings={{ cameraFit: { enabled: false } }}
    onCellClick={fn()}
  />
);

/** The 3D board on the viewer's province: its tiles, the fog over what nobody explored, a plate on each cell that takes a request. */
export const Board: Story = { args: { ...CONQUEST_MAP.home, canvas } };
/** The view has left home (a pan past the province's edge): the zone under it is named, and Back to my zone shows. */
export const BoardAway: Story = { args: { ...CONQUEST_MAP.away, canvas } };
/** Without WebGL: the province as a grid, eight cells by eight. */
export const Grid: Story = { args: CONQUEST_MAP.home };
/** A cell beside the allegiance's tiles picked by an Officer: the plans that fit, by the members who hold one. */
export const GridAsking: Story = { args: CONQUEST_MAP.asking };
/** The exploration just made: what it found. */
export const Explored: Story = { args: CONQUEST_MAP.explored };
/** The World grid: a tap loads that zone's scene. */
export const World: Story = { args: CONQUEST_MAP.world };
export const Reading: Story = { args: CONQUEST_MAP.reading };
/** Before day 1: no world yet. */
export const Registration: Story = { args: CONQUEST_MAP.registration };
export const Failed: Story = { args: CONQUEST_MAP.failed };
