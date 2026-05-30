import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 rounded-xl text-center text-sm font-medium leading-snug whitespace-normal transition-all duration-200 transform-gpu hover:scale-[1.01] active:scale-[0.99] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:border disabled:border-slate-700 disabled:bg-slate-800/70 disabled:text-slate-400 disabled:opacity-55 disabled:shadow-none",
  {
    variants: {
      variant: {
        default:
          "border border-violet-300/35 bg-[linear-gradient(135deg,#7C3AED_0%,#4F46E5_100%)] text-white shadow-[0_14px_34px_rgba(91,33,182,0.24)] hover:border-violet-200/55 hover:brightness-[1.06] active:brightness-95",
        secondary:
          "border border-slate-700/70 bg-slate-950/50 text-slate-200 backdrop-blur-[12px] hover:border-violet-300/35 hover:bg-slate-900/80",
        outline:
          "border border-slate-700/70 bg-[#06111f]/70 text-slate-200 hover:border-violet-300/40 hover:bg-slate-900/75",
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
