import { Badge } from "@/components/ui/badge";
import type { RiskFactor, RiskSnapshot } from "@/lib/sahay/models";
import { signalSourceLabel } from "@/lib/sahay/safety";

export function RiskExplanation({ risk }: { risk: RiskSnapshot }) {
  const factors = risk.factors ?? [];
  const added = factors.filter((item) => item.points !== 0);
  const idle = factors.filter((item) => item.points === 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-5 text-fg">
        {risk.explanation ??
          `The score is ${risk.score} out of 100, in the ${risk.level} band. This is a rule total, not a probability of harm.`}
      </p>
      {added.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[9px] font-bold tracking-[0.14em] text-muted-fg">
            IN THE SCORE
          </p>
          {added.map((item) => (
            <FactorRow key={item.id} factor={item} />
          ))}
        </div>
      ) : null}
      {idle.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[9px] font-bold tracking-[0.14em] text-muted-fg">
            NOT ADDED
          </p>
          {idle.map((item) => (
            <FactorRow key={item.id} factor={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FactorRow({ factor }: { factor: RiskFactor }) {
  const points =
    factor.points > 0 ? `+${factor.points}` : factor.points === 0 ? "0" : String(factor.points);
  return (
    <div className="rounded-[13px] bg-muted px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-fg">{factor.label}</p>
        <span className="text-xs font-bold tabular-nums text-fg">{points}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Badge tone={factor.kind === "unavailable" ? "warning" : "neutral"}>
          {factor.kind === "unavailable" ? "Missing data" : signalSourceLabel(factor.source)}
        </Badge>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-muted-fg">{factor.detail}</p>
    </div>
  );
}
