import type { ReactNode } from "react";
import type { QuoteView, SplitView } from "@paved/chain";
import { capScore, rewardOf, winningScore } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { amountFigure, Amount, formatUnits, TOKENS } from "../elements/amount";
import { GAME_VALIDITY_S } from "../elements/countdown";
import { Deadline } from "../elements/deadline";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { formatPoints } from "../elements/score";
import { SectionTitle } from "../elements/section-title";
import { GOLD_ACTION, GoldShine } from "../elements/gold-action";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { UsdcLogo } from "../elements/usdc-logo";
import { BalanceNotice, ConnectButton, DroppedReferrerNotice, RefusalNotice, retryLabel, shortText, type PurchaseRefusal } from "../containers/purchase-notices";
import { DrawerFooter } from "../containers/hud-drawer";
import { PriceFlow } from "../containers/price-flow";
import { RewardEstimate } from "../containers/reward-estimate";
import { StakePicker } from "../containers/stake-picker";

export interface PurchaseSceneProps {
  stake: number;
  maxStake: number;
  /** `Economy.quote(stake)`: the price, and the threshold the game must beat (points x 1,000). */
  quote: QuoteView;
  /**
   * The stake `quote` is for: the previous stake's while the new one's is read. A stake's price is one constant (`CHALLENGE_PRICE`)
   * times the stake, so the picker writes the new stake's at once from it. `stake` when omitted.
   */
  quotedStake?: number;
  /**
   * `R`, PAVED base units: the reference reward a purchase of this stake would store now, estimated from the pool's quote and
   * the guard's rate (#705); null while they are read. The reward by score is `R` on the quote's curve.
   */
  reference: bigint | null;
  /** Why `reference` cannot be estimated (the guard's rate or the pool's quote failed); Retry reads them again. */
  referenceError?: string | null;
  referenceErrorDetail?: ErrorDetail;
  onRetryReference?: () => void;
  /**
   * The price's worth in PAVED at the guard's rate (`useStakeQuote`'s `priceInPaved`): what a reward must reach to win the price back,
   * the break-even score's. Null or omitted while it is read: that figure waits.
   */
  priceInPaved?: bigint | null;
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
}

/** One PAVED, base units. */
const PAVED = 10n ** BigInt(TOKENS.paved.decimals);

/**
 * A PAVED estimate as the page writes it: cut to what it can tell, two decimals under 1 PAVED, one under 10, none from 10, compact from
 * 10,000 (`amountFigure`).
 */
function approx(value: bigint): string {
  if (value >= 10_000n * PAVED) return amountFigure(value, "paved", true);
  return formatUnits(value, TOKENS.paved.decimals, value < PAVED ? 2 : value < 10n * PAVED ? 1 : 0);
}

/**
 * The least score whose reward wins the price back (`curve::payout` at least `priceInPaved`): the threshold's when its reward already
 * does, none ("never") when even the cap does not; null while `R` or the price's worth is read. The curve rises with the score, so a
 * search between the threshold's score and the cap's finds it.
 */
export function breakEvenScore(quote: QuoteView, reference: bigint | null, priceInPaved: bigint | null | undefined): number | "never" | null {
  if (reference === null || priceInPaved == null) return null;
  const pays = (score: number) => rewardOf(reference, score, quote.threshold, quote.slope, quote.cap);
  let low = winningScore(quote.threshold);
  let high = capScore(quote.threshold, quote.slope, quote.cap);
  if (pays(high) < priceInPaved) return "never";
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (pays(mid) >= priceInPaved) high = mid;
    else low = mid + 1;
  }
  return low;
}

/** A tile's figures, a step smaller under 360 px, where two tiles share a phone's width. */
const FIGURE = "numeric text-outline text-base leading-tight font-bold mobile:text-xl";

/**
 * A target's tile (the owner's ask: both alike, no sentence): its painted icon and its name, then the score to make (the star) and the
 * PAVED it wins (the coin), one line each; carved, as information is.
 */
function Target({ art, label, score, gain }: { art: ReactNode; label: string; score: ReactNode; gain: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="drawer-carved flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5 rounded-xl px-2 py-3">
      {art}
      <span className="text-outline text-base font-bold">{label}</span>
      <span className="flex flex-col items-start gap-1">
        <span className="flex items-center gap-1.5" aria-label="Score">
          <UiIcon name="star" px={24} className="drawer-icon size-6" />
          <span className={FIGURE}>{score}</span>
        </span>
        <span className="flex items-center gap-1.5" aria-label="Gain">
          <TokenIcon kind="paved" size="md" />
          <span className={FIGURE}>{gain}</span>
        </span>
      </span>
    </div>
  );
}

/**
 * The Challenge's stake (`/play/challenge`, PLAY-PAGE; the owner's asks of 2026-11-06, beyond the Paved UX Book's "challenge" sheet: a
 * page that tells what a stake can win): the body Play's drawer frames, a panel of its own in the modes' place, the USDC balance at its
 * header's end. The stake in USDC, a pile of its coins between the League's arrows (`StakePicker`); right under it two tiles alike, break even and max gain, each
 * the score to make and the PAVED it wins, and one PAVED's price in USD (the guard's rate) for the conversion; then the reward by score
 * from the threshold to the cap, and under its box what it means, a short line each (#705); then the split of the USDC, a bar and a tile per recipient (`PriceFlow`); the
 * 24 h validity and its deadline; and the bill in the drawer's footer (`DrawerFooter`, the header's band at its foot), the total on the
 * left, Confirm on the right as the chests' Take.
 * A guest's button connects.
 * The refusals, the paused state and an unknown outcome's check keep their notices above Pay.
 */
export function PurchaseScene(props: PurchaseSceneProps) {
  const { stake, quote, balance, spawnPaused, buying, now, refusal, connected = true, reference, referenceError } = props;
  const short = connected && balance !== null && balance < quote.price;
  const blocked = spawnPaused || short || props.quoting || (connected && balance === null) || props.checking || props.checkFailed || props.checkUnresolved;
  const label = retryLabel(refusal);
  const price = formatUnits(quote.price, TOKENS.usdc.decimals, quote.price % 1_000_000n === 0n ? 0 : TOKENS.usdc.fraction);
  const paying = !buying && !props.checking && !props.checkFailed && !props.checkUnresolved && !label;
  const even = breakEvenScore(quote, reference, props.priceInPaved);
  // What the break-even score wins: about the price's worth in PAVED (the reward there, at least it).
  const evenGain = typeof even === "number" && reference !== null ? rewardOf(reference, even, quote.threshold, quote.slope, quote.cap) : null;
  // One PAVED's price in USD, the conversion the page's PAVED figures need: the price over its worth, at the guard's rate.
  const pavedUsd = props.priceInPaved ? formatUnits((quote.price * PAVED) / props.priceInPaved, TOKENS.usdc.decimals, 4) : null;
  const top = capScore(quote.threshold, quote.slope, quote.cap);
  const most = reference === null ? null : rewardOf(reference, top, quote.threshold, quote.slope, quote.cap);
  const waiting = referenceError ? "—" : "…";
  // Confirm's word, or the state that holds it (a state's longer words a step smaller, so the pill keeps to a 320 px phone).
  const word = buying
    ? "Confirm in your wallet…"
    : props.checking
      ? "Checking your games…"
      : props.checkFailed
        ? "Could not check your games"
        : props.checkUnresolved
          ? "Check your games first"
          : (label ?? "Confirm");
  return (
    <div data-slot="challenge-stake" className="flex flex-col gap-4">
      <section aria-labelledby="stake-stake" className="flex flex-col gap-2">
        <SectionTitle id="stake-stake">
          <UiIcon name="stake" px={28} className="drawer-icon size-7 self-center" />
          Stake
        </SectionTitle>
        <StakePicker value={stake} max={props.maxStake} unit={quote.price / BigInt(props.quotedStake ?? stake)} disabled={buying} onChange={props.onStakeChange} />
      </section>

      <div className="flex gap-3">
        <Target
          art={<UiIcon name="break-even" px={44} className="drawer-icon size-11" />}
          label="Break even"
          score={even === null ? waiting : even === "never" ? "—" : formatPoints(even)}
          gain={evenGain === null ? (even === "never" ? "—" : waiting) : approx(evenGain)}
        />
        <Target art={<UiIcon name="max-gain" px={44} className="drawer-icon size-11" />} label="Max gain" score={formatPoints(top)} gain={most === null ? waiting : approx(most)} />
      </div>
      {pavedUsd !== null && (
        <p className="drawer-carved flex items-center justify-center gap-2 self-center rounded-full px-4 py-1.5 text-sm font-semibold">
          <TokenIcon kind="paved" size="sm" />
          <span>
            1 PAVED ≈ <span className="numeric font-bold">${pavedUsd}</span>
          </span>
        </p>
      )}
      <InlineError
        title="The reward cannot be estimated"
        message={reference === null ? referenceError : null}
        detail={props.referenceErrorDetail}
        action={props.onRetryReference && <Button variant="outline" onClick={props.onRetryReference}>Retry</Button>}
      />

      <section aria-labelledby="stake-reward" className="flex flex-col gap-2">
        <SectionTitle id="stake-reward">
          {/* The scores' star and PAVED's coin together: what a score earns. */}
          <span aria-hidden className="relative block size-7 shrink-0 self-center">
            <UiIcon name="star" px={24} className="drawer-icon absolute top-0 left-0 size-6" />
            <TokenIcon kind="paved" size="xs" className="absolute right-0 bottom-0" />
          </span>
          Rewards
        </SectionTitle>
        <div className="drawer-carved rounded-2xl p-4">
          <RewardEstimate reference={reference} unavailable={!!referenceError} threshold={quote.threshold} slopeBps={quote.slope} cap={quote.cap} />
        </div>
        {/* What the table means, a line each (the owner's ask: out of the box, easier to read). */}
        <ul aria-label="How the reward works" className="flex flex-col gap-1.5 px-1 text-sm leading-snug">
          <li className="flex gap-2">
            <UiIcon name="cross" px={20} className="drawer-icon mt-px size-5 shrink-0" />
            <span>
              Under <span className="numeric">{formatPoints(winningScore(quote.threshold))}</span> points, the stake is lost.
            </span>
          </li>
          <li className="flex gap-2 text-muted-foreground">
            <UiIcon name="info" px={20} className="drawer-icon mt-px size-5 shrink-0" />
            <span>
              Estimates: your purchase sets the PAVED per point, and the day's scores set the winning score when it closes (today's average:{" "}
              <span className="numeric">{formatPoints(quote.mean / 1000)}</span>).
            </span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="stake-flow" className="flex flex-col gap-2">
        <SectionTitle id="stake-flow">
          <UiIcon name="money-flow" px={28} className="drawer-icon size-7 self-center" />
          Split
        </SectionTitle>
        <PriceFlow price={quote.price} split={props.split} referrer={props.referrer} boostBps={props.boostBps} />
      </section>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon name="clock" size="sm" />
        <span>
          Valid 24 h: bought now, it <Deadline expiresAt={now + GAME_VALIDITY_S} now={now} timeZone={props.timeZone} />
        </span>
      </p>

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

      <DrawerFooter>
        {/* The bill (the owner's asks): the total on the left, at the body's edge, Confirm on the right, the header's height. */}
        <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Total</span>
            <span className="flex items-center gap-1.5">
              <UsdcLogo className="size-6" />
              <span className="numeric text-outline text-2xl leading-tight font-bold">{price}</span>
              <span className="text-outline text-base font-bold">USDC</span>
            </span>
          </span>
          {!connected ? (
            <span className="ml-auto">
              <ConnectButton onConnect={props.onConnect} />
            </span>
          ) : (
            <Button
              variant="ghost"
              // Confirm as the chests' Take (the owner's ask of 2026-11-06): the drawers' gold action, its light passing.
              style={GOLD_ACTION}
              className={cn("relative ml-auto h-12 min-w-36 shrink-0 px-1 font-black text-foreground", word === "Confirm" ? "text-lg mobile:text-xl" : "text-sm mobile:text-base")}
              onClick={props.onConfirm}
              disabled={blocked}
              loading={buying}
              aria-label={paying ? `Confirm, pay ${price} USDC and play` : undefined}
            >
              {!blocked && !buying && <GoldShine />}
              {word}
            </Button>
          )}
        </div>
      </DrawerFooter>
    </div>
  );
}
