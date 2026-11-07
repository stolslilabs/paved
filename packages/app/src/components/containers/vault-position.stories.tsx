import type { Meta, StoryObj } from "@storybook/react-vite";
import { GUARD_RATE } from "../../mocks/economy";
import { VAULT_HELD, VAULT_NONE } from "../../mocks/vault";
import { VaultPosition } from "./vault-position";
import { STRESS_VAULT } from "../../mocks/stress";

const meta = {
  title: "Containers/VaultPosition",
  component: VaultPosition,
  parameters: { layout: "padded" },
  args: { position: VAULT_HELD, guardRate: GUARD_RATE },
  // On the drawer's charcoal, a phone's width (VAULT-PAGE).
  decorators: [(Story) => <div className="w-96 max-w-full bg-secondary p-4"><Story /></div>],
} satisfies Meta<typeof VaultPosition>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 1,250.40 vPAVED at a rate of 1.0842: the coin in its light, the share of the supply, the worth in PAVED and dollars, the tiles, the rates. */
export const Held: Story = {};
/** No vPAVED yet: the same box at zero. */
export const NoShares: Story = { args: { position: VAULT_NONE } };
/** The guard's rate unread (or none before any purchase): no dollar figure. */
export const NoDollars: Story = { args: { guardRate: null } };
/** WRAP360: the largest share, value and totals. */
export const Stress: Story = { args: { position: STRESS_VAULT } };
