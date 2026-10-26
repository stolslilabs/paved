import type { Meta, StoryObj } from "@storybook/react-vite";
import { DEFAULT_CAMERA_FIT_SETTINGS as FIT_DEFAULTS } from "@paved/renderer";
import { CameraFitBoard, FIT_BOARDS, FIT_VIEWPORTS, type CameraFitBoardProps } from "./camera-fit-board";

/**
 * The camera's opening frame (CAMERA-FIT, #678): the game opens with the board filling the screen. The frame covers the
 * placed tiles and one ring of free slots, at least N x N cells (the floor: at a game's start the starter never fills the
 * screen), centred in the screen less the HUD (shaded: the top bar, the tile stack and its bubble), fitted in both
 * directions at the play tilt. Never farther than today's opening, 240: a board too large for the screen opens there.
 *
 * It frames again on a resize or a turn of the screen until the player moves the camera, and on "Re-centre". After each
 * move it stays put unless "followBoard" is on (the owner's open point; off by default).
 *
 * On a phone (under 640 px) a game opens closer (V2-PHONE-ZOOM, #791): three cells across, the starter and one cell on each
 * side, and a third of a cell beyond each (N 3 + 0.67); from 640 px the five cells of #678. A board past the floor is
 * framed as its tiles and their ring, with no margin. The Phone opening stories set it beside the five cells of before.
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
    floorCells: {
      control: "select",
      options: ["auto", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      description: `The floor N: at least N x N cells framed (default ${FIT_DEFAULTS.floorCells}: 3 on a phone, 5 from 640 px)`,
    },
    marginCells: {
      control: "select",
      options: ["auto", 0, 1 / 3, 0.5, 1],
      description: `Cells added on each side of the floor (default ${FIT_DEFAULTS.marginCells}: a third on a phone, none from 640 px)`,
    },
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
    marginCells: FIT_DEFAULTS.marginCells,
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

/** A phone at a game's start: the starter and one cell on each side, and a third of a cell beyond (#791). */
export const PhoneStart: Story = { args: { board: "1 tile" } };

/** A phone, the bench's 38 tiles: too wide for the screen, so it opens at the ceiling, 240. */
export const Phone38: Story = { args: { board: "38 tiles" } };

/** Today's opening on a phone, to compare: 240 over the starter, whatever the board. */
export const PhoneToday: Story = { args: { enabled: false } };

/** A large phone (390 x 844). */
export const LargePhone: Story = { args: { viewport: "390x844" } };

/**
 * A laptop (1440 x 900), 10 tiles: bound by the screen's height. The other large screens (768 x 1024, 1920 x 1080) and
 * boards are the controls' (viewport, board): each large box takes seconds to draw in software WebGL, so the stories keep
 * one, and the wrap sweep that opens every story stays within its time.
 */
export const Desktop: Story = { args: { viewport: "1440x900" } };

/** Before and now side by side: the five cells of #678 (no margin), and the phone's three cells and their margin (#791). */
function PhoneOpening(args: CameraFitBoardProps) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", background: "var(--background)" }}>
      <CameraFitBoard {...args} floorCells={5} marginCells={0} />
      <CameraFitBoard {...args} floorCells="auto" marginCells="auto" />
    </div>
  );
}

/** A game's opening at 375 x 812: before (5 cells, left) and now (3 cells and a margin, right). */
export const PhoneOpeningGame: Story = { args: { board: "1 tile" }, render: PhoneOpening };

/** An attack's opening (its starter alone) at 375 x 812, before and now. */
export const PhoneOpeningAttack: Story = { args: { board: "attack start" }, render: PhoneOpening };

/**
 * A small village's opening (the starter and 2 tiles) at 375 x 812, before and now: 4 cells across with its ring, past the
 * phone's floor, so it is framed as its tiles and their ring, no margin. A larger village (the 9 tiles of a new layout are 7
 * cells across) is framed whole, as before.
 */
export const PhoneOpeningVillage: Story = { args: { board: "small village" }, render: PhoneOpening };

/** A game's opening on a large phone (390 x 844), before and now. */
export const PhoneOpeningLargePhone: Story = { args: { board: "1 tile", viewport: "390x844" }, render: PhoneOpening };
