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
 * Why the last purchase did not go through, as the page reads it from the writer's typed error: `moved`, the price or the
 * pool's quote moved since the confirm (confirm again at the new figures); `low-quote`, a quote far below the guard rate
 * (Buy anyway sends it); `paused`, new games paused; `unknown`, sent but the receipt could not tell; `refused`, anything else.
 */
export interface PurchaseRefusal {
  kind: "moved" | "low-quote" | "paused" | "unknown" | "refused";
  message: string;
}

const REFUSAL_TITLE: Record<PurchaseRefusal["kind"], string> = {
  moved: "The price moved",
  "low-quote": "Low pool quote",
  paused: "Purchases paused",
  unknown: "Outcome unknown",
  refused: "Purchase refused",
};

function RefusalNotice({ refusal }: { refusal: PurchaseRefusal }) {
  return (
    <Notice tone={refusal.kind === "refused" ? "danger" : "warning"} title={REFUSAL_TITLE[refusal.kind]}>
      {refusal.message}
    </Notice>
  );
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
  /** USDC base units (`balance_of`). */
  balance: bigint;
  spawnPaused: boolean;
  /** The approve + spawn is on its way. */
  buying?: boolean;
  /** The stake's `min_out` is being quoted: Pay waits for it. */
  quoting?: boolean;
  /** Why the last game's purchase did not go through. */
  refusal?: PurchaseRefusal | null;
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
  onBack?: () => void;
}

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
            <Amount value={balance} token="usdc" />
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
  const short = connected && balance < quote.price;
  const blocked = spawnPaused || short || props.quoting;
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
            This stake costs <Amount value={quote.price} token="usdc" />; the wallet holds <Amount value={balance} token="usdc" />.
          </Notice>
        )}
        {refusal && !buying && !(spawnPaused && refusal.kind === "paused") && <RefusalNotice refusal={refusal} />}

        {!connected ? (
          <ConnectButton onConnect={props.onConnect} />
        ) : (
          <Button size="lg" className="h-14 text-base" onClick={props.onConfirm} disabled={blocked} loading={buying}>
            {buying ? (
              "Confirm in your wallet…"
            ) : refusal?.kind === "low-quote" ? (
              "Buy anyway"
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
function CobblesTab({ cobbles, balance, referrer, split, connected = true, onSelectPack, onBuyPack, onConnect }: PurchaseSceneProps & { cobbles: CobbleShop }) {
  // The selected pack among those shown: a pack without Cobbles or a price is never offered, so nothing divides by zero.
  const pack = packsOnSale(cobbles.packs).find((p) => p.packId === cobbles.selected) ?? null;
  const short = connected && pack != null && balance < pack.price;
  const { refusal, bought } = cobbles;
  return (
    <main className="mx-auto grid w-full max-w-md grid-cols-1 gap-4 px-4 pt-2 pb-8 tablet:max-w-2xl desktop:max-w-4xl desktop:grid-cols-[minmax(0,1fr)_22rem] desktop:items-start">
      <section aria-labelledby="packs-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="packs-title" className="font-display text-sm font-semibold">Cobble packs</h2>
          <p className="text-xs text-muted-foreground">Cobbles buy tile skins. They stay on your account: they cannot be sent or sold.</p>
        </div>
        <CobblePacks packs={cobbles.packs} selected={cobbles.selected} disabled={cobbles.buying} onSelect={onSelectPack} />
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
            This pack costs <Amount value={pack.price} token="usdc" />; the wallet holds <Amount value={balance} token="usdc" />.
          </Notice>
        )}
        {refusal && !cobbles.buying && <RefusalNotice refusal={refusal} />}
        {bought && !refusal && !cobbles.buying && (
          <Notice tone="info" title="Pack bought">
            <Cobbles value={bought.cobbles} size="sm" /> added: your balance is <Cobbles value={cobbles.balance} size="sm" />.
          </Notice>
        )}
        {!connected ? (
          <ConnectButton onConnect={onConnect} />
        ) : (
          <Button size="lg" className="h-14 text-base" onClick={onBuyPack} disabled={!pack || short || cobbles.quoting} loading={cobbles.buying}>
            {cobbles.buying ? (
              "Confirm in your wallet…"
            ) : !pack ? (
              "Pick a pack"
            ) : refusal?.kind === "low-quote" ? (
              "Buy anyway"
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
