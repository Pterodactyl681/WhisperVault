"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";

const TAB_ROUTES = ["/", "/create", "/inbox"] as const;

const isTabRoute = (pathname: string): boolean => TAB_ROUTES.includes(pathname as (typeof TAB_ROUTES)[number]);

const getTabIndex = (pathname: string): number => TAB_ROUTES.findIndex((route) => route === pathname);

export function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);

  const direction = useMemo<"forward" | "backward">(() => {
    const previousPath = previousPathRef.current;

    if (!isTabRoute(pathname) || !isTabRoute(previousPath)) {
      return "forward";
    }

    return getTabIndex(pathname) >= getTabIndex(previousPath) ? "forward" : "backward";
  }, [pathname]);

  useEffect(() => {
    previousPathRef.current = pathname;
  }, [pathname]);

  return (
    <div
      key={pathname}
      data-tab-direction={direction}
      className={isTabRoute(pathname) ? "tab-content-transition" : undefined}
    >
      {children}
    </div>
  );
}
