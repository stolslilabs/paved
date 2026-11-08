import type { Meta, StoryObj } from "@storybook/react-vite";
import { SPLIT_BPS } from "../../mocks/economy";
import { SplitBar } from "./split-bar";

const meta = {
  title: "Containers/SplitBar",
  component: SplitBar,
  parameters: { layout: "padded" },
  args: { split: SPLIT_BPS },
  decorators: [(Story) => <div className="max-w-md rounded-xl bg-card p-4"><Story /></div>],
} satisfies Meta<typeof SplitBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The chain's defaults, as the Referral page shows them: burn 7,368, Vault 2,632, referral 500 out of the Vault's part, in gold. */
export const Defaults: Story = {};
/** Another owner-set split: the bar follows the chain's figures. */
export const OtherSplit: Story = { args: { split: { burn: 6_000, vault: 4_000, referral: 1_000 } } };
/** WRAP360: the widest figures (two decimals each); the descriptions wrap under them. */
export const Stress: Story = { args: { split: { burn: 6_666, vault: 3_334, referral: 1_111 } } };
