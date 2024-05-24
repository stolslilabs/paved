import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/ui/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm  ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border-2 border-black/30 transform hover:scale-105 transition-all duration-200",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        command:
          " flex justify-center items-center  cursor-pointer text-secondary-foreground border-transparent bg-secondary/10 hover:bg-secondary/20",
        character:
          "border-transparent bg-secondary/10 flex justify-center items-center cursor-pointer hover:bg-secondary/20",
        character_selected:
          "bg-primary/20 border-2 border-primary flex justify-center items-center cursor-pointer text-secondary-foreground  ",
      },
      size: {
        default: "h-9 p-6",
        sm: "h-8 text-xs",
        lg: "h-10  p-8",
        icon: "h-9 w-9",
        character: "sm:h-8 sm:w-8 lg:h-16 lg:w-16",
        command: "sm:h-8 sm:w-8 lg:h-12 lg:w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
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
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
