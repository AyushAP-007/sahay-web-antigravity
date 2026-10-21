import type { ResponseAction, RiskLevel, RiskSnapshot } from "./models.ts";
import { incidentAction } from "./incidents.ts";
import { chooseResponse } from "./safety.ts";

export type AgentAction = "monitor" | "request_confirmation" | "escalate_simulated";

export interface AgentDecision {
  action: AgentAction;
  response: ResponseAction;
  reason: string;
  riskScore: number;
  riskLevel: RiskLevel;
}

/**
 * Bounded policy. It does not use an LLM. The same table drives the live
 * check-in rules and the Simulation Lab.
 */
export function decideResponse(input: {
  risk: RiskSnapshot;
  confirmBeforeEscalate: boolean;
  explicitHelp?: boolean;
  testSos?: boolean;
}): AgentDecision {
  const base = {
    riskScore: input.risk.score,
    riskLevel: input.risk.level,
  };
  if (input.testSos) {
    return {
      ...base,
      action: "escalate_simulated",
      response: "notify_contacts",
      reason:
        "TEST SOS is an explicit request. The rules record a simulated contact alert immediately. No SMS, call, or emergency service is contacted.",
    };
  }
  if (input.explicitHelp) {
    return {
      ...base,
      action: "escalate_simulated",
      response: "notify_contacts",
      reason:
        "You asked for help. The agent records one simulated alert for this incident. A timeout for the same check-in must not record a second one. No message is sent.",
    };
  }
  const policy = incidentAction(input.risk.level, input.confirmBeforeEscalate);
  const response = chooseResponse(input.risk.level, input.confirmBeforeEscalate);
  if (policy === "observe") {
    return {
      ...base,
      action: "monitor",
      response,
      reason: `The score is ${input.risk.score} (${input.risk.level}). Low risk stays on watch. No check-in is opened and no simulated alert is recorded.`,
    };
  }
  if (policy === "prompt") {
    return {
      ...base,
      action: "request_confirmation",
      response,
      reason:
        input.risk.level === "high"
          ? `The score is ${input.risk.score} (high). Confirmation is on, so Sahay asks if you are okay before a simulated alert.`
          : `The score is ${input.risk.score} (${input.risk.level}). Medium risk asks if you are okay before any simulated alert.`,
    };
  }
  return {
    ...base,
    action: "escalate_simulated",
    response,
    reason:
      input.risk.level === "critical"
        ? `The score is ${input.risk.score} (critical). Critical risk records a simulated alert immediately, even when confirmation is on. No message is sent.`
        : `The score is ${input.risk.score} (high) and confirmation is off, so a simulated alert is recorded without waiting. No message is sent.`,
  };
}
