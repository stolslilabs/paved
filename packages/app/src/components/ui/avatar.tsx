import type { ComponentProps } from "react";
import { Avatar as AvatarPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";

export function Avatar({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Root>) {
  return <AvatarPrimitive.Root data-slot="avatar" className={cn("relative flex size-10 shrink-0 overflow-hidden rounded-full", className)} {...props} />;
}
export function AvatarImage({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image data-slot="avatar-image" className={cn("aspect-square size-full", className)} {...props} />;
}
export function AvatarFallback({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return <AvatarPrimitive.Fallback data-slot="avatar-fallback" className={cn("flex size-full items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground", className)} {...props} />;
}
