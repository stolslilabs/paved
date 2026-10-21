import type { Meta, StoryObj } from "@storybook/react-vite";
import { DEFAULT_CAMERA_FIT_SETTINGS as FIT_DEFAULTS } from "@paved/renderer";
import { CameraFitBoard, FIT_BOARDS, FIT_VIEWPORTS } from "./camera-fit-board";

/**
 * The camera's opening frame (CAMERA-FIT, #678): the game opens with the board filling the screen. The frame covers the
 * placed tiles and one ring of free slots, at least N x N cells (the floor: at a game's start the starter never fills the
 * screen), centred in the screen less the HUD (shaded: the top bar, the tile stack and its bubble), fitted in both
 * directions at the play tilt. Never farther than today's opening, 240: a board too large for the screen opens there.
 *
 * It frames again on a resize or a turn of the screen until the player moves the camera, and on "Re-centre". After each
 * move it stays put unless "followBoard" is on (the owner's open point; off by default).
 *
 * The readout gives the distance, what binds it (the frame's width, its height, or the ceiling), the tile's size against
 * S (the outlines' reference, the tile at 240) and the outlines' opacity: they fade in fully from 1.5 S, so the closer
 * openings are never fainter than today's.
 */
const meta = {
  title: "Renderer/Camera fit",
  component: CameraFitBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    viewport: { control: "inline-radio", options: Object.keys(FIT_VIEWPORTS), description: "The screen, in CSS px" },
    board: { control: "inline-radio", options: Object.keys(FIT_BOARDS), description: "The board" },
    floorCells: { control: { type: "range", min: 1, max: 11, step: 1 }, description: `The floor N: at least N x N cells framed (default ${FIT_DEFAULTS.floorCells})` },
    ring: { control: { type: "range", min: 0, max: 3, step: 1 }, description: `Free cells framed around the tiles (default ${FIT_DEFAULTS.ring}: their slots)` },
    followBoard: { control: "boolean", description: "Re-fit after each move while the camera is untouched (the open point; default off)" },
    enabled: { control: "boolean", description: "The frame; off: today's fixed 240 over the starter" },
    showInsets: { control: "boolean", description: "Shade the HUD's room" },
    forceOutlines: { control: "boolean", description: "Draw the outlines on software WebGL too (captures)" },
  },
  args: {
    viewport: "375x812",
    board: "10 tiles",
    floorCells: FIT_DEFAULTS.floorCells,
    ring: FIT_DEFAULTS.ring,
    followBoard: FIT_DEFAULTS.followBoard,
    enabled: true,
    showInsets: true,
    forceOutlines: false,
  },
} satisfies Meta<typeof CameraFitBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A phone (375 x 812), 10 tiles: the frame bound by the screen's width. */
export const Phone: Story = {};

/** A phone at a game's start: the starter, its slots and one more ring (the 5 x 5 floor). */
export const PhoneStart: Story = { args: { board: "1 tile" } };

/** A phone, the bench's 38 tiles: too wide for the screen, so it opens at the ceiling, 240. */
export const Phone38: Story = { args: { board: "38 tiles" } };

/** Today's opening on a phone, to compare: 240 over the starter, whatever the board. */
export const PhoneToday: Story = { args: { enabled: false } };

/** A large phone (390 x 844). */
export const LargePhone: Story = { args: { viewport: "390x844" } };

/** A tablet held upright (768 x 1024). */
export const Tablet: Story = { args: { viewport: "768x1024", board: "38 tiles" } };

/** A laptop (1440 x 900), 10 tiles: bound by the screen's height. */
export const Desktop: Story = { args: { viewport: "1440x900" } };

/** A laptop at a game's start. */
export const DesktopStart: Story = { args: { viewport: "1440x900", board: "1 tile" } };

/** A laptop, the bench's 38 tiles. */
export const Desktop38: Story = { args: { viewport: "1440x900", board: "38 tiles" } };

/** Full HD (1920 x 1080), the long board: wider than the screen at 240. */
export const FullHdLong: Story = { args: { viewport: "1920x1080", board: "long board" } };
