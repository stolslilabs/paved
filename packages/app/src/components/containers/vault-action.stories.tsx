import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PAVED_BALANCE } from "../../mocks/economy";
import { BIG_AMOUNT_18 } from "../../mocks/stress";
import { PREVIEW_DEPOSIT_25, PREVIEW_MINT_25, PREVIEW_REDEEM_100, PREVIEW_WITHDRAW_500, VAULT_HELD } from "../../mocks/vault";
import { VaultAction } from "./vault-action";

const meta = {
  title: "Containers/VaultAction",
  component: VaultAction,
  parameters: { layout: "padded" },
  args: { op: "deposit", amount: "25", limit: PAVED_BALANCE, preview: PREVIEW_DEPOSIT_25, onSend: fn() },
  // The bill on the body's charcoal, as the Vault's footer draws it, a phone's width.
  decorators: [(Story) => <div className="w-96 max-w-full bg-secondary"><Story /></div>],
} satisfies Meta<typeof VaultAction>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A deposit of 25 PAVED: about 23.05 vPAVED, the gold Deposit. */
export const Deposit: Story = {};
/** A mint of 25 vPAVED: the PAVED it takes, the gold Mint. */
export const Mint: Story = { args: { op: "mint", limit: VAULT_HELD.shares, preview: PREVIEW_MINT_25 } };
/** A withdraw of 500 PAVED: the vPAVED it uses, its fee included. */
export const Withdraw: Story = { args: { op: "withdraw", amount: "500", limit: VAULT_HELD.maxWithdraw, preview: PREVIEW_WITHDRAW_500 } };
/** A redeem of 100 vPAVED: the PAVED it pays, its fee taken. */
export const Redeem: Story = { args: { op: "redeem", amount: "100", limit: VAULT_HELD.shares, preview: PREVIEW_REDEEM_100 } };
/** Nothing typed: nothing to send. */
export const Empty: Story = { args: { amount: "", preview: null } };
/** The preview on its way. */
export const Previewing: Story = { args: { preview: null } };
/** The deposit waits in the wallet: its word kept, a spinner in it. */
export const Busy: Story = { args: { busy: "deposit" } };
/** The page's state holds it (a read on its way or failed, no economy). */
export const Disabled: Story = { args: { amount: "", preview: null, disabled: true } };
/** WRAP360: the largest preview. */
export const Stress: Story = { args: { amount: "123456789012.99", limit: BIG_AMOUNT_18, preview: BIG_AMOUNT_18 } };
