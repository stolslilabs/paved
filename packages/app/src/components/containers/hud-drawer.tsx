import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as m from "motion/react-m";
import { useSidePanel } from "../../lib/side-panel";
import { cn } from "../../lib/utils";
import { UiIcon } from "../elements/ui-icon";
import { Icon } from "../ui/icon";
import { ScrollRegion } from "../ui/scroll-region";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";

/** From `tablet` (theme.css `--breakpoint-tablet`): the drawer is a side panel docked at its edge, never a page stretched past a phone's width. */
const SIDE_QUERY = "(min-width: 40rem)";

/** The surface, both ways: the face's charcoal under the notch's safe area, the Sheet's padding and gap off. */
const SURFACE = "gap-0 bg-secondary p-0 pt-[env(safe-area-inset-top)] text-foreground";
/** The phone's page: the whole screen, no edge, no shadow. */
const PAGE = "w-full border-0 shadow-none sm:max-w-none";
/**
 * The side panel (direction C of 2026-11-03, its edge A's): the window's height, one straight hairline along its inner side (the
 * Sheet's, by its side) and the Sheet's shadow over the village, no rounded end.
 */
const SIDE = "w-[28rem] max-w-full border-input sm:max-w-full";
/**
 * The phone's sheet (`phone="sheet"`, FRIENDS-PAGE: a player's profile, the book's "full-width sheet" over the page that opened it): the
 * screen's width, as tall as its content up to 92 % of the screen, its top rounded, the Sheet's grab bar over its band.
 */
const SHEET = "max-h-[92dvh] w-full overflow-hidden rounded-t-2xl border-input pt-0";

/**
 * The title's start after Back: the chevron sits in the middle of its 44 px target, so the visible gap is counted from the glyph, about
 * 12 px (the owner's ask of 2026-11-04), as the pages' header's (`PageHeader`).
 */
const TITLE_AFTER_BACK = "-ml-2";

/** The header's control, Back or the close: a 44 px target at its top line's end. */
const CONTROL = "state-layer grid size-11 cursor-pointer place-items-center rounded-full outline-none";

/** A view a page draws in the drawer's body in its own place: its title on the header, its Back to what it covers. */
interface DrawerView {
  title: string;
  onBack: () => void;
}

const DrawerViewContext = createContext<((view: DrawerView | null) => void) | null>(null);

/**
 * DRAWER-NAV-IN-PLACE (#1064, the owner's decision of 2026-11-07): a page opened from a drawer (a player's profile, another guild, a
 * list) replaces the drawer's content in place, as a navigation, with Back to the page before. The open drawer is the host: its pages
 * (`HudDrawer` with `inPlace`) are its guests, a stack, the last one shown. Each guest draws its body over the drawer's own, which
 * stays mounted under it (its scroll and its tab as they were), and its title in the header, whose Back calls the guest's. A guest
 * opened by the URL (`?player=`, `?guild=`) is mounted outside the drawer's tree, so the open drawers are also listed here, the last
 * one opened serving.
 */
interface DrawerHost {
  /** Where the guests' bodies and titles are drawn; null until the drawer's header and body are there. */
  readonly slots: { layer: HTMLElement | null; title: HTMLElement | null };
  /** Whether the drawer is open: a guest stays in it while it slides out. */
  readonly open: boolean;
  /** The guests, oldest first. */
  readonly stack: readonly string[];
  enter(id: string, back: () => void): void;
  leave(id: string): void;
  /** The Back of the guest shown; null with none. */
  back(): (() => void) | null;
  subscribe(listener: () => void): () => void;
  /** Sets a field and tells the guests. */
  set(patch: Partial<{ layer: HTMLElement | null; title: HTMLElement | null; open: boolean }>): void;
}

function createHost(): DrawerHost {
  const listeners = new Set<() => void>();
  const backs = new Map<string, () => void>();
  const host = {
    slots: { layer: null as HTMLElement | null, title: null as HTMLElement | null },
    open: false,
    stack: [] as readonly string[],
    enter(id: string, back: () => void) {
      backs.set(id, back);
      if (!host.stack.includes(id)) host.stack = [...host.stack, id];
      notify();
    },
    leave(id: string) {
      backs.delete(id);
      if (!host.stack.includes(id)) return;
      host.stack = host.stack.filter((s) => s !== id);
      notify();
    },
    back: () => {
      const top = host.stack.at(-1);
      return top === undefined ? null : (backs.get(top) ?? null);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set(patch: Partial<{ layer: HTMLElement | null; title: HTMLElement | null; open: boolean }>) {
      const { open, ...slots } = patch;
      const moved = Object.entries(slots).some(([k, v]) => host.slots[k as keyof typeof slots] !== v);
      if ((open === undefined || open === host.open) && !moved) return;
      if (open !== undefined) host.open = open;
      if (moved) host.slots = { ...host.slots, ...slots };
      notify();
    },
  };
  const notify = () => listeners.forEach((l) => l());
  return host;
}

/**
 * A value read from a store the drawers write in their layout effects (a guest entering, a drawer opening): subscribed in a layout
 * effect, and read again as it subscribes, so a write of the same commit is never missed (`useSyncExternalStore` subscribes after paint,
 * and missed it in the production build). The new value comes before paint.
 */
function useStore<T>(subscribe: (listener: () => void) => () => void, read: () => T): T {
  const [value, setValue] = useState(read);
  const latest = useRef(read);
  useLayoutEffect(() => {
    latest.current = read;
  });
  useLayoutEffect(() => {
    const update = () => setValue(() => latest.current());
    update();
    return subscribe(update);
  }, [subscribe]);
  return value;
}

/** The drawers open now, the last opened last: a guest the URL mounted goes to the last one. */
let openHosts: readonly DrawerHost[] = [];
const hostListeners = new Set<() => void>();
const hostsChanged = () => hostListeners.forEach((l) => l());
const subscribeHosts = (listener: () => void) => {
  hostListeners.add(listener);
  return () => void hostListeners.delete(listener);
};
const lastHost = () => openHosts.at(-1) ?? null;

/** Whether a drawer is open, which a page the URL opens (`?player=`, `?guild=`) is drawn in (DRAWER-NAV-IN-PLACE). */
export const useOpenDrawer = (): boolean => useStore(subscribeHosts, () => openHosts.length > 0);

/** The drawer a guest in it draws its own guests into (a profile's guild, then a member): the same one. */
const DrawerHostContext = createContext<DrawerHost | null>(null);

/** The drawer's foot, where a page's footer is drawn (`DrawerFooter`); null outside a drawer. */
const DrawerFooterContext = createContext<HTMLElement | null>(null);

/**
 * A footer a page draws at the drawer's foot (PLAY-PAGE: the Challenge's total and Confirm), out of its scroll, edge to edge: the
 * header's band turned over (the card's charcoal, its near-black line along its top), the safe area under it. Outside a drawer (a
 * story, a test) it is drawn in place.
 */
export function DrawerFooter({ children }: { children: ReactNode }) {
  const foot = useContext(DrawerFooterContext);
  return foot ? createPortal(children, foot) : <>{children}</>;
}
/** The footer's band: the header's (`drawer-band`) with its line on top; empty, it takes no room. */
const FOOT: CSSProperties = { backgroundColor: "var(--card)", boxShadow: "0 -1px 0 var(--hud-outline)", paddingBottom: "env(safe-area-inset-bottom)" };

/**
 * A view a page opens in the drawer, in its place (GUILD-PAGE, the owner's ask of 2026-11-05: what a page opens beyond itself opens in
 * its drawer, never a sheet over it; Back goes back, the red cross or a tap on the village leaves): while `title` is set, the header
 * shows it, with Back calling `onBack`. Null: the page's own title. Returns whether a drawer holds it (outside one, the caller draws its
 * own Back).
 */
export function useDrawerView(title: string | null, onBack: () => void): boolean {
  const set = useContext(DrawerViewContext);
  const back = useRef(onBack);
  useLayoutEffect(() => {
    back.current = onBack;
  });
  useLayoutEffect(() => {
    if (!set || title === null) return;
    set({ title, onBack: () => back.current() });
    return () => set(null);
  }, [set, title]);
  return set !== null;
}

export interface HudDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The title on its top line: the drawer's accessible name. */
  title: ReactNode;
  /** A short line under the title (VAULT-PAGE: the book's "Deposit PAVED for vPAVED."); omitted, the header is the title's one row. */
  subtitle?: ReactNode;
  /**
   * The edge the side panel docks at from `tablet`, the side of the HUD control that opens it: the left for the profile (the player
   * card's), the right for the right column's pages (Missions). The phone's page slides in from the right either way.
   */
  side?: "left" | "right";
  /**
   * What it is on a phone: a full page with Back (`page`, the default), or a sheet from the bottom with the red close (`sheet`,
   * FRIENDS-PAGE). Opened from a drawer with `inPlace` (the blocked players, How an attack works), it is drawn in that drawer instead.
   */
  phone?: "page" | "sheet";
  /** What the header holds at its outer end, opposite its control (the page's balance: the Missions' Cobbles). */
  end?: ReactNode;
  /**
   * A view of the page drawn in its place (SHOP-PAGE: a theme's tiles, never a sheet over the drawer; a page's own views can also say
   * so with `useDrawerView`): its Back at the header's start at every width, back to the page, and the red cross at its end, the side
   * panel's and the phone's alike (the owner's ask of 2026-11-05: on a phone too, the cross leaves at once).
   */
  onBack?: () => void;
  /** A press outside it (the Missions': on a dialog over it, the Cobbles' packs). Prevented, the drawer stays open. */
  onInteractOutside?: (event: Event) => void;
  /** Where the focus goes back on close, when the opener is not a Radix trigger. */
  returnFocus?: () => HTMLElement | null;
  /** The drawer's own test hook and styles' handle (`data-slot`). */
  slot?: string;
  /**
   * A page opened from a drawer (DRAWER-NAV-IN-PLACE, #1064: a player's profile, another guild, a list): drawn in the open drawer's place,
   * its title on that drawer's header and Back (`onBack`, else a close) to the page it covers, which stays as it was. With no drawer open
   * (from the home, a link), it is its own drawer, as without it. `side` and `phone` are then its own drawer's.
   */
  inPlace?: boolean;
  className?: string;
  children: ReactNode;
}

/** A view's own Back and title, for a page drawn outside a drawer (its stories, a test): in a drawer the header holds them. */
export function ViewHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <button type="button" onClick={onBack} className={cn(CONTROL, "shrink-0")}>
        <Icon name="chevron-left" />
        <span className="sr-only">Back</span>
      </button>
      <h2 className="text-outline min-w-0 text-xl leading-tight font-bold wrap-anywhere">{title}</h2>
    </div>
  );
}

/**
 * The HUD's drawer (PROFILE-DRAWER, the owner's direction of 2026-11-02 and the profile's mockup, `docs/design/profile.webp`): what a
 * HUD control opens over the village, one layout at every width. The owner's asks of 2026-11-04: on a phone a full page with Back,
 * sliding in from the right; from `tablet` a side panel docked at the edge of the control that opens it (`side`: the profile's at the
 * left, the Missions' at the right, MISSIONS-PAGE), 28 rem wide (the page panels' width), the window's
 * height, as a shadcn Sheet (the asks of 2026-11-03: side panels, not a floating window; the game-native direction C, a straight edge
 * as A's), its close the red cross at its header's right end. Both in the face's charcoal, the header a darker band, the title on its
 * left in the display font (the owner's asks of 2026-11-04: titles in it, on the left, right after Back on a phone), what the page
 * shows at the header's end (`end`: the Missions' Cobbles, the HUD's balance the right panel covers, its claims' bursts' target).
 * DOCK-UNDER-PAGES (the owner's ask of 2026-11-04): the home's dock stays under both, covered by the phone's page, veiled and blurred
 * beside the side panel; the body ends at the screen's foot, its safe area under its last line.
 * Inside, the phone's layout whatever the width (`data-page-panel`). The village beside the side panel is veiled lightly and blurred,
 * Escape or a tap on it closing the drawer. It takes the focus itself as it opens. The slide is the Sheet's (Motion).
 */
export function HudDrawer(props: HudDrawerProps) {
  const near = useContext(DrawerHostContext);
  const last = useStore(subscribeHosts, lastHost);
  const [own] = useState(createHost);
  // The host is chosen once the drawers opened in the same commit are listed (their layout effects come before this one's), and kept
  // while the page is open and while it slides out; each opening chooses again.
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => setReady(true), []);
  const [pick, setPick] = useState<{ open: boolean; host: DrawerHost | null } | null>(null);
  if (props.inPlace && ready) {
    if (pick === null || (props.open && !pick.open)) setPick({ open: props.open, host: near ?? (last !== own ? last : null) });
    else if (pick.open !== props.open) setPick({ ...pick, open: props.open });
  }
  if (props.inPlace) {
    if (pick === null) return null;
    if (pick.host) return <DrawerGuest host={pick.host} {...props} />;
  }
  return <DrawerFrame host={own} {...props} />;
}

/** The body's padding, the drawer's and its guests'. */
const BODY = "flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overscroll-contain px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]";

/**
 * A page drawn in an open drawer's place (`inPlace`): its body over the drawer's, sliding in from the right as the drawers' views do
 * (no slide under reduced motion), its title in the header; covered by a later guest, it stays as it was under it. While the drawer
 * slides out, it stays in it. The focus goes to it as it opens, and back to what opened it as it leaves.
 */
function DrawerGuest({ host, open, onOpenChange, title, onBack, slot = "hud-drawer", children }: HudDrawerProps & { host: DrawerHost }) {
  const id = useId();
  const hostOpen = useStore(host.subscribe, () => host.open);
  const slots = useStore(host.subscribe, () => host.slots);
  const top = useStore(host.subscribe, () => host.stack.at(-1) === id);
  // A view the guest opens in its own place (`useDrawerView`: the guild's menu): its title and Back over the guest's.
  const [view, setView] = useState<DrawerView | null>(null);
  const back = useRef<() => void>(() => undefined);
  useLayoutEffect(() => {
    back.current = view?.onBack ?? onBack ?? (() => onOpenChange(false));
  });
  // In the drawer while open, and while the drawer itself slides out with it.
  const shown = open || !hostOpen;
  useLayoutEffect(() => {
    if (!shown) return;
    host.enter(id, () => back.current());
    return () => host.leave(id);
  }, [shown, host, id]);
  const body = useRef<HTMLDivElement>(null);
  // Drawn once the drawer's slots are there (the first pass draws nothing).
  const placed = slots.layer !== null && slots.title !== null;
  useLayoutEffect(() => {
    if (!open || !placed) return;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    body.current?.focus({ preventScroll: true });
    return () => {
      // Once the page under it is no longer inert.
      requestAnimationFrame(() => {
        if (opener?.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
      });
    };
  }, [open, placed]);
  if (!shown || !slots.layer || !slots.title) return null;
  return (
    <>
      {createPortal(<span hidden={!top}>{view?.title ?? title}</span>, slots.title)}
      {createPortal(
        <ScrollRegion
          ref={body}
          tabIndex={-1}
          data-hud-drawer-body=""
          data-hud-drawer-view={slot}
          inert={!top}
          aria-hidden={!top || undefined}
          className={cn(BODY, "absolute inset-0 bg-secondary outline-none", !top && "invisible")}
        >
          <m.div initial={{ x: 48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.22, ease: "easeOut" }} className="flex flex-col gap-3">
            <DrawerHostContext.Provider value={host}>
              <DrawerViewContext.Provider value={setView}>
                <DrawerFooterContext.Provider value={null}>{children}</DrawerFooterContext.Provider>
              </DrawerViewContext.Provider>
            </DrawerHostContext.Provider>
          </m.div>
        </ScrollRegion>,
        slots.layer,
      )}
    </>
  );
}

/** The drawer itself: its Sheet, its header and body, and the host of the pages opened in its place. */
function DrawerFrame({ host, open, onOpenChange, title, subtitle, side: edge = "left", phone = "page", end, onBack, onInteractOutside, returnFocus, slot = "hud-drawer", className, children }: HudDrawerProps & { host: DrawerHost }) {
  const wide = useSidePanel(SIDE_QUERY);
  // A phone's sheet closes as the side panel does: its red cross at the header's end.
  const sheet = !wide && phone === "sheet";
  const side = wide || sheet;
  // A view a page opened in its place (`useDrawerView`): its title and its Back, over the drawer's own.
  const [view, setView] = useState<DrawerView | null>(null);
  // The foot a page's `DrawerFooter` is drawn into.
  const [foot, setFoot] = useState<HTMLElement | null>(null);
  // The pages opened in its place (`inPlace`): the last one shown, its Back the header's.
  const guested = useStore(host.subscribe, () => host.stack.length > 0);
  useLayoutEffect(() => {
    host.set({ open });
    if (!open) return;
    openHosts = [...openHosts, host];
    hostsChanged();
    return () => {
      openHosts = openHosts.filter((h) => h !== host);
      hostsChanged();
    };
  }, [host, open]);
  const titleSlot = useCallback((el: HTMLElement | null) => host.set({ title: el }), [host]);
  const layerSlot = useCallback((el: HTMLElement | null) => host.set({ layer: el }), [host]);
  const toBack = guested ? () => host.back()?.() : (view?.onBack ?? onBack);
  // The phone's Back at the top left, the title right after it; the side panel's close at the header's right end, after what the page
  // shows there (the owner's ask of 2026-11-04: the title on the left, the balance at the top right).
  const close = (
    <SheetClose data-slot="hud-drawer-close" className={CONTROL}>
      <UiIcon name="close" px={36} className="drawer-icon size-9" />
      <span className="sr-only">Close</span>
    </SheetClose>
  );
  const control = side ? (
    close
  ) : (
    <SheetClose data-slot="hud-drawer-back" className={CONTROL}>
      <Icon name="chevron-left" className="drawer-icon" />
      <span className="sr-only">Back</span>
    </SheetClose>
  );
  const back = toBack && (
    <button type="button" data-slot="hud-drawer-back" className={CONTROL} onClick={toBack}>
      <Icon name="chevron-left" className="drawer-icon" />
      <span className="sr-only">Back</span>
    </button>
  );
  const ends = end ? <span data-slot="hud-drawer-end" className="flex min-w-0 items-center">{end}</span> : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={wide ? edge : sheet ? "bottom" : "right"}
        closeButton={false}
        aria-describedby={undefined}
        data-page-panel=""
        data-hud-drawer={slot}
        overlayClassName="drawer-veil backdrop-blur-sm"
        onInteractOutside={onInteractOutside}
        // Escape over a guest goes Back from it, as its header's Back; over the drawer's own page, it closes the drawer.
        onEscapeKeyDown={(e) => {
          const guest = host.back();
          if (!guest) return;
          e.preventDefault();
          guest();
        }}
        // The focus on the drawer itself as it opens, not on its Back or close; Tab reaches them next.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        onCloseAutoFocus={(e) => {
          const target = returnFocus?.();
          if (!target) return;
          e.preventDefault();
          target.focus();
        }}
        className={cn(SURFACE, wide ? SIDE : sheet ? SHEET : PAGE, className)}
      >
        {/* One row: Back (a phone's, or a view's), the title on the left, what the page shows at the end, the close (a side panel's, or a view's) last. */}
        <SheetHeader className="drawer-band flex shrink-0 flex-row items-center gap-1 px-2 py-2.5">
          {back || (!side && control)}
          {/* The title over its line, one column in the title's place; a guest's title in its stead (`inPlace`). */}
          <div data-slot="hud-drawer-title" className={cn("flex min-w-0 flex-1 flex-col", side && !back ? "pl-2" : TITLE_AFTER_BACK)}>
            <SheetTitle className="text-outline truncate text-left font-display text-2xl leading-tight tracking-wide">
              <span hidden={guested}>{view?.title ?? title}</span>
              <span ref={titleSlot} />
            </SheetTitle>
            {subtitle && !view && !guested && <p className="text-sm leading-snug font-semibold text-muted-foreground">{subtitle}</p>}
          </div>
          {!guested && ends}
          {(side || back) && close}
        </SheetHeader>
        {/* Down only: what glows past the content's edge (a waiting gift's halo at a row's end) is cut at the drawer's, never scrolled to. */}
        {/* Its pages' layer over it (`inPlace`): the body stays laid out under a guest, hidden and inert, its scroll kept. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ScrollRegion data-hud-drawer-body="" inert={guested} aria-hidden={guested || undefined} className={cn(BODY, guested && "invisible")}>
            <DrawerHostContext.Provider value={host}>
              <DrawerViewContext.Provider value={setView}>
                <DrawerFooterContext.Provider value={foot}>{children}</DrawerFooterContext.Provider>
              </DrawerViewContext.Provider>
            </DrawerHostContext.Provider>
          </ScrollRegion>
          <div ref={layerSlot} className="contents" />
        </div>
        <div ref={setFoot} data-slot="hud-drawer-footer" style={FOOT} className={cn("shrink-0 empty:hidden", guested && "hidden")} />
      </SheetContent>
    </Sheet>
  );
}
