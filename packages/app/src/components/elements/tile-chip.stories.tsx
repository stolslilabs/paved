import type { Meta, StoryObj } from "@storybook/react-vite";
import { SOURCE_ASSETS, originalTileArt } from "../../mocks/assets";
import { TileChip, UnknownTileChip } from "./tile-chip";

const meta = { title: "Elements/TileChip", component: TileChip, parameters: { layout: "padded" }, args: { plan: 13, orientation: 1, size: "lg", art: originalTileArt(SOURCE_ASSETS) } } satisfies Meta<typeof TileChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { state: "selected" } };
/** A move sent, its receipt awaited. */
export const Pending: Story = { args: { state: "pending" } };
export const Refused: Story = { args: { state: "refused" } };
export const Empty: Story = { args: { plan: 0 } };
/** The plan's nine areas instead of the art: the debug and accessibility view. */
export const Areas: Story = { args: { view: "areas" } };

/** The four orientations of one plan, a quarter turn each. */
export const Orientations: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-3">
      {[1, 2, 3, 4].map((o) => (
        <TileChip key={o} {...args} orientation={o} />
      ))}
    </div>
  ),
};

/** The 19 base plans (chain ids 1 to 19). */
export const AllPlans: Story = {
  render: () => (
    <div className="grid grid-cols-5 gap-3 tablet:grid-cols-10">
      {Array.from({ length: 19 }, (_, i) => (
        <TileChip key={i} plan={i + 1} size="md" art={originalTileArt(SOURCE_ASSETS)} />
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-end gap-3">
      {(["sm", "md", "lg"] as const).map((size) => (
        <TileChip key={size} {...args} size={size} />
      ))}
    </div>
  ),
};

/** An extra of a PvP attack's deck, not drawn yet (#789): the chip's frame on stone, a "?", at each size the sheet and the stack use. */
export const Unknown: Story = {
  render: () => (
    <div className="flex items-end gap-3">
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <UnknownTileChip key={size} size={size} />
      ))}
    </div>
  ),
};

/** The unknown tile beside a known one, in the chip's states: in hand (selected), and played (crossed out, as the deck sheet does). */
export const UnknownStates: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-end gap-3">
      <TileChip {...args} size="md" />
      <UnknownTileChip size="md" />
      <UnknownTileChip size="md" state="selected" />
      <span className="relative inline-flex opacity-40">
        <UnknownTileChip size="md" />
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-foreground before:h-0.5 before:w-[130%] before:-rotate-45 before:bg-current" />
      </span>
    </div>
  ),
};
