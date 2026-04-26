import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-snug tracking-wide backdrop-blur transition-colors",
  {
    variants: {
      variant: {
        default: "border-[#4ED7FF]/40 bg-[#4ED7FF]/10 text-[#8BE5FF]",
        secondary: "border-[#8FA0B9]/34 bg-[#8FA0B9]/10 text-[#A7B5CA]",
        outline: "border-[#8FA0B9]/28 bg-[rgba(14,23,39,0.7)] text-[#A7B5CA]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
