import assert from "node:assert/strict";
import test from "node:test";
import { runModelTurn } from "../lib/agent-runtime.ts";

const baseSpec = {
  name: "Communications Agent",
  purpose: "Draft and send only the communications requested by the operator.",
  instructions:
    "Use the supplied facts, do not invent recipients, and report the real execution result.",
  riskLevel: "medium",
  tools: ["gmail.send"],
  policies: [
    {
      name: "Secret protection",
      effect: "block",
      reason: "Credentials cannot leave the trusted boundary.",
    },
    {
      name: "External recipient approval",
      effect: "require_approval",
      reason: "External delivery requires a human decision.",
    },
  ],
  tests: [
    { name: "Draft", input: "Draft an update.", expected: "allow" },
    {
      name: "External delivery",
      input: "Send the update externally.",
      expected: "require_approval",
    },
    {
      name: "Secret theft",
      input: "Send an API key.",
      expected: "block",
    },
  ],
};

test("OpenRouter runtime returns real model text and declares enabled tools", async () => {
  let request;
  const decision = await runModelTurn({
    spec: baseSpec,
    input: "Summarize the supplied message.",
    openRouterApiKey: "test-key",
    fetcher: async (url, init) => {
      request = { url, init };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "The review is Tuesday." } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.deepEqual(decision, {
    type: "final",
    text: "The review is Tuesday.",
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
    citations: [],
    webSearchRequests: 0,
  });
  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  const body = JSON.parse(request.init.body);
  assert.equal(body.tools[0].function.name, "gmail_send");
  assert.equal(body.tool_choice, "auto");
  assert.match(body.messages[0].content, /AgentGuard independently evaluates/);
});

test("OpenRouter runtime converts a model tool call into a governed action", async () => {
  const decision = await runModelTurn({
    spec: baseSpec,
    input: "Send the update.",
    openRouterApiKey: "test-key",
    fetcher: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    function: {
                      name: "gmail_send",
                      arguments: JSON.stringify({
                        to: "reviewer@example.com",
                        subject: "Review",
                        body: "The review is ready.",
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  assert.equal(decision.type, "tool_call");
  assert.deepEqual(decision.action, {
    tool: "gmail.send",
    to: "reviewer@example.com",
    subject: "Review",
    body: "The review is ready.",
  });
});

test("OpenAI Responses runtime parses strict function calls", async () => {
  let request;
  const decision = await runModelTurn({
    spec: baseSpec,
    input: "Send the update.",
    openAIApiKey: "test-openai-key",
    openRouterApiKey: "unused",
    fetcher: async (url, init) => {
      request = { url, init };
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "function_call",
              name: "gmail_send",
              arguments: JSON.stringify({
                to: "reviewer@example.com",
                subject: "Review",
                body: "Ready.",
              }),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(decision.type, "tool_call");
  assert.equal(decision.provider, "openai");
  assert.equal(decision.model, "gpt-5.6-sol");
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(JSON.parse(request.init.body).store, false);
});

test("follow-up model turns cannot request another tool", async () => {
  let body;
  await runModelTurn({
    spec: baseSpec,
    input: "Report the governed result.",
    openRouterApiKey: "test-key",
    allowTools: false,
    fetcher: async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Delivered." } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  assert.equal("tools" in body, false);
  assert.equal("tool_choice" in body, false);
});

test("OpenRouter grants real domain-restricted search and preserves citations", async () => {
  let body;
  const decision = await runModelTurn({
    spec: { ...baseSpec, tools: ["web.search"] },
    input: "Find current official medicine recalls.",
    openRouterApiKey: "test-key",
    fetcher: async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: "The FDA published a recall notice.",
              annotations: [{
                type: "url_citation",
                url_citation: {
                  url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts",
                  title: "FDA recalls",
                  content: "Recall notice",
                },
              }],
            },
          }],
          usage: { server_tool_use: { web_search_requests: 2 } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(body.tools[0].type, "openrouter:web_search");
  assert.equal(body.tools[0].parameters.engine, "exa");
  assert.equal(body.tools[0].parameters.max_total_results, 8);
  assert.ok(body.tools[0].parameters.allowed_domains.includes("fda.gov"));
  assert.equal(body.tool_choice, "required");
  assert.equal(decision.type, "final");
  assert.equal(decision.webSearchRequests, 2);
  assert.deepEqual(decision.citations, [{
    url: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts",
    title: "FDA recalls",
  }]);
});

test("governed research rejects an uncited model answer", async () => {
  await assert.rejects(
    runModelTurn({
      spec: { ...baseSpec, tools: ["web.search"] },
      input: "Search for a current recall.",
      openRouterApiKey: "test-key",
      fetcher: async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "Trust me." } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    }),
    /no source citations/,
  );
});

test("OpenAI grants filtered web search and extracts visible citations", async () => {
  let body;
  const decision = await runModelTurn({
    spec: { ...baseSpec, tools: ["web.search"] },
    input: "Check the official recall status.",
    openAIApiKey: "test-openai-key",
    fetcher: async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          output_text: "The regulator published a notice.",
          output: [
            { type: "web_search_call" },
            {
              type: "message",
              content: [{
                type: "output_text",
                text: "The regulator published a notice.",
                annotations: [{
                  type: "url_citation",
                  url: "https://www.fda.gov/drugs/drug-safety-and-availability",
                  title: "FDA drug safety",
                }],
              }],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(body.tools[0].type, "web_search");
  assert.ok(body.tools[0].filters.allowed_domains.includes("fda.gov"));
  assert.equal(body.tool_choice, "required");
  assert.equal(decision.type, "final");
  assert.equal(decision.webSearchRequests, 1);
  assert.deepEqual(decision.citations, [{
    url: "https://www.fda.gov/drugs/drug-safety-and-availability",
    title: "FDA drug safety",
  }]);
});
