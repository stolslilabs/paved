import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MOCK_NOW } from "../../mocks/clock";
import { SeasonWheel } from "../elements/season-wheel";
import { GameHud } from "./game-hud";
import { BIG_SCORE, LONG_LABEL } from "../../mocks/stress";

const meta = {
  title: "Containers/GameHud",
  component: GameHud,
  parameters: { layout: "padded" },
  args: { title: "Challenge #1042", score: 1270, remaining: 12, expiresAt: MOCK_NOW + 19 * 3600, now: MOCK_NOW, onBack: fn(), onSettings: fn() },
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
/** WRAP360: a long title (cut, whole in its title), the widest score and gain, tiles left, and a game's longest time left (24 h). */
export const Stress: Story = { args: { title: LONG_LABEL, score: BIG_SCORE, delta: 9_999, remaining: 99, expiresAt: MOCK_NOW + 23 * 3600 + 59 * 60 + 59 } };

/** The season wheel next to the gear (#547). */
export const WithWheel: Story = { args: { wheel: <SeasonWheel state="auto" point={{ season: "summer", position: 0.3 }} /> } };

/**
 * A tile placed and not yet validated (#568): the points it would score beside the score, "1,270 (+154)", in the primary
 * colour and in brackets, where a move's gain is green on the label's line and moves in. At 375 px with the wheel and the gear.
 */
export const WithPreview: Story = {
  args: { title: "Training", expiresAt: null, preview: 154, onDeck: fn(), wheel: <SeasonWheel state="auto" point={{ season: "summer", position: 0.3 }} /> },
  decorators: [(Story) => <div className="w-full max-w-[375px]"><Story /></div>],
};
/** The preview and the last move's gain at once: two figures, two looks. */
export const PreviewAfterAClosing: Story = { args: { score: 1640, delta: 370, preview: 154 } };
/** WRAP360: the widest score with the widest preview at 375 px. */
export const PreviewStress: Story = {
  args: { title: LONG_LABEL, score: BIG_SCORE, preview: 9_999, onDeck: fn(), wheel: <SeasonWheel state="auto" point={{ season: "summer", position: 0.3 }} /> },
  decorators: [(Story) => <div className="w-full max-w-[375px]"><Story /></div>],
};
