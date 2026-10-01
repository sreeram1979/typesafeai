import { type SystemOneResult, TypeSafeClient } from "@typesafe-ai/sdk";
import { company } from "./company.ts";
import { mockSystemOne } from "./mock.ts";
import { questions, type TriageQuestions } from "./questions.ts";

// A type alias (not an interface) so it is assignable to the SDK's JSON state type.
export type InboundMessage = {
  from_name: string;
  from_email: string;
  subject: string;
  body: string;
};

export interface AnalyzedMessage {
  id: string;
  received_at: string;
  message: InboundMessage;
  model: string;
  answers: SystemOneResult<TriageQuestions>["answers"];
  usage: SystemOneResult<TriageQuestions>["usage"];
}

export type Analyzer = (message: InboundMessage) => Promise<SystemOneResult<TriageQuestions>>;

/** Real TypeSafe when an API key is set; keyword-rule simulation otherwise or when forced. */
export function createAnalyzer(): { mode: "typesafe" | "mock"; analyze: Analyzer } {
  const forceMock = process.env.TYPESAFE_MOCK === "1";
  if (forceMock || !process.env.TYPESAFE_API_KEY?.trim()) {
    return { mode: "mock", analyze: (message) => mockSystemOne({ state: buildState(message), questions }) };
  }
  const client = new TypeSafeClient();
  return { mode: "typesafe", analyze: (message) => client.systemOne({ state: buildState(message), questions }) };
}

function buildState(message: InboundMessage) {
  return { company, message };
}

export async function analyzeMessage(analyze: Analyzer, message: InboundMessage): Promise<AnalyzedMessage> {
  const result = await analyze(message);
  return {
    id: crypto.randomUUID(),
    received_at: new Date().toISOString(),
    message,
    model: result.model,
    answers: result.answers,
    usage: result.usage,
  };
}

/** Analyze many messages with a small concurrency cap, keeping input order. */
export async function analyzeAll(analyze: Analyzer, messages: InboundMessage[], concurrency = 4) {
  const results: AnalyzedMessage[] = new Array(messages.length);
  let next = 0;
  const worker = async () => {
    while (next < messages.length) {
      const i = next++;
      results[i] = await analyzeMessage(analyze, messages[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, messages.length) }, worker));
  return results;
}

/** Validate an untrusted request body into an InboundMessage, or return an error string. */
export function parseInbound(body: unknown): InboundMessage | string {
  if (typeof body !== "object" || body === null) return "Expected a JSON object.";
  const b = body as Record<string, unknown>;
  const field = (name: string, max: number, required: boolean) => {
    const v = typeof b[name] === "string" ? (b[name] as string).trim() : "";
    if (required && !v) throw new Error(`"${name}" is required.`);
    if (v.length > max) throw new Error(`"${name}" must be at most ${max} characters.`);
    return v;
  };
  try {
    return {
      from_name: field("from_name", 200, false),
      from_email: field("from_email", 320, false),
      subject: field("subject", 300, false),
      body: field("body", 10_000, true),
    };
  } catch (err) {
    return (err as Error).message;
  }
}
