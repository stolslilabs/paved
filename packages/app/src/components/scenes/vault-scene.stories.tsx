import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { BalancesProvider } from "../containers/balances-context";
import { PAVED_BALANCE } from "../../mocks/economy";
import { VAULT } from "../../mocks/scenes";
import { VAULT_HELD } from "../../mocks/vault";
import { VaultScene } from "./vault-scene";

/** The shell's balances at the drawer's header end: the wallet's PAVED over the vPAVED held. */
const withVaultBalances: Decorator = (Story) => (
  <BalancesProvider value={{ state: { status: "ready", usdc: 0n, paved: PAVED_BALANCE, vpaved: VAULT_HELD.shares, cobbles: 0 }, kinds: ["paved", "vpaved"], onAction: fn() }}>
    <Story />
  </BalancesProvider>
);

/** The Vault (`/vault`, vPAVED; VAULT-PAGE): the HUD's drawer, the position (its value, `max_withdraw`, the exit fee, the rate), deposit, withdraw (its fee shown first) and withdraw all, the footer's tabs. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Vault", component: VaultScene, args: { onModeChange: fn(), onUnitChange: fn(), onAmountChange: fn(), onMax: fn(), onDeposit: fn(), onMint: fn(), onWithdraw: fn(), onRedeem: fn(), onWithdrawAll: fn(), onPlay: fn(), onRetry: fn(), onBack: fn() }, decorators: [withVaultBalances] } satisfies Meta<typeof VaultScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 1,250.40 vPAVED held; a deposit of 25 PAVED, its preview (the book's "vault"). */
export const Deposit: Story = { args: VAULT.deposit };

/** The unit switched to vPAVED: a mint of exactly 25 vPAVED, the PAVED it takes. */
export const Mint: Story = { args: VAULT.mint };

/** The Withdraw tab in vPAVED: a redeem of exactly 100 vPAVED, the PAVED it pays, its fee inside. */
export const Redeem: Story = { args: VAULT.redeem };

/** No vPAVED yet: the Position at zero. */
export const NoPosition: Story = { args: VAULT.noPosition };

/** 1,250.40 vPAVED held; a withdraw of 500 PAVED, its preview and its fee (the book's "vault-withdraw"). */
export const Withdraw: Story = { args: VAULT.withdraw };

/** The Position tab, the first: the vPAVED in its silver light, their worth, the tiles, the rates, the notes. */
export const Position: Story = { args: VAULT.position };

/** The deposit on its way. */
export const Depositing: Story = { args: VAULT.depositing };

/** The withdraw on its way. */
export const Withdrawing: Story = { args: VAULT.withdrawing };

/** 1,300 PAVED asked, over `max_withdraw` (1,291.12): refused before any send. */
export const OverMaxWithdraw: Story = { args: VAULT.overMax };

/** No vPAVED and no PAVED in the wallet. */
export const NoPaved: Story = { args: VAULT.noPaved };

/** No economy on this network. */
export const NotDeployed: Story = { args: VAULT.notDeployed };


/** The position and the wallet on their way. */
export const Loading: Story = { args: VAULT.loading };

/** A read failed: Retry. */
export const ReadError: Story = { args: VAULT.error };

/** The last write was refused, with the writer's message; the form is ready again. */
export const Refused: Story = { args: VAULT.refused };

/** A deposit went through: its receipt's PAVED and vPAVED. */
export const Deposited: Story = { args: VAULT.deposited };

/** A withdraw went through. */
export const Withdrawn: Story = { args: VAULT.withdrawn };

/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: VAULT.stress };
