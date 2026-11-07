import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SendUnconfirmedError } from "@paved/chain";
import type { ShopPacksProps } from "../components/containers/shop-packs";
import { useSplit, useUsdcBalance } from "../data/chain";
import { cobbleKeys, useCobbleAccount } from "../data/cobbles";
import { queryKeys } from "../data/keys";
import { packKeys, purchaseRefusal, referrerParam, useBuyPack, useEffectiveReferrer, usePackQuote, usePacks } from "../data/purchase";
import { useDataSources } from "../data/sources";
import { useAccount } from "../wallet/wallet";
import { useConnectError } from "./connect-error";
import { errorDetail } from "./error-detail";
import { useNow } from "./now";
import { heldRefusal, newRefusal, quoteProblem, withDetail } from "./purchase-refusal";

/**
 * The Cobble packs' wiring (#621), the Shop's Cobbles tab's and the packs' sheet's (SHOP-PAGE): it reads the packs from `Setup.pack`,
 * the Cobble balance, the USDC balance and the split, and buys one with the approve and `Setup.buy_pack` (`PackBuyer`) in one prompt;
 * the receipt's `PackBought` sets the balance, then the account is read again. The referrer is the link's `?ref=`, dropped (and said)
 * when the pack's split would not pay it. Until the account is in, Pay waits (NO-GUEST). An unknown outcome is held as a game's is (`usePurchaseHold`):
 * recorded per player, checked, and released only by the player's confirm that their balance and Cobbles show no purchase; then only a
 * deliberate Buy again sends. The flow of the `/cobbles` page it was, unchanged.
 */
export function useShopPacks(): ShopPacksProps {
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

  const unavailable =
    split.error?.message ?? (split.data === null ? "Purchases are off: the economy is not deployed on this network." : packs.data === null ? "No Cobble packs are sold on this network." : null);

  const packHold = buyPack.hold;
  // A Buy again that sent nothing (busy, declined) puts the released record back: its own refusal is what the player reads.
  const packRefusal =
    (packHold.released ? newRefusal(buyPack.mutation.error) : null) ??
    heldRefusal(packHold, "Cobbles", now, buyPack.mutation.error instanceof SendUnconfirmedError) ??
    (buyPack.mutation.error ? purchaseRefusal(buyPack.mutation.error) : quoteProblem(packQuote, connected && pack !== null));

  const buy = () => {
    if (!buyPack.buyer || !playerId) return; // No account yet (NO-GUEST: it is made at start): Pay is off until it is in.
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

  return {
    split: split.data ?? null,
    unavailable,
    unavailableDetail: errorDetail(split.error),
    referrer: packReferrer.referrer,
    referrerDropped: packReferrer.dropped,
    balance: connected ? (balance.data ?? null) : null,
    balanceError: balance.error?.message ?? null,
    balanceErrorDetail: balance.error ? errorDetail(balance.error) : undefined,
    connected,
    cobbles: {
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
    },
    onSelectPack: (id) => {
      buyPack.mutation.reset();
      setSelected(id);
    },
    onBuyPack: buy,
    onRetryEconomy: () => void client.invalidateQueries({ queryKey: ["chain", "economy"] }),
    onRetryBalance: () => playerId && void client.invalidateQueries({ queryKey: queryKeys.chain.usdcBalance(playerId) }),
    onRetryPacks: () => void client.invalidateQueries({ queryKey: packKeys.packs() }),
    onRetryCheck: () => packHold.retry(),
    onCheckAgain: () => packHold.checkAgain(),
    onConfirmNone: () => packHold.confirmNone(),
    onDismissCheck: () => {
      // The player's deliberate way out of a check that keeps failing; never while the wallet may still answer (`dismissable`).
      if (packHold.dismissFailed()) buyPack.mutation.reset();
    },
    onCheckCobbles: () => playerId && void client.invalidateQueries({ queryKey: cobbleKeys.account(playerId) }),
  };
}
