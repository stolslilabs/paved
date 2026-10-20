import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { baseDeckPlans, deckSheetCounts, PlanType } from "@paved/game-core";
import { appRenders, originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { DeckSheet } from "./deck-sheet";

const id = (plan: PlanType) => Object.values(PlanType).indexOf(plan);
const deck = baseDeckPlans();
/** A few moves in: the starter and some tiles on the board. */
const played = [PlanType.CCCCCFFFC, PlanType.CCCCCFFFC, PlanType.FFFFCCCFF, PlanType.FFFFCCCFF, PlanType.FFFFCCCFF, PlanType.CCCCCCCCC].map(id);

const meta = {
  title: "Containers/DeckSheet",
  component: DeckSheet,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onOpenChange: fn(),
    counts: deckSheetCounts(deck, played, [id(PlanType.FFFFFFCFF)]),
    handPlan: id(PlanType.CCCCCFFFC),
    renders: appRenders,
    tileArt: originalTileArt(SOURCE_ASSETS),
    view: "real",
    onViewChange: fn(),
  },
} satisfies Meta<typeof DeckSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** On a phone (375 px): a bottom sheet, 72 chips, the real tiles seen from above (#606), the played ones crossed out. */
export const Bottom: Story = { args: { side: "bottom" }, parameters: { viewport: { defaultViewport: "mobile1" } } };
/** From the tablet width up: a panel on the left, the tile stack stays free. */
export const Side: Story = { args: { side: "left" } };
/** Nothing played yet. */
export const Fresh: Story = { args: { side: "bottom", counts: deckSheetCounts(deck, []), handPlan: null } };

/** A Story level's fixed deck (#546, Tutorial 5): every tile shown comes, so the note says so. */
export const StoryFixedDeck: Story = {
  args: {
    side: "bottom",
    fixed: true,
    counts: deckSheetCounts([PlanType.RFFFRFCFR, PlanType.FFCFFFCFF, PlanType.CFFFCFFFC, PlanType.CFFFCFFFC], [id(PlanType.RFFFRFCFR), id(PlanType.FFCFFFCFF)]),
    handPlan: id(PlanType.CFFFCFFFC),
  },
};

/** The simplified view (the toggle's other side): each plan's nine areas. */
export const Simplified: Story = { args: { side: "bottom", view: "simple" }, parameters: { viewport: { defaultViewport: "mobile1" } } };
/** The real view in the board's skins: the player's Forest theme on a few plans (`skins`), the base models elsewhere. */
export const Skinned: Story = { args: { side: "bottom", skins: { cccccfffc: 1, ffffcccff: 1, rfrfffffr: 1, wffffffff: 1 } } };
/** No renders served (a build without them): the real view falls back to the board's tile art. */
export const NoRenders: Story = { args: { side: "bottom", renders: undefined } };
