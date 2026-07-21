import { NextResponse } from "next/server";
import {
  listSecurityIncidents,
  consumeModelRateLimit,
  saveSecurityIncident,
} from "../../../db/agentguard.ts";
import {
  attachShellExecution,
  inspectRepositoryOperation,
  type RepositoryFile,
} from "../../../lib/incident-engine.ts";
import {
  executeInOpenAIHostedShell,
  requestLiveShellProposal,
} from "../../../lib/live-defense.ts";
import {
  runtimeActorId,
  runtimeCredentials,
} from "../agent-runtime/runtime-config.ts";

export async function GET(request: Request) {
  const ownerId = await runtimeActorId();
  if (!ownerId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const requestedLimit = Number.parseInt(
    new URL(request.url).searchParams.get("limit") ?? "50",
    10,
  );
  try {
    const incidents = await listSecurityIncidents(
      ownerId,
      Number.isFinite(requestedLimit) ? requestedLimit : 50,
    );
    return NextResponse.json({ incidents }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Incident evidence is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const ownerId = await runtimeActorId();
  if (!ownerId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request must be valid JSON." }, { status: 400 });
  }
  const body = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const task = typeof body.task === "string" ? body.task.trim() : "";
  const repository = Array.isArray(body.repository)
    ? body.repository.filter(
        (file): file is RepositoryFile =>
          Boolean(file) &&
          typeof file === "object" &&
          typeof (file as Record<string, unknown>).path === "string" &&
          typeof (file as Record<string, unknown>).content === "string",
      )
    : [];
  if (!task || task.length > 2_000 || !repository.length || repository.length > 12) {
    return NextResponse.json({ error: "A task and 1–12 repository files are required." }, { status: 400 });
  }
  if (
    repository.some(
      (file) =>
        !file.path.trim() ||
        file.path.length > 200 ||
        file.content.length > 12_000 ||
        file.path.includes("\0"),
    )
  ) {
    return NextResponse.json({ error: "Repository input exceeds the live-defense limits." }, { status: 400 });
  }
  if (
    new Set(repository.map((file) => file.path)).size !== repository.length ||
    repository.reduce((total, file) => total + file.content.length, 0) > 48_000
  ) {
    return NextResponse.json(
      { error: "Repository paths must be unique and total content must not exceed 48,000 characters." },
      { status: 400 },
    );
  }
  const credentials = runtimeCredentials();
  if (!credentials.openAIApiKey && !credentials.openRouterApiKey) {
    return NextResponse.json(
      { error: "Live defense requires OPENAI_API_KEY or OPENROUTER_API_KEY." },
      { status: 503 },
    );
  }
  try {
    const quota = await consumeModelRateLimit({
      ownerId,
      bucket: "live-defense",
      limit: 10,
    });
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Live-defense rate limit reached. Try again shortly." },
        {
          status: 429,
          headers: { "retry-after": String(quota.retryAfterSeconds) },
        },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Live-defense quota storage is unavailable. No model call was attempted." },
      { status: 503 },
    );
  }
  try {
    const proposal = await requestLiveShellProposal({
      openAIApiKey: credentials.openAIApiKey,
      openRouterApiKey: credentials.openRouterApiKey,
      openRouterModel: credentials.openRouterModel,
      task,
      repository,
    });
    let incident = inspectRepositoryOperation({
      id: `incident_${crypto.randomUUID()}`,
      task,
      repository,
      operation: proposal.operation,
      modelProvenance: proposal.provenance,
    });
    if (incident.decision === "allow") {
      if (!credentials.openAIApiKey) {
        return NextResponse.json(
          {
            error:
              "This command passed policy, but real isolated execution requires OPENAI_API_KEY for OpenAI hosted shell.",
          },
          { status: 503 },
        );
      }
      incident = attachShellExecution({
        incident,
        execution: await executeInOpenAIHostedShell({
          apiKey: credentials.openAIApiKey,
          operation: incident.operation,
        }),
      });
    }
    await saveSecurityIncident(ownerId, incident);
    return NextResponse.json({ incident }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Live defense failed." },
      { status: 502 },
    );
  }
}
