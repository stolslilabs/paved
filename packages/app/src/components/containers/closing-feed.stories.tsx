import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "../ui/button";
import { CLOSINGS_38, LAST_SCORED } from "../../mocks/board";
import { ClosingFeed, ClosingLine } from "./closing-feed";
import { BIG_NUMBER } from "../../mocks/stress";
import { bothThemes } from "../../stories/both-themes";

const meta = { title: "Containers/ClosingFeed", component: ClosingFeed, parameters: { layout: "padded" }, args: { closings: LAST_SCORED } } satisfies Meta<typeof ClosingFeed>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Two structures closed by one move, sliding in one after the other. */
export const TwoClosings: Story = {};
export const One: Story = { args: { closings: [CLOSINGS_38[1]] } };
/** A forest closed at 0 points still shows. */
export const ZeroPoints: Story = { args: { closings: [CLOSINGS_38[2]] } };
export const NoneClosed: Story = { args: { closings: [] } };

/** Each press plays the next move's closings: they appear, then the next move clears them. */
export const AsTheyAppear: Story = {
  render: function Render() {
    const [move, setMove] = useState(0);
    const closings = move === 0 ? [] : [CLOSINGS_38[(move - 1) % CLOSINGS_38.length]];
    return (
      <div className="flex flex-col items-center gap-4">
        <Button onClick={() => setMove((m) => m + 1)}>Next move</Button>
        <ClosingFeed closings={closings} />
      </div>
    );
  },
};

/** One line of the over screen's list, with the tile that closed it. */
export const Line: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-2 rounded-xl bg-card p-4">
      {CLOSINGS_38.slice(0, 4).map((c) => (
        <ClosingLine key={c.tileId} closing={c} move={c.tileId} />
      ))}
    </div>
  ),
};
/** WRAP360: the largest structure and points a closing can show. */
export const Stress: Story = { args: { closings: [{ category: LAST_SCORED[0].category, size: 999, points: BIG_NUMBER }, { ...LAST_SCORED[1], size: 999, points: BIG_NUMBER }] } };

/** The closings' game icons in both themes (issue 870): the app's dark theme and the light scope. */
export const TwoClosingsBothThemes: Story = { decorators: [bothThemes] };
