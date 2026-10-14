import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { VAULT } from "../../mocks/scenes";
import { VaultScene } from "./vault-scene";
import { at } from "./viewports";

/** The Vault (`/vault`, vPAVED): the position, its value and `max_withdraw`, the rate and the exit fee, deposit, withdraw and withdraw all; the Vault's part of each purchase. Each state at the four viewports. */
const meta = { title: "Scenes/Vault", component: VaultScene, args: { onModeChange: fn(), onAmountChange: fn(), onMax: fn(), onDeposit: fn(), onWithdraw: fn(), onWithdrawAll: fn(), onPlay: fn(), onNavigate: fn() } } satisfies Meta<typeof VaultScene>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No vPAVED yet: a first deposit of 100 $TILE, its preview. */
const noPosition: Story = { args: VAULT.noPosition };
export const NoPositionMobile: Story = at("mobile", noPosition);
export const NoPositionTablet: Story = at("tablet", noPosition);
export const NoPositionDesktop: Story = at("desktop", noPosition);
export const NoPositionWide: Story = at("wide", noPosition);

/** 1,250.40 vPAVED held; a withdraw of 500 $TILE, its preview. */
const position: Story = { args: VAULT.position };
export const PositionMobile: Story = at("mobile", position);
export const PositionTablet: Story = at("tablet", position);
export const PositionDesktop: Story = at("desktop", position);
export const PositionWide: Story = at("wide", position);

/** The deposit on its way. */
const depositing: Story = { args: VAULT.depositing };
export const DepositingMobile: Story = at("mobile", depositing);
export const DepositingTablet: Story = at("tablet", depositing);
export const DepositingDesktop: Story = at("desktop", depositing);
export const DepositingWide: Story = at("wide", depositing);

/** The withdraw on its way. */
const withdrawing: Story = { args: VAULT.withdrawing };
export const WithdrawingMobile: Story = at("mobile", withdrawing);
export const WithdrawingTablet: Story = at("tablet", withdrawing);
export const WithdrawingDesktop: Story = at("desktop", withdrawing);
export const WithdrawingWide: Story = at("wide", withdrawing);

/** 1,300 $TILE asked, over `max_withdraw` (1,287.89): refused before any send. */
const overMax: Story = { args: VAULT.overMax };
export const OverMaxWithdrawMobile: Story = at("mobile", overMax);
export const OverMaxWithdrawTablet: Story = at("tablet", overMax);
export const OverMaxWithdrawDesktop: Story = at("desktop", overMax);
export const OverMaxWithdrawWide: Story = at("wide", overMax);

/** No vPAVED and no $TILE in the wallet. */
const noPaved: Story = { args: VAULT.noPaved };
export const NoPavedMobile: Story = at("mobile", noPaved);
export const NoPavedTablet: Story = at("tablet", noPaved);
export const NoPavedDesktop: Story = at("desktop", noPaved);
export const NoPavedWide: Story = at("wide", noPaved);

/** No economy on this network. */
const notDeployed: Story = { args: VAULT.notDeployed };
export const NotDeployedMobile: Story = at("mobile", notDeployed);
export const NotDeployedTablet: Story = at("tablet", notDeployed);
export const NotDeployedDesktop: Story = at("desktop", notDeployed);
export const NotDeployedWide: Story = at("wide", notDeployed);
