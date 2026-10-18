import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { baseDeckPlans, deckSheetCounts, PlanType } from "@paved/game-core";
import { DeckSheet } from "./deck-sheet";

const id = (plan: PlanType) => Object.values(PlanType).indexOf(plan);
const deck = baseDeckPlans();
/** A few moves in: the starter and some tiles on the board. */
const played = [PlanType.CCCCCFFFC, PlanType.CCCCCFFFC, PlanType.FFFFCCCFF, PlanType.FFFFCCCFF, PlanType.FFFFCCCFF, PlanType.CCCCCCCCC].map(id);

const meta = {
  title: "Containers/DeckSheet",
  component: DeckSheet,
  parameters: { layout: "fullscreen" },
  args: { open: true, onOpenChange: fn(), counts: deckSheetCounts(deck, played, 1), handPlan: id(PlanType.CCCCCFFFC) },
} satisfies Meta<typeof DeckSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** On a phone (375 px): a bottom sheet, 72 chips, the played ones crossed out. */
export const Bottom: Story = { args: { side: "bottom" }, parameters: { viewport: { defaultViewport: "mobile1" } } };
/** From the tablet width up: a panel on the left, the hand panel stays free. */
export const Side: Story = { args: { side: "left" } };
/** Nothing played yet. */
export const Fresh: Story = { args: { side: "bottom", counts: deckSheetCounts(deck, []), handPlan: null } };
