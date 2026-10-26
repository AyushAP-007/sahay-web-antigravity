import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-[22px] items-center justify-center rounded-full px-2.5 text-[9px] font-bold tracking-[0.08em] uppercase font-mono border",
  {
    variants: {
      tone: {
        neutral: "bg-muted/80 text-muted-fg border-border/80",
        success: "bg-success-soft text-primary border-primary/30 shadow-glow",
        warning: "bg-warning-soft text-warning border-warning/30 shadow-glow-amber",
        danger: "bg-danger-soft text-danger border-danger/30 shadow-glow-rose",
        info: "bg-info-soft text-accent-fg border-accent-fg/30",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}