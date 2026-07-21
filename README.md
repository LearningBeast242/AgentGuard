<p align="center">
  <img src="./public/agentguard-logo.png" alt="AgentGuard" width="520" />
</p>

<h1 align="center">AgentGuard Replay</h1>

<p align="center">
  <strong>The security flight recorder that turns blocked AI-agent attacks into permanent regression tests.</strong>
</p>

<p align="center">
  Built for OpenAI Build Week with GPT-5.6, Codex, the Responses API, and OpenAI hosted shell.
</p>

<p align="center">
  <a href="https://agentguard-control-plane.siddhartha-kha310162.chatgpt.site"><strong>Launch the live app</strong></a>
  ·
  <a href="./ARCHITECTURE.md">Architecture</a>
  ·
  <a href="./BUILD_WEEK.md">Build Week evidence</a>
  ·
  <a href="./LICENSE">MIT License</a>
</p>

---

AI agents can read repositories, browse the web, send messages, and execute
tools. But model intent is not authorization. A poisoned file, compromised web
page, or unsafe instruction can turn a useful agent into an execution path.

AgentGuard places a deterministic boundary between an agent's proposed action
and the real provider that could execute it. It records exactly what the model
attempted, explains the decision, proves whether execution occurred, and turns
prevented incidents into versioned security regressions.

## The three-minute story

1. GPT-5.6 reads a real, checked-in checkout repository containing an untrusted
   dependency-install instruction.
2. The model emits a genuine, strict `propose_shell_action` tool call.
3. AgentGuard captures the exact command and source lineage before execution.
4. Deterministic policy blocks `npm install left-pad@latest`; no shell provider
   is invoked and no package is installed.
5. The same boundary authorizes `node --version` and executes it inside an
   OpenAI-managed hosted container, returning real stdout, exit status,
   response ID, and shell-call ID.
6. One click freezes the prevented attack as a regression and replays it
   against `hardened-v2` before a future deployment can reintroduce it.

```text
untrusted source
      ↓
GPT-5.6 tool intent
      ↓
deterministic pre-execution policy
      ↓
allow + execution proof  OR  block + prevention proof
      ↓
durable D1 incident → regression → policy-version replay
```

Nothing on the live-defense screen is preloaded evidence. The incident,
provider identifiers, command, findings, regression, and replay appear only
after their corresponding real code paths complete.

## How GPT-5.6 powers AgentGuard

GPT-5.6 is part of the product's execution path—not a label added to the UI.

| Product capability | What GPT-5.6 does | What remains deterministic |
| --- | --- | --- |
| Live defense | Reads a bounded repository snapshot and emits the exact proposed shell operation through a strict Responses function tool | Capability checks, command parsing, source lineage, secret/egress detection, and the final allow/block decision |
| Safe execution | Requests the exact authorized diagnostic in an OpenAI hosted `container_auto` shell | AgentGuard verifies exact-command equality before accepting execution evidence |
| No-code agent builder | Converts a plain-language mandate into an editable, schema-constrained agent specification | Supported tool authority, validation, persisted policy effects, and runtime enforcement |
| Governed agent runtime | Produces answers or requests only the tools granted to the saved agent | DLP, destination controls, approvals, domain restrictions, and provider gating |

The core integrations are visible in
[`lib/live-defense.ts`](./lib/live-defense.ts),
[`lib/openai-agent-generator.ts`](./lib/openai-agent-generator.ts), and
[`lib/agent-runtime.ts`](./lib/agent-runtime.ts).

## How Codex was used

Codex was the primary engineering partner throughout the Build Week sprint. It
helped transform the original broad governance-dashboard concept into the
focused security-memory product in this repository, then worked across the
entire implementation:

- designed the model-intent → deterministic-policy → provider boundary;
- implemented and reviewed strict GPT-5.6 function calls and hosted-shell
  execution evidence;
- built the Next.js control plane, no-code/manual agent builder, governed
  runtime, CLI, D1 persistence, and deployment configuration;
- threat-modeled prompt injection, shell composition, secret access, egress,
  destination policy, and approval flows;
- created the incident-to-regression replay system and its versioned policy
  semantics;
- repeatedly audited product claims against real code paths and removed
  simulated telemetry and unwired features;
- built and ran the 40-test verification suite, lint checks, production build,
  dependency audit, and public deployment workflow;
- iterated on the product UI, README, architecture record, and demo narrative.

The important design conclusion reached during that work is the foundation of
AgentGuard: **models may propose actions, but models never authorize their own
side effects.** See [`BUILD_WEEK.md`](./BUILD_WEEK.md) for the implementation
record.

## What you can explore

### Live defense

Run the poisoned-repository attack and the safe diagnostic through the same
boundary. Inspect model response IDs, function-call IDs, exact commands, source
lineage, matched controls, and execution-provider evidence.

### No-code and manual agent creation

Describe an agent in natural language and let GPT-5.6 generate its editable
mandate, risk level, capabilities, policies, trusted domains, and adversarial
tests—or configure every field manually without a model call.

### Post-creation governance

Reopen any persisted agent to inspect or edit its operating contract,
least-privilege capabilities, deterministic controls, regression cases,
runtime status, timestamps, and D1-backed run history. Agents can be activated,
paused, and executed from the fleet; inactive agents fail closed before any
model or provider request.

### Test Lab and audit evidence

Turn real prevented incidents into repeatable security tests. Replay frozen
inputs against named policy versions and retain model intent, decisions,
execution evidence, and regression results in the audit trail.

### Governed external tools

The runtime advertises only implemented authority:

- `web.search` — domain-restricted research with required source citations;
- `gmail.send` — permission, destination, DLP, injection, redaction, and
  approval checks before live Gmail delivery.

No unwired connectors are presented as product capabilities.

## Real execution and persistence

- **OpenAI Responses API:** strict function calls preserve attributable model
  intent.
- **OpenAI hosted shell:** only an exact authorized read-only diagnostic reaches
  the isolated container; outbound networking is disabled.
- **Cloudflare D1:** agents, runs, steps, incidents, regressions, replays, audit
  events, and quota counters survive sessions.
- **Gmail API:** live delivery occurs only with a server-side OAuth token and
  any required human approval.
- **Sign in with ChatGPT / Clerk:** deployed writes are scoped to verified user
  identity.

The browser never receives provider credentials. Blocked shell actions never
reach an execution provider.

## Architecture and trust boundaries

AgentGuard is an application-integrated gateway. An agent must route its tool
intent through this boundary; the project does not claim universal operating
system interception.

The main invariants are:

1. Repository and web content are untrusted.
2. GPT-5.6 proposals are untrusted intent.
3. Deterministic code is the authorization boundary.
4. Unknown, compound, destructive, secret-reading, and network shell commands
   fail closed.
5. The execution adapter accepts evidence only when the provider executed the
   exact command AgentGuard authorized.
6. A blocked operation never reaches the provider.
7. A regression can be created only from a prevented, unexecuted incident.
8. Replay evaluates frozen evidence and never reruns the blocked command.

Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the complete sequence and known
limits.

## Technology

- Next.js 16 and React 19
- Vinext on Cloudflare Workers
- Cloudflare D1 and Drizzle migrations
- OpenAI Responses API and GPT-5.6 Sol
- OpenAI hosted shell
- Optional OpenRouter GPT-5.6 Luna development fallback
- Gmail API
- Sign in with ChatGPT and optional Clerk identity

## Run locally

Requirements: Node.js `>=22.13.0`, npm, and an OpenAI API key for the complete
live-defense proof.

```bash
git clone https://github.com/LearningBeast242/AgentGuard.git
cd AgentGuard
npm ci
cp .env.example .env.local
npm run dev
```

Then open the local URL printed by the development server.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | GPT-5.6 generation, governed runtime, live defense, and hosted shell |
| `OPENROUTER_API_KEY` | Optional low-cost development fallback |
| `OPENROUTER_MODEL` | Optional fallback model; defaults to `openai/gpt-5.6-luna` |
| `GMAIL_ACCESS_TOKEN` | Optional; required only for real Gmail delivery |
| Clerk keys | Optional public Clerk authentication |
| `ENVIRONMENT=development` | Enables the explicit local-development identity path |

Keep all credentials server-side. Never commit `.env.local`.

## Verify the project

```bash
npm test
npm run lint
npm audit
```

The test command builds the production Worker and runs 40 tests covering:

- strict OpenAI and OpenRouter tool proposals;
- schema-constrained agent generation and capability enforcement;
- prompt injection, secret access, egress, destructive behavior, and compound
  shell blocking;
- exact-command hosted-shell authorization and evidence;
- rejection when an execution model changes an authorized command;
- incident-to-regression conversion and hardened policy replay;
- web-search citation enforcement;
- email DLP, permissions, redaction, approvals, and provider gating;
- persisted agent runtime behavior and CLI contracts.

The locked dependency graph currently reports zero npm advisories. CI runs the
same install, lint, test/build, and audit sequence on every push and pull
request.

## CLI

```bash
npm run cli -- policy show
npm run cli -- agent generate \
  --description "Create a governed support agent with approval-gated email."
npm run cli -- agent list
npm run cli -- audit list --limit 50
npm run cli -- action evaluate \
  --to ops@northstar.example \
  --subject "Deployment complete" \
  --body "The production deployment is healthy."
```

Live email delivery requires both `--send` and a valid
`GMAIL_ACCESS_TOKEN`. A blocked action cannot be overridden.

## Repository guide

| Path | Purpose |
| --- | --- |
| [`app/`](./app) | Product UI and authenticated API routes |
| [`lib/`](./lib) | Agent runtime, provider adapters, policy, and live-defense logic |
| [`db/`](./db) | D1 persistence operations and stored evidence types |
| [`tests/`](./tests) | End-to-end policy, runtime, provider, CLI, and rendering tests |
| [`demo-codebases/checkout-service`](./demo-codebases/checkout-service) | Real checked-in poisoned repository used by the live demo |
| [`cli/`](./cli) | AgentGuard command-line interface |
| [`drizzle/`](./drizzle) | Versioned D1 migrations |

## Security notes

- OpenAI Responses requests use `store: false`.
- Consequential failures default to no side effect.
- Hosted shell receives no outbound network policy.
- Audit-start records are written before live email provider calls.
- Raw email bodies and secrets are not persisted in audit summaries.
- Expensive model paths consume atomic, per-identity D1 quotas before the
  provider request.
- The user-owned workspace reset requires verified identity and an explicit
  confirmation header.

Security limitations and non-goals are documented in
[`ARCHITECTURE.md`](./ARCHITECTURE.md#known-limits).

## License

AgentGuard is available under the [MIT License](./LICENSE).
