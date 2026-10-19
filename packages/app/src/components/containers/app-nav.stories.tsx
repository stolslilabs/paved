import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fn } from "storybook/test";
import type { Tab } from "../../routes/pages";
import { AppNav } from "./app-nav";

/** Every story keeps its own active tab: a click moves it, so the white states and the gold of the current item can be checked. `active` is the starting tab. */
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
  decorators: [(Story) => <div className="flex min-h-[20rem] flex-col justify-end desktop:justify-start"><Story /></div>],
} satisfies Meta<typeof AppNav>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Direction D (#537): the bottom bar on a phone, each item an icon over its label (labels from 360 px); from 1024 px (the
 * theme's `desktop`) a header across the top, the voxel wordmark, the items icon beside label. The Viewport control switches
 * between them. The current item is gold on the white 15% layer; hover is 10%, a press 20%. No rail, no sliding indicator.
 */
export const Default: Story = {};

/** Starts on Ranks. */
export const ActiveRanks: Story = { args: { active: "ranks" } };

/** Starts on the Vault tab (Font Awesome's `piggy-bank`). */
export const ActiveVault: Story = { args: { active: "vault" } };
