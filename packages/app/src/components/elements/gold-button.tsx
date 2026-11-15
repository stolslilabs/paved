import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { GOLD_ACTION, GoldShine } from "./gold-action";

export interface GoldButtonProps extends Omit<ComponentProps<typeof Button>, "variant" | "style"> {
  /** The action on its way: the button waits. */
  busy?: boolean;
}

/**
 * A view's one main action: the app's gold pill (`GOLD_ACTION`, the drawers' Confirm and Deposit), 48 px tall, its light crossing it
 * while it can be pressed. One look for every main action of a feature: no other gold button stands beside it.
 */
export function GoldButton({ busy = false, disabled, className, children, ...props }: GoldButtonProps) {
  const off = disabled || busy;
  return (
    <Button variant="ghost" style={GOLD_ACTION} data-slot="gold-button" className={cn("relative h-12 shrink-0 px-4 text-lg font-black text-foreground", className)} disabled={off} aria-busy={busy || undefined} {...props}>
      {!off && <GoldShine />}
      {children}
    </Button>
  );
}
