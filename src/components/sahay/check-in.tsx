import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSahay } from "@/lib/sahay/context";
import { eventLabel } from "@/lib/sahay/safety";

export function CheckInHost() {
  const { state, confirmCheckIn } = useSahay();
  const navigate = useNavigate();
  const pending = state.pendingCheckIn;
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [pending]);

  if (!pending || !state.user) return null;

  const remaining = Math.max(
    0,
    Math.ceil((new Date(pending.expiresAt).getTime() - now) / 1000),
  );

  const onOk = async () => {
    setBusy(true);
    try {
      await confirmCheckIn(true);
    } finally {
      setBusy(false);
    }
  };

  const onHelp = async () => {
    setBusy(true);
    try {
      const event = await confirmCheckIn(false);
      if (event) await navigate({ to: "/event/$id", params: { id: event.id } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-fg/35 p-4">
      <div className="w-full rounded-[22px] bg-card p-5 shadow-[var(--shadow-border)]">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-warning-soft text-warning">
            <ShieldAlert className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg">Are you okay?</p>
            <p className="text-[11px] text-muted-fg">
              {pending.eventType === "CHECKIN_TIMEOUT"
                ? "Motion check-in"
                : eventLabel(pending.eventType)}{" "}
              · demo
            </p>
          </div>
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold tabular-nums text-warning">
            {remaining}s
          </span>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-muted-fg">
          {pending.reason} If you do not respond, Sahay records a simulated
          alert. No SMS or call is sent.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            data-testid="checkin-ok"
            onClick={() => void onOk()}
          >
            I am okay
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            data-testid="checkin-help"
            onClick={() => void onHelp()}
          >
            I need help
          </Button>
        </div>
      </div>
    </div>
  );
}
