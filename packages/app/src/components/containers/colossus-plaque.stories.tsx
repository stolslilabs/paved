import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { COLOSSUS_PLAQUE } from "../../mocks/colossus";
import { PHONE_320 } from "../scenes/viewports";
import { ColossusPlaque } from "./colossus-plaque";

/** A finished Colossus (the weekly collective event), shown the week after: the plaque, the capstone, the viewer's part and their claim. */
const meta = {
  title: "Containers/ColossusPlaque",
  component: ColossusPlaque,
  args: { onClaim: fn(), onOpenPlayer: fn(), className: "max-w-sm" },
} satisfies Meta<typeof ColossusPlaque>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The viewer laid no tile: nothing to claim. */
export const Absent: Story = { args: COLOSSUS_PLAQUE.absent };
/** On the plaque: the tiers and the place to claim. */
export const ToClaim: Story = { args: COLOSSUS_PLAQUE.toClaim };
export const ToClaim320: Story = { args: COLOSSUS_PLAQUE.toClaim, ...PHONE_320 };
export const Claimed: Story = { args: COLOSSUS_PLAQUE.claimed };
/** The week ended before the last stone: the gauge it reached. */
export const Short: Story = { args: COLOSSUS_PLAQUE.short };
