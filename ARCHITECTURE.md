# AgentGuard execution architecture

AgentGuard is an application-integrated policy gateway for agent tool calls. It
does not claim to intercept agents that have not been routed through its
boundary.

## Live defense sequence

```text
repository snapshot + operator task
              |
              v
GPT-5.6 Sol Responses API
propose_shell_action(function tool)
              |
              v
exact command + cwd + source path + provider IDs
              |
              v
deterministic AgentGuard policy
       /                       \
      /                         \
ALLOW: exact diagnostic       BLOCK: injection / secret / egress /
      |                        composition / destructive / unknown
      v                                   |
OpenAI hosted shell                       v
container_auto, network off       no execution-provider request
      |                                   |
      v                                   v
stdout + stderr + exit code       zero process / zero egress proof
      \                                   /
       \                                 /
        durable D1 incident evidence
                     |
                     v
          immutable regression scenario
                     |
                     v
         deterministic policy-version replay
```

## Enforcement invariants

1. Model output is intent, never authorization.
2. The proposal must reference an exact supplied repository path.
3. The proposal must use the governed `/mnt/data` working directory.
4. Only one exact read-only diagnostic command may be authorized.
5. Shell composition, substitution, redirection, multiline input, destructive
   capabilities, secret access, and network commands fail closed.
6. The hosted shell adapter verifies that GPT-5.6 requested exactly the command
   AgentGuard authorized before accepting execution evidence.
7. Hosted containers receive no outbound network policy.
8. A blocked operation never reaches the shell API.
9. A security regression can only be created from a prevented, unexecuted
   incident.
10. Replay evaluates the frozen input and operation against a named policy
    version; it never executes the blocked command.
11. Live defense, no-code generation, and agent runs consume an atomic
    per-identity D1 quota before any model provider request.

## Trust boundaries

- Repository content is untrusted.
- GPT-5.6 proposals are untrusted.
- Deterministic policy is the authorization boundary.
- OpenAI hosted shell is the isolated execution provider for allowed commands.
- Gmail is the only live email provider and requires explicit approval when
  policy demands it.
- The agent-builder tool enum contains only the implemented `gmail.send` and
  domain-restricted, citation-preserving `web.search` capabilities. Persisted
  policy effects are compiled into the gateway profile;
  model-authored prose never makes the enforcement decision.
- D1 is the authoritative store for incidents, regressions, replays, agents,
  runs, audit events, and model-call quota counters.

## Known limits

- The diagnostic allowlist is deliberately small; this is a security property,
  not a general-purpose remote shell.
- Repository files are supplied to the proposal model as a bounded snapshot.
- Policy replay is deterministic and does not rerun the model.
- Gmail OAuth token refresh is outside this hackathon vertical slice.
