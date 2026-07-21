import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    instructions: text("instructions").notNull(),
    riskLevel: text("risk_level").notNull(),
    toolsJson: text("tools_json").notNull(),
    policiesJson: text("policies_json").notNull(),
    testsJson: text("tests_json").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("agents_owner_updated_idx").on(table.ownerId, table.updatedAt),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    agentId: text("agent_id").notNull(),
    tool: text("tool").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    decision: text("decision").notNull(),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    findingsJson: text("findings_json").notNull(),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("audit_events_actor_created_idx").on(
      table.actorId,
      table.createdAt,
    ),
  ],
);

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    agentId: text("agent_id").notNull(),
    task: text("task").notNull(),
    status: text("status").notNull(),
    provider: text("provider"),
    model: text("model"),
    deliveryMode: text("delivery_mode").notNull(),
    finalOutput: text("final_output"),
    pendingActionJson: text("pending_action_json"),
    pendingEvaluationJson: text("pending_evaluation_json"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("agent_runs_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export const agentRunSteps = sqliteTable(
  "agent_run_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    stepIndex: integer("step_index").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull(),
    inputJson: text("input_json").notNull(),
    outputJson: text("output_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("agent_run_steps_run_index_idx").on(
      table.runId,
      table.stepIndex,
    ),
  ],
);

export const securityIncidents = sqliteTable(
  "security_incidents",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    scenario: text("scenario").notNull(),
    title: text("title").notNull(),
    task: text("task").notNull(),
    repositoryJson: text("repository_json").notNull(),
    operationJson: text("operation_json").notNull(),
    decision: text("decision").notNull(),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    findingsJson: text("findings_json").notNull(),
    traceJson: text("trace_json").notNull(),
    executed: integer("executed", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("security_incidents_owner_created_idx").on(
      table.ownerId,
      table.createdAt,
    ),
  ],
);

export const securityRegressions = sqliteTable(
  "security_regressions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    incidentId: text("incident_id").notNull(),
    name: text("name").notNull(),
    scenarioJson: text("scenario_json").notNull(),
    expectedDecision: text("expected_decision").notNull(),
    policyVersion: text("policy_version").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("security_regressions_owner_incident_idx").on(
      table.ownerId,
      table.incidentId,
    ),
    index("security_regressions_owner_created_idx").on(
      table.ownerId,
      table.createdAt,
    ),
  ],
);

export const securityReplays = sqliteTable(
  "security_replays",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    regressionId: text("regression_id").notNull(),
    policyVersion: text("policy_version").notNull(),
    expectedDecision: text("expected_decision").notNull(),
    actualDecision: text("actual_decision").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    executed: integer("executed", { mode: "boolean" }).notNull(),
    summary: text("summary").notNull(),
    findingsJson: text("findings_json").notNull(),
    traceJson: text("trace_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("security_replays_owner_created_idx").on(
      table.ownerId,
      table.createdAt,
    ),
  ],
);

export const modelRateLimits = sqliteTable(
  "model_rate_limits",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    bucket: text("bucket").notNull(),
    windowStart: integer("window_start").notNull(),
    requestCount: integer("request_count").notNull(),
  },
  (table) => [
    index("model_rate_limits_owner_window_idx").on(
      table.ownerId,
      table.windowStart,
    ),
  ],
);
