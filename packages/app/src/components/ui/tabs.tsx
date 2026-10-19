/*
 * F3's Radix tabs (shadcn/ui), with #594's list: equal columns sized by the widest label (the group keeps one footprint
 * whatever the active tab), a gap between the triggers (a hover layer never touches the active fill), and one active
 * indicator that the list moves to the active trigger with a CSS transform transition, under the #537 state layers.
 */
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useReducedMotionConfig } from "motion/react";
import { cn } from "../../lib/utils";

/** The last value of each remembered Tabs (`rememberAs`), kept across a route change that remounts the list. */
const remembered = new Map<string, string>();

/** The selected value (controlled or not) and the key the list remembers it under. */
const TabsContext = createContext<{ value: string | undefined; rememberAs?: string }>({ value: undefined });

export interface TabsProps extends ComponentProps<typeof TabsPrimitive.Root> {
  /**
   * Remember the active value under this key, so a list that mounts again with another value (a tab per route, as the
   * Missions' Limited and Lifetime) slides its indicator from the old tab instead of appearing on the new one.
   */
  rememberAs?: string;
}

export function Tabs({ className, value, defaultValue, onValueChange, rememberAs, ...props }: TabsProps) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const change = useCallback(
    (next: string) => {
      setInner(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );
  return (
    <TabsContext.Provider value={{ value: current, rememberAs }}>
      <TabsPrimitive.Root data-slot="tabs" value={current} onValueChange={change} className={cn("flex flex-col gap-3", className)} {...props} />
    </TabsContext.Provider>
  );
}

/**
 * Equal columns (`auto-cols-fr`): in a `w-fit` list each column takes the widest label, in a `w-full` list the width is
 * shared. The indicator is placed on the active trigger by measure (its left and width), then moved with a transform
 * transition (section 3.2); the first placement, a resize and reduced motion have none.
 */
export function TabsList({ className, children, ref, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  const { value, rememberAs } = useContext(TabsContext);
  const reduced = useReducedMotionConfig() ?? false;
  const listRef = useRef<HTMLDivElement | null>(null);
  const setList = useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      if (typeof ref === "function") return ref(node);
      if (ref) ref.current = node;
    },
    [ref],
  );
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const place = (target: string | undefined, animate: boolean) => {
      const triggers = list.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]');
      const trigger = Array.from(triggers).find((t) => t.dataset.value === target);
      if (!trigger) {
        indicator.style.opacity = "0";
        return;
      }
      indicator.dataset.animate = animate ? "true" : "false";
      indicator.style.opacity = "1";
      indicator.style.width = `${trigger.offsetWidth}px`;
      indicator.style.transform = `translateX(${trigger.offsetLeft}px)`;
    };
    const previous = rememberAs === undefined ? undefined : remembered.get(rememberAs);
    if (!placed.current && previous !== undefined && previous !== value && !reduced) {
      // Mounted on another tab than the remembered one: start there, commit that frame (a forced layout), then move.
      place(previous, false);
      void indicator.offsetWidth;
      place(value, true);
    } else {
      place(value, placed.current && !reduced);
    }
    placed.current = true;
    if (rememberAs !== undefined && value !== undefined) remembered.set(rememberAs, value);

    // A resize re-places without a transition; the observer's first call (the size it starts from) is not one.
    let size = `${list.offsetWidth}x${list.offsetHeight}`;
    const observer = new ResizeObserver(() => {
      const next = `${list.offsetWidth}x${list.offsetHeight}`;
      if (next === size) return;
      size = next;
      place(value, false);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, rememberAs, reduced]);

  return (
    <TabsPrimitive.List
      ref={setList}
      data-slot="tabs-list"
      className={cn(
        "relative inline-grid h-10 w-fit auto-cols-fr grid-flow-col items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span
        ref={indicatorRef}
        data-slot="tabs-indicator"
        aria-hidden
        className="pointer-events-none absolute top-1 bottom-1 left-0 rounded-md bg-state-selected opacity-0 data-[animate=true]:transition-[transform,width] data-[animate=true]:duration-200 data-[animate=true]:ease-out"
      />
      {children}
    </TabsPrimitive.List>
  );
}

/**
 * A trigger paints the hover and pressed layers (#537) on its own rounded box; the selected 15% is the list's indicator,
 * so the active trigger's own layer stays clear (it would double the fill) unless pressed.
 */
export function TabsTrigger({ className, value, children, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-value={value}
      value={value}
      className={cn(
        "relative inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium state-layer whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground data-[state=active]:not-active:[--layer:transparent]",
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />;
}
