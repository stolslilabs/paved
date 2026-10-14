import type { Meta, StoryObj } from "@storybook/react-vite";
import { SPLIT_BPS, boostBps, quote } from "../../mocks/economy";
import { PriceBreakdown } from "./price-breakdown";

const at = (stake: number) => ({ stake, price: quote(stake).price, boostBps: boostBps(stake) });

const meta = {
  title: "Containers/PriceBreakdown",
  component: PriceBreakdown,
  parameters: { layout: "padded" },
  args: { ...at(1), split: SPLIT_BPS, referrer: null },
  decorators: [(Story) => <div className="max-w-sm rounded-xl bg-card p-4"><Story /></div>],
} satisfies Meta<typeof PriceBreakdown>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StakeOne: Story = {};
export const StakeTen: Story = { args: at(10) };
export const WithReferrer: Story = { args: { ...at(3), referrer: "0x0456bb00000000000000000000000000000000000000000000000000000beef" } };
