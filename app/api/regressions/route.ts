import { NextResponse } from "next/server";
import {
  listSecurityIncidents,
  listSecurityRegressions,
  saveSecurityRegression,
} from "../../../db/agentguard.ts";
import { incidentToRegression } from "../../../lib/incident-engine.ts";
import { runtimeActorId } from "../agent-runtime/runtime-config.ts";

export async function GET() {
  const ownerId = await runtimeActorId();
  if (!ownerId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    return NextResponse.json(
      { regressions: await listSecurityRegressions(ownerId) },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Security regressions are unavailable." }, { status: 503 });
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
  const incidentId =
    payload && typeof payload === "object" &&
    typeof (payload as Record<string, unknown>).incidentId === "string"
      ? String((payload as Record<string, unknown>).incidentId)
      : "";
  if (!incidentId) {
    return NextResponse.json({ error: "A captured incident is required." }, { status: 400 });
  }
  try {
    const incident = (await listSecurityIncidents(ownerId, 100)).find(
      (item) => item.id === incidentId,
    );
    if (!incident) {
      return NextResponse.json({ error: "Incident not found." }, { status: 404 });
    }
    const regression = await saveSecurityRegression(
      ownerId,
      incidentToRegression({ incident }),
    );
    return NextResponse.json({ regression }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Regression creation failed." },
      { status: 503 },
    );
  }
}
