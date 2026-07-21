import { NextResponse } from "next/server";
import {
  listSecurityRegressions,
  listSecurityReplays,
  saveSecurityReplay,
} from "../../../../db/agentguard.ts";
import { replaySecurityRegression } from "../../../../lib/incident-engine.ts";
import { runtimeActorId } from "../../agent-runtime/runtime-config.ts";

export async function GET(request: Request) {
  const ownerId = await runtimeActorId();
  if (!ownerId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const limit = Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "50", 10);
  try {
    return NextResponse.json(
      { replays: await listSecurityReplays(ownerId, Number.isFinite(limit) ? limit : 50) },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Replay evidence is unavailable." }, { status: 503 });
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
  const regressionId = typeof body.regressionId === "string" ? body.regressionId : "";
  if (!regressionId || body.policyVersion !== "hardened-v2") {
    return NextResponse.json({ error: "A regression and hardened-v2 policy are required." }, { status: 400 });
  }
  try {
    const regression = (await listSecurityRegressions(ownerId)).find(
      (item) => item.id === regressionId,
    );
    if (!regression) {
      return NextResponse.json({ error: "Regression not found." }, { status: 404 });
    }
    const replay = await saveSecurityReplay(
      ownerId,
      replaySecurityRegression({ regression, policyVersion: "hardened-v2" }),
    );
    return NextResponse.json({ replay }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Replay failed." },
      { status: 503 },
    );
  }
}
