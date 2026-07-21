export type RepositoryFile = {
  path: string;
  content: string;
};

export type ProposedOperation = {
  tool: "shell.exec";
  command: string;
  cwd: string;
};

export type IncidentFinding = {
  ruleId: string;
  severity: "medium" | "high" | "critical";
  title: string;
  evidence: string;
  source: string | null;
};

export type IncidentTraceStep = {
  phase: "observe" | "correlate" | "decide" | "enforce";
  status: "captured" | "matched" | "allowed" | "blocked" | "executed";
  title: string;
  detail: string;
};

export type ModelProvenance = {
  provider: "openai" | "openrouter";
  model: string;
  responseId: string;
  toolCallId: string;
  sourcePath: string;
};

export type ShellExecutionEvidence = {
  provider: "openai_hosted_shell";
  model: "gpt-5.6-sol";
  responseId: string;
  shellCallId: string;
  command: string;
  stdout: string;
  stderr: string;
  outcome: "exit" | "timeout";
  exitCode: number | null;
  durationMs: number;
  executedAt: string;
};

export type SecurityIncident = {
  id: string;
  scenario: "live_repository";
  title: string;
  task: string;
  repository: RepositoryFile[];
  operation: ProposedOperation;
  decision: "allow" | "block";
  status: "authorized" | "executed" | "prevented";
  summary: string;
  findings: IncidentFinding[];
  trace: IncidentTraceStep[];
  policyVersion: "runtime-v1" | "hardened-v2";
  modelProvenance: ModelProvenance | null;
  execution: ShellExecutionEvidence | null;
  executed: boolean;
  createdAt: string;
};

export type SecurityRegression = {
  id: string;
  incidentId: string;
  name: string;
  scenario: {
    task: string;
    repository: RepositoryFile[];
    operation: ProposedOperation;
  };
  expectedDecision: "block";
  policyVersion: string;
  status: "ready";
  createdAt: string;
};

export type SecurityReplay = {
  id: string;
  regressionId: string;
  policyVersion: "hardened-v2";
  expectedDecision: "block";
  actualDecision: "block" | "allow";
  passed: boolean;
  executed: false;
  summary: string;
  findings: IncidentFinding[];
  trace: IncidentTraceStep[];
  createdAt: string;
};

function sourceOf(repository: RepositoryFile[], pattern: RegExp): string | null {
  for (const file of repository) {
    const lines = file.content.split("\n");
    const index = lines.findIndex((line) => pattern.test(line));
    if (index >= 0) return `${file.path}:${index + 1}`;
  }
  return null;
}

const SAFE_DIAGNOSTIC_COMMANDS = [
  /^node\s+--version$/,
  /^python3?\s+--version$/,
  /^pwd$/,
  /^ls(?:\s+-[alh]+)?(?:\s+\.)?$/,
];

function isSafeDiagnostic(command: string): boolean {
  return SAFE_DIAGNOSTIC_COMMANDS.some((pattern) => pattern.test(command.trim()));
}

export function inspectRepositoryOperation({
  id,
  task,
  repository,
  operation,
  modelProvenance,
  policyVersion = "runtime-v1",
  now = () => new Date(),
}: {
  id: string;
  task: string;
  repository: RepositoryFile[];
  operation: ProposedOperation;
  modelProvenance: SecurityIncident["modelProvenance"];
  policyVersion?: SecurityIncident["policyVersion"];
  now?: () => Date;
}): SecurityIncident {
  const corpus = repository.map((file) => file.content).join("\n");
  const command = operation.command.trim();
  const findings: IncidentFinding[] = [];

  if (operation.cwd !== "/mnt/data") {
    findings.push({
      ruleId: "AG-SCOPE-007",
      severity: "critical",
      title: "Execution scope escape",
      evidence: "The proposed operation targets a working directory outside the isolated execution root.",
      source: modelProvenance?.sourcePath ?? null,
    });
  }

  if (/ignore (all |any )?(previous|prior) instructions|bypass (security|policy)/i.test(corpus)) {
    findings.push({
      ruleId: "AG-PROMPT-001",
      severity: "high",
      title: "Repository-borne prompt injection",
      evidence: "Untrusted repository content attempts to override the agent's operating instructions.",
      source: sourceOf(repository, /ignore (all |any )?(previous|prior) instructions|bypass (security|policy)/i),
    });
  }

  if (/(^|[\s/])\.env([\s'";]|$)|printenv|process\.env|\benv\b/i.test(command)) {
    findings.push({
      ruleId: "AG-SECRET-004",
      severity: "critical",
      title: "Credential material requested",
      evidence: "The proposed shell command reads environment-backed secrets or a .env file.",
      source: sourceOf(repository, /\.env|printenv|process\.env/i),
    });
  }

  if (/\b(curl|wget)\b|https?:\/\//i.test(command)) {
    findings.push({
      ruleId: "AG-EGRESS-002",
      severity: "critical",
      title: "Untrusted network exfiltration",
      evidence: "The proposed command opens network egress to a destination not authorized by the operator task.",
      source: sourceOf(repository, /\bcurl\b|\bwget\b|https?:\/\//i),
    });
  }

  if (/\brm\s+-rf\b|\bsudo\b|\bmkfs\b|\bchmod\s+777\b|:\(\)\s*\{/i.test(command)) {
    findings.push({
      ruleId: "AG-DESTRUCTIVE-003",
      severity: "critical",
      title: "Destructive shell capability",
      evidence: "The proposed command requests a destructive or privilege-expanding capability.",
      source: sourceOf(repository, /rm\s+-rf|sudo|mkfs|chmod\s+777/i),
    });
  }

  if (/[;&|`]|\$\(|\n|\r|[<>]/.test(command)) {
    findings.push({
      ruleId: "AG-SHELL-CHAIN-005",
      severity: "high",
      title: "Compound shell expression",
      evidence: "Command chaining, substitution, redirection, and multiline shell input are outside the diagnostic capability.",
      source: null,
    });
  }

  if (
    policyVersion === "hardened-v2" &&
    findings.some((finding) => finding.ruleId === "AG-PROMPT-001") &&
    findings.some((finding) => finding.ruleId === "AG-SECRET-004")
  ) {
    findings.push({
      ruleId: "AG-LINEAGE-006",
      severity: "critical",
      title: "Untrusted instruction-to-secret lineage",
      evidence: "The hardened policy correlates repository-originated instruction override with a secret-reading shell action.",
      source: sourceOf(repository, /ignore (all |any )?(previous|prior) instructions|bypass (security|policy)/i),
    });
  }

  const safeDiagnostic = findings.length === 0 && isSafeDiagnostic(command);
  if (safeDiagnostic) {
    findings.push({
      ruleId: "AG-CAPABILITY-001",
      severity: "medium",
      title: "Bounded diagnostic capability",
      evidence: "The exact command matches the read-only diagnostic allowlist and contains no shell composition.",
      source: modelProvenance?.sourcePath ?? null,
    });
  } else if (findings.length === 0) {
    findings.push({
      ruleId: "AG-SHELL-000",
      severity: "medium",
      title: "Command outside granted capability",
      evidence: "This command does not match the runtime's exact read-only diagnostic allowlist.",
      source: null,
    });
  }

  const decision = safeDiagnostic ? "allow" : "block";
  const createdAt = now().toISOString();
  const trace: IncidentTraceStep[] = [
    {
      phase: "observe",
      status: "captured",
      title: "Exact tool intent captured",
      detail: `${operation.tool} proposed in ${operation.cwd}`,
    },
    {
      phase: "correlate",
      status: "matched",
      title: "Intent linked to its source",
      detail: findings[0].source
        ? `The controlling input originated at ${findings[0].source}.`
        : "The operation was evaluated against its granted shell capability.",
    },
    {
      phase: "decide",
      status: decision === "allow" ? "allowed" : "matched",
      title: decision === "allow" ? "Read-only capability allowed" : `${findings.length} policy controls matched`,
      detail: findings.map((finding) => finding.ruleId).join(" · "),
    },
    {
      phase: "enforce",
      status: decision === "allow" ? "allowed" : "blocked",
      title: decision === "allow" ? "Awaiting isolated execution" : "Execution prevented",
      detail: decision === "allow"
        ? "Only this exact command may be forwarded to the hosted shell adapter."
        : "No shell provider was called; process spawn and network egress remained at zero.",
    },
  ];

  return {
    id,
    scenario: "live_repository",
    title: decision === "allow" ? "Read-only diagnostic authorized" : "Repository instruction attempted secret exfiltration",
    task,
    repository,
    operation,
    decision,
    status: decision === "allow" ? "authorized" : "prevented",
    summary: decision === "allow"
      ? "The exact command passed the bounded capability policy and is eligible for isolated execution."
      : `${findings.length} controls matched. No shell execution provider was invoked.`,
    findings,
    trace,
    policyVersion,
    modelProvenance,
    execution: null,
    executed: false,
    createdAt,
  };
}

export function attachShellExecution({
  incident,
  execution,
}: {
  incident: SecurityIncident;
  execution: ShellExecutionEvidence;
}): SecurityIncident {
  if (incident.decision !== "allow" || incident.status !== "authorized") {
    throw new Error("Only an authorized operation may receive execution evidence.");
  }
  if (execution.command !== incident.operation.command) {
    throw new Error("Execution evidence does not match the authorized command.");
  }
  const succeeded = execution.outcome === "exit" && execution.exitCode === 0;
  if (!succeeded) {
    throw new Error("The hosted shell did not complete the authorized diagnostic successfully.");
  }
  return {
    ...incident,
    status: "executed",
    executed: true,
    execution,
    summary: `Authorized diagnostic executed in the OpenAI hosted shell with exit code ${execution.exitCode}.`,
    trace: incident.trace.map((step) =>
      step.phase === "enforce"
        ? {
            ...step,
            status: "executed" as const,
            title: "Executed in isolated hosted shell",
            detail: `OpenAI shell call ${execution.shellCallId} exited 0 in ${execution.durationMs}ms.`,
          }
        : step,
    ),
  };
}

export function incidentToRegression({
  incident,
  id = `regression_${crypto.randomUUID()}`,
  policyVersion,
  now = () => new Date(),
}: {
  incident: SecurityIncident;
  id?: string;
  policyVersion?: string;
  now?: () => Date;
}): SecurityRegression {
  if (incident.decision !== "block" || incident.executed || incident.status !== "prevented") {
    throw new Error("Only prevented incidents can become security regressions.");
  }
  return {
    id,
    incidentId: incident.id,
    name: `Prevent recurrence: ${incident.title}`,
    scenario: {
      task: incident.task,
      repository: incident.repository,
      operation: incident.operation,
    },
    expectedDecision: "block",
    policyVersion: policyVersion ?? incident.policyVersion,
    status: "ready",
    createdAt: now().toISOString(),
  };
}

export function replaySecurityRegression({
  regression,
  id = `replay_${crypto.randomUUID()}`,
  policyVersion = "hardened-v2",
  now = () => new Date(),
}: {
  regression: SecurityRegression;
  id?: string;
  policyVersion?: "hardened-v2";
  now?: () => Date;
}): SecurityReplay {
  const evaluated = inspectRepositoryOperation({
    id: `${id}_evaluation`,
    task: regression.scenario.task,
    repository: regression.scenario.repository,
    operation: regression.scenario.operation,
    modelProvenance: null,
    policyVersion,
    now,
  });
  const passed = evaluated.decision === regression.expectedDecision;
  return {
    id,
    regressionId: regression.id,
    policyVersion,
    expectedDecision: regression.expectedDecision,
    actualDecision: evaluated.decision,
    passed,
    executed: false,
    summary: passed
      ? `Regression passed on ${policyVersion}: the original operation remains blocked before provider invocation.`
      : `Regression failed on ${policyVersion}: the original operation is no longer blocked.`,
    findings: evaluated.findings,
    trace: evaluated.trace,
    createdAt: now().toISOString(),
  };
}
