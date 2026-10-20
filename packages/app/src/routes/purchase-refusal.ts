import { POOL_CANNOT_FILL, POOL_QUOTE_UNAVAILABLE } from "@paved/chain";
import type { PurchaseRefusal } from "../components/containers/purchase-notices";
import { purchaseRefusal, type usePurchase } from "../data/purchase";
import { errorDetail } from "./error-detail";

// What the two purchase pages (`/play/challenge`, `/cobbles`, #621) show of a purchase's outcome, from its hold and its error.

/**
 * What the scene shows of a purchase whose outcome was unknown (`usePurchaseHold`): while recorded, the unknown outcome (Pay
 * held, then Buy again only); once its receipt read, that it went through or reverted; null otherwise.
 */
export function heldRefusal(hold: ReturnType<typeof usePurchase>["hold"], what: "games" | "Cobbles", now: number, lost = false): PurchaseRefusal | null {
  if (hold.unknown) {
    const when = sentAgo(now - hold.unknown.at);
    // Storage full or refused: the record is this tab's alone, so another tab would offer Pay (decided: said, not handled).
    const unsaved = hold.unsaved ? " This browser could not save the record: only this tab holds Pay, so do not buy from another tab." : "";
    // Under the wallet's limit a hash-less record is a prompt that may still be open (another tab, a reload).
    // A send whose wallet failed after it may have sent it (`SendUnconfirmedError`): no prompt is open, but it may land.
    if (hold.waiting && lost) {
      return { kind: "unknown", message: `Your wallet lost track of a purchase while sending it (sent ${when}): it may still go through. Wait a few minutes before buying again.${unsaved}` };
    }
    if (hold.waiting) {
      return { kind: "unknown", message: `A purchase is waiting in your wallet (sent ${when}): it may still go through. Answer it there, or wait, before buying again.${unsaved}` };
    }
    const sent =
      hold.unknown.hash === null
        ? `Purchase sent ${when}: your wallet did not answer, so it may still go through.`
        : `Purchase sent ${when} (${hold.unknown.hash}), outcome unknown${hold.unresolved ? ": the network does not know it yet" : ""}.`;
    // What the player reads before confirming: the check has just read them again (`usePurchaseHold`).
    const reads = what === "games" ? "your USDC balance and your games" : "your USDC balance and your Cobbles";
    const next = hold.released
      ? " You confirmed that it did not land: Buy again sends a new purchase."
      : hold.unresolved
        ? ` Check ${reads}: confirm only if they show no purchase, as buying again may pay twice.`
        : ` Check ${reads} before buying again.`;
    return { kind: "unknown", message: `${sent}${next}${unsaved}` };
  }
  if (hold.resolved === "succeeded") return { kind: "landed", message: `Your earlier purchase went through: check your ${what} before buying again.` };
  if (hold.resolved === "reverted") return { kind: "refused", message: "Your earlier purchase did not go through: your USDC was not spent." };
  return null;
}

/** The refusal with its write's typed error for support (`InlineError` copies the name and the hash), when there is one. */
export function withDetail(refusal: PurchaseRefusal | null, error: Error | null): PurchaseRefusal | null {
  return refusal && error ? { ...refusal, detail: errorDetail(error) } : refusal;
}

/** A refusal of a send that sent nothing (busy, declined, a moved price), never the earlier send's own unknown outcome; else null. */
export function newRefusal(error: Error | null): PurchaseRefusal | null {
  const refusal = error ? purchaseRefusal(error) : null;
  return refusal && refusal.kind !== "unknown" ? refusal : null;
}

/** How long ago a purchase was sent, from its record's `at` (the send's time): "just now", "5 min ago", "3 h ago", "2 days ago". */
export function sentAgo(seconds: number): string {
  if (seconds < 60) return "just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} h ago`;
  const days = Math.floor(seconds / 86_400);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** The pool quote of a confirm could not be used: why, as a refusal the scene shows before any send. */
export function quoteProblem(quote: { minOut: bigint | null; isPending: boolean; error: Error | null }, asked: boolean): PurchaseRefusal | null {
  if (!asked || quote.isPending || quote.minOut !== null) return null;
  return { kind: "refused", message: quote.error ? POOL_QUOTE_UNAVAILABLE : POOL_CANNOT_FILL };
}
