import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MOCK_NOW } from "../../mocks/clock";
import { GameHud } from "./game-hud";
import { BIG_AMOUNT_18, BIG_SCORE, LONG_LABEL } from "../../mocks/stress";
import { CURVE_PLAYING } from "../../mocks/games";

const meta = {
  title: "Containers/GameHud",
  component: GameHud,
  parameters: { layout: "padded" },
  args: { title: "Challenge #1042", score: 1270, expiresAt: MOCK_NOW + 19 * 3600, now: MOCK_NOW, onBack: fn(), onSettings: fn() },
  decorators: [(Story) => <div className="max-w-2xl"><Story /></div>],
} satisfies Meta<typeof GameHud>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Challenge: Story = {};
export const AfterAClosing: Story = { args: { score: 1640, delta: 370 } };
export const LastHour: Story = { args: { expiresAt: MOCK_NOW + 25 * 60 } };
export const Expired: Story = { args: { expiresAt: MOCK_NOW - 60 } };
/** Training: no deadline. */
export const Training: Story = { args: { title: "Training", expiresAt: null } };
/** WRAP360: a long title (cut, whole in its title), the widest score and gain, and a game's longest time left (24 h). */
export const Stress: Story = { args: { title: LONG_LABEL, score: BIG_SCORE, delta: 9_999, expiresAt: MOCK_NOW + 23 * 3600 + 59 * 60 + 59 } };

/**
 * A tile placed and not yet validated (#568): the points it would score over the score, "(+154)" over "1,270" (in place of the label "Score"), in
 * the primary colour and in brackets, where a move's gain is green and moves in. At 375 px with the gear, the title keeps
 * its room (the tiles left are on the tile stack, #606; the season dial is the board's own, under the HUD: #607).
 */
export const WithPreview: Story = {
  args: { title: "Training", expiresAt: null, preview: 154 },
  decorators: [(Story) => <div className="w-full max-w-[375px]"><Story /></div>],
};
/** A gain was showing when the tile was placed: the preview takes its place (the gain is the last move's, outdated). */
export const PreviewAfterAClosing: Story = { args: { score: 1640, delta: 370, preview: 154 } };
/** WRAP360: `Stress` with the widest preview in place of the gain (the preview takes the gain's place on the label's line). */
export const PreviewStress: Story = { args: { ...Stress.args, delta: undefined, preview: 9_999 } };

/** #705: past the threshold (1,150), what the score earns now beside the PAVED coin, an estimate at the day's threshold. */
export const WithReward: Story = { args: { reward: CURVE_PLAYING } };
/** #705: under the threshold, the score to beat. */
export const RewardBelowThreshold: Story = { args: { score: 640, reward: CURVE_PLAYING } };
/** #705: from the cap's score (4,706 at `c` 1.222 and `H` 5), the most a game pays, marked "max". */
export const RewardAtCap: Story = { args: { score: 5_000, reward: CURVE_PLAYING } };
/** #705 at 375 px with a preview: the reward goes under the time left, the title keeps its room. */
export const RewardPhone: Story = {
  args: { reward: CURVE_PLAYING, preview: 154 },
  decorators: [(Story) => <div className="w-full max-w-[375px]"><Story /></div>],
};
/** WRAP360: `Stress` with the widest reward, compact from 10,000 PAVED ("617.3M"). */
export const RewardStress: Story = { args: { ...Stress.args, reward: { ...CURVE_PLAYING, reference: BIG_AMOUNT_18 } } };
