import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Clock, Compass, Home, Navigation, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppColumn, BrandLockup, ScreenHeader, StorageBanner } from "./ui";

const TABS = [
  { to: "/", label: "Atlas", icon: Home, match: (path: string) => path === "/" },
  {
    to: "/journey",
    label: "Corridors",
    icon: Navigation,
    match: (path: string) => path.startsWith("/journey"),
  },
  {
    to: "/contacts",
    label: "Circle",
    icon: Users,
    match: (path: string) => path.startsWith("/contacts") || path.startsWith("/contact-edit"),
  },
  {
    to: "/history",
    label: "Chronicle",
    icon: Clock,
    match: (path: string) => path.startsWith("/history") || path.startsWith("/event"),
  },
  {
    to: "/settings",
    label: "Config",
    icon: Settings,
    match: (path: string) => path.startsWith("/settings"),
  },
] as const;

export function SahayShell({
  title,
  subtitle,
  rightAction,
  tabbed = true,
  backTo,
  children,
}: {
  title: string;
  subtitle?: string;
  rightAction?: ReactNode;
  tabbed?: boolean;
  backTo?: string;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <AppColumn>
      <div
        className={cn(
          "flex flex-1 flex-col gap-[18px] overflow-y-auto px-[20px] pt-7 pb-5 relative",
          !tabbed && "pb-8",
        )}
      >
        <BrandLockup rightAction={rightAction} />
        <ScreenHeader title={title} subtitle={subtitle} backTo={backTo} />
        <StorageBanner />
        {children}
      </div>
      {tabbed ? (
        <nav className="shrink-0 border-t border-border/80 bg-surface/90 px-2 py-1.5 backdrop-blur-md shadow-2xl">
          <div className="grid grid-cols-5 gap-1">
            {TABS.map((tab) => {
              const active = tab.match(pathname);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    "relative flex min-h-[50px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-all duration-200",
                    active
                      ? "text-primary bg-secondary/70 border border-primary/20 shadow-glow"
                      : "text-muted-fg hover:text-fg hover:bg-muted/40",
                  )}
                >
                  <Icon className="size-4" strokeWidth={active ? 2.5 : 1.8} />
                  <span className="font-mono tracking-tight">{tab.label}</span>
                  {active ? (
                    <span className="absolute -bottom-1 size-1 rounded-full bg-primary" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </AppColumn>
  );
}