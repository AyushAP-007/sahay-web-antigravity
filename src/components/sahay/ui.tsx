import type { ComponentProps, ComponentType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronLeft, Compass, LoaderCircle, Shield } from "lucide-react";
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
    <div className={cn("flex h-full min-h-full flex-col bg-bg text-fg", className)}>
      {children}
    </div>
  );
}

export function BrandLockup({ rightAction }: { rightAction?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between border-b border-border/40 pb-2">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-[9px] bg-secondary text-primary border border-primary/25 shadow-glow">
          <Compass className="size-4 animate-[spin_12s_linear_infinite]" strokeWidth={2.2} />
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold tracking-[0.2em] text-fg uppercase font-mono">
            SAHAY
          </span>
          <span className="size-1 rounded-full bg-primary animate-pulse" />
          <span className="text-[9px] font-mono tracking-[0.14em] text-muted-fg uppercase">
            NIGHT ATLAS
          </span>
        </div>
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
          className="mb-1 inline-flex min-h-9 w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-secondary-fg bg-secondary/60 hover:bg-secondary border border-border/50 transition-colors"
        >
          <ChevronLeft className="size-3.5" />
          Back
        </Link>
      ) : null}
      <h1 className="font-display text-[1.65rem] leading-tight font-semibold tracking-[-0.03em] text-fg">
        {title}
      </h1>
      {subtitle ? (
        <p className="text-[13px] leading-relaxed text-muted-fg">{subtitle}</p>
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
        "flex flex-col gap-3 rounded-[20px] border border-border/80 bg-card/90 p-4 shadow-soft backdrop-blur-md relative overflow-hidden",
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
    <div className="flex min-h-[30px] items-center justify-between gap-2.5 pt-1">
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-primary" />
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-fg uppercase font-mono">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function HelperText({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-normal text-muted-fg">{children}</p>;
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
    <div className="flex flex-col items-center gap-2.5 px-[18px] py-8 text-center rounded-2xl border border-dashed border-border/60 bg-muted/20">
      <span className="flex size-[48px] items-center justify-center rounded-2xl bg-secondary/80 text-primary border border-primary/20 shadow-glow">
        <Icon className="size-[22px]" />
      </span>
      <p className="text-[14px] font-semibold text-fg tracking-tight">{title}</p>
      <p className="max-w-[260px] text-[12px] leading-normal text-muted-fg">{detail}</p>
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
      <Label className="text-[12px] font-medium text-fg/80">{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={error ? "border-danger ring-1 ring-danger/30" : undefined}
        {...inputProps}
      />
      {error ? <p className="text-[11px] font-medium text-danger">{error}</p> : null}
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
        "flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/60",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OpeningScreen({ message = "Calibrating Night Atlas…" }: { message?: string }) {
  return (
    <AppColumn className="items-center justify-center gap-3 bg-bg">
      <div className="relative flex items-center justify-center">
        <LoaderCircle className="size-8 animate-spin text-primary" />
        <span className="absolute size-2 rounded-full bg-primary shadow-glow" />
      </div>
      <p className="text-[12px] font-mono tracking-wider uppercase text-muted-fg">{message}</p>
    </AppColumn>
  );
}

export function StorageBanner() {
  const { storageError } = useSahay();
  if (!storageError) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft p-3 text-danger shadow-glow-rose">
      <p className="flex-1 text-[12px] font-medium leading-tight">{storageError}</p>
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
      className="relative flex size-9 items-center justify-center rounded-xl bg-muted/60 border border-border/60 text-fg hover:text-primary hover:border-primary/40 transition-colors"
    >
      <Bell className="size-4" />
      {unread > 0 ? (
        <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger ring-2 ring-card shadow-glow-rose" />
      ) : null}
    </Link>
  );
}