import { createFileRoute, Link } from "@tanstack/react-router";
import { Cpu, Info, Shield } from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { RiskMeter } from "@/components/sahay/risk-meter";
import { SahayShell } from "@/components/sahay/shell";
import { HelperText, Panel, SectionTitle } from "@/components/sahay/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSahay } from "@/lib/sahay/context";
import { chooseResponse, motionLabel, responseLabel } from "@/lib/sahay/safety";

export const Route = createFileRoute("/safety")({ component: SafetyPage });

function SafetyPage() {
  return (
    <RequireUser>
      <SafetyScreen />
    </RequireUser>
  );
}

function SafetyScreen() {
  const { state } = useSahay();
  const action = chooseResponse(
    state.currentRisk.level,
    state.settings.confirmBeforeEscalate,
  );

  return (
    <SahayShell
      title="Safety rules"
      subtitle="How this prototype scores risk and chooses a response."
      tabbed={false}
      backTo="/"
    >
      <Panel className="flex-row items-start gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-warning" />
        <HelperText>
          This is a rule-based demonstration, not a trained ML model. There is
          no dataset, accuracy claim, or live MPU6050 feed.
        </HelperText>
      </Panel>

      <Panel>
        <RiskMeter risk={state.currentRisk} />
      </Panel>

      <Panel className="gap-2">
        <SectionTitle title="Current inputs" />
        <Row label="Motion (simulated)" value={motionLabel(state.device.sensor.motionPattern)} />
        <Row
          label="Accel magnitude"
          value={`${state.device.sensor.accelMagnitude.toFixed(2)} g · demo`}
        />
        <Row label="Orientation" value={state.device.sensor.orientation} />
        <Row
          label="Phone location"
          value={state.location.available ? "Available" : "Unavailable"}
        />
        <Row
          label="Journey"
          value={
            state.journey?.status === "active"
              ? state.journey.destinationLabel
              : "Not watching"
          }
        />
        <Row
          label="Night boost"
          value={state.settings.nightRiskBoost ? "On" : "Off"}
        />
      </Panel>

      <Panel className="gap-3">
        <SectionTitle
          title="Response agent"
          action={<Badge tone="info">Deterministic</Badge>}
        />
        <p className="text-sm font-semibold text-fg">{responseLabel(action)}</p>
        <HelperText>
          Low observes. Medium asks if you are okay. High prepares a simulated
          alert after the confirmation window. Critical or TEST SOS records a
          simulated contact notification immediately.
        </HelperText>
        <div className="flex items-start gap-2.5 rounded-[13px] bg-muted p-3">
          <Cpu className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-[11px] leading-4 text-muted-fg">
            An LLM is not used for emergency decisions. The agent is a fixed
            table of rules so a presentation can explain every step.
          </p>
        </div>
      </Panel>

      <Panel className="gap-2">
        <SectionTitle title="Score bands" />
        <Row label="0–24" value="Low · observe" />
        <Row label="25–49" value="Medium · check-in" />
        <Row label="50–74" value="High · prepare alert" />
        <Row label="75–100" value="Critical · simulate notify" />
      </Panel>

      <Button asChild variant="secondary">
        <Link to="/device">
          <Shield className="size-4" />
          Simulate locket motion
        </Link>
      </Button>
    </SahayShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[36px] items-center justify-between gap-3 border-b border-border">
      <p className="text-[11px] text-muted-fg">{label}</p>
      <p className="text-right text-xs font-semibold text-fg">{value}</p>
    </div>
  );
}
