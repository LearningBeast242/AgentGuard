import { NextResponse } from "next/server";
import { startAgentRun } from "../../../../lib/agent-runner.ts";
import { consumeModelRateLimit } from "../../../../db/agentguard.ts";
import {
  runtimeActorId,
  runtimeCredentials,
} from "../runtime-config.ts";

export async function POST(request: Request) {
  const ownerId = await runtimeActorId();
  if (!ownerId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request must be valid JSON." },
      { status: 400 },
    );
  }
  const body =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const agentId =
    typeof body.agentId === "string" ? body.agentId.trim() : "";
  const task = typeof body.task === "string" ? body.task.trim() : "";
  const deliveryMode = "gmail" as const;
  if (!agentId) {
    return NextResponse.json(
      { error: "A persisted agent is required." },
      { status: 400 },
    );
  }
  if (!task || task.length > 4_000) {
    return NextResponse.json(
      { error: "Task must contain between 1 and 4,000 characters." },
      { status: 400 },
    );
  }
  const credentials = runtimeCredentials();
  if (!credentials.openAIApiKey && !credentials.openRouterApiKey) {
    return NextResponse.json(
      {
        error:
          "Agent runtime is not configured. Add OPENAI_API_KEY or OPENROUTER_API_KEY.",
      },
      { status: 503 },
    );
  }
  try {
    const quota = await consumeModelRateLimit({
      ownerId,
      bucket: "agent-runtime",
      limit: 20,
    });
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Agent-runtime rate limit reached. Try again shortly." },
        {
          status: 429,
          headers: { "retry-after": String(quota.retryAfterSeconds) },
        },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Runtime quota storage is unavailable. No model call was attempted." },
      { status: 503 },
    );
  }
  try {
    const result = await startAgentRun({
      ownerId,
      agentId,
      task,
      deliveryMode,
      credentials,
    });
    return NextResponse.json(
      result,
      { status: result.run.status === "awaiting_approval" ? 202 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Agent runtime failed.",
      },
      { status: 502 },
    );
  }
}
