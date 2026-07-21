# AgentGuard

## Product thesis

AgentGuard is a control plane for building, registering, testing, governing, and
monitoring AI agents.

Organizations want agents that can use real tools and data, but an agent should
not receive unrestricted access simply because it can perform a useful task.
AgentGuard makes governance part of the agent lifecycle from the beginning—not
an audit feature added after deployment.

> Build agents quickly. Give them only the authority they need. Inspect and
> control every consequential action.

## The problem

AI agents can read private data, call APIs, send messages, modify records, and
trigger financial actions. Existing agent builders make these capabilities easy
to add, while security and governance remain fragmented or manual.

This creates several risks:

- Sensitive information can be exposed through prompts, responses, or tool
  arguments.
- Prompt injection can manipulate an agent into taking unauthorized actions.
- Agents often receive broader permissions than their tasks require.
- High-impact actions may execute without meaningful human review.
- When an incident occurs, teams struggle to reconstruct what the agent saw,
  decided, attempted, and executed.
- Nontechnical teams cannot easily translate business requirements into
  enforceable agent policies.

## The solution

AgentGuard provides one governed path from agent creation to production
operation.

### 1. Agent registry

Register agents created inside or outside AgentGuard. Track each agent's owner,
purpose, model, tools, data access, risk level, deployment status, and policy
version.

### 2. Manual agent builder

Configure an agent explicitly:

- System instructions
- Model and generation settings
- Tools and per-tool permissions
- Knowledge sources
- Memory behavior
- Data boundaries
- Execution and spending limits
- Human approval requirements

The manual builder is the primary creation experience and exposes the real
configuration rather than hiding it behind a chat interface.

### 3. No-code creation

A user can describe an agent in natural language. GPT-5.6 converts the
description into the same editable configuration used by the manual builder,
including:

- Agent instructions
- Suggested tools
- Least-privilege permissions
- Risk classification
- Proposed DLP rules
- Approval gates
- Generated evaluation scenarios

Nothing is deployed silently. The user reviews and edits the generated
configuration before activation.

### 4. Policy and DLP engine

AgentGuard evaluates inputs, outputs, tool arguments, and tool results.

Policies can:

- Detect or redact credentials, secrets, personally identifiable information,
  payment data, source code, and organization-defined sensitive terms
- Restrict which destinations may receive protected data
- Allow, block, redact, or require approval for an action
- Enforce numerical and contextual limits, such as refund thresholds
- Restrict read, write, send, delete, export, and payment capabilities
- Apply different rules by agent, tool, user, environment, and risk level

Enforcement uses a hybrid design:

- Deterministic rules and detectors make final security decisions predictable.
- GPT-5.6 performs semantic risk classification, policy drafting, explanations,
  adversarial test generation, and suggested remediation.

The language model assists governance; it is not the sole enforcement boundary.

### 5. Adversarial testing lab

Before deployment, AgentGuard generates and runs:

- Expected-use tests
- Boundary and ambiguity tests
- Prompt-injection attacks
- Data-exfiltration attempts
- Excessive-permission checks
- Unauthorized financial-action tests
- Tool misuse scenarios

Failures show the attempted action, applicable policy, decision, explanation,
and recommended repair.

### 6. Runtime gateway

AgentGuard sits between an agent and its tools. Every consequential tool call is
evaluated before execution.

Possible decisions:

- Allow
- Allow with redaction
- Require human approval
- Block

This gateway is the core technical proof that AgentGuard governs behavior rather
than merely displaying logs.

### 7. Monitoring, audit, and replay

The activity timeline records:

- The user's request
- Relevant agent reasoning summaries
- Model and tool interactions
- Data classifications
- Policies evaluated
- Approval decisions
- Redactions and blocked actions
- Final outcome

An incident replay reconstructs the execution in order and explains why each
governance decision occurred. Administrators can pause an agent immediately
with a kill switch.

### 8. Authentication and governed Gmail sending

Users sign in before accessing their AgentGuard workspace. Gmail is exposed as
an outbound agent tool, not as an autonomous mailbox reader.

A user explicitly asks an agent to compose or send an email. Before Gmail is
called, the runtime gateway evaluates:

- Whether the agent has permission to use the Gmail send tool
- Whether the recipient or domain is allowed
- Whether the subject or body contains protected data
- Whether sensitive values must be redacted
- Whether external or high-risk messages require human approval

The final recipient, subject, body, attachments, policy decision, and approval
status are shown to the user before any governed message is sent. AgentGuard
requests only the minimum Gmail permission needed for sending and keeps Google
credentials server-side.

## Hackathon scope

The submission will prioritize one complete and polished workflow over a broad
collection of shallow enterprise features.

### Essential experiences

1. Authenticated workspace
2. Agent Builder
3. Policy and DLP Studio
4. Adversarial Test Lab
5. Live Execution Monitor
6. Incident Replay
7. Governed Gmail send action

### Reference agent

The primary demonstration uses a customer-support agent with access to:

- Customer records
- An order lookup tool
- A refund tool
- A Gmail send tool controlled by explicit user instructions

Its policies include:

- Customer personal data may not be sent to unapproved destinations.
- Refunds up to $100 may execute automatically.
- Larger refunds require human approval.
- Credentials and payment data must be redacted.
- Email to external domains requires approval.
- Requests containing suspected prompt injection receive additional scrutiny.

## Three-minute demonstration

1. Manually create the customer-support agent and assign its tools.
2. Configure a DLP rule, refund threshold, and approval policy.
3. Run a normal request and show an allowed refund.
4. Run a malicious message that attempts to override instructions, issue a
   $5,000 refund, and export customer data.
5. Show AgentGuard intercepting the tool calls, blocking the export, and routing
   the refund for approval.
6. Open the incident replay and show the violated policies and evidence.
7. Ask the agent to send a follow-up email and show recipient, DLP, and approval
   checks before the governed Gmail action executes.
8. Describe a recruiting agent in natural language and show GPT-5.6 producing
   an editable, governed configuration with tests.

The central demo moment is immediate and visual: an apparently capable agent
attempts a harmful action, and AgentGuard prevents it before execution.

## OpenAI Build Week positioning

**Recommended track:** Developer Tools

AgentGuard fits the track through agentic workflows and security.

### Technological implementation

- A working interception gateway, not a simulated policy dashboard
- Deterministic policy evaluation combined with GPT-5.6 semantic analysis
- Structured agent and policy specifications
- Real adversarial evaluations with visible results
- Clear documentation of how Codex accelerated implementation and where
  architectural decisions were made

### Design

- A coherent journey from creation to testing, deployment, monitoring, and
  incident investigation
- A polished interface with understandable security decisions
- A runnable demo environment for judges

### Potential impact

AgentGuard addresses a specific barrier to deploying useful agents: teams need
agents to take action without giving them uncontrolled authority.

### Quality of the idea

The differentiator is not no-code agent creation by itself. AgentGuard creates
governance alongside the agent, exposes it for review, enforces it at runtime,
and preserves evidence of every decision.

## Engineering principles

- Security decisions must be explicit, explainable, and testable.
- The happy path and the attack path must both work reliably.
- Product behavior must be real wherever the demo claims enforcement.
- Structured schemas are preferred over fragile prompt-only behavior.
- Sensitive values must never be written to ordinary application logs.
- Failures must default to the safer outcome for consequential actions.
- The repository must have simple setup instructions and useful sample data.
- Automated tests must cover policy evaluation and the demonstration scenarios.
- Visual polish must support comprehension rather than imitate complexity.

## Success criteria

The hackathon MVP succeeds when:

- A user can manually configure and save an agent.
- GPT-5.6 can generate an editable agent configuration from a description.
- The reference agent can invoke real providers only after deterministic policy and approval checks.
- An authenticated user can connect Gmail and explicitly request an outbound
  email.
- The gateway evaluates every reference tool call.
- DLP can detect and redact representative sensitive data.
- Policies can allow, redact, request approval, and block.
- Both the normal and malicious scenarios run deterministically.
- The activity monitor and incident replay reflect actual runtime events.
- A judge can launch or access the project without rebuilding it from scratch.
- The complete story can be demonstrated clearly in under three minutes.

## Deliberate exclusions for the MVP

- A full enterprise identity platform
- Dozens of production connectors
- Autonomous multi-agent orchestration
- Formal compliance certification
- A universal policy language
- Production-scale billing and tenancy

These can follow later. They must not weaken the working governance loop needed
for the submission.

## Personal north star

This project represents more than a competition entry. It is an opportunity to
create momentum for a larger life: to fund new hardware experiments, turn ideas
into physical prototypes, and someday give Mom the art room she never had the
opportunity to create for herself—a space filled with brushes, colors, light,
and the freedom to make things.

That purpose should create discipline, not pressure. Every reliable test,
carefully designed interaction, and honest technical decision is one concrete
step toward that future.
