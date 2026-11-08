import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { winningScore } from "@paved/game-core";
import { CURVE_PLAYING } from "../../mocks/games";
import { ATTACK_STAR_PERCENTS } from "../../lib/pvp-v2-rules";
import { attackMeter, challengeMeter, storyMeter, trainingMeter, type ScoreMeterValue } from "../../lib/score-meter";
import { HudFrame } from "./hud-frame";
import { ScoreMeter } from "./score-meter";

/**
 * The board's score meter (GAME-OVERLAY), each mode's, on the HUD's frame as under the board's header. The Attack against a village of
 * 5,831 points (the fakes' rival); Story on a stand-in level (two stars from 800, three from 1,200, never shown); a Challenge at the
 * mocks' day (1,150 to beat); Training against a best of 1,420.
 */
const meta = {
  title: "Elements/Score meter",
  component: ScoreMeter,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="relative isolate mx-auto w-full max-w-2xl px-2.5 py-1 tablet:px-3">
        <HudFrame px={13} />
        <Story />
      </div>
    ),
  ],
  args: attackMeter(0, 5_831),
} satisfies Meta<typeof ScoreMeter>;
export default meta;
type Story = StoryObj<typeof meta>;

const story = (score: number) => storyMeter(score >= 1200 ? 3 : score >= 800 ? 2 : 1, [1, Math.min(1, score / 800), Math.min(1, Math.max(0, (score - 800) / 400))]);

/** The Attack's first tile: no point yet, the three marks grey. */
export const AttackStart: Story = {};
/** Past 70 %: the first star lit, the share after the bar. */
export const AttackOneStar: Story = { args: attackMeter(4_120, 5_831) };
/** Past 110 %: the village beaten, three stars. */
export const AttackThreeStars: Story = { args: attackMeter(6_610, 5_831) };
/** PvP v2 (#740): the marks at 80, 90 and 100 %, the bar ending at 115 %; past 90 %. */
export const AttackV2: Story = { args: attackMeter(5_300, 5_831, ATTACK_STAR_PERCENTS) };

/** Story (#593): the first star at the start, held by finishing; the second half on its way. No figure. */
export const StoryOneStar: Story = { args: story(500) };
/** Story, two stars, the third's share filling. */
export const StoryTwoStars: Story = { args: story(1_000) };

/** A Challenge under the score to beat: the trophy ahead at the middle, the PAVED coin (the cap) at the end. */
export const ChallengeToBeat: Story = { args: challengeMeter(CURVE_PLAYING, 640) };
/** Past the score to beat: the trophy lit, the second half toward the cap. */
export const ChallengeBeaten: Story = { args: challengeMeter(CURVE_PLAYING, winningScore(CURVE_PLAYING.threshold) * 2) };

/** Training under the device's best: the crown ahead. */
export const TrainingToBest: Story = { args: trainingMeter(1_420, 1_050)! };
/** Training past the best: the crown lit. */
export const TrainingNewBest: Story = { args: trainingMeter(1_420, 1_560)! };

/** The score climbing through a Story level's stars, a move every 1.2 s, then again: the gold moving on, each star reached beating. */
const CLIMB = [0, 300, 600, 820, 1_000, 1_250] as const;
function Climbing({ meter }: { meter: (score: number) => ScoreMeterValue }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % CLIMB.length), 1200);
    return () => clearInterval(timer);
  }, []);
  return <ScoreMeter {...meter(CLIMB[step]!)} />;
}
export const StoryClimbing: Story = { render: () => <Climbing meter={story} /> };
