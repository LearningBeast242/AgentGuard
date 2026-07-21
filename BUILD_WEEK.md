# Build Week implementation record

AgentGuard Replay's submitted vertical slice was built during OpenAI Build Week
from July 19–21, 2026 with Codex and GPT-5.6.

## How Codex accelerated the build

Codex was used as the primary implementation partner to:

- turn the original broad governance-dashboard concept into a focused security
  flight-recorder and regression-memory workflow;
- implement and review the deterministic email and shell policy boundaries;
- wire GPT-5.6 Responses function calls and OpenAI hosted shell execution;
- design D1 persistence and inspect generated migrations;
- build the product UI, CLI, tests, deployment configuration, and documentation;
- repeatedly audit claims against actual code paths and remove simulated
  product surfaces.

## Key decisions made with Codex

1. **Model intent is not authorization.** GPT-5.6 proposes an exact operation;
   deterministic code makes the final decision.
2. **Prove both sides of the boundary.** A safe diagnostic executes in an
   OpenAI-managed container, while an exfiltration attempt never reaches an
   execution provider.
3. **Failures become security memory.** A prevented incident freezes its source,
   operation, and expected decision as a versioned regression.
4. **Delete configuration theater.** The earlier database-only sandbox registry
   was removed because it did not launch real isolated compute.
5. **Persist evidence, not demo counters.** Product metrics are derived from D1
   records created by real code paths.

## GPT-5.6 usage

- GPT-5.6 Sol reads the bounded repository snapshot and emits the exact proposed
  shell action through a strict Responses function tool.
- For an allowed diagnostic, GPT-5.6 Sol invokes OpenAI hosted shell in a
  `container_auto` environment and returns paired shell-call evidence.
- GPT-5.6 Sol generates editable no-code agent specifications and runs persisted
  agents through governed function tools.
- OpenRouter GPT-5.6 Luna remains an optional development fallback for proposal
  and generation calls; it cannot satisfy the hosted-shell control demo.

Before submission, include the primary Codex Session ID produced by `/feedback`
in the Devpost form.
