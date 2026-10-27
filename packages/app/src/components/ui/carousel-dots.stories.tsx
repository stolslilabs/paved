import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { CarouselDots } from "./carousel-dots";

const meta = { title: "UI/CarouselDots", component: CarouselDots, parameters: { layout: "padded" }, args: { count: 23, current: 5 } } satisfies Meta<typeof CarouselDots>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The position only (the Story page's campaigns on a phone): hidden from screen readers. */
export const Static: Story = { args: { count: 6, current: 2 } };
/** 23 clickable dots, the League's: they fit 320 px on one line. */
export const Clickable: Story = { args: { onSelect: fn(), label: (i) => `Go to league ${i + 1}` } };
/** The first and the last. */
export const First: Story = { args: { current: 0, onSelect: fn() } };
export const Last: Story = { args: { current: 22, onSelect: fn() } };
/** A window of 9 around the current one (#833, open point 2), held inside the row at the ends. */
export const Window: Story = { args: { current: 11, window: 9, onSelect: fn() } };
/** A tap jumps there. */
export const Interactive: Story = {
  render: (args) => {
    const [current, setCurrent] = useState(args.current);
    return <CarouselDots {...args} current={current} onSelect={setCurrent} />;
  },
};
