import type { ComponentType } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Ban,
  Battery,
  BatteryCharging,
  Clock,
  Code,
  Cpu,
  Crosshair,
  Info,
  Link as LinkIcon,
  MapPin,
  Radio,
  Watch,
} from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { RiskMeter } from "@/components/sahay/risk-meter";
import { SahayShell } from "@/components/sahay/shell";
import { HelperText, Panel, SectionTitle, StatusIcon } from "@/components/sahay/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSahay } from "@/lib/sahay/context";
import type { MotionPattern } from "@/lib/sahay/models";
import { motionLabel } from "@/lib/sahay/safety";
import { formatSahayDate } from "@/lib/sahay/services";

export const Route = createFileRoute("/device")({ component: DevicePage });

const MOTION_OPTIONS: MotionPattern[] = [
  "idle",
  "walking",
  "running",
  "sudden_stop",
  "fall",
  "impact",
  "struggle",
];

function DevicePage() {
  return (
    <RequireUser>
      <DeviceScreen />
    </RequireUser>
  );
}

function DeviceScreen() {
  const { state, simulateConnection, simulateBattery, simulateGps, simulateMotion } =
    useSahay();
  const { device } = state;
  const batteryTone =
    device.battery <= 20 ? "danger" : device.battery <= 40 ? "warning" : "success";

  return (
    <SahayShell
      title="Device status"
      subtitle="Demo locket — ESP32 is not paired."
      tabbed={false}
      backTo="/"
    >
      <div className="flex items-center gap-2.5 rounded-[13px] bg-warning-soft p-3">
        <Cpu className="size-4 shrink-0 text-warning" />
        <p className="flex-1 text-xs font-semibold leading-[1.5] text-warning">
          Simulation Mode — Physical locket not connected.
        </p>
      </div>

      <Panel className="gap-3.5">
        <div className="mb-0.5 flex items-center gap-2.5">
          <StatusIcon className="size-[43px] rounded-[14px] bg-secondary text-primary">
            <Watch className="size-5" />
          </StatusIcon>
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg">Sahay safety locket</p>
            <p className="text-[11px] text-muted-fg">{device.id}</p>
          </div>
          <Badge tone="info" className="shrink-0 whitespace-nowrap">
            Demo
          </Badge>
        </div>
        <div className="flex flex-col gap-2.5 rounded-[13px] bg-muted p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-fg">Battery</p>
            <Badge tone={batteryTone}>{device.battery}%</Badge>
          </div>
          <div className="h-2 overflow-hidden rounded-[5px] bg-border">
            <div
              className={`h-2 rounded-[5px] ${device.battery <= 20 ? "bg-danger" : "bg-primary"}`}
              style={{ width: `${device.battery}%` }}
            />
          </div>
        </div>
        <StatusLine
          icon={LinkIcon}
          label="Connection"
          value={
            device.connectionStatus === "connected"
              ? "Connected · simulated"
              : "Disconnected"
          }
          tone={device.connectionStatus === "connected" ? "success" : "warning"}
        />
        <StatusLine
          icon={MapPin}
          label="Device GPS"
          value={`${device.gpsStatus} · simulated`}
          tone={device.gpsStatus === "available" ? "success" : "warning"}
        />
        <StatusLine
          icon={Radio}
          label="Communication"
          value={`${device.communicationStatus} · simulated`}
          tone={device.communicationStatus === "online" ? "success" : "warning"}
        />
        <StatusLine
          icon={Clock}
          label="Last seen"
          value={
            device.lastSeen
              ? formatSahayDate(device.lastSeen)
              : "Not seen in this demo"
          }
        />
        <StatusLine icon={Code} label="Firmware" value={device.firmwareVersion} />
      </Panel>

      <Panel className="gap-3">
        <SectionTitle title="Simulated motion" />
        <HelperText>
          These patterns stand in for MPU6050 samples. They feed the prototype
          risk rules. They are not live sensor data.
        </HelperText>
        <div className="flex items-center justify-between rounded-[13px] bg-muted px-3 py-2.5">
          <p className="text-xs font-semibold text-fg">
            {motionLabel(device.sensor.motionPattern)}
          </p>
          <p className="text-[11px] tabular-nums text-muted-fg">
            {device.sensor.accelMagnitude.toFixed(2)} g · {device.sensor.orientation}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MOTION_OPTIONS.map((pattern) => (
            <Button
              key={pattern}
              size="compact"
              variant={
                device.sensor.motionPattern === pattern ? "default" : "outline"
              }
              data-testid={`motion-${pattern}`}
              onClick={() => simulateMotion(pattern)}
            >
              {motionLabel(pattern)}
            </Button>
          ))}
        </div>
      </Panel>

      <Panel>
        <RiskMeter risk={state.currentRisk} compact />
      </Panel>

      <Panel>
        <SectionTitle title="Demonstration controls" />
        <HelperText>
          These controls change only the local sample status shown in Sahay.
        </HelperText>
        <p className="mt-1 text-xs font-semibold text-fg">Connection</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="compact"
            variant="secondary"
            onClick={() => simulateConnection("connected")}
          >
            <LinkIcon className="size-4" />
            Simulate connected
          </Button>
          <Button
            size="compact"
            variant="outline"
            onClick={() => simulateConnection("disconnected")}
          >
            <Ban className="size-4" />
            Simulate disconnected
          </Button>
        </div>
        <p className="text-xs font-semibold text-fg">Battery</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="compact"
            variant="outline"
            onClick={() => simulateBattery(true)}
          >
            <BatteryCharging className="size-4" />
            Simulate low
          </Button>
          <Button
            size="compact"
            variant="secondary"
            onClick={() => simulateBattery(false)}
          >
            <Battery className="size-4" />
            Restore demo battery
          </Button>
        </div>
        <p className="text-xs font-semibold text-fg">Device GPS</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="compact"
            variant="outline"
            onClick={() => simulateGps(false)}
          >
            <MapPin className="size-4" />
            GPS unavailable
          </Button>
          <Button
            size="compact"
            variant="secondary"
            onClick={() => simulateGps(true)}
          >
            <Crosshair className="size-4" />
            GPS available
          </Button>
        </div>
      </Panel>

      <Panel className="flex-row items-start gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <HelperText>
          Phone location on the Location screen is real browser location when
          permission is granted. It is separate from these simulated locket
          values.
        </HelperText>
      </Panel>
      <Link
        to="/safety"
        className="flex items-center justify-center gap-1 self-center py-1.5 text-xs font-semibold text-primary"
      >
        Open safety rules
        <ArrowUpRight className="size-3.5" />
      </Link>
    </SahayShell>
  );
}

function StatusLine({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="flex min-h-[37px] items-center gap-2 border-b border-border">
      <Icon className="size-3.5 text-muted-fg" />
      <p className="w-[83px] text-[11px] text-muted-fg">{label}</p>
      <p className="flex-1 text-right text-[11px] font-medium text-fg">{value}</p>
      {tone ? (
        <span
          className={`size-1.5 rounded-full ${tone === "success" ? "bg-success" : "bg-warning"}`}
        />
      ) : null}
    </div>
  );
}
