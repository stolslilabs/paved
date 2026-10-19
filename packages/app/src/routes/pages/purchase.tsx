import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MAX_STAKE, POOL_CANNOT_FILL, POOL_QUOTE_UNAVAILABLE, SendUnconfirmedError, boostBps } from "@paved/chain";
import { PurchaseScene, type PurchaseRefusal, type PurchaseTab } from "../../components/scenes/purchase-scene";
import { TopBar } from "../../components/containers/top-bar";
import { InlineError, type ErrorDetail } from "../../components/elements/inline-error";
import { Notice } from "../../components/elements/notice";
import { Button } from "../../components/ui/button";
import { useSpawnPaused, useSplit, useUsdcBalance } from "../../data/chain";
import { useCobbleAccount } from "../../data/cobbles";
import { packKeys, purchaseRefusal, referrerParam, useBuyPack, useEffectiveReferrer, usePackQuote, usePacks, usePurchase, useStakeQuote } from "../../data/purchase";
import { cobbleKeys } from "../../data/cobbles";
import { queryKeys } from "../../data/keys";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { errorDetail } from "../error-detail";
import { useChainClock } from "../../data/clock";
import { useNow } from "../now";
import { useAppNavigate, useBack } from "../ref";

/**
 * What the scene shows of a purchase whose outcome was unknown (`usePurchaseHold`): while recorded, the unknown outcome (Pay
 * held, then Buy again only); once its receipt read, that it went through or reverted; null otherwise.
 */
function heldRefusal(hold: ReturnType<typeof usePurchase>["hold"], what: "games" | "Cobbles", now: number, lost = false): PurchaseRefusal | null {
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
function withDetail(refusal: PurchaseRefusal | null, error: Error | null): PurchaseRefusal | null {
  return refusal && error ? { ...refusal, detail: errorDetail(error) } : refusal;
}

/** A refusal of a send that sent nothing (busy, declined, a moved price), never the earlier send's own unknown outcome; else null. */
function newRefusal(error: Error | null): PurchaseRefusal | null {
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
function quoteProblem(quote: { minOut: bigint | null; isPending: boolean; error: Error | null }, asked: boolean): PurchaseRefusal | null {
  if (!asked || quote.isPending || quote.minOut !== null) return null;
  return { kind: "refused", message: quote.error ? POOL_QUOTE_UNAVAILABLE : POOL_CANNOT_FILL };
}

/**
 * `/play/challenge` (P7b): the Challenge purchase and the Cobble packs, on the chain's data (section 6.4). The Game tab reads
 * `entry_price` through `Economy.quote(stake)`, the split, the pool's `quote_swap` for `min_out`, the USDC balance and
 * `spawn_paused`; Pay sends the approve and `Challenge.spawn(stake, referrer, min_out)` in one multicall (`EconomyWriter.purchase`,
 * which reads them all again, with the router, the seller and the rate), which the wallet prompts for once (no approve is a
 * session policy, P-65), and opens the new game on its board. A declined prompt is a refusal: nothing was sent, no hold. The Cobbles tab (`?tab=cobbles`)
 * reads the packs from `Setup.pack` and buys one with the approve and `Setup.buy_pack` (`PackBuyer`); the receipt's
 * `PackBought` sets the balance, then the account is read again. The referrer is the link's `?ref=`, dropped (and said) when
 * the contracts would not pay it. A guest's Pay connects. An unknown outcome is recorded per player (it survives a remount,
 * a reload, a reconnect and a second tab), and so is a send the wallet never answered: Pay is held while its receipt and the
 * reconciling reads are checked (a receipt still unknown is read again after 5, 10 and 20 s), while that check fails (Retry),
 * and until the player confirms that their balance and games show no purchase; then only a deliberate Buy again sends. An
 * unread USDC balance is unknown, not 0: Pay waits for it.
 */
export default function Page() {
  const go = useAppNavigate();
  const onBack = useBack();
  const [params, setParams] = useSearchParams();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const connected = playerId !== null;
  const link = referrerParam(params.get("ref"), playerId);
  const gameReferrer = useEffectiveReferrer("game", link);
  const packReferrer = useEffectiveReferrer("pack", link);
  const tab: PurchaseTab = params.get("tab") === "cobbles" ? "cobbles" : "game";
  const now = useNow();
  // The expiry shown is read against the chain's time (the indexer's), not the browser's; `now` stays the browser's for the
  // records of sent purchases, which carry the browser's time.
  const chainNow = useChainClock();
  const client = useQueryClient();

  const [stake, setStake] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const paused = useSpawnPaused();
  const split = useSplit();
  const balance = useUsdcBalance(playerId);
  const stakeQuote = useStakeQuote(stake, gameReferrer.referrer !== null);
  const packs = usePacks();
  const account = useCobbleAccount(playerId);
  const pack = packs.data?.find((p) => p.packId === selected) ?? null;
  const packQuote = usePackQuote(pack, split.data ?? null, packReferrer.referrer !== null);
  const purchase = usePurchase(playerId);
  const buyPack = useBuyPack(playerId);

  const quote = stakeQuote.quote;
  const error = quote.error ?? split.error;
  if (error || quote.data === null || split.data === null) {
    const retry = () => void client.invalidateQueries({ queryKey: ["chain", "economy"] });
    return <PurchaseStatus error={error?.message ?? "Purchases are off: the economy is not deployed on this network."} detail={errorDetail(error)} onBack={onBack} onRetry={retry} />;
  }
  if (quote.data === undefined || split.data === undefined) return <PurchaseStatus error={null} onBack={onBack} />;

  const gameHold = purchase.hold;
  const packHold = buyPack.hold;
  // A Buy again that sent nothing (busy, declined) puts the released record back: its own refusal is what the player reads.
  const gameRefusal =
    (gameHold.released ? newRefusal(purchase.mutation.error) : null) ??
    heldRefusal(gameHold, "games", now, purchase.mutation.error instanceof SendUnconfirmedError) ??
    (purchase.ready.gameId !== null ? { kind: "ready" as const, message: "Your purchase landed: your game is waiting." } : null) ??
    (purchase.mutation.error ? purchaseRefusal(purchase.mutation.error) : quoteProblem(stakeQuote, connected));
  const packRefusal =
    (packHold.released ? newRefusal(buyPack.mutation.error) : null) ??
    heldRefusal(packHold, "Cobbles", now, buyPack.mutation.error instanceof SendUnconfirmedError) ?? (buyPack.mutation.error ? purchaseRefusal(buyPack.mutation.error) : quoteProblem(packQuote, connected && pack !== null));

  const confirm = () => {
    if (!purchase.buyer || !playerId) return void wallet.connect();
    if (stakeQuote.minOut === null || gameHold.held || purchase.sending || gameReferrer.isPending) return;
    // A deliberate Buy again: the earlier purchase is left to the player's check. Its record goes only once the new send is
    // accepted (`heldSend` writes the new send's hold over it, and puts it back if nothing was sent).
    gameHold.dismiss();
    purchase.ready.clear();
    purchase.mutation.mutate(
      {
        playerId,
        stake,
        confirmedPrice: quote.data!.price,
        confirmedMinOut: stakeQuote.minOut,
        referrer: gameReferrer.referrer,
        acceptedLowQuote: gameRefusal?.kind === "low-quote",
      },
      {
        onSuccess: ({ gameId }) => {
          purchase.ready.clear();
          go(`/game/${gameId}`);
        },
      },
    );
  };
  const buy = () => {
    if (!buyPack.buyer || !playerId) return void wallet.connect();
    if (!pack || packQuote.minOut === null || packHold.held || buyPack.sending || packReferrer.isPending) return;
    packHold.dismiss();
    buyPack.mutation.mutate({
      playerId,
      packId: pack.packId,
      confirmedPrice: pack.price,
      confirmedMinOut: packQuote.minOut,
      referrer: packReferrer.referrer,
      acceptedLowQuote: packRefusal?.kind === "low-quote",
    });
  };
  const shown = tab === "cobbles" ? packReferrer : gameReferrer;
  const onTab = (next: PurchaseTab) => {
    const search = new URLSearchParams(params);
    if (next === "cobbles") search.set("tab", "cobbles");
    else search.delete("tab");
    setParams(search, { replace: true });
  };

  return (
    <PurchaseScene
      stake={stake}
      maxStake={MAX_STAKE}
      quote={quote.data}
      boostBps={Number(boostBps(stake))}
      split={split.data}
      referrer={shown.referrer}
      referrerDropped={shown.dropped}
      balance={connected ? (balance.data ?? null) : null}
      balanceError={balance.error?.message ?? null}
      balanceErrorDetail={balance.error ? errorDetail(balance.error) : undefined}
      spawnPaused={paused.data ?? false}
      buying={purchase.mutation.isPending || purchase.sending}
      quoting={stakeQuote.isPending || gameReferrer.isPending}
      refusal={purchase.mutation.isPending || purchase.sending ? null : withDetail(gameRefusal, purchase.mutation.error)}
      checking={gameHold.checking}
      checkFailed={gameHold.failed}
      checkRetrying={gameHold.retrying}
      checkDismissable={gameHold.dismissable}
      checkUnresolved={gameHold.unresolved}
      connected={connected}
      now={chainNow}
      tab={tab}
      cobbles={
        packs.data === null
          ? null
          : {
              balance: account.data?.cobbles ?? 0,
              packs: packs.data ?? [],
              selected,
              loading: packs.isPending,
              error: packs.error?.message ?? null,
              errorDetail: packs.error ? errorDetail(packs.error) : undefined,
              buying: buyPack.mutation.isPending || buyPack.sending,
              quoting: packQuote.isPending || packReferrer.isPending,
              refusal: buyPack.mutation.isPending || buyPack.sending ? null : withDetail(packRefusal, buyPack.mutation.error),
              checking: packHold.checking,
              checkFailed: packHold.failed,
              checkRetrying: packHold.retrying,
              checkDismissable: packHold.dismissable,
              checkUnresolved: packHold.unresolved,
              bought: buyPack.mutation.data ? { cobbles: buyPack.mutation.data.bought.cobbles } : null,
            }
      }
      onTab={onTab}
      onStakeChange={(next) => {
        purchase.mutation.reset();
        setStake(next);
      }}
      onSelectPack={(id) => {
        buyPack.mutation.reset();
        setSelected(id);
      }}
      onConfirm={confirm}
      onBuyPack={buy}
      onConnect={() => void wallet.connect()}
      onRetryBalance={() => playerId && void client.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(playerId) })}
      onRetryPacks={() => void client.invalidateQueries({ queryKey: packKeys.packs() })}
      onRetryCheck={() => (tab === "cobbles" ? packHold : gameHold).retry()}
      onCheckAgain={() => (tab === "cobbles" ? packHold : gameHold).checkAgain()}
      onConfirmNone={() => (tab === "cobbles" ? packHold : gameHold).confirmNone()}
      onDismissCheck={() => {
        // The player's deliberate way out of a check that keeps failing: the record and the unknown error both go. Never
        // while the purchase may still be answered in the wallet (`dismissable`): its outcome would be dropped.
        if (tab === "cobbles") {
          if (packHold.dismissFailed()) buyPack.mutation.reset();
        } else if (gameHold.dismissFailed()) purchase.mutation.reset();
      }}
      onOpenReady={() => {
        const id = purchase.ready.gameId;
        purchase.ready.clear();
        if (id !== null) go(`/game/${id}`);
      }}
      onCheckGames={() => go("/")}
      onCheckCobbles={() => playerId && void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) })}
      onBack={onBack}
    />
  );
}

/**
 * The page before its scene: the price being read (`error` null), or why it cannot be read (the economy not deployed, a
 * failed read), with Retry. The top bar keeps Back, as on every full-screen flow.
 */
function PurchaseStatus({ error, detail, onBack, onRetry }: { error: string | null; detail?: ErrorDetail; onBack: () => void; onRetry?: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Challenge" onBack={onBack} />
      <main aria-busy={error === null} className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-2 tablet:max-w-2xl">
        {error === null ? (
          <Notice title="Reading the price…">The stake's price, its split and your balance.</Notice>
        ) : (
          <>
            <InlineError title="The price cannot be read" message={error} detail={detail} />
            <Button onClick={onRetry}>Retry</Button>
          </>
        )}
      </main>
    </div>
  );
}
