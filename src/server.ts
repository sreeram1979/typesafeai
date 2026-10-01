import { readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { APIError, TypeSafeError } from "@typesafe-ai/sdk";
import { type AnalyzedMessage, analyzeAll, analyzeMessage, createAnalyzer, type InboundMessage, parseInbound } from "./triage.ts";

const ROOT = new URL("..", import.meta.url);
const STORE = new URL("data/inbox.json", ROOT);
const SAMPLES = new URL("data/samples.json", ROOT);
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const MAX_BODY_BYTES = 64 * 1024;

// Only these files are served; the API key never leaves the server.
const STATIC: Record<string, { file: string; type: string }> = {
  "/": { file: "public/index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "public/app.js", type: "text/javascript; charset=utf-8" },
  "/logic.js": { file: "public/logic.js", type: "text/javascript; charset=utf-8" },
};

const { mode, analyze } = createAnalyzer();
let inbox: AnalyzedMessage[] = await loadInbox();

async function loadInbox(): Promise<AnalyzedMessage[]> {
  try {
    return JSON.parse(await readFile(STORE, "utf8"));
  } catch {
    return [];
  }
}

async function saveInbox() {
  await writeFile(STORE, `${JSON.stringify(inbox, null, 2)}\n`);
}

async function loadSamples() {
  const samples: InboundMessage[] = JSON.parse(await readFile(SAMPLES, "utf8"));
  inbox = await analyzeAll(analyze, samples);
  await saveInbox();
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
}

function describeError(err: unknown): string {
  if (err instanceof APIError) return `TypeSafe API error ${err.status}${err.requestId ? ` (request ${err.requestId})` : ""}`;
  if (err instanceof TypeSafeError) return `TypeSafe error: ${err.message}`;
  return err instanceof Error ? err.message : "Unknown error";
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    const asset = req.method === "GET" ? STATIC[url.pathname] : undefined;
    if (asset) {
      res.writeHead(200, { "content-type": asset.type, "cache-control": "no-store" });
      res.end(await readFile(new URL(asset.file, ROOT)));
      return;
    }
    if (req.method === "GET" && url.pathname === "/favicon.ico") {
      res.writeHead(204).end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/inbox") {
      send(res, 200, { mode, items: inbox });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/messages") {
      let raw: unknown;
      try {
        raw = await readJson(req);
      } catch (err) {
        return send(res, 400, { error: err instanceof SyntaxError ? "Body must be valid JSON." : (err as Error).message });
      }
      const parsed = parseInbound(raw);
      if (typeof parsed === "string") return send(res, 400, { error: parsed });
      const item = await analyzeMessage(analyze, parsed);
      inbox.unshift(item);
      await saveInbox();
      send(res, 201, item);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/reset") {
      await loadSamples();
      send(res, 200, { mode, items: inbox });
      return;
    }
    send(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    send(res, 502, { error: describeError(err) });
  }
});

if (inbox.length === 0) {
  console.log(`Analyzing sample messages (${mode} mode)...`);
  await loadSamples().catch((err) => console.error(`Could not analyze samples: ${describeError(err)}`));
}
server.listen(PORT, HOST, () => {
  console.log(`Inbound triage running at http://${HOST}:${PORT} (${mode === "mock" ? "DEMO MODE: simulated answers" : "TypeSafe"})`);
});
