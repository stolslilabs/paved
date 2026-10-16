import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkinsBoard } from "./skins-board";

/**
 * The board's tile skins (SKIN-RENDER) on the recorded 72-tile board: the player's active Forest skins (theme 1) drawn per
 * plan, one high-forest variant per tile, picked by origin/dev's hash of the plan, the cell and the game, so every viewer
 * sees the same board. Plans without a skin keep their base models. Only the variants the board shows are fetched (the
 * readout counts them).
 *
 * Captures (`captures/skins-before-*.webp`, `captures/skins-after-*.webp`; 1280 x 800 and 360 x 740): headless Chromium on
 * software WebGL (SwiftShader), so the outlines are off there (`force: "auto"`); not a GPU render, and no frame-time figure.
 */
const meta = {
  title: "Renderer/Skins",
  component: SkinsBoard,
  parameters: { layout: "fullscreen" },
  argTypes: {
    forest: {
      control: "inline-radio",
      options: ["none", "some", "all"],
      description: "The plans with Forest active: none (the base models), every other plan number, or all 19",
    },
    readout: { control: "boolean", description: "Show how many Forest variant files the page has fetched" },
  },
  args: { forest: "some", readout: true },
} satisfies Meta<typeof SkinsBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Forest on every other plan: skinned and base tiles side by side. */
export const Some: Story = {};

/** Forest on all 19 plans. */
export const All: Story = { args: { forest: "all" } };

/** No skin: the board as before SKIN-RENDER. */
export const None: Story = { args: { forest: "none" } };
