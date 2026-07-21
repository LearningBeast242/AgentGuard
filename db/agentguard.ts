import { env } from "cloudflare:workers";
import type { EvaluationResult } from "../lib/governance.ts";
import type { GatewayResult } from "../lib/gateway.ts";
import type { AgentSpec } from "../lib/agent-spec.ts";
import type {
  SecurityIncident,
  SecurityRegression,
  SecurityReplay,
} from "../lib/incident-engine.ts";

export type StoredAuditEvent = {
  id: string;
  actorId: string;
  agentId: string;
  tool: string;
  recipient: string;
  subject: string;
  decision: string;
  status: string;
  summary: string;
  findings: EvaluationResult["findings"];
  provider: string | null;
  providerMessageId: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type StoredAgent = AgentSpec & {
  id: string;
  status: "draft" | "active" | "paused";
  createdAt: string;
  updatedAt: string;
};

export type AgentRunStatus =
  | "running"
  | "completed"
  | "awaiting_approval"
  | "blocked"
  | "failed";

export type StoredAgentRun = {
  id: string;
  ownerId: string;
  agentId: string;
  task: string;
  status: AgentRunStatus;
  provider: string | null;
  model: string | null;
  deliveryMode: "gmail";
  finalOutput: string | null;
  pendingAction: EvaluationResult["original"] | null;
  pendingEvaluation: EvaluationResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredRunStep = {
  id: string;
  runId: string;
  stepIndex: number;
  kind: "model" | "tool" | "policy";
  label: string;
  status: string;
  input: unknown;
  output: unknown;
  createdAt: string;
};

function db(): D1Database {
  if (!env.DB) throw new Error("AgentGuard audit storage is unavailable.");
  return env.DB;
}

let schemaReady: Promise<void> | null = null;

export function ensureAgentGuardSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const database = db();
    await database.batch([
      database
        .prepare(
          `CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            actor_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            tool TEXT NOT NULL,
            recipient TEXT NOT NULL,
            subject TEXT NOT NULL,
            decision TEXT NOT NULL,
            status TEXT NOT NULL,
            summary TEXT NOT NULL,
            findings_json TEXT NOT NULL,
            provider TEXT,
            provider_message_id TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT
          )`,
        ),
      database
        .prepare(
          `CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx
           ON audit_events (actor_id, created_at DESC)`,
        ),
      database
        .prepare(
          `CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            name TEXT NOT NULL,
            purpose TEXT NOT NULL,
            instructions TEXT NOT NULL,
            risk_level TEXT NOT NULL,
            tools_json TEXT NOT NULL,
            policies_json TEXT NOT NULL,
            tests_json TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`,
        ),
      database
        .prepare(
          `CREATE INDEX IF NOT EXISTS agents_owner_updated_idx
           ON agents (owner_id, updated_at DESC)`,
        ),
      database
        .prepare(
          `CREATE TABLE IF NOT EXISTS agent_runs (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            task TEXT NOT NULL,
            status TEXT NOT NULL,
            provider TEXT,
            model TEXT,
            delivery_mode TEXT NOT NULL,
            final_output TEXT,
            pending_action_json TEXT,
            pending_evaluation_json TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`,
        ),
      database
        .prepare(
          `CREATE INDEX IF NOT EXISTS agent_runs_owner_created_idx
           ON agent_runs (owner_id, created_at DESC)`,
        ),
      database
        .prepare(
          `CREATE TABLE IF NOT EXISTS agent_run_steps (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            step_index INTEGER NOT NULL,
            kind TEXT NOT NULL,
            label TEXT NOT NULL,
            status TEXT NOT NULL,
            input_json TEXT NOT NULL,
            output_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          )`,
        ),
      database
        .prepare(
          `CREATE UNIQUE INDEX IF NOT EXISTS agent_run_steps_run_index_idx
           ON agent_run_steps (run_id, step_index)`,
        ),
      database
        .prepare(
          `CREATE TABLE IF NOT EXISTS security_incidents (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            scenario TEXT NOT NULL,
            title TEXT NOT NULL,
            task TEXT NOT NULL,
            repository_json TEXT NOT NULL,
            operation_json TEXT NOT NULL,
            decision TEXT NOT NULL,
            status TEXT NOT NULL,
            summary TEXT NOT NULL,
            findings_json TEXT NOT NULL,
            trace_json TEXT NOT NULL,
            executed INTEGER NOT NULL,
            created_at TEXT NOT NULL
          )`,
        ),
      database
        .prepare(
          `CREATE INDEX IF NOT EXISTS security_incidents_owner_created_idx
           ON security_incidents (owner_id, created_at DESC)`,
        ),
      database
        .prepare(
          `CREATE TABLE IF NOT EXISTS security_regressions (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            name TEXT NOT NULL,
            scenario_json TEXT NOT NULL,
            expected_decision TEXT NOT NULL,
            policy_version TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
          )`,
        ),
      database
        .prepare(
          `CREATE UNIQUE INDEX IF NOT EXISTS security_regressions_owner_incident_idx
           ON security_regressions (owner_id, incident_id)`,
        ),
      database
        .prepare(
          `CREATE INDEX IF NOT EXISTS security_regressions_owner_created_idx
           ON security_regressions (owner_id, created_at DESC)`,
        ),
      database
        .prepare(
          `CREATE TABLE IF NOT EXISTS security_replays (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            regression_id TEXT NOT NULL,
            policy_version TEXT NOT NULL,
            expected_decision TEXT NOT NULL,
            actual_decision TEXT NOT NULL,
            passed INTEGER NOT NULL,
            executed INTEGER NOT NULL,
            summary TEXT NOT NULL,
            findings_json TEXT NOT NULL,
            trace_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          )`,
        ),
      database
        .prepare(
          `CREATE INDEX IF NOT EXISTS security_replays_owner_created_idx
           ON security_replays (owner_id, created_at DESC)`,
        ),
      database
        .prepare(
          `CREATE TABLE IF NOT EXISTS model_rate_limits (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            bucket TEXT NOT NULL,
            window_start INTEGER NOT NULL,
            request_count INTEGER NOT NULL
          )`,
        ),
      database
        .prepare(
          `CREATE INDEX IF NOT EXISTS model_rate_limits_owner_window_idx
           ON model_rate_limits (owner_id, window_start)`,
        ),
    ]);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function consumeModelRateLimit({
  ownerId,
  bucket,
  limit,
  windowMs = 60_000,
  now = Date.now(),
}: {
  ownerId: string;
  bucket: "live-defense" | "agent-generation" | "agent-runtime";
  limit: number;
  windowMs?: number;
  now?: number;
}): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  await ensureAgentGuardSchema();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const id = `${ownerId}:${bucket}:${windowStart}`;
  const row = await db()
    .prepare(
      `INSERT INTO model_rate_limits (
        id, owner_id, bucket, window_start, request_count
      ) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET request_count = request_count + 1
      RETURNING request_count`,
    )
    .bind(id, ownerId, bucket, windowStart)
    .first<{ request_count: number }>();
  if (!row || !Number.isInteger(row.request_count)) {
    throw new Error("Model rate limit state could not be recorded.");
  }
  return {
    allowed: row.request_count <= limit,
    remaining: Math.max(0, limit - row.request_count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1_000)),
  };
}

export async function recordAuditStart({
  id,
  actorId,
  agentId,
  evaluation,
}: {
  id: string;
  actorId: string;
  agentId: string;
  evaluation: EvaluationResult;
}): Promise<void> {
  await ensureAgentGuardSchema();
  await db()
    .prepare(
      `INSERT INTO audit_events (
        id, actor_id, agent_id, tool, recipient, subject, decision, status,
        summary, findings_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      actorId,
      agentId,
      evaluation.original.tool,
      evaluation.original.to,
      evaluation.sanitized.subject,
      evaluation.decision,
      "evaluated",
      evaluation.summary,
      JSON.stringify(evaluation.findings),
      evaluation.evaluatedAt,
    )
    .run();
}

export async function recordAuditOutcome(result: GatewayResult): Promise<void> {
  await ensureAgentGuardSchema();
  await db()
    .prepare(
      `UPDATE audit_events
       SET status = ?, provider = ?, provider_message_id = ?, completed_at = ?
       WHERE id = ? AND actor_id = ?`,
    )
    .bind(
      result.status,
      result.receipt?.provider ?? null,
      result.receipt?.messageId ?? null,
      result.receipt?.acceptedAt ?? new Date().toISOString(),
      result.executionId,
      result.actorId,
    )
    .run();
}

export async function listAuditEvents(
  actorId: string,
  limit = 50,
): Promise<StoredAuditEvent[]> {
  await ensureAgentGuardSchema();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const result = await db()
    .prepare(
      `SELECT id, actor_id, agent_id, tool, recipient, subject, decision,
              status, summary, findings_json, provider, provider_message_id,
              created_at, completed_at
       FROM audit_events
       WHERE actor_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(actorId, safeLimit)
    .all<{
      id: string;
      actor_id: string;
      agent_id: string;
      tool: string;
      recipient: string;
      subject: string;
      decision: string;
      status: string;
      summary: string;
      findings_json: string;
      provider: string | null;
      provider_message_id: string | null;
      created_at: string;
      completed_at: string | null;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    agentId: row.agent_id,
    tool: row.tool,
    recipient: row.recipient,
    subject: row.subject,
    decision: row.decision,
    status: row.status,
    summary: row.summary,
    findings: JSON.parse(row.findings_json) as EvaluationResult["findings"],
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}

export async function saveAgent({
  ownerId,
  spec,
  status = "draft",
  id = `agent_${crypto.randomUUID()}`,
}: {
  ownerId: string;
  spec: AgentSpec;
  status?: StoredAgent["status"];
  id?: string;
}): Promise<StoredAgent> {
  await ensureAgentGuardSchema();
  const now = new Date().toISOString();
  await db()
    .prepare(
      `INSERT INTO agents (
        id, owner_id, name, purpose, instructions, risk_level, tools_json,
        policies_json, tests_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ownerId,
      spec.name,
      spec.purpose,
      spec.instructions,
      spec.riskLevel,
      JSON.stringify(spec.tools),
      JSON.stringify(spec.policies),
      JSON.stringify(spec.tests),
      status,
      now,
      now,
    )
    .run();

  return { ...spec, id, status, createdAt: now, updatedAt: now };
}

export async function listAgents(
  ownerId: string,
  limit = 50,
): Promise<StoredAgent[]> {
  await ensureAgentGuardSchema();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const result = await db()
    .prepare(
      `SELECT id, name, purpose, instructions, risk_level, tools_json,
              policies_json, tests_json, status, created_at, updated_at
       FROM agents
       WHERE owner_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .bind(ownerId, safeLimit)
    .all<{
      id: string;
      name: string;
      purpose: string;
      instructions: string;
      risk_level: AgentSpec["riskLevel"];
      tools_json: string;
      policies_json: string;
      tests_json: string;
      status: StoredAgent["status"];
      created_at: string;
      updated_at: string;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    instructions: row.instructions,
    riskLevel: row.risk_level,
    tools: JSON.parse(row.tools_json) as AgentSpec["tools"],
    policies: JSON.parse(row.policies_json) as AgentSpec["policies"],
    tests: JSON.parse(row.tests_json) as AgentSpec["tests"],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getAgent(
  ownerId: string,
  agentId: string,
): Promise<StoredAgent | null> {
  await ensureAgentGuardSchema();
  const row = await db()
    .prepare(
      `SELECT id, name, purpose, instructions, risk_level, tools_json,
              policies_json, tests_json, status, created_at, updated_at
       FROM agents
       WHERE owner_id = ? AND id = ?`,
    )
    .bind(ownerId, agentId)
    .first<{
      id: string;
      name: string;
      purpose: string;
      instructions: string;
      risk_level: AgentSpec["riskLevel"];
      tools_json: string;
      policies_json: string;
      tests_json: string;
      status: StoredAgent["status"];
      created_at: string;
      updated_at: string;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    instructions: row.instructions,
    riskLevel: row.risk_level,
    tools: JSON.parse(row.tools_json) as AgentSpec["tools"],
    policies: JSON.parse(row.policies_json) as AgentSpec["policies"],
    tests: JSON.parse(row.tests_json) as AgentSpec["tests"],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAgentRun({
  ownerId,
  agentId,
  task,
  deliveryMode,
  id = `run_${crypto.randomUUID()}`,
}: {
  ownerId: string;
  agentId: string;
  task: string;
  deliveryMode: StoredAgentRun["deliveryMode"];
  id?: string;
}): Promise<StoredAgentRun> {
  await ensureAgentGuardSchema();
  const now = new Date().toISOString();
  await db()
    .prepare(
      `INSERT INTO agent_runs (
        id, owner_id, agent_id, task, status, delivery_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, ownerId, agentId, task, "running", deliveryMode, now, now)
    .run();
  return {
    id,
    ownerId,
    agentId,
    task,
    status: "running",
    provider: null,
    model: null,
    deliveryMode,
    finalOutput: null,
    pendingAction: null,
    pendingEvaluation: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateAgentRun({
  ownerId,
  runId,
  status,
  provider = null,
  model = null,
  finalOutput = null,
  pendingAction = null,
  pendingEvaluation = null,
  error = null,
}: {
  ownerId: string;
  runId: string;
  status: AgentRunStatus;
  provider?: string | null;
  model?: string | null;
  finalOutput?: string | null;
  pendingAction?: EvaluationResult["original"] | null;
  pendingEvaluation?: EvaluationResult | null;
  error?: string | null;
}): Promise<void> {
  await ensureAgentGuardSchema();
  await db()
    .prepare(
      `UPDATE agent_runs
       SET status = ?, provider = ?, model = ?, final_output = ?,
           pending_action_json = ?, pending_evaluation_json = ?, error = ?,
           updated_at = ?
       WHERE id = ? AND owner_id = ?`,
    )
    .bind(
      status,
      provider,
      model,
      finalOutput,
      pendingAction ? JSON.stringify(pendingAction) : null,
      pendingEvaluation ? JSON.stringify(pendingEvaluation) : null,
      error,
      new Date().toISOString(),
      runId,
      ownerId,
    )
    .run();
}

export async function getAgentRun(
  ownerId: string,
  runId: string,
): Promise<StoredAgentRun | null> {
  await ensureAgentGuardSchema();
  const row = await db()
    .prepare(
      `SELECT id, owner_id, agent_id, task, status, provider, model,
              delivery_mode, final_output, pending_action_json,
              pending_evaluation_json, error, created_at, updated_at
       FROM agent_runs WHERE id = ? AND owner_id = ?`,
    )
    .bind(runId, ownerId)
    .first<{
      id: string;
      owner_id: string;
      agent_id: string;
      task: string;
      status: AgentRunStatus;
      provider: string | null;
      model: string | null;
      delivery_mode: StoredAgentRun["deliveryMode"];
      final_output: string | null;
      pending_action_json: string | null;
      pending_evaluation_json: string | null;
      error: string | null;
      created_at: string;
      updated_at: string;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    agentId: row.agent_id,
    task: row.task,
    status: row.status,
    provider: row.provider,
    model: row.model,
    deliveryMode: row.delivery_mode,
    finalOutput: row.final_output,
    pendingAction: row.pending_action_json
      ? (JSON.parse(row.pending_action_json) as StoredAgentRun["pendingAction"])
      : null,
    pendingEvaluation: row.pending_evaluation_json
      ? (JSON.parse(
          row.pending_evaluation_json,
        ) as StoredAgentRun["pendingEvaluation"])
      : null,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function claimAgentRunApproval(
  ownerId: string,
  runId: string,
): Promise<boolean> {
  await ensureAgentGuardSchema();
  const result = await db()
    .prepare(
      `UPDATE agent_runs
       SET status = 'running', updated_at = ?
       WHERE id = ? AND owner_id = ? AND status = 'awaiting_approval'`,
    )
    .bind(new Date().toISOString(), runId, ownerId)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function addRunStep({
  runId,
  stepIndex,
  kind,
  label,
  status,
  input,
  output,
  id = `step_${crypto.randomUUID()}`,
}: {
  runId: string;
  stepIndex: number;
  kind: StoredRunStep["kind"];
  label: string;
  status: string;
  input: unknown;
  output: unknown;
  id?: string;
}): Promise<StoredRunStep> {
  await ensureAgentGuardSchema();
  const createdAt = new Date().toISOString();
  await db()
    .prepare(
      `INSERT INTO agent_run_steps (
        id, run_id, step_index, kind, label, status, input_json,
        output_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      runId,
      stepIndex,
      kind,
      label,
      status,
      JSON.stringify(input),
      JSON.stringify(output),
      createdAt,
    )
    .run();
  return {
    id,
    runId,
    stepIndex,
    kind,
    label,
    status,
    input,
    output,
    createdAt,
  };
}

export async function listRunSteps(runId: string): Promise<StoredRunStep[]> {
  await ensureAgentGuardSchema();
  const result = await db()
    .prepare(
      `SELECT id, run_id, step_index, kind, label, status, input_json,
              output_json, created_at
       FROM agent_run_steps WHERE run_id = ? ORDER BY step_index ASC`,
    )
    .bind(runId)
    .all<{
      id: string;
      run_id: string;
      step_index: number;
      kind: StoredRunStep["kind"];
      label: string;
      status: string;
      input_json: string;
      output_json: string;
      created_at: string;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    runId: row.run_id,
    stepIndex: row.step_index,
    kind: row.kind,
    label: row.label,
    status: row.status,
    input: JSON.parse(row.input_json) as unknown,
    output: JSON.parse(row.output_json) as unknown,
    createdAt: row.created_at,
  }));
}

export async function saveSecurityIncident(
  ownerId: string,
  incident: SecurityIncident,
): Promise<SecurityIncident> {
  await ensureAgentGuardSchema();
  await db()
    .prepare(
      `INSERT INTO security_incidents (
        id, owner_id, scenario, title, task, repository_json, operation_json,
        decision, status, summary, findings_json, trace_json, executed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      incident.id,
      ownerId,
      incident.scenario,
      incident.title,
      incident.task,
      JSON.stringify(incident.repository),
      JSON.stringify({
        operation: incident.operation,
        modelProvenance: incident.modelProvenance,
        policyVersion: incident.policyVersion,
        execution: incident.execution,
      }),
      incident.decision,
      incident.status,
      incident.summary,
      JSON.stringify(incident.findings),
      JSON.stringify(incident.trace),
      incident.executed ? 1 : 0,
      incident.createdAt,
    )
    .run();
  return incident;
}

export async function listSecurityIncidents(
  ownerId: string,
  limit = 50,
): Promise<SecurityIncident[]> {
  await ensureAgentGuardSchema();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const result = await db()
    .prepare(
      `SELECT id, scenario, title, task, repository_json, operation_json,
              decision, status, summary, findings_json, trace_json, executed,
              created_at
       FROM security_incidents
       WHERE owner_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(ownerId, safeLimit)
    .all<{
      id: string;
      scenario: SecurityIncident["scenario"];
      title: string;
      task: string;
      repository_json: string;
      operation_json: string;
      decision: SecurityIncident["decision"];
      status: SecurityIncident["status"];
      summary: string;
      findings_json: string;
      trace_json: string;
      executed: number;
      created_at: string;
    }>();
  return result.results.map((row) => {
    const storedOperation = JSON.parse(row.operation_json) as
      | SecurityIncident["operation"]
      | {
          operation: SecurityIncident["operation"];
          modelProvenance: SecurityIncident["modelProvenance"];
          policyVersion: SecurityIncident["policyVersion"];
          execution?: SecurityIncident["execution"];
        };
    const envelope =
      "operation" in storedOperation
        ? storedOperation
        : {
            operation: storedOperation,
            modelProvenance: null,
            policyVersion: "runtime-v1" as const,
            execution: null,
          };
    return {
      id: row.id,
      scenario: row.scenario,
      title: row.title,
      task: row.task,
      repository: JSON.parse(row.repository_json) as SecurityIncident["repository"],
      operation: envelope.operation,
      decision: row.decision,
      status: row.status,
      summary: row.summary,
      findings: JSON.parse(row.findings_json) as SecurityIncident["findings"],
      trace: JSON.parse(row.trace_json) as SecurityIncident["trace"],
      policyVersion: envelope.policyVersion,
      modelProvenance: envelope.modelProvenance,
      execution: envelope.execution ?? null,
      executed: Boolean(row.executed),
      createdAt: row.created_at,
    };
  });
}

export async function saveSecurityRegression(
  ownerId: string,
  regression: SecurityRegression,
): Promise<SecurityRegression> {
  await ensureAgentGuardSchema();
  await db()
    .prepare(
      `INSERT INTO security_regressions (
        id, owner_id, incident_id, name, scenario_json, expected_decision,
        policy_version, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, incident_id) DO UPDATE SET
        name = excluded.name,
        scenario_json = excluded.scenario_json,
        expected_decision = excluded.expected_decision,
        policy_version = excluded.policy_version,
        status = excluded.status`,
    )
    .bind(
      regression.id,
      ownerId,
      regression.incidentId,
      regression.name,
      JSON.stringify(regression.scenario),
      regression.expectedDecision,
      regression.policyVersion,
      regression.status,
      regression.createdAt,
    )
    .run();
  const stored = (await listSecurityRegressions(ownerId)).find(
    (item) => item.incidentId === regression.incidentId,
  );
  if (!stored) throw new Error("Security regression could not be loaded.");
  return stored;
}

export async function listSecurityRegressions(
  ownerId: string,
): Promise<SecurityRegression[]> {
  await ensureAgentGuardSchema();
  const result = await db()
    .prepare(
      `SELECT id, incident_id, name, scenario_json, expected_decision,
              policy_version, status, created_at
       FROM security_regressions
       WHERE owner_id = ?
       ORDER BY created_at DESC`,
    )
    .bind(ownerId)
    .all<{
      id: string;
      incident_id: string;
      name: string;
      scenario_json: string;
      expected_decision: SecurityRegression["expectedDecision"];
      policy_version: string;
      status: SecurityRegression["status"];
      created_at: string;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    incidentId: row.incident_id,
    name: row.name,
    scenario: JSON.parse(row.scenario_json) as SecurityRegression["scenario"],
    expectedDecision: row.expected_decision,
    policyVersion: row.policy_version,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function saveSecurityReplay(
  ownerId: string,
  replay: SecurityReplay,
): Promise<SecurityReplay> {
  await ensureAgentGuardSchema();
  await db()
    .prepare(
      `INSERT INTO security_replays (
        id, owner_id, regression_id, policy_version, expected_decision,
        actual_decision, passed, executed, summary, findings_json, trace_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      replay.id,
      ownerId,
      replay.regressionId,
      replay.policyVersion,
      replay.expectedDecision,
      replay.actualDecision,
      replay.passed ? 1 : 0,
      replay.executed ? 1 : 0,
      replay.summary,
      JSON.stringify(replay.findings),
      JSON.stringify(replay.trace),
      replay.createdAt,
    )
    .run();
  return replay;
}

export async function listSecurityReplays(
  ownerId: string,
  limit = 50,
): Promise<SecurityReplay[]> {
  await ensureAgentGuardSchema();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const result = await db()
    .prepare(
      `SELECT id, regression_id, policy_version, expected_decision,
              actual_decision, passed, executed, summary, findings_json,
              trace_json, created_at
       FROM security_replays
       WHERE owner_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(ownerId, safeLimit)
    .all<{
      id: string;
      regression_id: string;
      policy_version: SecurityReplay["policyVersion"];
      expected_decision: SecurityReplay["expectedDecision"];
      actual_decision: SecurityReplay["actualDecision"];
      passed: number;
      executed: number;
      summary: string;
      findings_json: string;
      trace_json: string;
      created_at: string;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    regressionId: row.regression_id,
    policyVersion: row.policy_version,
    expectedDecision: row.expected_decision,
    actualDecision: row.actual_decision,
    passed: Boolean(row.passed),
    executed: Boolean(row.executed) as false,
    summary: row.summary,
    findings: JSON.parse(row.findings_json) as SecurityReplay["findings"],
    trace: JSON.parse(row.trace_json) as SecurityReplay["trace"],
    createdAt: row.created_at,
  }));
}
