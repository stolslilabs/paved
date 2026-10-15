import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PACKS } from "../../mocks/cobbles";
import { CobblePacks, PackCard } from "./cobble-packs";

const meta = { title: "Containers/CobblePacks", component: CobblePacks, parameters: { layout: "padded" }, args: { packs: PACKS, selected: null, onSelect: fn() } } satisfies Meta<typeof CobblePacks>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The owner's four tiers, the $0.20 reference struck through, the discount. */
export const Default: Story = {};
export const Picked: Story = { args: { selected: 3 } };
/** A purchase on its way: the choice is locked. */
export const Locked: Story = { args: { selected: 2, disabled: true } };
/** One card. */
export const Card: Story = { render: () => <PackCard pack={PACKS[1]} selected={false} /> };
