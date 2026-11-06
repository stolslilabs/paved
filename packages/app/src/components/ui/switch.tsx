import type { ComponentProps } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * Off is the `input` track (3.11:1 on the page). On, by tone: `primary` with the thumb in `primary-foreground` (the default), or
 * `success` with the thumb kept in `foreground` (SETTINGS-PAGE: the Paved UX Book's green switch and its light knob).
 */
const switchVariants = cva(
  "state-layer peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=unchecked]:bg-input motion-reduce:transition-none",
  { variants: { tone: { primary: "data-[state=checked]:bg-primary", success: "data-[state=checked]:bg-success" } }, defaultVariants: { tone: "primary" } },
);
const thumbVariants = cva(
  "pointer-events-none block size-5 rounded-full bg-foreground shadow-sm transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5 motion-reduce:transition-none",
  { variants: { tone: { primary: "data-[state=checked]:bg-primary-foreground", success: "" } }, defaultVariants: { tone: "primary" } },
);

export function Switch({ className, tone, ...props }: ComponentProps<typeof SwitchPrimitive.Root> & VariantProps<typeof switchVariants>) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn(switchVariants({ tone }), className)} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className={thumbVariants({ tone })} />
    </SwitchPrimitive.Root>
  );
}
