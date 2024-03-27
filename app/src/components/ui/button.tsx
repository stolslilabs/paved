import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border-2 border-black/30 transform hover:scale-105 transition-all duration-200",
  {
    variants: {
      variant: {
        default:
          "bg-primary/40 text-primary-foreground shadow hover:bg-primary/40",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        command:
          "bg-slate-300 border-2 border-stone-500 flex justify-center items-center rounded-xl cursor-pointer text-secondary-foreground shadow-lg shadow-gray-400",
        character:
          "bg-slate-300 border-2 border-stone-500 flex justify-center items-center rounded-xl cursor-pointer text-secondary-foreground shadow-lg shadow-gray-400",
        character_selected:
          "bg-gray-500 border-2 border-stone-500 flex justify-center items-center rounded-xl cursor-pointer text-secondary-foreground shadow-lg shadow-gray-400",
      },
      size: {
        default: "h-9 p-6",
        sm: "h-8 rounded-md text-xs",
        lg: "h-10 rounded-md p-8",
        icon: "h-9 w-9",
        character: "h-24 w-24",
        command: "h-24 w-24",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
