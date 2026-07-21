import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { validateEmailAction } from "../../../../lib/email-action-validation.ts";
import {
  executeApprovedEmail,
  executeEmailThroughGateway,
  type EmailProvider,
} from "../../../../lib/gateway.ts";
import { GmailEmailProvider } from "../../../../lib/gmail-provider.ts";
import {
  recordAuditOutcome,
  recordAuditStart,
} from "../../../../db/agentguard.ts";
import { evaluateEmailAction } from "../../../../lib/governance.ts";

function runtimeValue(key: string): string | null {
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  const allowLocalDevelopment = runtimeValue("ENVIRONMENT") === "development";
  if (!user && !allowLocalDevelopment) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request must be valid JSON." }, { status: 400 });
  }
  const body =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const validation = validateEmailAction(body.action);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (body.provider !== "gmail") {
    return NextResponse.json(
      { error: "A real provider must be selected for execution." },
      { status: 400 },
    );
  }
  const accessToken = runtimeValue("GMAIL_ACCESS_TOKEN");
  if (!accessToken) {
    return NextResponse.json(
      { error: "Live Gmail delivery is not configured." },
      { status: 503 },
    );
  }
  const provider: EmailProvider = new GmailEmailProvider({ accessToken });

  const context = {
    actorId: user?.email ?? "local-development",
    agentId:
      typeof body.agentId === "string" && body.agentId.trim()
        ? body.agentId
        : "support-sentinel",
    id: () => executionId,
  };
  const executionId = `exec_${crypto.randomUUID()}`;
  const evaluation = evaluateEmailAction(validation.action);
  try {
    await recordAuditStart({
      id: executionId,
      actorId: context.actorId,
      agentId: context.agentId,
      evaluation,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "AgentGuard could not create an audit record. No provider call was attempted.",
      },
      { status: 503 },
    );
  }

  let result = await executeEmailThroughGateway(
    validation.action,
    provider,
    context,
  );

  if (result.status === "pending_approval" && body.approved === true) {
    result = await executeApprovedEmail(result.evaluation, provider, {
      ...context,
      id: () => executionId,
    });
  }

  try {
    await recordAuditOutcome(result);
  } catch {
    if (result.status === "executed") {
      return NextResponse.json(
        {
          result,
          auditWarning:
            "The provider accepted the action, but final audit metadata could not be updated. Do not retry the action.",
        },
        { status: 200 },
      );
    }
    return NextResponse.json(
      {
        error: "AgentGuard could not finalize its audit record.",
        result,
      },
      { status: 500 },
    );
  }

  const status =
    result.status === "provider_error"
      ? 502
      : result.status === "blocked"
        ? 403
        : result.status === "pending_approval"
          ? 202
          : 200;
  return NextResponse.json({ result }, { status });
}
