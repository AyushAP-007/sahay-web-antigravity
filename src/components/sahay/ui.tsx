import type { ComponentProps, ComponentType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronLeft, LoaderCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSahay } from "@/lib/sahay/context";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function AppColumn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-full flex-col bg-bg", className)}>
      {children}
    </div>
  );
}

export function BrandLockup({ rightAction }: { rightAction?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-[9px] bg-primary text-primary-fg">
          <Shield className="size-4" strokeWidth={2.2} />
        </span>
        <span className="text-xs font-bold tracking-[0.16em] text-primary">
          SAHAY
        </span>
        <span className="ml-0.5 size-1.5 rounded-full bg-warning" />
        <span className="text-[9px] font-bold tracking-[0.12em] text-muted-fg">
          DEMO
        </span>
      </div>
      {rightAction}
    </div>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  backTo,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {backTo ? (
        <Link
          to={backTo}
          className="mb-1 inline-flex min-h-10 w-fit items-center gap-1 text-[13px] font-semibold text-primary"
        >
          <ChevronLeft className="size-4" />
          Back
        </Link>
      ) : null}
      <h1 className="font-display text-[1.7rem] leading-tight font-bold tracking-[-0.03em] text-fg">
        {title}
      </h1>
      {subtitle ? (
        <p className="text-sm leading-relaxed text-muted-fg">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-[18px] border border-border bg-card p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[30px] items-center justify-between gap-2.5">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-fg">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function HelperText({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-normal text-muted-fg">{children}</p>;
}

export function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-[18px] py-6 text-center">
      <span className="mb-0.5 flex size-[46px] items-center justify-center rounded-2xl bg-secondary text-primary">
        <Icon className="size-[21px]" />
      </span>
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      <p className="max-w-[270px] text-xs leading-normal text-muted-fg">{detail}</p>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  error,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={error ? "border-danger" : undefined}
        {...inputProps}
      />
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}

export function StatusIcon({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OpeningScreen({ message = "Opening Sahay…" }: { message?: string }) {
  return (
    <AppColumn className="items-center justify-center gap-3">
      <LoaderCircle className="size-6 animate-spin text-primary" />
      <p className="text-[13px] font-medium text-muted-fg">{message}</p>
    </AppColumn>
  );
}

export function StorageBanner() {
  const { storageError } = useSahay();
  if (!storageError) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-danger bg-danger-soft p-3 text-danger">
      <p className="flex-1 text-xs font-medium leading-tight">{storageError}</p>
    </div>
  );
}

export function ActivityButton() {
  const { state } = useSahay();
  const unread = state.notifications.filter(
    (item) => item.userId === state.user?.id && !item.read,
  ).length;
  return (
    <Link
      to="/notifications"
      aria-label="Open activity"
      className="relative flex size-10 items-center justify-center text-fg"
    >
      <Bell className="size-5" />
      {unread > 0 ? (
        <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger" />
      ) : null}
    </Link>
  );
}
