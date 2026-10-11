import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Phone, PhoneOff } from "lucide-react";
import { RequireUser } from "@/components/sahay/guard";
import { AppColumn, HelperText } from "@/components/sahay/ui";
import { Button } from "@/components/ui/button";
import { useSahay } from "@/lib/sahay/context";

export const Route = createFileRoute("/quiet-call")({ component: QuietCallPage });

function QuietCallPage() {
  return (
    <RequireUser>
      <QuietCallScreen />
    </RequireUser>
  );
}

function QuietCallScreen() {
  const { state } = useSahay();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const contact =
    state.settings.quietCallName.trim() ||
    state.contacts.find((item) => item.userId === state.user?.id && item.enabled)
      ?.name ||
    "Home";
  const initial = contact.trim().charAt(0).toUpperCase();

  useEffect(() => {
    if (!accepted) return;
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [accepted]);

  const clock = useMemo(() => {
    const minutes = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (elapsed % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [elapsed]);

  return (
    <AppColumn className="bg-bezel text-primary-fg">
      <div className="flex flex-1 flex-col items-center justify-between px-8 pt-16 pb-10">
        <div className="flex flex-col items-center gap-3 pt-8">
          <p className="text-[11px] font-bold tracking-[0.18em] text-inverse-muted">
            {accepted ? "ON A CALL · DEMO" : "INCOMING · DEMO"}
          </p>
          <span className="mt-4 flex size-24 items-center justify-center rounded-full bg-primary text-3xl font-semibold">
            {initial}
          </span>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em]">
            {contact}
          </h1>
          <p className="text-sm text-inverse-muted">
            {accepted ? clock : "Mobile · Quiet call"}
          </p>
          <HelperText>
            <span className="text-inverse-muted">
              This screen is only on your phone. No real call is placed.
            </span>
          </HelperText>
        </div>
        <div className="flex w-full flex-col gap-4">
          {accepted ? (
            <Button
              variant="danger"
              onClick={() => void navigate({ to: "/" })}
            >
              <PhoneOff className="size-4" />
              End quiet call
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => void navigate({ to: "/" })}
                className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-[22px] bg-danger text-danger-fg"
              >
                <PhoneOff className="size-6" />
                <span className="text-xs font-semibold">Decline</span>
              </button>
              <button
                type="button"
                data-testid="quiet-call-accept"
                onClick={() => setAccepted(true)}
                className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-[22px] bg-success text-primary-fg"
              >
                <Phone className="size-6" />
                <span className="text-xs font-semibold">Accept</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </AppColumn>
  );
}
