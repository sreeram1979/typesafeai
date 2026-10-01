import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { DEFAULT_SETTINGS, triage } from "../public/logic.js";
import { mockSystemOne } from "../src/mock.ts";
import { questions } from "../src/questions.ts";
import { analyzeAll, type InboundMessage, parseInbound } from "../src/triage.ts";

const samples: InboundMessage[] = JSON.parse(await readFile(new URL("../data/samples.json", import.meta.url), "utf8"));
const analyze = (message: InboundMessage) => mockSystemOne({ state: { message }, questions });

test("every sample gets an answer for every question", async () => {
  const items = await analyzeAll(analyze, samples);
  assert.equal(items.length, samples.length);
  for (const item of items) assert.deepEqual(Object.keys(item.answers).sort(), Object.keys(questions).sort());
});

test("sample inbox lands in sensible queues end to end (demo mode)", async () => {
  const queues = triage(await analyzeAll(analyze, samples), DEFAULT_SETTINGS);
  const subjects = (q: Array<{ message: InboundMessage }>) => q.map((i) => i.message.subject);
  assert.equal(subjects(queues.support)[0], "Dashboards down for our whole team");
  assert.equal(subjects(queues.sales)[0], "Enterprise pricing for 200 analysts");
  assert.equal(subjects(queues.sales).at(-1), "Need ad attribution across Facebook and Google");
  assert.ok(subjects(queues.review).includes("Question"));
  assert.ok(subjects(queues.archive).includes("Rank #1 on Google GUARANTEED!!!"));
});

test("parseInbound requires a body and caps field lengths", () => {
  assert.equal(parseInbound({ subject: "hi" }), '"body" is required.');
  assert.equal(parseInbound(null), "Expected a JSON object.");
  assert.match(String(parseInbound({ body: "x".repeat(10_001) })), /at most 10000/);
  assert.deepEqual(parseInbound({ body: "  hello ", subject: 5 }), { from_name: "", from_email: "", subject: "", body: "hello" });
});
