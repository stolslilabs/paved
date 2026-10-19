/*
 * Source: the highlight is motion-primitives' AnimatedBackground (components/core/animated-background.tsx,
 * https://github.com/ibelick/motion-primitives at commit 120f64f6ca60348e251f929e9c81f11ccbe45eda, MIT, (c) 2024 ibelick),
 * on F3's Radix tabs (shadcn/ui). Adapted: `m` for LazyMotion, the active value from Radix instead of its own click
 * state, no hover mode and so no `AnimatePresence` fade (a tab list always has an active tab: the highlight only
 * moves), the semantic tokens.
 */
import { createContext, useCallback, useContext, useId, useState, type ComponentProps } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";

/** The selected value (controlled or not) and the highlight's `layoutId`, unique per Tabs. */
const TabsContext = createContext<{ value: string | undefined; layoutId: string }>({ value: undefined, layoutId: "" });

export function Tabs({ className, value, defaultValue, onValueChange, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const layoutId = `tabs-highlight-${useId()}`;
  const change = useCallback(
    (next: string) => {
      setInner(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );
  return (
    <TabsContext.Provider value={{ value: current, layoutId }}>
      <TabsPrimitive.Root data-slot="tabs" value={current} onValueChange={change} className={cn("flex flex-col gap-3", className)} {...props} />
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("relative inline-flex h-10 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * The active trigger holds the highlight, one `m.span` with the Tabs' shared `layoutId`: Motion moves it from the old
 * trigger to the new one (section 3.2). Under reduced motion Motion makes the layout animation instant.
 */
export function TabsTrigger({ className, value, children, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { value: active, layoutId } = useContext(TabsContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium state-layer whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground data-[state=active]:not-active:[--layer:transparent]",
        className,
      )}
      {...props}
    >
      {active === value && (
        <m.span
          data-slot="tabs-indicator"
          aria-hidden
          layoutId={layoutId}
          className="absolute inset-0 rounded-md bg-state-selected"
          transition={{ type: "spring", stiffness: 500, damping: 36 }}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />;
}
