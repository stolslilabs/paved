import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { PVP_END } from "../../mocks/pvp";
import { PvpEndScene } from "./pvp-end-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";

/**
 * The end of a PvP v2 attack (#790, `/pvp/result/:id`): over the attack's final board in the rival's red void, the stars won
 * (animated in one by one), the score against the village's, the crowns and the league, the XP and the level bar, the chest won
 * or disabled when the day's slots are full, every closing, then Open chest, Attack again and League. On fakes; each state at
 * 375 and 1440 px.
 */
const meta = {
  title: "Scenes/PvP/End",
  component: PvpEndScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_END.twoStars, onOpenChest: fn(), onAgain: fn(), onLeague: fn(), onBack: fn() },
} satisfies Meta<typeof PvpEndScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Under 80 %: "Defeat", crowns lost, no chest. */
export const ZeroStars: Story = { args: PVP_END.zeroStars };
/** 80 %: a basic chest. */
export const OneStar: Story = { args: PVP_END.oneStar };
/** 95 %: a rare chest; Open chest leads to the Chests page. */
export const TwoStars: Story = {
  args: PVP_END.twoStars,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: "2 of 3 stars" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Open chest/ })).toBeEnabled();
  },
};
/** Past the village's score: "Triumph", an epic chest, and the crowns carry the attacker into Yeoman I. */
export const ThreeStars: Story = { args: PVP_END.threeStars };
/** A promotion said in words (three stars over the league's floor). */
export const Promoted: Story = { args: PVP_END.threeStars };
/** A defeat that drops the attacker out of Yeoman II. */
export const Dropped: Story = { args: PVP_END.dropped };
/** Stars won, but the day's three PvP slots are full: the chest grey and disabled, with the wait; no Open chest. */
export const ChestCapped: Story = {
  args: PVP_END.chestCapped,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/No slot left today, next in 5 h/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /Open chest/ })).toBeNull();
  },
};
/** The attack's XP reaches a level: "Level up". */
export const LevelUp: Story = { args: PVP_END.levelUp };
/** The attack given up: "Surrendered" and the crowns it cost. */
export const Surrendered: Story = { args: PVP_END.surrendered };
/** The level still being read. */
export const XpLoading: Story = { args: PVP_END.xpLoading };
/** The board's chunk still on its way: the results at once over the board's colour, never waiting for it. */
export const BoardLoading: Story = { args: { ...PVP_END.twoStars, loadBoard: () => new Promise(() => {}) } };

export const ZeroStarsPhone: Story = { ...ZeroStars, ...PHONE_375 };
export const ZeroStarsWide: Story = { ...ZeroStars, ...WIDE_1440 };
export const OneStarPhone: Story = { ...OneStar, ...PHONE_375 };
export const OneStarWide: Story = { ...OneStar, ...WIDE_1440 };
export const TwoStarsPhone: Story = { ...TwoStars, ...PHONE_375 };
export const TwoStarsWide: Story = { ...TwoStars, ...WIDE_1440 };
export const ThreeStarsPhone: Story = { ...ThreeStars, ...PHONE_375 };
export const ThreeStarsWide: Story = { ...ThreeStars, ...WIDE_1440 };
export const DroppedPhone: Story = { ...Dropped, ...PHONE_375 };
export const DroppedWide: Story = { ...Dropped, ...WIDE_1440 };
export const ChestCappedPhone: Story = { ...ChestCapped, ...PHONE_375 };
export const ChestCappedWide: Story = { ...ChestCapped, ...WIDE_1440 };
export const SurrenderedPhone: Story = { ...Surrendered, ...PHONE_375 };
export const SurrenderedWide: Story = { ...Surrendered, ...WIDE_1440 };
