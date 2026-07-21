import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { generateAgentSpec } from "../../../../lib/openai-agent-generator.ts";
import {
  DEFAULT_OPENROUTER_MODEL,
  generateAgentSpecWithOpenRouter,
} from "../../../../lib/openrouter-agent-generator.ts";
import { consumeModelRateLimit } from "../../../../db/agentguard.ts";

function environmentString(name: string): string | null {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() ? value : null;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  const allowLocalDevelopment =
    (env as unknown as Record<string, unknown>).ENVIRONMENT === "development";
  if (!user && !allowLocalDevelopment) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request must be valid JSON." }, { status: 400 });
  }

  const description =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).description
      : null;
  if (typeof description !== "string" || description.trim().length < 20) {
    return NextResponse.json(
      { error: "Describe the agent in at least 20 characters." },
      { status: 400 },
    );
  }
  if (description.length > 4_000) {
    return NextResponse.json(
      { error: "Agent description exceeds 4,000 characters." },
      { status: 400 },
    );
  }

  const openAIApiKey = environmentString("OPENAI_API_KEY");
  const openRouterApiKey = environmentString("OPENROUTER_API_KEY");
  if (!openAIApiKey && !openRouterApiKey) {
    return NextResponse.json(
      {
        error:
          "Agent generation is not configured. Add OPENROUTER_API_KEY for development or OPENAI_API_KEY for the final demo.",
      },
      { status: 503 },
    );
  }

  const ownerId = user?.email ?? "local-development";
  try {
    const quota = await consumeModelRateLimit({
      ownerId,
      bucket: "agent-generation",
      limit: 10,
    });
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Agent-generation rate limit reached. Try again shortly." },
        {
          status: 429,
          headers: { "retry-after": String(quota.retryAfterSeconds) },
        },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Generation quota storage is unavailable. No model call was attempted." },
      { status: 503 },
    );
  }

  try {
    const spec = openAIApiKey
      ? await generateAgentSpec({
          description: description.trim(),
          apiKey: openAIApiKey,
        })
      : await generateAgentSpecWithOpenRouter({
          description: description.trim(),
          apiKey: openRouterApiKey!,
          model:
            environmentString("OPENROUTER_MODEL") ?? DEFAULT_OPENROUTER_MODEL,
        });
    return NextResponse.json(
      {
        spec,
        generation: {
          provider: openAIApiKey ? "openai" : "openrouter",
          model: openAIApiKey ? "gpt-5.6-sol" : DEFAULT_OPENROUTER_MODEL,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Agent generation failed.",
      },
      { status: 502 },
    );
  }
}
