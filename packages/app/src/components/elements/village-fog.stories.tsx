import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../ui/button";
import { VillageFog, type VillageFogProps } from "./village-fog";

/**
 * The fog over the home's scene while the village loads (#761), over a stand-in scene (a grid of lit cells where the village
 * would be). `Fogged` holds it; `Clearing` clears it a second after it mounts (Replay plays it again), as the canvas's ready
 * signal does; `Fade` is a later arrival's short fade; `ReducedMotion` the still mist and its plain fade.
 */
const meta = {
  title: "Elements/VillageFog",
  component: VillageFog,
  parameters: { layout: "fullscreen" },
  args: { arrival: "fog", cleared: false },
  render: (args) => <Stage {...args} />,
} satisfies Meta<typeof VillageFog>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The scene under the fog, cleared `clearAfter` ms after each mount when set. */
function Stage({ clearAfter, ...args }: VillageFogProps & { clearAfter?: number }) {
  const [run, setRun] = useState(0);
  const [cleared, setCleared] = useState(args.cleared);
  useEffect(() => {
    setCleared(args.cleared);
    if (clearAfter === undefined) return;
    const timer = setTimeout(() => setCleared(true), clearAfter);
    return () => clearTimeout(timer);
  }, [run, clearAfter, args.cleared]);
  return (
    <div className="relative h-dvh overflow-hidden bg-board">
      <div className="absolute inset-0 grid place-items-center">
        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: 25 }, (_, i) => (
            <span key={i} className={i % 3 ? "size-12 rounded-sm bg-success/60" : "size-12 rounded-sm bg-primary/70"} />
          ))}
        </div>
      </div>
      <VillageFog key={run} {...args} cleared={cleared} />
      {clearAfter !== undefined && (
        <Button size="sm" variant="outline" className="absolute right-4 bottom-4" onClick={() => setRun((r) => r + 1)}>
          Replay
        </Button>
      )}
    </div>
  );
}

/** Loading: the sky under two drifting banks of mist. */
export const Fogged: Story = {};
/** The village drawn: the fog thins out in 600 ms, then leaves. */
export const Clearing: Story = { render: (args) => <Stage {...args} clearAfter={1000} /> };
/** A later arrival: the sky alone, faded out in 200 ms. */
export const Fade: Story = { args: { arrival: "fade" }, render: (args) => <Stage {...args} clearAfter={1000} /> };
/** Reduced motion: the mist stands still, and a plain fade clears it. */
export const ReducedMotion: Story = { parameters: { reducedMotion: "always" }, render: (args) => <Stage {...args} clearAfter={1000} /> };
