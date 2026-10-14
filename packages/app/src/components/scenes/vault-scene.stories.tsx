import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { VAULT } from "../../mocks/scenes";
import { VaultScene } from "./vault-scene";

/** The Vault (`/vault`, vPAVED): the position, its value and `max_withdraw`, the rate and the exit fee, deposit, withdraw and withdraw all; the Vault's part of each purchase. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Vault", component: VaultScene, args: { onModeChange: fn(), onAmountChange: fn(), onMax: fn(), onDeposit: fn(), onWithdraw: fn(), onWithdrawAll: fn(), onPlay: fn(), onNavigate: fn() } } satisfies Meta<typeof VaultScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No vPAVED yet: a first deposit of 100 $TILE, its preview. */
export const NoPosition: Story = { args: VAULT.noPosition };

/** 1,250.40 vPAVED held; a withdraw of 500 $TILE, its preview. */
export const Position: Story = { args: VAULT.position };

/** The deposit on its way. */
export const Depositing: Story = { args: VAULT.depositing };

/** The withdraw on its way. */
export const Withdrawing: Story = { args: VAULT.withdrawing };

/** 1,300 $TILE asked, over `max_withdraw` (1,291.12): refused before any send. */
export const OverMaxWithdraw: Story = { args: VAULT.overMax };

/** No vPAVED and no $TILE in the wallet. */
export const NoPaved: Story = { args: VAULT.noPaved };

/** No economy on this network. */
export const NotDeployed: Story = { args: VAULT.notDeployed };
