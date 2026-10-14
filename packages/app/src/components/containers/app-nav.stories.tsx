import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import type { Tab } from "../../routes/pages";
import { at } from "../scenes/viewports";
import { AppNav } from "./app-nav";

const meta = {
  title: "Containers/AppNav",
  component: AppNav,
  args: { active: "home", onNavigate: fn() },
  decorators: [(Story) => <div className="flex min-h-[20rem]"><Story /></div>],
} satisfies Meta<typeof AppNav>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The bottom bar on a phone: icon and label from 360 px. */
export const Mobile: Story = at<Story>("mobile", {});
export const Tablet: Story = at<Story>("tablet", { args: { active: "ranks" } });
/** From `desktop`, a left rail with labels. */
export const Desktop: Story = at<Story>("desktop", { args: { active: "vault" } });

/** Click a tab: the indicator slides (Motion `layoutId`). */
export const Interactive: Story = {
  render: function Render(args) {
    const [active, setActive] = useState<Tab>("home");
    return <AppNav {...args} active={active} onNavigate={setActive} />;
  },
};
