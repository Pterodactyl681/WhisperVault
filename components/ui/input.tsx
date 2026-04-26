import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-[rgba(96,118,168,0.24)] bg-[rgba(14,23,39,0.84)] px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/80 transition-all focus-visible:border-transparent focus-visible:bg-[linear-gradient(rgba(16,27,43,0.9),rgba(16,27,43,0.9))_padding-box,linear-gradient(92deg,#6F67D8_0%,#4ED7FF_100%)_border-box] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
