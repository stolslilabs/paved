import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FreeGames } from "./free-games";

const meta = {
  title: "Containers/FreeGames",
  component: FreeGames,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
  args: { credits: 0, daily: { done: 1, total: 4, claimed: false }, weekly: { done: 0, total: 3, claimed: false }, onClaim: fn(), onPlayFree: fn() },
} satisfies Meta<typeof FreeGames>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing earned yet: one daily of four done. */
export const InProgress: Story = {};
/** Every daily done: the day's free game to claim. */
export const DailyReady: Story = { args: { daily: { done: 4, total: 4, claimed: false } } };
/** Its claim on its way. */
export const Claiming: Story = { args: { daily: { done: 4, total: 4, claimed: false, claiming: true }, busy: true } };
/** Claimed: one free game to play. */
export const Claimed: Story = { args: { credits: 1, daily: { done: 4, total: 4, claimed: true } } };
