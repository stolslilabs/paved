import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "../ui/button";
import { NumberTicker } from "./number-ticker";

const meta = { title: "Elements/Number Ticker", component: NumberTicker, parameters: { layout: "padded" }, args: { value: 4596 } } satisfies Meta<typeof NumberTicker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A score and a PAVED amount; the buttons change them and the counters spring to the new value. */
function Counters() {
  const [score, setScore] = useState(4596);
  const [paved, setPaved] = useState(12.5);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-6">
        <span className="font-display text-3xl text-foreground">
          <NumberTicker value={score} />
        </span>
        <span className="text-lg text-primary">
          <NumberTicker value={paved} decimalPlaces={2} /> PAVED
        </span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setScore((s) => s + 8)}>+ 8 points</Button>
        <Button size="sm" variant="secondary" onClick={() => setPaved((p) => p + 3.75)}>Claim 3.75 PAVED</Button>
      </div>
    </div>
  );
}

export const Default: Story = {};

/** Reduced motion off: the counters count up when they come into view, and spring on each change. */
export const MotionOff: Story = { name: "Counters, reduced motion off", parameters: { reducedMotion: "never" }, render: () => <Counters /> };

/** Reduced motion on: the value is written at once, no count. */
export const MotionOn: Story = { name: "Counters, reduced motion on", parameters: { reducedMotion: "always" }, render: () => <Counters /> };
