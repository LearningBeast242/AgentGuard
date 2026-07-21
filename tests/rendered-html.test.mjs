import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("build emits the Worker server and AgentGuard product surface", async () => {
  await access(new URL("dist/server/index.js", root));

  const [page, layout, app, css, hosting] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/agentguard-app.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);

  assert.match(page, /<AgentGuardApp/);
  assert.match(page, /getChatGPTUser/);
  assert.match(layout, /AgentGuard — AI Agent Governance Control Plane/);
  assert.match(app, /Agent security flight recorder/);
  assert.match(app, /Watch an agent get attacked\. Then make it remember/);
  assert.match(app, /Run live GPT-5\.6 attack/);
  assert.match(app, /Live model evidence/);
  assert.match(app, /Replay on hardened-v2/);
  assert.match(app, /No synthetic telemetry/);
  assert.match(app, /Incident ledger/);
  assert.match(app, /Describe with GPT-5\.6/);
  assert.match(app, /\/api\/governance\/execute/);
  assert.match(css, /\.evaluation__hero--block/);
  assert.match(JSON.parse(hosting).project_id, /^appgprj_/);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.doesNotMatch(page + layout + app, /codex-preview|SkeletonPreview/);
});
