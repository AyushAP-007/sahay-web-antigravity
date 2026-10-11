import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Clock, Home, Navigation, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppColumn, BrandLockup, ScreenHeader, StorageBanner } from "./ui";

const TABS = [
  { to: "/", label: "Home", icon: Home, match: (path: string) => path === "/" },
  {
    to: "/journey",
    label: "Journey",
    icon: Navigation,
    match: (path: string) => path.startsWith("/journey"),
  },
  {
    to: "/contacts",
    label: "Contacts",
    icon: Users,
    match: (path: string) => path.startsWith("/contacts") || path.startsWith("/contact-edit"),
  },
  {
    to: "/history",
    label: "History",
    icon: Clock,
    match: (path: string) => path.startsWith("/history") || path.startsWith("/event"),
  },
  {
    to: "/settings",
    label: "Settings",
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
          "flex flex-1 flex-col gap-[18px] overflow-y-auto px-[22px] pt-8 pb-5",
          !tabbed && "pb-8",
        )}
      >
        <BrandLockup rightAction={rightAction} />
        <ScreenHeader title={title} subtitle={subtitle} backTo={backTo} />
        <StorageBanner />
        {children}
      </div>
      {tabbed ? (
        <nav className="shrink-0 border-t border-border bg-card/95 pb-2 backdrop-blur-sm">
          <div className="grid grid-cols-5 px-1 pt-1.5">
            {TABS.map((tab) => {
              const active = tab.match(pathname);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium",
                    active ? "text-primary" : "text-muted-fg",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 1.9} />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </AppColumn>
  );
}
