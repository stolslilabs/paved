import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import type { Tab } from "../../routes/pages";
import { AppNav } from "./app-nav";

/** Every story keeps its own active tab: a click moves it, so the indicator's slide and the colours can be checked. `active` is the starting tab. */
function Stateful({ active, onNavigate, ...args }: React.ComponentProps<typeof AppNav>) {
  const [current, setCurrent] = useState<Tab>(active);
  useEffect(() => setCurrent(active), [active]);
  return (
    <AppNav
      {...args}
      active={current}
      onNavigate={(tab) => {
        setCurrent(tab);
        onNavigate?.(tab);
      }}
    />
  );
}

const meta = {
  title: "Containers/AppNav",
  component: AppNav,
  args: { active: "home", onNavigate: fn() },
  render: (args) => <Stateful {...args} />,
  decorators: [(Story) => <div className="flex min-h-[20rem]"><Story /></div>],
} satisfies Meta<typeof AppNav>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The bottom bar on a phone (icon and label from 360 px), a left rail with labels from 1024 px (the theme's `desktop`): the Viewport control switches between them. Click a tab: it becomes the active one and the indicator slides (Motion `layoutId`). */
export const Default: Story = {};

/** Starts on Ranks. */
export const ActiveRanks: Story = { args: { active: "ranks" } };

/** Starts on the Vault tab (Font Awesome's `piggy-bank`). */
export const ActiveVault: Story = { args: { active: "vault" } };
