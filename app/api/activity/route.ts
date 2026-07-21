import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { listAuditEvents } from "../../../db/agentguard.ts";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  const allowLocalDevelopment =
    (env as unknown as Record<string, unknown>).ENVIRONMENT === "development";
  if (!user && !allowLocalDevelopment) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  try {
    const events = await listAuditEvents(
      user?.email ?? "local-development",
      Number.isFinite(requestedLimit) ? requestedLimit : 50,
    );
    return NextResponse.json({ events }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Audit activity is unavailable." },
      { status: 503 },
    );
  }
}
