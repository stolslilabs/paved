import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MAX_STAKE, SendUnconfirmedError, boostBps } from "@paved/chain";
import { PurchaseScene } from "../../components/scenes/purchase-scene";
import { TopBar } from "../../components/containers/top-bar";
import { InlineError, type ErrorDetail } from "../../components/elements/inline-error";
import { Notice } from "../../components/elements/notice";
import { Button } from "../../components/ui/button";
import { useSpawnPaused, useSplit, useUsdcBalance } from "../../data/chain";
import { purchaseRefusal, referrerParam, useEffectiveReferrer, usePurchase, useStakeQuote } from "../../data/purchase";
import { queryKeys } from "../../data/keys";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { errorDetail } from "../error-detail";
import { heldRefusal, newRefusal, quoteProblem, withDetail } from "../purchase-refusal";
import { useChainClock } from "../../data/clock";
import { useNow } from "../now";
import { useAppNavigate, useBack } from "../ref";

/**
 * `/play/challenge` (P7b): the Challenge purchase, on the chain's data (section 6.4). It reads `entry_price` through
 * `Economy.quote(stake)`, the split, the pool's `quote_swap` for `min_out`, the USDC balance and `spawn_paused`; Pay sends the
 * approve and `Challenge.spawn(stake, referrer, min_out)` in one multicall (`EconomyWriter.purchase`, which reads them all
 * again, with the router, the seller and the rate), which the wallet prompts for once (no approve is a session policy, P-65),
 * and opens the new game on its board. A declined prompt is a refusal: nothing was sent, no hold. The Cobble packs are on
 * their own page (`/cobbles`, #621; the old `?tab=cobbles` redirects there). The referrer is the link's `?ref=`, dropped (and
 * said) when the contracts would not pay it. A guest's Pay connects. An unknown outcome is recorded per player (it survives a
 * remount, a reload, a reconnect and a second tab), and so is a send the wallet never answered: Pay is held while its receipt
 * and the reconciling reads are checked (a receipt still unknown is read again after 5, 10 and 20 s), while that check fails
 * (Retry), and until the player confirms that their balance and games show no purchase; then only a deliberate Buy again
 * sends. An unread USDC balance is unknown, not 0: Pay waits for it.
 */
export default function Page() {
  const go = useAppNavigate();
  const onBack = useBack();
  const [params] = useSearchParams();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const connected = playerId !== null;
  const gameReferrer = useEffectiveReferrer("game", referrerParam(params.get("ref"), playerId));
  const now = useNow();
  // The expiry shown is read against the chain's time (the indexer's), not the browser's; `now` stays the browser's for the
  // records of sent purchases, which carry the browser's time.
  const chainNow = useChainClock();
  const client = useQueryClient();

  const [stake, setStake] = useState(1);
  const paused = useSpawnPaused();
  const split = useSplit();
  const balance = useUsdcBalance(playerId);
  const stakeQuote = useStakeQuote(stake, gameReferrer.referrer !== null);
  const purchase = usePurchase(playerId);

  const quote = stakeQuote.quote;
  const error = quote.error ?? split.error;
  if (error || quote.data === null || split.data === null) {
    const retry = () => void client.invalidateQueries({ queryKey: ["chain", "economy"] });
    return <PurchaseStatus error={error?.message ?? "Purchases are off: the economy is not deployed on this network."} detail={errorDetail(error)} onBack={onBack} onRetry={retry} />;
  }
  if (quote.data === undefined || split.data === undefined) return <PurchaseStatus error={null} onBack={onBack} />;

  const gameHold = purchase.hold;
  // A Buy again that sent nothing (busy, declined) puts the released record back: its own refusal is what the player reads.
  const gameRefusal =
    (gameHold.released ? newRefusal(purchase.mutation.error) : null) ??
    heldRefusal(gameHold, "games", now, purchase.mutation.error instanceof SendUnconfirmedError) ??
    (purchase.ready.gameId !== null ? { kind: "ready" as const, message: "Your purchase landed: your game is waiting." } : null) ??
    (purchase.mutation.error ? purchaseRefusal(purchase.mutation.error) : quoteProblem(stakeQuote, connected));

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

  return (
    <PurchaseScene
      stake={stake}
      maxStake={MAX_STAKE}
      quote={quote.data}
      reference={stakeQuote.reference}
      referenceError={stakeQuote.referenceError?.message ?? null}
      referenceErrorDetail={stakeQuote.referenceError ? errorDetail(stakeQuote.referenceError) : undefined}
      onRetryReference={() => void client.invalidateQueries({ queryKey: ["chain", "economy"] })}
      boostBps={Number(boostBps(stake))}
      split={split.data}
      referrer={gameReferrer.referrer}
      referrerDropped={gameReferrer.dropped}
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
      onStakeChange={(next) => {
        purchase.mutation.reset();
        setStake(next);
      }}
      onConfirm={confirm}
      onConnect={() => void wallet.connect()}
      onRetryBalance={() => playerId && void client.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(playerId) })}
      onRetryCheck={() => gameHold.retry()}
      onCheckAgain={() => gameHold.checkAgain()}
      onConfirmNone={() => gameHold.confirmNone()}
      onDismissCheck={() => {
        // The player's deliberate way out of a check that keeps failing: the record and the unknown error both go. Never
        // while the purchase may still be answered in the wallet (`dismissable`): its outcome would be dropped.
        if (gameHold.dismissFailed()) purchase.mutation.reset();
      }}
      onOpenReady={() => {
        const id = purchase.ready.gameId;
        purchase.ready.clear();
        if (id !== null) go(`/game/${id}`);
      }}
      onCheckGames={() => go("/")}
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
      <main aria-busy={error === null} className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 tablet:max-w-2xl">
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
