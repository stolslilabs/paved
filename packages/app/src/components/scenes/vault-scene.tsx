import type { SplitView, VaultPosition as Position } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Amount } from "../elements/amount";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { TokenIcon } from "../elements/token-icon";
import { SplitBar } from "../containers/split-bar";
import { TabPage } from "../containers/tab-page";
import { VaultForm, type VaultBusy, type VaultDone, type VaultMode } from "../containers/vault-form";
import { VaultPosition } from "../containers/vault-position";

/**
 * Where the page stands before a position is shown: no account (`guest`, with Connect), the reads on their way
 * (`loading`), or one that failed (`error`, with Retry). Left out, the position (or "not deployed") is shown.
 */
export type VaultStatus = { kind: "guest" } | { kind: "loading" } | { kind: "error"; message: string; detail?: ErrorDetail };

/** The page's first line, under its header (#781). */
const INTRO = "Deposit PAVED for vPAVED.";

export interface VaultSceneProps {
  /** The economy's addresses are configured (`EconomyDeployment.configured`); false: nothing to read or send. */
  deployed: boolean;
  status?: VaultStatus | null;
  /** The viewer's position (`EconomyViews.vault`); null when not deployed. */
  position: Position | null;
  /** PAVED in the wallet (`pavedBalance`). */
  balance: bigint;
  /** `Economy.split_bps()`: the Vault's part of each purchase. */
  split: SplitView | null;
  mode: VaultMode;
  /** The amount typed, in PAVED. */
  amount: string;
  /** `preview_deposit` / `preview_withdraw` of the typed amount; null until read. */
  preview: bigint | null;
  busy?: VaultBusy | null;
  /** The last write's refusal (the writer's typed message). */
  refused?: string | null;
  refusedDetail?: ErrorDetail;
  /** The last write went through: its receipt's PAVED and vPAVED. */
  done?: VaultDone | null;
  /** `Vault.delegates(holder)`, read only: null when not delegated; left out, not shown. */
  delegate?: string | null;
  onConnect?: () => void;
  onRetry?: () => void;
  onModeChange?: (mode: VaultMode) => void;
  onAmountChange?: (amount: string) => void;
  onMax?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onWithdrawAll?: () => void;
  onPlay?: () => void;
  /** Back, up to the village (BACK-RULE #783); omitted, the bar's Home. */
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * The Vault (`/vault`, V1b's vPAVED, P-56): PAVED deposited for vPAVED, whose rate rises with the Vault's part of every
 * purchase and every exit fee; the position, its value, its share of the Vault and `max_withdraw`; deposit, withdraw and
 * withdraw all, each exit with its fee shown before it is sent. No stake, no claim, no dividend: the rate is the reward.
 */
export function VaultScene(props: VaultSceneProps) {
  const { deployed, position, balance, split, status } = props;

  if (status) {
    return (
      <TabPage tab="vault" title="Vault" onBack={props.onBack} onNavigate={props.onNavigate}>
        <p className="text-sm text-muted-foreground">{INTRO}</p>
        <div className="flex flex-col gap-4">
          {status.kind === "guest" ? (
            <Notice title="Connect to use the Vault" action={<Button size="sm" onClick={props.onConnect}>Connect</Button>}>
              Your vPAVED, its worth and your PAVED are read for your account.
            </Notice>
          ) : status.kind === "error" ? (
            <InlineError title="The Vault cannot be read" message={status.message} detail={status.detail} action={<Button size="sm" onClick={props.onRetry}>Retry</Button>} />
          ) : (
            <div role="status" aria-label="Reading the Vault" className="flex flex-col gap-3">
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          )}
        </div>
      </TabPage>
    );
  }

  if (!deployed || !position) {
    return (
      <TabPage tab="vault" title="Vault" onBack={props.onBack} onNavigate={props.onNavigate}>
        <p className="text-sm text-muted-foreground">{INTRO}</p>
        <Notice tone="warning" title="Economy not deployed">
          This network has no Vault yet: there is nothing to deposit or withdraw. Training and Story mode still play.
        </Notice>
      </TabPage>
    );
  }

  const none = position.shares === 0n;
  const nothing = none && balance === 0n;
  return (
    <TabPage tab="vault" title="Vault" onBack={props.onBack} onNavigate={props.onNavigate}>
      {/* The page's first line (ONE-HEADER, #781: no subtitle, nothing but the Vault's PAVED and vPAVED in the header, #855): what the Vault does, and the wallet's PAVED. */}
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">{INTRO}</p>
        <span className="flex shrink-0 flex-col items-end text-xs text-muted-foreground">
          Wallet
          <Amount value={balance} token="paved" className="text-sm text-foreground" />
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-4">
          <section aria-label="Your position" data-slot="card" className="rounded-xl border border-primary/30 bg-card px-4 pt-4 pb-2">
            {none ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <TokenIcon kind="vpaved" size="xl" />
                <p className="text-sm font-semibold">No vPAVED yet</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Deposit PAVED to hold vPAVED. Its rate rises with every purchase; there is nothing to claim, you withdraw at the rate.
                </p>
              </div>
            ) : (
              <VaultPosition position={position} delegate={props.delegate} />
            )}
          </section>

          {split && (
            <section aria-label="Where purchases go" data-slot="card" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <h2 className="font-display text-sm font-semibold">Where each purchase goes</h2>
              <SplitBar split={split} highlight="vault" />
              <p className="text-xs text-muted-foreground">
                The Vault's part is swapped for PAVED and added to the Vault, which raises the rate for every holder. With a referrer, the referral is paid out
                of it.
              </p>
            </section>
          )}
        </div>

        <section aria-label={props.mode === "deposit" ? "Deposit" : "Withdraw"} data-slot="card" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          {nothing ? (
            <Notice
              tone="info"
              title="No PAVED in your wallet"
              action={
                <Button size="sm" onClick={props.onPlay}>
                  Play
                </Button>
              }
            >
              PAVED is minted to Challenge games that beat their threshold. Earn some, then deposit it here.
            </Notice>
          ) : (
            <VaultForm
              mode={props.mode}
              amount={props.amount}
              balance={balance}
              shares={position.shares}
              value={position.value}
              maxWithdraw={position.maxWithdraw}
              exitFeeBps={position.exitFeeBps}
              preview={props.preview}
              busy={props.busy}
              refused={props.refused}
              refusedDetail={props.refusedDetail}
              done={props.done}
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
