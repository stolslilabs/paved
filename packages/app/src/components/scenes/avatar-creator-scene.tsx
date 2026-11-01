import { useLayoutEffect, useRef, useState } from "react";
import type { Trait } from "@paved/renderer";
import { formatDate } from "@paved/game-core";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { LiveAvatar } from "../elements/live-avatar";
import { Cobbles } from "../elements/cobbles";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { Notice } from "../elements/notice";
import { AvatarSwatches } from "../containers/avatar-swatches";
import { optionName, PART_TITLES, partsInUse, rarityOf, sameAvatar, traitsOf, unusableParts, type AvatarOffers, type TraitIds } from "../containers/avatar-types";
import { SkinsStatusView, type SkinsStatus } from "../containers/skins-status";
import { TopBar } from "../containers/top-bar";

/** The creator's state: the saved avatar (the chain's), the draft, the balance and the offers, and the writes on their way. */
export interface AvatarCreator {
  /** The look saved on chain, by item ids: every trait at 0 (the king) when none is. */
  saved: TraitIds;
  /**
   * No avatar is saved on chain yet (look 0): the menus show the initial, so the draft can be saved as it is, the king
   * included (he is a look of its own once saved).
   */
  unsaved?: boolean;
  /** The look being made: Save writes it. */
  draft: TraitIds;
  /** `Setup.account(player_id).cobbles`. */
  balance: number;
  offers: AvatarOffers;
  /** The block time now, in seconds: a seasonal item's end is read against it. */
  now: number;
  /** `set_avatar`: on its way, or just done (the draft is the saved one). */
  save?: "idle" | "saving" | "saved";
  /** The item whose `buy_avatar_item` is on its way. */
  buying?: { part: Trait; id: number } | null;
  /** The last write refused or failed: shown until dismissed or the next write. */
  refusal?: string | null;
  refusalDetail?: ErrorDetail;
}

export interface AvatarCreatorSceneProps {
  /** The creator's data; omitted, `status` says why; null: the network has no avatar contract yet. */
  creator?: AvatarCreator | null;
  status?: SkinsStatus | null;
  /** The tab open first (the first trait in use by default). */
  part?: Trait;
  onPick?: (part: Trait, id: number) => void;
  onBuy?: (part: Trait, id: number) => void;
  onSave?: () => void;
  onRandomise?: () => void;
  /** Back to the saved avatar. */
  onReset?: () => void;
  onDismissRefusal?: () => void;
  onBuyCobbles?: () => void;
  onConnect?: () => void;
  onRetry?: () => void;
  onBack?: () => void;
}

/** A seasonal end, as "Ends 23 Nov". */
const endsOn = (until: number) => `Ends ${formatDate(until * 1000, { day: "numeric", month: "short", timeZone: "UTC" })}`;

/** The names of a list of traits' options, for a sentence: "Wizard hat and Feathered cap". */
function partNames(draft: TraitIds, parts: readonly Trait[]): string {
  const names = parts.map((part) => optionName(part, draft[part]) ?? PART_TITLES[part]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The avatar creator (`/avatar`, #626 PR 2), from Edit avatar in the profile sheet. Mobile first: the bust on top, the page's
 * one live avatar (its idle, its head following the cursor on a desktop); the traits in use as tabs; each trait's options as a
 * grid of swatches, the draft wearing each. A tap tries any option on; a free or owned one can be saved, one on sale shows its
 * Cobble price with Buy (one `buy_avatar_item`, at the price shown), one off sale cannot be had. Save writes the draft on chain
 * (one `set_avatar`) once every trait is free or owned; Randomise draws among those. From `desktop` the bust stays on the left,
 * the traits on the right.
 */
export function AvatarCreatorScene({ creator, status, part, onPick, onBuy, onSave, onRandomise, onReset, onDismissRefusal, onBuyCobbles, onConnect, onRetry, onBack }: AvatarCreatorSceneProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <TopBar title="Avatar" onBack={onBack} />
      {creator ? (
        <Creator
          creator={creator}
          part={part}
          onPick={onPick}
          onBuy={onBuy}
          onSave={onSave}
          onRandomise={onRandomise}
          onReset={onReset}
          onDismissRefusal={onDismissRefusal}
          onBuyCobbles={onBuyCobbles}
        />
      ) : (
        <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-8 tablet:max-w-2xl">
          {status ? (
            <SkinsStatusView
              status={status}
              guestTitle="Connect to make your avatar"
              guestText="Your avatar is kept on your account: the same on every device, and others see it."
              errorTitle="Your avatar could not be read"
              skeleton={
                <div className="flex flex-col items-center gap-4">
                  <Skeleton className="size-48 rounded-full" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <div className="grid w-full grid-cols-4 gap-2">
                    {Array.from({ length: 8 }, (_, i) => (
                      <Skeleton key={i} className="h-28 rounded-xl" />
                    ))}
                  </div>
                </div>
              }
              onConnect={onConnect}
              onRetry={onRetry}
            />
          ) : (
            creator === null && (
              <Notice title="Avatars are coming" icon="pen">
                The avatar creator is not on this network yet: your avatar stays the default one for now.
              </Notice>
            )
          )}
        </main>
      )}
    </div>
  );
}

type CreatorProps = Pick<AvatarCreatorSceneProps, "part" | "onPick" | "onBuy" | "onSave" | "onRandomise" | "onReset" | "onDismissRefusal" | "onBuyCobbles"> & { creator: AvatarCreator };

function Creator({ creator, part, onPick, onBuy, onSave, onRandomise, onReset, onDismissRefusal, onBuyCobbles }: CreatorProps) {
  const { saved, unsaved = false, draft, balance, offers, now, save = "idle", buying, refusal, refusalDetail } = creator;
  const parts = partsInUse(offers);
  const changed = !sameAvatar(draft, saved);
  // What Save would write differs from the chain: a changed draft, or any draft while none is saved.
  const savable = changed || unsaved;
  const unusable = unusableParts(draft, offers);
  const saving = save === "saving";
  const busy = saving || buying != null;
  const [tab, setTab] = useState<string | undefined>(part && parts.includes(part) ? part : parts[0]);
  const strip = useRef<HTMLDivElement>(null);
  // The open tab in view: the list scrolls sideways on a phone, and a tab past its edge would hide which part is open.
  useLayoutEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>("[data-slot=scroll-region]");
    const active = el?.querySelector<HTMLElement>(`[data-slot=tabs-trigger][data-value="${tab}"]`);
    if (!el || !active) return;
    const left = active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2;
    el.scrollLeft = Math.max(0, left);
  }, [tab]);
  return (
    <main className="mx-auto grid w-full max-w-md grid-cols-1 gap-4 px-4 pb-28 tablet:max-w-2xl desktop:max-w-5xl desktop:grid-cols-[20rem_minmax(0,1fr)] desktop:items-start desktop:gap-8 desktop:pb-10">
      <section aria-label="Your avatar" className="flex flex-col items-center gap-3 desktop:sticky desktop:top-4">
        {/* One canvas at every width: it follows its box, 208 px, 288 px from `desktop`; the disc shows while it loads. */}
        <div className="size-52 rounded-full bg-muted desktop:size-72">
          <LiveAvatar traits={traitsOf(draft)} className="size-full" />
        </div>
        <Actions
          className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur desktop:static desktop:w-full desktop:border-0 desktop:bg-transparent desktop:p-0 desktop:backdrop-blur-none"
          canSave={savable && unusable.length === 0 && !busy}
          changed={changed}
          save={save}
          busy={busy}
          onSave={onSave}
          onRandomise={onRandomise}
          onReset={onReset}
        />
        {savable && unusable.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Buy the {partNames(draft, unusable)} to save this avatar, or pick a free one.
          </p>
        )}
      </section>
      <section aria-label="Traits" className="flex min-w-0 flex-col gap-3">
        <InlineError
          title="Not done"
          message={refusal}
          detail={refusalDetail}
          action={
            onDismissRefusal && (
              <Button size="sm" variant="ghost" onClick={onDismissRefusal}>
                Dismiss
              </Button>
            )
          }
        />
        <Tabs value={tab} onValueChange={setTab}>
          {/* Ten traits do not fit a phone's width: the list scrolls sideways, each tab as wide as its name. */}
          <div ref={strip} className="-mx-4 desktop:mx-0">
            <ScrollRegion orientation="horizontal" className="px-4 desktop:px-0">
              <TabsList className="auto-cols-max">
                {parts.map((p) => (
                  <TabsTrigger key={p} value={p}>
                    {PART_TITLES[p]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </ScrollRegion>
          </div>
          {parts.map((p) => {
            const offer = offers[p]![draft[p]];
            return (
              <TabsContent key={p} value={p} className="flex flex-col gap-3">
                {offer?.kind === "sale" && (
                  <BuyCard
                    name={optionName(p, draft[p])!}
                    cobbles={offer.cobbles}
                    until={offer.until > now ? offer.until : 0}
                    balance={balance}
                    buying={buying?.part === p && buying.id === draft[p]}
                    disabled={busy}
                    onBuy={() => onBuy?.(p, draft[p])}
                    onBuyCobbles={onBuyCobbles}
                  />
                )}
                <AvatarSwatches part={p} draft={draft} offers={offers[p]!} buying={buying?.part === p ? buying.id : null} disabled={busy} onPick={(id) => onPick?.(p, id)} />
              </TabsContent>
            );
          })}
        </Tabs>
      </section>
    </main>
  );
}

interface ActionsProps {
  canSave: boolean;
  changed: boolean;
  save: "idle" | "saving" | "saved";
  busy: boolean;
  onSave?: () => void;
  onRandomise?: () => void;
  onReset?: () => void;
  className?: string;
}

/** Randomise, back to the saved one, and Save: a bar fixed to the bottom on a phone, under the head from `desktop`. */
function Actions({ canSave, changed, save, busy, onSave, onRandomise, onReset, className }: ActionsProps) {
  return (
    <div data-slot="avatar-actions" className={className}>
      <div className="mx-auto flex w-full max-w-md items-center gap-2 tablet:max-w-2xl desktop:max-w-none">
        <Button variant="outline" size="icon" aria-label="Randomise" onClick={onRandomise} disabled={busy}>
          <Icon name="dice" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Back to the saved avatar" onClick={onReset} disabled={!changed || busy}>
          <Icon name="arrows-rotate" />
        </Button>
        <Button className="flex-1" onClick={onSave} disabled={!canSave} loading={save === "saving"}>
          {save === "saved" && !changed ? (
            <>
              <Icon name="check" size="sm" />
              Saved
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}

interface BuyCardProps {
  name: string;
  cobbles: number;
  /** A seasonal item's end, 0 for none. */
  until: number;
  balance: number;
  buying: boolean;
  disabled: boolean;
  onBuy: () => void;
  onBuyCobbles?: () => void;
}

/** The option tried on is on sale: its rarity, price and season's end, and Buy; Get Cobbles when the balance is short. */
function BuyCard({ name, cobbles, until, balance, buying, disabled, onBuy, onBuyCobbles }: BuyCardProps) {
  const short = balance < cobbles;
  const rarity = rarityOf(cobbles);
  return (
    <div data-slot="card" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/40 bg-card p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold wrap-anywhere">{name}</span>
          {rarity && <span className="text-xs font-medium text-primary">{rarity}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <Cobbles value={cobbles} size="sm" />
          {until > 0 && <span>{endsOn(until)}</span>}
          {short && (
            <span className="inline-flex items-center gap-1">
              You have <Cobbles value={balance} size="sm" tone="muted" />
            </span>
          )}
        </span>
      </div>
      {short ? (
        <Button size="sm" variant="outline" onClick={onBuyCobbles}>
          Get Cobbles
        </Button>
      ) : (
        <Button size="sm" onClick={onBuy} loading={buying} disabled={disabled && !buying}>
          Buy
        </Button>
      )}
    </div>
  );
}
