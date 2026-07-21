import {
  DEFAULT_POLICY,
  evaluateEmailAction,
  type EmailAction,
  type EvaluationResult,
  type GovernancePolicy,
} from "./governance.ts";

export type EmailDeliveryReceipt = {
  provider: "gmail";
  messageId: string;
  threadId?: string;
  acceptedAt: string;
};

export interface EmailProvider {
  send(action: EmailAction): Promise<EmailDeliveryReceipt>;
}

export type GatewayStatus =
  | "executed"
  | "pending_approval"
  | "blocked"
  | "provider_error";

export type GatewayResult = {
  executionId: string;
  actorId: string;
  agentId: string;
  status: GatewayStatus;
  evaluation: EvaluationResult;
  receipt: EmailDeliveryReceipt | null;
  error: string | null;
};

export type GatewayContext = {
  actorId: string;
  agentId: string;
  policy?: GovernancePolicy;
  now?: () => Date;
  id?: () => string;
};

function defaultId(): string {
  return `exec_${crypto.randomUUID()}`;
}

function safeProviderError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return "The email provider timed out.";
  }
  return "The email provider could not complete the governed action.";
}

export async function executeEmailThroughGateway(
  action: EmailAction,
  provider: EmailProvider,
  context: GatewayContext,
): Promise<GatewayResult> {
  const now = context.now ?? (() => new Date());
  const id = context.id ?? defaultId;
  const evaluation = evaluateEmailAction(
    action,
    context.policy ?? DEFAULT_POLICY,
    now().toISOString(),
  );
  const base = {
    executionId: id(),
    actorId: context.actorId,
    agentId: context.agentId,
    evaluation,
  };

  if (evaluation.decision === "block") {
    return {
      ...base,
      status: "blocked",
      receipt: null,
      error: null,
    };
  }

  if (evaluation.decision === "require_approval") {
    return {
      ...base,
      status: "pending_approval",
      receipt: null,
      error: null,
    };
  }

  try {
    const receipt = await provider.send(evaluation.sanitized);
    return {
      ...base,
      status: "executed",
      receipt,
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      status: "provider_error",
      receipt: null,
      error: safeProviderError(error),
    };
  }
}

export async function executeApprovedEmail(
  evaluation: EvaluationResult,
  provider: EmailProvider,
  context: Omit<GatewayContext, "policy">,
): Promise<GatewayResult> {
  if (evaluation.decision !== "require_approval") {
    throw new Error("Only actions awaiting approval may use this execution path.");
  }

  const id = context.id ?? defaultId;
  const base = {
    executionId: id(),
    actorId: context.actorId,
    agentId: context.agentId,
    evaluation,
  };

  try {
    const receipt = await provider.send(evaluation.sanitized);
    return {
      ...base,
      status: "executed",
      receipt,
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      status: "provider_error",
      receipt: null,
      error: safeProviderError(error),
    };
  }
}
