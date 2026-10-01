import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, leadScore, route, supportPriority, triage } from "../public/logic.js";

const kind = (choice: string, confidence: number) => ({
  type: "choice",
  choice,
  confidence,
  probabilities: { support: 0, sales: 0, vendor_or_other: 0, spam: 0, [choice]: confidence, ...(choice === "sales" ? { support: 1 - confidence } : { sales: 1 - confidence }) },
});
const lvl = (score: number) => ({ type: "score", score });
const lead = (deal: number, timeline: number, authority: number, fit: number) => ({
  lead_deal_size: lvl(deal), lead_timeline: lvl(timeline), lead_authority: lvl(authority), lead_fit: lvl(fit),
});

test("low kind confidence goes to review, naming the two closest kinds", () => {
  const r = route({ kind: kind("sales", 0.45) }, DEFAULT_SETTINGS);
  assert.equal(r.queue, "review");
  assert.match(r.reason, /sales 45% vs support 55%|support 55% vs sales 45%/);
});

test("confident kinds go to their queues", () => {
  assert.equal(route({ kind: kind("support", 0.9) }, DEFAULT_SETTINGS).queue, "support");
  assert.equal(route({ kind: kind("sales", 0.9) }, DEFAULT_SETTINGS).queue, "sales");
  assert.equal(route({ kind: kind("spam", 0.9) }, DEFAULT_SETTINGS).queue, "archive");
  assert.equal(route({ kind: kind("vendor_or_other", 0.9) }, DEFAULT_SETTINGS).queue, "archive");
});

test("support priority: urgency sets the level, churn risk lifts a P3 to P2", () => {
  const p = (urgency: number, churn: number) =>
    supportPriority({ support_urgency: lvl(urgency), support_churn_risk: { type: "noul", noul: churn } });
  assert.equal(p(2.8, 0.1).priority, "P1");
  assert.equal(p(1.6, 0.1).priority, "P2");
  assert.equal(p(0.4, 0.1).priority, "P3");
  assert.equal(p(0.4, 0.8).priority, "P2");
  assert.ok(p(1, 0.8).sortKey > p(1, 0.1).sortKey);
});

test("lead score is a weighted average on 0-100 and follows the weights", () => {
  assert.equal(leadScore(lead(3, 3, 3, 3), DEFAULT_SETTINGS).score, 100);
  assert.equal(leadScore(lead(0, 0, 0, 3), DEFAULT_SETTINGS).score, 25);
  const fitOnly = { ...DEFAULT_SETTINGS, weights: { lead_deal_size: 0, lead_timeline: 0, lead_authority: 0, lead_fit: 1 } };
  assert.equal(leadScore(lead(0, 0, 0, 3), fitOnly).score, 100);
  const none = { ...DEFAULT_SETTINGS, weights: { lead_deal_size: 0, lead_timeline: 0, lead_authority: 0, lead_fit: 0 } };
  assert.equal(leadScore(lead(3, 3, 3, 3), none).score, 0);
});

test("poor product fit disqualifies a lead however big it is, and sorts it last", () => {
  const big = lead(3, 3, 3, 0.4);
  assert.equal(leadScore(big, DEFAULT_SETTINGS).disqualified, true);
  const queues = triage(
    [
      { id: "big-misfit", answers: { kind: kind("sales", 0.9), ...big } },
      { id: "small-fit", answers: { kind: kind("sales", 0.9), ...lead(1, 1, 1, 2) } },
    ],
    DEFAULT_SETTINGS,
  );
  assert.deepEqual(queues.sales.map((i: { id: string }) => i.id), ["small-fit", "big-misfit"]);
});
