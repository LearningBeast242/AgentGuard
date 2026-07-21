import {
  addRunStep,
  claimAgentRunApproval,
  createAgentRun,
  getAgent,
  getAgentRun,
  listRunSteps,
  recordAuditOutcome,
  recordAuditStart,
  updateAgentRun,
  type StoredAgentRun,
} from "../db/agentguard.ts";
import {
  executeApprovedEmail,
  executeEmailThroughGateway,
  type EmailProvider,
  type GatewayResult,
} from "./gateway.ts";
import { GmailEmailProvider } from "./gmail-provider.ts";
import { runModelTurn, toolResultPrompt } from "./agent-runtime.ts";
import { evaluateEmailAction, policyFromAgentSpec } from "./governance.ts";

export type AgentRunEnvelope = {
  run: StoredAgentRun;
  steps: Awaited<ReturnType<typeof listRunSteps>>;
};

type RuntimeCredentials = {
  openAIApiKey: string | null;
  openRouterApiKey: string | null;
  openRouterModel: string;
  gmailAccessToken: string | null;
};

function providerFor(gmailAccessToken: string | null): EmailProvider {
  if (gmailAccessToken) {
    return new GmailEmailProvider({ accessToken: gmailAccessToken });
  }
  return {
    async send() {
      throw new Error("GMAIL_ACCESS_TOKEN is not configured.");
    },
  };
}

async function envelope(
  ownerId: string,
  runId: string,
): Promise<AgentRunEnvelope> {
  const run = await getAgentRun(ownerId, runId);
  if (!run) throw new Error("Agent run was not found.");
  return { run, steps: await listRunSteps(runId) };
}

async function finalModelResponse({
  agent,
  task,
  result,
  credentials,
  timeoutMs,
}: {
  agent: NonNullable<Awaited<ReturnType<typeof getAgent>>>;
  task: string;
  result: GatewayResult;
  credentials: RuntimeCredentials;
  timeoutMs: number;
}) {
  return runModelTurn({
    spec: agent,
    input: toolResultPrompt({
      task,
      status: result.status,
      summary: result.evaluation.summary,
    }),
    openAIApiKey: credentials.openAIApiKey,
    openRouterApiKey: credentials.openRouterApiKey,
    openRouterModel: credentials.openRouterModel,
    allowTools: false,
    timeoutMs,
  });
}

export async function startAgentRun({
  ownerId,
  agentId,
  task,
  deliveryMode,
  credentials,
}: {
  ownerId: string;
  agentId: string;
  task: string;
  deliveryMode: StoredAgentRun["deliveryMode"];
  credentials: RuntimeCredentials;
}): Promise<AgentRunEnvelope> {
  const agent = await getAgent(ownerId, agentId);
  if (!agent) throw new Error("Agent was not found in this workspace.");
  const timeoutMs = 60_000;
  const run = await createAgentRun({
    ownerId,
    agentId,
    task,
    deliveryMode,
  });

  try {
    const decision = await runModelTurn({
      spec: agent,
      input: task,
      openAIApiKey: credentials.openAIApiKey,
      openRouterApiKey: credentials.openRouterApiKey,
      openRouterModel: credentials.openRouterModel,
      timeoutMs,
    });
    await addRunStep({
      runId: run.id,
      stepIndex: 1,
      kind: "model",
      label: "GPT-5.6 reasoning",
      status: decision.type === "tool_call" ? "tool_proposed" : "completed",
      input: { task },
      output:
        decision.type === "tool_call"
          ? { tool: decision.tool, action: decision.action }
          : {
              text: decision.text,
              citations: decision.citations,
              webSearchRequests: decision.webSearchRequests,
            },
    });

    if (decision.type === "final") {
      await updateAgentRun({
        ownerId,
        runId: run.id,
        status: "completed",
        provider: decision.provider,
        model: decision.model,
        finalOutput: decision.text,
      });
      return envelope(ownerId, run.id);
    }

    const executionId = `exec_${run.id}`;
    const policy = policyFromAgentSpec(agent);
    const context = {
      actorId: ownerId,
      agentId,
      id: () => executionId,
      policy,
    };
    const evaluation = evaluateEmailAction(decision.action, policy);
    const provider = providerFor(credentials.gmailAccessToken);
    await recordAuditStart({
      id: executionId,
      actorId: ownerId,
      agentId,
      evaluation,
    });
    const preliminary = await executeEmailThroughGateway(
      decision.action,
      provider,
      context,
    );
    await recordAuditOutcome(preliminary);
    await addRunStep({
      runId: run.id,
      stepIndex: 2,
      kind: "policy",
      label: "AgentGuard policy gateway",
      status: preliminary.evaluation.decision,
      input: preliminary.evaluation.original,
      output: {
        decision: preliminary.evaluation.decision,
        findings: preliminary.evaluation.findings,
        sanitized: preliminary.evaluation.sanitized,
      },
    });

    if (preliminary.status === "pending_approval") {
      await updateAgentRun({
        ownerId,
        runId: run.id,
        status: "awaiting_approval",
        provider: decision.provider,
        model: decision.model,
        pendingAction: decision.action,
        pendingEvaluation: preliminary.evaluation,
      });
      return envelope(ownerId, run.id);
    }

    await addRunStep({
      runId: run.id,
      stepIndex: 3,
      kind: "tool",
      label: "gmail.send",
      status: preliminary.status,
      input: preliminary.evaluation.sanitized,
      output: {
        receipt: preliminary.receipt,
        error: preliminary.error,
      },
    });
    const finalDecision = await finalModelResponse({
      agent,
      task,
      result: preliminary,
      credentials,
      timeoutMs,
    });
    if (finalDecision.type !== "final") {
      throw new Error("GPT-5.6 attempted an unexpected second tool call.");
    }
    await addRunStep({
      runId: run.id,
      stepIndex: 4,
      kind: "model",
      label: "Final response",
      status: "completed",
      input: { toolStatus: preliminary.status },
      output: {
        text: finalDecision.text,
        citations: finalDecision.citations,
        webSearchRequests: finalDecision.webSearchRequests,
      },
    });
    await updateAgentRun({
      ownerId,
      runId: run.id,
      status:
        preliminary.status === "blocked"
          ? "blocked"
          : preliminary.status === "provider_error"
            ? "failed"
            : "completed",
      provider: decision.provider,
      model: decision.model,
      finalOutput: finalDecision.text,
      error: preliminary.error,
    });
    return envelope(ownerId, run.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agent runtime failed.";
    await updateAgentRun({
      ownerId,
      runId: run.id,
      status: "failed",
      error: message,
    });
    throw new Error(message);
  }
}

export async function approveAgentRun({
  ownerId,
  runId,
  credentials,
}: {
  ownerId: string;
  runId: string;
  credentials: RuntimeCredentials;
}): Promise<AgentRunEnvelope> {
  const run = await getAgentRun(ownerId, runId);
  if (
    !run ||
    run.status !== "awaiting_approval" ||
    !run.pendingEvaluation
  ) {
    throw new Error("This run is not waiting for approval.");
  }
  const agent = await getAgent(ownerId, run.agentId);
  if (!agent) throw new Error("The agent for this run no longer exists.");
  if (!(await claimAgentRunApproval(ownerId, runId))) {
    throw new Error(
      "This approval was already claimed or the run state changed. Refresh the run before retrying.",
    );
  }
  const provider = providerFor(credentials.gmailAccessToken);
  const executionId = `exec_${run.id}`;
  try {
    const result = await executeApprovedEmail(run.pendingEvaluation, provider, {
      actorId: ownerId,
      agentId: run.agentId,
      id: () => executionId,
    });
    await recordAuditOutcome(result);
    await addRunStep({
      runId,
      stepIndex: 3,
      kind: "tool",
      label: "gmail.send",
      status: result.status,
      input: result.evaluation.sanitized,
      output: { receipt: result.receipt, error: result.error },
    });
    const finalDecision = await finalModelResponse({
      agent,
      task: run.task,
      result,
      credentials,
      timeoutMs: 60_000,
    });
    if (finalDecision.type !== "final") {
      throw new Error("GPT-5.6 attempted an unexpected second tool call.");
    }
    await addRunStep({
      runId,
      stepIndex: 4,
      kind: "model",
      label: "Final response",
      status: "completed",
      input: { toolStatus: result.status },
      output: { text: finalDecision.text },
    });
    await updateAgentRun({
      ownerId,
      runId,
      status: result.status === "executed" ? "completed" : "failed",
      provider: run.provider,
      model: run.model,
      finalOutput: finalDecision.text,
      error: result.error,
    });
    return envelope(ownerId, runId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Approval execution failed.";
    await updateAgentRun({
      ownerId,
      runId,
      status: "failed",
      provider: run.provider,
      model: run.model,
      error: message,
    });
    throw new Error(message);
  }
}
