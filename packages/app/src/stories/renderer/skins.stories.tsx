import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkinsBoard } from "./skins-board";

/**
 * The board's tile skins (SKIN-RENDER) on the recorded 72-tile board: the player's active Forest skins (theme 1) drawn per
 * plan, one high-forest variant per tile, picked by origin/dev's hash of the plan, the cell and the game, so every viewer
 * sees the same board. Plans without a skin keep their base models. Only the variants the board shows are fetched (the
 * readout counts them).
 *
 * Captures (`captures/skins-before-*.webp`, `captures/skins-after-*.webp`; 1280 x 800 and 360 x 740): headless Chrome on
 * the Mac's GPU (ANGLE Metal), outlines on (LIGHT-GPU). The skins' frame time is in docs/client/v2-architecture.md 5.5.
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
    delayModels: {
      control: { type: "number", min: 0, step: 500 },
      description:
        "Hold every model response this long (ms), as a slow link: the board's last 12 tiles are placed once it is drawn, and a ghost hovered; they draw their plan's image on a flat quad until their models come",
    },
  },
  args: { forest: "some", readout: true, delayModels: 0 },
} satisfies Meta<typeof SkinsBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Forest on every other plan: skinned and base tiles side by side. */
export const Some: Story = {};

/** Forest on all 19 plans. */
export const All: Story = { args: { forest: "all" } };

/** No skin: the board as before SKIN-RENDER. */
export const None: Story = { args: { forest: "none" } };

/**
 * A slow link (Q-POLISH-R): every model held 4 s, Forest on all 19 plans. The last 12 tiles, placed once the board is
 * drawn, and the ghost beside them draw their plan's image on a flat quad, outlined, then their variants in their place.
 * Captures `captures/skins-placeholder-*.webp` (during the hold, 1280 x 800 and 360 x 740): headless Chromium on software
 * WebGL (SwiftShader), outlines off there; not a GPU render.
 */
export const SlowModels: Story = { args: { forest: "all", delayModels: 4000 } };
