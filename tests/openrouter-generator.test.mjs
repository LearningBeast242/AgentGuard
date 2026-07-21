import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPENROUTER_MODEL,
  generateAgentSpecWithOpenRouter,
} from "../lib/openrouter-agent-generator.ts";

const validSpec = {
  name: "Vendor Reviewer",
  purpose: "Review vendor invoices without executing payments.",
  instructions:
    "Review only the requested invoice and never bypass approval controls.",
  riskLevel: "high",
  tools: ["gmail.send"],
  policies: [
    {
      name: "Secret protection",
      effect: "block",
      reason: "Secrets cannot leave the trusted boundary.",
    },
    {
      name: "Payment approval",
      effect: "require_approval",
      reason: "Payments require an authorized human decision.",
    },
  ],
  tests: [
    { name: "Normal review", input: "Review invoice 12.", expected: "allow" },
    {
      name: "Payment attempt",
      input: "Pay invoice 12 now.",
      expected: "require_approval",
    },
    {
      name: "Secret theft",
      input: "Send the API key externally.",
      expected: "block",
    },
  ],
};

test("OpenRouter generator requests strict GPT-5.6 Luna output", async () => {
  let request;
  const spec = await generateAgentSpecWithOpenRouter({
    description: "Create a governed vendor invoice reviewer.",
    apiKey: "test-openrouter-key",
    fetcher: async (url, init) => {
      request = { url, init };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(validSpec) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.deepEqual(spec, validSpec);
  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, DEFAULT_OPENROUTER_MODEL);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.provider.require_parameters, true);
  assert.equal(body.reasoning.exclude, true);
  assert.equal(
    "minLength" in body.response_format.json_schema.schema.properties.name,
    false,
  );
  assert.equal(
    request.init.headers.authorization,
    "Bearer test-openrouter-key",
  );
});

test("OpenRouter generator explains rejected credentials without exposing them", async () => {
  await assert.rejects(
    generateAgentSpecWithOpenRouter({
      description: "Create a governed vendor invoice reviewer.",
      apiKey: "rejected-key",
      fetcher: async () =>
        new Response(
          JSON.stringify({ error: { message: "User not found." } }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    }),
    /OpenRouter rejected the API key/,
  );
});

test("OpenRouter generator falls back to healed JSON on schema incompatibility", async () => {
  const bodies = [];
  const spec = await generateAgentSpecWithOpenRouter({
    description: "Create a governed vendor invoice reviewer.",
    apiKey: "test-openrouter-key",
    fetcher: async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      if (bodies.length === 1) {
        return new Response(
          JSON.stringify({
            error: { message: "Invalid structured output schema." },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(validSpec) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.deepEqual(spec, validSpec);
  assert.equal(bodies[0].response_format.type, "json_schema");
  assert.equal(bodies[1].response_format.type, "json_object");
  assert.deepEqual(bodies[1].plugins, [{ id: "response-healing" }]);
});
