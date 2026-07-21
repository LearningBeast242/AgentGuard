import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isAgentSpec } from "../../../lib/agent-spec.ts";
import { listAgents, saveAgent } from "../../../db/agentguard.ts";

function actorEmail(user: Awaited<ReturnType<typeof getChatGPTUser>>): string | null {
  if (user) return user.email;
  const isDevelopment =
    (env as unknown as Record<string, unknown>).ENVIRONMENT === "development";
  return isDevelopment ? "local-development" : null;
}

export async function GET() {
  const actorId = actorEmail(await getChatGPTUser());
  if (!actorId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    return NextResponse.json(
      { agents: await listAgents(actorId) },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: "Agent registry is unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const actorId = actorEmail(await getChatGPTUser());
  if (!actorId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request must be valid JSON." }, { status: 400 });
  }
  const spec =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).spec
      : null;
  if (!isAgentSpec(spec)) {
    return NextResponse.json(
      { error: "A valid agent specification is required." },
      { status: 400 },
    );
  }

  try {
    const agent = await saveAgent({ ownerId: actorId, spec });
    return NextResponse.json({ agent }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Agent could not be saved." },
      { status: 503 },
    );
  }
}

