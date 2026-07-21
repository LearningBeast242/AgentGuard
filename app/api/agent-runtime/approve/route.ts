import { NextResponse } from "next/server";
import { approveAgentRun } from "../../../../lib/agent-runner.ts";
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
  const runId =
    payload &&
    typeof payload === "object" &&
    typeof (payload as Record<string, unknown>).runId === "string"
      ? String((payload as Record<string, unknown>).runId).trim()
      : "";
  if (!runId) {
    return NextResponse.json(
      { error: "A pending run ID is required." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await approveAgentRun({
        ownerId,
        runId,
        credentials: runtimeCredentials(),
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Approval failed.",
      },
      { status: 409 },
    );
  }
}
