import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PAVED_BALANCE } from "../../mocks/economy";
import { EXIT_FEE_BPS, PREVIEW_DEPOSIT_100, PREVIEW_WITHDRAW_500, VAULT_HELD } from "../../mocks/vault";
import { VaultForm } from "./vault-form";
import { BIG_AMOUNT_18 } from "../../mocks/stress";

const meta = {
  title: "Containers/VaultForm",
  component: VaultForm,
  parameters: { layout: "padded" },
  args: {
    mode: "deposit",
    amount: "100",
    balance: PAVED_BALANCE,
    shares: VAULT_HELD.shares,
    maxWithdraw: VAULT_HELD.maxWithdraw,
    exitFeeBps: EXIT_FEE_BPS,
    preview: PREVIEW_DEPOSIT_100,
    onModeChange: fn(),
    onAmountChange: fn(),
    onMax: fn(),
    onDeposit: fn(),
    onWithdraw: fn(),
    onWithdrawAll: fn(),
  },
  decorators: [(Story) => <div className="max-w-md rounded-xl bg-card p-4"><Story /></div>],
} satisfies Meta<typeof VaultForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Deposit: Story = {};
export const DepositEmpty: Story = { args: { amount: "", preview: null } };
export const DepositOverWallet: Story = { args: { amount: "500" } };
export const Depositing: Story = { args: { busy: "deposit" } };
export const Withdraw: Story = { args: { mode: "withdraw", amount: "500", preview: PREVIEW_WITHDRAW_500 } };
/** Above `max_withdraw`: refused before any send. */
export const WithdrawOverMax: Story = { args: { mode: "withdraw", amount: "1300", preview: null } };
export const Withdrawing: Story = { args: { mode: "withdraw", amount: "500", preview: PREVIEW_WITHDRAW_500, busy: "withdraw" } };
export const WithdrawingAll: Story = { args: { mode: "withdraw", amount: "", preview: null, busy: "withdrawAll" } };
/** WRAP360: the largest balance, amount and preview. */
export const Stress: Story = { args: { amount: "123456789012.99", balance: BIG_AMOUNT_18, preview: BIG_AMOUNT_18, shares: BIG_AMOUNT_18, maxWithdraw: BIG_AMOUNT_18 } };
