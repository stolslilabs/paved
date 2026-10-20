import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { formatUnits, TOKENS } from "../elements/amount";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";

// The notices and the buttons the two purchases share: a game on `/play/challenge`, a Cobble pack on `/cobbles` (#621).

/**
 * Why the last purchase did not go through, as the page reads it from the writer's typed error: `moved`, the price changed
 * since the confirm; `quote-moved`, the pool's quote moved (the swap's `min_out`; the price did not); `low-quote`, a quote far
 * below the guard rate (Buy anyway sends it); `paused`, new games paused; `unknown`, sent but the receipt could not tell (Pay
 * is held while it is checked, then offers Buy again only); `landed`, the receipt of an unknown purchase read since: it went
 * through; `ready`, a send that landed after a change of player: its game waits to be opened; `busy`, another write of the account is on its way; `refused`, anything else.
 */
export interface PurchaseRefusal {
  kind: "moved" | "quote-moved" | "low-quote" | "paused" | "unknown" | "landed" | "ready" | "busy" | "refused";
  message: string;
  /** The typed error's detail for support (`InlineError`): its name, its hash, the version, the time. */
  detail?: ErrorDetail;
}

/**
 * The refusals that are errors (P-67), shown by `InlineError`: the write was refused, or the price or the pool's quote
 * moved under it. The others are states with a way on (paused, a low quote to accept, an outcome to check, a game
 * ready, another write busy) and stay a `Notice`.
 */
const ERROR_KINDS: ReadonlySet<PurchaseRefusal["kind"]> = new Set(["refused", "moved", "quote-moved"]);

const REFUSAL_TITLE: Record<PurchaseRefusal["kind"], string> = {
  moved: "The price moved",
  "quote-moved": "The pool's quote moved",
  "low-quote": "Low pool quote",
  paused: "Purchases paused",
  unknown: "Outcome unknown",
  landed: "Purchase went through",
  ready: "Your game is ready",
  busy: "Another transaction",
  refused: "Purchase refused",
};

/** How an unknown purchase is checked: where the player looks, and whether the check's reads failed (Retry). */
export interface Check {
  label: string;
  onCheck?: () => void;
  failed?: boolean;
  /** Retry is fetching: Retry and Dismiss wait for its answer. */
  retrying?: boolean;
  onRetry?: () => void;
  /** The game a landed send opened (`ready`). */
  onOpen?: () => void;
  /** Forget the unknown purchase after a failed check: Pay is offered again, with the warning. */
  onDismiss?: () => void;
  /**
   * Dismiss is offered with Retry; false while the purchase may still be answered in the wallet (under its 5 minutes): the
   * record is not forgotten then, Retry only. Offered when omitted.
   */
  dismissable?: boolean;
  /** The check cannot tell: Check again, or confirm that nothing landed. */
  unresolved?: boolean;
  onCheckAgain?: () => void;
  onConfirmNone?: () => void;
}

/** The message with its transaction hash (`0x…`) selectable: the one copy target of a notice that is not an error (APP-FEEL, P-69). */
function WithHash({ message }: { message: string }) {
  return (
    <>
      {message.split(/(0x[0-9a-fA-F]+)/).map((part, i) =>
        i % 2 ? (
          <span key={i} className="select-text">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function RefusalNotice({ refusal, check }: { refusal: PurchaseRefusal; check?: Check }) {
  if (ERROR_KINDS.has(refusal.kind)) return <InlineError title={REFUSAL_TITLE[refusal.kind]} message={refusal.message} detail={refusal.detail} />;
  const tone = refusal.kind === "busy" || refusal.kind === "landed" || refusal.kind === "ready" ? "info" : "warning";
  const checkable = (refusal.kind === "unknown" || refusal.kind === "landed") && check;
  const ready = refusal.kind === "ready" && check?.onOpen;
  return (
    <Notice
      tone={tone}
      title={REFUSAL_TITLE[refusal.kind]}
      action={
        ready ? (
          <Button size="sm" onClick={check.onOpen}>
            Open game
          </Button>
        ) : checkable ? (
          <span className="flex flex-col gap-1.5">
            {refusal.kind === "unknown" && check.failed && (
              <>
                <Button size="sm" onClick={check.onRetry} disabled={check.retrying}>
                  Retry
                </Button>
                {check.dismissable !== false && (
                  <Button size="sm" variant="ghost" onClick={check.onDismiss} disabled={check.retrying}>
                    Dismiss
                  </Button>
                )}
              </>
            )}
            {refusal.kind === "unknown" && check.unresolved && (
              <>
                <Button size="sm" onClick={check.onCheckAgain}>
                  Check again
                </Button>
                <Button size="sm" variant="ghost" onClick={check.onConfirmNone}>
                  It did not land
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={check.onCheck}>
              {check.label}
            </Button>
          </span>
        ) : undefined
      }
    >
      <WithHash message={refusal.message} />
      {refusal.kind === "unknown" &&
        check?.failed &&
        (check.dismissable === false
          ? " It could not be checked: Retry. Dismiss is offered once your wallet's 5 minutes have passed."
          : " It could not be checked: Retry. Dismiss only if you are sure it did not go through: buying again may pay twice.")}
    </Notice>
  );
}

/** "Not enough USDC" as plain text, for the copy and the tooltip (the shown line draws the amounts with `Amount`). */
export function shortText(what: "stake" | "pack", price: bigint, balance: bigint): string {
  return `This ${what} costs ${formatUnits(price, TOKENS.usdc.decimals, TOKENS.usdc.fraction)} USDC; the wallet holds ${formatUnits(balance, TOKENS.usdc.decimals, TOKENS.usdc.fraction)}.`;
}

/** The wallet's USDC could not be read: no "not enough" claim, Pay waits, and Retry reads it again. */
export function BalanceNotice({ error, detail, onRetry }: { error: string; detail?: ErrorDetail; onRetry?: () => void }) {
  return (
    <InlineError
      title="Your USDC balance cannot be read"
      message={error}
      detail={detail}
      action={
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}

/** The `?ref=` address is one the contracts would not pay: the purchase goes on without a referrer. */
export function DroppedReferrerNotice() {
  return <Notice title="Referral link not used">This referral link cannot be used; buying without a referrer.</Notice>;
}

/** Pay's label after a refusal: Buy anyway for a low quote, Buy again after an unknown outcome; null for the default. */
export const retryLabel = (refusal: PurchaseRefusal | null | undefined): string | null =>
  refusal?.kind === "low-quote" ? "Buy anyway" : refusal?.kind === "unknown" ? "Buy again" : null;

/** A guest's Pay: connect first, whatever the balance. */
export function ConnectButton({ onConnect }: { onConnect?: () => void }) {
  return (
    <Button size="lg" className="h-14 text-base" onClick={onConnect}>
      <Icon name="wallet" size="sm" />
      Connect to buy
    </Button>
  );
}
