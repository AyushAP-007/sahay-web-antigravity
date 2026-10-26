import type { ReactNode } from "react";
import { CheckInHost } from "./check-in";
import { HangingLocket, LocketMark } from "./locket";

export function SahayScene({ children }: { children: ReactNode }) {
  return (
    <div className="sahay-scene">
      <aside className="sahay-story">
        <div className="flex items-center gap-3">
          <LocketMark className="size-12 shadow-glow" />
          <div>
            <p className="text-[10px] font-mono font-bold tracking-[0.25em] text-primary uppercase">
              SAHAY SENTINEL
            </p>
            <p className="text-xs text-muted-fg font-mono">EDITION 2.0 · NIGHT ATLAS</p>
          </div>
        </div>
        
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-[-0.03em] text-fg leading-tight">
          Quiet protection,<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary-fg">
            close at hand.
          </span>
        </h1>

        <p className="max-w-sm text-[14px] leading-relaxed text-muted-fg">
          A tactile safety companion engineered for Indian cities after dusk. 
          Real-time corridor assessment, trusted circle sync, verified open help points, 
          and calm, rule-based intelligence.
        </p>

        <div className="flex items-center gap-4 pt-1 text-[11px] font-mono text-muted-fg border-t border-border/40">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            <span>PUNE CORRIDOR</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent-fg" />
            <span>TIME-AWARE</span>
          </div>
        </div>

        <HangingLocket className="mt-2 h-52 w-40 opacity-95 filter drop-shadow-[0_10px_20px_rgba(16,185,129,0.15)]" />
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