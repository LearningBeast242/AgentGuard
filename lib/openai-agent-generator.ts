import {
  AGENT_SPEC_JSON_SCHEMA,
  enforceDescriptionCapabilities,
  isAgentSpec,
  type AgentSpec,
} from "./agent-spec.ts";

type OpenAIResponse = {
  error?: { message?: unknown };
  output?: Array<{
    type?: unknown;
    content?: Array<{ type?: unknown; text?: unknown }>;
  }>;
};

const GENERATOR_INSTRUCTIONS = `Role: You design governed AI agents for AgentGuard.

Goal: Convert the user's description into one practical, editable agent specification.

Success criteria:
- choose only tools necessary for the stated purpose
- write concise outcome-first operating instructions
- add policies for sensitive data, external side effects, and relevant limits
- include normal, boundary, and adversarial tests
- make approval boundaries explicit

Constraints:
- use least privilege
- never invent capabilities outside the allowed tool enum
- add web.search for current information, recalls, alerts, regulations, source verification, or cited research
- add gmail.send only when actual email delivery is required
- for medical or pharmaceutical research, require regulator-first sources, citations and dates, explicit uncertainty, and no personal treatment advice
- a model recommendation is not an enforcement decision
- map redact to personal-data minimization, block to secret exfiltration, and require_approval to external recipients
- destructive, financial, or external communication actions require appropriate approval
- return only the schema-constrained specification`;

function extractOutputText(payload: OpenAIResponse): string | null {
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

export async function generateAgentSpec({
  description,
  apiKey,
  timeoutMs = 45_000,
  fetcher = fetch,
}: {
  description: string;
  apiKey: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}): Promise<AgentSpec> {
  if (!apiKey.trim()) throw new Error("OpenAI API key is unavailable.");

  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-sol",
      reasoning: { effort: "low" },
      store: false,
      instructions: GENERATOR_INSTRUCTIONS,
      input: description,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "agentguard_agent_spec",
          strict: true,
          schema: AGENT_SPEC_JSON_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    const detail =
      typeof payload.error?.message === "string"
        ? payload.error.message
        : `OpenAI request failed with status ${response.status}.`;
    throw new Error(detail);
  }

  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("GPT-5.6 returned no agent specification.");

  let candidate: unknown;
  try {
    candidate = JSON.parse(outputText);
  } catch {
    throw new Error("GPT-5.6 returned an unreadable agent specification.");
  }
  if (!isAgentSpec(candidate)) {
    throw new Error("GPT-5.6 returned an invalid agent specification.");
  }
  return enforceDescriptionCapabilities(description, candidate);
}
