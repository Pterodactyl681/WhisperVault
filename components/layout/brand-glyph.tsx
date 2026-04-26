"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandGlyphProps {
  className?: string;
}

export function BrandGlyph({ className }: BrandGlyphProps) {
  return (
    <span
      className={cn(
        "inline-flex aspect-square h-24 w-24 items-center justify-center rounded-[1.7rem] border border-[rgba(96,118,168,0.28)] bg-[rgba(14,23,39,0.84)] backdrop-blur-[12px]",
        className
      )}
      aria-hidden="true"
    >
      <Image
        src="/whisper-logo-mark.png"
        alt=""
        width={56}
        height={36}
        className="h-16 w-20 object-contain"
        priority
      />
    </span>
  );
}
