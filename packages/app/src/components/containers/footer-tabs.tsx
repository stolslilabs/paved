import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { formatInteger } from "@paved/game-core";
import { cn } from "../../lib/utils";
import { TabsList, TabsTrigger } from "../ui/tabs";

/*
 * FOOTER-TABS (VAULT-PAGE, the owner's direction of 2026-11-06): a sheet's tabs as a bottom navigation in its footer, not a row of
 * words over its body. Two parts on `ui/tabs.tsx`'s Radix tabs, so a page keeps its `Tabs` root and its `TabsContent` and swaps only
 * its list:
 *
 *   <Tabs value={tab} onValueChange={onTab}>
 *     <TabsContent value="deposit">…</TabsContent>
 *     <TabsContent value="withdraw">…</TabsContent>
 *     <DrawerFooter>
 *       <FooterTabsList aria-label="Vault">
 *         <FooterTab value="deposit" art={…} label="Deposit" />
 *         <FooterTab value="withdraw" art={…} label="Withdraw" />
 *       </FooterTabsList>
 *     </DrawerFooter>
 *   </Tabs>
 *
 * `DrawerFooter` (`hud-drawer.tsx`) draws its children at the drawer's foot through a portal: React's context crosses it, so the list
 * stays in its `Tabs` and the triggers keep their tab semantics (a `tablist`, `aria-selected`, `aria-controls` on the panel in the
 * body) and their keyboard (the arrow keys, Home and End, roving focus). A footer that also holds the page's action (the Vault's gold
 * button) stacks it over the list in the same `DrawerFooter`, on the body's charcoal so the current tab hangs from it. The list is the
 * footer's own width, a column per tab (two to four short words).
 *
 * The look (the owner's asks of 2026-11-06 and -07): the bar is the background, carved, the app's darkest; a tab in it shows its icon alone, dimmed. The current
 * tab is the foreground: the body's charcoal under it, joined to the page above (the page runs on into the tab), its icon lifted and
 * lit, its word shown under it, its ground casting a shadow sideways onto the tabs behind it; two tabs in the background are parted by a
 * carved groove. Each change is a transition: the charcoal slides from the old tab to the new one (`TabsList`'s measured indicator), the
 * icon rises, the word fades and slides in, the grooves fade; none under reduced motion.
 */

/**
 * The current tab's ground: the body's charcoal (`bg-secondary`), the bar's full height and a pixel above it (over the footer's
 * line), so the tab runs on from the page. The owner's asks of 2026-11-07: no padding and no rounding where it meets the screen's or
 * the sheet's edge, its column flush with them; its foot rounded on the side of a tab in the background only (`NEIGHBOURS`).
 */
const INDICATOR = "-top-px bottom-0 rounded-none bg-secondary footer-tab-lift";

/**
 * The ground's shadow falls sideways only, onto the other tabs (the owner's ask of 2026-11-07: the current tab in front of the others,
 * on the page's plane): the list clips what would rise over the page above it, a pixel up (the ground's own), and what would spill
 * past its sides (a first or last tab current) over the sheet's edge line and the village (the owner's ask of 2026-11-07, LEADERBOARD-
 * PAGE); below, nothing (the bar runs on under the safe area).
 */
const CLIP = "[clip-path:inset(-1px_0_-100%)]";


/**
 * The ground's foot rounded towards the tabs in the background, by where the current tab stands (its trigger a `button`, the ground a
 * `span` before them): not the first, its left corner; not the last, its right one. The corner changes as the ground slides.
 */
const NEIGHBOURS =
  "[&:has(>button:not(:first-of-type)[data-state=active])>[data-slot=tabs-indicator]]:rounded-bl-2xl [&:has(>button:not(:last-of-type)[data-state=active])>[data-slot=tabs-indicator]]:rounded-br-2xl";

/**
 * The tab's content, in one layer (FOOTER-TAB-GROOVE): laid out as the trigger lays it out (a column, centred, its own width), the
 * count and the "Soon" still placed on the trigger (an opacity makes no containing block). Disabled, the layer is at half opacity, the
 * look the trigger's own `disabled:opacity-50` gave it, while the trigger and its groove stay at full strength.
 */
const CONTENT = "flex w-full min-w-0 flex-col items-center gap-0.5 group-disabled:opacity-50";

/** The icon's and the word's moves, 200 ms as the ground's slide. */
const MOVE = "transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none";

export type FooterTabsListProps = ComponentProps<typeof TabsList> & {
  /** The tabs' name for assistive technology (the page's: "Vault"). */
  "aria-label": string;
};

/**
 * The bar's ground (the owner's ask of 2026-11-07: the tabs in the background darker, so the two read apart): the app's darkest, under
 * the carved shadow, run on under the phone's safe area (the footer's own padding) so the bar is one colour to the screen's edge.
 */
const BAR: CSSProperties = {
  backgroundColor: "var(--background)",
  marginBottom: "calc(-1 * env(safe-area-inset-bottom))",
  paddingBottom: "env(safe-area-inset-bottom)",
};

/**
 * The footer's tab bar: carved, the background (the app's darkest, the inset shadow under its top edge), equal columns across the
 * footer's whole width, flush with its edges; the current tab's ground slides to the next (`TabsList`'s measured indicator, no slide under reduced motion). Inside a `Tabs`
 * root, in the page's `DrawerFooter`.
 */
export function FooterTabsList({ className, style, children, ...props }: FooterTabsListProps) {
  return (
    <TabsList
      data-slot="footer-tabs"
      style={{ ...BAR, ...style }}
      className={cn("drawer-carved h-auto w-full gap-0 rounded-none p-0 text-muted-foreground", NEIGHBOURS, CLIP, className)}
      indicatorClassName={INDICATOR}
      {...props}
    >
      {children}
    </TabsList>
  );
}

export interface FooterTabProps extends Omit<ComponentProps<typeof TabsTrigger>, "children" | "aria-label"> {
  /** The tab's painted icon, 36 px (a `UiIcon`, a page's own art): dimmed in the background, lit and lifted on the current tab. */
  art: ReactNode;
  /** The tab's word, under its icon on the current tab only: its accessible name always. */
  label: string;
  /**
   * The word as drawn, where it differs from `label`: a long one with its soft hyphen ("Announce\u00ADments", the Guild's), so it breaks
   * there in a narrow column, not anywhere (a browser without hyphenation rules breaks it anywhere otherwise).
   */
  word?: string;
  /** What waits in the tab (the dock's red count at the icon's top right); 0 or none, no count. */
  badge?: number;
  /** The word the count is read with ("Followers, 2 new"); omitted, "waiting". */
  badgeWord?: string;
  /**
   * Not in the game yet (LEADERBOARD-PAGE's Alliances): the tab keeps its place, disabled, a carved "Soon" where a count would be (the
   * Tiles' mark), read "Alliances, coming soon". It wins over a count.
   */
  soon?: boolean;
}

/**
 * A footer's tab. In the background: its painted icon alone, dimmed, in the bar's middle. The current one: on the body's charcoal (the
 * list's sliding ground), its icon lit and lifted, its word under it, outlined as the drawer's words are. A count waiting is the dock's
 * red square at the icon's corner, read out with the word ("Requests, 3 waiting"). Disabled (a write on its way), it keeps its place;
 * coming soon (`soon`), too, a carved "Soon" at the icon's corner in place of a count.
 * Two tabs in the background are parted by a carved groove on the second's left edge (`footer-tab-groove`, `theme.css`: none before the
 * first tab, none beside the current one, fading as the ground slides; the owner's ask of 2026-11-07).
 * The word stays in the layout, hidden, so the bar keeps one height whichever tab is current; a word too long for its column (the
 * Guild's Announcements on a 320 px phone, four columns) breaks at its soft hyphen (`word`), else at the page's English rules
 * (`lang="en"`) where the browser has them, else anywhere.
 */
export function FooterTab({ art, label, word, badge = 0, badgeWord = "waiting", soon = false, disabled, className, ...props }: FooterTabProps) {
  return (
    <TabsTrigger
      // The list's indicator finds its tabs by `data-slot="tabs-trigger"` (`TabsList`): this one keeps it, and says it is a footer's.
      data-footer-tab=""
      aria-label={soon ? `${label}, coming soon` : badge > 0 ? `${label}, ${formatInteger(badge)} ${badgeWord}` : word ? label : undefined}
      disabled={soon || disabled}
      // Disabled, the trigger stays at full opacity (FOOTER-TAB-GROOVE, the owner's decision of 2026-11-07): its groove, the `::before`
      // on its left edge, keeps the strength of every other one, and its content dims inside it (`CONTENT`), as the whole tab did.
      className={cn("group h-auto min-h-16 min-w-0 flex-col gap-0.5 rounded-none px-1 pt-1.5 pb-2 text-sm leading-tight font-bold whitespace-normal disabled:opacity-100", "footer-tab-groove", className)}
      {...props}
    >
      <span data-slot="footer-tab-content" className={CONTENT}>
        <span aria-hidden className={cn("grid size-9 translate-y-2.5 place-items-center opacity-60 group-data-[state=active]:translate-y-0 group-data-[state=active]:opacity-100", MOVE)}>
          {art}
        </span>
        {soon ? (
          // Where a count would be, the Tiles' carved "Soon" (`tiles-scene.tsx`): on the card's charcoal, so it reads on the dark bar.
          // Its row spans the tab; a spacer to the icon's corner (half the column and 0.25 rem) gives way before the mark does: where
          // the column is too narrow for it (four tabs in a 288 px sheet, 72 px each), the mark slides left over the icon and ends on
          // the tab's edge, never past it (WRAP360).
          <span aria-hidden className="absolute inset-x-0 top-0.5 flex translate-y-2.5">
            <span className="min-w-0 shrink basis-[calc(50%+0.25rem)]" />
            <span data-slot="footer-tab-soon" className="drawer-carved flex h-4 shrink-0 items-center rounded-full px-1.5 text-xs leading-none font-bold text-muted-foreground">
              Soon
            </span>
          </span>
        ) : badge > 0 && (
          // On the icon's top right corner, as the dock's are, inside the tab's own box (the trigger is `relative`); it rises with the icon.
          <span aria-hidden data-slot="footer-tab-badge" className={cn("numeric absolute top-0.5 left-1/2 ml-1 grid h-4 min-w-4 translate-y-2.5 place-items-center rounded-[0.3rem] bg-dock-badge px-0.5 text-xs leading-none font-bold text-foreground ring-2 ring-background group-data-[state=active]:translate-y-0", MOVE)}>
            {badge > 99 ? "99+" : formatInteger(badge)}
          </span>
        )}
        <span className={cn("text-outline max-w-full translate-y-1 text-center hyphens-auto wrap-anywhere text-foreground opacity-0 group-data-[state=active]:translate-y-0 group-data-[state=active]:opacity-100", MOVE)}>{word ?? label}</span>
      </span>
    </TabsTrigger>
  );
}
