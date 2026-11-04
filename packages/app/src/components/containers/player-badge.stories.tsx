import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { SAVED_LOOK } from "../../mocks/avatar";
import { PROGRESS } from "../../mocks/players";
import { NEW_PLAYER, NEW_PLAYER_PROFILE } from "../../mocks/new-player";
import { HALL_OF_FAME, PROFILE, RECORDS } from "../../mocks/scenes";
import { PHONE_375, WIDE_1440 } from "../scenes/viewports";
import type { PlayerProgress } from "../elements/xp-ring";
import { cn } from "../../lib/utils";
import { HUD_INSET_BOX } from "../elements/hud-inset";
import { PlayerBadge } from "./player-badge";
import { ProfileProvider, type ProfileValue } from "./profile-context";
import type { ProfileState } from "./profile-sheet";

const value = (state: ProfileState, progress: PlayerProgress | undefined, look: bigint | null = null): ProfileValue => ({
  state,
  progress,
  look,
  onConnect: fn(),
  hallOfFame: HALL_OF_FAME,
  records: RECORDS,
  onCopy: fn(async () => {}),
  onEditAvatar: fn(),
  onOpenLeague: fn(),
});
const profile = (state: ProfileState, progress?: PlayerProgress, look?: bigint | null) => ({ profile: value(state, progress, look) });

/** The home's top left, over the village's sky: where the card sits (#787), off the screen's top and left by the HUD's inset (HOME-HUD-PADDING). */
function Corner({ children }: { children: React.ReactNode }) {
  return <div className={cn("min-h-40 bg-gradient-to-b from-background/40 to-board pb-(--hud-inset)", HUD_INSET_BOX)}>{children}</div>;
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
        <PlayerBadge league={{ crowns: 1_240, attacks: 4 }} />
      </Corner>
    </ProfileProvider>
  );
}

/** A connected player of that name (the mock's own, with its avatar). */
const named = (name: string): ProfileState => ({ status: "connected", data: { ...PROFILE.connected.data, player: { ...PROFILE.connected.data.player, name } } });
/** The levels the owner checks the card at: one figure, the largest one-figure, two figures, the widest. */
const BADGE_LEVELS = [1, 9, 42, 99];

/** The card at each of `BADGE_LEVELS` with the name `name`, a third of the way through each level, one under the other. */
function Badges({ name }: { name: string }) {
  return (
    <Corner>
      <div className="flex flex-col gap-4">
        {BADGE_LEVELS.map((level) => (
          <ProfileProvider key={level} value={value(named(name), { level, xp: 100, xpForNext: 300 })}>
            <PlayerBadge league={{ crowns: 1_240, attacks: 4 }} />
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
 * The player card at the home's top left (#787, redrawn after the owner's direction of 2026-11-01, `docs/design/home.webp`): a dark
 * rounded card, the avatar in the rim of the player's league with its crest at the lower left, the name, and the level's star over
 * the XP's blue bar ("120/300"). The card grows with the name, which ends with an ellipsis where the home's room ends. It opens the
 * profile sheet, which has the XP made and left. One story per state, the rim of 1,240 crowns (Bronze I) unless the story says;
 * the `Names*` stories pin the owner's widths, 375 and 1440 px; the home's `LeftColumn*` and `OverlaysLongName*` stories show it
 * beside the balances.
 */
const meta = {
  title: "Containers/PlayerBadge",
  component: PlayerBadge,
  // At the screen's edge, as on the home: the corner's own inset is the HUD's.
  parameters: { layout: "fullscreen" },
  args: { league: { crowns: 1_240, attacks: 4 } },
  render: (args) => (
    <Corner>
      <PlayerBadge {...args} />
    </Corner>
  ),
} satisfies Meta<typeof PlayerBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A short name at 375 px, at levels 1, 9, 42 and 99: the card as short as it gets, the bar keeping its width. */
export const NamesShort375: Story = { render: () => <Badges name="Al" />, ...PHONE_375 };
/** The same at 1440 px, the card a little larger from `tablet`. */
export const NamesShort1440: Story = { render: () => <Badges name="Al" />, ...WIDE_1440 };
/** The longest name, 15 characters, at 375 px: the card grown to the name. */
export const NamesLongest375: Story = { render: () => <Badges name={LONGEST} />, ...PHONE_375 };
/** The same at 1440 px. */
export const NamesLongest1440: Story = { render: () => <Badges name={LONGEST} />, ...WIDE_1440 };

/** 0 %: a new player, level 1 with no XP; the bar empty, 1 in the star. */
export const Start: Story = { parameters: profile(PROFILE.connected, PROGRESS.start) };
/** Level 9: one figure in the star. */
export const Level9: Story = { parameters: profile(PROFILE.connected, { level: 9, xp: 120, xpForNext: 400 }) };
/** Level 10: two figures, the same star. */
export const Level10: Story = { parameters: profile(PROFILE.connected, { level: 10, xp: 60, xpForNext: 450 }) };
/** Level 99: the widest the star holds. */
export const Level99: Story = { parameters: profile(PROFILE.connected, { level: 99, xp: 900, xpForNext: 1_000 }) };
/** A name of 15 characters, the most a name has. */
export const LongName: Story = { parameters: profile(named(LONGEST), PROGRESS.partWay) };
/** 30 %. */
export const ThirtyPercent: Story = { parameters: profile(PROFILE.connected, PROGRESS.thirty) };
/** 40 %, level 3. */
export const PartWay: Story = { parameters: profile(PROFILE.connected, PROGRESS.partWay) };
/** 75 %. */
export const ThreeQuarters: Story = { parameters: profile(PROFILE.connected, PROGRESS.threeQuarters) };
/** Level 7 nearly full. */
export const NearlyFull: Story = { parameters: profile(PROFILE.connected, PROGRESS.nearlyFull) };
/** 100 %: the bar full, the moment before the level turns over. */
export const Full: Story = { parameters: profile(PROFILE.connected, PROGRESS.full) };
/** The level cap (20, #734): the bar full, "Max" in it, 20 in the star; the card's name says max level. */
export const MaxLevel: Story = { parameters: profile(PROFILE.connected, PROGRESS.maxLevel) };
/** The avatar the player saved (#626). */
export const SavedAvatar: Story = { parameters: profile(PROFILE.connected, PROGRESS.partWay, SAVED_LOOK) };
/** A new player on the mock (#926): their drawn name beside the drawn look, level 1, Unranked's rim (no crowns, no attack). */
export const NewPlayer: Story = { args: { league: { crowns: 0, attacks: 0 } }, parameters: profile(NEW_PLAYER_PROFILE, PROGRESS.start, NEW_PLAYER.look) };
/** Each league's rim and crest: Wood (no read), Silver, Gold, Diamond, Grand Master. */
export const Leagues: Story = {
  render: () => (
    <Corner>
      {/* Spaced as the home spaces the capsules under the card: the circle and its crest run past the card's foot. */}
      <div className="flex flex-col gap-14 pt-2">
        {[undefined, 1_700, 2_300, 3_600, 5_600].map((crowns) => (
          <ProfileProvider key={crowns ?? "none"} value={value(PROFILE.connected, PROGRESS.partWay)}>
            <PlayerBadge league={crowns === undefined ? null : { crowns, attacks: 4 }} />
          </ProfileProvider>
        ))}
      </div>
    </Corner>
  ),
};
/** The XP still read: the bar empty, the star blank. */
export const ReadingXp: Story = { parameters: profile(PROFILE.connected, undefined) };
/** WRAP360: a four-digit level (past 99: "99+", never at the cap of 20) and a name past the limit (its whole text in the title). */
export const Stress: Story = { parameters: profile(PROFILE.stress, PROGRESS.stress) };
/** No wallet: the silhouette, "Guest", no bar. */
export const Guest: Story = { parameters: profile(PROFILE.guest) };
/** The wallet still looking for a session: the avatar's placeholder, no name. */
export const Loading: Story = { parameters: profile(PROFILE.loading) };
/** XP gained: the bar fills to its new share, a "+N XP" rises over its end. */
export const Gain: Story = { render: () => <Playing steps={GAINS} />, parameters: { reducedMotion: "never" } };
/** Level up: the bar completes, flashes and starts again, the level turns over to the next number in the star. */
export const LevelUp: Story = { render: () => <Playing steps={LEVEL_UPS} everyMs={2_400} />, parameters: { reducedMotion: "never" } };
/** Reduced motion: the values change at once with a brief flash, nothing moves. */
export const LevelUpReducedMotion: Story = { render: () => <Playing steps={LEVEL_UPS} everyMs={2_400} />, parameters: { reducedMotion: "always" } };
