import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { VAULT } from "../../mocks/scenes";
import { VaultScene } from "./vault-scene";

/** The Vault (`/vault`, vPAVED): the position, its value, its share of the Vault and `max_withdraw`, the rate and the exit fee, deposit, withdraw (its fee shown first) and withdraw all; the Vault's part of each purchase. One story per state; the viewport is the toolbar's (VP). */
const meta = { title: "Scenes/Vault", component: VaultScene, args: { onModeChange: fn(), onAmountChange: fn(), onMax: fn(), onDeposit: fn(), onWithdraw: fn(), onWithdrawAll: fn(), onPlay: fn(), onConnect: fn(), onRetry: fn(), onNavigate: fn() } } satisfies Meta<typeof VaultScene>;
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
/** No wallet: Connect. */
export const Guest: Story = { args: VAULT.guest };

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

/** The vPAVED delegated: its votes go through that address (read only). */
export const Delegated: Story = { args: VAULT.delegated };

/** WRAP360: long names and sentences, full addresses, large figures. */
export const Stress: Story = { args: VAULT.stress };
