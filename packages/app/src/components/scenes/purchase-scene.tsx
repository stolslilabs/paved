import type { QuoteView, SplitView } from "@paved/chain";
import { Button } from "../ui/button";
import { Amount, formatUnits, TOKENS } from "../elements/amount";
import { GAME_VALIDITY_S } from "../elements/countdown";
import { Deadline } from "../elements/deadline";
import { Icon } from "../ui/icon";
import { Notice } from "../elements/notice";
import { formatPoints } from "../elements/score";
import { PriceBreakdown } from "../containers/price-breakdown";
import { StakePicker } from "../containers/stake-picker";
import { TopBar } from "../containers/top-bar";

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
  now: number;
  /** The player's time zone for the deadline; their own when omitted (stories fix it). */
  timeZone?: string;
  onStakeChange?: (stake: number) => void;
  onConfirm?: () => void;
  onBack?: () => void;
}

/** The Challenge purchase (`/play/challenge`): stake, price and boost, split, the 24 h validity, the threshold, confirm. */
export function PurchaseScene(props: PurchaseSceneProps) {
  const { stake, quote, balance, spawnPaused, buying, now } = props;
  const short = balance < quote.price;
  const blocked = spawnPaused || short;
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar
        title="Challenge"
        onBack={props.onBack}
        end={
          <span className="pr-2 text-xs text-muted-foreground">
            <Amount value={balance} token="usdc" />
          </span>
        }
      />
      <main className="mx-auto grid w-full max-w-md gap-4 px-4 pt-2 pb-8 tablet:max-w-2xl desktop:max-w-4xl desktop:grid-cols-[1fr_22rem] desktop:items-start">
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

          <Button size="lg" className="h-14 text-base" onClick={props.onConfirm} disabled={blocked} loading={buying}>
            {buying ? (
              "Confirm in your wallet…"
            ) : (
              <>
                Pay <Amount value={quote.price} token="usdc" className="[&>span:last-child]:text-primary-foreground/70" /> and play
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
