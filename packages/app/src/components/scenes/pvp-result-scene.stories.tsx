import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { originalTileArt, SOURCE_ASSETS } from "../../mocks/assets";
import { PVP_RESULT } from "../../mocks/pvp";
import type { TileArt } from "../elements/tile-chip";
import { PvpResultScene, type PvpResultSceneProps, type PvpReward } from "./pvp-result-scene";

const tileArt: TileArt = originalTileArt(SOURCE_ASSETS);

/** The end of a PvP attack (#647): the stars, the crowns, the league, and the village reward (#646's village and reward sheet open on Choose). On fakes. */
const meta = {
  title: "Scenes/PvP/Result",
  component: PvpResultScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_RESULT.twoStars, tileArt, onPlace: fn(), onTakeCobbles: fn(), onReplay: fn(), onAgain: fn(), onHome: fn() },
} satisfies Meta<typeof PvpResultScene>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TwoStars: Story = { args: PVP_RESULT.twoStars };
/** Past 110 %: three stars, and a promotion to Gold. */
export const ThreeStarsPromoted: Story = { args: PVP_RESULT.threeStarsPromoted };
/** One star; the day's rewards already taken (the daily cap). */
export const OneStarCapped: Story = { args: PVP_RESULT.oneStarCapped };
/**
 * Choose: the player's village opens full screen with #646's reward sheet (its own chunk). Drag a tile to a lit cell, or take
 * the Cobbles; Back returns to the result.
 */
export const RewardSheetOpen: Story = {
  args: PVP_RESULT.twoStars,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Choose/ }));
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Village reward" })).toBeInTheDocument());
  },
};

/** The whole reward: Choose, then a choice on the sheet closes it and the result says what was taken. */
function RewardFlow(args: PvpResultSceneProps) {
  const [reward, setReward] = useState<PvpReward>(args.reward);
  return (
    <PvpResultScene
      {...args}
      reward={reward}
      onPlace={(p) => setReward({ state: "taken", plan: p.plan, cobbles: null })}
      onTakeCobbles={() => setReward({ state: "taken", plan: null, cobbles: args.reward.state === "offer" ? args.reward.offer.cobbles : 0 })}
    />
  );
}
export const RewardChoice: Story = { args: PVP_RESULT.twoStars, render: (args) => <RewardFlow {...args} /> };
/** A tile chosen and placed in the village. */
export const RewardPlaced: Story = { args: PVP_RESULT.rewardPlaced };
/** The Cobbles taken instead. */
export const RewardCobbles: Story = { args: PVP_RESULT.rewardCobbles };
/** Under 70 %: no star, crowns lost, no reward. */
/** The reward is being read. */
export const RewardLoading: Story = { args: PVP_RESULT.rewardLoading };
/** The reward's read failed: the error and Try again, never "Today's rewards are all taken". */
export const RewardError: Story = { args: { ...PVP_RESULT.rewardError, onRetryReward: fn() } };
export const Defeat: Story = { args: PVP_RESULT.defeat };
/** A defeat that drops the attacker to Bronze. */
export const DefeatDropped: Story = { args: PVP_RESULT.defeatDropped };
/** The result on its way to the chain. */
export const Pending: Story = { args: PVP_RESULT.pending };
export const Failed: Story = { args: PVP_RESULT.error };
