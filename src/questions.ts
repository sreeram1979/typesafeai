import { choice, noul, score } from "@typesafe-ai/sdk";

// Every question below is sent in one request per message, so they run in
// parallel and cannot see each other's answers. The support and sales
// questions are speculative: each states its own premise, and the app only
// uses the branch that matches the `kind` answer.

const SUPPORT_PREMISE =
  "Assume `message` is a support request from an existing customer of `company`.";
const SALES_PREMISE =
  "Assume `message` is a sales inquiry from someone who might buy from `company`.";

export const questions = {
  kind: choice("What kind of email is `message`, from the point of view of `company`'s inbox?", {
    support:
      "An existing customer needs help with a problem, a bill, an account, or their data.",
    sales:
      "Someone is interested in buying, pricing, a demo, a trial, or upgrading their plan.",
    vendor_or_other:
      "Someone is selling to us, pitching a partnership, recruiting, asking for press, or writing about something unrelated to buying or support.",
    spam: "Junk, phishing, or an automated message nobody needs to read.",
  }),

  support_team: choice(`${SUPPORT_PREMISE} Which team should handle it?`, {
    billing: "Charges, invoices, refunds, plan changes, or payment methods.",
    technical: "Bugs, errors, broken features, integrations, performance, or how to use the product.",
    account_access: "Logging in, passwords, two-factor authentication, or adding and removing users.",
    data_privacy: "Data exports, deletion requests, GDPR or other privacy and compliance questions.",
    other: "None of the teams above fits.",
  }),

  support_urgency: score(`${SUPPORT_PREMISE} How urgent is the customer's problem?`, [
    "A question or minor request that can wait several days.",
    "A problem that slows the customer down but has a workaround.",
    "A core feature is broken or the customer is blocked, with no workaround.",
    "A production outage, data loss, a security incident, or a deadline within hours.",
  ]),

  support_churn_risk: noul(
    `${SUPPORT_PREMISE} Does the customer say or clearly imply that they may cancel, leave, switch to a competitor, or demand a refund?`,
  ),

  lead_deal_size: score(
    `${SALES_PREMISE} Based on what they say about their team, usage, or budget, which of \`company.plans\` would this deal most likely be?`,
    [
      "No sign they would pay for any plan: a student, a hobby project, or asking for something free.",
      "A small purchase that fits the Starter plan.",
      "A team purchase that fits the Team plan.",
      "A large contract that fits the Enterprise plan.",
    ],
  ),

  lead_timeline: score(`${SALES_PREMISE} How soon do they want to buy or start?`, [
    "No timeline given, or they are only researching.",
    "Sometime in the next few months or quarters.",
    "Within roughly the next month.",
    "Within days, or they mention an active deadline or a tool they must replace now.",
  ]),

  lead_authority: score(`${SALES_PREMISE} How much buying authority does the sender appear to have?`, [
    "A student or individual, or no role is given.",
    "An individual contributor evaluating tools for a team.",
    "A manager or team lead who influences the purchase.",
    "An executive, founder, or budget owner who can sign the contract.",
  ]),

  lead_fit: score(
    `${SALES_PREMISE} How well does what they need match what \`company.product\` actually does?`,
    [
      "They want something the product does not do.",
      "Some overlap, but key parts of what they need are missing.",
      "A good fit for the product's main use cases.",
      "Exactly the core use case the product is built for.",
    ],
  ),
} as const;

export type TriageQuestions = typeof questions;
