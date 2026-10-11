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
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : "bg-danger";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold tracking-[0.12em] text-muted-fg uppercase">
          Prototype risk
        </p>
        <Badge tone={tone}>{risk.level}</Badge>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-2 rounded-full transition-[width] duration-300", fill)}
          style={{ width: `${Math.max(4, risk.score)}%` }}
        />
      </div>
      <p className="text-[11px] tabular-nums text-muted-fg">
        Score {risk.score} / 100 · rule-based, not a trained model
      </p>
      {compact ? (
        <Link to="/safety" className="text-[11px] font-semibold text-primary">
          How this score is decided
        </Link>
      ) : (
        <ul className="flex flex-col gap-1">
          {risk.reasons.slice(0, 4).map((reason) => (
            <li key={reason} className="text-[11px] leading-4 text-muted-fg">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
