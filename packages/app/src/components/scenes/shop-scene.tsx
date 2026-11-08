import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as m from "motion/react-m";
import { BalancesSlot } from "../containers/balances-context";
import type { ShownBalance } from "../containers/balances";
import { FooterTab, FooterTabsList } from "../containers/footer-tabs";
import { DrawerFooter, HudDrawer } from "../containers/hud-drawer";
import { ShopPacks, type ShopPacksProps } from "../containers/shop-packs";
import { ShopTheme, ShopThemes, type ShopThemesProps } from "../containers/shop-themes";
import { ShopTiles, type ShopTilesProps } from "../containers/shop-tiles";
import { THEMES, type SkinThemeId } from "../containers/theme-card";
import { TokenIcon } from "../elements/token-icon";
import { UiIcon } from "../elements/ui-icon";
import { Tabs, TabsContent } from "../ui/tabs";

/** The Shop's tabs (SHOP-PAGE), in the book's order: the day's tiles, the Cobble packs, the themes. */
export type ShopTab = "tiles" | "cobbles" | "themes";
export const SHOP_TABS: readonly { id: ShopTab; label: string }[] = [
  { id: "tiles", label: "Tiles" },
  { id: "cobbles", label: "Cobbles" },
  { id: "themes", label: "Themes" },
];

/** Each footer tab's painted icon, 36 px (FOOTER-TABS, #1062): the home's pile of tiles, the Cobbles' paving stone, the Forest theme's. */
const TAB_ART: Record<ShopTab, ReactNode> = {
  tiles: <UiIcon name="tile-stack" px={36} className="drawer-icon size-9" />,
  cobbles: <TokenIcon kind="cobbles" px={36} className="drawer-icon size-9" />,
  themes: <UiIcon name="theme-forest" px={36} className="drawer-icon size-9" />,
};

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
 * tab). The three tabs at its foot, the footer's tabs (FOOTER-TABS, #1062: the owner's standard for a page's tabs). Tiles: the day's
 * three (`ShopTiles`); Cobbles: the packs, paid in USDC (`ShopPacks`); Themes: each theme's tiles, in Cobbles (`ShopThemes`). A theme's
 * All tiles opens its own view in the Themes tab's place, sliding in, its Back to the tab: never a sheet over the Shop (the owner's ask
 * of 2026-11-05); the tabs stay, Themes current, and a tap on another tab leaves the view (#1062's open point 3). The tab is the
 * URL's (`/village/shop?tab=cobbles`), so the Cobbles balance opens the Cobbles tab.
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
      <Tabs
        value={option ? "themes" : tab}
        // Radix calls it twice on a press (pointer down, then focus): a change to the tab shown is no change. From a theme's view,
        // another tab leaves it (the route drops `?theme=`).
        onValueChange={(next) => {
          if (next !== (option ? "themes" : tab) && SHOP_TABS.some((t) => t.id === next)) onTab?.(next as ShopTab);
        }}
        rememberAs="shop"
        className="gap-3"
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
            <TabsContent value="themes" className="flex flex-col gap-3">
              <ShopTheme {...themes} theme={option.id as SkinThemeId} />
            </TabsContent>
          ) : (
            <>
              <TabsContent value="tiles" className="flex flex-col gap-3">
                <ShopTiles {...tiles} />
              </TabsContent>
              <TabsContent value="cobbles" className="flex flex-col gap-3">
                <ShopPacks {...packs} />
              </TabsContent>
              <TabsContent value="themes" className="flex flex-col gap-4">
                <ShopThemes {...themes} />
              </TabsContent>
            </>
          )}
        </m.div>
        <DrawerFooter>
          <FooterTabsList aria-label="Shop">
            {SHOP_TABS.map(({ id, label }) => (
              <FooterTab key={id} value={id} label={label} art={TAB_ART[id]} />
            ))}
          </FooterTabsList>
        </DrawerFooter>
      </Tabs>
    </HudDrawer>
  );
}
