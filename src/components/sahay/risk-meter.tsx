import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import type { RiskSnapshot } from "@/lib/sahay/models";
import { riskTone } from "@/lib/sahay/safety";
import { cn } from "@/lib/utils";

export function RiskMeter({
  risk,
  compact = false,
}: {
  risk: RiskSnapshot;
  compact?: boolean;
}) {
  const tone = riskTone(risk.level);
  const fill =
    tone === "success"
      ? "bg-primary shadow-glow"
      : tone === "warning"
        ? "bg-warning shadow-glow-amber"
        : "bg-danger shadow-glow-rose";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" />
          <p className="text-[10px] font-bold tracking-[0.14em] text-muted-fg uppercase font-mono">
            Telemetry Assessment
          </p>
        </div>
        <Badge tone={tone}>{risk.level}</Badge>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted border border-border/50">
        <div
          className={cn("h-full rounded-full transition-all duration-500", fill)}
          style={{ width: `${Math.max(4, risk.score)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-fg font-mono">
        <span>INDEX {risk.score} / 100</span>
        <span className="text-[10px] text-muted-fg/80">Rule-based total</span>
      </div>
      {compact ? (
        <Link to="/safety" className="text-[11px] font-medium text-secondary-fg hover:underline">
          Decisional logic & policy →
        </Link>
      ) : (
        <ul className="flex flex-col gap-1.5 pt-1">
          {risk.reasons.slice(0, 4).map((reason) => (
            <li key={reason} className="text-[11px] leading-4 text-muted-fg/90 flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}