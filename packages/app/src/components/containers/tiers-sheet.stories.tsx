import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { VILLAGE_FULL } from "../../mocks/village";
import { TiersSheet } from "./tiers-sheet";

/** The tiers (#646): the base under any skin per tier, each plan's progress to its next tier. */
const meta = {
  title: "Containers/TiersSheet",
  component: TiersSheet,
  parameters: { layout: "fullscreen" },
  args: { open: true, onOpenChange: fn(), copies: VILLAGE_FULL.copies, tileArt: originalTileArt(SOURCE_ASSETS), onOpenSkins: fn() },
} satisfies Meta<typeof TiersSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plans: Story = {};
/** No tile yet. */
export const Empty: Story = { args: { copies: {} } };
/** A visit: no way to the skins page. */
export const ReadOnly: Story = { args: { onOpenSkins: undefined } };
