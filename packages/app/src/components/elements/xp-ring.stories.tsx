import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { PLAYER_ID, PROGRESS } from "../../mocks/players";
import { PlayerAvatar } from "./player-avatar";
import { XpRing, type PlayerProgress, type XpRingProps } from "./xp-ring";

const PLAYER = { name: "bal7hazar", address: PLAYER_ID };

/** The ring in the avatar's band, as the menus and the profile sheet draw it. */
function Ringed({ progress, size = "md" }: XpRingProps) {
  return (
    <PlayerAvatar player={PLAYER} size={size}>
      <XpRing progress={progress} size={size} />
    </PlayerAvatar>
  );
}

/** Both sizes side by side: the menus' 40 px and the profile sheet's. */
function Sizes({ progress }: { progress: PlayerProgress | undefined }) {
  return (
    <div className="flex items-center gap-10 p-10">
      <Ringed progress={progress} />
      <Ringed progress={progress} size="lg" />
    </div>
  );
}

/** Plays a sequence of readings on a loop, one every `everyMs`: the app's XP never moves yet (#625), so the stories move it. */
function Playing({ steps, everyMs = 2_000 }: { steps: PlayerProgress[]; everyMs?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI((n) => (n + 1) % steps.length), everyMs);
    return () => clearInterval(timer);
  }, [steps.length, everyMs]);
  return <Sizes progress={steps[i]} />;
}

/** Gains in one level, then back to the start (a drop is shown at once). */
const GAINS: PlayerProgress[] = [
  { level: 2, xp: 20, xpForNext: 200 },
  { level: 2, xp: 70, xpForNext: 200 },
  { level: 2, xp: 120, xpForNext: 200 },
  { level: 2, xp: 165, xpForNext: 200 },
];
/** Nearly full, then over the threshold, again and again: the level climbs. */
const LEVEL_UPS: PlayerProgress[] = Array.from({ length: 6 }, (_, k) => {
  const level = 2 + Math.floor(k / 2);
  return k % 2 === 0 ? { level, xp: 160, xpForNext: 200 } : { level: level + 1, xp: 30, xpForNext: 200 };
});

/** The XP ring and level badge around the avatar (#625), at the menus' size and the profile sheet's. */
const meta = {
  title: "Elements/XpRing",
  component: XpRing,
  parameters: { layout: "centered" },
  args: { progress: PROGRESS.start },
  render: (args) => <Sizes progress={args.progress} />,
} satisfies Meta<typeof XpRing>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Everyone today: level 1, 0 XP (the contracts do not define XP yet). */
export const Empty: Story = {};
export const PartWay: Story = { args: { progress: PROGRESS.partWay } };
export const NearlyFull: Story = { args: { progress: PROGRESS.nearlyFull } };
/** Read in progress: the empty track, no badge. */
export const Loading: Story = { args: { progress: undefined } };
/** WRAP360: a four-digit level. */
export const Stress: Story = { args: { progress: PROGRESS.stress } };
/** XP gained: the ring fills to its new share, a "+N XP" rises and fades. */
export const Gain: Story = { render: () => <Playing steps={GAINS} />, parameters: { reducedMotion: "never" } };
/** Level up: the ring completes and resets, the badge turns over to the next number, a short burst. */
export const LevelUp: Story = { render: () => <Playing steps={LEVEL_UPS} everyMs={2_400} />, parameters: { reducedMotion: "never" } };
/** Reduced motion: the values change at once with a brief flash, nothing moves. */
export const GainReducedMotion: Story = { render: () => <Playing steps={GAINS} />, parameters: { reducedMotion: "always" } };
export const LevelUpReducedMotion: Story = { render: () => <Playing steps={LEVEL_UPS} everyMs={2_400} />, parameters: { reducedMotion: "always" } };
