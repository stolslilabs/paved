import type { QuoteView, SplitView } from "@paved/chain";
import { Button } from "../ui/button";
import { Amount, formatUnits, TOKENS } from "../elements/amount";
import { GAME_VALIDITY_S } from "../elements/countdown";
import { Deadline } from "../elements/deadline";
import { Icon } from "../ui/icon";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { formatPoints } from "../elements/score";
import { BalanceNotice, ConnectButton, DroppedReferrerNotice, RefusalNotice, retryLabel, shortText, type PurchaseRefusal } from "../containers/purchase-notices";
import { PriceBreakdown } from "../containers/price-breakdown";
import { RewardEstimateTable, type RewardEstimateProps } from "../containers/reward-estimate";
import { StakePicker } from "../containers/stake-picker";
import { TopBar } from "../containers/top-bar";

export interface PurchaseSceneProps {
  stake: number;
  maxStake: number;
  /** `Economy.quote(stake)`: the price, and the threshold the game must beat (points x 1,000). */
  quote: QuoteView;
  /**
   * The estimated reward by score at this stake (#705): built on the quote, the pool's quote of the swap and the guard's rate.
   * Omitted: the Terms card shows the threshold alone.
   */
  reward?: RewardEstimateProps;
  /** The burn's boost at this stake, bps. */
  boostBps: number;
  /** `Economy.split_bps()` (V1b). */
  split: SplitView;
  referrer: string | null;
  /** The link's `?ref=` is one the contracts would not pay: it is dropped, and the scene says so. */
  referrerDropped?: boolean;
  /** USDC base units (`balance_of`); null while unread or when the read failed: no "not enough" claim, and Pay waits. */
  balance: bigint | null;
  /** The balance's read failed: why (Retry reads it again). */
  balanceError?: string | null;
  balanceErrorDetail?: ErrorDetail;
  spawnPaused: boolean;
  /** The approve + spawn is on its way. */
  buying?: boolean;
  /** The stake's `min_out` is being quoted: Pay waits for it. */
  quoting?: boolean;
  /** Why the last game's purchase did not go through. */
  refusal?: PurchaseRefusal | null;
  /** After an unknown outcome, the receipt, the player's games and USDC are being read again: Pay waits. */
  checking?: boolean;
  /** That check failed: Pay stays held, and Retry checks again. */
  checkFailed?: boolean;
  /** Retry is fetching: Retry and Dismiss wait for its answer. */
  checkRetrying?: boolean;
  /** Dismiss is offered beside Retry; false while the purchase may still be answered in the wallet. Offered when omitted. */
  checkDismissable?: boolean;
  /**
   * The check answered but cannot tell (a receipt still unknown after its re-checks, or a wallet that never answered): Pay
   * stays held; Check again, or the player's confirm that their balance and games show no purchase.
   */
  checkUnresolved?: boolean;
  /** A wallet is connected; a guest's Pay is "Connect to buy". Connected when omitted (the stories). */
  connected?: boolean;
  now: number;
  /** The player's time zone for the deadline; their own when omitted (stories fix it). */
  timeZone?: string;
  onStakeChange?: (stake: number) => void;
  onConfirm?: () => void;
  onConnect?: () => void;
  onRetryBalance?: () => void;
  /** Check an unknown purchase again after a failed check. */
  onRetryCheck?: () => void;
  /** Forget an unknown purchase whose check keeps failing (the deliberate way out, with its warning). */
  onDismissCheck?: () => void;
  /** Check an unresolved purchase again (its receipt and the reads). */
  onCheckAgain?: () => void;
  /** The player read their balance and games and found no purchase: Pay is offered as Buy again. */
  onConfirmNone?: () => void;
  /** Open the game a send bought after a change of player (`ready`). */
  onOpenReady?: () => void;
  /** After an unknown outcome: where the player sees whether the game was bought. */
  onCheckGames?: () => void;
  onBack?: () => void;
}


/**
 * The Challenge purchase (`/play/challenge`): stake, price and boost, split, the 24 h validity, the threshold, confirm. The
 * Cobble packs have a page of their own (`/cobbles`, #621).
 */
export function PurchaseScene(props: PurchaseSceneProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar
        title="Challenge"
        onBack={props.onBack}
      />
      <GameForm {...props} />
    </div>
  );
}

function GameForm(props: PurchaseSceneProps) {
  const { stake, quote, balance, spawnPaused, buying, now, refusal, connected = true } = props;
  const short = connected && balance !== null && balance < quote.price;
  const blocked = spawnPaused || short || props.quoting || (connected && balance === null) || props.checking || props.checkFailed || props.checkUnresolved;
  const label = retryLabel(refusal);
  return (
    <main className="mx-auto grid w-full max-w-md grid-cols-1 gap-4 px-4 pb-8 tablet:max-w-2xl desktop:max-w-4xl desktop:grid-cols-[minmax(0,1fr)_22rem] desktop:items-start">
      <div className="flex flex-col gap-4">
        <section data-slot="card" aria-labelledby="stake-title" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <h2 id="stake-title" className="font-display text-sm font-semibold">Stake</h2>
            <span className="text-xs text-muted-foreground">{formatUnits(quote.price / BigInt(stake), TOKENS.usdc.decimals, 0)} USDC per stake</span>
          </div>
          <StakePicker value={stake} max={props.maxStake} price={<Amount value={quote.price} token="usdc" />} disabled={buying} onChange={props.onStakeChange} />
          <p className="text-xs text-muted-foreground">A higher stake costs more and boosts the burn; the reward scales with it.</p>
        </section>

        <section data-slot="card" aria-label="Price" className="rounded-xl border border-border bg-card p-4">
          <PriceBreakdown stake={stake} price={quote.price} boostBps={props.boostBps} split={props.split} referrer={props.referrer} />
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <section data-slot="card" aria-label="Terms" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-card p-4">
          <div className="flex items-center gap-3">
            <Icon name="trophy" className="text-primary" size="md" />
            <div className="flex flex-1 flex-col">
              <span className="text-xs text-muted-foreground">Score to beat</span>
              <span className="numeric text-2xl font-semibold text-primary">{formatPoints(quote.threshold / 1000)}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground">Mean now</span>
              <span className="numeric text-sm">{formatPoints(quote.mean / 1000)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Below the threshold the stake is lost; above it, PAVED is minted when the day closes.</p>
          {props.reward && <RewardEstimateTable {...props.reward} />}
          <div className="flex items-center gap-3 border-t border-border pt-3">
            <Icon name="clock" className="text-muted-foreground" size="md" />
            <div className="flex flex-col">
              <span className="text-sm">Valid 24 h</span>
              <span className="text-xs text-muted-foreground">
                Bought now, it <Deadline expiresAt={now + GAME_VALIDITY_S} now={now} timeZone={props.timeZone} />
              </span>
            </div>
          </div>
        </section>

        {spawnPaused && (
          <Notice tone="warning" title="Purchases paused">
            New Challenge games are paused for now. Try again later.
          </Notice>
        )}
        <InlineError title="Not enough USDC" message={!spawnPaused && short ? shortText("stake", quote.price, balance!) : null}>
          This stake costs <Amount value={quote.price} token="usdc" />; the wallet holds <Amount value={balance ?? 0n} token="usdc" />.
        </InlineError>
        {connected && props.balanceError && <BalanceNotice error={props.balanceError} detail={props.balanceErrorDetail} onRetry={props.onRetryBalance} />}
        {props.referrerDropped && <DroppedReferrerNotice />}
        {refusal && !buying && !(spawnPaused && refusal.kind === "paused") && (
          <RefusalNotice refusal={refusal} check={{ label: "Check my games", onCheck: props.onCheckGames, failed: props.checkFailed, retrying: props.checkRetrying, onRetry: props.onRetryCheck, onOpen: props.onOpenReady, onDismiss: props.onDismissCheck, dismissable: props.checkDismissable, unresolved: props.checkUnresolved, onCheckAgain: props.onCheckAgain, onConfirmNone: props.onConfirmNone }} />
        )}

        {!connected ? (
          <ConnectButton onConnect={props.onConnect} />
        ) : (
          <Button size="lg" className="h-14 text-base" onClick={props.onConfirm} disabled={blocked} loading={buying}>
            {buying ? (
              "Confirm in your wallet…"
            ) : props.checking ? (
              "Checking your games…"
            ) : props.checkFailed ? (
              "Could not check your games"
            ) : props.checkUnresolved ? (
              "Check your games first"
            ) : label ? (
              label
            ) : (
              <>
                Pay <Amount value={quote.price} token="usdc" className="[&>span:last-child]:text-primary-foreground/70" /> and play
              </>
            )}
          </Button>
        )}
      </div>
    </main>
  );
}

