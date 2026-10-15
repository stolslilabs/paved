import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { REFERRAL_LINK } from "../../mocks/referral";
import { CopyField } from "./copy-field";
import { LONG_ADDRESS } from "../../mocks/stress";

const meta = {
  title: "Elements/CopyField",
  component: CopyField,
  parameters: { layout: "padded" },
  args: { value: REFERRAL_LINK, label: "Your referral link", onCopy: fn() },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
} satisfies Meta<typeof CopyField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Copied: Story = { args: { copied: true } };
/** WRAP360: a full address cut at the field's end, the whole value in its title and copied whole. */
export const Stress: Story = { args: { value: LONG_ADDRESS, label: "Your address" } };
