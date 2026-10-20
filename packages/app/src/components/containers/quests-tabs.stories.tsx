import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { QuestsTabs, type QuestsTab } from "./quests-tabs";

const meta = {
  title: "Containers/MissionsTabs",
  component: QuestsTabs,
  parameters: { layout: "padded", reducedMotion: "never" },
  args: { active: "quests", onSelect: fn() },
} satisfies Meta<typeof QuestsTabs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Quests: Story = {};
export const Achievements: Story = { args: { active: "achievements" } };

const mobile = { viewport: { value: "mobile", isRotated: false } };
const tablet = { viewport: { value: "tablet", isRotated: false } };
const wide = { viewport: { value: "wide", isRotated: false } };

/** A phone: the list takes the full width, two equal halves. */
export const Mobile: Story = { globals: mobile };
export const Tablet: Story = { globals: tablet };
export const Wide: Story = { globals: wide };

/** Hover on Lifetime while Limited is active: a gap between the hover layer and the active fill. */
export const HoverBesideActive: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("tab", { name: "Lifetime" }));
  },
};

/**
 * The route change: each tab is its own page, so the tabs mount again with the other value. The remembered last tab
 * makes the indicator slide from Limited to Lifetime, and the list keeps its width.
 */
export const RouteChange: Story = {
  render: () => {
    const [tab, setTab] = useState<QuestsTab>("quests");
    return <QuestsTabs key={tab} active={tab} onSelect={setTab} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const before = canvas.getByRole("tablist").getBoundingClientRect().width;
    await userEvent.click(canvas.getByRole("tab", { name: "Lifetime" }));
    const lifetime = canvas.getByRole("tab", { name: "Lifetime" });
    await expect(lifetime).toHaveAttribute("data-state", "active");
    await expect(canvas.getByRole("tablist").getBoundingClientRect().width).toBe(before);
    const indicator = canvasElement.querySelector<HTMLElement>('[data-slot="tabs-indicator"]')!;
    await expect(indicator.dataset.animate).toBe("true");
    await expect(indicator.style.transform).toBe(`translateX(${lifetime.offsetLeft}px)`);
  },
};
