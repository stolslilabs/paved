import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MAX_STAKE, POOL_CANNOT_FILL, POOL_QUOTE_UNAVAILABLE, boostBps } from "@paved/chain";
import { PurchaseScene, type PurchaseRefusal, type PurchaseTab } from "../../components/scenes/purchase-scene";
import { TopBar } from "../../components/containers/top-bar";
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
import { useNow } from "../now";
import { useAppNavigate, useBack } from "../ref";

/**
 * What the scene shows of a purchase whose outcome was unknown (`usePurchaseHold`): while recorded, the unknown outcome (Pay
 * held, then Buy again only); once its receipt read, that it went through or reverted; null otherwise.
 */
function heldRefusal(hold: ReturnType<typeof usePurchase>["hold"], what: "games" | "Cobbles"): PurchaseRefusal | null {
  if (hold.unknown) return { kind: "unknown", message: `Purchase sent (${hold.unknown.hash}), outcome unknown: check your ${what} before buying again.` };
  if (hold.resolved === "succeeded") return { kind: "landed", message: `Your earlier purchase went through: check your ${what} before buying again.` };
  if (hold.resolved === "reverted") return { kind: "refused", message: "Your earlier purchase did not go through: your USDC was not spent." };
  return null;
}

/** The pool quote of a confirm could not be used: why, as a refusal the scene shows before any send. */
function quoteProblem(quote: { minOut: bigint | null; isPending: boolean; error: Error | null }, asked: boolean): PurchaseRefusal | null {
  if (!asked || quote.isPending || quote.minOut !== null) return null;
  return { kind: "refused", message: quote.error ? POOL_QUOTE_UNAVAILABLE : POOL_CANNOT_FILL };
}

/**
 * `/play/challenge` (P7b): the Challenge purchase and the Cobble packs, on the chain's data (section 6.4). The Game tab reads
 * `entry_price` through `Economy.quote(stake)`, the split, the pool's `quote_swap` for `min_out`, the USDC balance and
 * `spawn_paused`; Pay sends the approve and `Challenge.spawn(stake, referrer, min_out)` (`EconomyWriter.purchase`, which
 * reads them all again, with the router and the rate) and opens the new game on its board. The Cobbles tab (`?tab=cobbles`)
 * reads the packs from `Setup.pack` and buys one with the approve and `Setup.buy_pack` (`PackBuyer`); the receipt's
 * `PackBought` sets the balance, then the account is read again. The referrer is the link's `?ref=`, dropped (and said) when
 * the contracts would not pay it. A guest's Pay connects. An unknown outcome is recorded per player (it survives a remount,
 * a reload and a second tab): Pay is held while its receipt and the reconciling reads are checked, and while that check
 * fails (Retry), then only a deliberate Buy again sends. An unread USDC balance is unknown, not 0: Pay waits for it.
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
    return <PurchaseStatus error={error?.message ?? "Purchases are off: the economy is not deployed on this network."} onBack={onBack} onRetry={retry} />;
  }
  if (quote.data === undefined || split.data === undefined) return <PurchaseStatus error={null} onBack={onBack} />;

  const gameHold = purchase.hold;
  const packHold = buyPack.hold;
  const gameRefusal =
    heldRefusal(gameHold, "games") ?? (purchase.mutation.error ? purchaseRefusal(purchase.mutation.error) : quoteProblem(stakeQuote, connected));
  const packRefusal =
    heldRefusal(packHold, "Cobbles") ?? (buyPack.mutation.error ? purchaseRefusal(buyPack.mutation.error) : quoteProblem(packQuote, connected && pack !== null));

  const confirm = () => {
    if (!purchase.buyer) return void wallet.connect();
    if (stakeQuote.minOut === null || gameHold.held || gameReferrer.isPending) return;
    // A deliberate Buy again: the earlier purchase is left to the player's check.
    if (gameHold.unknown) gameHold.clear();
    gameHold.dismiss();
    purchase.mutation.mutate(
      { stake, confirmedPrice: quote.data!.price, confirmedMinOut: stakeQuote.minOut, referrer: gameReferrer.referrer, acceptedLowQuote: gameRefusal?.kind === "low-quote" },
      { onSuccess: ({ gameId }) => go(`/game/${gameId}`) },
    );
  };
  const buy = () => {
    if (!buyPack.buyer) return void wallet.connect();
    if (!pack || packQuote.minOut === null || packHold.held || packReferrer.isPending) return;
    if (packHold.unknown) packHold.clear();
    packHold.dismiss();
    buyPack.mutation.mutate({
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
      spawnPaused={paused.data ?? false}
      buying={purchase.mutation.isPending}
      quoting={stakeQuote.isPending || gameReferrer.isPending}
      refusal={purchase.mutation.isPending ? null : gameRefusal}
      checking={gameHold.checking}
      checkFailed={gameHold.failed}
      connected={connected}
      now={now}
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
              buying: buyPack.mutation.isPending,
              quoting: packQuote.isPending || packReferrer.isPending,
              refusal: buyPack.mutation.isPending ? null : packRefusal,
              checking: packHold.checking,
              checkFailed: packHold.failed,
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
function PurchaseStatus({ error, onBack, onRetry }: { error: string | null; onBack: () => void; onRetry?: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Challenge" onBack={onBack} />
      <main aria-busy={error === null} className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-2 tablet:max-w-2xl">
        {error === null ? (
          <Notice title="Reading the price…">The stake's price, its split and your balance.</Notice>
        ) : (
          <>
            <Notice tone="danger" title="The price cannot be read">
              {error}
            </Notice>
            <Button onClick={onRetry}>Retry</Button>
          </>
        )}
      </main>
    </div>
  );
}
