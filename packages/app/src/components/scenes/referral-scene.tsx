import type { SplitView } from "@paved/chain";
import { formatBps, formatNumber } from "@paved/game-core";
import type { Tab } from "../../routes/pages";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { Skeleton } from "../ui/skeleton";
import { Amount } from "../elements/amount";
import { CopyField } from "../elements/copy-field";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { SplitBar } from "../containers/split-bar";
import { TabPage } from "../containers/tab-page";

/** One part of what the link earned: the purchases that paid it and their referral, USDC base units. */
export interface ReferralPart {
  count: number;
  total: bigint;
}

/**
 * What the player's link earned (the indexer's `/v1/players/:id/referrals`, IX-COBBLES2): the referral of every Challenge game
 * and of every pack of Cobbles bought through it, USDC base units. `total` is the two together.
 */
export interface ReferralEarnings {
  total: bigint;
  games: ReferralPart;
  packs: ReferralPart;
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
  /** `split` is still being read: neither the share nor "not deployed" is shown yet. */
  splitPending?: boolean;
  /** Null while it loads, or when its read failed (`earningsError`). */
  earnings: ReferralEarnings | null;
  /** The indexer's read failed: the earnings say so with Retry; the link stays. */
  earningsError?: string | null;
  /** That failure's detail for support (`InlineError`). */
  earningsErrorDetail?: ErrorDetail;
  onCopy?: (link: string) => void;
  /** The system's share sheet; left out where the browser has none (then only Copy). */
  onShare?: (link: string) => void;
  onRetry?: () => void;
  onConnect?: () => void;
  onBack?: () => void;
  onNavigate?: (tab: Tab) => void;
}

const plural = (count: number, one: string) => `${formatNumber(count)} ${count === 1 ? one : `${one}s`}`;

/**
 * Referral (`/referral`, from Settings and Home): the player's link to copy or share, their share (the split's referral,
 * out of the Vault's part, never a constant) and what it earned, games and packs. A link only names a referrer: the buyer
 * pays the same price. A failed read of the earnings never hides the link.
 */
export function ReferralScene(props: ReferralSceneProps) {
  const { link, split, earnings } = props;
  return (
    <TabPage tab="settings" title="Referral" subtitle="Invite players, earn a share of their purchases" onBack={props.onBack} onNavigate={props.onNavigate}>
      <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2 desktop:items-start">
        <div className="flex flex-col gap-4">
          <section aria-label="Your link" data-slot="card" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary">
                <Icon name="link" size="md" />
              </span>
              <div className="flex flex-col">
                <h2 className="font-display text-sm font-semibold">Your link</h2>
                <span className="text-xs text-muted-foreground">
                  {split ? (
                    <>
                      You get <span className="numeric font-semibold text-primary">{formatBps(split.referral)}</span> of the price of every game and
                      pack bought through it.
                    </>
                  ) : (
                    "You get a share of the price of every game and pack bought through it."
                  )}
                </span>
              </div>
            </div>
            {link ? (
              <>
                <CopyField value={link} label="Your referral link" copied={props.copied} onCopy={props.onCopy} />
                {props.onShare && (
                  <Button variant="outline" className="self-start" onClick={() => props.onShare?.(link)}>
                    <Icon name="share-nodes" size="sm" />
                    Share
                  </Button>
                )}
              </>
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
          ) : props.splitPending ? null : (
            <Notice tone="warning" title="Economy not deployed">
              This network has no purchases yet: nothing to earn.
            </Notice>
          )}
        </div>

        {link && split && (
          <section aria-label="Earned" data-slot="card" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-sm font-semibold">Earned</h2>
            {props.earningsError ? (
              <InlineError
                title="The earnings cannot be read"
                message={`${props.earningsError} Your link still works.`}
                detail={props.earningsErrorDetail}
                action={<Button size="sm" onClick={props.onRetry}>Retry</Button>}
              />
            ) : earnings === null ? (
              <div role="status" aria-label="Loading the earnings" className="flex flex-col gap-3">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-16" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <Amount value={earnings.total} token="usdc" className="text-3xl text-foreground" />
                  <span className="text-xs whitespace-nowrap text-muted-foreground">
                    <span className="numeric font-semibold text-foreground">{formatNumber(earnings.games.count + earnings.packs.count)}</span>{" "}
                    {earnings.games.count + earnings.packs.count === 1 ? "purchase" : "purchases"}
                  </span>
                </div>
                {earnings.games.count + earnings.packs.count === 0 ? (
                  <p className="rounded-lg bg-secondary/60 px-3 py-3 text-sm text-muted-foreground">No purchase through your link yet. Share it with a friend.</p>
                ) : (
                  <ul aria-label="Earned through your link" className="flex flex-col divide-y divide-border">
                    {(
                      [
                        ["ticket", "Challenge games", earnings.games, "game"],
                        ["cubes-stacked", "Cobbles packs", earnings.packs, "pack"],
                      ] as const
                    ).map(([icon, label, part, one]) => (
                      <li key={label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 py-2">
                        <span className="inline-flex h-5 items-center">
                          <Icon name={icon} size="sm" className="text-muted-foreground" />
                        </span>
                        <span className="min-w-0 text-sm leading-5 wrap-anywhere">{label}</span>
                        <Amount value={part.total} token="usdc" className="leading-5 text-success" />
                        <span className="col-span-2 col-start-2 min-w-0 text-xs wrap-anywhere text-muted-foreground">{plural(part.count, one)}</span>
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
