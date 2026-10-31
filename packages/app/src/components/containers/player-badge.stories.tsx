import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { SAVED_LOOK } from "../../mocks/avatar";
import { PROGRESS } from "../../mocks/players";
import { NEW_PLAYER, NEW_PLAYER_PROFILE } from "../../mocks/new-player";
import { PROFILE } from "../../mocks/scenes";
import { PHONE_375, WIDE_1440 } from "../scenes/viewports";
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
 * Plays a sequence of readings on a loop, one every `everyMs`: the mock's XP does not move by itself, so the stories
 * move it. Its own `ProfileProvider`, since the progress changes over time (the preview's `parameters.profile` is fixed).
 */
function Playing({ steps, everyMs = 2_000 }: { steps: { progress: PlayerProgress }[]; everyMs?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI((n) => (n + 1) % steps.length), everyMs);
    return () => clearInterval(timer);
  }, [steps.length, everyMs]);
  const step = steps[i]!;
  return (
    <ProfileProvider value={value(PROFILE.connected, step.progress)}>
      <Corner>
        <PlayerBadge />
      </Corner>
    </ProfileProvider>
  );
}

/** A connected player of that name (the mock's own, with its avatar). */
const named = (name: string): ProfileState => ({ status: "connected", data: { ...PROFILE.connected.data, player: { ...PROFILE.connected.data.player, name } } });
/** The levels the owner checks the badge at: one figure, the largest one-figure, two figures, the widest. */
const BADGE_LEVELS = [1, 9, 42, 99];

/** The badge at each of `BADGE_LEVELS` with the name `name`, a third of the way through each level, one under the other. */
function Badges({ name }: { name: string }) {
  return (
    <Corner>
      <div className="flex flex-col gap-4">
        {BADGE_LEVELS.map((level) => (
          <ProfileProvider key={level} value={value(named(name), { level, xp: 100, xpForNext: 300 })}>
            <PlayerBadge />
          </ProfileProvider>
        ))}
      </div>
    </Corner>
  );
}

/** The longest name, 15 characters (`PLAYER_NAME_MAX`). */
const LONGEST = "CobblestoneKing";

/** Gains in one level, then back to the start (a drop is shown at once). */
const GAINS = [20, 50, 120, 165].map((xp) => ({ progress: { level: 2, xp, xpForNext: 200 } }));
/** Nearly full, then over the threshold, again and again: the level climbs. */
const LEVEL_UPS = Array.from({ length: 6 }, (_, k) => {
  const level = 2 + Math.floor(k / 2);
  return { progress: k % 2 === 0 ? { level, xp: 160, xpForNext: 200 } : { level: level + 1, xp: 30, xpForNext: 200 } };
});

/**
 * The profile at the home's top left (#787, redrawn after the owner's direction of 2026-10-31, `docs/design/player-badge.webp`):
 * the avatar in a ring of paving stones set with gold, the season dial's size; in the ring's groove the level's luminous bar, a
 * whole turn clockwise from 12 o'clock, under the gold shield that holds the level, back to it; the name plate at its right, its bricks repeated
 * to the name's length and ended by a gold arrow cap. The name grows the plate up to 1.05 times the ring, then shrinks (never under
 * 12 px), then is cut with an ellipsis where the home's room ends. It opens the profile sheet, which has the XP made and left. The
 * league and its crowns are the League control's, under it (#829). One story per state; the `Names*` stories pin the owner's
 * widths, 375 and 1440 px; the home's `LeftColumn*` and `OverlaysLongName*` stories show it beside the balances.
 */
const meta = {
  title: "Containers/PlayerBadge",
  component: PlayerBadge,
  render: (args) => (
    <Corner>
      <PlayerBadge {...args} />
    </Corner>
  ),
} satisfies Meta<typeof PlayerBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A short name at 375 px, beside the 96 px ring, at levels 1, 9, 42 and 99: the plate as short as it gets, the name at its own size. */
export const NamesShort375: Story = { render: () => <Badges name="Al" />, ...PHONE_375 };
/** The same at 1440 px, beside the 144 px ring. */
export const NamesShort1440: Story = { render: () => <Badges name="Al" />, ...WIDE_1440 };
/** The longest name, 15 characters, at 375 px: the plate grown to 1.05 times the ring, the name a little smaller (13 px). */
export const NamesLongest375: Story = { render: () => <Badges name={LONGEST} />, ...PHONE_375 };
/** The same at 1440 px, at its own size (20 px) beside the 144 px ring. */
export const NamesLongest1440: Story = { render: () => <Badges name={LONGEST} />, ...WIDE_1440 };

/** 0 %: a new player, level 1 with no XP; the groove empty, 1 in the shield. */
export const Start: Story = { parameters: profile(PROFILE.connected, PROGRESS.start) };
/** Level 9: one figure in the shield. */
export const Level9: Story = { parameters: profile(PROFILE.connected, { level: 9, xp: 120, xpForNext: 400 }) };
/** Level 10: two figures, the same shield. */
export const Level10: Story = { parameters: profile(PROFILE.connected, { level: 10, xp: 60, xpForNext: 450 }) };
/** Level 99: the widest the shield holds. */
export const Level99: Story = { parameters: profile(PROFILE.connected, { level: 99, xp: 900, xpForNext: 1_000 }) };
/** A name of 15 characters, the most a name has: the plate at its longest. */
export const LongName: Story = { parameters: profile(named(LONGEST), PROGRESS.partWay) };
/** 30 %: from under the shield, past 3 o'clock. */
export const ThirtyPercent: Story = { parameters: profile(PROFILE.connected, PROGRESS.thirty) };
/** 40 %, level 3: toward 6 o'clock. */
export const PartWay: Story = { parameters: profile(PROFILE.connected, PROGRESS.partWay) };
/** 75 %: round the bottom, to 9 o'clock. */
export const ThreeQuarters: Story = { parameters: profile(PROFILE.connected, PROGRESS.threeQuarters) };
/** Level 7 nearly full: the bar nearly back under the shield. */
export const NearlyFull: Story = { parameters: profile(PROFILE.connected, PROGRESS.nearlyFull) };
/** 100 %: the whole turn, back under the shield, the moment before the level turns over. */
export const Full: Story = { parameters: profile(PROFILE.connected, PROGRESS.full) };
/** The level cap (20, #734): the bar full, 20 in the shield; the control's name says max level. */
export const MaxLevel: Story = { parameters: profile(PROFILE.connected, PROGRESS.maxLevel) };
/** The avatar the player saved (#626). */
export const SavedAvatar: Story = { parameters: profile(PROFILE.connected, PROGRESS.partWay, SAVED_LOOK) };
/** A new player on the mock (#926): their drawn name beside the drawn look, level 1. */
export const NewPlayer: Story = { parameters: profile(NEW_PLAYER_PROFILE, PROGRESS.start, NEW_PLAYER.look) };
/** The XP still read: the groove empty, the shield blank. */
export const ReadingXp: Story = { parameters: profile(PROFILE.connected, undefined) };
/** WRAP360: a four-digit level (past 99: "99+", never at the cap of 20) and a name past the limit, shrunk to 12 px (its whole text in the title). */
export const Stress: Story = { parameters: profile(PROFILE.stress, PROGRESS.stress) };
/** No wallet: the silhouette in the ring, "Guest" on the plate, no bar and no shield. */
export const Guest: Story = { parameters: profile(PROFILE.guest) };
/** The wallet still looking for a session: the avatar's placeholder in the ring, no plate. */
export const Loading: Story = { parameters: profile(PROFILE.loading) };
/** XP gained: the bar fills to its new share, a "+N XP" rises at its end. */
export const Gain: Story = { render: () => <Playing steps={GAINS} />, parameters: { reducedMotion: "never" } };
/** Level up: the bar completes, flashes and starts again, the level turns over to the next number in the shield. */
export const LevelUp: Story = { render: () => <Playing steps={LEVEL_UPS} everyMs={2_400} />, parameters: { reducedMotion: "never" } };
/** Reduced motion: the values change at once with a brief flash, nothing moves. */
export const LevelUpReducedMotion: Story = { render: () => <Playing steps={LEVEL_UPS} everyMs={2_400} />, parameters: { reducedMotion: "always" } };
