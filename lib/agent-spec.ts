export const AGENT_TOOL_IDS = [
  "gmail.send",
  "web.search",
] as const;

export type AgentToolId = (typeof AGENT_TOOL_IDS)[number];
export type AgentRiskLevel = "low" | "medium" | "high";
export type PolicyEffect = "allow" | "redact" | "require_approval" | "block";

export type GeneratedPolicy = {
  name: string;
  effect: PolicyEffect;
  reason: string;
};

export type GeneratedTest = {
  name: string;
  input: string;
  expected: PolicyEffect;
};

export type AgentSpec = {
  name: string;
  purpose: string;
  instructions: string;
  riskLevel: AgentRiskLevel;
  tools: AgentToolId[];
  policies: GeneratedPolicy[];
  tests: GeneratedTest[];
};

export const AGENT_SPEC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "purpose",
    "instructions",
    "riskLevel",
    "tools",
    "policies",
    "tests",
  ],
  properties: {
    name: { type: "string", minLength: 2, maxLength: 80 },
    purpose: { type: "string", minLength: 10, maxLength: 500 },
    instructions: { type: "string", minLength: 20, maxLength: 4_000 },
    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    tools: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: ["gmail.send", "web.search"] },
    },
    policies: {
      type: "array",
      minItems: 2,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "effect", "reason"],
        properties: {
          name: { type: "string", minLength: 3, maxLength: 100 },
          effect: {
            type: "string",
            enum: ["allow", "redact", "require_approval", "block"],
          },
          reason: { type: "string", minLength: 8, maxLength: 300 },
        },
      },
    },
    tests: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "input", "expected"],
        properties: {
          name: { type: "string", minLength: 3, maxLength: 100 },
          input: { type: "string", minLength: 5, maxLength: 500 },
          expected: {
            type: "string",
            enum: ["allow", "redact", "require_approval", "block"],
          },
        },
      },
    },
  },
} as const;

function isBoundedString(
  value: unknown,
  minLength: number,
  maxLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minLength &&
    value.length <= maxLength
  );
}

export function isAgentSpec(value: unknown): value is AgentSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const spec = value as Record<string, unknown>;
  if (
    !isBoundedString(spec.name, 2, 80) ||
    !isBoundedString(spec.purpose, 10, 500) ||
    !isBoundedString(spec.instructions, 20, 4_000) ||
    !["low", "medium", "high"].includes(String(spec.riskLevel))
  ) {
    return false;
  }
  if (
    !Array.isArray(spec.tools) ||
    new Set(spec.tools).size !== spec.tools.length ||
    !spec.tools.every((tool) =>
      (AGENT_TOOL_IDS as readonly unknown[]).includes(tool),
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(spec.policies) ||
    spec.policies.length < 2 ||
    spec.policies.length > 8 ||
    !spec.policies.every((policy) => {
      if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
        return false;
      }
      const item = policy as Record<string, unknown>;
      return (
        isBoundedString(item.name, 3, 100) &&
        isBoundedString(item.reason, 8, 300) &&
        ["allow", "redact", "require_approval", "block"].includes(
          String(item.effect),
        )
      );
    })
  ) {
    return false;
  }
  return (
    Array.isArray(spec.tests) &&
    spec.tests.length >= 3 &&
    spec.tests.length <= 8 &&
    spec.tests.every((test) => {
      if (!test || typeof test !== "object" || Array.isArray(test)) return false;
      const item = test as Record<string, unknown>;
      return (
        isBoundedString(item.name, 3, 100) &&
        isBoundedString(item.input, 5, 500) &&
        ["allow", "redact", "require_approval", "block"].includes(
          String(item.expected),
        )
      );
    })
  );
}

export function enforceDescriptionCapabilities(
  description: string,
  spec: AgentSpec,
): AgentSpec {
  const explicitlyNeedsWeb =
    /\b(web|search|browse|current|latest|recent|recall|regulat|source|citation|verify)\b/i.test(
      description,
    );
  if (!explicitlyNeedsWeb || spec.tools.includes("web.search")) return spec;
  return { ...spec, tools: [...spec.tools, "web.search"] };
}
