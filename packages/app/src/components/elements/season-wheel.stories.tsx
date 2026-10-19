import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import { WHEEL_SEASONS, nextWheelState, type WheelState } from "../../data/season-wheel";
import { SeasonWheel } from "./season-wheel";

const meta = {
  title: "Elements/SeasonWheel",
  component: SeasonWheel,
  parameters: { layout: "padded" },
  args: { state: "auto", point: { season: "summer", position: 0.3 }, onNext: fn() },
  decorators: [(Story) => <div className="inline-block rounded-xl bg-card p-2"><Story /></div>],
} satisfies Meta<typeof SeasonWheel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Auto: the ring follows the cycle and the centre carries the marker, so it differs from "summer fixed". */
export const Auto: Story = {};
export const AutoInAutumn: Story = { args: { point: { season: "autumn", position: 0.6 } } };
export const Summer: Story = { args: { state: "summer", point: null } };
export const Autumn: Story = { args: { state: "autumn", point: null } };
export const Winter: Story = { args: { state: "winter", point: null } };
export const Spring: Story = { args: { state: "spring", point: null } };

function Turning_() {
  const [seasons, setSeasons] = useState(0);
  // One season in 3 s (the game's takes 120 s): the ring turns as the cycle does at 40x.
  useEffect(() => {
    const id = setInterval(() => setSeasons((p) => p + 0.0333), 100);
    return () => clearInterval(id);
  }, []);
  return <SeasonWheel state="auto" point={{ season: WHEEL_SEASONS[Math.floor(seasons) % 4]!, position: seasons % 1 }} turnMs={100} />;
}

/** The turning ring, sped up: one season in 3 s. */
export const Turning: Story = { render: () => <Turning_ /> };

function Clicks_() {
  const [state, setState] = useState<WheelState>("auto");
  return <SeasonWheel state={state} point={{ season: "summer", position: 0.3 }} onNext={() => setState(nextWheelState)} />;
}

/** Click: auto, summer, autumn, winter, spring, auto. */
export const Interactive: Story = { render: () => <Clicks_ /> };
