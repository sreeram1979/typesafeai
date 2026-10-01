// Routing and scoring rules. These are plain code on purpose: TypeSafe supplies
// the judgments once per message, and everything here can change (thresholds,
// weights, priorities) without asking the model again. Shared by the browser
// UI and the tests.

/** @typedef {"review" | "support" | "sales" | "archive"} Queue */

export const LEAD_DIMENSIONS = [
  { key: "lead_deal_size", label: "Deal size" },
  { key: "lead_timeline", label: "Timeline" },
  { key: "lead_authority", label: "Authority" },
  { key: "lead_fit", label: "Product fit" },
];

export const DEFAULT_SETTINGS = {
  // Below this confidence in the `kind` answer, a person decides the queue.
  reviewThreshold: 0.6,
  // Relative importance of each lead dimension; they need not sum to 1.
  weights: { lead_deal_size: 1, lead_timeline: 1, lead_authority: 1, lead_fit: 1 },
  // A lead whose fit score is below this is set aside however well it scores
  // elsewhere: a big budget does not make up for wanting a different product.
  fitFloor: 1,
};

const MAX_LEVEL = 3;

/**
 * Pick the queue for one analyzed message.
 * @param {Record<string, any>} answers TypeSafe answers keyed by question name
 * @param {{ reviewThreshold: number }} settings
 * @returns {{ queue: Queue, reason: string }}
 */
export function route(answers, settings) {
  const kind = answers.kind;
  if (kind.confidence < settings.reviewThreshold) {
    const [first, second] = Object.entries(kind.probabilities).sort((a, b) => b[1] - a[1]);
    return {
      queue: "review",
      reason: `Unsure: ${first[0]} ${pct(first[1])} vs ${second[0]} ${pct(second[1])}`,
    };
  }
  if (kind.choice === "support") return { queue: "support", reason: "Support request" };
  if (kind.choice === "sales") return { queue: "sales", reason: "Sales inquiry" };
  return { queue: "archive", reason: kind.choice === "spam" ? "Spam" : "Vendor or other" };
}

/**
 * Order of work for the support queue: urgency first, churn risk as a boost.
 * @param {Record<string, any>} answers
 * @returns {{ priority: "P1" | "P2" | "P3", sortKey: number, churnRisk: boolean }}
 */
export function supportPriority(answers) {
  const urgency = answers.support_urgency.score;
  const churnRisk = answers.support_churn_risk.noul >= 0.5;
  let priority = "P3";
  if (urgency >= 2.5) priority = "P1";
  else if (urgency >= 1.5 || churnRisk) priority = "P2";
  return { priority, sortKey: urgency + (churnRisk ? 0.75 : 0), churnRisk };
}

/**
 * Weighted lead score from 0 to 100, plus the hard fit rule.
 * @param {Record<string, any>} answers
 * @param {{ weights: Record<string, number>, fitFloor: number }} settings
 * @returns {{ score: number, disqualified: boolean, reason: string | null }}
 */
export function leadScore(answers, settings) {
  let total = 0;
  let weightSum = 0;
  for (const { key } of LEAD_DIMENSIONS) {
    const w = Math.max(0, settings.weights[key] ?? 0);
    total += w * (answers[key].score / MAX_LEVEL);
    weightSum += w;
  }
  const score = weightSum === 0 ? 0 : Math.round((total / weightSum) * 100);
  const disqualified = answers.lead_fit.score < settings.fitFloor;
  return { score, disqualified, reason: disqualified ? "Wants something we don't offer" : null };
}

/**
 * Sort analyzed items into queues, each in working order.
 * @param {Array<{ id: string, answers: Record<string, any> }>} items
 * @param {typeof DEFAULT_SETTINGS} settings
 */
export function triage(items, settings) {
  const queues = { review: [], support: [], sales: [], archive: [] };
  for (const item of items) {
    const routing = route(item.answers, settings);
    const entry = { ...item, routing };
    if (routing.queue === "support") entry.support = supportPriority(item.answers);
    if (routing.queue === "sales") entry.lead = leadScore(item.answers, settings);
    queues[routing.queue].push(entry);
  }
  queues.support.sort((a, b) => b.support.sortKey - a.support.sortKey);
  queues.sales.sort(
    (a, b) => Number(a.lead.disqualified) - Number(b.lead.disqualified) || b.lead.score - a.lead.score,
  );
  return queues;
}

export function pct(p) {
  return `${Math.round(p * 100)}%`;
}
