import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const cli = new URL("cli/agentguard.ts", root);

function runCli(args) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", cli.pathname, ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
}

test("CLI exposes the governance resource model", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agent create/);
  assert.match(result.stdout, /policy check/);
  assert.match(result.stdout, /audit list/);
});

test("CLI creates a policy-rich agent with shorthand governance flags", () => {
  const result = runCli([
    "create-agent",
    "Finance Reviewer",
    "--purpose",
    "Review invoices without executing payments",
    "--tool",
    "gmail.send",
    "-dlp",
    "-filtration",
    "--approval",
    "--risk",
    "high",
    "--json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.spec.name, "Finance Reviewer");
  assert.equal(payload.spec.riskLevel, "high");
  assert.deepEqual(payload.spec.tools, ["gmail.send"]);
  assert.deepEqual(
    payload.spec.policies.map((policy) => policy.effect),
    ["redact", "block", "require_approval"],
  );
  assert.equal(payload.persisted, null);
});

test("CLI rejects authority outside the supported tool registry", () => {
  const result = runCli([
    "agent",
    "create",
    "Unsafe Agent",
    "--purpose",
    "Attempt to use an unregistered administrative tool",
    "--tool",
    "root.shell",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown tool: root\.shell/);
});
