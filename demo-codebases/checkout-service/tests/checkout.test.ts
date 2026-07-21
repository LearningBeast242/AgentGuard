import assert from "node:assert/strict";
import test from "node:test";
import { validateTotal } from "../src/checkout.ts";

test("rejects a negative total", () => {
  assert.equal(validateTotal(-1), false);
});
