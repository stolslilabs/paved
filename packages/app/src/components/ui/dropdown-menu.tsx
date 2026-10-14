import type { ComponentProps } from "react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";
import { CheckIcon, ChevronRightIcon, DotIcon } from "./icons";

export function DropdownMenu(props: ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}
export function DropdownMenuTrigger(props: ComponentProps<typeof MenuPrimitive.Trigger>) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}
export function DropdownMenuGroup(props: ComponentProps<typeof MenuPrimitive.Group>) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}
export function DropdownMenuRadioGroup(props: ComponentProps<typeof MenuPrimitive.RadioGroup>) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}
export function DropdownMenuSub(props: ComponentProps<typeof MenuPrimitive.Sub>) {
  return <MenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

const surface =
  "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none";
const item =
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content data-slot="dropdown-menu-content" sideOffset={sideOffset} className={cn(surface, className)} {...props} />
    </MenuPrimitive.Portal>
  );
}
export function DropdownMenuItem({ className, inset, variant = "default", ...props }: ComponentProps<typeof MenuPrimitive.Item> & { inset?: boolean; variant?: "default" | "destructive" }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(item, inset && "pl-8", "data-[variant=destructive]:text-ember-300 data-[variant=destructive]:focus:bg-destructive data-[variant=destructive]:focus:text-destructive-foreground", className)}
      {...props}
    />
  );
}
export function DropdownMenuCheckboxItem({ className, children, checked, ...props }: ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem data-slot="dropdown-menu-checkbox-item" className={cn(item, "pl-8", className)} checked={checked} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <MenuPrimitive.ItemIndicator>
          <CheckIcon />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}
export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem data-slot="dropdown-menu-radio-item" className={cn(item, "pl-8", className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <MenuPrimitive.ItemIndicator>
          <DotIcon />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}
export function DropdownMenuLabel({ className, inset, ...props }: ComponentProps<typeof MenuPrimitive.Label> & { inset?: boolean }) {
  return <MenuPrimitive.Label data-slot="dropdown-menu-label" className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)} {...props} />;
}
export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
export function DropdownMenuShortcut({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="dropdown-menu-shortcut" className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />;
}
export function DropdownMenuSubTrigger({ className, inset, children, ...props }: ComponentProps<typeof MenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <MenuPrimitive.SubTrigger data-slot="dropdown-menu-sub-trigger" className={cn(item, "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground", inset && "pl-8", className)} {...props}>
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubTrigger>
  );
}
export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof MenuPrimitive.SubContent>) {
  return <MenuPrimitive.SubContent data-slot="dropdown-menu-sub-content" className={cn(surface, "shadow-lg", className)} {...props} />;
}
