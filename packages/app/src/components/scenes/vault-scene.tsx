import type { SplitView, VaultPosition as Position } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Amount } from "../elements/amount";
import { Notice } from "../elements/notice";
import { SplitBar } from "../containers/split-bar";
import { TabPage } from "../containers/tab-page";
import { VaultForm, type VaultMode } from "../containers/vault-form";
import { VaultPosition } from "../containers/vault-position";

export interface VaultSceneProps {
  /** The economy's addresses are configured (`EconomyDeployment.configured`); false: nothing to read or send. */
  deployed: boolean;
  /** The viewer's position (`EconomyViews.vault`); null when not deployed. */
  position: Position | null;
  /** PAVED in the wallet (`pavedBalance`). */
  balance: bigint;
  /** `Economy.split_bps()`: the Vault's part of each purchase. */
  split: SplitView | null;
  mode: VaultMode;
  /** The amount typed, in $TILE. */
  amount: string;
  /** `preview_deposit` / `preview_withdraw` of the typed amount; null until read. */
  preview: bigint | null;
  busy?: "deposit" | "withdraw" | "withdrawAll" | null;
  onModeChange?: (mode: VaultMode) => void;
  onAmountChange?: (amount: string) => void;
  onMax?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onWithdrawAll?: () => void;
  onPlay?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The Vault (`/vault`, V1b's vPAVED, P-56): $TILE deposited for vPAVED, whose rate rises with the Vault's part of every
 * purchase and every exit fee; the position, its value and `max_withdraw`; deposit, withdraw and withdraw all. No claim.
 */
export function VaultScene(props: VaultSceneProps) {
  const { deployed, position, balance, split } = props;
  const end = deployed ? (
    <span className="flex flex-col items-end text-xs text-muted-foreground">
      Wallet
      <Amount value={balance} token="paved" className="text-sm text-foreground" />
    </span>
  ) : undefined;

  if (!deployed || !position) {
    return (
      <TabPage tab="vault" title="Vault" subtitle="Stake $TILE for vPAVED" onNavigate={props.onNavigate}>
        <Notice tone="warning" title="Economy not deployed">
          This network has no Vault yet: there is nothing to deposit or withdraw. Training and the Tutorial still play.
        </Notice>
      </TabPage>
    );
  }

  const none = position.shares === 0n;
  const nothing = none && balance === 0n;
  return (
    <TabPage tab="vault" title="Vault" subtitle="Stake $TILE for vPAVED" end={end} onNavigate={props.onNavigate}>
      <div className="grid gap-4 desktop:grid-cols-[1fr_22rem] desktop:items-start">
        <div className="flex flex-col gap-4">
          <section aria-label="Your position" data-slot="card" className="rounded-xl border border-gold-900 bg-gold-950/40 px-4 pt-4 pb-2">
            {none ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Icon name="vault" size="xl" className="text-primary" />
                <p className="text-sm font-semibold">No vPAVED yet</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Deposit $TILE to hold vPAVED. Its rate rises with every purchase; there is nothing to claim, you withdraw at the rate.
                </p>
              </div>
            ) : (
              <VaultPosition position={position} />
            )}
          </section>

          {split && (
            <section aria-label="Where purchases go" data-slot="card" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <h2 className="font-display text-sm font-semibold">Where each purchase goes</h2>
              <SplitBar split={split} highlight="vault" />
              <p className="text-xs text-muted-foreground">
                The Vault's part is swapped for $TILE and added to the Vault, which raises the rate for every holder. With a referrer, the referral is paid out
                of it.
              </p>
            </section>
          )}
        </div>

        <section aria-label={props.mode === "deposit" ? "Deposit" : "Withdraw"} data-slot="card" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          {nothing ? (
            <Notice
              tone="info"
              title="No $TILE in your wallet"
              action={
                <Button size="sm" onClick={props.onPlay}>
                  Play
                </Button>
              }
            >
              $TILE is minted to Challenge games that beat their threshold. Earn some, then deposit it here.
            </Notice>
          ) : (
            <VaultForm
              mode={props.mode}
              amount={props.amount}
              balance={balance}
              shares={position.shares}
              maxWithdraw={position.maxWithdraw}
              exitFeeBps={position.exitFeeBps}
              preview={props.preview}
              busy={props.busy}
              onModeChange={props.onModeChange}
              onAmountChange={props.onAmountChange}
              onMax={props.onMax}
              onDeposit={props.onDeposit}
              onWithdraw={props.onWithdraw}
              onWithdrawAll={props.onWithdrawAll}
            />
          )}
        </section>
      </div>
    </TabPage>
  );
}
