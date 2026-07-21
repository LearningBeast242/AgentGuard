import type { AgentSpec } from "./agent-spec.ts";

export type GovernanceDecision =
  | "allow"
  | "redact"
  | "require_approval"
  | "block";

export type FindingKind =
  | "tool_permission"
  | "network"
  | "recipient"
  | "secret"
  | "personal_data"
  | "financial_data"
  | "prompt_injection";

export type Finding = {
  id: string;
  kind: FindingKind;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  evidence: string;
  action: GovernanceDecision;
};

export type EmailAction = {
  tool: "gmail.send";
  to: string;
  subject: string;
  body: string;
};

export type GovernancePolicy = {
  allowedTools: string[];
  trustedDomains: string[];
  blockedDomains: string[];
  externalEmailRequiresApproval: boolean;
  redactPersonalData: boolean;
  blockSecretsToExternalRecipients: boolean;
  networkAccess: boolean;
};

export type EvaluationResult = {
  decision: GovernanceDecision;
  original: EmailAction;
  sanitized: EmailAction;
  findings: Finding[];
  summary: string;
  evaluatedAt: string;
};

export const DEFAULT_POLICY: GovernancePolicy = {
  allowedTools: ["gmail.send"],
  trustedDomains: ["northstar.example"],
  blockedDomains: ["requestbin.com", "webhook.site", "pastebin.com"],
  externalEmailRequiresApproval: true,
  redactPersonalData: true,
  blockSecretsToExternalRecipients: true,
  networkAccess: true,
};

export function policyFromAgentSpec(
  spec: AgentSpec,
  base: GovernancePolicy = DEFAULT_POLICY,
): GovernancePolicy {
  const effects = new Set(spec.policies.map((policy) => policy.effect));
  return {
    ...base,
    allowedTools: [...spec.tools],
    redactPersonalData: effects.has("redact"),
    blockSecretsToExternalRecipients: effects.has("block"),
    externalEmailRequiresApproval: effects.has("require_approval"),
  };
}

type Detector = {
  kind: Extract<FindingKind, "secret" | "personal_data" | "financial_data">;
  severity: Finding["severity"];
  title: string;
  pattern: RegExp;
  replacement: string;
};

const DETECTORS: Detector[] = [
  {
    kind: "secret",
    severity: "critical",
    title: "OpenAI-style API key",
    pattern: /\bsk-[a-zA-Z0-9_-]{12,}\b/g,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    kind: "secret",
    severity: "critical",
    title: "Bearer token",
    pattern: /\bBearer\s+[a-zA-Z0-9._~+/-]{12,}=*\b/gi,
    replacement: "[REDACTED_BEARER_TOKEN]",
  },
  {
    kind: "financial_data",
    severity: "high",
    title: "Payment card number",
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: "[REDACTED_PAYMENT_CARD]",
  },
  {
    kind: "personal_data",
    severity: "medium",
    title: "Phone number",
    pattern: /(?<!\d)(?:\+?\d[\s().-]*){10,14}(?!\d)/g,
    replacement: "[REDACTED_PHONE]",
  },
  {
    kind: "personal_data",
    severity: "medium",
    title: "Email address in message body",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]",
  },
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore (?:all |the )?(?:previous|prior|system) instructions/i,
  /reveal (?:your |the )?(?:system prompt|secrets?|credentials?)/i,
  /bypass (?:the )?(?:policy|guardrail|approval)/i,
  /send (?:all|the) (?:customer|private|secret) data/i,
];

const DECISION_PRIORITY: Record<GovernanceDecision, number> = {
  allow: 0,
  redact: 1,
  require_approval: 2,
  block: 3,
};

function domainOf(address: string): string {
  return address.trim().toLowerCase().split("@")[1] ?? "";
}

function findingId(kind: FindingKind, index: number): string {
  return `${kind}-${String(index + 1).padStart(2, "0")}`;
}

function highestDecision(findings: Finding[]): GovernanceDecision {
  return findings.reduce<GovernanceDecision>(
    (current, finding) =>
      DECISION_PRIORITY[finding.action] > DECISION_PRIORITY[current]
        ? finding.action
        : current,
    "allow",
  );
}

function decisionSummary(
  decision: GovernanceDecision,
  findings: Finding[],
): string {
  if (decision === "allow") {
    return "All policy checks passed. The message may be sent.";
  }

  const count = findings.length;
  const label = count === 1 ? "policy finding" : "policy findings";
  if (decision === "redact") {
    return `${count} ${label} detected. Protected values were redacted before sending.`;
  }
  if (decision === "require_approval") {
    return `${count} ${label} detected. Human approval is required before sending.`;
  }
  return `${count} ${label} detected. AgentGuard blocked this action before Gmail was called.`;
}

export function evaluateEmailAction(
  action: EmailAction,
  policy: GovernancePolicy = DEFAULT_POLICY,
  evaluatedAt = new Date().toISOString(),
): EvaluationResult {
  const findings: Finding[] = [];
  const recipientDomain = domainOf(action.to);
  const isExternal = !policy.trustedDomains.includes(recipientDomain);

  if (!policy.networkAccess) {
    findings.push({
      id: findingId("network", findings.length),
      kind: "network",
      severity: "critical",
      title: "Runtime network egress disabled",
      evidence: `${action.tool} cannot reach an external provider from this runtime`,
      action: "block",
    });
  } else if (!policy.allowedTools.includes(action.tool)) {
    findings.push({
      id: findingId("tool_permission", findings.length),
      kind: "tool_permission",
      severity: "critical",
      title: "Tool permission denied",
      evidence: `${action.tool} is not enabled for this agent`,
      action: "block",
    });
  }

  if (!recipientDomain) {
    findings.push({
      id: findingId("recipient", findings.length),
      kind: "recipient",
      severity: "high",
      title: "Invalid recipient",
      evidence: "The recipient does not contain a valid email domain",
      action: "block",
    });
  } else if (policy.blockedDomains.includes(recipientDomain)) {
    findings.push({
      id: findingId("recipient", findings.length),
      kind: "recipient",
      severity: "critical",
      title: "Blocked destination",
      evidence: `${recipientDomain} is prohibited by the outbound data policy`,
      action: "block",
    });
  } else if (isExternal && policy.externalEmailRequiresApproval) {
    findings.push({
      id: findingId("recipient", findings.length),
      kind: "recipient",
      severity: "medium",
      title: "External recipient",
      evidence: `${recipientDomain} is outside the trusted domain boundary`,
      action: "require_approval",
    });
  }

  let sanitizedSubject = action.subject;
  let sanitizedBody = action.body;

  for (const detector of DETECTORS) {
    if (detector.kind === "personal_data" && !policy.redactPersonalData) {
      continue;
    }
    const subjectMatches = [...action.subject.matchAll(detector.pattern)];
    detector.pattern.lastIndex = 0;
    const bodyMatches = [...action.body.matchAll(detector.pattern)];
    detector.pattern.lastIndex = 0;
    const matches = [...subjectMatches, ...bodyMatches];
    if (matches.length === 0) continue;

    const shouldBlock =
      detector.kind === "secret" &&
      isExternal &&
      policy.blockSecretsToExternalRecipients;

    findings.push({
      id: findingId(detector.kind, findings.length),
      kind: detector.kind,
      severity: detector.severity,
      title: detector.title,
      evidence: `${matches.length} protected value${matches.length === 1 ? "" : "s"} detected`,
      action: shouldBlock ? "block" : "redact",
    });

    sanitizedSubject = sanitizedSubject.replace(
      detector.pattern,
      detector.replacement,
    );
    detector.pattern.lastIndex = 0;
    sanitizedBody = sanitizedBody.replace(
      detector.pattern,
      detector.replacement,
    );
    detector.pattern.lastIndex = 0;
  }

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (!pattern.test(`${action.subject}\n${action.body}`)) continue;
    findings.push({
      id: findingId("prompt_injection", findings.length),
      kind: "prompt_injection",
      severity: "high",
      title: "Prompt injection language",
      evidence: "The message contains language attempting to override governance",
      action: "block",
    });
    break;
  }

  const decision = highestDecision(findings);
  return {
    decision,
    original: action,
    sanitized: {
      ...action,
      subject: sanitizedSubject,
      body: sanitizedBody,
    },
    findings,
    summary: decisionSummary(decision, findings),
    evaluatedAt,
  };
}
