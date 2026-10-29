import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SendUnconfirmedError } from "@paved/chain";
import { CobblesScene } from "../../components/scenes/cobbles-scene";
import { TopBar } from "../../components/containers/top-bar";
import { InlineError, type ErrorDetail } from "../../components/elements/inline-error";
import { Notice } from "../../components/elements/notice";
import { Button } from "../../components/ui/button";
import { useSplit, useUsdcBalance } from "../../data/chain";
import { cobbleKeys, useCobbleAccount } from "../../data/cobbles";
import { packKeys, purchaseRefusal, referrerParam, useBuyPack, useEffectiveReferrer, usePackQuote, usePacks } from "../../data/purchase";
import { queryKeys } from "../../data/keys";
import { useDataSources } from "../../data/sources";
import { useAccount } from "../../wallet/wallet";
import { useConnectError } from "../connect-error";
import { errorDetail } from "../error-detail";
import { heldRefusal, newRefusal, quoteProblem, withDetail } from "../purchase-refusal";
import { useNow } from "../now";
import { useBack } from "../ref";
import { useInPageRegion } from "../../components/containers/page-region";
import { cn } from "../../lib/utils";
import { BalancesOf } from "../../components/containers/balances-of";

/**
 * `/cobbles` (#621): the Cobble packs, a page of their own (they left the Challenge's purchase, whose old `?tab=cobbles`
 * redirects here). It reads the packs from `Setup.pack`, the Cobble balance, the USDC balance and the split, and buys one with
 * the approve and `Setup.buy_pack` (`PackBuyer`) in one prompt; the receipt's `PackBought` sets the balance, then the account is
 * read again. The referrer is the link's `?ref=`, dropped (and said) when the pack's split would not pay it. A guest's Pay
 * connects. An unknown outcome is held as a game's is (`usePurchaseHold`): recorded per player, checked, and released only by
 * the player's confirm that their balance and Cobbles show no purchase; then only a deliberate Buy again sends.
 * Its header shows its own balances (#855), the Cobbles and USDC, also in the sheet over the page that asked for the packs
 * (`useCobblesSheet`), whose own set is another; the Cobbles' plate leads nowhere, the packs being in view.
 */
export default function Page() {
  return (
    <BalancesOf page="cobbles">
      <Packs />
    </BalancesOf>
  );
}

function Packs() {
  const onBack = useBack();
  const [params] = useSearchParams();
  const wallet = useAccount();
  useConnectError(wallet.error);
  const sources = useDataSources();
  const playerId = sources.signer?.address ?? null;
  const connected = playerId !== null;
  const packReferrer = useEffectiveReferrer("pack", referrerParam(params.get("ref"), playerId));
  const now = useNow();
  const client = useQueryClient();

  const [selected, setSelected] = useState<number | null>(null);
  const split = useSplit();
  const balance = useUsdcBalance(playerId);
  const packs = usePacks();
  const account = useCobbleAccount(playerId);
  const pack = packs.data?.find((p) => p.packId === selected) ?? null;
  const packQuote = usePackQuote(pack, split.data ?? null, packReferrer.referrer !== null);
  const buyPack = useBuyPack(playerId);

  if (split.error || split.data === null || packs.data === null) {
    const retry = () => void client.invalidateQueries({ queryKey: ["chain", "economy"] });
    const message = split.error?.message ?? (split.data === null ? "Purchases are off: the economy is not deployed on this network." : "No Cobble packs are sold on this network.");
    return <CobblesStatus error={message} detail={errorDetail(split.error)} onBack={onBack} onRetry={retry} />;
  }
  if (split.data === undefined) return <CobblesStatus error={null} onBack={onBack} />;

  const packHold = buyPack.hold;
  // A Buy again that sent nothing (busy, declined) puts the released record back: its own refusal is what the player reads.
  const packRefusal =
    (packHold.released ? newRefusal(buyPack.mutation.error) : null) ??
    heldRefusal(packHold, "Cobbles", now, buyPack.mutation.error instanceof SendUnconfirmedError) ??
    (buyPack.mutation.error ? purchaseRefusal(buyPack.mutation.error) : quoteProblem(packQuote, connected && pack !== null));

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

  return (
    <CobblesScene
      split={split.data}
      referrer={packReferrer.referrer}
      referrerDropped={packReferrer.dropped}
      balance={connected ? (balance.data ?? null) : null}
      balanceError={balance.error?.message ?? null}
      balanceErrorDetail={balance.error ? errorDetail(balance.error) : undefined}
      connected={connected}
      cobbles={{
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
      }}
      onSelectPack={(id) => {
        buyPack.mutation.reset();
        setSelected(id);
      }}
      onBuyPack={buy}
      onConnect={() => void wallet.connect()}
      onRetryBalance={() => playerId && void client.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(playerId) })}
      onRetryPacks={() => void client.invalidateQueries({ queryKey: packKeys.packs() })}
      onRetryCheck={() => packHold.retry()}
      onCheckAgain={() => packHold.checkAgain()}
      onConfirmNone={() => packHold.confirmNone()}
      onDismissCheck={() => {
        // The player's deliberate way out of a check that keeps failing; never while the wallet may still answer (`dismissable`).
        if (packHold.dismissFailed()) buyPack.mutation.reset();
      }}
      onCheckCobbles={() => playerId && void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) })}
      onBack={onBack}
    />
  );
}

/**
 * The page before its scene: the split being read (`error` null), or why it cannot be read (the economy or the packs not
 * deployed, a failed read), with Retry. The top bar keeps Back, as on every full-screen flow.
 */
function CobblesStatus({ error, detail, onBack, onRetry }: { error: string | null; detail?: ErrorDetail; onBack: () => void; onRetry?: () => void }) {
  // A full-screen flow fills the viewport; in a scrolling region (the side panel, #782) the page takes its content's height.
  const inRegion = useInPageRegion();
  return (
    <div className={cn("flex flex-col bg-background text-foreground", !inRegion && "min-h-dvh")}>
      <TopBar title="Cobbles" onBack={onBack} />
      <main aria-busy={error === null} className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 tablet:max-w-2xl">
        {error === null ? (
          <Notice title="Opening the shop…">Where a pack's USDC goes, and your balance.</Notice>
        ) : (
          <>
            <InlineError title="The packs cannot be read" message={error} detail={detail} />
            <Button onClick={onRetry}>Retry</Button>
          </>
        )}
      </main>
    </div>
  );
}
