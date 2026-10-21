import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { baseDeckPlans, deckSheetCounts, deckSheetOrder, PlanType, TUTORIAL } from "@paved/game-core";
import { appRenders, originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { DeckSheet } from "./deck-sheet";

const id = (plan: PlanType) => Object.values(PlanType).indexOf(plan);
const deck = baseDeckPlans();
/** A few moves in: the starter and some tiles on the board. */
const played = [PlanType.CCCCCFFFC, PlanType.CCCCCFFFC, PlanType.FFFFCCCFF, PlanType.FFFFCCCFF, PlanType.FFFFCCCFF, PlanType.CCCCCCCCC].map(id);
const mobile = { viewport: { value: "mobile", isRotated: false } };
const wide = { viewport: { value: "wide", isRotated: false } };

/** A long Story level's draw (Tutorial 10's, then a few more of the base deck), four moves in: two placed, one discarded, one placed. */
const storyDeck = [...TUTORIAL.levels[9]!.deck, ...deck.slice(20, 37)];
const storyOrder = deckSheetOrder(storyDeck, [{ discard: false }, { discard: false }, { discard: true }, { discard: false }]);

const meta = {
  title: "Containers/DeckSheet",
  component: DeckSheet,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onOpenChange: fn(),
    deck: { mode: "counted", counts: deckSheetCounts(deck, played, [id(PlanType.FFFFFFCFF)]) },
    handPlan: id(PlanType.CCCCCFFFC),
    renders: appRenders,
    tileArt: originalTileArt(SOURCE_ASSETS),
    view: "real",
    onViewChange: fn(),
  },
} satisfies Meta<typeof DeckSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A random draw (Challenge, Training) on a phone: a bottom sheet, 72 chips by plan, the real tiles seen from above (#606), the played ones crossed out; never the order. */
export const Bottom: Story = { args: { side: "bottom" }, globals: mobile };
/** A random draw from the tablet width up: a panel on the left, the tile stack stays free. */
export const Side: Story = { args: { side: "left" }, globals: wide };
/** Nothing played yet. */
export const Fresh: Story = { args: { side: "bottom", deck: { mode: "counted", counts: deckSheetCounts(deck, []) }, handPlan: null }, globals: mobile };

/** A Story level on a phone (#613): its draw in order, the tile in hand ("Now") first of those left, the played ones out in their position. */
export const StoryOrder: Story = { args: { side: "bottom", deck: { mode: "ordered", order: storyOrder }, handPlan: null, onPresent: fn() }, globals: mobile };
/** A Story level from the tablet width up: the same order in the left panel. */
export const StoryOrderSide: Story = { args: { side: "left", deck: { mode: "ordered", order: storyOrder }, handPlan: null, onPresent: fn() }, globals: wide };
/** A short Story level before its first move (Tutorial 5): every tile to come, the first in hand. */
export const StoryOrderFresh: Story = {
  args: { side: "bottom", deck: { mode: "ordered", order: deckSheetOrder(TUTORIAL.levels[4]!.deck, []) }, handPlan: null, onPresent: fn() },
  globals: mobile,
};

/** The simplified view (the toggle's other side): each plan's nine areas. */
export const Simplified: Story = { args: { side: "bottom", view: "simple" }, globals: mobile };
/** The real view in the board's skins: the player's Forest theme on a few plans (`skins`), the base models elsewhere. */
export const Skinned: Story = { args: { side: "bottom", skins: { cccccfffc: 1, ffffcccff: 1, rfrfffffr: 1, wffffffff: 1 } }, globals: mobile };
/** No renders served (a build without them): the real view falls back to the board's tile art. */
export const NoRenders: Story = { args: { side: "bottom", renders: undefined }, globals: mobile };
