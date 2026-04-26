import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 rounded-xl text-center text-sm font-medium leading-snug whitespace-normal transition-all duration-200 transform-gpu hover:scale-[1.02] hover:ring-1 hover:ring-ring/35 active:scale-[1.02] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border border-[rgba(124,156,228,0.38)] bg-[linear-gradient(92deg,#7F79FF_0%,#4ED7FF_100%)] text-primary-foreground hover:brightness-[1.08] active:brightness-95",
        secondary:
          "border border-[rgba(124,156,228,0.3)] bg-[rgba(20,35,58,0.9)] text-secondary-foreground backdrop-blur-[12px] hover:border-[rgba(141,169,228,0.52)] hover:bg-[rgba(24,44,72,0.96)]",
        outline:
          "border border-[rgba(124,156,228,0.3)] bg-[rgba(13,24,42,0.6)] text-foreground hover:border-[rgba(141,169,228,0.52)] hover:bg-[rgba(18,34,56,0.82)]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "min-h-10 px-4 py-2.5",
        sm: "min-h-9 px-3 py-2",
        lg: "min-h-11 px-8 py-3",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
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

    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
