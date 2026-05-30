import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[110px] w-full rounded-xl border border-slate-700/70 bg-[#06111f]/80 px-3 py-2 text-sm text-slate-100 ring-offset-background placeholder:text-slate-500 transition-all focus-visible:border-violet-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/20 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/45 disabled:text-slate-500 disabled:opacity-100 [color-scheme:dark]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
