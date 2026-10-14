import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { Progress } from "./progress";

const meta = { title: "UI/Progress", component: Progress, parameters: { layout: "padded" }, decorators: [(Story) => <div className="max-w-sm"><Story /></div>] } satisfies Meta<typeof Progress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { value: 60, "aria-label": "Quest progress" } };
export const Empty: Story = { args: { value: 0, "aria-label": "Quest progress" } };
export const Full: Story = { args: { value: 100, "aria-label": "Quest progress" } };

/** Loading: a value that fills over time (the bar eases, unless reduced motion). */
export const Loading: Story = {
  render: () => {
    const [value, setValue] = useState(10);
    useEffect(() => {
      const id = setInterval(() => setValue((v) => (v >= 100 ? 10 : v + 15)), 900);
      return () => clearInterval(id);
    }, []);
    return <Progress value={value} aria-label="Loading" />;
  },
};
