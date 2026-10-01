import type { SystemOneRequest, SystemOneResult } from "@typesafe-ai/sdk";
import type { TriageQuestions } from "./questions.ts";

// Demo mode only: a stand-in for TypeSafe that guesses with keyword rules so
// the app can run without an API key. Its answers are crude and are labelled
// as simulated in the UI. Never use it to judge how well TypeSafe performs.

type Answers = SystemOneResult<TriageQuestions>["answers"];

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

function distribution<L extends string>(labels: readonly L[], winner: L, strength: number) {
  const rest = (1 - strength) / (labels.length - 1);
  const probabilities = Object.fromEntries(labels.map((l) => [l, l === winner ? strength : rest]));
  return probabilities as Record<L, number>;
}

function choiceAnswer<L extends string>(labels: readonly L[], winner: L, strength: number) {
  return { type: "choice" as const, choice: winner, confidence: strength, probabilities: distribution(labels, winner, strength) };
}

function scoreAnswer(level: number, criteria: readonly string[]) {
  const legend = Object.fromEntries(criteria.map((c, i) => [String(i), c]));
  const probabilities = Object.fromEntries(criteria.map((_, i) => [String(i), i === level ? 0.7 : 0.1]));
  return { type: "score" as const, score: level, confidence: 0.7, legend, probabilities };
}

export function mockAnswers(text: string, q: TriageQuestions): Answers {
  const t = text.toLowerCase();
  const salesWords = ["pricing", "price", "trial", "demo", "plan", "upgrade", "evaluat", "comparing", "free plan", "discount", "looking for a tool", "thinking about"];
  const supportWords = ["error", "can't", "cannot", "charged", "refund", "log in", "broken", "delete", "erasure", "gdpr", "help", "looked off"];
  const spamWords = ["guarantee", "click here", "discount today", "!!!"];
  const vendorWords = ["partnership", "sponsor", "co-marketing", "newsletter"];

  const kindLabels = ["support", "sales", "vendor_or_other", "spam"] as const;
  const isSales = has(t, salesWords);
  const isSupport = has(t, supportWords);
  let kind;
  if (has(t, spamWords)) kind = choiceAnswer(kindLabels, "spam", 0.92);
  else if (has(t, vendorWords)) kind = choiceAnswer(kindLabels, "vendor_or_other", 0.85);
  else if (isSales && isSupport) {
    kind = { type: "choice" as const, choice: "sales" as const, confidence: 0.46, probabilities: { support: 0.42, sales: 0.46, vendor_or_other: 0.08, spam: 0.04 } };
  } else if (isSales) kind = choiceAnswer(kindLabels, "sales", 0.88);
  else kind = choiceAnswer(kindLabels, "support", 0.86);

  const teamLabels = ["billing", "technical", "account_access", "data_privacy", "other"] as const;
  let team: (typeof teamLabels)[number] = "other";
  if (has(t, ["charge", "refund", "invoice", "billing"])) team = "billing";
  else if (has(t, ["2fa", "two-factor", "log in", "password"])) team = "account_access";
  else if (has(t, ["gdpr", "delete", "erasure", "privacy"])) team = "data_privacy";
  else if (has(t, ["error", "500", "load", "chart", "broken", "dashboard"])) team = "technical";

  let urgency = 1;
  if (has(t, ["urgent", "today", "down", "outage", "asap"])) urgency = 3;
  else if (has(t, ["can't", "cannot", "blocked"])) urgency = 2;
  if (has(t, ["not urgent", "can wait"])) urgency = 0;

  const churn = has(t, ["other tools", "cancel", "switch", "competitor", "leave"]);

  let deal = 1;
  if (has(t, ["student", "free plan", "class"])) deal = 0;
  else if (has(t, ["enterprise", "200 analysts", "sso"])) deal = 3;
  else if (has(t, ["team plan", "15 people", "12 of us", "mid-size"])) deal = 2;

  let timeline = 0;
  if (has(t, ["today", "this week", "next month", "before our contract"])) timeline = 3;
  else if (has(t, ["few weeks"])) timeline = 2;
  else if (has(t, ["this quarter"])) timeline = 1;

  let authority = 0;
  if (has(t, ["vp ", "founder", "ceo", "head of"])) authority = 3;
  else if (has(t, ["product manager", "manager", "lead"])) authority = 2;
  else if (has(t, ["we're", "our team", "we've"])) authority = 1;

  let fit = 2;
  if (has(t, ["ad attribution", "which facebook", "google ads"])) fit = 0;
  else if (has(t, ["funnels", "retention", "event pipeline", "event limit"])) fit = 3;

  return {
    kind,
    support_team: choiceAnswer(teamLabels, team, 0.8),
    support_urgency: scoreAnswer(urgency, q.support_urgency.criteria),
    support_churn_risk: { type: "noul", noul: churn ? 0.82 : 0.12 },
    lead_deal_size: scoreAnswer(deal, q.lead_deal_size.criteria),
    lead_timeline: scoreAnswer(timeline, q.lead_timeline.criteria),
    lead_authority: scoreAnswer(authority, q.lead_authority.criteria),
    lead_fit: scoreAnswer(fit, q.lead_fit.criteria),
  } as Answers;
}

/** Same shape as `TypeSafeClient.systemOne` for the triage questions. */
export async function mockSystemOne(request: SystemOneRequest<TriageQuestions>): Promise<SystemOneResult<TriageQuestions>> {
  const message = (request.state as { message: { subject: string; body: string } }).message;
  return {
    model: "mock-keyword-rules",
    answers: mockAnswers(`${message.subject}\n${message.body}`, request.questions),
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}
