/*
 * Source: shadcn/ui's Button (F3), with Motion's tap gesture (`whileTap`, https://motion.dev, `motion` 14.0.0, MIT) as
 * the press: kept as F3b's button (docs/client/v2-architecture.md, "Animated components: chosen sources").
 */
import type { ComponentProps } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import * as m from "motion/react-m";
import { cn } from "../../lib/utils";
import { SpinnerIcon } from "./icons";

export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (a link, a router link) with the button's look. Disabled or loading sets `aria-disabled` and `data-disabled` on it. */
    asChild?: boolean;
    /** Busy: shows a spinner, disables the button and sets `aria-busy`. */
    loading?: boolean;
  };

/** The press (section 3.2) is a `whileTap` scale of the `m` button; reduced motion is the app's `MotionConfig`. */
export function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={classes}
        aria-disabled={disabled || loading || undefined}
        aria-busy={loading || undefined}
        data-disabled={disabled || loading ? "" : undefined}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }
  // `m.button` types its drag and animation handlers apart from the DOM's: those four are not passed on.
  const { onDrag, onDragStart, onDragEnd, onAnimationStart, ...rest } = props;
  void [onDrag, onDragStart, onDragEnd, onAnimationStart];
  return (
    <m.button
      data-slot="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      {...rest}
    >
      {loading && <SpinnerIcon />}
      {children}
    </m.button>
  );
}
