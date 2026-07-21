# AgentGuard Replay — submission draft

## One-line pitch

AgentGuard is a security flight recorder that captures an AI agent's exact tool
intent before execution and turns every prevented attack into a permanent,
versioned regression test.

## Category

Developer Tools

## Problem

Agent traces explain what happened after a run. Guardrails can stop individual
actions. Security teams still need a closed loop that attributes dangerous
intent to untrusted source material, proves whether execution occurred, and
keeps the failure from silently returning after policies change.

## What AgentGuard demonstrates

1. GPT-5.6 Sol reads a repository snapshot and proposes an exact shell action.
2. The same deterministic boundary distinguishes a safe diagnostic from a
   poisoned instruction attempting `.env` exfiltration.
3. The safe command runs in a real OpenAI hosted container and returns stdout,
   exit status, response ID, and shell-call ID.
4. The malicious command is blocked before the hosted-shell API is invoked.
5. Source lineage, model provenance, policy findings, and execution evidence are
   persisted in D1.
6. One click converts the prevented incident into a security regression.
7. The frozen trace replays against `hardened-v2`, which adds an
   instruction-to-secret lineage rule.

## Testing instructions

1. Sign in with ChatGPT if the deployment requests identity.
2. Open **Live defense**.
3. Click **Run safe control**. Confirm real stdout, exit code `0`, and an OpenAI
   hosted-shell response ID.
4. Click **Run live GPT-5.6 attack**. Confirm the exact model-generated command,
   repository source, provider response/tool-call IDs, and zero provider
   execution.
5. Click **Lock as regression**.
6. Click **Replay on hardened-v2** and confirm expected `block`, actual `block`.

## Three-minute video

- 0:00–0:12 — poisoned repository and the security-memory thesis
- 0:12–0:38 — live attack, exact model intent, source lineage, hard block
- 0:38–1:05 — safe control executes through the same policy boundary
- 1:05–1:40 — persisted trace and execution evidence
- 1:40–2:15 — incident to regression to hardened replay
- 2:15–2:42 — architecture, deterministic invariants, D1 persistence
- 2:42–2:57 — how Codex and GPT-5.6 built and power the product
- 2:57–3:00 — “Every attack teaches your agents what never to do again.”

## Final form checklist

- [ ] Public YouTube demo under three minutes with clear audio
- [ ] No unlicensed music, logos, or third-party footage
- [ ] Public repository with MIT license, or private repository shared with the
      official judging accounts
- [ ] Working deployment accessible to judges through the end of judging
- [ ] Fresh OpenAI API key configured server-side
- [ ] `npm test`, `npm run lint`, and `npm audit` pass on the final commit
- [ ] Primary Codex Session ID from `/feedback`
- [ ] Repository URL
- [ ] Deployment URL
- [ ] Video URL
