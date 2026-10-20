import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { WHEEL_SEASONS, WHEEL_STATES, nextWheelState, type WheelState } from "../../data/season-wheel";
import { SeasonWheel } from "./season-wheel";

const meta = {
  title: "Elements/SeasonWheel",
  component: SeasonWheel,
  parameters: { layout: "padded" },
  args: { state: "auto", point: { season: "summer", position: 0.3 }, onNext: fn() },
  decorators: [(Story) => <div className="inline-block rounded-xl bg-board p-3"><Story /></div>],
} satisfies Meta<typeof SeasonWheel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Auto, a summer day: the disc follows the cycle under the pointer, the sun on the rim, the auto marker in the hub. */
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

/** Every state side by side, by day and by night: the icons apart, each tinted by its season's day sky. */
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

/** The turning disc, sped up: one season in 3 s, the badge turning to the moon at each dusk and back at each dawn. */
export const Turning: Story = { render: () => <Turning_ /> };

function Clicks_() {
  const [state, setState] = useState<WheelState>("auto");
  return <SeasonWheel state={state} point={{ season: "summer", position: 0.3 }} onNext={() => setState(nextWheelState)} />;
}

/** Click: auto, summer, autumn, winter, spring, auto. */
export const Interactive: Story = { render: () => <Clicks_ /> };
