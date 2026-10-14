import type { Meta, StoryObj } from "@storybook/react-vite";
import { VAULT_HELD, VAULT_NONE } from "../../mocks/vault";
import { VaultPosition } from "./vault-position";

const meta = {
  title: "Containers/VaultPosition",
  component: VaultPosition,
  parameters: { layout: "padded" },
  args: { position: VAULT_HELD },
  decorators: [(Story) => <div className="max-w-md rounded-xl bg-card px-4 pt-4"><Story /></div>],
} satisfies Meta<typeof VaultPosition>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 1,250.40 vPAVED at a rate of 1.0842. */
export const Held: Story = {};
export const NoShares: Story = { args: { position: VAULT_NONE } };
