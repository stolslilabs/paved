import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { SAVED_LOOK } from "../../mocks/avatar";
import { PROGRESS } from "../../mocks/players";
import { NEW_PLAYER, NEW_PLAYER_PROFILE } from "../../mocks/new-player";
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

/** Gains in one level, then back to the start (a drop is shown at once). */
const GAINS = [20, 50, 120, 165].map((xp) => ({ progress: { level: 2, xp, xpForNext: 200 } }));
/** Nearly full, then over the threshold, again and again: the level climbs. */
const LEVEL_UPS = Array.from({ length: 6 }, (_, k) => {
  const level = 2 + Math.floor(k / 2);
  return { progress: k % 2 === 0 ? { level, xp: 160, xpForNext: 200 } : { level: level + 1, xp: 30, xpForNext: 200 } };
});

/**
 * The profile at the home's top left (#787, reshaped by #830 and #928): the avatar with the level's path round it, an opaque bar
 * from its right clockwise to its top that runs on as a line to the right and ends square in the level tag, "Lv i", of one width
 * for every level from 1 to 99; the whole at most 1.5 times the avatar's width. The name, after the User icon, on a row under the
 * bar and the tag, shrunk to fit then cut with an ellipsis at the badge's end, on a band that starts behind the avatar and fades
 * out to transparent at the tag's left edge. It opens the profile sheet,
 * which has the XP made and left. The share of the level is laid on the whole path: the arc fills first, then the line. The
 * league, its crowns and the shield left it for the League control and the shield's plate under it (#829,
 * `Containers/LeagueControl`, `Elements/ShieldPlate`). One story per state; the widths (320, 375, 1440 px) are the home's
 * `LeftColumn*` stories, or Storybook's Viewport toolbar here.
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

/** 0 %: a new player, level 1 with no XP; the track alone, "Lv 1" in the tag. */
export const Start: Story = { parameters: profile(PROFILE.connected, PROGRESS.start) };
/** Level 9: the tag's width, as at every level from 1 to 99 (#928). */
export const Level9: Story = { parameters: profile(PROFILE.connected, { level: 9, xp: 120, xpForNext: 400 }) };
/** Level 10: two figures, the same tag. */
export const Level10: Story = { parameters: profile(PROFILE.connected, { level: 10, xp: 60, xpForNext: 450 }) };
/** Level 99: the widest the tag holds, the same width. */
export const Level99: Story = { parameters: profile(PROFILE.connected, { level: 99, xp: 900, xpForNext: 1_000 }) };
/** A name of 19 characters, the most a name has (owner, 2026-10-31): shrunk to 12 px, then cut with an ellipsis at the badge's end (its whole text in the title). */
export const LongName: Story = { parameters: profile({ status: "connected", data: { ...PROFILE.connected.data, player: { ...PROFILE.connected.data.player, name: "CobblestoneBuilder7" } } }, PROGRESS.partWay) };
/** 30 %: part of the arc. */
export const ThirtyPercent: Story = { parameters: profile(PROFILE.connected, PROGRESS.thirty) };
/** 40 %, level 3: the arc nearly full. */
export const PartWay: Story = { parameters: profile(PROFILE.connected, PROGRESS.partWay) };
/** 75 %: the arc full, the line well started. */
export const ThreeQuarters: Story = { parameters: profile(PROFILE.connected, PROGRESS.threeQuarters) };
/** Level 7 nearly full: the line nearly at "Lv 7". */
export const NearlyFull: Story = { parameters: profile(PROFILE.connected, PROGRESS.nearlyFull) };
/** 100 %: the arc and the line full, the moment before the level turns over. */
export const Full: Story = { parameters: profile(PROFILE.connected, PROGRESS.full) };
/** The level cap (20, #734): the path full, "Lv 20"; the name says max level. */
export const MaxLevel: Story = { parameters: profile(PROFILE.connected, PROGRESS.maxLevel) };
/** The avatar the player saved (#626). */
export const SavedAvatar: Story = { parameters: profile(PROFILE.connected, PROGRESS.partWay, SAVED_LOOK) };
/** The XP still read: the empty track, "Lv" alone. */
/** A new player on the mock (#926): their drawn name beside the drawn look, level 1. */
export const NewPlayer: Story = { parameters: profile(NEW_PLAYER_PROFILE, PROGRESS.start, NEW_PLAYER.look) };
export const ReadingXp: Story = { parameters: profile(PROFILE.connected, undefined) };
/** WRAP360: a four-digit level (past the tag's 99: "99+", never at the cap of 20) and a long name, cut with an ellipsis (its whole text in the title). */
export const Stress: Story = { parameters: profile(PROFILE.stress, PROGRESS.stress) };
/** No wallet: the silhouette, "Guest", no path. */
export const Guest: Story = { parameters: profile(PROFILE.guest) };
/** The wallet still looking for a session: the avatar's placeholder. */
export const Loading: Story = { parameters: profile(PROFILE.loading) };
/** XP gained: the path fills to its new share, a "+N XP" rises at the progress's end, on the arc then on the line. */
export const Gain: Story = { render: () => <Playing steps={GAINS} />, parameters: { reducedMotion: "never" } };
/** Level up: the path completes, flashes with the tag and starts again, the level turns over to the next number. */
export const LevelUp: Story = { render: () => <Playing steps={LEVEL_UPS} everyMs={2_400} />, parameters: { reducedMotion: "never" } };
/** Reduced motion: the values change at once with a brief flash, nothing moves. */
export const LevelUpReducedMotion: Story = { render: () => <Playing steps={LEVEL_UPS} everyMs={2_400} />, parameters: { reducedMotion: "always" } };
