import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { validateEmailAction } from "../../../../lib/email-action-validation.ts";
import { evaluateEmailAction } from "../../../../lib/governance.ts";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  const allowLocalDevelopment =
    (env as unknown as Record<string, unknown>).ENVIRONMENT === "development";
  if (!user && !allowLocalDevelopment) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const validation = validateEmailAction(
    body && typeof body === "object"
      ? (body as Record<string, unknown>).action
      : undefined,
  );
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const result = evaluateEmailAction(validation.action);
  return NextResponse.json({ result }, { status: 200 });
}

