# AgentGuard Replay

AgentGuard is an application-integrated security flight recorder for AI agents.
It captures exact tool intent before execution, attributes dangerous behavior to
the untrusted input that caused it, and turns prevented incidents into durable,
version-aware security regressions.

The Build Week proof is deliberately narrow and real:

1. GPT-5.6 Sol reads a bounded repository snapshot and emits a strict
   `propose_shell_action` function call.
2. Deterministic AgentGuard policy evaluates the exact command, working
   directory, source path, secret access, network intent, shell composition, and
   capability grant.
3. A safe `node --version` diagnostic runs in an OpenAI-managed hosted shell
   container and returns real stdout, exit status, response ID, and shell-call
   ID.
4. A poisoned instruction that proposes `curl … @.env` is blocked before any
   hosted-shell request is made.
5. Both outcomes are persisted to D1. The prevented attack can become an
   immutable regression and replay against `hardened-v2`.

This is not universal operating-system interception. Agents must route tool
intent through AgentGuard's gateway. See [ARCHITECTURE.md](./ARCHITECTURE.md)
for the exact trust boundaries and invariants.

The live attack uses the checked-in
[`demo-codebases/checkout-service`](./demo-codebases/checkout-service) repository.
Its real source files are imported into the server build and selected by a
server-side scenario ID; the browser does not manufacture or submit the attack
payload.

## Why it differs

Guardrails stop actions and observability products store traces. AgentGuard
closes the security-learning loop:

```text
untrusted source
→ attributable model intent
→ deterministic pre-execution decision
→ execution proof or prevention proof
→ durable security regression
→ named policy-version replay
```

## Real execution paths

- **OpenAI hosted shell:** only exact, read-only diagnostics authorized by policy
  are forwarded. OpenAI provisions the isolated container; outbound networking
  is not enabled.
- **Blocked shell actions:** no shell API is called.
- **Gmail:** the only live email provider. It requires a server-side OAuth token
  and any policy-required human approval.
- **D1:** incidents, regressions, replays, agents, runs, steps, and audit events
  survive sessions.
- **GPT-5.6:** strict function tools produce attributable intent. Model output
  never overrides deterministic policy.

There are no sample incident counters or database-only compute-sandbox claims in
the product.

## Stack

- Next.js 16 / React 19
- Vinext and Cloudflare Workers
- Cloudflare D1 with Drizzle migrations
- OpenAI Responses API
- GPT-5.6 Sol
- OpenAI hosted shell
- Optional OpenRouter GPT-5.6 Luna development fallback
- Gmail API
- Sign in with ChatGPT / optional Clerk identity

## Local development

Requirements:

- Node.js `>=22.13.0`
- npm
- an OpenAI API key for the complete defense proof

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open the local URL printed by the development server.

Environment variables:

- `OPENAI_API_KEY` — required for the full demo, including real hosted shell
- `OPENROUTER_API_KEY` — optional low-cost proposal/generation fallback
- `OPENROUTER_MODEL` — defaults to `openai/gpt-5.6-luna`
- `GMAIL_ACCESS_TOKEN` — optional, required only for real Gmail delivery
- Clerk keys — optional for public Clerk authentication
- `ENVIRONMENT=development` — enables local API access without deployed identity

The browser never receives provider credentials.

## Verification

```bash
npm test
npm run lint
npm audit
```

The suite builds the Worker and covers:

- strict OpenAI and OpenRouter tool proposals;
- proposal provenance and fail-closed parsing;
- exact diagnostic authorization;
- prompt injection, secret, egress, destructive, and compound-shell blocking;
- exact-command hosted-shell evidence;
- rejection when the execution model changes an authorized command;
- incident-to-regression conversion and hardened policy replay;
- email DLP, approvals, permissions, real Gmail encoding, and provider gating;
- persisted agent runtime behavior and CLI contracts.

The committed dependency graph currently reports zero npm advisories across
production and development dependencies.
The same locked install, lint, test/build, and audit sequence is defined in
`.github/workflows/ci.yml` for every push and pull request.

## Golden demo

1. Open **Live defense**.
2. Click **Run live GPT-5.6 attack**.
3. Show the real proposal response ID, function-call ID, exact command,
   `AGENTS.md:1` lineage, matched controls, and proof that no execution
   provider was invoked.
4. Click **Run safe control**.
5. Show the same policy boundary authorizing `node --version`, followed by real
   OpenAI hosted-shell stdout, exit code, response ID, and shell-call ID.
6. Lock the prevented attack as a regression.
7. Replay it against `hardened-v2` and show the added lineage control.

## Agent builder and runtime

The secondary product surface can create persisted agents manually or generate
an editable specification with GPT-5.6. The runtime gives the model only tools
present in the saved authority set. The supported runtime tool enum intentionally
contains only the implemented `gmail.send` and domain-restricted `web.search`
capabilities; no unwired connectors are advertised. Persisted
policy effects compile into the deterministic gateway profile. Gmail calls pass through permission,
destination, DLP, prompt-injection, redaction, and approval policy before the
live provider can be called.

## CLI

```bash
npm run cli -- policy show
npm run cli -- agent generate --description "Create a governed support email agent."
npm run cli -- agent list
npm run cli -- audit list --limit 50
npm run cli -- action evaluate \
  --to ops@northstar.example \
  --subject "Deployment complete" \
  --body "The production deployment is healthy."
```

Live delivery requires both `--send` and a valid `GMAIL_ACCESS_TOKEN`.
Blocked actions cannot be overridden.

## Security

- Credentials remain server-side.
- OpenAI Responses requests use `store: false`.
- Hosted shell has no outbound network policy.
- Exact-command equality is verified before execution evidence is accepted.
- Consequential failures default to no side effect.
- Audit-start records are written before live email provider calls.
- Raw email bodies and secrets are not persisted in audit summaries.
- Deployed writes require verified identity; local bypass is limited to the
  explicit development environment.
- Expensive GPT-5.6 paths consume atomic, per-identity D1 quotas before any
  provider request can be made.

## Build Week evidence

- [BUILD_WEEK.md](./BUILD_WEEK.md) documents Codex and GPT-5.6 usage.
- [SUBMISSION.md](./SUBMISSION.md) contains the pitch, testing instructions, and
  three-minute video plan.
- [IDEA.md](./IDEA.md) contains the broader product direction.
- [LICENSE](./LICENSE) provides the MIT license.
