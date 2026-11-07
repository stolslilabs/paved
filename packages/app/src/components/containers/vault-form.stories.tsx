import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GUARD_RATE, PAVED_BALANCE, SPLIT_BPS } from "../../mocks/economy";
import { EXIT_FEE_BPS, PREVIEW_DEPOSIT_100, PREVIEW_MINT_25, PREVIEW_REDEEM_100, PREVIEW_WITHDRAW_500, VAULT_HELD } from "../../mocks/vault";
import { VaultForm } from "./vault-form";
import { BIG_AMOUNT_18 } from "../../mocks/stress";

const meta = {
  title: "Containers/VaultForm",
  component: VaultForm,
  parameters: { layout: "padded" },
  args: {
    mode: "deposit",
    unit: "paved",
    amount: "100",
    balance: PAVED_BALANCE,
    shares: VAULT_HELD.shares,
    value: VAULT_HELD.value,
    maxWithdraw: VAULT_HELD.maxWithdraw,
    exitFeeBps: EXIT_FEE_BPS,
    totalAssets: VAULT_HELD.totalAssets,
    totalSupply: VAULT_HELD.totalSupply,
    preview: PREVIEW_DEPOSIT_100,
    split: SPLIT_BPS,
    guardRate: GUARD_RATE,
    onAmountChange: fn(),
    onUnitChange: fn(),
    onMax: fn(),
    onWithdrawAll: fn(),
    onPlay: fn(),
  },
  // On the drawer's charcoal, a phone's width (VAULT-PAGE).
  decorators: [(Story) => <div className="w-96 max-w-full bg-secondary p-4"><Story /></div>],
} satisfies Meta<typeof VaultForm>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A deposit of 100 PAVED: its dollars and the wallet under the field, the notes under it all. */
export const Deposit: Story = {};
export const DepositEmpty: Story = { args: { amount: "", preview: null } };
export const DepositOverWallet: Story = { args: { amount: "500" } };
export const Depositing: Story = { args: { busy: "deposit" } };
/** No vPAVED and no PAVED: Play over the field, which stays. */
export const NoPaved: Story = { args: { amount: "", preview: null, balance: 0n, shares: 0n } };
/** A mint of 25 vPAVED (the unit switched to vPAVED): its dollars, the wallet that pays. */
export const Mint: Story = { args: { unit: "vpaved", amount: "25", preview: PREVIEW_MINT_25 } };
/** A withdraw of 500 PAVED: its receipt (the fee on top), Withdraw all and its fee. */
export const Withdraw: Story = { args: { mode: "withdraw", amount: "500", preview: PREVIEW_WITHDRAW_500 } };
/** A redeem of 100 vPAVED: its receipt (the vPAVED burned, the fee inside). */
export const Redeem: Story = { args: { mode: "withdraw", unit: "vpaved", amount: "100", preview: PREVIEW_REDEEM_100 } };
/** More vPAVED than held: refused before any send. */
export const RedeemOverHeld: Story = { args: { mode: "withdraw", unit: "vpaved", amount: "2000", preview: null } };
/** Above `max_withdraw`: refused before any send. */
export const WithdrawOverMax: Story = { args: { mode: "withdraw", amount: "1300", preview: null } };
export const Withdrawing: Story = { args: { mode: "withdraw", amount: "500", preview: PREVIEW_WITHDRAW_500, busy: "withdraw" } };
export const WithdrawingAll: Story = { args: { mode: "withdraw", amount: "", preview: null, busy: "withdrawAll" } };
/** WRAP360: the largest balance, amount and preview. */
export const Stress: Story = { args: { amount: "123456789012.99", balance: BIG_AMOUNT_18, preview: BIG_AMOUNT_18, shares: BIG_AMOUNT_18, maxWithdraw: BIG_AMOUNT_18 } };
/** The write came back refused: the one error component (P-67), its typed name and hash to copy. */
export const DepositRefused: Story = {
  args: {
    refused: "The exit fee changed: confirm again.",
    refusedDetail: { code: "VaultExitFeeChangedError", txHash: "0x05f16e7f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5", version: "0.1.0", at: Date.UTC(2026, 9, 16, 9, 30) },
  },
};
