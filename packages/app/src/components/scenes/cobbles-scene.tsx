import type { SplitView } from "@paved/chain";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Amount } from "../elements/amount";
import { type ErrorDetail, InlineError } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { Cobbles, formatCobbles } from "../elements/cobbles";
import { CobblePacks, formatUsd, packsOnSale } from "../containers/cobble-packs";
import { formatBps } from "../containers/split-bar";
import type { Pack } from "../containers/cobble-types";
import { BalanceNotice, ConnectButton, DroppedReferrerNotice, RefusalNotice, retryLabel, shortText, type PurchaseRefusal } from "../containers/purchase-notices";
import { TopBar } from "../containers/top-bar";

/** The Cobble packs (P-61, cobbles v1, part 2: `Setup.pack`, `buy_pack`). */
export interface CobbleShop {
  /** `Setup.account(player).cobbles`. */
  balance: number;
  /** The packs on sale (`Setup.pack` of ids 1 to 8); the scene keeps only those with Cobbles and a price. */
  packs: readonly Pack[];
  selected: number | null;
  /** The approve + `buy_pack` is on its way. */
  buying?: boolean;
  /** The pack's `min_out` is being quoted: Pay waits for it. */
  quoting?: boolean;
  /** Why the last pack's purchase did not go through. */
  refusal?: PurchaseRefusal | null;
  /** After an unknown outcome, the receipt, the Cobbles and the USDC are being read again: Pay waits. */
  checking?: boolean;
  /** That check failed: Pay stays held, and Retry checks again. */
  checkFailed?: boolean;
  /** Retry is fetching: Retry and Dismiss wait for its answer. */
  checkRetrying?: boolean;
  /** Dismiss is offered beside Retry; false while the purchase may still be answered in the wallet. Offered when omitted. */
  checkDismissable?: boolean;
  /** The check answered but cannot tell (a receipt still unknown, or a wallet that never answered): Pay stays held. */
  checkUnresolved?: boolean;
  /** The packs are being read (`Setup.pack`). */
  loading?: boolean;
  /** The packs could not be read: why (Retry reads them again). */
  error?: string | null;
  errorDetail?: ErrorDetail;
  /** The last pack bought (its receipt's `PackBought`): its Cobbles. */
  bought?: { cobbles: number } | null;
}

export interface CobblesSceneProps {
  /** USDC base units (`balance_of`); null while unread or when the read failed: no "not enough" claim, and Pay waits. */
  balance: bigint | null;
  /** The balance's read failed: why (Retry reads it again). */
  balanceError?: string | null;
  balanceErrorDetail?: ErrorDetail;
  /** `Economy.split_bps()`: a pack's USDC takes a game's split. */
  split: SplitView;
  referrer: string | null;
  /** The link's `?ref=` is one the contracts would not pay: it is dropped, and the scene says so. */
  referrerDropped?: boolean;
  /** A wallet is connected; a guest's Pay is "Connect to buy" and their Cobbles a dash. Connected when omitted (the stories). */
  connected?: boolean;
  cobbles: CobbleShop;
  onSelectPack?: (packId: number) => void;
  onBuyPack?: () => void;
  onConnect?: () => void;
  onRetryBalance?: () => void;
  onRetryPacks?: () => void;
  /** Check an unknown purchase again after a failed check. */
  onRetryCheck?: () => void;
  /** Forget an unknown purchase whose check keeps failing (the deliberate way out, with its warning). */
  onDismissCheck?: () => void;
  /** Check an unresolved purchase again (its receipt and the reads). */
  onCheckAgain?: () => void;
  /** The player read their balance and Cobbles and found no purchase: Pay is offered as Buy again. */
  onConfirmNone?: () => void;
  /** After an unknown outcome: read the Cobbles again. */
  onCheckCobbles?: () => void;
  onBack?: () => void;
}

/** The Cobble balance as a game's currency plate: the stones as a coin, the count large. A guest's count is a dash. */
function BalancePlate({ cobbles, connected }: { cobbles: number; connected: boolean }) {
  return (
    <section aria-labelledby="cobble-balance-title" className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card p-4 desktop:col-span-2">
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-background">
        <Icon name="cubes-stacked" size="lg" className="text-primary" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <h2 id="cobble-balance-title" className="text-xs text-muted-foreground">
          Your Cobbles
        </h2>
        {connected ? (
          <span role="img" aria-label={`${formatCobbles(cobbles)} ${cobbles === 1 ? "Cobble" : "Cobbles"}`} className="numeric text-3xl leading-tight font-semibold wrap-anywhere">
            <span aria-hidden>{formatCobbles(cobbles)}</span>
          </span>
        ) : (
          <span className="numeric text-3xl leading-tight font-semibold text-muted-foreground">–</span>
        )}
      </span>
      <p className="hidden max-w-xs text-right text-xs text-muted-foreground tablet:inline">They buy tile skins, and stay on your account.</p>
    </section>
  );
}

/**
 * The Cobble packs (`/cobbles`, #621), a page of their own: the balance, the packs, then pay a pack's USDC (approve +
 * `buy_pack`), confirmed and pending as a game's purchase is; its USDC takes a game's split.
 */
export function CobblesScene(props: CobblesSceneProps) {
  const { cobbles, balance, referrer, split, connected = true, onSelectPack, onBuyPack, onConnect } = props;
  // The selected pack among those shown: a pack without Cobbles or a price is never offered, so nothing divides by zero.
  const onSale = packsOnSale(cobbles.packs);
  const pack = onSale.find((p) => p.packId === cobbles.selected) ?? null;
  const short = connected && pack != null && balance !== null && balance < pack.price;
  const { refusal, bought } = cobbles;
  const label = retryLabel(refusal);
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar
        title="Cobbles"
        onBack={props.onBack}
        end={<span className="pr-2 text-xs text-muted-foreground">{balance === null ? <span className="numeric">— USDC</span> : <Amount value={balance} token="usdc" />}</span>}
      />
      <main className="mx-auto grid w-full max-w-md grid-cols-1 gap-4 px-4 pb-8 tablet:max-w-2xl desktop:max-w-4xl desktop:grid-cols-[minmax(0,1fr)_22rem] desktop:items-start">
        <BalancePlate cobbles={cobbles.balance} connected={connected} />
        <section aria-labelledby="packs-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="packs-title" className="font-display text-sm font-semibold">Cobble packs</h2>
            <p className="text-xs text-muted-foreground">Cobbles buy tile skins. They stay on your account: they cannot be sent or sold.</p>
          </div>
          {cobbles.error ? (
            <InlineError
              title="The packs cannot be read"
              message={cobbles.error}
              detail={cobbles.errorDetail}
              action={
                <Button size="sm" variant="outline" onClick={props.onRetryPacks}>
                  Retry
                </Button>
              }
            />
          ) : cobbles.loading ? (
            <Notice title="Reading the packs…">The packs on sale and their prices.</Notice>
          ) : onSale.length === 0 ? (
            <Notice title="No packs on sale">No pack of Cobbles is on sale right now. Come back later.</Notice>
          ) : (
            <CobblePacks packs={cobbles.packs} selected={cobbles.selected} disabled={cobbles.buying || cobbles.checking} onSelect={onSelectPack} />
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section data-slot="card" aria-label="Pack price" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <p>Paid in USDC like a game: swapped to PAVED, 70% burned, 25% to the Vault, 5% to the pool.</p>
            {referrer && <p className="wrap-anywhere">Your referrer gets {formatBps(split.referral)} of the price, out of the Vault's part.</p>}
          </section>
          <InlineError title="Not enough USDC" message={short && pack ? shortText("pack", pack.price, balance!) : null}>
            {pack && (
              <>
                This pack costs <Amount value={pack.price} token="usdc" />; the wallet holds <Amount value={balance ?? 0n} token="usdc" />.
              </>
            )}
          </InlineError>
          {connected && props.balanceError && <BalanceNotice error={props.balanceError} detail={props.balanceErrorDetail} onRetry={props.onRetryBalance} />}
          {props.referrerDropped && <DroppedReferrerNotice />}
          {refusal && !cobbles.buying && (
            <RefusalNotice
              refusal={refusal}
              check={{ label: "Check my Cobbles", onCheck: props.onCheckCobbles, failed: cobbles.checkFailed, retrying: cobbles.checkRetrying, onRetry: props.onRetryCheck, onDismiss: props.onDismissCheck, dismissable: cobbles.checkDismissable, unresolved: cobbles.checkUnresolved, onCheckAgain: props.onCheckAgain, onConfirmNone: props.onConfirmNone }}
            />
          )}
          {bought && !refusal && !cobbles.buying && (
            <Notice tone="info" title="Pack bought">
              <Cobbles value={bought.cobbles} size="sm" /> added: your balance is <Cobbles value={cobbles.balance} size="sm" />.
            </Notice>
          )}
          {!connected ? (
            <ConnectButton onConnect={onConnect} />
          ) : (
            <Button
              size="lg"
              className="h-14 text-base"
              onClick={onBuyPack}
              disabled={!pack || short || cobbles.quoting || balance === null || cobbles.checking || cobbles.checkFailed || cobbles.checkUnresolved}
              loading={cobbles.buying}
            >
              {cobbles.buying ? (
                "Confirm in your wallet…"
              ) : !pack ? (
                "Pick a pack"
              ) : cobbles.checking ? (
                "Checking your Cobbles…"
              ) : cobbles.checkFailed ? (
                "Could not check your Cobbles"
              ) : cobbles.checkUnresolved ? (
                "Check your Cobbles first"
              ) : label ? (
                label
              ) : (
                <>
                  Pay <span className="numeric">{formatUsd(pack.price)}</span> for <Cobbles value={pack.cobbles} className="text-primary-foreground" iconClassName="text-primary-foreground" />
                </>
              )}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
