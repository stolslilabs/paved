import type { CSSProperties } from "react";
import type { SplitView } from "@paved/chain";
import { Amount } from "../elements/amount";
import { Cobbles, formatCobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { PILES, shopPartSources } from "../elements/shop-art";
import { TokenIcon } from "../elements/token-icon";
import { Button } from "../ui/button";
import { formatUsd, packsOnSale } from "./cobble-packs";
import type { Pack } from "./cobble-types";
import { BalanceNotice, ConnectButton, DroppedReferrerNotice, RefusalNotice, retryLabel, shortText, type PurchaseRefusal } from "./purchase-notices";
import { PriceButton, ShopCard, ShopGrid, cellRule } from "./shop-card";
import { formatBps } from "./split-bar";

/** The Cobble packs (P-61, cobbles v1, part 2: `Setup.pack`, `buy_pack`). */
export interface CobbleShop {
  /** `Setup.account(player).cobbles`. */
  balance: number;
  /** The packs on sale (`Setup.pack` of ids 1 to 8); only those with Cobbles and a price are shown. */
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

export interface ShopPacksProps {
  /**
   * The economy's split, which a pack's USDC takes as a game's; null while it is read. When it cannot be read (the economy or the
   * packs not deployed, a failed read), `unavailable` says why.
   */
  split: SplitView | null;
  unavailable?: string | null;
  unavailableDetail?: ErrorDetail;
  /** USDC base units (`balance_of`); null while unread or when the read failed: no "not enough" claim, and Pay waits. */
  balance: bigint | null;
  /** The balance's read failed: why (Retry reads it again). */
  balanceError?: string | null;
  balanceErrorDetail?: ErrorDetail;
  referrer: string | null;
  /** The link's `?ref=` is one the contracts would not pay: it is dropped, and the tab says so. */
  referrerDropped?: boolean;
  /** A wallet is connected; a guest's Pay is "Connect to buy". Connected when omitted (the stories). */
  connected?: boolean;
  cobbles: CobbleShop;
  onSelectPack?: (packId: number) => void;
  onBuyPack?: () => void;
  onConnect?: () => void;
  /** Read the split and the packs again after `unavailable`. */
  onRetryEconomy?: () => void;
  onRetryBalance?: () => void;
  onRetryPacks?: () => void;
  onRetryCheck?: () => void;
  onDismissCheck?: () => void;
  onCheckAgain?: () => void;
  onConfirmNone?: () => void;
  onCheckCobbles?: () => void;
}

/** A pile's box: the piles' frame (8:5), 136 px wide at most, the book's piles as large as its cards show them. */
const PILE_BOX: CSSProperties = { aspectRatio: "8 / 5", maxWidth: "8.5rem" };

/**
 * A pack's Cobbles as the book paints them (the owner's ask of 2026-11-05: a pile of its own a pack, in place of a stack of the
 * Cobble's stone): `rank` 0 the smallest pack's, the fourth's for the larger ones (`shop-art.ts`).
 */
function CobblePile({ rank }: { rank: number }) {
  const name = PILES[Math.min(rank, PILES.length - 1)]!;
  return <img {...shopPartSources(name, 136)} alt="" aria-hidden draggable={false} decoding="async" className="absolute inset-0 size-full object-contain" />;
}

/**
 * The Shop's Cobbles tab (SHOP-PAGE, the book's "Get Cobbles": "packs are paid in USDC"; the packs of #621): the packs on sale in one
 * carved panel, two a row, each its pile of stones, its Cobbles and its price in USDC; a tap on a price picks the pack (its button
 * pressed), and Pay under the panel buys it: the approve and `buy_pack` in one prompt, confirmed and pending as a game's purchase is,
 * the flow of #621 unchanged. Its USDC takes a game's split, said under it.
 */
export function ShopPacks(props: ShopPacksProps) {
  const { cobbles, balance, referrer, split, connected = true, onSelectPack, onBuyPack, onConnect } = props;
  if (props.unavailable || !split)
    return props.unavailable ? (
      <InlineError
        title="The packs cannot be read"
        message={props.unavailable}
        detail={props.unavailableDetail}
        action={
          <Button size="sm" variant="outline" onClick={props.onRetryEconomy}>
            Retry
          </Button>
        }
      />
    ) : (
      <Notice title="Opening the packs…">Where a pack's USDC goes, and your balance.</Notice>
    );
  const onSale = packsOnSale(cobbles.packs);
  const pack = onSale.find((p) => p.packId === cobbles.selected) ?? null;
  const short = connected && pack != null && balance !== null && balance < pack.price;
  const { refusal, bought } = cobbles;
  const label = retryLabel(refusal);
  const locked = cobbles.buying || cobbles.checking;
  return (
    <>
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
        <ShopGrid label="Cobble packs" columns={2}>
          {onSale.map((p, i) => {
            const price = formatUsd(p.price);
            const picked = p.packId === cobbles.selected;
            return (
              <ShopCard
                key={p.packId}
                style={cellRule(i, 2)}
                selected={picked}
                art={<CobblePile rank={i} />}
                artStyle={PILE_BOX}
                title={formatCobbles(p.cobbles)}
                titleClassName="numeric text-2xl leading-tight"
                action={
                  <PriceButton label={`${formatCobbles(p.cobbles)} Cobbles for ${price}`} pressed={picked} disabled={locked} onClick={() => onSelectPack?.(p.packId)}>
                    {price}
                    <TokenIcon kind="usdc" size="md" />
                  </PriceButton>
                }
              />
            );
          })}
        </ShopGrid>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Paid in USDC like a game: swapped to PAVED, 70% burned, 25% to the Vault, 5% to the pool.
        {referrer && <> Your referrer gets {formatBps(split.referral)} of the price, out of the Vault's part.</>}
      </p>
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
              Pay <span className="numeric">{formatUsd(pack.price)}</span> for <Cobbles value={pack.cobbles} className="text-primary-foreground" />
            </>
          )}
        </Button>
      )}
    </>
  );
}
