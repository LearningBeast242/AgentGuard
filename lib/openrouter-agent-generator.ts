import {
  AGENT_SPEC_JSON_SCHEMA,
  enforceDescriptionCapabilities,
  isAgentSpec,
  type AgentSpec,
} from "./agent-spec.ts";

type OpenRouterResponse = {
  error?: { message?: unknown; code?: unknown };
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const SYSTEM_PROMPT = `You design governed AI agents for AgentGuard.

Convert the user's description into one practical, editable agent specification.
Choose only the minimum tools required. Add enforceable policies for sensitive
data, external side effects, and relevant authority limits. Include a normal
case, a boundary case, and an adversarial exfiltration test. Model output is a
recommendation; deterministic AgentGuard policy is the enforcement boundary.
Use redact for personal-data minimization, block for secret exfiltration, and
require_approval for external recipients.

Tool selection rules:
- Add web.search whenever the purpose requires current web information, source
  verification, recalls, alerts, regulations, news, or cited research.
- Add gmail.send only when the agent must actually send email.
- For medical or pharmaceutical research, require regulator-first sources,
  citations and dates, explicit uncertainty, and no personal treatment advice.`;

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.6-luna";

function portableSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(portableSchema);
  if (!value || typeof value !== "object") return value;
  const unsupported = new Set([
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "uniqueItems",
  ]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !unsupported.has(key))
      .map(([key, child]) => [key, portableSchema(child)]),
  );
}

function providerError(response: Response, payload: OpenRouterResponse): Error {
  const message =
    typeof payload.error?.message === "string"
      ? payload.error.message
      : "The provider did not return an error description.";
  if (response.status === 401 || response.status === 403) {
    return new Error(
      "OpenRouter rejected the API key. Revoke the exposed key, create a replacement, and update OPENROUTER_API_KEY.",
    );
  }
  if (response.status === 402) {
    return new Error(
      "OpenRouter has insufficient credits for this request. Add credits or select a funded account.",
    );
  }
  if (response.status === 404) {
    return new Error(
      `OpenRouter could not access the configured model (${DEFAULT_OPENROUTER_MODEL}).`,
    );
  }
  if (response.status === 429) {
    return new Error(
      "OpenRouter rate-limited the request. Wait briefly and try again.",
    );
  }
  return new Error(`OpenRouter request failed (${response.status}): ${message}`);
}

export async function generateAgentSpecWithOpenRouter({
  description,
  apiKey,
  model = DEFAULT_OPENROUTER_MODEL,
  timeoutMs = 45_000,
  fetcher = fetch,
}: {
  description: string;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}): Promise<AgentSpec> {
  if (!apiKey.trim()) throw new Error("OpenRouter API key is unavailable.");

  const request = async (strict: boolean) =>
    fetcher("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "http-referer": "https://agentguard.openai.build",
        "x-title": "AgentGuard",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: description },
        ],
        reasoning: { effort: "low", exclude: true },
        max_tokens: 2_500,
        response_format: strict
          ? {
              type: "json_schema",
              json_schema: {
                name: "agentguard_agent_spec",
                strict: true,
                schema: portableSchema(AGENT_SPEC_JSON_SCHEMA),
              },
            }
          : { type: "json_object" },
        ...(strict
          ? { provider: { require_parameters: true } }
          : { plugins: [{ id: "response-healing" }] }),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

  let response = await request(true);
  let payload = (await response.json()) as OpenRouterResponse;
  if (
    !response.ok &&
    [400, 422].includes(response.status) &&
    /schema|response.?format|structured/i.test(
      typeof payload.error?.message === "string" ? payload.error.message : "",
    )
  ) {
    response = await request(false);
    payload = (await response.json()) as OpenRouterResponse;
  }
  if (!response.ok) {
    throw providerError(response, payload);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("GPT-5.6 Luna returned no agent specification.");
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(content);
  } catch {
    throw new Error("GPT-5.6 Luna returned unreadable structured output.");
  }
  if (!isAgentSpec(candidate)) {
    throw new Error("GPT-5.6 Luna returned an invalid agent specification.");
  }
  return enforceDescriptionCapabilities(description, candidate);
}
