import { useLayoutEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import { BalancesSlot } from "../containers/balances-context";
import type { ShownBalance } from "../containers/balances";
import { HudDrawer } from "../containers/hud-drawer";
import { ShopPacks, type ShopPacksProps } from "../containers/shop-packs";
import { ShopTheme, ShopThemes, type ShopThemesProps } from "../containers/shop-themes";
import { ShopTiles, type ShopTilesProps } from "../containers/shop-tiles";
import { THEMES, type SkinThemeId } from "../containers/theme-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

/** The Shop's tabs (SHOP-PAGE), in the book's order: the day's tiles, the Cobble packs, the themes. */
export type ShopTab = "tiles" | "cobbles" | "themes";
export const SHOP_TABS: readonly { id: ShopTab; label: string }[] = [
  { id: "tiles", label: "Tiles" },
  { id: "cobbles", label: "Cobbles" },
  { id: "themes", label: "Themes" },
];

export interface ShopSceneProps {
  tab: ShopTab;
  /** A theme's own view, open in place of the tabs (the Themes tab's All tiles); null or omitted, the tabs. */
  theme?: SkinThemeId | null;
  tiles: ShopTilesProps;
  packs: ShopPacksProps;
  themes: ShopThemesProps;
  /** The drawer is open (its route the current one); omitted, open. */
  open?: boolean;
  /** Where the focus goes back on close: the HUD's control that opened it. */
  returnFocus?: () => HTMLElement | null;
  onTab?: (tab: ShopTab) => void;
  /** The Shop's close, back to the page it was opened from. */
  onBack?: () => void;
  /** A theme's view's Back, to the Themes tab. */
  onThemeBack?: () => void;
}

/** The balances at the header's end: the Cobbles, and USDC on the Cobbles tab, whose packs it pays (#855's rule, by tab). */
const COBBLES: readonly ShownBalance[] = ["cobbles"];
const PACKS: readonly ShownBalance[] = ["cobbles", "usdc"];
const USDC: readonly ShownBalance[] = ["usdc"];

/** A press on a dialog over the drawer (a wallet's, a purchase's check) is no tap on the village. */
const keepForDialogs = (event: Event) => {
  if ((event.target as Element | null)?.closest?.("[role=dialog], [role=alertdialog]")) event.preventDefault();
};

/**
 * The Shop (SHOP-PAGE, the Paved UX Book's Shop, the owner's approved mockups: "Tiles, Cobbles and Themes as tabs of one shop, one
 * card style"): the HUD's drawer, as Missions (`HudDrawer`): a full page with Back on a phone, a side panel docked at the right from
 * `tablet` (the owner's choice of 2026-11-05 over the book's centred window), the Cobbles at its header's end (and USDC on the Cobbles
 * tab). Under the header the three tabs, the book's: words, the current one lit and underlined in gold. Tiles: the day's three
 * (`ShopTiles`); Cobbles: the packs, paid in USDC (`ShopPacks`); Themes: each theme's tiles, in Cobbles (`ShopThemes`). A theme's
 * All tiles opens its own view in place of the tabs, sliding in, its Back to the tab: never a sheet over the Shop (the owner's ask of
 * 2026-11-05). The tab is the URL's (`/village/shop?tab=cobbles`), so the Cobbles balance opens the Cobbles tab.
 */
export function ShopScene({ tab, theme = null, tiles, packs, themes, open = true, returnFocus, onTab, onBack, onThemeBack }: ShopSceneProps) {
  const option = theme ? THEMES.find((t) => t.id === theme) : undefined;
  const view = option ? `theme:${option.id}` : "tabs";
  // A move between the tabs and a theme's view starts at the top of the drawer's body; a tab's own scroll is its.
  const body = useRef<HTMLDivElement>(null);
  // The first view comes with the drawer's own slide; only a move between views slides, and starts at the top of the body.
  const [last, setLast] = useState(view);
  const [moved, setMoved] = useState(false);
  if (last !== view) {
    setLast(view);
    setMoved(true);
  }
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const region = mounted.current ? body.current?.closest("[data-hud-drawer-body]") : null;
    if (region) region.scrollTop = 0;
    mounted.current = true;
  }, [view]);
  return (
    <HudDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onBack?.();
      }}
      title={option ? option.name : "Shop"}
      side="right"
      slot="shop"
      returnFocus={returnFocus}
      end={
        !option && tab === "cobbles" ? (
          // Two plates and the title do not fit a phone under 360 px: there the tab shows what it spends, USDC.
          <>
            <BalancesSlot layout="pill" kinds={PACKS} className="hidden mobile:flex" />
            <BalancesSlot layout="pill" kinds={USDC} className="mobile:hidden" />
          </>
        ) : (
          <BalancesSlot layout="pill" kinds={COBBLES} />
        )
      }
      onBack={option ? onThemeBack : undefined}
      onInteractOutside={keepForDialogs}
    >
      <m.div
        key={view}
        ref={body}
        // The theme's view comes in from the right, the tabs back from the left (no slide under reduced motion: `MotionConfig`).
        initial={moved && { x: option ? 48 : -48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="flex flex-col gap-3"
      >
        {option ? (
          <ShopTheme {...themes} theme={option.id as SkinThemeId} />
        ) : (
          <Tabs value={tab} onValueChange={(next) => onTab?.(next as ShopTab)} rememberAs="shop" className="gap-4">
            <TabsList aria-label="Shop" className="h-auto w-full bg-transparent p-0" indicatorClassName="top-auto bottom-0 h-1 rounded-full bg-primary">
              {SHOP_TABS.map(({ id, label }) => (
                <TabsTrigger key={id} value={id} className="text-outline h-11 text-lg font-bold">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="tiles" className="flex flex-col gap-3">
              <ShopTiles {...tiles} />
            </TabsContent>
            <TabsContent value="cobbles" className="flex flex-col gap-3">
              <ShopPacks {...packs} />
            </TabsContent>
            <TabsContent value="themes" className="flex flex-col gap-4">
              <ShopThemes {...themes} />
            </TabsContent>
          </Tabs>
        )}
      </m.div>
    </HudDrawer>
  );
}
