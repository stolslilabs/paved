import type { QuoteView, SplitView } from "@paved/chain";
import { Button } from "../ui/button";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Amount, formatUnits, TOKENS } from "../elements/amount";
import { GAME_VALIDITY_S } from "../elements/countdown";
import { Deadline } from "../elements/deadline";
import { Icon } from "../ui/icon";
import { Notice } from "../elements/notice";
import { Cobbles } from "../elements/cobbles";
import { formatPoints } from "../elements/score";
import { CobblePacks, formatUsd, packsOnSale } from "../containers/cobble-packs";
import { formatBps } from "../containers/split-bar";
import type { Pack } from "../containers/cobble-types";
import { PriceBreakdown } from "../containers/price-breakdown";
import { StakePicker } from "../containers/stake-picker";
import { TopBar } from "../containers/top-bar";

/**
 * Why the last purchase did not go through, as the page reads it from the writer's typed error: `moved`, the price changed
 * since the confirm; `quote-moved`, the pool's quote moved (the swap's `min_out`; the price did not); `low-quote`, a quote far
 * below the guard rate (Buy anyway sends it); `paused`, new games paused; `unknown`, sent but the receipt could not tell (Pay
 * is held while it is checked, then offers Buy again only); `landed`, the receipt of an unknown purchase read since: it went
 * through; `busy`, another write of the account is on its way; `refused`, anything else.
 */
export interface PurchaseRefusal {
  kind: "moved" | "quote-moved" | "low-quote" | "paused" | "unknown" | "landed" | "busy" | "refused";
  message: string;
}

const REFUSAL_TITLE: Record<PurchaseRefusal["kind"], string> = {
  moved: "The price moved",
  "quote-moved": "The pool's quote moved",
  "low-quote": "Low pool quote",
  paused: "Purchases paused",
  unknown: "Outcome unknown",
  landed: "Purchase went through",
  busy: "Another transaction",
  refused: "Purchase refused",
};

/** How an unknown purchase is checked: where the player looks, and whether the check's reads failed (Retry). */
interface Check {
  label: string;
  onCheck?: () => void;
  failed?: boolean;
  onRetry?: () => void;
  /** Forget the unknown purchase after a failed check: Pay is offered again, with the warning. */
  onDismiss?: () => void;
}

function RefusalNotice({ refusal, check }: { refusal: PurchaseRefusal; check?: Check }) {
  const tone = refusal.kind === "refused" ? "danger" : refusal.kind === "busy" || refusal.kind === "landed" ? "info" : "warning";
  const checkable = (refusal.kind === "unknown" || refusal.kind === "landed") && check;
  return (
    <Notice
      tone={tone}
      title={REFUSAL_TITLE[refusal.kind]}
      action={
        checkable ? (
          <span className="flex flex-col gap-1.5">
            {refusal.kind === "unknown" && check.failed && (
              <>
                <Button size="sm" onClick={check.onRetry}>
                  Retry
                </Button>
                <Button size="sm" variant="ghost" onClick={check.onDismiss}>
                  Dismiss
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
      {refusal.message}
      {refusal.kind === "unknown" &&
        check?.failed &&
        " It could not be checked: Retry. Dismiss only if you are sure it did not go through: buying again may pay twice."}
    </Notice>
  );
}

/** The wallet's USDC could not be read: no "not enough" claim, Pay waits, and Retry reads it again. */
function BalanceNotice({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Notice
      tone="warning"
      title="Your USDC balance cannot be read"
      action={
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      {error}
    </Notice>
  );
}

/** The `?ref=` address is one the contracts would not pay: the purchase goes on without a referrer. */
function DroppedReferrerNotice() {
  return <Notice title="Referral link not used">This referral link cannot be used; buying without a referrer.</Notice>;
}

/** The Cobble packs (P-61, cobbles v1, part 2: `Setup.pack`, `buy_pack`). */
export interface CobbleShop {
  /** `Setup.account(player).cobbles`. */
  balance: number;
  /** The packs on sale (`Setup.pack` of ids 1 to 8); the scene keeps only those with Cobbles and a price. */
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
  /** The packs are being read (`Setup.pack`). */
  loading?: boolean;
  /** The packs could not be read: why (Retry reads them again). */
  error?: string | null;
  /** The last pack bought (its receipt's `PackBought`): its Cobbles. */
  bought?: { cobbles: number } | null;
}

export type PurchaseTab = "game" | "cobbles";

export interface PurchaseSceneProps {
  stake: number;
  maxStake: number;
  /** `Economy.quote(stake)`: the price, and the threshold the game must beat (points x 1,000). */
  quote: QuoteView;
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
  /** A wallet is connected; a guest's Pay is "Connect to buy". Connected when omitted (the stories). */
  connected?: boolean;
  now: number;
  /** The player's time zone for the deadline; their own when omitted (stories fix it). */
  timeZone?: string;
  /** The tab shown: the game's stake, or the Cobble packs; the game when omitted. */
  tab?: PurchaseTab;
  /** The Cobble packs; omitted: the game alone, no tabs (before Cobbles). */
  cobbles?: CobbleShop | null;
  onTab?: (tab: PurchaseTab) => void;
  onSelectPack?: (packId: number) => void;
  onBuyPack?: () => void;
  onStakeChange?: (stake: number) => void;
  onConfirm?: () => void;
  onConnect?: () => void;
  onRetryBalance?: () => void;
  onRetryPacks?: () => void;
  /** Check an unknown purchase again after a failed check. */
  onRetryCheck?: () => void;
  /** Forget an unknown purchase whose check keeps failing (the deliberate way out, with its warning). */
  onDismissCheck?: () => void;
  /** After an unknown outcome: where the player sees whether the game was bought. */
  onCheckGames?: () => void;
  /** After an unknown outcome: read the Cobbles again. */
  onCheckCobbles?: () => void;
  onBack?: () => void;
}

/** Pay's label after a refusal: Buy anyway for a low quote, Buy again after an unknown outcome; null for the default. */
const retryLabel = (refusal: PurchaseRefusal | null | undefined): string | null =>
  refusal?.kind === "low-quote" ? "Buy anyway" : refusal?.kind === "unknown" ? "Buy again" : null;

/** A guest's Pay: connect first, whatever the balance. */
function ConnectButton({ onConnect }: { onConnect?: () => void }) {
  return (
    <Button size="lg" className="h-14 text-base" onClick={onConnect}>
      <Icon name="wallet" size="sm" />
      Connect to buy
    </Button>
  );
}

/**
 * The Challenge purchase (`/play/challenge`): stake, price and boost, split, the 24 h validity, the threshold, confirm.
 * With Cobbles (P-61), a Cobbles tab beside it sells the four packs, confirmed and pending as a game is.
 */
export function PurchaseScene(props: PurchaseSceneProps) {
  const { balance, cobbles } = props;
  const tab = cobbles ? (props.tab ?? "game") : "game";
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar
        title={tab === "cobbles" ? "Cobbles" : "Challenge"}
        onBack={props.onBack}
        end={
          <span className="flex flex-col items-end gap-0.5 pr-2 text-xs text-muted-foreground">
            {balance === null ? <span className="numeric">— USDC</span> : <Amount value={balance} token="usdc" />}
            {cobbles && <Cobbles value={cobbles.balance} size="sm" tone="muted" />}
          </span>
        }
      />
      {cobbles && (
        <Tabs value={tab} onValueChange={(v) => props.onTab?.(v as PurchaseTab)} className="mx-auto w-full max-w-md px-4 tablet:max-w-2xl desktop:max-w-4xl">
          <TabsList className="w-full tablet:w-auto">
            <TabsTrigger value="game" className="flex-1 gap-2 px-4">
              <Icon name="trophy" size="sm" />
              Game
            </TabsTrigger>
            <TabsTrigger value="cobbles" className="flex-1 gap-2 px-4">
              <Icon name="cubes-stacked" size="sm" />
              Cobbles
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {tab === "cobbles" && cobbles ? <CobblesTab {...props} cobbles={cobbles} /> : <GameTab {...props} />}
    </div>
  );
}

function GameTab(props: PurchaseSceneProps) {
  const { stake, quote, balance, spawnPaused, buying, now, refusal, connected = true } = props;
  const short = connected && balance !== null && balance < quote.price;
  const blocked = spawnPaused || short || props.quoting || (connected && balance === null) || props.checking || props.checkFailed;
  const label = retryLabel(refusal);
  return (
    <main className="mx-auto grid w-full max-w-md grid-cols-1 gap-4 px-4 pt-2 pb-8 tablet:max-w-2xl desktop:max-w-4xl desktop:grid-cols-[minmax(0,1fr)_22rem] desktop:items-start">
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
        <section data-slot="card" aria-label="Terms" className="flex flex-col gap-3 rounded-xl border border-gold-900 bg-gold-950/40 p-4">
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
          <p className="text-xs text-muted-foreground">Below the threshold the stake is lost; above it, $TILE is minted when the day closes.</p>
          <div className="flex items-center gap-3 border-t border-gold-900 pt-3">
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
        {!spawnPaused && short && (
          <Notice tone="danger" title="Not enough USDC">
            This stake costs <Amount value={quote.price} token="usdc" />; the wallet holds <Amount value={balance!} token="usdc" />.
          </Notice>
        )}
        {connected && props.balanceError && <BalanceNotice error={props.balanceError} onRetry={props.onRetryBalance} />}
        {props.referrerDropped && <DroppedReferrerNotice />}
        {refusal && !buying && !(spawnPaused && refusal.kind === "paused") && (
          <RefusalNotice refusal={refusal} check={{ label: "Check my games", onCheck: props.onCheckGames, failed: props.checkFailed, onRetry: props.onRetryCheck, onDismiss: props.onDismissCheck }} />
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

/** The Cobble packs: pick one, then pay its USDC (approve + `buy_pack`), as a game's purchase; its USDC takes a game's split. */
function CobblesTab(props: PurchaseSceneProps & { cobbles: CobbleShop }) {
  const { cobbles, balance, referrer, split, connected = true, onSelectPack, onBuyPack, onConnect } = props;
  // The selected pack among those shown: a pack without Cobbles or a price is never offered, so nothing divides by zero.
  const onSale = packsOnSale(cobbles.packs);
  const pack = onSale.find((p) => p.packId === cobbles.selected) ?? null;
  const short = connected && pack != null && balance !== null && balance < pack.price;
  const { refusal, bought } = cobbles;
  const label = retryLabel(refusal);
  return (
    <main className="mx-auto grid w-full max-w-md grid-cols-1 gap-4 px-4 pt-2 pb-8 tablet:max-w-2xl desktop:max-w-4xl desktop:grid-cols-[minmax(0,1fr)_22rem] desktop:items-start">
      <section aria-labelledby="packs-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="packs-title" className="font-display text-sm font-semibold">Cobble packs</h2>
          <p className="text-xs text-muted-foreground">Cobbles buy tile skins. They stay on your account: they cannot be sent or sold.</p>
        </div>
        {cobbles.error ? (
          <Notice
            tone="danger"
            title="The packs cannot be read"
            action={
              <Button size="sm" variant="outline" onClick={props.onRetryPacks}>
                Retry
              </Button>
            }
          >
            {cobbles.error}
          </Notice>
        ) : cobbles.loading ? (
          <Notice title="Reading the packs…">The packs on sale and their prices.</Notice>
        ) : onSale.length === 0 ? (
          <Notice title="No packs on sale">No pack of Cobbles is on sale right now. Come back later.</Notice>
        ) : (
          <CobblePacks packs={cobbles.packs} selected={cobbles.selected} disabled={cobbles.buying || cobbles.checking} onSelect={onSelectPack} />
        )}
      </section>

      <div className="flex flex-col gap-4">
        <section data-slot="card" aria-label="Pack price" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
          <p>Paid in USDC like a game: swapped to $TILE, 70% burned, 25% to the Vault, 5% to the pool.</p>
          {referrer && (
            <p className="wrap-anywhere">
              Your referrer gets {formatBps(split.referral)} of the price, out of the Vault's part.
            </p>
          )}
        </section>
        {short && pack && (
          <Notice tone="danger" title="Not enough USDC">
            This pack costs <Amount value={pack.price} token="usdc" />; the wallet holds <Amount value={balance!} token="usdc" />.
          </Notice>
        )}
        {connected && props.balanceError && <BalanceNotice error={props.balanceError} onRetry={props.onRetryBalance} />}
        {props.referrerDropped && <DroppedReferrerNotice />}
        {refusal && !cobbles.buying && (
          <RefusalNotice refusal={refusal} check={{ label: "Check my Cobbles", onCheck: props.onCheckCobbles, failed: cobbles.checkFailed, onRetry: props.onRetryCheck, onDismiss: props.onDismissCheck }} />
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
            disabled={!pack || short || cobbles.quoting || balance === null || cobbles.checking || cobbles.checkFailed}
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
            ) : label ? (
              label
            ) : (
              <>
                Pay <span className="numeric">{formatUsd(pack.price)}</span> for <Cobbles value={pack.cobbles} className="text-primary-foreground" iconClassName="text-primary-foreground" />
              </>
            )}
          </Button>
        )}
      </div>
    </main>
  );
}
