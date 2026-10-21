import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FlaskConical, Pause, Play, RotateCcw } from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { RiskExplanation } from "@/components/sahay/risk-explanation";
import { SahayShell } from "@/components/sahay/shell";
import { HelperText, Panel, SectionTitle } from "@/components/sahay/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSahay } from "@/lib/sahay/context";
import { SCENARIOS, runScenario, type ScenarioId } from "@/lib/sahay/lab";
import { responseLabel } from "@/lib/sahay/safety";

export const Route = createFileRoute("/lab")({ component: LabPage });

function LabPage() {
  return (
    <RequireUser>
      <LabScreen />
    </RequireUser>
  );
}

function LabScreen() {
  const { state } = useSahay();
  const [scenarioId, setScenarioId] = useState<ScenarioId>("fall-no-response");
  const [confirm, setConfirm] = useState(true);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const report = useMemo(
    () => runScenario(scenarioId, { confirmBeforeEscalate: confirm }),
    [scenarioId, confirm],
  );
  const step = report.steps[Math.min(index, report.steps.length - 1)];

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIndex((current) => {
        if (current >= report.steps.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1600);
    return () => window.clearInterval(id);
  }, [playing, report.steps.length]);

  const choose = (id: ScenarioId) => {
    setScenarioId(id);
    setIndex(0);
    setPlaying(false);
  };

  return (
    <SahayShell
      title="Simulation Lab"
      subtitle="The same risk rules, on a clock that does not touch your profile."
      tabbed={false}
      backTo="/settings"
    >
      <Panel className="flex-row items-start gap-2.5">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" />
        <HelperText>
          Simulation mode. Every alert on this screen is labelled and stays
          here. Your history still has {state.events.length} saved event
          {state.events.length === 1 ? "" : "s"}. Contacts, journeys, and
          settings are not changed.
        </HelperText>
      </Panel>

      <div className="grid grid-cols-2 gap-2">
        {SCENARIOS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => choose(item.id)}
            className={`rounded-[16px] border p-3 text-left ${
              item.id === scenarioId ? "border-primary bg-secondary" : "border-border bg-card"
            }`}
          >
            <p className="text-xs font-semibold text-fg">{item.title}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-fg">{item.summary}</p>
          </button>
        ))}
      </div>

      <Panel className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle title={report.title} />
          <Badge tone="warning">Simulated</Badge>
        </div>
        <p className="text-[11px] leading-4 text-muted-fg">{report.summary}</p>
        <button
          type="button"
          onClick={() => {
            setConfirm((value) => !value);
            setIndex(0);
            setPlaying(false);
          }}
          className="text-left text-[11px] font-semibold text-primary"
        >
          Confirm before escalate: {confirm ? "On" : "Off"} · lab only
        </button>
        <div className="grid grid-cols-3 gap-2">
          <Button size="compact" onClick={() => setPlaying(true)} disabled={playing}>
            <Play className="size-4" />
            Play
          </Button>
          <Button size="compact" variant="secondary" onClick={() => setPlaying(false)}>
            <Pause className="size-4" />
            Pause
          </Button>
          <Button
            size="compact"
            variant="outline"
            onClick={() => {
              setIndex(0);
              setPlaying(false);
            }}
          >
            <RotateCcw className="size-4" />
            Reset
          </Button>
        </div>
      </Panel>

      {step ? (
        <Panel className="gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-fg">
              {step.atLabel} · {step.title}
            </p>
            <Badge tone="info">
              {index + 1}/{report.steps.length}
            </Badge>
          </div>
          <div className="flex flex-col gap-1.5">
            {step.signals.map((signal) => (
              <div key={`${signal.label}-${signal.value}`} className="flex items-start justify-between gap-3">
                <p className="text-[11px] text-muted-fg">
                  {signal.label}
                  <span className="block text-[10px]">{signal.source}</span>
                </p>
                <p className="text-right text-[11px] font-semibold text-fg">{signal.value}</p>
              </div>
            ))}
          </div>
          <RiskExplanation risk={step.risk} />
          <div className="rounded-[13px] bg-secondary p-3">
            <p className="text-[9px] font-bold tracking-[0.14em] text-secondary-fg">
              RESPONSE AGENT
            </p>
            <p className="mt-1 text-sm font-semibold text-fg">
              {responseLabel(step.decision.response)}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-fg">{step.decision.reason}</p>
          </div>
          <p className="text-[13px] leading-5 text-fg">{step.outcome}</p>
        </Panel>
      ) : null}

      <SectionTitle title="Timeline" />
      {report.steps.map((item, itemIndex) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            setIndex(itemIndex);
            setPlaying(false);
          }}
          className={`rounded-[16px] border p-3 text-left ${
            itemIndex === index ? "border-primary bg-card" : "border-border bg-card"
          }`}
        >
          <p className="text-[11px] font-semibold text-fg">
            {item.atLabel} · {item.title}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-fg">{item.outcome}</p>
        </button>
      ))}
    </SahayShell>
  );
}
