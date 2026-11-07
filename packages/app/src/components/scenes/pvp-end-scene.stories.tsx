import type { Meta, StoryObj } from "@storybook/react-vite";
import { levelStatus } from "@paved/game-core";
import { useEffect, useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { angledTileArt } from "../../mocks/assets";
import { PVP_END } from "../../mocks/pvp";
import { PLAN } from "../../mocks/village";
import { PvpEndScene, type PvpEndSceneProps, type PvpEndXp } from "./pvp-end-scene";
import { PHONE_375, WIDE_1440 } from "./viewports";

/**
 * The end of a PvP v2 attack (#790, `/pvp/result/:id`; END-SCREENS, after the Paved UX Book's `attack-end`): over the attack's
 * final board, blurred, the book's window: the stars won (painted, popping in one by one), the verdict, the score against the
 * village's, the crowns and the league, the XP and the level's bar, the chest won (a tap opens it here) or disabled with the slots'
 * reset when the day's slots are full, Home and Again; the cross shows the board, the Scores pill brings the scores back. On fakes;
 * each state at 375 and 1440 px.
 */
const meta = {
  title: "Scenes/PvP/End",
  component: PvpEndScene,
  parameters: { layout: "fullscreen" },
  args: { ...PVP_END.twoStars, tileArt: angledTileArt, onOpenChest: fn(), onVillage: fn(), onAgain: fn() },
} satisfies Meta<typeof PvpEndScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Under 80 %: "Defeat", crowns lost, no chest. */
export const ZeroStars: Story = { args: PVP_END.zeroStars };
/** 80 %: a basic chest. */
export const OneStar: Story = { args: PVP_END.oneStar };
/** 95 %: a rare chest, "Tap to open": a tap opens it here (END-CHEST). */
export const TwoStars: Story = {
  args: PVP_END.twoStars,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: "2 of 3 stars" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /^Open the rare chest/ })).toBeEnabled();
  },
};
/** The chest tapped: its draw on its way, the chest shaking over "Opening…". */
export const ChestOpening: Story = { args: { ...PVP_END.twoStars, chest: { state: "opening", rank: "rare" } } };
/** The chests' read not there yet: the panel disabled over "Loading…", nothing to tap. */
export const ChestLoading: Story = {
  args: { ...PVP_END.twoStars, chest: { state: "loading", rank: "rare" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Rare chest: loading" })).toBeDisabled();
    await expect(canvas.queryByRole("button", { name: /^Open the / })).toBeNull();
  },
};
const retryChest = fn();
/** The chests' read failed: its message and Retry, which reads them again; no chest to tap until it comes back. */
export const ChestError: Story = {
  args: { ...PVP_END.twoStars, chest: { state: "error", rank: "rare", message: "The RPC did not answer.", onRetry: retryChest } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Could not load your rare chest");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(retryChest).toHaveBeenCalled();
    await expect(canvas.queryByRole("button", { name: /^Open the / })).toBeNull();
  },
};
/** Retry on its way: its button busy. */
export const ChestRetrying: Story = { args: { ...PVP_END.twoStars, chest: { state: "error", rank: "rare", message: "The RPC did not answer.", retrying: true, onRetry: fn() } } };
/** The network serves no chests: carved, the chest grey, nothing to open here. */
export const ChestUnavailable: Story = {
  args: { ...PVP_END.twoStars, chest: { state: "unavailable", rank: "rare" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No chests here yet")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /^Open the / })).toBeNull();
  },
};
/** The chest's tile taken (Claim): the panel says it, carved. */
export const ChestKept: Story = { args: { ...PVP_END.twoStars, chest: { state: "kept", rank: "rare", plan: PLAN.wonder } } };
/** Past the village's score: "Triumph", an epic chest, and the crowns carry the attacker into Bronze I. */
export const ThreeStars: Story = { args: PVP_END.threeStars };
/** A promotion said in words (three stars over the league's floor). */
export const Promoted: Story = { args: PVP_END.threeStars };
/** A defeat that drops the attacker out of Bronze II. */
export const Dropped: Story = { args: PVP_END.dropped };
/** Stars won, but the day's three PvP slots are full: the chest grey and disabled, the slots' reset counting down; nothing to open. */
export const ChestCapped: Story = {
  args: PVP_END.chestCapped,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No slot left today")).toBeInTheDocument();
    await expect(canvas.getByRole("timer", { name: /^Slots reset in / })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /^Open the / })).toBeNull();
  },
};
/** The scores closed by the window's cross: the board, clear, and the gold Scores pill that brings them back. */
export const ScoresClosed: Story = {
  args: PVP_END.threeStars,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Close the scores" }));
    await expect(canvas.getByRole("button", { name: "Show the scores" })).toBeInTheDocument();
  },
};
/** The attack's XP reaches a level: "Level up". */
export const LevelUp: Story = { args: PVP_END.levelUp };
/** At the level cap: the bar full, rounded at both ends, "Max level". */
export const MaxLevel: Story = {
  args: PVP_END.maxLevel,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Max level")).toBeInTheDocument();
  },
};
/** A few XP into a level: the fill near empty, its left end rounded inside the track's outline. */
export const NearEmpty: Story = { args: PVP_END.nearEmpty };
/** The XP before the attack: where the bar stood. */
function xpBefore({ xp, gained }: PvpEndXp): PvpEndXp {
  const at = levelStatus(xp - gained);
  return { gained: 0, xp: at.xp, level: at.level, floor: at.floor, next: at.next, levelBefore: at.level };
}
/** The level up played: the bar where it stood, then, a second in, the attack's XP fills it, flashes it and fills the new level. */
function LevelUpPlayed(props: PvpEndSceneProps) {
  const [xp, setXp] = useState(props.xp && xpBefore(props.xp));
  useEffect(() => {
    const t = setTimeout(() => setXp(props.xp), 1000);
    return () => clearTimeout(t);
  }, [props.xp]);
  return <PvpEndScene {...props} xp={xp} />;
}
/** The level up as it plays: the bar completes, flashes whole (rounded at both ends), then fills the new level. */
export const LevelUpPlaying: Story = { args: PVP_END.levelUp, render: (args) => <LevelUpPlayed {...args} /> };
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
export const ChestLoadingPhone: Story = { ...ChestLoading, ...PHONE_375 };
export const ChestLoadingWide: Story = { ...ChestLoading, ...WIDE_1440 };
export const ChestErrorPhone: Story = { ...ChestError, ...PHONE_375 };
export const ChestErrorWide: Story = { ...ChestError, ...WIDE_1440 };
export const ChestUnavailablePhone: Story = { ...ChestUnavailable, ...PHONE_375 };
export const ChestUnavailableWide: Story = { ...ChestUnavailable, ...WIDE_1440 };
export const ChestKeptPhone: Story = { ...ChestKept, ...PHONE_375 };
export const ChestKeptWide: Story = { ...ChestKept, ...WIDE_1440 };
export const MaxLevelPhone: Story = { ...MaxLevel, ...PHONE_375 };
export const MaxLevelWide: Story = { ...MaxLevel, ...WIDE_1440 };
export const NearEmptyPhone: Story = { ...NearEmpty, ...PHONE_375 };
export const NearEmptyWide: Story = { ...NearEmpty, ...WIDE_1440 };
export const LevelUpPlayingPhone: Story = { ...LevelUpPlaying, ...PHONE_375 };
export const LevelUpPlayingWide: Story = { ...LevelUpPlaying, ...WIDE_1440 };
export const LevelUpPhone: Story = { ...LevelUp, ...PHONE_375 };
export const LevelUpWide: Story = { ...LevelUp, ...WIDE_1440 };
export const SurrenderedPhone: Story = { ...Surrendered, ...PHONE_375 };
export const SurrenderedWide: Story = { ...Surrendered, ...WIDE_1440 };
