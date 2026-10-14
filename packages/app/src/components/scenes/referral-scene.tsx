import type { IndexedGame, SplitView } from "@paved/chain";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Amount } from "../elements/amount";
import { CopyField } from "../elements/copy-field";
import { Notice } from "../elements/notice";
import { formatBps, SplitBar } from "../containers/split-bar";
import { TabPage } from "../containers/tab-page";

/** A paid game's terms as the indexer serves them (`GameRow.economy`, E3): `@paved/chain` types them on `IndexedGame`. */
export type GameEconomy = NonNullable<IndexedGame["economy"]>;

/** What the player's link earned: the purchases whose `referrer` is them (`GameRow.economy`, E3), read by referrer. */
export interface ReferralEarnings {
  /** USDC base units: the sum of their `referral`. */
  total: bigint;
  /** Purchases through the link, all time. */
  count: number;
  /** The latest, newest first. */
  recent: GameEconomy[];
}

/** How long ago, in its largest unit: "45 min ago", "7 h ago", "2 d ago". */
export function ago(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

export interface ReferralSceneProps {
  /** The player's link (`<origin>/?ref=<address>`); null for a guest. */
  link: string | null;
  /** Just copied. */
  copied?: boolean;
  /** `Economy.split_bps()`; null when the economy is not deployed (no figure is shown then). */
  split: SplitView | null;
  /** Null while it loads. */
  earnings: ReferralEarnings | null;
  now: number;
  onCopy?: (link: string) => void;
  onConnect?: () => void;
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

/**
 * Referral (`/referral`, from Settings and Home): the player's link to copy, their share (the split's referral, out of the
 * Vault's part, never a constant) and what it earned. A link only names a referrer: the buyer pays the same price.
 */
export function ReferralScene(props: ReferralSceneProps) {
  const { link, split, earnings, now } = props;
  return (
    <TabPage tab="settings" title="Referral" subtitle="Invite players, earn a share of their purchases" onBack={props.onBack} onNavigate={props.onNavigate}>
      <div className="grid gap-4 desktop:grid-cols-2 desktop:items-start">
        <div className="flex flex-col gap-4">
          <section aria-label="Your link" data-slot="card" className="flex flex-col gap-3 rounded-xl border border-gold-900 bg-gold-950/40 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-gold-900 text-gold-200">
                <Icon name="link" size="md" />
              </span>
              <div className="flex flex-col">
                <h2 className="font-display text-sm font-semibold">Your link</h2>
                <span className="text-xs text-muted-foreground">
                  {split ? (
                    <>
                      You get <span className="numeric font-semibold text-primary">{formatBps(split.referral)}</span> of the price of every game bought through it.
                    </>
                  ) : (
                    "You get a share of the price of every game bought through it."
                  )}
                </span>
              </div>
            </div>
            {link ? (
              <CopyField value={link} label="Your referral link" copied={props.copied} onCopy={props.onCopy} />
            ) : (
              <Notice title="Connect to get your link" action={<Button size="sm" onClick={props.onConnect}>Connect</Button>}>
                The link carries your address: it needs an account.
              </Notice>
            )}
          </section>

          {split ? (
            <section aria-label="Your share" data-slot="card" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <h2 className="font-display text-sm font-semibold">Where your share comes from</h2>
              <SplitBar split={split} highlight="referral" />
              <p className="text-xs text-muted-foreground">
                The buyer pays the same price. Your share is paid out of the Vault's part, in USDC, when they buy; without a referrer the Vault keeps it.
              </p>
            </section>
          ) : (
            <Notice tone="warning" title="Economy not deployed">
              This network has no purchases yet: nothing to earn.
            </Notice>
          )}
        </div>

        {link && split && (
          <section aria-label="Earned" data-slot="card" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-sm font-semibold">Earned</h2>
            {earnings === null ? (
              <div role="status" aria-label="Loading the earnings" className="flex flex-col gap-3">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-24" />
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between gap-3">
                  <Amount value={earnings.total} token="usdc" className="text-3xl text-foreground" />
                  <span className="text-xs text-muted-foreground">
                    <span className="numeric font-semibold text-foreground">{earnings.count}</span> {earnings.count === 1 ? "purchase" : "purchases"}
                  </span>
                </div>
                {earnings.recent.length === 0 ? (
                  <p className="rounded-lg bg-secondary/60 px-3 py-3 text-sm text-muted-foreground">No purchase through your link yet. Share it with a friend.</p>
                ) : (
                  <ul aria-label="Purchases through your link" className="flex flex-col divide-y divide-border">
                    {earnings.recent.map((p, i) => (
                      <li key={`${p.purchasedAt}-${i}`} className="flex items-center gap-3 py-2">
                        <Icon name="ticket" size="sm" className="text-muted-foreground" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm">
                            Stake <span className="numeric">{p.stake}</span> · <Amount value={BigInt(p.price)} token="usdc" />
                          </span>
                          <span className="text-xs text-muted-foreground">{ago(now - p.purchasedAt)}</span>
                        </span>
                        <Amount value={BigInt(p.referral)} token="usdc" className="text-success" />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </TabPage>
  );
}
