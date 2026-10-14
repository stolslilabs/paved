import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";

const ValueContext = createContext<string | undefined>(undefined);

/** Tracks the selected value (controlled or not) so that the list can slide its indicator under the active trigger. */
export function Tabs({ className, value, defaultValue, onValueChange, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
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
    <ValueContext.Provider value={current}>
      <TabsPrimitive.Root data-slot="tabs" value={current} onValueChange={change} className={cn("flex flex-col gap-3", className)} {...props} />
    </ValueContext.Provider>
  );
}

/**
 * The indicator is one `m.span` that animates its `x` and `width` to the active trigger (section 3.2). Measured, not a
 * shared `layoutId`: that needs the layout feature set (`domMax`), which the app does not load.
 */
export function TabsList({ className, children, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  const value = useContext(ValueContext);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    setBox(active ? { x: active.offsetLeft, width: active.offsetWidth } : null);
  }, [value]);
  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      className={cn("relative inline-flex h-10 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className)}
      {...props}
    >
      {box && (
        <m.span
          data-slot="tabs-indicator"
          aria-hidden
          className="absolute top-1 bottom-1 left-0 rounded-md bg-background shadow-sm"
          initial={false}
          animate={{ x: box.x, width: box.width }}
          transition={{ type: "spring", stiffness: 500, damping: 36 }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />;
}
