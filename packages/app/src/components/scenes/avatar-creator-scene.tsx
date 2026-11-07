import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import * as m from "motion/react-m";
import type { Trait } from "@paved/renderer";
import { formatDate } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ScrollRegion } from "../ui/scroll-region";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { avatarArtSources, type AvatarArtName } from "../elements/avatar-art";
import { avatarBackdrop } from "../elements/avatar-still";
import { BLACK_OUTLINE } from "../elements/black-outline";
import { goldPillStyle } from "../elements/friends-art";
import { InlineError, type ErrorDetail } from "../elements/inline-error";
import { LiveAvatar } from "../elements/live-avatar";
import { Notice } from "../elements/notice";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { AvatarSwatches } from "../containers/avatar-swatches";
import { optionName, PART_TITLES, partsInUse, rarityOf, sameAvatar, traitsOf, unusableParts, type AvatarOffer, type AvatarOffers, type TraitIds } from "../containers/avatar-types";
import { BalancesSlot } from "../containers/balances-context";
import { DrawerFooter, HudDrawer } from "../containers/hud-drawer";
import { ARROW, Arrow } from "../containers/league-carousel";
import type { SkinsStatus } from "../containers/skins-status";

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
  /**
   * The creator's data; omitted, `status` says why (its reads on their way, the account's too: no guest, every player has one, the
   * owner's ruling of 2026-11-07; or a failed read); null: the network has no avatar contract yet.
   */
  creator?: AvatarCreator | null;
  status?: SkinsStatus | null;
  /** The category shown (the URL's `?part=`); the first trait in use by default. */
  part?: Trait;
  onPart?: (part: Trait) => void;
  /** The drawer's state (the route's): false while it slides out. */
  open?: boolean;
  returnFocus?: () => HTMLElement | null;
  onPick?: (part: Trait, id: number) => void;
  onBuy?: (part: Trait, id: number) => void;
  onSave?: () => void;
  onRandomise?: () => void;
  /** Back to the saved avatar. */
  onReset?: () => void;
  onDismissRefusal?: () => void;
  onBuyCobbles?: () => void;
  onRetry?: () => void;
  /** Back: to the Profile, which opened the editor. */
  onBack?: () => void;
  /** The red cross, Escape or a tap on the village: the editor closes, back to the village. */
  onClose?: () => void;
}

/** A seasonal end, as "Ends 23 Nov". */
const endsOn = (until: number) => `Ends ${formatDate(until * 1000, { day: "numeric", month: "short", timeZone: "UTC" })}`;

/** The names of a list of traits' options, for a sentence: "Wizard hat and Feathered cap". */
function partNames(draft: TraitIds, parts: readonly Trait[]): string {
  const names = parts.map((part) => optionName(part, draft[part]) ?? PART_TITLES[part]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** A press on a dialog over the drawer (the Cobbles' packs, a wallet's) is no tap on the village. */
const keepForDialogs = (event: Event) => {
  if ((event.target as Element | null)?.closest?.("[role=dialog], [role=alertdialog], [role=menu]")) event.preventDefault();
};

/** A category's painting (`avatar-art.ts`), Headwear the HUD's crown. Decorative: its tab carries the name. */
function CategoryArt({ part, px, className }: { part: Trait | "undo"; px: number; className?: string }) {
  if (part === "headwear") return <UiIcon name="crown" px={px} className={className} />;
  return (
    <img {...avatarArtSources(part as AvatarArtName, px)} alt="" aria-hidden decoding="async" draggable={false} className={cn("inline-block shrink-0 select-none", className)} />
  );
}

/**
 * The avatar editor (AVATAR-PAGE, the Paved UX Book's "avatar-editor", from the Profile's Avatar): the HUD's drawer docked at the left
 * from `tablet`, as the Profile, a full page on a phone; Back returns to the Profile, the red cross to the village. The Cobbles at its
 * header's end. On top the page's one live avatar (its idle, its head following the cursor on a desktop) in its disc, over its backdrop
 * blurred (no league here, no rim, no crest: the owner's ask of 2026-11-06); then the categories, each a painting over its name, the one
 * shown underlined in gold, thin arrows at the ends; the category's options three a row, the draft wearing each (stills), a price under
 * those on sale (nothing under those the player owns or that are free); the option tried on, its name, rarity and price, with Buy (one `buy_avatar_item` at the price shown); and at the foot Randomise (among the free and
 * owned options), Reset (back to the saved look) and Save (one `set_avatar`, once every trait is free or owned). Buy, Reset and Save
 * stay in place in every state, off when they cannot act.
 */
export function AvatarCreatorScene({ creator, status, part, onPart, open = true, returnFocus, onBack, onClose, onRetry, ...actions }: AvatarCreatorSceneProps) {
  const loading = !creator && status?.kind === "loading";
  return (
    <HudDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
      title="Avatar"
      side="left"
      slot="avatar"
      returnFocus={returnFocus}
      end={<BalancesSlot layout="pill" />}
      onBack={onBack}
      onInteractOutside={keepForDialogs}
    >
      {creator ? (
        <Creator creator={creator} part={part} onPart={onPart} {...actions} />
      ) : loading ? (
        <Loading />
      ) : status?.kind === "error" ? (
        <InlineError
          title="Your avatar could not be read"
          message={status.message}
          detail={status.detail}
          action={
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          }
        />
      ) : (
        creator === null && (
          <Notice title="Avatars are coming" icon="pen">
            The avatar creator is not on this network yet: your avatar stays the default one for now.
          </Notice>
        )
      )}
      {/* One foot from the loading to the editor: its buttons stay the same elements, off until the reads are in. */}
      {(creator || loading) && <Footer {...footerOf(creator ?? null)} onSave={actions.onSave} onRandomise={actions.onRandomise} onReset={actions.onReset} />}
    </HudDrawer>
  );
}

/** The avatar's disc's edge: the HUD's near-black outline. */
const OUTLINE: CSSProperties = { boxShadow: "0 0 0 3px var(--hud-outline)" };

/** The hero's ground: the backdrop darkened a little, fading into the drawer's face at its foot. */
const HERO_FADE: CSSProperties = { backgroundImage: "linear-gradient(color-mix(in oklab, var(--secondary) 30%, transparent), color-mix(in oklab, var(--secondary) 15%, transparent) 60%, var(--secondary))" };

/**
 * The avatar, large, over its backdrop blurred (the book's village), edge to edge under the header; in its disc alone, a thin near-black
 * outline round it (the owner's ask of 2026-11-06: no league on the avatar's pages, no rim and no crest).
 */
function Hero({ draft }: { draft: TraitIds }) {
  const traits = traitsOf(draft);
  return (
    <section aria-label="Your avatar" data-slot="avatar-hero" className="relative -mx-4 -mt-4 flex shrink-0 justify-center overflow-hidden pt-5 pb-7">
      <img src={avatarBackdrop(traits.backdrop)} alt="" aria-hidden draggable={false} className="absolute inset-0 size-full scale-110 object-cover blur-md" />
      <span aria-hidden className="absolute inset-0" style={HERO_FADE} />
      {/* One canvas at every width, 120 px: the disc shows while it loads. */}
      <span className="relative block size-30 overflow-hidden rounded-full" style={OUTLINE}>
        <LiveAvatar traits={traits} className="size-full bg-muted" />
      </span>
    </section>
  );
}

type CreatorProps = Pick<AvatarCreatorSceneProps, "part" | "onPart" | "onPick" | "onBuy" | "onDismissRefusal" | "onBuyCobbles"> & {
  creator: AvatarCreator;
};

/**
 * The foot's state: Save on once the draft differs from the saved look (the owner's ask of 2026-11-07: no change, Save off) and every
 * trait is free or owned; nothing while the reads are on their way.
 */
function footerOf(creator: AvatarCreator | null): Pick<FooterProps, "canSave" | "changed" | "save" | "busy"> {
  if (!creator) return { canSave: false, changed: false, save: "idle", busy: true };
  const { saved, draft, offers, save = "idle", buying } = creator;
  const changed = !sameAvatar(draft, saved);
  const busy = save === "saving" || buying != null;
  return { canSave: changed && unusableParts(draft, offers).length === 0 && !busy, changed, save, busy };
}

function Creator({ creator, part, onPart, onPick, onBuy, onDismissRefusal, onBuyCobbles }: CreatorProps) {
  const { saved, unsaved = false, draft, balance, offers, now, save = "idle", buying, refusal, refusalDetail } = creator;
  const parts = partsInUse(offers);
  const changed = !sameAvatar(draft, saved);
  // What Save would write differs from the chain: a changed draft, or any draft while none is saved.
  const savable = changed || unsaved;
  const unusable = unusableParts(draft, offers);
  const busy = save === "saving" || buying != null;
  const asked = part && parts.includes(part) ? part : parts[0];
  const [tab, setTab] = useState(asked);
  // The URL's category, followed when it changes (a link, Back).
  const [given, setGiven] = useState(asked);
  if (given !== asked) {
    setGiven(asked);
    setTab(asked);
  }
  // Radix calls it twice for one press: the same value twice is one change.
  const choose = (next: string) => {
    if (next === tab) return;
    setTab(next as Trait);
    onPart?.(next as Trait);
  };
  const index = parts.indexOf(tab!);
  return (
    <>
      <Hero draft={draft} />
      <Tabs value={tab} onValueChange={choose} className="gap-3">
        <PartStrip parts={parts} tab={tab!} onStep={(by) => choose(parts[index + by]!)} />
        {parts.map((p) => (
          <TabsContent key={p} value={p} className="flex flex-col gap-3">
            <AvatarSwatches part={p} draft={draft} offers={offers[p]!} buying={buying?.part === p ? buying.id : null} disabled={busy} onPick={(id) => onPick?.(p, id)} />
            <ItemRow
              part={p}
              id={draft[p]}
              offer={offers[p]![draft[p]] ?? { kind: "off" }}
              now={now}
              balance={balance}
              buying={buying?.part === p && buying.id === draft[p]}
              busy={busy}
              onBuy={() => onBuy?.(p, draft[p])}
              onBuyCobbles={onBuyCobbles}
            />
          </TabsContent>
        ))}
      </Tabs>
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
      {savable && unusable.length > 0 && (
        <p data-slot="avatar-unusable" className="text-center text-sm font-semibold text-muted-foreground">
          Buy the {partNames(draft, unusable)} to save, or pick one you own.
        </p>
      )}
    </>
  );
}

/** The strip fades out at its ends, so a category cut by the edge reads as more to scroll to. */
const STRIP_FADE: CSSProperties = { maskImage: "linear-gradient(90deg, transparent, var(--background) 1rem, var(--background) calc(100% - 1rem), transparent)" };

/**
 * The categories (the book's strip): each a painting over its name, the one shown underlined in gold; the strip scrolls sideways, the
 * one shown kept in view, a thin arrow at each end stepping to the category beside it.
 */
function PartStrip({ parts, tab, onStep }: { parts: readonly Trait[]; tab: Trait; onStep: (by: -1 | 1) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const index = parts.indexOf(tab);
  // The category shown in view: the strip scrolls sideways, and a tab past its edge would hide which one is open.
  useLayoutEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>("[data-slot=scroll-region]");
    const active = el?.querySelector<HTMLElement>(`[data-slot=tabs-trigger][data-value="${tab}"]`);
    if (!el || !active) return;
    el.scrollLeft = Math.max(0, active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2);
  }, [tab]);
  return (
    <div ref={strip} data-slot="avatar-parts" className="-mx-3 flex items-center">
      <Button variant="ghost" size="icon" className={ARROW} aria-label="Previous category" disabled={index <= 0} onClick={() => onStep(-1)}>
        <Arrow to="left" />
      </Button>
      <ScrollRegion orientation="horizontal" className="min-w-0 flex-1" style={STRIP_FADE}>
        {/* Its ends padded past the fade, so the first and last names show whole (the owner's ask of 2026-11-07: Skin tone was cut). */}
        <TabsList aria-label="Categories" className="h-auto w-max auto-cols-max gap-0 bg-transparent px-4 py-0" indicatorClassName="top-auto bottom-0 h-1 rounded-full bg-primary">
          {parts.map((p) => (
            <TabsTrigger key={p} value={p} className="text-outline h-auto min-w-15 flex-col gap-0.5 rounded-lg px-1.5 pt-1 pb-2 text-xs font-bold">
              <CategoryArt part={p} px={36} className="size-9" />
              {PART_TITLES[p]}
            </TabsTrigger>
          ))}
        </TabsList>
      </ScrollRegion>
      <Button variant="ghost" size="icon" className={ARROW} aria-label="Next category" disabled={index >= parts.length - 1} onClick={() => onStep(1)}>
        <Arrow to="right" />
      </Button>
    </div>
  );
}

/** A rarity's word in its colour (the chests' ranks'): Rare the XP's cyan, Epic pink-violet, Legendary the primary gold. */
const RARITY_INK: Record<NonNullable<ReturnType<typeof rarityOf>>, CSSProperties> = {
  Common: { color: "var(--muted-foreground)" },
  Rare: { color: "var(--rank-rare)" },
  Epic: { color: "var(--rank-epic)" },
  Legendary: { color: "var(--primary)" },
};

/** The near-black rule between the art and the words (the drawer's rules'). */
const RULE: CSSProperties = { backgroundColor: "var(--hud-outline)" };

/** The gold pill under a word (the book's Buy and Save): Follow back's painted pill, its word outlined in black. */
const GOLD = (px: number): CSSProperties => ({ ...goldPillStyle(px), textShadow: BLACK_OUTLINE });
const SHINE: CSSProperties = { backgroundImage: "linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 55%, transparent), transparent)" };

/** A light crossing the gold pill now and then while it can be pressed (Play's Confirm's); no glow, no pulse. Reduced motion: none. */
function Shine() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-1 overflow-hidden rounded-full">
      <m.span
        className="absolute inset-y-0 left-0 w-1/3"
        style={SHINE}
        initial={{ x: "-120%" }}
        animate={{ x: "320%" }}
        transition={{ delay: 0.4, duration: 0.9, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" }}
      />
    </span>
  );
}

interface ItemRowProps {
  part: Trait;
  id: number;
  offer: AvatarOffer;
  now: number;
  balance: number;
  buying: boolean;
  busy: boolean;
  onBuy: () => void;
  onBuyCobbles?: () => void;
}

/**
 * The option tried on (the book's row under the grid): its category's painting, then its name, its rarity in its colour and its price
 * (nothing for one the player owns or that is free: the owner's ask of 2026-11-06; Off sale), a seasonal one's end under them, and the gold Buy, off unless it is on sale and the Cobbles suffice.
 * Short of them, how many more and Get Cobbles (the packs).
 */
function ItemRow({ part, id, offer, now, balance, buying, busy, onBuy, onBuyCobbles }: ItemRowProps) {
  const name = optionName(part, id) ?? PART_TITLES[part];
  const sale = offer.kind === "sale" ? offer : null;
  const rarity = sale ? rarityOf(sale.cobbles) : null;
  const need = sale ? sale.cobbles - balance : 0;
  const until = sale && sale.until > now ? sale.until : 0;
  const buyable = sale !== null && need <= 0 && !busy;
  return (
    <div data-slot="avatar-item" className="flex flex-col gap-2">
      <div className="drawer-carved flex items-center gap-3 rounded-xl py-2 pr-2 pl-3">
        <CategoryArt part={part} px={44} className="size-11" />
        <span aria-hidden className="w-px self-stretch" style={RULE} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-outline text-base leading-snug font-bold wrap-anywhere">{name}</span>
          {sale ? (
            <p className="text-outline flex flex-wrap items-center gap-x-1.5 text-sm leading-snug font-bold">
              {rarity && (
                <>
                  <span style={RARITY_INK[rarity]}>{rarity}</span>
                  <span aria-hidden>·</span>
                </>
              )}
              <span className="inline-flex items-center gap-1">
                <span className="numeric">{sale.cobbles}</span>
                <TokenIcon kind="cobbles" px={18} className="size-4.5" label="Cobbles" />
              </span>
            </p>
          ) : (
            <span className={cn("text-sm leading-snug text-muted-foreground", offer.kind === "off" ? "text-outline font-bold" : "font-medium italic")}>
              {offer.kind === "off" ? "Off sale" : "Owned"}
            </span>
          )}
          {until > 0 && <span className="text-xs font-semibold text-muted-foreground">{endsOn(until)}</span>}
          {need > 0 && (
            <span className="text-xs font-semibold text-warning">
              Need <span className="numeric">{need}</span> more
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          style={GOLD(44)}
          className="relative h-11 min-w-20 shrink-0 px-1 text-lg font-black text-foreground"
          disabled={!buyable}
          loading={buying}
          onClick={onBuy}
        >
          {buyable && !buying && <Shine />}
          Buy
        </Button>
      </div>
      {need > 0 && onBuyCobbles && (
        <Button variant="outline" className="self-center" onClick={onBuyCobbles}>
          <TokenIcon kind="cobbles" size="sm" /> Get Cobbles
        </Button>
      )}
    </div>
  );
}

interface FooterProps {
  canSave: boolean;
  changed: boolean;
  save: "idle" | "saving" | "saved";
  busy: boolean;
  onSave?: () => void;
  onRandomise?: () => void;
  onReset?: () => void;
}

/** The raised grey of the footer's other buttons, the Shop's price's. */
const RAISED: CSSProperties = {
  backgroundImage: "linear-gradient(var(--layer, transparent), var(--layer, transparent)), linear-gradient(var(--drawer-raised), var(--secondary))",
  boxShadow: "inset 0 1px 0 var(--drawer-bevel), 0 0 0 1px var(--hud-outline), 0 2px 0 1px var(--hud-outline)",
};

/**
 * The drawer's foot (the book's three buttons, the owner's asks of 2026-11-07): Randomise as its die alone, Undo as its painted arrow
 * (back to the saved look; the book's middle button, the drawer's own Back already returning to the Profile), and the gold Save, which
 * writes the look shown, off while it is the saved one. Each in place in every state, off when it cannot act.
 */
function Footer({ canSave, changed, save, busy, onSave, onRandomise, onReset }: FooterProps) {
  const square = "size-12 shrink-0 rounded-xl p-0";
  return (
    <DrawerFooter>
      <div data-slot="avatar-actions" className="flex items-center gap-2 px-4 py-2.5">
        <Button variant="ghost" style={RAISED} className={square} aria-label="Randomise" title="Randomise" onClick={onRandomise} disabled={busy}>
          <UiIcon name="die" px={32} className="size-8" />
        </Button>
        <Button variant="ghost" style={RAISED} className={square} aria-label="Undo" title="Undo" onClick={onReset} disabled={!changed || busy}>
          <CategoryArt part="undo" px={32} className="size-8" />
        </Button>
        <Button variant="ghost" style={GOLD(48)} className="relative h-12 min-w-0 flex-1 px-1 text-lg font-black text-foreground" onClick={onSave} disabled={!canSave} loading={save === "saving"}>
          {canSave && <Shine />}
          Save
        </Button>
      </div>
    </DrawerFooter>
  );
}

/** The reads on their way: the editor's own shapes, carved (the skeleton's muted grey hardly shows on the drawer's face); its foot's buttons off, the scene's. */
function Loading() {
  const bone = "bg-card";
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      <div className="-mx-4 -mt-4 flex justify-center pt-5 pb-7">
        <Skeleton className={cn(bone, "size-30 rounded-full")} />
      </div>
      <Skeleton className={cn(bone, "h-14 w-full rounded-lg")} />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className={cn(bone, "h-32 rounded-xl")} />
        ))}
      </div>
      <Skeleton className={cn(bone, "h-16 w-full rounded-xl")} />
    </div>
  );
}
