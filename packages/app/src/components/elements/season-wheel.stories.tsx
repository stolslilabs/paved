import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { WHEEL_SEASONS, WHEEL_STATES, initialWheelRound, nextWheelRound, type WheelRound } from "../../data/season-wheel";
import { SEASON_GLYPH, SeasonWheel } from "./season-wheel";
import { WorldIcon } from "./world-icon";
import { bothThemes } from "../../stories/both-themes";

const meta = {
  title: "Elements/SeasonWheel",
  component: SeasonWheel,
  parameters: { layout: "padded" },
  args: { state: "auto", point: { season: "summer", position: 0.3 }, onNext: fn() },
  decorators: [(Story) => <div className="inline-block rounded-xl bg-board p-3"><Story /></div>],
} satisfies Meta<typeof SeasonWheel>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Auto, a summer day: the disc follows the cycle under the pointer, the day mark (a sun behind a cloud) on the rim, the auto
 * marker in the hub: summer's own sun, on the disc beside it, is told apart at a glance (#870's review).
 */
export const Auto: Story = {};
/** Auto, a summer night: the pointer in summer's night quarter, the moon on the rim. */
export const AutoAtNight: Story = { args: { point: { season: "summer", position: 0.8 } } };
export const AutoInAutumn: Story = { args: { point: { season: "autumn", position: 0.3 } } };
export const AutoInAutumnAtNight: Story = { args: { point: { season: "autumn", position: 0.75 } } };
export const AutoInWinter: Story = { args: { point: { season: "winter", position: 0.3 } } };
export const AutoInWinterAtNight: Story = { args: { point: { season: "winter", position: 0.75 } } };
export const AutoInSpring: Story = { args: { point: { season: "spring", position: 0.3 } } };
export const AutoInSpringAtNight: Story = { args: { point: { season: "spring", position: 0.75 } } };
/** A fixed season holds its day: the pointer in the middle of its day, the hub a pin. */
export const Summer: Story = { args: { state: "summer", point: null } };
export const Autumn: Story = { args: { state: "autumn", point: null } };
export const Winter: Story = { args: { state: "winter", point: null } };
export const Spring: Story = { args: { state: "spring", point: null } };

/** Every state side by side, by day and by night: the icons apart, each a game icon in its season's tone (#870). */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      {WHEEL_SEASONS.flatMap((s) => [0.3, 0.8].map((position) => <SeasonWheel key={`${s}-${position}`} state="auto" point={{ season: s, position }} />))}
      {WHEEL_STATES.filter((s) => s !== "auto").map((s) => <SeasonWheel key={s} state={s} />)}
    </div>
  ),
};

function Turning_() {
  const [seasons, setSeasons] = useState(0.1);
  // One season in 3 s (the game's takes 120 s): the disc turns as the cycle does at 40x.
  useEffect(() => {
    const id = setInterval(() => setSeasons((p) => p + 0.0333), 100);
    return () => clearInterval(id);
  }, []);
  return <SeasonWheel state="auto" point={{ season: WHEEL_SEASONS[Math.floor(seasons) % 4]!, position: seasons % 1 }} turnMs={100} />;
}

/** The turning disc, sped up: one season in 3 s, the badge turning to the moon at each dusk and back to the day mark at each dawn. */
export const Turning: Story = { render: () => <Turning_ /> };

function Clicks_({ now }: { now: (typeof WHEEL_SEASONS)[number] }) {
  const [round, setRound] = useState<WheelRound>(() => initialWheelRound(true));
  return <SeasonWheel state={round.state} point={{ season: now, position: 0.3 }} onNext={() => setRound((r) => nextWheelRound(r, now))} />;
}

/** Click (#634), the cycle in summer: autumn, the next season not yet started, then winter, spring, and auto on the fourth tap. */
export const Interactive: Story = { render: () => <Clicks_ now="summer" /> };
/** Click, the cycle in winter: spring, summer, autumn, auto. */
export const InteractiveFromWinter: Story = { render: () => <Clicks_ now="winter" /> };

/** The four-tap round from auto in autumn, side by side: auto, then winter, spring, summer, and auto on the fourth tap. */
export const FourTapRound: Story = {
  render: () => {
    const rounds = [initialWheelRound(true)];
    for (let i = 0; i < 4; i++) rounds.push(nextWheelRound(rounds.at(-1)!, "autumn"));
    return (
      <div className="flex flex-wrap gap-4">
        {rounds.map((r, i) => (
          <SeasonWheel key={i} state={r.state} point={r.state === "auto" ? { season: "autumn", position: 0.3 } : null} />
        ))}
      </div>
    );
  },
};

/** The wheel's game icons in both themes (issue 870), by day and by night: the app's dark theme and the light scope. */
export const BothThemesDayAndNight: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <SeasonWheel state="auto" point={{ season: "summer", position: 0.3 }} />
      <SeasonWheel state="auto" point={{ season: "winter", position: 0.8 }} />
    </div>
  ),
  decorators: [bothThemes],
};

/**
 * The wheel's marks side by side (#870's review): the four seasons' icons, then the now badge's by day and by night. The day's
 * is a small sun behind a light cloud, not summer's lone gold sun, so summer and day are told apart at a glance.
 */
export const Marks: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3 text-[1.5rem]">
      {WHEEL_SEASONS.map((s) => <WorldIcon key={s} name={SEASON_GLYPH[s]} size="inherit" label={s} />)}
      <span className="h-8 w-px bg-border" />
      <WorldIcon name="cloud-sun" size="inherit" label="day" />
      <WorldIcon name="moon" size="inherit" label="night" />
    </div>
  ),
  decorators: [bothThemes],
};
