import type { ReactNode } from "react";
import { CheckInHost } from "./check-in";
import { HangingLocket, LocketMark } from "./locket";

export function SahayScene({ children }: { children: ReactNode }) {
  return (
    <div className="sahay-scene">
      <aside className="sahay-story">
        <LocketMark className="size-14 rounded-2xl shadow-[var(--shadow-border)]" />
        <p className="text-xs font-bold tracking-[0.28em] text-primary">SAHAY</p>
        <h1 className="font-display text-5xl font-semibold tracking-[-0.04em] text-fg">
          Quiet protection, close at hand.
        </h1>
        <p className="max-w-sm text-base leading-relaxed text-secondary-fg">
          A software prototype for a future safety locket — phone location,
          trusted people, Safe Journey, and honest demo intelligence.
        </p>
        <HangingLocket className="mt-4 h-56 w-44 opacity-90" />
      </aside>
      <div className="sahay-phone" data-testid="sahay-phone">
        <div className="sahay-island" />
        <div className="sahay-phone-screen">
          {children}
          <CheckInHost />
        </div>
      </div>
    </div>
  );
}
