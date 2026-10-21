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
 * Play (#623), in the centre, has no label: a gold disc raised above the bar on a phone. The desktop header has no Play
 * (#668): Home, Missions, Vault, Settings, and Play is reached from the Home page. One story per item active.
 */
export const Default: Story = {};

/** Starts on Missions. */
export const ActiveMissions: Story = { args: { active: "quests" } };

/** Play active: it never is in the app (the mode choice is a full-screen page, without the bar), shown for the states. Phone only: the desktop header has no Play (#668). */
export const ActivePlay: Story = { args: { active: "play" } };

/** Starts on the Vault tab (Font Awesome's `piggy-bank`). */
export const ActiveVault: Story = { args: { active: "vault" } };

/** Starts on Settings. */
export const ActiveSettings: Story = { args: { active: "settings" } };
