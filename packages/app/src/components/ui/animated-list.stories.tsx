import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AnimatedList, AnimatedListItem } from "./animated-list";
import { Button } from "./button";

const meta = { title: "UI/Animated List", component: AnimatedList, parameters: { layout: "padded" } } satisfies Meta<typeof AnimatedList>;
export default meta;
type Story = StoryObj<typeof meta>;

const PLAYERS = ["alice", "bob", "carol", "dave", "erin", "frank"];

/** A leaderboard in miniature: add a row at the top, remove the first, or shuffle (the rows slide to their place). */
function Leaderboard() {
  const [rows, setRows] = useState(PLAYERS.slice(0, 3).map((name, i) => ({ name, score: 4000 - i * 300 })));
  const add = () =>
    setRows((rs) => {
      const name = PLAYERS.find((p) => !rs.some((r) => r.name === p));
      return name ? [{ name, score: (rs[0]?.score ?? 4000) + 120 }, ...rs] : rs;
    });
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={add}>Add a row</Button>
        <Button size="sm" variant="secondary" onClick={() => setRows((rs) => rs.slice(1))}>Remove the first</Button>
        <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs].reverse())}>Reverse</Button>
      </div>
      <AnimatedList aria-label="Daily leaderboard">
        {rows.map((r, i) => (
          <AnimatedListItem key={r.name} className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2 text-sm text-card-foreground">
            <span>
              <span className="mr-3 text-muted-foreground tabular-nums">{i + 1}</span>
              {r.name}
            </span>
            <span className="tabular-nums">{r.score}</span>
          </AnimatedListItem>
        ))}
      </AnimatedList>
    </div>
  );
}

/** Reduced motion off: rows grow in and shrink out on a spring, the others slide (`layout`). */
export const MotionOff: Story = { name: "Rows, reduced motion off", parameters: { reducedMotion: "never" }, render: () => <Leaderboard /> };

/** Reduced motion on: the fade stays; the scale and the slide are dropped. */
export const MotionOn: Story = { name: "Rows, reduced motion on", parameters: { reducedMotion: "always" }, render: () => <Leaderboard /> };
