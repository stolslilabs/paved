import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TOMORROW } from "../../mocks/village-v2";
import { MOCK_NOW } from "../../mocks/clock";
import { ChestSlots } from "./chest-slots";

/** The day's three PvP slots (#759), each saying its state (#784): free (its outline), won (its chest, a tap opens it), opened (grey). */
const meta = {
  title: "Containers/ChestSlots",
  component: ChestSlots,
  args: { won: 0, resetsAt: TOMORROW, now: MOCK_NOW, onPlay: fn(), onOpenSlot: fn() },
} satisfies Meta<typeof ChestSlots>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Three free slots: their outlines alone. */
export const Free: Story = {};
/** Two won, in their ranks' colours. */
export const Won: Story = { args: { won: 2, ranks: ["epic", "rare"] } };
/** One opened (grey, disabled), one won, one free. */
export const Mixed: Story = { args: { won: 2, opened: [0], ranks: [undefined, "rare"] } };
/** The three opened: grey, the countdown at the centre. */
export const AllOpened: Story = { args: { won: 3, opened: [0, 1, 2] } };
/** Won with no rank given by the read. */
export const NoRank: Story = { args: { won: 2 } };
