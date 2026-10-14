import { createContext, useContext, type ComponentProps } from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

export const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        // `input` (3.11:1) is the border: a choice's edges must be findable.
        outline: "border border-input bg-transparent",
      },
      size: { default: "h-10 min-w-10 px-3", sm: "h-8 min-w-8 px-2", lg: "h-12 min-w-12 px-4" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type Variants = VariantProps<typeof toggleVariants>;
const GroupContext = createContext<Variants>({});

/** The mockups' Low / Medium / High and Easy / Medium / Hard: one choice of a few, with the arrow keys. */
export function ToggleGroup({ className, variant, size, children, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root> & Variants) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      className={cn("flex w-fit items-center rounded-md", variant === "outline" && "shadow-xs", className)}
      {...props}
    >
      <GroupContext.Provider value={{ variant, size }}>{children}</GroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

export function ToggleGroupItem({ className, variant, size, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Item> & Variants) {
  const ctx = useContext(GroupContext);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleVariants({ variant: ctx.variant ?? variant, size: ctx.size ?? size }), "rounded-none first:rounded-l-md last:rounded-r-md data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l", className)}
      data-variant={ctx.variant ?? variant}
      {...props}
    />
  );
}
