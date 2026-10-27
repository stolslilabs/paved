import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { LEAGUE_FLOORS } from "../../lib/pvp-rules";
import { SAVED_LOOK } from "../../mocks/avatar";
import { PROGRESS } from "../../mocks/players";
import { PROFILE } from "../../mocks/scenes";
import type { PlayerProgress } from "../elements/xp-ring";
import { PlayerBadge } from "./player-badge";
import { ProfileProvider, type ProfileValue } from "./profile-context";
import type { ProfileState } from "./profile-sheet";

const value = (state: ProfileState, progress: PlayerProgress | undefined, look: bigint | null = null): ProfileValue => ({
  state,
  progress,
  look,
  onConnect: fn(),
  onDisconnect: fn(),
  onCopy: fn(async () => {}),
  onEditAvatar: fn(),
  onOpenLeague: fn(),
});
const profile = (state: ProfileState, progress?: PlayerProgress, look?: bigint | null) => ({ profile: value(state, progress, look) });

/** The home's top left, over the village's sky: where the badge sits (#787). */
function Corner({ children }: { children: React.ReactNode }) {
  return <div className="min-h-40 bg-gradient-to-b from-background/40 to-board p-2 tablet:p-4">{children}</div>;
}

/**
 * Plays a sequence of readings on a loop, one every `everyMs`: the mock's XP and crowns do not move by themselves, so the stories
 * move them. Its own `ProfileProvider`, since the progress changes over time (the preview's `parameters.profile` is fixed).
 */
function Playing({ steps, everyMs = 2_000 }: { steps: { progress: PlayerProgress; crowns: number }[]; everyMs?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI((n) => (n + 1) % steps.length), everyMs);
    return () => clearInterval(timer);
  }, [steps.length, everyMs]);
  const step = steps[i]!;
  return (
    <ProfileProvider value={value(PROFILE.connected, step.progress)}>
      <Corner>
        <PlayerBadge crowns={step.crowns} onLeague={fn()} />
      </Corner>
    </ProfileProvider>
  );
}

const SILVER = 1_240;
/** Gains in one level, then back to the start (a drop is shown at once). */
const GAINS = [20, 70, 120, 165].map((xp) => ({ progress: { level: 2, xp, xpForNext: 200 }, crowns: SILVER }));
/** Nearly full, then over the threshold, again and again: the level climbs. */
const LEVEL_UPS = Array.from({ length: 6 }, (_, k) => {
  const level = 2 + Math.floor(k / 2);
  return { progress: k % 2 === 0 ? { level, xp: 160, xpForNext: 200 } : { level: level + 1, xp: 30, xpForNext: 200 }, crowns: SILVER };
});
/** Wanderer, then each group's floor up to Sovereign: the border turns to each new colour with a pulse. */
const PROMOTIONS = [0, ...[0, 3, 6, 9, 12, 15, 18, 21].map((i) => LEAGUE_FLOORS[i]!)].map((crowns) => ({ progress: PROGRESS.partWay, crowns }));

/**
 * The profile and the league as one (#787), the home's top left: the avatar in its league's border, the name and the XP bar
 * (the level and the XP left), the league's badge and the crowns under the bar. The avatar opens the profile sheet, the badge
 * the League page. One story per state; the widths (320, 375, 1440 px) are the home's `BarPhone320`, `ScenePhone` and
 * `SceneWide`, or Storybook's Viewport toolbar here.
 */
const meta = {
  title: "Containers/PlayerBadge",
  component: PlayerBadge,
  args: { crowns: SILVER, onLeague: fn() },
  render: (args) => (
    <Corner>
      <PlayerBadge {...args} />
    </Corner>
  ),
} satisfies Meta<typeof PlayerBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Before PvP: 0 crowns, Wanderer, the border a neutral grey; level 1 with no XP. */
export const Wanderer: Story = { args: { crowns: 0 }, parameters: profile(PROFILE.connected, PROGRESS.start) };
/** A mid league (Yeoman I, 1,240 crowns): the border in its crest's colour, part way through level 3. */
export const MidLeague: Story = { parameters: profile(PROFILE.connected, PROGRESS.partWay) };
/** The top league: Sovereign's border, level 7 nearly full. */
export const Sovereign: Story = { args: { crowns: 5_320 }, parameters: profile(PROFILE.connected, PROGRESS.nearlyFull) };
/** The level cap (20, #734): the bar full, "Max level" in place of the XP left. */
export const MaxLevel: Story = { args: { crowns: 3_050 }, parameters: profile(PROFILE.connected, PROGRESS.maxLevel) };
/** The avatar the player saved (#626), in its league's border. */
export const SavedAvatar: Story = { parameters: profile(PROFILE.connected, PROGRESS.partWay, SAVED_LOOK) };
/** The XP still read: the empty track, no level. */
export const ReadingXp: Story = { parameters: profile(PROFILE.connected, undefined) };
/** WRAP360: a four-digit level and XP in the thousands, a five-digit crown count. */
export const Stress: Story = { args: { crowns: 12_345 }, parameters: profile(PROFILE.connected, PROGRESS.stress) };
/** No wallet: the silhouette, "Guest", no XP bar; Wanderer. */
export const Guest: Story = { args: { crowns: 0 }, parameters: profile(PROFILE.guest) };
/** The wallet still looking for a session: the avatar's placeholder. */
export const Loading: Story = { args: { crowns: 0 }, parameters: profile(PROFILE.loading) };
/** XP gained: the bar fills to its new share, a "+N XP" rises over its end. */
export const Gain: Story = { render: () => <Playing steps={GAINS} />, parameters: { reducedMotion: "never" } };
/** Level up: the bar completes, flashes and resets, the level turns over to the next number. */
export const LevelUp: Story = { render: () => <Playing steps={LEVEL_UPS} everyMs={2_400} />, parameters: { reducedMotion: "never" } };
/** A promotion: the border turns to the new league's colour with a pulse, each group in turn. */
export const Promotion: Story = { render: () => <Playing steps={PROMOTIONS} everyMs={1_600} />, parameters: { reducedMotion: "never" } };
/** Reduced motion: the values change at once with a brief flash, the border changes colour at once, nothing moves. */
export const LevelUpReducedMotion: Story = { render: () => <Playing steps={LEVEL_UPS} everyMs={2_400} />, parameters: { reducedMotion: "always" } };
export const PromotionReducedMotion: Story = { render: () => <Playing steps={PROMOTIONS} everyMs={1_600} />, parameters: { reducedMotion: "always" } };
