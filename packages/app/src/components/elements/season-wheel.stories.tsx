import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { WHEEL_SEASONS, WHEEL_STATES, initialWheelRound, nextWheelRound, type WheelRound } from "../../data/season-wheel";
import { SEASON_GLYPH, SeasonWheel, TIME_GLYPH } from "./season-wheel";
import { WorldIcon } from "./world-icon";
import { bothThemes } from "../../stories/both-themes";
import { PHONE_320, VIEWPORT_OPTIONS } from "../scenes/viewports";

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
 * Auto, a summer day (#909): three layers, the stones outside, the seasons' disc, the day and night disc at the centre. The red
 * needle at the top crosses summer's quarter and the centre's day half (the sun behind a cloud): "now". No auto mark.
 */
export const Auto: Story = {};
/** Auto, a summer night: the needle still in summer's quarter, on the centre's night half (the moon and its stars). */
export const AutoAtNight: Story = { args: { point: { season: "summer", position: 0.8 } } };
export const AutoInAutumn: Story = { args: { point: { season: "autumn", position: 0.3 } } };
export const AutoInAutumnAtNight: Story = { args: { point: { season: "autumn", position: 0.75 } } };
export const AutoInWinter: Story = { args: { point: { season: "winter", position: 0.3 } } };
export const AutoInWinterAtNight: Story = { args: { point: { season: "winter", position: 0.75 } } };
export const AutoInSpring: Story = { args: { point: { season: "spring", position: 0.3 } } };
export const AutoInSpringAtNight: Story = { args: { point: { season: "spring", position: 0.75 } } };
/** A fixed season holds its day: its quarter under the needle, the centre's day half too, at its middle. No fixed mark. */
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
  // One season in 3 s (the game's takes 120 s): the discs turn as the cycle does at 40x.
  useEffect(() => {
    const id = setInterval(() => setSeasons((p) => p + 0.0333), 100);
    return () => clearInterval(id);
  }, []);
  return <SeasonWheel state="auto" point={{ season: WHEEL_SEASONS[Math.floor(seasons) % 4]!, position: seasons % 1 }} turnMs={100} />;
}

/** The turning discs, sped up: one season in 3 s, the centre disc a whole day and night in the same time, four per year. */
export const Turning: Story = { render: () => <Turning_ /> };

function Clicks_({ now }: { now: (typeof WHEEL_SEASONS)[number] }) {
  const [round, setRound] = useState<WheelRound>(() => initialWheelRound(true));
  return <SeasonWheel state={round.state} point={{ season: now, position: 0.3 }} onNext={() => setRound((r) => nextWheelRound(r, now))} />;
}

/** Click (#909), the cycle in summer: autumn, winter, spring, summer (now's own season last), and auto on the fifth tap. */
export const Interactive: Story = { render: () => <Clicks_ now="summer" /> };
/** Click, the cycle in winter: spring, summer, autumn, winter, auto. */
export const InteractiveFromWinter: Story = { render: () => <Clicks_ now="winter" /> };

/** The full round from auto in autumn, side by side (#909): auto, then winter, spring, summer, autumn, and auto on the fifth tap. */
export const FullRound: Story = {
  render: () => {
    const rounds = [initialWheelRound(true)];
    for (let i = 0; i < 5; i++) rounds.push(nextWheelRound(rounds.at(-1)!, "autumn"));
    return (
      <div className="flex flex-wrap gap-4">
        {rounds.map((r, i) => (
          <SeasonWheel key={i} state={r.state} point={r.state === "auto" ? { season: "autumn", position: 0.3 } : null} />
        ))}
      </div>
    );
  },
};

function PlayedRound_() {
  const [round, setRound] = useState<WheelRound>(() => initialWheelRound(true));
  // A tap every 1.5 s, the cycle in autumn: the round goes on by itself, the discs always turning forward.
  useEffect(() => {
    const id = setInterval(() => setRound((r) => nextWheelRound(r, "autumn")), 1500);
    return () => clearInterval(id);
  }, []);
  return <SeasonWheel state={round.state} point={{ season: "autumn", position: 0.3 }} />;
}

/** The full round played, a tap every 1.5 s, at 144 px (a tablet): the discs turn on to each season, then on to auto. */
export const PlayedRoundAt144: Story = { render: () => <PlayedRound_ />, globals: { viewport: { value: "tablet", isRotated: false } } };

/** The dial's three sizes (#909's acceptance): 96 px under 390 px wide, 108 px on other phones, 144 px from tablet up. */
export const At96: Story = { ...PHONE_320, args: { point: { season: "winter", position: 0.8 } } };
export const At108: Story = {
  args: { point: { season: "winter", position: 0.8 } },
  parameters: { viewport: { options: { ...VIEWPORT_OPTIONS, phone414: { name: "Phone 414", styles: { width: "414px", height: "896px" }, type: "mobile" } } } },
  globals: { viewport: { value: "phone414", isRotated: false } },
};
export const At144: Story = { args: { point: { season: "winter", position: 0.8 } }, globals: { viewport: { value: "tablet", isRotated: false } } };

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
 * The wheel's marks side by side (#870's review): the four seasons' icons, then the centre disc's by day and by night. The day's
 * is a small sun behind a light cloud, not summer's lone gold sun, so summer and day are told apart at a glance.
 */
export const Marks: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3 text-[1.5rem]">
      {WHEEL_SEASONS.map((s) => <WorldIcon key={s} name={SEASON_GLYPH[s]} size="inherit" label={s} />)}
      <span className="h-8 w-px bg-border" />
      <WorldIcon name={TIME_GLYPH.day} size="inherit" label="day" />
      <WorldIcon name={TIME_GLYPH.night} size="inherit" label="night" />
    </div>
  ),
  decorators: [bothThemes],
};
